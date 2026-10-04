// Aba Playbook (prompt final, Parte B §B5). O conteúdo é o do Cockpit:
// cockpit_config.playbook, servido por cockpit-dados?recurso=playbook (o
// executivo recebe sem o capítulo Liderança). Nada de texto duplicado no app.
//
// Aqui fica só o que dá para testar sem tela: busca sem acento, a sugestão
// "para a próxima parada" pela etapa e o "continuar lendo".

export type PaginaPlaybook = {
  id: string;
  titulo: string;
  categoria: string;
  resumo?: string;
  busca?: string;
  formato?: string;
  html?: string;
};

export type Playbook = { paginas: PaginaPlaybook[]; categorias: string[] };

/** Progresso de leitura de uma página: % rolado e se foi marcada como lida. */
export type Progresso = Record<string, { pct: number; lida?: boolean; em: number }>;

export const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Casa título, resumo e o texto de busca do dado, sem acento e sem caixa. */
export function filtrarPaginas(pb: Playbook, termo: string, categoria: string | null): PaginaPlaybook[] {
  const t = semAcento(termo);
  return pb.paginas.filter((p) => {
    if (categoria && p.categoria !== categoria) return false;
    if (!t) return true;
    return semAcento(`${p.titulo} ${p.resumo ?? ''} ${p.busca ?? ''}`).includes(t);
  });
}

// Mapeamento etapa → páginas (tabela do §B5, com os ids reais do dado).
// A etapa chega como o rótulo do lead (clients.etapa) ou o status (cliente/churn).
const SUGESTOES: Array<{ casa: RegExp; ids: [string, string] }> = [
  { casa: /negocia|pagamento|proposta/, ids: ['objecoes', 'fechamento'] },
  { casa: /demo|decisor/, ids: ['mapa-dor-solucao', 'ecossistema-takeat'] },
  { casa: /visita/, ids: ['acesso-decisor', 'follow-up'] },
  { casa: /churn|ex-cliente|perdido|reciclagem/, ids: ['evitar-churn', 'relacionamento'] },
  { casa: /cliente|ganho/, ids: ['relacionamento', 'evitar-churn'] },
  { casa: /prospec|backlog|conta|contato|lead/, ids: ['prospeccao-porta-a-porta', 'acesso-decisor'] },
];

export function sugestoesDaEtapa(pb: Playbook, etapa: string | null | undefined): PaginaPlaybook[] {
  const e = semAcento(etapa ?? '');
  const regra = SUGESTOES.find((r) => r.casa.test(e)) ?? SUGESTOES[SUGESTOES.length - 1];
  return regra.ids
    .map((id) => pb.paginas.find((p) => p.id === id))
    .filter((p): p is PaginaPlaybook => !!p);
}

/** O que se sabe da próxima porta (mapa_negocio + o pino). */
export type ContextoPorta = {
  etapa: string | null;
  temNegocio: boolean;
  celular?: string | null;
  gargalo?: string | null;
  sistema?: string | null;
};
export type CartaoContextual = { pagina: PaginaPlaybook; titulo: string; motivo: string };

const ANTES_DO_DECISOR = /prospec|visita|backlog|conta|contato|lead/;

/**
 * O cartão do topo do Playbook (handoff v4.1 §6.16): UMA leitura, escolhida
 * pelo que falta para vender naquela porta, não só pela etapa.
 * 1. Quem decide ainda é desconhecido (conta sem negócio, ou negócio antes da
 *    Conversa com decisor sem o celular dele) → achar o decisor.
 * 2. Dor declarada → mapa dor → solução, com a dor no motivo.
 * 3. Sistema declarado → objeções (a conversa é sobre trocar).
 * 4. Sem nada disso → a primeira sugestão da etapa.
 */
export function cartaoContextual(pb: Playbook, ctx: ContextoPorta): CartaoContextual | null {
  const pag = (id: string) => pb.paginas.find((p) => p.id === id) ?? null;
  const e = semAcento(ctx.etapa ?? '');
  const semDecisor = !ctx.temNegocio || (!ctx.celular && (!e || ANTES_DO_DECISOR.test(e)));
  if (semDecisor) {
    const p = pag('acesso-decisor');
    if (p) return { pagina: p, titulo: 'Achar o decisor antes de bater na porta', motivo: 'Ainda não sabemos quem decide nesta casa.' };
  }
  const dor = (ctx.gargalo ?? '').trim();
  if (dor) {
    const p = pag('mapa-dor-solucao');
    if (p) return { pagina: p, titulo: 'Mapa dor → solução', motivo: `Dor declarada: ${dor}.` };
  }
  const sistema = (ctx.sistema ?? '').trim();
  if (sistema) {
    const p = pag('objecoes');
    if (p) return { pagina: p, titulo: 'Objeções de quem já tem sistema', motivo: `Usa ${sistema} hoje.` };
  }
  const [primeira] = sugestoesDaEtapa(pb, ctx.etapa);
  return primeira ? { pagina: primeira, titulo: primeira.titulo, motivo: ctx.etapa ? `Etapa: ${ctx.etapa}.` : 'Leitura da etapa.' } : null;
}

