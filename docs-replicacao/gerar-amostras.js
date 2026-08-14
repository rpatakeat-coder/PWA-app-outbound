// docs-replicacao/gerar-amostras.js
// Gera amostras ANONIMIZADAS dos data/*.json para o pacote de replicação.
// Uso: node docs-replicacao/gerar-amostras.js [destino]
// Padrão: docs-replicacao/amostras-dados
//
// Por quê: os arquivos reais em data/ têm nome de cliente, e-mail do time e chaves.
// Os schemas completos estão documentados em 03-HUBSPOT.md e 04-SUPABASE.md, então
// 2-3 registros por lista bastam pro Claude Code entender o formato.

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const dest = process.argv[2] || path.join(__dirname, 'amostras-dados');
fs.mkdirSync(dest, { recursive: true });

const ler = f => JSON.parse(fs.readFileSync(path.join(raiz, 'data', f), 'utf8'));
const gravar = (f, o) => {
  fs.writeFileSync(path.join(dest, f), JSON.stringify(o, null, 2));
  console.log('  ✓', f);
};
const opcional = (rotulo, fn) => {
  try { fn(); } catch (e) { console.log('  – pulado:', rotulo, '(' + e.message.slice(0, 60) + ')'); }
};

let n = 0;
const anonLead = l => {
  const out = {
    ...l,
    name: `Restaurante Exemplo ${++n}`,
    cep: null, logradouro: null, numero: null, bairro: null
  };
  // Campos que carregam nome de pessoa/cliente e vazariam mesmo depois do rename acima.
  if ('nome' in out) out.nome = `Restaurante Exemplo ${n}`;
  if ('vendedor' in out) out.vendedor = 'Executivo Exemplo';
  if ('responsavel' in out) out.responsavel = 'Executivo Exemplo';
  if ('telefone' in out) out.telefone = null;
  if ('endereco' in out) out.endereco = null;
  // `notas` é texto livre vindo do CRM: carrega nome do cliente E do executivo dentro da
  // frase, então renomear campo nenhum resolve. Troca o conteúdo, preserva o formato.
  if (Array.isArray(out.notas)) {
    out.notas = out.notas.slice(0, 2).map((nota, i) => ({
      ...nota,
      texto: `Follow Up - Restaurante Exemplo ${n} Agendado para: 14/08/2026, 09:00 Exemplo de anotação livre do CRM. — Executivo Exemplo (via App de campo)`
    }));
  }
  return out;
};

console.log('Gerando amostras em', dest);

// ---------- hubspot.json ----------
opcional('hubspot.json', () => {
  const h = ler('hubspot.json');
  const doisReps = Object.fromEntries(
    Object.entries(h.reps).slice(0, 2).map(([id, r], i) => [id, {
      ...r,
      name: `Executivo Exemplo ${i + 1}`,
      criticos: (r.criticos || []).slice(0, 3).map(anonLead),
      travados: (r.travados || []).slice(0, 3).map(anonLead),
      quentes: (r.quentes || []).slice(0, 3).map(anonLead),
      plotaveis: [],
      ganhosSemanaNomes: [], avancosHojeNomes: [], propostasHojeNomes: []
    }])
  );
  gravar('hubspot.AMOSTRA.json', {
    ...h,
    kpiDetalhe: { leadsCriados: [], perdidos: [] },
    temperatura: {
      quentes: (h.temperatura.quentes || []).slice(0, 3).map(anonLead),
      frios: (h.temperatura.frios || []).slice(0, 3).map(anonLead)
    },
    funilLeads: Object.fromEntries(
      Object.entries(h.funilLeads || {}).slice(0, 2).map(([k, v]) => [k, v.slice(0, 3).map(anonLead)])
    ),
    vendasMes: (h.vendasMes || []).slice(0, 2).map((v, i) => ({ ...v, nome: `Cliente Exemplo ${i + 1}` })),
    reps: doisReps,
    agenda: { geradoEm: (h.agenda || {}).geradoEm || null, itens: ((h.agenda || {}).itens || []).slice(0, 3) }
  });
});

// ---------- weekly-raw.json ----------
opcional('weekly-raw.json', () => {
  const w = ler('weekly-raw.json');
  gravar('weekly-raw.AMOSTRA.json', {
    ...w,
    ganhosSemanaDetalhe: (w.ganhosSemanaDetalhe || []).slice(0, 2).map((g, i) => ({ ...g, nome: `Cliente Exemplo ${i + 1}` })),
    reunioesSemanaDetalhe: (w.reunioesSemanaDetalhe || []).slice(0, 2).map((g, i) => ({ ...g, nome: `Cliente Exemplo ${i + 1}` })),
    quentesDemoOuNegociacao: (w.quentesDemoOuNegociacao || []).slice(0, 2).map(anonLead),
    snapshotReps: Object.fromEntries(
      Object.entries(w.snapshotReps || {}).slice(0, 1).map(([k, v]) => [k, {
        ...v, name: 'Executivo Exemplo 1',
        criticos: (v.criticos || []).slice(0, 2).map(anonLead),
        travados: [], quentes: [], plotaveis: []
      }])
    )
  });
});

