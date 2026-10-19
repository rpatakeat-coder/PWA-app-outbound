// AS ARMAS DO MAPA (prancha "Mapa do Executivo", Claude Design, 15/10/26 — aprovada pelo Julyan).
//
// "O mapa diz ONDE; a folha diz COM O QUÊ." Regras puras, sem React (testadas em
// armasDoMapa.teste.ts):
// - o bloco "Para entrar": qual dos 9 gatilhos vale para o pino e a frase montada com o dado;
// - a porta sugerida depois do plano (a "chance de vender" do §4b);
// - o contador da meta de recém-abertos no botão da lente (§3);
// - a linha dos clientes Takeat perto (§5).
// Regra de texto (PLAYBOOK-gatilhos.md): dado ausente = trecho omitido. Nunca "—", nunca campo
// vazio, nunca preço, desconto ou prazo prometido, nunca concorrente pelo nome na fala.

import type { Familia, Temperatura } from './pinoP2';

// ── As 9 páginas do Playbook (v1, aprovadas em 15/10/26) ─────────────────────────────────────
// O texto oficial mora no Playbook (cockpit_config.playbook, página "gatilhos-do-mapa"); esta é a
// cópia que vai no app para funcionar sem sinal e antes da primeira carga. Quando o Playbook traz
// o gatilho, vale o do Playbook (editar o texto não exige mudar código).

export type GatilhoId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type PaginaGatilho = { id: GatilhoId; titulo: string; fala: string; insistir: { quando: string; texto: string }; marcar: string; extra?: string };

export const PAGINAS_GATILHO: Record<GatilhoId, PaginaGatilho> = {
  1: { id: 1, titulo: 'Prazo estourou', fala: '{decisor}, passei para a gente fechar o próximo passo. Qual dia desta semana fica bom para você?',
    insistir: { quando: 'ainda estou pensando', texto: 'Tranquilo. O que falta para você decidir? Se for uma dúvida minha, resolvo agora; se for de outra pessoa, marco com ela também.' },
    marcar: 'Como foi → Falei com quem decide · E agora → Reunião em 3 dias ou Reunião em 1 semana' },
  2: { id: 2, titulo: 'Dono está agora', fala: '{decisor}, sei que este é o seu horário mais tranquilo. Cinco minutos para eu te mostrar {proximo}?',
    insistir: { quando: 'agora não dá', texto: 'Sem problema. Que hora amanhã você está aqui? Eu volto nesse horário.' },
    marcar: 'Como foi → Falei com quem decide (ou Quem decide não estava) · E agora → conforme a conversa',
    extra: 'Se ele disser outro horário, corrija ali mesmo: o novo horário vai para o Cockpit e passa a valer para todos.' },
  3: { id: 3, titulo: 'Fechar depois da demo', fala: '{decisor}, trouxe a proposta da demo. Quer ver de novo a parte que mais pesou para você?',
    insistir: { quando: 'está caro', texto: 'Entendo. Vamos olhar juntos o que você usa de verdade no dia a dia. Se der para ajustar o plano, eu ajusto agora.' },
    marcar: 'E agora → Apresentei agora (vai para Negociação) ou Reunião amanhã' },
  4: { id: 4, titulo: 'Achar quem decide', fala: 'Oi! Quem cuida do sistema e do caixa aqui? Ele costuma estar a que horas?',
    insistir: { quando: 'o dono não está', texto: 'Sem problema. Me passa o nome e o melhor horário dele? Volto nessa hora; é rápido.' },
    marcar: 'Como foi → Quem decide não estava (abre nome e horário do decisor, que vão para o Cockpit)' },
  5: { id: 5, titulo: 'O dono disse…', fala: 'Da última vez você falou de {dor}. Posso te mostrar em 2 minutos como isso funciona com a gente?',
    insistir: { quando: 'já tenho sistema', texto: 'Claro, e não precisa trocar tudo hoje. Só quero que você veja a diferença em {dor}; depois você decide com calma.' },
    marcar: 'E agora → Apresentei agora se mostrou; senão Reunião em 3 dias',
    extra: 'Para objeções específicas, abra "O dono disse…" no Playbook.' },
  6: { id: 6, titulo: 'Casa recém-aberta', fala: 'Parabéns pela casa nova! Como vocês estão anotando os pedidos e fechando o caixa neste começo?',
    insistir: { quando: 'ainda estamos nos organizando', texto: 'Este é o melhor momento: começar certo é mais fácil do que trocar depois. Posso deixar meu contato e voltar quando você tiver 15 minutos?' },
    marcar: 'Como foi → conforme a conversa · peça o celular do dono (é o único campo que o recém-aberto não tem) · E agora → Reunião amanhã ou Voltar outro dia',
    extra: 'Se houver referência: "Aqui do lado, o {cliente} usa a Takeat. Se quiser, pergunte para eles como é."' },
  7: { id: 7, titulo: 'Casa cheia', fala: 'Vi que vocês são muito bem avaliados. Com esse movimento, como fica o pedido no horário de pico?',
    insistir: { quando: 'dá conta', texto: 'Que bom! Então o que mais toma o seu tempo hoje: o caixa, o cardápio ou o delivery?' },
    marcar: 'Como foi → conforme a conversa. Ao registrar a visita, a conta vira lead seu.' },
  8: { id: 8, titulo: 'Ex-cliente', fala: 'Muita coisa mudou desde que vocês saíram. Posso te mostrar em 5 minutos o que resolvemos sobre {motivo}?',
    insistir: { quando: 'não quero voltar', texto: 'Entendo. Posso só perguntar o que faria você voltar? Fica registrado e eu não insisto.' },
    marcar: 'Como foi → conforme a conversa · E agora → Voltar outro dia ou Sem interesse (pede o motivo)' },
  9: { id: 9, titulo: 'Cliente em queda', fala: 'Vim ver como está o movimento. Tem algo no sistema que eu possa ajustar para vocês agora?',
    insistir: { quando: 'está tudo certo', texto: 'Ótimo. Se aparecer qualquer coisa, me chama direto neste número.' },
    marcar: 'Como foi → conforme a conversa · E agora → Voltar outro dia. Problema relatado vira tarefa para o suporte, pelo caminho de hoje.' },
};

