// Quem entra no app, e com o que consegue trabalhar.
//
// Esta tela nasceu de dois chamados na mesma semana, e os dois tinham a mesma
// forma: a conta existia, a pessoa logava, e o app simplesmente nao mostrava
// nada. Nenhum dos dois parecia cadastro incompleto.
//
//   1. Sem `id_hubspot` — `clients.vendedor_id_hubspot` nao casa com ninguem.
//      A pessoa nao tem carteira e some dos rankings. Sintoma: "meu nome nao
//      aparece no placar".
//   2. Setor sem `lead` em `sector_visibility` — o RLS entrega so' os status do
//      setor, e o app abre filtrando 'lead'. Sintoma: "o mapa nao carrega".
//
// Por isso a lista aqui nao e' um cadastro: e' um DIAGNOSTICO. Ela existe pra
// esses dois estados aparecerem antes de virarem chamado, e nao depois.
//
// A criacao em si vai pra Edge `criar-usuario`, que precisa da service role key
// (so' ela cria login) — o navegador nunca ve essa chave.
import { supabase } from '../supabase';

/** Setores que trabalham carteira de rua. Mesma lista do app de campo
 *  (`src/hooks/useSellerClassification.ts`), e pelo mesmo motivo: quem nao
 *  trabalha carteira nao precisa de id_hubspot, e cobrar o campo dessas
 *  pessoas seria alarme falso permanente. */
const SETORES_COM_CARTEIRA = ['outbound', 'field sales'];

export type PapelDeAcesso = 'user' | 'gestor' | 'view' | null;

/** Curadoria de `seller_classification` — sem linha significa 'ativo'
 *  (default declarado em 20260807_seller_classification.sql). */
export type ClassificacaoVendedor = 'ativo' | 'sem_meta' | 'nao_vendedor';

export interface ContaDeAcesso {
  id: string;
  nome: string;
  email: string;
  papel: PapelDeAcesso;
  setor: string | null;
  idHubspot: string | null;
  /** Convencao lida em varios lugares: sufixo "/ DESATIVADO" no full_name. */
  desativado: boolean;
  /** Vendedor de carteira sem owner do CRM: some dos rankings. */
  semIdHubspot: boolean;
  /** Setor que o RLS nao deixa ver lead E a pessoa e' de campo: mapa vazio. */
  setorSemLead: boolean;
  classificacao: ClassificacaoVendedor;
  criadoEm: string | null;
}

export interface SetorDeAcesso {
  nome: string;
  /** Os status que `sector_visibility` libera pra este setor. */
  status: string[];
  veLead: boolean;
}

export interface DadosDeAcesso {
  contas: ContaDeAcesso[];
  setores: SetorDeAcesso[];
}

