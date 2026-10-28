// Teste da linha do dia (pacote "a espinha do dia", §2.2, 28/10/26).
//
// Rode com:  npx tsx src/utils/linhaDoDia.teste.ts
//
// A linha tem nove estados e eles dependem do RELÓGIO. No app, conferir isso no olho exigiria
// esperar o dia passar. Aqui o relógio é argumento, então a suíte percorre o dia inteiro de
// minuto em minuto e cobra as invariantes que nenhum print pegaria: que a cobrança some depois
// das 18h, que a visita sem desfecho vence todo o resto, e que o texto da direita nunca cresce
// a ponto de quebrar numa tela de 375 px.
import {
  ALTURA_LINHA_DO_DIA, FIM_DA_RUA, INICIO_DA_RUA, MIN_NA_PORTA, MIN_POR_PORTA, PERTO_M,
  diaDaSemanaBRT, esperadoAgora, horaBRT, linhaDoDia, minutosDoDiaBRT, minutosEntre, ritmoDoDia,
  type EntradaDaLinha, type LinhaDoDia,
} from './linhaDoDia';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

/** Uma quarta-feira. O horário vem em Brasília, que é o fuso de que a linha fala. */
const as = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00-03:00`);
const SABADO = (hhmm: string) => new Date(`2026-10-31T${hhmm}:00-03:00`);

const base = (p: Partial<EntradaDaLinha> = {}): EntradaDaLinha => ({
  agora: as('10:00'), meta: 6, feitas: 0, noPlano: 6, faltamNoPlano: 6, pertoDasQueFaltam: 0,
  semDesfecho: null, ...p,
});
const linha = (p: Partial<EntradaDaLinha> = {}) => linhaDoDia(base(p));
const estado = (p: Partial<EntradaDaLinha> = {}) => linha(p)?.estado ?? null;

// ── 1. o relógio é o de Brasília ───────────────────────────────────────────────────────────
ok(minutosDoDiaBRT(as('08:00')) === 480, 'oito da manhã de Brasília são 480 minutos');
ok(horaBRT(as('17:05')) === '17:05', 'horaBRT devolve a hora de Brasília');
/* MEIA-NOITE E MEIA DE BRASÍLIA AINDA É O DIA DE ONTEM EM UTC. Se a linha lesse o relógio do
   navegador em UTC, às 22h de Brasília ela já estaria no dia seguinte e zeraria o placar. */
ok(minutosDoDiaBRT(new Date('2026-10-29T01:30:00Z')) === 22 * 60 + 30, '01:30 UTC são 22:30 em Brasília');
ok(diaDaSemanaBRT(as('10:00')) === 3 && diaDaSemanaBRT(SABADO('10:00')) === 6, 'o dia da semana é o de Brasília');
ok(minutosEntre('14:20', '14:35') === 15 && minutosEntre(null, '14:35') === null, 'minutosEntre conta e aceita não saber');

// ── 2. o esperado cresce com o dia ─────────────────────────────────────────────────────────
ok(esperadoAgora(6, as('07:00')) === 0, 'antes das 8h não se espera porta nenhuma');
ok(esperadoAgora(6, as('13:00')) === 3, 'na metade da jornada, metade da meta');
ok(esperadoAgora(6, as('18:00')) === 6 && esperadoAgora(6, as('21:00')) === 6, 'depois das 18h o esperado não passa da meta');

// ── 3. não medido não vira zero ────────────────────────────────────────────────────────────
ok(linha({ feitas: null }) === null, 'visitas provadas não medidas: a linha some em vez de mostrar 0');

// ── 4. fim de semana ───────────────────────────────────────────────────────────────────────
ok(linhaDoDia(base({ agora: SABADO('10:00'), noPlano: 0, faltamNoPlano: 0 })) === null,
  'sábado parado não cobra ninguém');
ok(linhaDoDia(base({ agora: SABADO('10:00'), feitas: 2, noPlano: 0, faltamNoPlano: 0 })) !== null,
  'sábado com visita feita mostra o placar: ele está trabalhando');

// ── 5. a visita sem desfecho vence tudo ────────────────────────────────────────────────────
const VASCO = { dealId: '123', clientId: 'c1', nome: 'VASCO RESTAURANTE', hora: '14:20' };
ok(estado({ agora: as('14:30'), semDesfecho: VASCO, feitas: 1 }) === 'na_porta',
  `menos de ${MIN_NA_PORTA} min depois do Cheguei ele ainda está lá dentro: "Na porta", em tom neutro`);
ok(estado({ agora: as('14:50'), semDesfecho: VASCO, feitas: 1 }) === 'pendente',
  'passados 30 min sem desfecho, a linha cobra');
/* ÀS 17h40 COM 1 DE 6 O DIA ESTÁ ESCAPANDO — e mesmo assim a pendência vem na frente, porque
   a visita que já aconteceu se perde hoje e a porta que não aconteceu se faz amanhã. */
ok(estado({ agora: as('17:40'), semDesfecho: VASCO, feitas: 1 }) === 'pendente',
  'pendente vence escapando');
ok(linha({ agora: as('14:30'), semDesfecho: VASCO })?.tom === 'neutro', 'na porta é neutro: não se atrapalha quem está vendendo');
ok(linha({ agora: as('14:50'), semDesfecho: VASCO })?.tom === 'vermelho', 'pendente é vermelho');
ok(linha({ agora: as('14:50'), semDesfecho: VASCO })?.alvo?.dealId === '123', 'a linha leva junto DE QUAL visita está falando');
ok(linha({ agora: as('14:50'), semDesfecho: VASCO })?.acao === 'desfecho', 'o toque abre o desfecho daquela visita');
ok(/14:20/.test(linha({ agora: as('14:50'), semDesfecho: VASCO })?.subtitulo ?? ''), 'o subtítulo diz a hora da visita');
ok(!/null|undefined|às \b/.test(
  linha({ agora: as('14:50'), semDesfecho: { ...VASCO, hora: null } })?.subtitulo ?? 'x'),
  'sem a hora, o subtítulo não mostra buraco');
/* O FIM DA LINHA É O PRIMEIRO A MORRER. Numa faixa de uma linha o título corta no fim, e
   "VASCO RESTAURANTE E PETISCARIA sem próximo passo" vira "VASCO RESTAURANTE E PETISCARIA s…" —
   some exatamente o que a linha tinha a dizer. O que não pode sumir não mora no fim. */
ok(linha({ agora: as('14:50'), semDesfecho: VASCO })?.titulo === VASCO.nome,
  'pendente: o título é só o nome, que pode cortar sem perder o recado');
ok(/^sem próximo passo · /.test(linha({ agora: as('14:50'), semDesfecho: VASCO })?.subtitulo ?? ''),
  'e o que falta vem no começo do subtítulo, onde não corta');
/* O SUBTÍTULO TAMBÉM TEM FIM. Medido na bancada a 375 px: com "visita provada às 14:20" o
   subtítulo cortava em "às 14:…" e levava a hora junto — e a hora é o que deixa ele reconhecer
   de qual visita se fala. 38 caracteres é o que coube. */
ok((linha({ agora: as('14:50'), semDesfecho: VASCO })?.subtitulo ?? '').length <= 38,
  'o subtítulo de pendente cabe em 375 px sem cortar a hora');

// ── 6. escapando vem antes de "no ritmo" ───────────────────────────────────────────────────
/* O caso que motivou a ordem: 17h30, 5 de 6. A MÉDIA diz que está tudo bem (esperado 5,7, e a
   regra do pedido perdoa 1). A CONTA diz que a porta que falta precisa de 45 min e só restam
   30. Quem precisa saber disso é ele, às 17h30. */
ok(ritmoDoDia(5, 6, as('17:30')) === 'escapando', '17h30 com 5 de 6: não cabe mais, e a linha diz');
ok(5 >= esperadoAgora(6, as('17:30')) - 1, 'e a média, sozinha, teria dito "no ritmo" — é por isso que a ordem importa');
ok(ritmoDoDia(5, 6, as('17:10')) === 'no_ritmo', '17h10 com 5 de 6 ainda cabe: 50 min para uma porta de 45');
ok(ritmoDoDia(2, 6, as('16:00')) === 'escapando', '16h com 2 de 6: 4 portas em 120 min não cabem');
ok(ritmoDoDia(3, 6, as('15:00')) === 'atras', '15h com 3 de 6 ainda cabe, mas está abaixo da média');
ok(ritmoDoDia(4, 6, as('15:00')) === 'no_ritmo', '15h com 4 de 6 está no ritmo');
ok(ritmoDoDia(6, 6, as('09:00')) === 'acima' && ritmoDoDia(7, 6, as('23:00')) === 'acima',
  'bateu a meta é "acima" a qualquer hora — inclusive depois das 18h');

// ── 7. depois das 18h a linha não cobra mais ───────────────────────────────────────────────
ok(ritmoDoDia(1, 6, as('18:01')) === 'fim', 'às 18h01 o dia acabou: nada de vermelho');
ok(estado({ agora: as('21:00'), feitas: 2 }) === 'fim', 'às 21h a linha é só o placar');
ok(linha({ agora: as('21:00'), feitas: 2 })?.tom === 'neutro', 'e o tom é neutro: cobrar às 21h não traz visita nenhuma');
/* A INVARIANTE, varrida minuto a minuto: em nenhum minuto depois das 18h a linha fica vermelha
   ou âmbar por causa do ritmo. Sem esta varredura, bastaria um `>=` virar `>` para o app passar
   a noite inteira vermelho no bolso de oito pessoas. */
{
  let ruins = 0;
  for (let m = FIM_DA_RUA * 60; m < 24 * 60; m++) {
    const agora = as(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    for (let f = 0; f < 6; f++) {
      const l = linhaDoDia(base({ agora, feitas: f, noPlano: 6, faltamNoPlano: 6 - f }));
      if (l && (l.tom === 'vermelho' || l.tom === 'ambar')) ruins++;
    }
  }
  ok(ruins === 0, `nenhum dos ${(24 - FIM_DA_RUA) * 60 * 6} minutos-placar depois das 18h cobra o executivo`);
}

// ── 8. sem plano ───────────────────────────────────────────────────────────────────────────
ok(estado({ agora: as('08:30'), noPlano: 0, faltamNoPlano: 0 }) === 'sem_plano', 'manhã sem plano e sem visita: "Dia sem plano"');
ok(linha({ agora: as('08:30'), noPlano: 0, faltamNoPlano: 0 })?.acao === 'montar', 'e o toque monta o dia — um toque, não uma aba');
ok(estado({ agora: as('11:00'), noPlano: 0, faltamNoPlano: 0, feitas: 2 }) !== 'sem_plano',
  'quem já fez 2 visitas não leva "sem plano": ele está na rua, não faltou com nada');
ok(estado({ agora: as('19:00'), noPlano: 0, faltamNoPlano: 0 }) === 'fim', 'depois das 18h não se cobra plano');
/* O SUBTÍTULO NÃO PODE PROMETER O QUE O COCKPIT NÃO FAZ. O desenho pedia "às 9h00 o gestor vê",
   e esse aviso das 9h ainda não existe em lugar nenhum. O que existe, medido em 28/10, é o selo
   "Sem plano" no Planejamento. A linha diz só isso. */
ok(!/9h|09:00|avisad/.test(linha({ agora: as('08:30'), noPlano: 0, faltamNoPlano: 0 })?.subtitulo ?? ''),
  'a linha não promete o aviso das 9h, que ainda não foi construído');

// ── 9. antes das 8h, com plano, mostra o plano ─────────────────────────────────────────────
ok(estado({ agora: as('07:10'), noPlano: 5, faltamNoPlano: 5 }) === 'plano', 'às 7h10 a linha mostra o plano, não um ritmo sobre nada');
ok(/5 portas/.test(linha({ agora: as('07:10'), noPlano: 5, faltamNoPlano: 5 })?.titulo ?? ''), 'e diz quantas portas são');

// ── 10. acima do mínimo ────────────────────────────────────────────────────────────────────
ok(estado({ agora: as('16:00'), feitas: 7, faltamNoPlano: 0 }) === 'acima', '7 de 6 é "acima"');
ok(linha({ agora: as('16:00'), feitas: 7, faltamNoPlano: 0 })?.tom === 'verde', 'e é verde');
ok(!/conclu/i.test(JSON.stringify(linha({ agora: as('16:00'), feitas: 7, faltamNoPlano: 0 }))),
  'nunca "dia concluído": 6 é o mínimo, não o teto');

// ── 11. perto ──────────────────────────────────────────────────────────────────────────────
ok(/3 estão a menos de 400 m/.test(linha({ agora: as('15:00'), feitas: 3, pertoDasQueFaltam: 3 })?.subtitulo ?? ''),
  'atrasado com portas perto: a linha diz quantas e a que distância');
ok(/1 está a menos/.test(linha({ agora: as('15:00'), feitas: 3, pertoDasQueFaltam: 1 })?.subtitulo ?? ''),
  'uma porta perto: "está", não "estão"');
ok(/as 2 mais perto cabem/.test(linha({ agora: as('16:00'), feitas: 2, pertoDasQueFaltam: 2 })?.subtitulo ?? ''),
  'escapando com portas perto: a linha diz quais ainda cabem');
ok(PERTO_M === 400, 'o raio de "perto" é o mesmo 400 m que o resto do mapa usa');

// ── 12. português ──────────────────────────────────────────────────────────────────────────
ok(/falta 1 e/.test(linha({ agora: as('17:30'), feitas: 5 })?.titulo ?? ''), '"falta 1", não "faltam 1"');
ok(/faltam 3,/.test(linha({ agora: as('15:00'), feitas: 3 })?.titulo ?? ''), '"faltam 3"');
ok(/restam 3h/.test(linha({ agora: as('15:00'), feitas: 3 })?.titulo ?? ''), '"restam 3h" às 15h');
ok(/faltam 6, restam 7h/.test(linha({ agora: as('11:00'), feitas: 0 })?.titulo ?? ''), '"faltam 6, restam 7h" às 11h sem nada feito');
ok(/resta 1 min/.test(linha({ agora: as('17:59'), feitas: 1 })?.titulo ?? ''), '"resta 1 min" às 17h59');
ok(/restam 30 min/.test(linha({ agora: as('17:30'), feitas: 5 })?.titulo ?? ''), '"restam 30 min" às 17h30');

// ── 13. o que a tela aguenta ───────────────────────────────────────────────────────────────
/* A DIREITA NÃO QUEBRA (§2.2: "à direita 12,5/700, sem quebra"). Numa faixa de 48 px a quebra
   não some: ela corta o texto ou empurra o título. Oito caracteres cabem a 375 px com folga. */
{
  const todos: LinhaDoDia[] = [];
  for (let m = 0; m < 24 * 60; m += 7) {
    const agora = as(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    for (let f = 0; f <= 8; f++) {
      for (const sd of [null, VASCO, { ...VASCO, hora: null }]) {
        for (const plano of [0, 3, 6]) {
          const l = linhaDoDia(base({ agora, feitas: f, noPlano: plano, faltamNoPlano: Math.max(0, plano - f), pertoDasQueFaltam: f % 3, semDesfecho: sd }));
          if (l) todos.push(l);
        }
      }
    }
  }
  ok(todos.length > 1000, `a varredura montou ${todos.length} linhas`);
  const longa = todos.find((l) => (l.direita ?? '').length > 9);
  ok(!longa, `nenhuma direita passa de 9 caracteres${longa ? ` (achei "${longa.direita}")` : ''}`);
  const titulao = todos.find((l) => l.titulo.length > 46);
  ok(!titulao, `nenhum título passa de 46 caracteres${titulao ? ` (achei "${titulao.titulo}")` : ''}`);
  ok(!todos.some((l) => /undefined|NaN|null/.test(`${l.titulo}${l.subtitulo}${l.direita}`)),
    'nenhuma linha mostra undefined, NaN ou null');
  /* A GRAMÁTICA, VARRIDA — mais forte do que escolher três frases à mão. Um caso isolado só
     prova o caso; estas quatro buscas percorrem o dia inteiro e reprovam qualquer concordância
     errada que apareça em qualquer hora, em qualquer placar. */
  const erroDeConcordancia = todos.map((l) => `${l.titulo} | ${l.subtitulo ?? ''}`).find((t) =>
    /\bfaltam 1\b/.test(t) || /\bfalta \d\d+\b/.test(t)
    || /\brestam 1 (min|h)\b/.test(t) || /\bresta (?!1\b)\d+\s*(min|h)\b/.test(t)
    || /\b1 estão\b/.test(t) || /\b(?!1\b)\d+ está\b/.test(t));
  ok(!erroDeConcordancia, `nenhuma frase erra a concordância${erroDeConcordancia ? ` (achei "${erroDeConcordancia}")` : ''}`);
  ok(!todos.some((l) => /[›✓]/.test(l.rotulo)), 'o rótulo do leitor de tela não tem glifo de navegação');
  ok(todos.every((l) => l.rotulo.startsWith(l.titulo)), 'o leitor de tela lê o mesmo que a tela mostra');
  ok(todos.every((l) => (l.acao === 'desfecho') === (l.alvo != null)), 'só a linha de desfecho carrega um alvo');
  const tons: Record<string, Set<string>> = {};
  todos.forEach((l) => { (tons[l.estado] ??= new Set()).add(l.tom); });
  ok(Object.values(tons).every((s) => s.size === 1), 'cada estado tem UM tom — a cor não muda de sentido no meio do dia');
  ok(Object.keys(tons).length >= 8, `a varredura alcançou ${Object.keys(tons).length} estados (${Object.keys(tons).sort().join(', ')})`);
}

// ── 14. as constantes que o App usa para empilhar ──────────────────────────────────────────
ok(ALTURA_LINHA_DO_DIA === 48, 'a faixa tem 48 px, como a prancha');
ok(INICIO_DA_RUA === 8 && FIM_DA_RUA === 18 && MIN_POR_PORTA === 45, 'a jornada é 8h–18h, 45 min por porta');

// ── 15. a sabotagem: a suíte precisa reprovar ──────────────────────────────────────────────
/* Guarda que nunca viu vermelho não é guarda. Aqui eu refaço, em memória, as duas decisões que
   mais doeriam se fossem revertidas por engano, e exijo que o resultado seja DIFERENTE do que a
   função de verdade devolve. Se alguém inverter a ordem lá dentro, estes dois param de bater. */
{
  const ordemErrada = (feitas: number, meta: number, agora: Date) => {
    // o erro clássico: perguntar a média ANTES da viabilidade
    if (feitas >= meta) return 'acima';
    if (feitas >= esperadoAgora(meta, agora) - 1) return 'no_ritmo';
    return 'atras';
  };
  ok(ordemErrada(5, 6, as('17:30')) !== ritmoDoDia(5, 6, as('17:30')),
    'sabotagem 1: com a média na frente, as 17h30 com 5 de 6 diriam "no ritmo" — e a função não diz');

  const semSaidaDas18 = (feitas: number, meta: number, agora: Date) => {
    if (feitas >= meta) return 'acima';
    const restam = FIM_DA_RUA * 60 - minutosDoDiaBRT(agora);
    if ((meta - feitas) * MIN_POR_PORTA > restam) return 'escapando';
    return 'no_ritmo';
  };
  ok(semSaidaDas18(1, 6, as('22:00')) === 'escapando' && ritmoDoDia(1, 6, as('22:00')) === 'fim',
    'sabotagem 2: sem a saída das 18h a linha passaria a noite vermelha — e a função devolve "fim"');
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nlinha do dia: tudo ok');
process.exit(falhas ? 1 : 0);
