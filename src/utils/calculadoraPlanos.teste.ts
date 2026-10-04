// Teste da cópia do motor da Calculadora (Um app só, PR 4). Rodar: npx tsx src/utils/calculadoraPlanos.teste.ts
// 1) o bloco é IGUAL ao do Cockpit (quando o repositório irmão existe nesta máquina);
// 2) o cálculo com uma tabela de EXEMPLO (preço fictício — preço real nunca vai para o git).
import * as fs from 'fs';
import * as path from 'path';
import { pc9Calcular, pc9EstadoInicial, pc9Alertas } from './calculadoraPlanos';

let falhas = 0;
const ok = (cond: boolean, nome: string) => { if (!cond) { falhas++; console.error('FALHOU:', nome); } else console.log('ok -', nome); };

const tpl = path.resolve(__dirname, '../../../cockpit-unificado/template/cockpit.template.html');
if (fs.existsSync(tpl)) {
  const t = fs.readFileSync(tpl, 'utf8');
  const bloco = t.slice(t.indexOf('/* PC9-MOTOR-INICIO */'), t.indexOf('/* PC9-MOTOR-FIM */'));
  const meu = fs.readFileSync(path.resolve(__dirname, 'calculadoraPlanos.ts'), 'utf8');
  const meuBloco = meu.slice(meu.indexOf('/* PC9-MOTOR-INICIO */'), meu.indexOf('/* PC9-MOTOR-FIM */'));
  ok(bloco.length > 1000 && bloco.replace(/\r\n/g, '\n') === meuBloco.replace(/\r\n/g, '\n'), 'motor idêntico ao do Cockpit');
} else {
  console.log('(cockpit-unificado ausente: comparação pulada)');
}

const cfg = {
  planos: { completo: { label: 'Completo', tiers: [{ id: 'basico', name: 'Básico', price: 100 }, { id: 'profissional', name: 'Pro', price: 200 }] } },
  periodicidades: [{ id: 'mensal', label: 'Mensal', months: 1, discount: 0 }, { id: 'anual', label: 'Anual', months: 12, discount: 0.1 }],
  adicionais: [
    { id: 'fiscal', name: 'Fiscal', price: 50, includedIn: ['profissional'], availableFor: ['basico', 'profissional'] },
    { id: 'tablet', name: 'Tablet', price: 10, perUnit: true, minUnits: 2, availableFor: ['basico', 'profissional'] },
  ],
  funcionalidades: [],
};
const e = pc9EstadoInicial(cfg);
ok(e.tier === 'profissional', 'tier inicial profissional');
const c1 = pc9Calcular(cfg, { ...e, adicionaisAtivos: { tablet: true }, quantidades: { tablet: 3 } });
ok(c1.totalMonthly === 230, 'pro mensal + 3 tablets = 230');
const c2 = pc9Calcular(cfg, { ...e, periodicidade: 'anual', adicionaisAtivos: { fiscal: true } });
ok(c2.totalMonthly === 180 && c2.totalContract === 2160, 'fiscal incluso no pro; anual com 10%');
const c3 = pc9Calcular(cfg, { ...e, tier: 'basico', adicionaisAtivos: { fiscal: true, tablet: true }, quantidades: { tablet: 1 } });
ok(c3.totalMonthly === 170, 'básico + fiscal + tablet com mínimo de 2');
ok(Array.isArray(pc9Alertas(cfg, e)), 'alertas devolve lista');

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log('todas passaram');
