// Supabase Edge Function: status-usuario
//
// Consulta o estado de uma conta. E' a terceira irma de `criar-usuario` e
// `revogar-usuario` — o ciclo fica criar -> consultar -> revogar, com o mesmo
// modelo de auth e o mesmo formato de erro.
//
// POR QUE ELA EXISTE
// "A conta esta ativa?" e' a pergunta facil, e nao e' a que gera chamado. As
// tres que geraram, todas na mesma semana, sao invisiveis por fora:
//
//   1. setor sem 'lead' em sector_visibility  -> a pessoa abre o mapa vazio
//   2. sem id_hubspot                         -> some dos rankings, sem carteira
//   3. seller_classification = nao_vendedor   -> fora do ranking de proposito
//
// Nenhuma das tres parece cadastro incompleto pra quem sofre: o sintoma e' "o
// app nao mostra nada". Por isso a resposta traz `pode_trabalhar.impedimentos`,
// uma lista de codigos estaveis — quem integra decide o que fazer sem ter que
// reimplementar a regra.
//
// GET https://<ref>.supabase.co/functions/v1/status-usuario?email=joao@takeat.app
//   Authorization: Bearer <service role key ou JWT de um gestor>
//
// E-MAIL E' O PADRAO. Quem integra costuma ter o e-mail em mãos, nao o uuid, e
// exigir o uuid so' empurra pra quem chama um trabalho de traducao que esta
// rota ja' faz. `?id=<uuid>` continua valendo como forma exata.
//
// Mandando os DOIS, o `id` vence: ele e' a chave de verdade, e discordancia
// entre os dois e' bug de quem chama — resolver pelo mais preciso e' o que
// erra menos.
//
// POST com { "email" } ou { "id" } faz a mesma coisa — alguns clientes de fila
// so' sabem mandar POST.
//
//   200 -> o objeto de status (abaixo)
//   400 -> nem id nem email
//   401 -> credencial invalida
//   403 -> credencial valida, mas quem chamou nao e' gestor
//   404 -> { error, existe: false } — nao ha' conta com esse id/e-mail
//
// SO' LEITURA. Nao escreve nada, em nenhum caminho.
//
// Deploy:
//   supabase functions deploy status-usuario
// Nao precisa de secret novo.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Setores que trabalham carteira de rua. MESMA lista do app de campo
// (`src/hooks/useSellerClassification.ts`) e do cockpit (`dados/acessos.ts`):
// quem nao trabalha carteira nao precisa de id_hubspot, e cobrar o campo dessas
// pessoas seria alarme falso permanente.
const SETORES_COM_CARTEIRA = ['outbound', 'field sales'];

// Janela de "atividade recente". 30 dias porque e' o horizonte em que "essa
// conta esta sendo usada?" tem resposta util — abaixo disso, ferias derrubam
// qualquer conta; acima, uma conta abandonada continua parecendo viva.
const JANELA_DIAS = 30;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** A credencial tem poder de service role?
 *
 *  COMPARAR STRING NAO BASTA, e foi assim que esta funcao nasceu. O env
 *  `SUPABASE_SERVICE_ROLE_KEY` guarda a chave LEGADA (JWT `eyJ...`), mas o
 *  painel do Supabase hoje mostra o formato novo (`sb_secret_...`) por padrao —
 *  as duas dao o mesmo poder e sao strings diferentes. Quem copia a do painel
 *  recebia "Credencial inválida" com a chave certa na mao.
 *
 *  E NAO da' pra resolver decodificando o JWT e olhando `role: service_role`:
 *  sem verificar a assinatura, qualquer um forja esse claim. Entao a checagem
 *  e' de CAPACIDADE — usamos a credencial numa rota que so' service role abre
 *  (`auth.admin`), e quem valida a assinatura e' o GoTrue, nao nos.
 *
 *  O caminho caro so' roda quando a comparacao direta falha. */