export async function carregarAcessos(): Promise<DadosDeAcesso> {
  const [perfis, visibilidade, classificacao] = await Promise.all([
    // TODOS os papeis, ao contrario de `equipe.ts` (que tira 'view' porque
    // viewer nao e' campo). Aqui a pergunta e' "quem tem acesso", e viewer
    // tem — esconder seria mentir sobre a superficie de acesso.
    supabase
      .from('profiles')
      .select('id, full_name, email, role, sector, id_hubspot, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('sector_visibility').select('sector, status_slug'),
    // Quem AINDA e' de campo. Sem esta curadoria, "setor nao ve lead" acusa
    // tambem quem saiu do campo de proposito — e ai' o alarme fica vermelho
    // pra sempre, que e' o mesmo que nao ter alarme.
    supabase.from('seller_classification').select('seller_id, status'),
  ]);

  if (perfis.error) throw perfis.error;
  if (visibilidade.error) throw visibilidade.error;
  // Curadoria e' OPCIONAL de proposito, igual em equipe.ts: se a leitura
  // falhar, a tela abre com o default ('ativo') em vez de virar mensagem de
  // erro por causa de uma tabela auxiliar.
  const classePor = new Map<string, ClassificacaoVendedor>(
    ((classificacao.data ?? []) as any[]).map((c) => [c.seller_id, c.status]),
  );

  const statusPorSetor = new Map<string, string[]>();
  for (const r of (visibilidade.data ?? []) as any[]) {
    const lista = statusPorSetor.get(r.sector) ?? [];
    lista.push(r.status_slug);
    statusPorSetor.set(r.sector, lista);
  }

  const setores: SetorDeAcesso[] = [...statusPorSetor.entries()]
    .map(([nome, status]) => ({ nome, status: status.sort(), veLead: status.includes('lead') }))
    // Os que veem lead primeiro: sao os que servem pra vendedor de rua, que e'
    // o cadastro mais comum. Deixar "Financeiro" no topo do select convida ao
    // erro que esta tela existe pra evitar.
    .sort((a, b) => (a.veLead === b.veLead ? a.nome.localeCompare(b.nome) : a.veLead ? -1 : 1));

  const contas: ContaDeAcesso[] = ((perfis.data ?? []) as any[])
    .map((p) => {
      const bruto = (p.full_name?.trim() || p.email || 'Sem nome') as string;
      const desativado = /DESATIVADO/i.test(bruto);
      const setor = p.sector ?? null;
      const status = setor ? statusPorSetor.get(setor) ?? [] : [];
      const ehVendedor = p.role === 'user' && !desativado;
      const setorDeCarteira = SETORES_COM_CARTEIRA.includes((setor ?? '').trim().toLowerCase());
      const classe = classePor.get(p.id) ?? 'ativo';
      const ehDeCampo = ehVendedor && classe !== 'nao_vendedor';
      return {
        id: p.id,
        nome: bruto.replace(/\s*\/\s*DESATIVADO\s*$/i, '').trim() || p.email || 'Sem nome',
        email: p.email,
        papel: (p.role ?? null) as PapelDeAcesso,
        setor,
        idHubspot: p.id_hubspot ?? null,
        desativado,
        semIdHubspot: ehDeCampo && setorDeCarteira && !p.id_hubspot,
        // Precisa das DUAS coisas: setor que nao ve lead E pessoa que ainda
        // trabalha o mapa. So' a primeira acusava a Amanda, que mudou pra
        // Inside Sales — pra ela o setor sem lead esta' certo, e um alarme
        // permanente sobre alguem que esta' no lugar certo treina o gestor a
        // ignorar a faixa inteira. O sinal de "ainda e' de campo" e'
        // `seller_classification`, a mesma curadoria que decide o ranking.
        setorSemLead: ehDeCampo && !status.includes('lead'),
        classificacao: classe,
        criadoEm: p.created_at ?? null,
      };
    })
    .sort((a, b) => {
      // Ordem de ATENCAO, nao alfabetica: quem esta quebrado primeiro. E' a
      // mesma escolha de Pessoas — a tela existe pra produzir uma acao.
      const peso = (c: ContaDeAcesso) =>
        c.desativado ? 3 : c.semIdHubspot || c.setorSemLead ? 0 : c.papel === 'user' ? 1 : 2;
      const pa = peso(a);
      const pb = peso(b);
      return pa === pb ? a.nome.localeCompare(b.nome) : pa - pb;
    });

  return { contas, setores };
}

export interface DadosNovoUsuario {
  nome: string;
  email: string;
  idHubspot: string;
  setor: string;
  /** Vazio = a Edge gera uma temporaria e devolve UMA vez. */
  senha?: string;
}

export interface RespostaCriacao {
  ok: boolean;
  erro?: string;
  /** Setores validos, quando o erro foi setor inexistente. */
  setoresValidos?: string[];
  /** dry_run: passou em tudo? */
  podeCriar?: boolean;
  problemas?: string[];
  aviso?: string;
  /** Nome do owner conferido no HubSpot — confirma que o id e' de quem se pensa. */
  ownerNoHubspot?: string;
  id?: string;
  senha?: string;
  jaExistia?: boolean;
  /** A Edge que ATENDEU sabe gravar setor?
   *
   *  A versao antiga simplesmente nao escrevia a coluna, e a pessoa nascia no
   *  default do banco — que e' como a Renata passou duas semanas com o mapa
   *  vazio. O deploy da Edge e' manual e nao acontece junto com o do site,
   *  entao existe uma janela em que a tela nova conversa com a funcao velha.
   *  Detectamos pelo eco: so' a versao nova devolve `setor` na resposta. */
  edgeGravaSetor?: boolean;
}

async function chamar(corpo: Record<string, unknown>): Promise<RespostaCriacao> {
  const { data, error } = await supabase.functions.invoke('criar-usuario', { body: corpo });

  if (error) {
    // A Edge responde 400/403 com `{ error: "..." }` no corpo, e o supabase-js
    // embrulha isso num FunctionsHttpError cuja `message` e' generica
    // ("non-2xx status code"). Sem desembrulhar, o gestor leria "erro" no lugar
    // de "o HubSpot nao conhece o owner 123" — que e' a unica coisa acionavel.
    let detalhe = error.message;
    let setoresValidos: string[] | undefined;
    try {
      const c = await (error as any).context?.json?.();
      if (c?.error) detalhe = c.error;
      if (Array.isArray(c?.setores_validos)) setoresValidos = c.setores_validos;
    } catch {
      /* mantem a mensagem generica */
    }
    return { ok: false, erro: detalhe, setoresValidos };
  }

  const d = (data ?? {}) as any;
  if (d.error) return { ok: false, erro: d.error };

  return {
    ok: true,
    podeCriar: d.pode_criar,
    problemas: d.problemas ?? [],
    aviso: d.aviso,
    ownerNoHubspot: d.owner_no_hubspot,
    id: d.id,
    senha: d.senha,
    jaExistia: d.ja_existia === true,
    edgeGravaSetor: d.setor !== undefined,
  };
}

/** Valida tudo e NAO escreve nada. E' o passo obrigatorio da tela: o erro caro
 *  aqui (owner errado) so' aparece depois, e em outra tela. */
export function conferirUsuario(d: DadosNovoUsuario): Promise<RespostaCriacao> {
  return chamar({
    email: d.email,
    nome: d.nome,
    id_hubspot: d.idHubspot,
    setor: d.setor,
    dry_run: true,
  });
}

export function criarUsuario(d: DadosNovoUsuario): Promise<RespostaCriacao> {
  return chamar({
    email: d.email,
    nome: d.nome,
    id_hubspot: d.idHubspot,
    setor: d.setor,
    senha: d.senha?.trim() ? d.senha : undefined,
  });
}

// ---------------------------------------------------------------------------
// Desativar acesso (G10). O que a aba nova precisa, e nada mais.
// ---------------------------------------------------------------------------

/** Quantos leads cada owner do HubSpot tem em mao.
 *
 *  Sem RPC nem view: sao ~1.100 linhas de UMA coluna, duas paginas do
 *  PostgREST, ~1,3s. Trazer `clients` inteiro seria 5.800 linhas com 30
 *  colunas — a diferenca que faz isto caber na lista, antes do clique.
 *
 *  RECORTE: so' `status = 'lead'`. E' o que o desenho conta, e e' o dano que
 *  a tela existe pra evitar (lead sem dono some do mapa de todo mundo).
 *  Cliente e churn com owner sao 4 linhas na base inteira e continuam
 *  visiveis pra qualquer setor — ficam onde estao. */
export async function carregarCarteiras(): Promise<Map<string, number>> {
  const porOwner = new Map<string, number>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('clients')
      .select('vendedor_id_hubspot')
      .eq('status', 'lead')
      .not('vendedor_id_hubspot', 'is', null)
      .range(de, de + 999);
    if (error) throw error;
    for (const c of data as any[]) {
      const o = String(c.vendedor_id_hubspot);
      porOwner.set(o, (porOwner.get(o) ?? 0) + 1);
    }
    if (data.length < 1000) break;
  }
  return porOwner;
}