/** Preenche {campos}; o trecho com campo ausente sai inteiro (a frase antes da vírgula, o "de X"). */
export function preencherFala(modelo: string, campos: Record<string, string | null | undefined>): string {
  let t = modelo;
  // "{decisor}, passei…" sem decisor: some o vocativo e a frase começa em maiúscula
  t = t.replace(/^\{(\w+)\},\s*(.)/, (m, k: string, ini: string) => (campos[k]?.trim() ? m : ini.toUpperCase()));
  // "te mostrar {proximo}?" sem próximo passo: "te mostrar como funciona?"
  t = t.replace(/\{proximo\}/g, () => campos.proximo?.trim() || 'como funciona');
  t = t.replace(/\{(\w+)\}/g, (_m, k: string) => campos[k]?.trim() ?? '');
  return t.replace(/\s{2,}/g, ' ').trim();
}

// ── Horário do decisor ───────────────────────────────────────────────────────────────────────
// As faixas da ficha de rua (fichaDeRua.HORARIOS) e o texto livre do "Outro horário".
const FAIXAS: Record<string, [number, number]> = {
  cedo_antes_10h: [6 * 60, 10 * 60], '10h_11h30': [10 * 60, 11 * 60 + 30],
  '14h30_17h30': [14 * 60 + 30, 17 * 60 + 30], noite_apos_17h: [17 * 60, 23 * 60],
};
const FALA_FAIXA: Record<string, string> = {
  cedo_antes_10h: 'antes das 10h', '10h_11h30': 'das 10h às 11h30', '14h30_17h30': 'das 14h30 às 17h30', noite_apos_17h: 'depois das 17h',
};
const hm = (h: string, m?: string) => Number(h) * 60 + (m ? Number(m) : 0);
const textoHora = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;