async function temPoderDeServico(cred: string): Promise<boolean> {
  if (cred === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true;
  try {
    const teste = createClient(Deno.env.get('SUPABASE_URL')!, cred, {
      auth: { persistSession: false },
    });
    const { error } = await teste.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch {
    return false;
  }
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

/** Sufixo "/ DESATIVADO" no full_name — a convencao que o app inteiro le'
 *  (useAllSellers, useSellerClassification, equipe.ts, acessos.ts). */
const ehMarcadoDesativado = (nome: string | null) => /DESATIVADO/i.test(nome ?? '');
const semSufixo = (nome: string | null) =>
  (nome ?? '').replace(/\s*\/\s*DESATIVADO\s*$/i, '').trim();

interface Impedimento {
  /** Codigo ESTAVEL — quem integra liga logica nele, nao no texto. */
  codigo: 'login_bloqueado' | 'marcado_desativado' | 'setor_sem_lead' | 'sem_id_hubspot' | 'sem_setor';
  /** O SINTOMA, nao o campo: "sem id_hubspot" nao ajuda ninguem a reconhecer
   *  o chamado que vai receber. */
  sintoma: string;
  conserto: string;
}

Deno.serve(async (req) => {
  // Preflight ANTES da checagem de metodo: OPTIONS nao e' GET nem POST, e
  // responder 405 aqui quebra qualquer chamada de navegador. Ja custou caro
  // neste projeto (hubspot-sync, geocode e conta-alvo-nearby, 02/09/2026).
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(405, { error: 'Use GET (?id= ou ?email=) ou POST.' });
  }

  const credencial = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!credencial) return json(401, { error: 'Sem credencial' });

  const svc = serviceClient();
  const ehServiceRole = await temPoderDeServico(credencial);

  if (!ehServiceRole) {
    const { data: userData, error: erroUser } = await svc.auth.getUser(credencial);
    if (erroUser || !userData?.user) {
      // Diz O QUE tentar: a mensagem antiga ("Credencial inválida") mandava
      // quem estava com a chave certa procurar problema no lugar errado.
      return json(401, {
        error: 'Credencial inválida — não é service role nem JWT de usuário.',
        dica: 'Se for chave de painel, use a service_role em Settings → API. JWT de usuário expira em 1h.',
      });
    }
    const { data: quemChamou } = await svc
      .from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    // Ler o estado de uma conta e' ler a superficie de acesso do time inteiro.
    // Mesmo criterio das irmas: so' gestor.
    if (quemChamou?.role !== 'gestor') return json(403, { error: 'Só gestor consulta status' });
  }

  // --- email (padrao) ou id, de query string (GET) ou corpo (POST) ----------
  // A ordem de leitura nao decide precedencia: quem decide e' o `id ? ... : ...`
  // da consulta abaixo. Mandar os dois resolve pelo id.
  const url = new URL(req.url);
  const corpo = req.method === 'POST' ? await req.json().catch(() => null) : null;
  const id = (url.searchParams.get('id') ?? corpo?.id ?? '').toString().trim() || null;
  const email = (url.searchParams.get('email') ?? corpo?.email ?? '').toString().trim().toLowerCase() || null;

  if (!id && !email) {
    return json(400, { error: 'Informe `email` (padrão) ou `id`.' });
  }

  // --- o perfil -------------------------------------------------------------
  const consulta = svc
    .from('profiles')
    .select('id, email, full_name, role, sector, id_hubspot, created_at');
  const { data: perfil, error: erroPerfil } = id
    ? await consulta.eq('id', id).maybeSingle()
    : await consulta.eq('email', email!).maybeSingle();

  if (erroPerfil) return json(500, { error: `Não consegui consultar: ${erroPerfil.message}` });
  if (!perfil) {
    // 404 com `existe: false` explicito: quem integra fecha como "nao ha' conta"
    // e NAO gasta retry.
    return json(404, {
      // Nomeia o identificador que a CONSULTA usou, nao o "padrao". Mandando
      // os dois, a busca foi pelo id — dizer "nenhum usuario com e-mail X"
      // mandaria quem chama conferir o campo errado.
      error: id ? `Nenhum usuário com id ${id}.` : `Nenhum usuário com e-mail ${email}.`,
      existe: false,
    });
  }

  const p = perfil as any;
  const setor = (p.sector ?? null) as string | null;
  const owner = (p.id_hubspot ?? null) as string | null;
  const marcado = ehMarcadoDesativado(p.full_name);
  const desde = new Date(Date.now() - JANELA_DIAS * 86400_000).toISOString();

  // --- tudo o que nao depende de nada, em paralelo --------------------------
  const [authUser, visibilidade, classificacao, ultimaVisita, visitasJanela, reunioes] =
    await Promise.all([
      // banned_until e last_sign_in_at so' existem na Admin API — profiles nao
      // sabe se o login foi banido.
      svc.auth.admin.getUserById(p.id),
      setor
        ? svc.from('sector_visibility').select('status_slug').eq('sector', setor)
        : Promise.resolve({ data: [] as any[] }),
      svc.from('seller_classification').select('status').eq('seller_id', p.id).maybeSingle(),
      svc.from('client_visits').select('visited_at')
        .eq('visited_by', p.id).order('visited_at', { ascending: false }).limit(1),
      svc.from('client_visits').select('id', { count: 'exact', head: true })
        .eq('visited_by', p.id).gte('visited_at', desde),
      svc.from('client_meetings').select('id', { count: 'exact', head: true })
        .eq('created_by', p.id).gte('scheduled_at', new Date().toISOString()),
    ]);

  const setorVe = ((visibilidade as any).data ?? []).map((r: any) => r.status_slug).sort();
  const veLeads = setorVe.includes('lead');
  // "Sem linha" significa 'ativo' — default declarado em
  // 0058_seller_classification.sql.
  const classe = ((classificacao as any).data?.status ?? 'ativo') as string;
  const banidoAte = (authUser as any)?.data?.user?.banned_until ?? null;
  // O ban do Supabase e' uma JANELA, nao um estado: a funcao de revogar usa 100
  // anos. Vencido, a pessoa volta a entrar — por isso comparamos com agora em
  // vez de tratar o campo como booleano.
  const loginBloqueado = !!banidoAte && new Date(banidoAte).getTime() > Date.now();

  // --- carteira: contagem por status, sem trazer linha nenhuma --------------
  // `head: true` + `count: exact` devolve so' o numero. Pra UMA pessoa isto e'
  // uma requisicao por status; a paginacao do cockpit so' existe la' porque ele
  // agrupa a base inteira por dono.
  const contarCarteira = async (status: string) => {
    if (!owner) return 0;
    const { count } = await svc
      .from('clients').select('id', { count: 'exact', head: true })
      .eq('vendedor_id_hubspot', owner).eq('status', status);
    return count ?? 0;
  };
  const [leads, clientes, churn] = await Promise.all([
    contarCarteira('lead'), contarCarteira('cliente'), contarCarteira('churn'),
  ]);

  // --- impedimentos ---------------------------------------------------------
  const ehVendedorDeCampo = p.role === 'user' && !marcado && classe !== 'nao_vendedor';
  const setorDeCarteira = SETORES_COM_CARTEIRA.includes((setor ?? '').trim().toLowerCase());
  const impedimentos: Impedimento[] = [];

  if (loginBloqueado) {
    impedimentos.push({
      codigo: 'login_bloqueado',
      sintoma: 'A pessoa não consegue entrar no app.',
      conserto: `Ban ativo até ${banidoAte}. Remover pelo painel de Authentication do Supabase.`,
    });
  }
  if (marcado) {
    impedimentos.push({
      codigo: 'marcado_desativado',
      sintoma: 'Sai dos rankings e do placar da Daily.',
      conserto: 'Tirar o sufixo "/ DESATIVADO" de profiles.full_name.',
    });
  }
  if (!setor) {
    impedimentos.push({
      codigo: 'sem_setor',
      sintoma: 'Sem setor, o RLS não entrega status nenhum: o app abre vazio.',
      conserto: 'Definir profiles.sector com um setor de sector_visibility.',
    });
  } else if (ehVendedorDeCampo && !veLeads) {
    impedimentos.push({
      codigo: 'setor_sem_lead',
      sintoma: 'Abre o mapa e não aparece pin nenhum — parece falta de dado, é permissão.',
      conserto: `O setor "${setor}" só enxerga ${setorVe.join(', ')}. Mudar o setor, ou liberar 'lead' para ele em sector_visibility.`,
    });
  }
  if (ehVendedorDeCampo && setorDeCarteira && !owner) {
    impedimentos.push({
      codigo: 'sem_id_hubspot',
      sintoma: 'Some dos rankings e aparece sem carteira, mesmo trabalhando.',
      conserto: 'Preencher profiles.id_hubspot com o owner id do HubSpot (Settings → Users & Teams).',
    });
  }

  return json(200, {
    id: p.id,
    email: p.email,
    nome: semSufixo(p.full_name) || p.email,
    papel: p.role,
    setor,
    id_hubspot: owner,
    criado_em: p.created_at,

    acesso: {
      // "Consegue entrar E aparece como gente ativa no app." As duas coisas sao
      // independentes: da' pra estar banido com o nome limpo, e vice-versa.
      ativo: !loginBloqueado && !marcado,
      login_bloqueado: loginBloqueado,
      banido_ate: banidoAte,
      marcado_desativado: marcado,
      ultimo_login: (authUser as any)?.data?.user?.last_sign_in_at ?? null,
    },

    pode_trabalhar: {
      ok: impedimentos.length === 0,
      impedimentos,
      setor_ve: setorVe,
      ve_leads: veLeads,
      classificacao: classe,
      eh_vendedor_de_campo: ehVendedorDeCampo,
    },

    carteira: {
      // Sem owner id nao existe carteira: `clients.vendedor_id_hubspot` nao casa
      // com ninguem. Zero aqui e' consequencia do impedimento, nao um numero.
      leads, clientes, churn,
      total: leads + clientes + churn,
    },

    atividade: {
      janela_dias: JANELA_DIAS,
      ultima_visita: (ultimaVisita as any)?.data?.[0]?.visited_at ?? null,
      visitas_na_janela: (visitasJanela as any)?.count ?? 0,
      reunioes_futuras: (reunioes as any)?.count ?? 0,
    },
  });
});
