// A LINHA DO DIA (pacote "App de rua otimizado · a espinha do dia", §2.2, 28/10/26).
//
// POR QUE EXISTE
// Medido em 28/10 na conta real: o executivo abre o Mapa e fica nele. Tudo que diz como o dia
// está indo — "0 de 6 visitas provadas", "+R$ 250 na próxima venda", "6 atrasados" — mora em
// abas que ele não abre. Às 17h, quando ainda daria para fazer mais duas portas, ninguém lhe
// conta que ele está em 3. A linha do dia é esse número indo ATÉ ele: uma faixa de 48 px logo
// abaixo das lentes, sempre à vista, que muda de tom quando o dia escapa.
//
// O QUE ELA NÃO FAZ
// Não trava nada (regra do Julyan: "obrigatório é avisar, não travar"). Não tem ✕: ela não se
// fecha, porque o dia não se fecha. E NÃO INVENTA NÚMERO — com as visitas provadas não medidas
// (`feitas == null`) ela some, em vez de mostrar um zero que seria mentira.
//
// POR QUE É UM ARQUIVO PURO
// Catorze combinações de estado, hora, plano e pendência não se conferem no olho, num mapa que
// precisa de GPS e de login para abrir. Aqui cada estado é uma chamada de função com um relógio
// passado por argumento — e a suíte (linhaDoDia.teste.ts) percorre o dia inteiro, minuto a
// minuto, sem abrir o app.

/** Altura da faixa, usada também pelo App para empilhar o que vem abaixo dela. */
export const ALTURA_LINHA_DO_DIA = 48;

/* A JORNADA DO FIELD SALES, em horário de Brasília. 8h–18h é o que o funil inverso assume
   (6 visitas e 1 demo por dia); 45 min por porta é o que a rota do dia usa para estimar. */
export const INICIO_DA_RUA = 8;
export const FIM_DA_RUA = 18;
export const MIN_POR_PORTA = 45;
/** "a J mais perto" — o mesmo raio que o mapa já chama de perto (RAIO_REFERENCIA_M). */
export const PERTO_M = 400;
/* QUANTO TEMPO UMA VISITA PROVADA PODE FICAR SEM DESFECHO ANTES DE VIRAR COBRANÇA. Abaixo
   disso ele provavelmente ainda está lá dentro, e a linha diz "Na porta" em tom neutro: avisar
   que o dia escapa no meio de uma conversa com o dono é atrapalhar, não ajudar. */
export const MIN_NA_PORTA = 20;

export type TomDaLinha = 'neutro' | 'ambar' | 'vermelho' | 'verde';

export type EstadoDaLinha =
  | 'pendente'
  | 'na_porta'
  | 'escapando'
  | 'sem_plano'
  | 'atras'
  | 'acima'
  | 'plano'
  | 'no_ritmo'
  | 'fim';

/** O que o toque na linha faz. Tudo acontece NO MAPA: nenhuma delas troca de aba. */
export type AcaoDaLinha = 'desfecho' | 'montar' | 'progresso';

/** Uma visita provada hoje que ainda não tem "Como foi" — vem da mesma fila que o Cockpit cobra. */
export type VisitaSemDesfecho = {
  dealId: string;
  clientId: string | null;
  nome: string;
  /** "HH:MM" em Brasília, ou null quando a fila não soube dizer. */
  hora: string | null;
};

export type EntradaDaLinha = {
  agora: Date;
  /** O mínimo do dia. Mesma fonte do Meu desempenho (promessa da Daily › meta da pessoa › time › 6). */
  meta: number;
  /** Visitas PROVADAS hoje. `null` = não medido: a linha some em vez de mostrar zero. */
  feitas: number | null;
  /** Paradas do plano de hoje, no total (as feitas e as que faltam). */
  noPlano: number;
  /** Das paradas do plano, quantas ainda faltam. */
  faltamNoPlano: number;
  /** Das que faltam, quantas estão a menos de PERTO_M do executivo agora. */
  pertoDasQueFaltam: number;
  /** A visita provada hoje sem desfecho (a mais recente), ou null. */
  semDesfecho: VisitaSemDesfecho | null;
};

