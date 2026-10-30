// Teste do que o app acabou de gravar no negócio (gravadoAgora).
//
// Rode com:  npx tsx src/utils/gravadoAgora.teste.ts
//
// Protege o que a auditoria de 29/10/26 achou clicando: mover para Conversa com decisor com
// "Saipos" e "Fila" e o cartão seguir dizendo "falta", porque a cópia do HubSpot só alcança na
// sincronização seguinte; e o "Limpar funil" mandar a etapa velha como etapaEsperada.
import { etapaGravadaAgora, gravadoAgora, registrarGravado } from './gravadoAgora';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

registrarGravado({ op: 'mudar-etapa', dealId: '1', novaEtapa: '1395880470', propriedades: { nome_do_sistema: 'Saipos', gargalo_operacional: 'Fila', lixo: 'x' } });
ok(gravadoAgora('1').nome_do_sistema === 'Saipos' && gravadoAgora('1').gargalo_operacional === 'Fila', 'mudar etapa: sistema e dor ficam lembrados');
ok(!('lixo' in gravadoAgora('1')), 'só as propriedades que o cartão lê');
ok(etapaGravadaAgora('1') === '1395880470', 'e a etapa nova também');

registrarGravado({ op: 'nota', tipoAcao: 'proximo-passo', dealId: '1', qualificacao: { nomeDoSistema: 'Colibri' } });
ok(gravadoAgora('1').nome_do_sistema === 'Colibri' && gravadoAgora('1').gargalo_operacional === 'Fila', 'a qualificação da nota troca o sistema e mantém a dor');
ok(etapaGravadaAgora('1') === '1395880470', 'a nota não apaga a etapa lembrada');

registrarGravado({ op: 'nota', dealId: '2', texto: 'só uma nota' });
ok(Object.keys(gravadoAgora('2')).length === 0 && etapaGravadaAgora('2') === undefined, 'nota sem qualificação não lembra nada');
ok(Object.keys(gravadoAgora(null)).length === 0, 'sem negócio, vazio');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\ngravado agora: tudo certo');