/** A janela do decisor em minutos do dia (Brasília), da faixa ou do texto livre ("14h às 17h", "das 9 às 11"). */
export function janelaDoDecisor(horario: string | null | undefined): [number, number] | null {
  const v = (horario ?? '').trim();
  if (!v) return null;
  if (FAIXAS[v]) return FAIXAS[v];
  const t = v.toLowerCase().replace(/\s+/g, ' ');
  const m = t.match(/(\d{1,2})(?:[:h](\d{2}))?\s*h?\s*(?:às|as|a|-|–|até|ate)\s*(\d{1,2})(?:[:h](\d{2}))?/);
  if (m) {
    const a = hm(m[1], m[2]); const b = hm(m[3], m[4]);
    if (a < b && b <= 24 * 60) return [a, b];
  }
  const depois = t.match(/(?:depois|ap[oó]s|a partir)\s*(?:das?|de)?\s*(\d{1,2})(?:[:h](\d{2}))?/);
  if (depois) return [hm(depois[1], depois[2]), 23 * 60];
  const antes = t.match(/antes\s*(?:das?|de)?\s*(\d{1,2})(?:[:h](\d{2}))?/);
  if (antes) return [6 * 60, hm(antes[1], antes[2])];
  return null;
}

/** "das 14h às 17h" para o motivo; o texto livre sem janela legível vai como foi escrito. */
export function horarioParaFrase(horario: string | null | undefined): string {
  const v = (horario ?? '').trim();
  if (!v || v === 'outro') return '';
  if (FALA_FAIXA[v]) return FALA_FAIXA[v];
  const j = janelaDoDecisor(v);
  if (j) return j[1] >= 23 * 60 ? `depois das ${textoHora(j[0])}` : j[0] <= 6 * 60 ? `antes das ${textoHora(j[1])}` : `das ${textoHora(j[0])} às ${textoHora(j[1])}`;
  return v;
}

