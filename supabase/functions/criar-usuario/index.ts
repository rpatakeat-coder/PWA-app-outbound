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
//   4. sector            — o que a pessoa PODE VER. `sector_visibility` corta
//                          `clients` por status, por setor: quem cai num setor
//                          sem 'lead' abre o mapa e nao ve pin nenhum.
//
// Os passos 3 e 4 sao os que somem quando alguem cria usuario "na mao" pelo
// painel do Supabase, e os dois sintomas nao parecem cadastro incompleto:
// "vendedor invisivel nos rankings" e "o mapa nao carrega". Por isso os dois
// sao campos de primeira classe aqui.
//
// O setor virou OBRIGATORIO em 02/09/2026, depois de uma vendedora ficar duas
// semanas com o mapa vazio por ter nascido no setor default. Antes, a funcao
// simplesmente nao escrevia a coluna e deixava o default do banco decidir —
// que e' o pior lugar possivel pra essa decisao.
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
//     "id_hubspot": "12345678",  // obrigatorio — ver "CONFIGURACAO POR PESSOA"
//     "setor": "Outbound",       // obrigatorio — precisa existir em sector_visibility
//     "senha": "opcional",       // sem ela, uma temporaria e' gerada
//     "dry_run": false }         // true valida tudo e NAO cria nada
//
//   201 -> { id, email, nome, role: "user", id_hubspot, setor, senha?, aviso? }
//   200 -> { id, ..., ja_existia: true }  — o e-mail ja tinha conta
//   200 -> { ..., dry_run: true, pode_criar, problemas[] }
//   400 -> dado faltando ou invalido, com a mensagem do que consertar
//   401 -> credencial invalida (token errado, expirado ou ausente)
//   403 -> credencial valida, mas quem chamou nao e' gestor
//
// IDENTIFICADOR ESTAVEL: o `id` devolvido e' o UUID de auth.users. E' a MESMA
// chave de profiles.id, client_visits.visited_by, dailies.seller_id e
// field_routes.seller_id. Guarde ELE, nao o e-mail: e-mail muda e diverge
// entre sistemas; este uuid nunca muda enquanto a conta existir.
//
// IDEMPOTENTE POR E-MAIL: reenviar a mesma criacao devolve 200 com o id que ja'
// existe e `ja_existia: true`, em vez de erro. Retry por timeout de rede e'
// seguro e nao duplica.
//
// CONFIGURACAO POR PESSOA: `id_hubspot` e' o owner id do HubSpot, e e' o unico
// campo que depende de dado de outro sistema. Ele NAO e' global nem por setor:
// e' individual, e sai de /crm/v3/owners (ou Settings -> Users & Teams). Se
// vier errado, a pessoa loga e trabalha, mas aparece com zero leads em todas as
// telas — por isso a funcao CONFERE o id contra o HubSpot antes de criar.
//
// Exemplo:
//   curl -X POST https://<ref>.supabase.co/functions/v1/criar-usuario \
//     -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"email":"joao@takeat.app","nome":"João Silva","id_hubspot":"12345678","setor":"Outbound"}'
//
// O id_hubspot voce pega no HubSpot em Settings -> Users & Teams, ou pela API
// de owners (/crm/v3/owners).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Esta API cria SOMENTE vendedor.
//
// Nao e' limitacao: e' o que fecha a porta. Uma rota capaz de escolher o papel
// e' uma via de escalonamento de privilegio — bastaria um gestor com a sessao
// aberta num aparelho alheio, ou a service role key vazando, pra nascer um
// 'gestor' novo com acesso a base inteira de clientes.
//
// Promover alguem continua possivel, mas pelo caminho que ja' existe e que e'
// auditavel: o gatilho profiles_prevent_role_self_escalation deixa um gestor
// mudar o papel de outra pessoa direto na tabela.
const PAPEL_FIXO = 'user' as const;

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
  }

  const corpo = await req.json().catch(() => null);
  const email = String(corpo?.email ?? '').trim().toLowerCase();
  const nome = String(corpo?.nome ?? '').trim();
  const idHubspot = corpo?.id_hubspot ? String(corpo.id_hubspot).trim() : null;
  const setor = corpo?.setor ? String(corpo.setor).trim() : null;
  const senhaInformada = corpo?.senha ? String(corpo.senha) : null;
  const dryRun = corpo?.dry_run === true;

  // --- validacao, com mensagem que diz O QUE consertar ---------------------
  if (!ehEmail(email)) return json(400, { error: 'E-mail inválido.' });
  if (nome.length < 2) return json(400, { error: 'Informe o nome completo da pessoa.' });
  // Recusa em vez de ignorar: quem mandou `role` esperava que funcionasse, e
  // criar um vendedor calado seria o pior dos dois mundos.
  if (corpo?.role && corpo.role !== PAPEL_FIXO) {
    return json(400, {
      error:
        'Esta API cria apenas vendedor. Para mudar o papel de alguém, altere ' +
        'profiles.role direto — a permissão para isso já é só de gestor.',
    });
  }
  if (senhaInformada && senhaInformada.length < 8) {
    return json(400, { error: 'A senha precisa de pelo menos 8 caracteres.' });
  }
  if (!idHubspot) {
    return json(400, {
      error:
        'Vendedor precisa do id_hubspot (owner do CRM). Sem ele a pessoa loga, ' +
        'mas aparece com zero leads em todas as telas — e o sintoma não parece cadastro incompleto.',
    });
  }
  if (!setor) {
    return json(400, {
      error:
        'Vendedor precisa do setor. Ele decide o que a pessoa enxerga: sector_visibility ' +
        'corta clients por status, e quem cai num setor sem "lead" abre o mapa vazio. ' +
        'Deixar o default do banco decidir isso já custou duas semanas de uma vendedora.',
    });
  }

  // --- o setor existe, e libera lead? ---------------------------------------
  // Setor inexistente e' erro de dado: RLS nao devolveria status NENHUM e a
  // pessoa abriria o app sem nada. Setor que existe mas nao tem 'lead' e'
  // legitimo (marketing, financeiro) — vira AVISO, nao bloqueio, porque nem
  // toda conta e' de vendedor de rua.
  const { data: regrasDoSetor } = await svc
    .from('sector_visibility')
    .select('status_slug')
    .eq('sector', setor);
  const statusDoSetor = (regrasDoSetor ?? []).map((r: any) => r.status_slug);
  if (statusDoSetor.length === 0) {
    const { data: todos } = await svc.from('sector_visibility').select('sector');
    const conhecidos = [...new Set((todos ?? []).map((r: any) => r.sector))].sort();
    return json(400, {
      error: `O setor "${setor}" não existe em sector_visibility.`,
      setores_validos: conhecidos,
    });
  }
  const setorVeLead = statusDoSetor.includes('lead');
  const avisoSetor = setorVeLead
    ? undefined
    : `O setor "${setor}" não enxerga leads (só ${statusDoSetor.join(', ')}). ` +
      'Se a pessoa for vendedor de rua, ela vai abrir o mapa vazio.';

  // --- o e-mail ja tem conta? -----------------------------------------------
  // Precisa vir ANTES de qualquer escrita, e serve pros dois modos: no dry_run
  // e' o aviso, na criacao e' a idempotencia.
  const { data: perfilExistente } = await svc
    .from('profiles')
    .select('id, email, full_name, role, id_hubspot, sector')
    .eq('email', email)
    .maybeSingle();

  // --- o owner do HubSpot existe? -------------------------------------------
  // E' a checagem que evita o bug mais caro deste cadastro: id errado cria um
  // vendedor que loga, trabalha, e aparece com zero leads em todas as telas —
  // sintoma que nao parece cadastro incompleto.
  //
  // HubSpot fora do ar NAO bloqueia a criacao (seria acoplar o provisionamento
  // a disponibilidade de terceiro), mas vira aviso na resposta. Owner que o
  // HubSpot NEGA, sim: aquilo e' erro de dado, e o certo e' recusar.
  async function conferirOwner(): Promise<{ ok: boolean; motivo?: string; nome?: string }> {
    const token = Deno.env.get('HUBSPOT_TOKEN');
    if (!token) return { ok: true, motivo: 'HUBSPOT_TOKEN não configurado — id não conferido.' };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`https://api.hubapi.com/crm/v3/owners/${idHubspot}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 404) {
        return { ok: false, motivo: `O HubSpot não conhece o owner ${idHubspot}.` };
      }
      if (!res.ok) return { ok: true, motivo: `HubSpot respondeu ${res.status} — id não conferido.` };
      const owner = await res.json().catch(() => null);
      if (owner?.archived) {
        return { ok: false, motivo: `O owner ${idHubspot} está arquivado no HubSpot.` };
      }
      const nome = [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim();
      return { ok: true, nome: nome || owner?.email };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: true, motivo: `Não consegui falar com o HubSpot (${msg}) — id não conferido.` };
    }
  }

  const owner = await conferirOwner();

  // --- dry_run: valida tudo e NAO escreve nada ------------------------------
  if (dryRun) {
    const problemas: string[] = [];
    if (perfilExistente) problemas.push(`Já existe conta com o e-mail ${email}.`);
    if (!owner.ok) problemas.push(owner.motivo!);
    return json(200, {
      dry_run: true,
      pode_criar: problemas.length === 0,
      problemas,
      // Os dois avisos sao independentes e podem valer juntos: HubSpot fora do
      // ar E setor sem lead. Somar num campo so' esconderia um deles.
      aviso: [owner.ok ? owner.motivo : undefined, avisoSetor].filter(Boolean).join(' ') || undefined,
      setor,
      setor_ve_lead: setorVeLead,
      setor_status: statusDoSetor,
      // Devolve o id de quem ja' existe: quem integra consegue gravar o
      // vinculo sem precisar de uma segunda chamada.
      id: (perfilExistente as any)?.id,
      email,
      nome,
      role: PAPEL_FIXO,
      id_hubspot: idHubspot,
      owner_no_hubspot: owner.nome,
    });
  }

  if (!owner.ok) return json(400, { error: owner.motivo });

  // --- idempotencia ---------------------------------------------------------
  // Reenviar (timeout de rede, retry da fila) devolve o MESMO id em vez de
  // erro. Sem isto, quem integra nao consegue distinguir "eu ja' criei" de
  // "outra pessoa criou" e acaba com cadastro duplicado ou vinculo perdido.
  if (perfilExistente) {
    return json(200, {
      id: (perfilExistente as any).id,
      email: (perfilExistente as any).email,
      nome: (perfilExistente as any).full_name,
      role: (perfilExistente as any).role,
      id_hubspot: (perfilExistente as any).id_hubspot,
      setor: (perfilExistente as any).sector,
      ja_existia: true,
      aviso: 'Conta já existia; nada foi alterado. A senha não é recuperável — use recuperação de senha se preciso.',
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
    if (jaExiste) {
      // Corrida: alguem criou entre a consulta acima e este insert. Resolve
      // como idempotencia, e nao como erro — o resultado desejado aconteceu.
      const { data: agora } = await svc
        .from('profiles').select('id, email, full_name, role, id_hubspot, sector').eq('email', email).maybeSingle();
      return json(200, {
        id: (agora as any)?.id, email, nome: (agora as any)?.full_name ?? nome,
        role: (agora as any)?.role ?? PAPEL_FIXO, id_hubspot: (agora as any)?.id_hubspot ?? idHubspot,
        ja_existia: true,
      });
    }
    return json(500, { error: `Não consegui criar o login: ${msg}` });
  }

  const id = criado.user.id;

  // --- 2. perfil ------------------------------------------------------------
  // UPSERT, e nao INSERT: alguns projetos tem gatilho que ja' cria a linha em
  // profiles no nascimento do auth.user. Se tiver, o insert quebraria por
  // chave duplicada e deixaria uma conta de login orfa, sem papel.
  const { error: erroPerfil } = await svc
    .from('profiles')
    .upsert(
      { id, email, full_name: nome, role: PAPEL_FIXO, id_hubspot: idHubspot, sector: setor },
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

  return json(201, {
    id,
    email,
    nome,
    role: PAPEL_FIXO,
    id_hubspot: idHubspot,
    setor,
    setor_ve_lead: setorVeLead,
    // A senha aparece UMA vez, na resposta. Nao ha' SMTP neste projeto pra
    // mandar convite, entao o gestor precisa entregar a senha pra pessoa. Ela
    // nao fica guardada em lugar nenhum legivel: o banco so' tem o hash.
    senha: senhaInformada ? undefined : senha,
    ja_existia: false,
    owner_no_hubspot: owner.nome,
    aviso: [
      senhaInformada
        ? null
        : 'Senha temporária gerada. Ela aparece só nesta resposta — copie agora e peça para a pessoa trocar no primeiro acesso.',
      owner.motivo,
      avisoSetor,
    ].filter(Boolean).join(' ') || undefined,
  });
});
