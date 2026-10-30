// O QUE O APP ACABOU DE GRAVAR NO NEGÓCIO (auditoria 29/10/26).
//
// O cartão do lead lê as "armas" (sistema, dor, celular...) de `mapa_negocio`, que vem da cópia
// do HubSpot no Cockpit — e a cópia só alcança na sincronização seguinte. Medido clicando: o
// executivo movia para Conversa com decisor com "Saipos" e "Fila", o HubSpot gravava na hora, e o
// cartão continuava dizendo "Sistema hoje: falta · Maior dor: falta". Parece que não salvou, e a
// reação natural é preencher de novo.
//
// Aqui fica, por negócio, o que a porta única (negocioAcao) confirmou ter gravado. Quem lê a
// cópia sobrepõe com isto até ela alcançar. Vale 3 h (a cópia roda a cada 2 h) e vive só na
// memória do aparelho: recarregar o app volta a confiar só na cópia.

const VALIDADE_MS = 3 * 3600 * 1000;
const PROPS = ['origem_do_lead', 'celular', 'gargalo_operacional', 'nome_do_sistema', 'plano_apresentado', 'valor_de_mrr', 'data_da_reuniao', 'melhor_horario_do_decisor'];

const memoria = new Map<string, { em: number; props: Record<string, string>; etapa?: string }>();
const ouvintes = new Set<() => void>();

/** Chamado pela porta única depois do `ok` do servidor. */
export function registrarGravado(corpo: Record<string, unknown>): void {
  const dealId = corpo.dealId != null ? String(corpo.dealId) : '';
  if (!dealId) return;
  const novas: Record<string, string> = {};
  const p = corpo.propriedades as Record<string, unknown> | undefined;
  if (p && typeof p === 'object') for (const k of PROPS) if (p[k] != null && String(p[k]).trim()) novas[k] = String(p[k]);
  const q = corpo.qualificacao as { nomeDoSistema?: unknown; gargalo?: unknown } | undefined;
  if (q?.nomeDoSistema != null && String(q.nomeDoSistema).trim()) novas.nome_do_sistema = String(q.nomeDoSistema);
  if (q?.gargalo != null && String(q.gargalo).trim()) novas.gargalo_operacional = String(q.gargalo);
  /* a etapa também: o "Limpar funil" manda a etapa que ele acha que o negócio tem como
     etapaEsperada, e com a cópia atrasada o servidor recusaria ("a etapa mudou") */
  const etapa = corpo.op === 'mudar-etapa' && corpo.novaEtapa ? String(corpo.novaEtapa) : undefined;
  if (!Object.keys(novas).length && !etapa) return;
  const antes = memoria.get(dealId);
  const vivo = antes && Date.now() - antes.em < VALIDADE_MS ? antes : undefined;
  memoria.set(dealId, { em: Date.now(), props: { ...(vivo?.props ?? {}), ...novas }, etapa: etapa ?? vivo?.etapa });
  for (const f of ouvintes) f();
}

/** O que foi gravado agora há pouco neste negócio (vazio se nada ou se já venceu). */
export function gravadoAgora(dealId: string | null | undefined): Record<string, string> {
  const r = dealId ? memoria.get(String(dealId)) : undefined;
  return r && Date.now() - r.em < VALIDADE_MS ? r.props : {};
}

/** A etapa para onde o app acabou de mover este negócio (undefined se nada recente). */
export function etapaGravadaAgora(dealId: string | null | undefined): string | undefined {
  const r = dealId ? memoria.get(String(dealId)) : undefined;
  return r && Date.now() - r.em < VALIDADE_MS ? r.etapa : undefined;
}

export function aoGravar(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}
