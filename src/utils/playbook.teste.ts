// Teste da aba Playbook: busca sem acento, sugestão pela etapa, continuar lendo.
//
// Rode com:  npx tsx src/utils/playbook.teste.ts
import { cartaoContextual, continuarLendo, filtrarPaginas, rotuloProgresso, sugestoesDaEtapa, type Playbook } from './playbook';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};

const pag = (id: string, titulo: string, categoria: string, busca = '') => ({ id, titulo, categoria, resumo: '', busca });
const PB: Playbook = {
  categorias: ['Venda na rua', 'Converter e fechar', 'Carteira e retenção', 'Produto e mercado'],
  paginas: [
    pag('prospeccao-porta-a-porta', 'Porta a porta: a rua como sistema', 'Venda na rua'),
    pag('acesso-decisor', 'Como chegar em quem assina', 'Venda na rua'),
    pag('follow-up', 'Follow-up: presença no prazo certo', 'Venda na rua'),
    pag('objecoes', 'Objeções: a conversa é sobre margem', 'Converter e fechar', 'preço caro margem'),
    pag('fechamento', 'Fechamento', 'Converter e fechar'),
    pag('mapa-dor-solucao', 'Mapa dor → solução', 'Converter e fechar'),
    pag('ecossistema-takeat', 'O ecossistema', 'Produto e mercado'),
    pag('evitar-churn', 'Como evitar churn', 'Carteira e retenção'),
    pag('relacionamento', 'Pós-venda presencial', 'Carteira e retenção'),
  ],
};

// busca
ok(filtrarPaginas(PB, 'OBJECOES', null).map((p) => p.id).join() === 'objecoes', 'busca sem acento e sem caixa casa "Objeções"');
ok(filtrarPaginas(PB, 'preco', null).map((p) => p.id).join() === 'objecoes', 'busca casa o texto do dado, não só o título');
ok(filtrarPaginas(PB, '', 'Carteira e retenção').length === 2, 'categoria sozinha filtra');
ok(filtrarPaginas(PB, 'objecoes', 'Venda na rua').length === 0, 'categoria e busca juntas');

// sugestão pela etapa
const ids = (e: string | null) => sugestoesDaEtapa(PB, e).map((p) => p.id).join();
ok(ids('Prospecção') === 'prospeccao-porta-a-porta,acesso-decisor', 'Prospecção → porta a porta + acesso ao decisor');
ok(ids('Visita') === 'acesso-decisor,follow-up', 'Visita → acesso ao decisor + follow-up');
ok(ids('Conversa com Decisor') === 'mapa-dor-solucao,ecossistema-takeat', 'Decisor → dor/solução + ecossistema');
ok(ids('Negociação') === 'objecoes,fechamento' && ids('Ag. Pagamento') === 'objecoes,fechamento', 'Negociação/Ag. Pagamento → objeções + fechamento');
ok(ids('churn') === 'evitar-churn,relacionamento', 'ex-cliente → churn primeiro');
ok(ids('cliente') === 'relacionamento,evitar-churn', 'cliente → relacionamento primeiro');
ok(ids(null) === 'prospeccao-porta-a-porta,acesso-decisor', 'sem etapa → o começo da venda');

// continuar lendo
const c = continuarLendo(PB, {
  objecoes: { pct: 35, em: 2 },
  fechamento: { pct: 60, em: 1 },
  'follow-up': { pct: 50, em: 9, lida: true },
  sumiu: { pct: 40, em: 10 },
});
ok(c?.pagina.id === 'objecoes' && c.pct === 35, 'continuar lendo = a mais recente começada, não lida, que ainda existe');
ok(continuarLendo(PB, { objecoes: { pct: 99, em: 1 } }) === null, 'rolou até o fim: não oferece continuar');
ok(rotuloProgresso({ pct: 35.4, em: 1 }) === '35%' && rotuloProgresso({ pct: 10, em: 1, lida: true }) === 'lida' && rotuloProgresso(undefined) === null, 'rótulo do progresso');

// cartão contextual da próxima porta (§6.16)
ok(cartaoContextual(PB, { etapa: null, temNegocio: false })?.pagina.id === 'acesso-decisor', 'conta-alvo sem negócio: achar o decisor');
ok(cartaoContextual(PB, { etapa: 'Visita', temNegocio: true })?.pagina.id === 'acesso-decisor', 'Visita sem celular do decisor: achar o decisor');
ok(cartaoContextual(PB, { etapa: 'Visita', temNegocio: true, celular: '11999', gargalo: 'Fila' })?.motivo === 'Dor declarada: Fila.', 'decisor conhecido + dor: mapa dor → solução com a dor');
ok(cartaoContextual(PB, { etapa: 'Demo/Proposta', temNegocio: true, gargalo: 'Fila' })?.pagina.id === 'mapa-dor-solucao', 'depois da Conversa com decisor, sem celular não volta para achar decisor');
ok(cartaoContextual(PB, { etapa: 'Negociação', temNegocio: true, celular: '1', sistema: 'Saipos' })?.pagina.id === 'objecoes', 'sistema declarado: objeções');
ok(cartaoContextual(PB, { etapa: 'Negociação', temNegocio: true, celular: '1' })?.pagina.id === 'objecoes', 'sem dor nem sistema: primeira da etapa');
ok(cartaoContextual({ paginas: [], categorias: [] }, { etapa: null, temNegocio: false }) === null, 'playbook vazio: sem cartão');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\nplaybook: tudo certo');