export type LinhaDoDia = {
  estado: EstadoDaLinha;
  tom: TomDaLinha;
  titulo: string;
  subtitulo: string | null;
  /** O texto curto da direita. Nunca quebra linha — por isso é sempre curto. */
  direita: string | null;
  acao: AcaoDaLinha;
  /** O que ler em voz alta: o mesmo que a linha diz, sem os glifos de navegação. */
  rotulo: string;
  /** Preenchido só quando `acao === 'desfecho'`: de qual visita se está falando. */
  alvo: VisitaSemDesfecho | null;
};

// ── relógio de Brasília ────────────────────────────────────────────────────────────────────
/* O MESMO DESLOCAMENTO DE 3 HORAS que diaBRT() usa no resto do app. A linha fala do dia de
   trabalho do executivo, que é o dia de Brasília — não o do navegador, que num celular com o
   fuso errado (acontece) daria o dia errado em silêncio. */
const emBrasilia = (agora: Date) => new Date(agora.getTime() - 3 * 3600000);

/** Minutos desde a meia-noite de Brasília. */
export function minutosDoDiaBRT(agora: Date): number {
  const b = emBrasilia(agora);
  return b.getUTCHours() * 60 + b.getUTCMinutes();
}

/** 0 = domingo … 6 = sábado, em Brasília. */
export function diaDaSemanaBRT(agora: Date): number {
  return emBrasilia(agora).getUTCDay();
}

/** "HH:MM" de Brasília. */
export function horaBRT(agora: Date): string {
  const b = emBrasilia(agora);
  return `${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}`;
}

