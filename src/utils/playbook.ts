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
