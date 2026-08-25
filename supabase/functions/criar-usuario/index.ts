// Supabase Edge Function: criar-usuario
//
// Cria uma conta de acesso ao app de campo. Tres coisas precisam nascer juntas
// pra a pessoa conseguir trabalhar:
//
//   1. auth.users        — o login em si (so' a Admin API cria; o cliente nao).
//   2. public.profiles   — nome, e-mail e PAPEL. Sem esta linha o app loga mas
//                          nao sabe quem e' a pessoa nem o que ela pode ver.
//   3. id_hubspot        — o owner do CRM. Sem ele o vendedor nao tem carteira:
//                          `clients.vendedor_id_hubspot` nao casa com ninguem e
//                          ele aparece com zero leads em todas as telas.
//
// O passo 3 e' o que mais some quando alguem cria usuario "na mao" pelo painel
// do Supabase — e o sintoma (vendedor invisivel nos rankings) nao parece um
// cadastro incompleto. Por isso ele e' um campo de primeira classe aqui.
//
// POR QUE UMA EDGE FUNCTION, E NAO UMA TELA QUE CHAMA O BANCO
// Criar login exige a service role key. Ela NAO pode ir pro navegador — quem a
// tem le' e escreve qualquer tabela ignorando RLS. Entao a chave fica aqui, no
// servidor, e o cliente so' manda os dados.
//
// Deploy:
//   supabase functions deploy criar-usuario
// Nao precisa de secret novo: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao
// preenchidos pela plataforma.
//
// USO
//   POST https://<ref>.supabase.co/functions/v1/criar-usuario
//   Authorization: Bearer <service role key ou JWT de um gestor>
//
//   { "email": "joao@takeat.app",
//     "nome": "João Silva",
//     "role": "user",            // user | view | gestor  (padrao: user)
//     "id_hubspot": "12345678",  // obrigatorio quando role=user
//     "senha": "opcional" }      // sem ela, uma temporaria e' gerada
//
//   201 -> { id, email, nome, role, id_hubspot, senha?, aviso? }
//   400 -> dado faltando ou invalido, com a mensagem do que consertar
//   403 -> quem chamou nao e' gestor
//   409 -> ja existe conta com esse e-mail
//
// Exemplo:
//   curl -X POST https://<ref>.supabase.co/functions/v1/criar-usuario \
//     -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"email":"joao@takeat.app","nome":"João Silva","id_hubspot":"12345678"}'
//
// O id_hubspot voce pega no HubSpot em Settings -> Users & Teams, ou pela API
// de owners (/crm/v3/owners).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/** Papeis aceitos — os mesmos do CHECK em profiles_role_check. */
const PAPEIS = ['user', 'view', 'gestor'] as const;
type Papel = (typeof PAPEIS)[number];

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

/** Senha temporaria forte, quando o gestor nao informa uma.
 *
 *  crypto.getRandomValues, e nao Math.random: senha de acesso a base inteira de
 *  clientes nao pode sair de um gerador previsivel. O alfabeto exclui
 *  caracteres que se confundem lidos em voz alta ou por print (O/0, l/1/I). */
function senhaTemporaria(tamanho = 16): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%';
  const bytes = crypto.getRandomValues(new Uint32Array(tamanho));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

const ehEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(200, {});
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });

  const credencial = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!credencial) return json(401, { error: 'Sem credencial' });

  const svc = serviceClient();

  // Dois caminhos, igual as outras funcoes deste projeto: a service role key
  // (script, integracao) ou um JWT de usuario com role='gestor' (a tela).
  const ehServiceRole = credencial === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  let criadoPor: string | null = null;

  if (!ehServiceRole) {
    const { data: userData, error: erroUser } = await svc.auth.getUser(credencial);
    if (erroUser || !userData?.user) return json(401, { error: 'Credencial inválida' });
    const { data: perfil } = await svc
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();
    // Criar usuario e' CONCEDER ACESSO a base inteira de clientes. So gestor.
    if (perfil?.role !== 'gestor') return json(403, { error: 'Só gestor cria usuário' });
    criadoPor = userData.user.id;
  }

  const corpo = await req.json().catch(() => null);
  const email = String(corpo?.email ?? '').trim().toLowerCase();
  const nome = String(corpo?.nome ?? '').trim();
  const papel = String(corpo?.role ?? 'user') as Papel;
  const idHubspot = corpo?.id_hubspot ? String(corpo.id_hubspot).trim() : null;
  const senhaInformada = corpo?.senha ? String(corpo.senha) : null;

  // --- validacao, com mensagem que diz O QUE consertar ---------------------
  if (!ehEmail(email)) return json(400, { error: 'E-mail inválido.' });
  if (nome.length < 2) return json(400, { error: 'Informe o nome completo da pessoa.' });
  if (!PAPEIS.includes(papel)) {
    return json(400, { error: `Papel inválido. Use um de: ${PAPEIS.join(', ')}.` });
  }
  if (senhaInformada && senhaInformada.length < 8) {
    return json(400, { error: 'A senha precisa de pelo menos 8 caracteres.' });
  }
  // 'view' e 'gestor' nao tem carteira no CRM; exigir owner id deles seria
  // pedir um dado que nao existe.
  if (papel === 'user' && !idHubspot) {
    return json(400, {
      error:
        'Vendedor precisa do id_hubspot (owner do CRM). Sem ele a pessoa loga, ' +
        'mas aparece com zero leads em todas as telas — e o sintoma não parece cadastro incompleto.',
    });
  }

  const senha = senhaInformada ?? senhaTemporaria();

  // --- 1. conta de login ----------------------------------------------------
  const { data: criado, error: erroCriar } = await svc.auth.admin.createUser({
    email,
    password: senha,
    // Confirmado na criacao: nao ha' SMTP configurado neste projeto, entao
    // esperar o clique no e-mail deixaria a conta inutilizavel pra sempre.
    email_confirm: true,
    user_metadata: { full_name: nome },
  });

  if (erroCriar || !criado?.user) {
    const msg = erroCriar?.message ?? 'erro desconhecido';
    const jaExiste = /already been registered|already exists|duplicate/i.test(msg);
    return json(jaExiste ? 409 : 500, {
      error: jaExiste
        ? `Já existe uma conta com o e-mail ${email}.`
        : `Não consegui criar o login: ${msg}`,
    });
  }

  const id = criado.user.id;

  // --- 2. perfil ------------------------------------------------------------
  // UPSERT, e nao INSERT: alguns projetos tem gatilho que ja' cria a linha em
  // profiles no nascimento do auth.user. Se tiver, o insert quebraria por
  // chave duplicada e deixaria uma conta de login orfa, sem papel.
  const { error: erroPerfil } = await svc
    .from('profiles')
    .upsert(
      { id, email, full_name: nome, role: papel, id_hubspot: idHubspot },
      { onConflict: 'id' },
    );

  if (erroPerfil) {
    // Desfaz o login: uma conta que entra e nao tem perfil e' pior que
    // nenhuma conta — ela loga, nao ve nada, e ninguem entende o porque.
    await svc.auth.admin.deleteUser(id).catch(() => {});
    return json(500, {
      error: `Criei o login mas não consegui gravar o perfil (${erroPerfil.message}). Desfiz a conta; tente de novo.`,
    });
  }

  // --- 3. classificacao (opcional) -----------------------------------------
  // Sem linha, `seller_classification` assume 'ativo'. Gravar explicitamente
  // pra quem NAO e' vendedor evita que a pessoa apareca nos rankings e no
  // placar da Daily so' porque ninguem curou a lista depois.
  if (papel !== 'user') {
    await svc
      .from('seller_classification')
      .upsert({ seller_id: id, status: 'nao_vendedor', updated_by: criadoPor }, { onConflict: 'seller_id' })
      .then(() => {}, () => {}); // tabela opcional: falha aqui nao invalida o cadastro
  }

  return json(201, {
    id,
    email,
    nome,
    role: papel,
    id_hubspot: idHubspot,
    // A senha aparece UMA vez, na resposta. Nao ha' SMTP neste projeto pra
    // mandar convite, entao o gestor precisa entregar a senha pra pessoa. Ela
    // nao fica guardada em lugar nenhum legivel: o banco so' tem o hash.
    senha: senhaInformada ? undefined : senha,
    aviso: senhaInformada
      ? undefined
      : 'Senha temporária gerada. Ela aparece só nesta resposta — copie agora e peça para a pessoa trocar no primeiro acesso.',
  });
});