/** Minutos do dia em Brasília (UTC-3, sem horário de verão). */
export function minutoBRT(agora: Date): number {
  const d = new Date(agora.getTime() - 3 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Decisão 4: "costuma estar agora" = dentro da janela, ou a janela começa em até 30 min. */
export function decisorEstaAgora(horario: string | null | undefined, agora: Date): boolean {
  const j = janelaDoDecisor(horario);
  if (!j) return false;
  const m = minutoBRT(agora);
  return m >= j[0] - 30 && m < j[1];
}

// ── O gatilho do pino ────────────────────────────────────────────────────────────────────────
// Códigos canônicos das etapas (fichaDeRua.ETAPA).
const PROSPECCAO = '1395880469';
const VISITA = '1396005401';
const DEMO = '1395880471';
const NEGOCIACAO = '1395880472';

export type DadosDaArma = {
  familia: Familia;
  temp?: Temperatura | null;
  /** Etiqueta "cobrar" do pino (SLA da etapa estourado). */
  cobrar?: boolean;
  /** Dias na etapa (o snapshot do Cockpit): o "há N dias" do gatilho 1. */
  diasNaEtapa?: number | null;
  etapaCodigo?: string | null;
  decisor?: string | null;
  horario?: string | null;
  mrr?: number | null;
  /** O próximo passo combinado (a tarefa do HubSpot), em minúsculas, para a fala 2. */
  proximo?: string | null;
  sistema?: string | null;
  dor?: string | null;
  abertoHa?: number | null;
  nota?: number | null;
  avaliacoes?: number | null;
  motivoSaida?: string | null;
  /** Motivo da queda como chega do dado (clientes-sync). */
  queda?: string | null;
  /** O cliente Takeat mais perto (a referência da fala 6). */
  clientePerto?: string | null;
  agora: Date;
};

export type Arma = { gatilho: GatilhoId; kicker: 'PARA ENTRAR' | 'PARA A VISITA'; motivo: string; fala: string; referencia?: string | null };

const nome1 = (s: string | null | undefined) => (s ?? '').trim().split(/\s+/)[0] ?? '';
const reais = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const notaTexto = (n: number) => n.toFixed(1).replace('.', ',');

/** "faturamento -35% no bimestre" → "Faturamento caindo"; "sem comanda há 9 dias" → "Sem comanda há 9 dias". */
export function motivoDaQueda(q: string | null | undefined): string {
  const t = (q ?? '').trim();
  const dias = t.match(/há (\d+) dias/);
  if (dias) return `Sem comanda há ${dias[1]} dias`;
  return 'Faturamento caindo';
}

/** O gatilho que vale para o pino, na ordem da lista (1 › 9). null = nenhum dado: o bloco não aparece. */
export function escolherArma(d: DadosDaArma, paginas: Partial<Record<GatilhoId, Pick<PaginaGatilho, 'fala'>>> = PAGINAS_GATILHO): Arma | null {
  const fala = (g: GatilhoId, campos: Record<string, string | null | undefined> = {}) =>
    preencherFala((paginas[g] ?? PAGINAS_GATILHO[g]).fala, campos);
  const decisor = nome1(d.decisor);
  const horario = horarioParaFrase(d.horario);
  const agora = !!d.horario && decisorEstaAgora(d.horario, d.agora);

  if (d.familia === 'lead' && d.temp !== 'X') {
    if (d.cobrar) {
      const n = d.diasNaEtapa;
      return { gatilho: 1, kicker: 'PARA ENTRAR', motivo: n && n > 0 ? `Prazo da etapa estourou há ${n} ${n === 1 ? 'dia' : 'dias'}: feche a data hoje` : 'Prazo da etapa estourou: feche a data hoje', fala: fala(1, { decisor }) };
    }
    const fechar = (d.etapaCodigo === DEMO || d.etapaCodigo === NEGOCIACAO) && (d.mrr ?? 0) > 0;
    if (agora) {
      // 2 e 3 juntos: o motivo junta os dois e a fala é a do 3
      if (fechar) return { gatilho: 3, kicker: 'PARA ENTRAR', motivo: `Proposta de ${reais(d.mrr!)} pronta · ${decisor || 'quem decide'} está ${horario}`, fala: fala(3, { decisor }) };
      const quem = decisor ? `${decisor} costuma estar agora` : 'Quem decide costuma estar agora';
      return { gatilho: 2, kicker: 'PARA ENTRAR', motivo: `${quem} (${horario})${d.proximo ? ` · ${d.proximo}` : ''}`, fala: fala(2, { decisor, proximo: d.proximo }) };
    }
    if (fechar) {
      return { gatilho: 3, kicker: 'PARA ENTRAR', motivo: `Proposta de ${reais(d.mrr!)} pronta${decisor && horario ? ` · ${decisor} está ${horario}` : ''}`, fala: fala(3, { decisor }) };
    }
    const antesDoDecisor = !d.etapaCodigo || d.etapaCodigo === PROSPECCAO || d.etapaCodigo === VISITA;
    if (antesDoDecisor && !decisor) {
      return { gatilho: 4, kicker: 'PARA ENTRAR', motivo: '1ª visita, decisor desconhecido: ache quem decide antes de apresentar', fala: fala(4) };
    }
    const dor = (d.dor ?? '').trim();
    if (dor) {
      const sistema = (d.sistema ?? '').trim();
      const usa = sistema && !/^(nenhum|outro)$/i.test(sistema) ? `Usa ${sistema} e reclama de ${dor.toLowerCase()}` : `Reclama de ${dor.toLowerCase()}`;
      return { gatilho: 5, kicker: 'PARA ENTRAR', motivo: usa, fala: fala(5, { dor: dor.toLowerCase() }) };
    }
    return null;
  }
  if (d.familia === 'rec' && d.abertoHa != null) {
    const n = d.abertoHa;
    const quando = n === 0 ? 'Abriu hoje' : `Abriu há ${n} ${n === 1 ? 'dia' : 'dias'}`;
    return { gatilho: 6, kicker: 'PARA ENTRAR', motivo: `${quando}: ainda está escolhendo sistema`, fala: fala(6),
      referencia: d.clientePerto ? `Aqui do lado, o ${d.clientePerto} usa a Takeat. Se quiser, pergunte para eles como é.` : null };
  }
  if (d.familia === 'av' && d.nota != null) {
    const qtd = d.avaliacoes ? ` com ${d.avaliacoes.toLocaleString('pt-BR')} avaliações` : ' no Google';
    return { gatilho: 7, kicker: 'PARA ENTRAR', motivo: `★ ${notaTexto(d.nota)}${qtd}: casa cheia`, fala: fala(7) };
  }
  if (d.familia === 'ex' && d.motivoSaida?.trim()) {
    const m = d.motivoSaida.trim().toLowerCase();
    return { gatilho: 8, kicker: 'PARA ENTRAR', motivo: `Saiu por ${m}`, fala: fala(8, { motivo: m }) };
  }
  if (d.familia === 'cli' && d.queda) {
    return { gatilho: 9, kicker: 'PARA A VISITA', motivo: `${motivoDaQueda(d.queda)}: visita de cuidado, não de venda`, fala: fala(9) };
  }
  return null;
}

// ── A porta sugerida depois do plano (§4b) ───────────────────────────────────────────────────

export type Candidata = {
  id: string;
  nome: string;
  distanciaM: number;
  familia: Familia;
  temp?: Temperatura | null;
  abertoHa?: number | null;
  nota?: number | null;
  cobrar?: boolean;
  decisorAgora?: boolean;
  temDor?: boolean;
  /** Clientes Takeat a até 400 m. */
  clientesPerto?: number;
};

export type Parcela = { texto: string; peso: number };
export type Sugestao = { c: Candidata; pontos: number; parcelas: Parcela[] };

/** Até onde a porta sugerida pode estar (1 km, a pé). */
export const RAIO_SUGESTAO_M = 1000;

export function pontuar(c: Candidata): Sugestao {
  const p: Parcela[] = [];
  if (c.familia === 'rec' && c.abertoHa != null) {
    if (c.abertoHa <= 30) p.push({ texto: `Casa nova (${c.abertoHa} ${c.abertoHa === 1 ? 'dia' : 'dias'})`, peso: 3 });
    else if (c.abertoHa <= 60) p.push({ texto: `Casa nova (${c.abertoHa} dias)`, peso: 2 });
  }
  if (c.decisorAgora) p.push({ texto: 'Dono costuma estar agora', peso: 3 });
  if (c.cobrar) p.push({ texto: 'Prazo da etapa estourou', peso: 2 });
  if (c.familia === 'lead' && c.temp === 'Q') p.push({ texto: 'Lead quente seu', peso: 2 });
  if (c.familia === 'lead' && c.temp === 'M') p.push({ texto: 'Lead morno seu', peso: 1 });
  if (c.temDor) p.push({ texto: 'Dor registrada', peso: 1 });
  if ((c.clientesPerto ?? 0) > 0) p.push({ texto: `${c.clientesPerto} ${c.clientesPerto === 1 ? 'cliente Takeat perto' : 'clientes Takeat perto'}`, peso: 1 });
  const menos = Math.floor(Math.max(0, c.distanciaM) / 300);
  const pontos = p.reduce((s, x) => s + x.peso, 0) - menos;
  return { c, pontos, parcelas: p };
}

/** A melhor porta a até 1 km e a 2ª opção. Empate: a mais perto. Sem nenhuma candidata: null. */
export function portaSugerida(cands: Candidata[]): { melhor: Sugestao; segunda: Sugestao | null } | null {
  const ord = cands.filter((c) => c.distanciaM <= RAIO_SUGESTAO_M).map(pontuar)
    .sort((a, b) => b.pontos - a.pontos || a.c.distanciaM - b.c.distanciaM);
  return ord.length ? { melhor: ord[0], segunda: ord[1] ?? null } : null;
}

/** "Casa nova (9 dias) · 220 m · 3 clientes Takeat perto": as duas maiores parcelas e a distância. */
export function escolhidaPor(s: Sugestao, distancia: string | null): string {
  const top = [...s.parcelas].sort((a, b) => b.peso - a.peso).slice(0, 2).map((x) => x.texto);
  if (distancia) top.splice(Math.min(1, top.length), 0, distancia);
  return top.join(' · ');
}

/** A 2ª opção numa linha: "Ou: Cantina Bento, lead morno seu, a 400 m". */
export function segundaOpcao(s: Sugestao, distancia: string | null): string {
  const c = s.c;
  const quem = c.familia === 'rec' ? `recém-aberto há ${c.abertoHa} ${c.abertoHa === 1 ? 'dia' : 'dias'}`
    : c.familia === 'av' && c.nota != null ? `mais avaliado (★ ${notaTexto(c.nota)})`
      : c.temp === 'Q' ? 'lead quente seu' : c.temp === 'M' ? 'lead morno seu' : 'lead frio seu';
  return `Ou: ${c.nome}, ${quem}${distancia ? `, a ${distancia}` : ''}`;
}

// ── O contador da meta (§3) ──────────────────────────────────────────────────────────────────

export const META_NOVOS_SEMANA = 5;
export type EstiloMeta = 'zero' | 'meio' | 'batida' | 'falta';

/** Sexta a partir das 12h (Brasília) até o fim de domingo: a semana está acabando (decisão 1). */
export function fimDaSemana(agora: Date): boolean {
  const d = new Date(agora.getTime() - 3 * 3600000);
  const dia = d.getUTCDay();
  return dia === 6 || dia === 0 || (dia === 5 && d.getUTCHours() >= 12);
}

/** O que vai na pílula do botão Recém-abertos. */
export function contadorDaMeta(n: number, agora: Date): { texto: string; estilo: EstiloMeta } {
  const meta = META_NOVOS_SEMANA;
  if (n >= meta) return { texto: `${n}/${meta} ✓`, estilo: 'batida' };
  if (fimDaSemana(agora)) return { texto: `faltam ${meta - n}`, estilo: 'falta' };
  return { texto: `${n}/${meta}`, estilo: n === 0 ? 'zero' : 'meio' };
}

/** A linha âmbar da folha, só no fim da semana abaixo da meta. */
export function linhaDaMetaNaFolha(n: number, pertoEm1km: number | null, agora: Date): string | null {
  if (n >= META_NOVOS_SEMANA || !fimDaSemana(agora)) return null;
  const falta = META_NOVOS_SEMANA - n;
  const perto = pertoEm1km && pertoEm1km > 0 ? `, e ${pertoEm1km} ${pertoEm1km === 1 ? 'está' : 'estão'} a menos de 1 km` : '';
  return `Recém-abertos: ${n} de ${META_NOVOS_SEMANA} na semana. ${falta === 1 ? 'Falta 1' : `Faltam ${falta}`}${perto}.`;
}

/** "N visitas hoje · mínimo 6" (passa de 6 normalmente; nunca "dia concluído"). */
export function visitasDoDia(feitas: number | null, minimo: number): string | null {
  if (feitas == null) return null;
  return `${feitas} ${feitas === 1 ? 'visita' : 'visitas'} hoje · mínimo ${minimo}`;
}

// ── Clientes Takeat perto (§5) ───────────────────────────────────────────────────────────────

export const RAIO_REFERENCIA_M = 400;
export type Referencia = { id: string; nome: string; distanciaM: number };

/** "2 clientes Takeat a 300 m · Café Odara e Bar do Zé" (até 2 nomes, o mais perto primeiro). */
export function linhaDeReferencia(refs: Referencia[]): string | null {
  const r = refs.filter((x) => x.distanciaM <= RAIO_REFERENCIA_M).sort((a, b) => a.distanciaM - b.distanciaM);
  if (!r.length) return null;
  const longe = Math.max(100, Math.ceil(r[Math.min(r.length, 2) - 1].distanciaM / 100) * 100);
  const nomes = r.slice(0, 2).map((x) => x.nome);
  return `${r.length} ${r.length === 1 ? 'cliente Takeat' : 'clientes Takeat'} a ${longe} m · ${nomes.join(' e ')}`;
}

/** Distância em metros entre dois pontos (haversine). */
export function metros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}

// ── O lugar do Google já é nosso? (decisão 3) ────────────────────────────────────────────────

const TIRAR = new Set(['restaurante', 'bar', 'ltda', 'me', 'eireli', 'lanchonete', 'pizzaria', 'cia', 'e', 'de', 'do', 'da', 'dos', 'das']);
/** Nome normalizado: minúsculas, sem acento e sem "restaurante", "bar", "ltda", "me", "eireli". */
export function nomeNormalizado(n: string | null | undefined): string {
  return String(n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !TIRAR.has(w)).join(' ');
}

/** Similaridade 0–1 pelo Dice dos bigramas do nome normalizado (≥ 0,8 casa). */
export function similaridade(a: string | null | undefined, b: string | null | undefined): number {
  const x = nomeNormalizado(a).replace(/ /g, '');
  const y = nomeNormalizado(b).replace(/ /g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bi = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
  const bx = bi(x); const by = bi(y);
  let comum = 0;
  for (const [k, n] of bx) comum += Math.min(n, by.get(k) ?? 0);
  const tot = Math.max(1, x.length - 1 + y.length - 1);
  return (2 * comum) / tot;
}
