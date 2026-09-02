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
  /** Setor que o RLS nao deixa ver lead: abre o mapa vazio. */
  setorSemLead: boolean;
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
  const [perfis, visibilidade] = await Promise.all([
    // TODOS os papeis, ao contrario de `equipe.ts` (que tira 'view' porque
    // viewer nao e' campo). Aqui a pergunta e' "quem tem acesso", e viewer
    // tem — esconder seria mentir sobre a superficie de acesso.
    supabase
      .from('profiles')
      .select('id, full_name, email, role, sector, id_hubspot, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('sector_visibility').select('sector, status_slug'),
  ]);

  if (perfis.error) throw perfis.error;
  if (visibilidade.error) throw visibilidade.error;

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
      return {
        id: p.id,
        nome: bruto.replace(/\s*\/\s*DESATIVADO\s*$/i, '').trim() || p.email || 'Sem nome',
        email: p.email,
        papel: (p.role ?? null) as PapelDeAcesso,
        setor,
        idHubspot: p.id_hubspot ?? null,
        desativado,
        semIdHubspot: ehVendedor && setorDeCarteira && !p.id_hubspot,
        // Vale pra QUALQUER vendedor, nao so' os de setor de carteira: o mapa
        // vazio nao depende de ter carteira, depende do RLS do setor.
        setorSemLead: ehVendedor && !status.includes('lead'),
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