// ---------- resumo-semanal.json ----------
opcional('resumo-semanal.json', () => {
  const r = ler('resumo-semanal.json');
  gravar('resumo-semanal.AMOSTRA.json', {
    ...r,
    ganhosSemanaDetalhe: [], reunioesSemanaDetalhe: [], quentesDemoOuNegociacao: [],
    porRep: Object.fromEntries(
      Object.entries(r.porRep || {}).slice(0, 1).map(([k, v]) => [k, { ...v, name: 'Executivo Exemplo 1' }])
    )
  });
});

// ---------- narrativas.json ----------
opcional('narrativas.json', () => {
  const nar = ler('narrativas.json');
  const [id0, rep0] = Object.entries(nar.reps)[0];
  gravar('narrativas.AMOSTRA.json', {
    _comment: nar._comment,
    _atualizado_em: nar._atualizado_em,
    reps: { [id0]: { ...rep0, name: 'Executivo Exemplo 1' } }
  });
});

// ---------- historico-semanal-mes.json ----------
opcional('historico-semanal-mes.json', () => {
  const hs = ler('historico-semanal-mes.json');
  gravar('historico-semanal-mes.AMOSTRA.json', {
    mesAno: hs.mesAno,
    semanas: (hs.semanas || []).slice(0, 1)
  });
});

// ---------- leads-referencia.json ----------
opcional('leads-referencia.json', () => {
  const lr = ler('leads-referencia.json');
  gravar('leads-referencia.AMOSTRA.json', {
    pracas: (lr.pracas || []).slice(0, 1).map(p => ({
      ...p,
      responsaveis: ['Executivo Exemplo 1'],
      leads: (p.leads || []).slice(0, 3).map(anonLead)
    }))
  });
});

// ---------- usuarios.json (estrutura, e-mails fictícios) ----------
gravar('usuarios.AMOSTRA.json', {
  _comment: 'Mapeia o e-mail de login (mesmo do CRM) pro executivo correspondente. role:manager vê tudo; role:rep vê só o próprio cockpit. ownerId é o owner id do CRM.',
  usuarios: [
    { email: 'gestor@empresa.com', role: 'manager', ownerId: null, nome: 'Gestor Exemplo' },
    { email: 'exec1@empresa.com', role: 'rep', ownerId: '11111111', nome: 'Executivo Um' },
    { email: 'exec2@empresa.com', role: 'rep', ownerId: '22222222', nome: 'Executivo Dois' },
    { email: 'novo@empresa.com', role: 'rep', ownerId: 'pendente_novo', nome: 'Executivo Novo', aComecar: true }
  ]
});

// ---------- supabase-config: só o formato, NUNCA a chave real ----------
gravar('supabase-config.EXEMPLO.json', {
  _comment: 'Formato do arquivo. Chaves PÚBLICAS por natureza (o navegador precisa delas), protegidas por RLS e restrição de domínio — mas gere as SUAS, nunca reaproveite as de outro projeto.',
  url: 'https://SEU-PROJETO.supabase.co',
  anonKey: 'SUA_ANON_KEY_AQUI'
});

// ---------- sync-status.json: formato preservado, nomes trocados ----------
opcional('sync-status.json', () => {
  const s = ler('sync-status.json');
  const apelidos = {};
  let k = 0;
  gravar('sync-status.AMOSTRA.json', {
    ...s,
    falhas: (s.falhas || []).slice(0, 3).map(f => {
      if (!apelidos[f.ownerId]) apelidos[f.ownerId] = `Executivo Exemplo ${++k}`;
      return { ...f, nome: apelidos[f.ownerId] };
    })
  });
});

// ---------- arquivos pequenos e sem dado de cliente/pessoa: cópia direta ----------
[
  ['hubspot-previous.json', 'hubspot-previous.json'],   // só KPIs agregados
  ['expogo.json', 'expogo.json'],                        // snapshot agregado, sem nomes
  ['redes-excluidas.json', 'redes-excluidas.json']       // lista de marcas, não de pessoas
].forEach(([origem, saida]) => {
  opcional(origem, () => gravar(saida, ler(origem)));
});

console.log('\nPronto.');