export interface PedidoDeDesativacao {
  /** profiles.id — a chave estavel, a mesma de auth.users. */
  perfilId: string;
  /** Owner de quem sai. null quando a pessoa nao tem id_hubspot. */
  ownerDe: string | null;
  /** Owner de quem assume. null quando nao ha' carteira a passar. */
  ownerPara: string | null;
}

export interface ResultadoDesativacao {
  ok: boolean;
  /** Onde parou, quando nao deu ok. */
  etapa?: 'transferencia' | 'revogacao' | 'classificacao';
  erro?: string;
  leadsMovidos: number;
  revogado: boolean;
  classificado: boolean;
}

/** As tres escritas, na ordem que o desenho exige: transferir → revogar →
 *  classificar. Para na primeira falha.
 *
 *  A ORDEM NAO E' ARBITRARIA. Revogar antes de transferir produz exatamente o
 *  estado que esta tela existe pra evitar: pessoa fora, carteira apontando pra
 *  ela. Se a transferencia falha, nada mais acontece e a carteira continua
 *  inteira com quem ainda tem acesso — reversivel por definicao.
 *
 *  A Edge internamente ja' faz ban → rename, pelo mesmo raciocinio invertido:
 *  se o rename falhar, o pior caso e' alguem SEM acesso aparecendo ativo, e
 *  nao alguem marcado como desativado ainda entrando. */