/** A última página começada e não terminada (nem marcada como lida). */
export function continuarLendo(pb: Playbook, prog: Progresso): { pagina: PaginaPlaybook; pct: number } | null {
  let melhor: { pagina: PaginaPlaybook; pct: number; em: number } | null = null;
  for (const [id, p] of Object.entries(prog)) {
    if (p.lida || p.pct <= 0 || p.pct >= 95) continue;
    const pagina = pb.paginas.find((x) => x.id === id);
    if (!pagina) continue;
    if (!melhor || p.em > melhor.em) melhor = { pagina, pct: p.pct, em: p.em };
  }
  return melhor ? { pagina: melhor.pagina, pct: melhor.pct } : null;
}

export function rotuloProgresso(p: Progresso[string] | undefined): string | null {
  if (!p) return null;
  if (p.lida) return 'lida ✓';
  if (p.pct > 0) return `${Math.round(p.pct)}%`;
  return null;
}

// ---- "O dono disse…" (handoff "Abas do app", 04/10/2026 — docs/12 §5) ----------------------
// Resposta antes de biblioteca. As objeções saem do TEXTO OFICIAL da página "objecoes" (cada
// <h3> entre aspas, com "O diagnóstico", "A Resposta Direta" e "No follow-up"): nada é escrito
// no app. A fala pronta são as duas primeiras frases da Resposta Direta; "Se ele insistir", as
// seguintes. Mudar a página no Cockpit muda a resposta aqui.
export type Objecao = {
  id: string;
  /** A objeção como o dono diz (o título da seção). */
  pergunta: string;
  /** Rótulo curto para a lista ("O sistema de vocês é caro"). */
  curta: string;
  fala: string;
  seInsistir: string[];
  diagnostico: string | null;
  followUp: string | null;
  paginaId: string;
  ancora: string | null;
};

const textoDe = (html: string) => html
  .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const semAspas = (t: string) => t.replace(/^["“”\s]+|["“”\s]+$/g, '').trim();
/** Frases de um texto corrido (ponto, exclamação ou interrogação seguidos de espaço). */
export function frases(t: string): string[] {
  return (t.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? []).map((f) => f.trim()).filter(Boolean);
}

export function objecoesDoPlaybook(pb: Playbook, paginaId = 'objecoes'): Objecao[] {
  const pagina = pb.paginas.find((p) => p.id === paginaId);
  const html = pagina?.html ?? '';
  if (!html) return [];
  const partes = html.split(/<h3\b/i).slice(1);
  const out: Objecao[] = [];
  for (const parte of partes) {
    const fimTitulo = parte.indexOf('</h3>');
    if (fimTitulo < 0) continue;
    const abre = parte.slice(0, fimTitulo);
    const ancora = (abre.match(/id="([^"]+)"/) ?? [])[1] ?? null;
    const titulo = textoDe(abre.slice(abre.indexOf('>') + 1));
    if (!/^["“]/.test(titulo)) continue;
    const corpo = parte.slice(fimTitulo + 5);
    const item = (rotulo: RegExp) => {
      const m = corpo.match(new RegExp(String.raw`<li>\s*<strong>\s*` + rotulo.source + String.raw`[^<]*</strong>([\s\S]*?)</li>`, 'i'));
      const t = m ? textoDe(m[1]) : '';
      return t ? semAspas(t) : null;
    };
    const resposta = semAspas(textoDe((corpo.match(/<blockquote>([\s\S]*?)<\/blockquote>/i) ?? [])[1] ?? ''));
    if (!resposta) continue;
    const fs = frases(resposta);
    const pergunta = semAspas(titulo);
    // A fala curta aprovada pelo Julyan (04/10/26) mora na própria página, em "Fala pronta" e
    // "Se ele insistir"; sem elas, cai nas frases da Resposta Direta.
    const falaAprovada = item(/Fala pronta:/);
    const insistirAprovado = item(/Se ele insistir:/);
    out.push({
      id: ancora ?? pergunta,
      pergunta,
      curta: pergunta.split(/\s[/]\s|[.]\s/)[0].replace(/[.]$/, ''),
      fala: falaAprovada ?? fs.slice(0, 2).join(' '),
      seInsistir: insistirAprovado ? frases(insistirAprovado) : fs.slice(2, 5),
      diagnostico: item(/O diagn[óo]stico:/),
      followUp: item(/No follow-up/),
      paginaId,
      ancora,
    });
  }
  return out;
}

/** Busca pela palavra do dono ("caro", "sistema", "internet"), sem acento. */
export function buscarObjecoes(lista: Objecao[], termo: string): Objecao[] {
  const palavras = semAcento(termo).split(/\s+/).filter((p) => p.length >= 3);
  if (!palavras.length) return lista;
  const pontos = (o: Objecao) => {
    const titulo = semAcento(o.pergunta);
    const resto = semAcento(`${o.fala} ${o.seInsistir.join(' ')} ${o.diagnostico ?? ''}`);
    return palavras.reduce((n, p) => n + (titulo.includes(p) ? 3 : 0) + (resto.includes(p) ? 1 : 0), 0);
  };
  return lista.map((o) => ({ o, n: pontos(o) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).map((x) => x.o);
}
