// Supabase Edge Function: revogar-usuario
//
// Tira o acesso de uma pessoa. DESATIVA, nao exclui — e isso nao e' politica,
// e' o que o banco permite:
//
//   client_visits.visited_by uuid REFERENCES auth.users(id)   <- sem ON DELETE
//
// Sem clausula de delete, a FK e' NO ACTION: o Postgres RECUSA apagar qualquer
// vendedor que ja' tenha um check-in. Um endpoint de "excluir" funcionaria so'
// pra quem nunca trabalhou e falharia justamente pra quem mais importa — e
// falharia no meio, com uma conta ja' banida e o perfil intacto.
//
// O QUE "REVOGADO" SIGNIFICA AQUI, em duas camadas:
//
//   1. BAN no auth.users  -> a sessao morre e o login para de funcionar AGORA.
//   2. sufixo "/ DESATIVADO" no profiles.full_name  -> a convencao que o app
//      JA usa (useAllSellers, useSellerClassification, equipe.ts do cockpit).
//      Sem ela a pessoa some do login mas continua aparecendo em ranking,
//      filtro de vendedor e placar da Daily, como se ainda trabalhasse.
//
// O historico NAO e' apagado: visitas, notas e mudancas de etapa continuam
// atribuidas a ela. E' o que mantem o passado auditavel — e a carteira dela
// visivel pra ser redistribuida.
//
// Deploy:
//   supabase functions deploy revogar-usuario
//
// USO
//   POST https://<ref>.supabase.co/functions/v1/revogar-usuario
//   Authorization: Bearer <service role key ou JWT de um gestor>
//
//   { "id": "uuid-do-usuario" }        // preferido: identificador estavel
//   { "email": "joao@takeat.app" }     // alternativa, quando so' se tem o e-mail
//   { "id": "...", "dry_run": true }   // valida e NAO altera nada
//
//   200 -> { id, email, nome, revogado: true, ja_revogado?: true, dry_run?: true }
//   400 -> nem id nem email informado
//   401 -> credencial invalida
//   403 -> quem chamou nao e' gestor
//   404 -> { error, existe: false } — nao ha' o que revogar
//
// IDEMPOTENTE: revogar de novo devolve 200 com ja_revogado=true. Reenviar por
// timeout de rede nao quebra nada e nao muda o estado duas vezes.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUFIXO = ' / DESATIVADO';
/** 100 anos. O Supabase nao tem "ban permanente"; ban_duration e' uma janela. */
const BAN = '876000h';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const credencial = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!credencial) return json(401, { error: 'Sem credencial' });

  const svc = serviceClient();
  const ehServiceRole = credencial === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!ehServiceRole) {
    const { data: userData, error: erroUser } = await svc.auth.getUser(credencial);
    if (erroUser || !userData?.user) return json(401, { error: 'Credencial inválida' });
    const { data: perfil } = await svc
      .from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (perfil?.role !== 'gestor') return json(403, { error: 'Só gestor revoga acesso' });
  }

  const corpo = await req.json().catch(() => null);
  const id = corpo?.id ? String(corpo.id).trim() : null;
  const email = corpo?.email ? String(corpo.email).trim().toLowerCase() : null;
  const dryRun = corpo?.dry_run === true;

  if (!id && !email) {
    return json(400, { error: 'Informe `id` (preferido) ou `email`.' });
  }

  // --- acha a pessoa --------------------------------------------------------
  // Busca em `profiles`, e nao na Admin API: profiles.id E' o id de auth.users,
  // e aqui o e-mail e o nome vem na mesma consulta.
  const consulta = svc.from('profiles').select('id, email, full_name, role');
  const { data: pessoa, error: erroBusca } = id
    ? await consulta.eq('id', id).maybeSingle()
    : await consulta.eq('email', email!).maybeSingle();

  if (erroBusca) return json(500, { error: `Não consegui consultar: ${erroBusca.message}` });

  if (!pessoa) {
    // 404 com `existe: false` explicito: quem integra fecha como "nada a
    // revogar" e NAO gasta retry. Erro generico aqui custaria 5 tentativas pra
    // receber sempre a mesma coisa.
    return json(404, {
      error: id ? `Nenhum usuário com id ${id}.` : `Nenhum usuário com e-mail ${email}.`,
      existe: false,
    });
  }

  const nomeAtual = (pessoa as any).full_name ?? '';
  const jaRevogado = /DESATIVADO/i.test(nomeAtual);

  if (dryRun) {
    return json(200, {
      id: (pessoa as any).id,
      email: (pessoa as any).email,
      nome: nomeAtual,
      role: (pessoa as any).role,
      revogado: false,
      ja_revogado: jaRevogado,
      dry_run: true,
      // O que ACONTECERIA. dry_run que so' diz "ok" nao previne incidente —
      // o valor esta' em ver o efeito antes de causa-lo.
      efeito: jaRevogado
        ? 'Nada: esta pessoa já está desativada.'
        : 'Bloquearia o login e marcaria o nome com "/ DESATIVADO". Histórico e carteira seriam preservados.',
    });
  }

  if (jaRevogado) {
    // Idempotente: reenviar nao altera nada nem devolve erro.
    return json(200, {
      id: (pessoa as any).id,
      email: (pessoa as any).email,
      nome: nomeAtual,
      revogado: true,
      ja_revogado: true,
    });
  }

  // --- 1. mata o login ------------------------------------------------------
  // ANTES do rename: se o rename falhar, o pior caso e' alguem sem acesso
  // aparecendo como ativo numa tela. Na ordem inversa, o pior caso seria
  // alguem marcado como desativado ainda conseguindo entrar.
  const { error: erroBan } = await svc.auth.admin.updateUserById((pessoa as any).id, {
    ban_duration: BAN,
  });
  if (erroBan) {
    return json(500, { error: `Não consegui bloquear o login: ${erroBan.message}` });
  }

  // --- 2. fala a lingua do app ---------------------------------------------
  const novoNome = (nomeAtual.trim() || (pessoa as any).email) + SUFIXO;
  const { error: erroNome } = await svc
    .from('profiles')
    .update({ full_name: novoNome })
    .eq('id', (pessoa as any).id);

  if (erroNome) {
    return json(500, {
      error:
        `Login bloqueado, mas não consegui marcar o perfil (${erroNome.message}). ` +
        'A pessoa não entra mais, porém ainda aparece nos rankings — rode de novo.',
      id: (pessoa as any).id,
      revogado: true,
      perfil_marcado: false,
    });
  }

  return json(200, {
    id: (pessoa as any).id,
    email: (pessoa as any).email,
    nome: novoNome,
    revogado: true,
    ja_revogado: false,
  });
});