/** Minutos entre duas horas "HH:MM"; null quando alguma não é hora. */
export function minutosEntre(de: string | null, ate: string): number | null {
  const p = (h: string | null) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(h ?? ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = p(de);
  const b = p(ate);
  return a == null || b == null ? null : b - a;
}

// ── ritmo ──────────────────────────────────────────────────────────────────────────────────
/** Quantas portas ele JÁ DEVIA ter feito a esta hora, se o dia fosse distribuído por igual. */
export function esperadoAgora(meta: number, agora: Date): number {
  const jornada = (FIM_DA_RUA - INICIO_DA_RUA) * 60;
  const andado = Math.min(jornada, Math.max(0, minutosDoDiaBRT(agora) - INICIO_DA_RUA * 60));
  return (meta * andado) / jornada;
}

export type Ritmo = 'acima' | 'escapando' | 'no_ritmo' | 'atras' | 'fim';

/**
 * O ritmo do dia, pela regra do §2.2 do pacote.
 *
 * A ORDEM IMPORTA, e ela não é a da tabela do pedido. "Escapando" é uma afirmação sobre o que
 * ainda CABE no relógio (faltam × 45 min contra o tempo até as 18h); "no ritmo" é sobre a média.
 * Às 17h30 com 5 de 6 a média diz que está tudo bem e a conta diz que não dá mais — e quem
 * precisa saber disso é ele, às 17h30, não às 18h01. Por isso a viabilidade vem antes da média.
 */
export function ritmoDoDia(feitas: number, meta: number, agora: Date): Ritmo {
  if (feitas >= meta) return 'acima';
  const restam = FIM_DA_RUA * 60 - minutosDoDiaBRT(agora);
  /* DEPOIS DAS 18h NÃO SE COBRA MAIS. Sem esta saída, `faltam × 45 > 0` seria verdade a noite
     inteira e a linha ficaria vermelha até a meia-noite, cobrando um dia que já acabou. */
  if (restam <= 0) return 'fim';
  if ((meta - feitas) * MIN_POR_PORTA > restam) return 'escapando';
  return feitas >= esperadoAgora(meta, agora) - 1 ? 'no_ritmo' : 'atras';
}

// ── textos ─────────────────────────────────────────────────────────────────────────────────
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
const contagem = (n: number, um: string, varios: string) => `${n} ${plural(n, um, varios)}`;

/** "falta 1" / "faltam 3" — o verbo acompanha o número, como em português. */
const faltamTexto = (n: number) => `${plural(n, 'falta', 'faltam')} ${n}`;

function semDesfechoTexto(v: VisitaSemDesfecho): string {
  return v.hora ? `visita provada às ${v.hora}` : 'visita provada hoje';
}

// ── a linha ────────────────────────────────────────────────────────────────────────────────
/**
 * Monta a linha do dia, ou devolve null quando não há o que dizer.
 *
 * Devolve null em dois casos, os dois de propósito:
 *  1. `feitas == null` — as visitas provadas não foram medidas. Zero inventado vira cobrança
 *     injusta, e é o tipo de erro que o time nota na primeira vez e não esquece mais.
 *  2. fim de semana sem trabalho nenhum — field sales é de segunda a sexta. Quem abrir o app
 *     num sábado para olhar o mapa não leva cobrança junto. Se houver visita, plano ou visita
 *     sem desfecho no sábado, a linha aparece: aí ele está trabalhando mesmo.
 */
export function linhaDoDia(e: EntradaDaLinha): LinhaDoDia | null {
  const { agora, meta, feitas } = e;
  if (feitas == null) return null;
  const dow = diaDaSemanaBRT(agora);
  const diaUtil = dow >= 1 && dow <= 5;
  if (!diaUtil && feitas === 0 && e.noPlano === 0 && !e.semDesfecho) return null;

  const minutos = minutosDoDiaBRT(agora);
  const restamMin = FIM_DA_RUA * 60 - minutos;
  const perto = e.pertoDasQueFaltam;
  const montar = (l: Omit<LinhaDoDia, 'rotulo' | 'alvo'> & { alvo?: VisitaSemDesfecho | null }): LinhaDoDia => ({
    ...l,
    alvo: l.alvo ?? null,
    /* O LEITOR DE TELA LÊ O MESMO QUE A TELA, sem o "›" — que ele soletraria. */
    rotulo: [l.titulo, l.subtitulo, l.direita?.replace(/\s*[›✓]\s*$/, '').trim() || null]
      .filter(Boolean).join('. '),
  });

  // 1. A VISITA SEM DESFECHO VEM NA FRENTE DE TUDO. É o dado mais caro que o app coleta e o
  //    único que se perde se não for registrado no dia.
  if (e.semDesfecho) {
    const desdeAPorta = minutosEntre(e.semDesfecho.hora, horaBRT(agora));
    const aindaLaDentro = desdeAPorta != null && desdeAPorta >= 0 && desdeAPorta < MIN_NA_PORTA;
    if (aindaLaDentro) {
      return montar({
        estado: 'na_porta', tom: 'neutro', acao: 'desfecho', alvo: e.semDesfecho,
        titulo: `Na porta · ${e.semDesfecho.nome}`,
        subtitulo: semDesfechoTexto(e.semDesfecho),
        direita: `${feitas} de ${meta}`,
      });
    }
    /* O NOME VAI SOZINHO NO TÍTULO, e o que falta desce para o subtítulo. A prancha escreve
       "{nome} sem próximo passo" numa linha só — e, visto na bancada a 375 px, "VASCO
       RESTAURANTE E PETISCARIA" come a frase inteira e sobra "…s", que não diz nada. Numa
       faixa de uma linha, o fim do texto é o primeiro a morrer: o que não pode morrer não
       mora lá. Os dois fatos continuam na tela, cada um na sua linha. */
    return montar({
      estado: 'pendente', tom: 'vermelho', acao: 'desfecho', alvo: e.semDesfecho,
      titulo: e.semDesfecho.nome,
      /* "visita das 14:20" e não "visita provada às 14:20": com a frase cheia o subtítulo
         também cortava, e levava a hora junto. Que foi provada já está dito pelo fato de a
         visita existir — o Cheguei é a única coisa que cria uma. */
      subtitulo: `sem próximo passo · ${e.semDesfecho.hora ? `visita das ${e.semDesfecho.hora}` : 'visita de hoje'}`,
      direita: 'Dar ›',
    });
  }

  const ritmo = ritmoDoDia(feitas, meta, agora);
  const faltam = Math.max(0, meta - feitas);

  // 2. O dia não cabe mais no relógio.
  if (ritmo === 'escapando') {
    return montar({
      estado: 'escapando', tom: 'vermelho', acao: 'progresso',
      titulo: `${feitas} de ${meta} · ${faltamTexto(faltam)} e ${plural(restamMin, 'resta', 'restam')} ${restamMin} min`,
      subtitulo: perto > 0
        ? `${perto === 1 ? 'a mais perto cabe' : `as ${perto} mais perto cabem`} até as 18h`
        : 'são 45 min por porta, e o relógio não espera',
      direita: 'Ir ›',
    });
  }

  /* 3. SEM PLANO E SEM VISITA. Depois da primeira visita a linha cala sobre o plano: quem está
        na rua trabalhando não precisa ouvir que não preencheu um formulário de manhã.
        O subtítulo é verdade medida hoje: o Planejamento do Cockpit já marca cada executivo com
        "Sem plano" / "Planejado" / "Em execução". Não promete aviso às 9h, que ainda não existe. */
  if (e.noPlano === 0 && feitas === 0 && minutos < FIM_DA_RUA * 60 && diaUtil) {
    return montar({
      estado: 'sem_plano', tom: 'ambar', acao: 'montar',
      titulo: 'Dia sem plano',
      subtitulo: 'o gestor vê quem planejou',
      direita: 'Montar ›',
    });
  }

  // 4. Atrás da média.
  if (ritmo === 'atras') {
    const horas = Math.max(1, Math.ceil(restamMin / 60));
    return montar({
      estado: 'atras', tom: 'ambar', acao: 'progresso',
      titulo: `${feitas} de ${meta} · ${faltamTexto(faltam)}, ${plural(horas, 'resta', 'restam')} ${horas}h`,
      subtitulo: perto > 0
        ? `${perto} ${plural(perto, 'está', 'estão')} a menos de ${PERTO_M} m`
        : e.faltamNoPlano > 0
          ? `o plano tem ${contagem(e.faltamNoPlano, 'parada', 'paradas')} pela frente`
          : 'nada no plano: o mapa escolhe a próxima',
      direita: 'Ver ›',
    });
  }

  // 5. Passou do mínimo. O mínimo é mínimo, não teto — por isso não existe "dia concluído".
  if (ritmo === 'acima') {
    return montar({
      estado: 'acima', tom: 'verde', acao: 'progresso',
      titulo: `${feitas} de ${meta} ${plural(meta, 'porta', 'portas')}`,
      subtitulo: e.faltamNoPlano > 0
        ? `acima do mínimo · ${contagem(e.faltamNoPlano, 'parada', 'paradas')} ainda no plano`
        : 'acima do mínimo — cada porta a mais conta',
      direita: '✓',
    });
  }

  // 6. Depois das 18h, abaixo do mínimo: o placar, sem cobrança.
  if (ritmo === 'fim') {
    return montar({
      estado: 'fim', tom: 'neutro', acao: 'progresso',
      titulo: `${feitas} de ${meta} ${plural(meta, 'porta', 'portas')} hoje`,
      subtitulo: 'passou das 18h',
      direita: 'Ver ›',
    });
  }

  /* 7. O DIA AINDA NÃO COMEÇOU, E HÁ PLANO. "0 de 6 portas · no ritmo" é verdade e não
        informa nada: ninguém está no ritmo de coisa nenhuma antes da primeira porta. Enquanto
        o placar é zero e o relógio ainda perdoa, a linha mostra o que ele combinou consigo
        mesmo. Vale antes das 8h e vale às 8h30 — assim que a primeira visita entra, ou assim
        que o dia começa a atrasar, os estados de cima tomam o lugar. */
  if (e.noPlano > 0 && (feitas === 0 || minutos < INICIO_DA_RUA * 60)) {
    return montar({
      estado: 'plano', tom: 'neutro', acao: 'progresso',
      titulo: `Plano de hoje · ${contagem(e.noPlano, 'porta', 'portas')}`,
      subtitulo: `mínimo ${meta} no dia`,
      direita: `${e.noPlano} ›`,
    });
  }

  // 8. No ritmo.
  return montar({
    estado: 'no_ritmo', tom: 'neutro', acao: 'progresso',
    titulo: `${feitas} de ${meta} ${plural(meta, 'porta', 'portas')} · no ritmo`,
    subtitulo: perto > 0
      ? `${perto} a menos de ${PERTO_M} m`
      : e.faltamNoPlano > 0
        ? `${contagem(e.faltamNoPlano, 'parada', 'paradas')} no plano pela frente`
        : 'nada no plano: o mapa escolhe a próxima',
    direita: 'Ver ›',
  });
}
