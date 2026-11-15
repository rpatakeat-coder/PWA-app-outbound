// Teste da pergunta "por que saiu do plano" (15/11/26).
// Rode com:  npx tsx src/utils/motivoDeTirar.teste.ts
import { ROTULO_DO_MOTIVO, botoesDaPergunta, opcoesDeMotivo, tituloDaPergunta } from './motivoDeTirar';

let falhas = 0;
const ok = (c: boolean, m: string, extra?: unknown) => { if (c) console.log('  ok   ' + m); else { falhas += 1; console.log('  FALHOU ' + m + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } };

const hoje = '2026-11-16';
const deHoje = opcoesDeMotivo(hoje, hoje).map((o) => o.id);
const deAmanha = opcoesDeMotivo('2026-11-17', hoje);
ok(deHoje.join() === 'fechado,sem_tempo,outro_dia,nao_vale', 'hoje: fechado, sem tempo, outro dia e não vale, nessa ordem', deHoje);
ok(!deAmanha.some((o) => o.id === 'fechado') && deAmanha.length === 3, 'outro dia: "Estava fechado" não aparece (ninguém viu a porta de amanhã)', deAmanha);
ok(deAmanha[0].rotulo === 'Sem tempo nesse dia' && opcoesDeMotivo(hoje, hoje)[1].rotulo === 'Sem tempo hoje', 'o rótulo do "sem tempo" diz de que dia');
ok(tituloDaPergunta('Bar do Zé', 1) === 'Tirar Bar do Zé do plano?' && tituloDaPergunta(null, 3) === 'Tirar 3 paradas do plano?' && tituloDaPergunta('Bar do Zé', 4) === 'Tirar 4 paradas do plano?', 'título: uma pelo nome, várias pela contagem');
ok(['fechado', 'sem_tempo', 'outro_dia', 'nao_vale', 'perdido', 'descartada', 'desfeito', 'cockpit'].every((k) => !!ROTULO_DO_MOTIVO[k as keyof typeof ROTULO_DO_MOTIVO]), 'todo motivo gravado tem rótulo para o gestor ler');

// a pergunta: cada botão devolve o seu motivo; Cancelar devolve null (nada sai do plano)
let resposta: string | null | undefined;
const botoes = botoesDaPergunta({ nome: 'Bar do Zé', dia: hoje, hoje }, (m) => { resposta = m; });
ok(botoes.length === 5 && botoes[4].style === 'cancel', 'hoje: 4 motivos e o Cancelar por último', botoes.map((b) => b.text));
botoes[1].onPress();
ok(resposta === 'sem_tempo', 'tocar em "Sem tempo hoje" devolve sem_tempo', resposta);
const b2 = botoesDaPergunta({ nome: null, dia: '2026-11-17', hoje, quantas: 3 }, (m) => { resposta = m; });
b2[b2.length - 1].onPress();
ok(resposta === null && b2.length === 4, 'Cancelar devolve null: quem chama não tira nada', resposta);

console.log(falhas ? '\n' + falhas + ' FALHARAM' : '\nTODOS PASSARAM');
if (falhas) process.exit(1);