export async function desativarAcesso(p: PedidoDeDesativacao): Promise<ResultadoDesativacao> {
  const r: ResultadoDesativacao = { ok: false, leadsMovidos: 0, revogado: false, classificado: false };

  // --- 1. transferir -------------------------------------------------------
  if (p.ownerDe && p.ownerPara) {
    const { data, error } = await supabase
      .from('clients')
      .update({ vendedor_id_hubspot: p.ownerPara })
      .eq('vendedor_id_hubspot', p.ownerDe)
      .eq('status', 'lead')
      .select('id');
    if (error) return { ...r, etapa: 'transferencia', erro: error.message };
    r.leadsMovidos = data?.length ?? 0;
  }

  // --- 2. revogar (bane E renomeia; a Edge nao separa) ----------------------
  const { data: dRev, error: eRev } = await supabase.functions.invoke('revogar-usuario', {
    body: { id: p.perfilId },
  });
  if (eRev) {
    let detalhe = eRev.message;
    try {
      const c = await (eRev as any).context?.json?.();
      if (c?.error) detalhe = c.error;
    } catch {
      /* mantem a mensagem generica */
    }
    return { ...r, etapa: 'revogacao', erro: detalhe };
  }
  if ((dRev as any)?.error) return { ...r, etapa: 'revogacao', erro: (dRev as any).error };
  r.revogado = true;

  // --- 3. tirar do filtro de vendedor do app de campo -----------------------
  // UPSERT, nao UPDATE: "sem linha" significa 'ativo', entao quem foi criado
  // pela Acessos pode nao ter linha nenhuma — e ai' um UPDATE afetaria zero
  // linhas EM SILENCIO, que e' a falha que nao parece falha.
  const { error: eCls } = await supabase
    .from('seller_classification')
    .upsert({ seller_id: p.perfilId, status: 'nao_vendedor' }, { onConflict: 'seller_id' });
  if (eCls) {
    // Nao repete a Edge: ela ja' passou, e o estado dela esta' correto. Falta
    // so' esta parte, e a tela diz qual e'.
    return { ...r, etapa: 'classificacao', erro: eCls.message };
  }
  r.classificado = true;

  return { ...r, ok: true };
}
