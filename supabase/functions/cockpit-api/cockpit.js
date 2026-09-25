// GERADO por scripts/portar-cockpit-api.cjs a partir de cockpit-unificado@2a51316.
// NAO EDITAR: cada funcao abaixo e um arquivo do Cockpit, byte a byte. Para mudar
// uma regra, mude no Cockpit e gere de novo.
export const ORIGEM = "2a51316";
export const ROTAS = ["negocio-acao","criar-negocio","desfazer-negocio","criar-nota-negocio","criar-empresa-prospeccao","restaurantes-proximos","novidades-mercado"];
export const JSONS = ["data/maptiler-config.json","data/redes-excluidas.json","data/usuarios.json"];

const FONTES = {
  "api/negocio-acao.js": function (module, exports, require, process) {
// api/negocio-acao.js
//
// PORTA ÚNICA DAS AÇÕES SOBRE NEGÓCIO (31/08/26).
//
// POR QUE ISTO EXISTE
// O plano Hobby da Vercel dá 12 funções serverless e as 12 estavam ocupadas — sem espaço
// para o endpoint que o PWA vai precisar (a fila pendente do app: o que foi feito na rua e
// ainda não subiu). Cinco das doze faziam a mesma coisa em forma: validar sessão, conferir se
// o negócio é do pipeline Field Sales e escrever uma propriedade ou um objeto associado.
// Elas viraram cinco módulos em lib/acoes-negocio/ e esta é a única função que responde por
// todas. Saldo: 12 → 8 funções, 4 slots livres.
//
// O QUE **NÃO** MUDOU, DE PROPÓSITO
// A lógica de cada ação não foi reescrita: os cinco arquivos foram MOVIDOS, byte por byte,
// com uma única edição mecânica (o caminho relativo dos dois require, que subiu um nível).
// Cada um continua fazendo a própria validação de sessão, a própria checagem de papel e a
// própria escrita no HubSpot. Refatorar o caminho de escrita no mesmo passo em que muda o
// roteamento é como se perde uma ação sem ninguém notar — e aqui as ações são mover etapa,
// registrar nota de campo, marcar visita e corrigir MRR.
//
// O NOME DO CAMPO É `op`, NÃO `acao`
// Duas das cinco já usam `acao` no corpo, com significados diferentes ('criar'/'remover' na
// tarefa de rota, 'confirmar'/'recusar' na sugestão do gestor). Reusar esse nome aqui
// colidiria com o corpo que elas já esperam.
//
// CONTRATO
//   POST /api/negocio-acao
//   Authorization: Bearer <token de sessão do Supabase>   (igual ao de antes)
//   body: { op: 'mudar-etapa' | 'nota' | 'tarefa-rota' | 'mrr' | 'sugestao-gestor'
//              | 'ler-etapa', ...resto }
//   O "resto" é exatamente o corpo que a rota antiga recebia — nada mudou de nome.

const ACOES = {
  'mudar-etapa': require('../lib/acoes-negocio/mudar-etapa-negocio'),
  'nota': require('../lib/acoes-negocio/criar-nota-negocio'),
  'tarefa-rota': require('../lib/acoes-negocio/criar-tarefa-rota'),
  'mrr': require('../lib/acoes-negocio/atualizar-mrr'),
  'sugestao-gestor': require('../lib/acoes-negocio/confirmar-sugestao-gestor'),
  /* SO LE, e existe para a tela nao mentir quando a escrita e abortada por tempo:
     em 04/09 a Kelly viu 'Falha ao falar com o HubSpot' sobre um negocio que ESTAVA
     gravado em Perdido. Agora o cliente pergunta a etapa atual antes de afirmar. */
  'ler-etapa': require('../lib/acoes-negocio/ler-etapa-negocio')
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const op = req.body && typeof req.body.op === 'string' ? req.body.op.trim() : '';
  if (!op) {
    return res.status(400).json({
      erro: 'Falta o campo "op" dizendo qual ação executar.',
      aceitas: Object.keys(ACOES)
    });
  }
  const acao = ACOES[op];
  if (!acao) {
    // Lista as aceitas em vez de só recusar: quem estiver integrando (o PWA, amanhã) descobre
    // o contrato pela própria resposta, sem precisar abrir o repositório.
    return res.status(400).json({ erro: 'Ação desconhecida: ' + op, aceitas: Object.keys(ACOES) });
  }

  /* Cada módulo responde por si — inclusive pela validação de sessão e pelo status de erro.
     O roteador não interpreta nem reescreve resposta: se ele traduzisse erros, a mensagem que
     o executivo vê na rua passaria a depender de duas camadas em vez de uma. */
  return acao(req, res);
};

  },
  "lib/acoes-negocio/mudar-etapa-negocio.js": function (module, exports, require, process) {
// api/mudar-etapa-negocio.js
// Função serverless da Vercel — mesma arquitetura de api/criar-tarefa-rota.js: o
// navegador nunca conhece o HUBSPOT_TOKEN; manda dealId + a etapa nova + o token de
// sessão do Supabase, e esta rota valida tudo antes de escrever no HubSpot.
//
// Objetivo (Julyan, 14/08/26): "o executivo tem que poder limpar o lead... pelo
// cockpit... e registrar automaticamente no HubSpot". Este arquivo cobre a parte de
// AVANÇAR/VOLTAR ETAPA. Destinos: as 6 etapas abertas do funil (Prospecção → Ag.
// Pagamento), mais Enviado Onboarding (15/08), Reciclagem (17/08) e PERDIDO (02/09).
// Ganho (1396006162) continua fora de propósito: quem move para lá é o ASAAS quando o
// pagamento confirma, não uma pessoa.
// A frase antiga deste bloco dizia que Perdido tinha ficado fora "nesta rodada" e que
// mudar isso pediria uma rota nova. Não pediu: o que Perdido precisava era de uma
// exigência (o motivo) e de duas isenções na regra de pulo — 12 linhas, não uma rota.
//
// Variáveis de ambiente na Vercel: HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY.

let USUARIOS = [];
try {
  const raw = require('../../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

const { buscarDealAutorizado } = require('../hubspot-deal-guard');

// Mesma ordem canônica usada em todo o resto do cockpit (ORDEM_ETAPAS_FUNIL /
// ORDEM_FUNIL_FICHA no template) — repetida aqui só pra VALIDAR que a etapa pedida é
// uma das permitidas; nunca decide nada sozinha, é apenas a lista de permitidas.
// ATUALIZAÇÃO (15/08/26, Julyan): "ele pode enviar pra onboarding... ele pode
// movimentar pelo cockpit, faça isso" — 1396006163 (Enviado Onboarding) adicionada
// como 7ª etapa alcançável, na sequência natural logo depois de Ag. Pagamento. Isso
// NÃO altera a automação dessa etapa (troca de pipeline + grupo de WhatsApp) — é o
// MESMO PATCH genérico de dealstage que qualquer outra transição já usa; do lado do
// HubSpot, não existe diferença entre "moveu pelo Cockpit" e "moveu na tela do
// HubSpot". "Ganho" (1396006162) FICA DE FORA de propósito: Julyan confirmou que essa
// etapa só é alcançada automaticamente pelo próprio ASAAS quando o pagamento
// confirma — nenhum humano move negócio pra lá manualmente, então não faz sentido
// como destino aqui.
// PEDIDO (17/08/26, Julyan): "adicionar a etapa reciclagem em nosso funil, como já
// fez com enviado onboarding" — 1398311191 (Reciclagem) adicionada como etapa
// alcançável. Sem automação de RPA/ASAAS/WhatsApp amarrada a ela (diferente de
// Ag.Pagamento/Enviado Onboarding) — resgatar um lead esfriado de volta pro funil
// é uma ação comercial comum, não precisa de nenhuma trava especial.
// PEDIDO (02/09/26, Julyan): "criar a etapa perdido, mas sem puxar retroativo para nao
// sujar o cockpit". A etapa já existia no pipeline (1396006164, "Perdido") — o que não
// existia era o Cockpit poder escrever nela: o comentário no topo deste arquivo registra
// que Perdido ficou fora de propósito em 14/08. Entra agora, com uma diferença que
// importa: é a ÚNICA etapa cujo campo obrigatório não é um dado de venda, é o MOTIVO.
// Perda sem motivo não ensina nada, e o Cockpit já tem uma leitura inteira em cima de
// motivo_do_perdido (a assinatura de perda do executivo). Sem o motivo, mover para
// Perdido pelo Cockpit iria alimentar 'Sem motivo preenchido' — quer dizer, pioraria
// justamente o relatório que essa etapa existe para alimentar.
// GANHO ENTRA NA ESCADA, NO FIM (10/09/26). A escada tem de ser idêntica à da tela
// (ORDEM_ETAPAS_FUNIL) — há uma guarda no build sobre isso, porque divergir faz a tela
// oferecer movimento que a rota recusa. No fim, nenhum índice existente desloca:
// 'Ag. Pagamento → Onboarding' segue valendo e 'Ag. Pagamento → Ganho' segue barrado.
const ETAPAS_ABERTAS = ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473', '1396006163', '1398311191', '1396006162'];
const ETAPA_GANHO = '1396006162';
const ETAPA_RECICLAGEM = '1398311191';
const ETAPA_PERDIDO = '1396006164';
// Todo destino que esta rota aceita. Separado de ETAPAS_ABERTAS de propósito: aquela é a
// ESCADA (usada pela regra de não pular fase), esta é a PORTEIRA (o que é destino válido).
// Misturar as duas faria Perdido virar um degrau do funil e bloquear 'Prospecção → Perdido'
// como se fosse pulo de fase — o oposto do que se quer: desistir é permitido de onde for.
// GANHO É DEGRAU, NÃO DESTINO (10/09/26). Ele entra em ETAPAS_ABERTAS para a régua de
// pulo calcular certo a origem de quem SAI dele, e sai daqui porque mover um negócio
// para Ganho é afirmar que pagou: quem afirma isso é o ASAAS na confirmação, não uma
// pessoa. É a mesma decisão de 15/08, e o pedido de 10/09 foi VER a etapa e poder ir
// dela para o Onboarding — os dois convivem.
const ETAPAS_DESTINO = ETAPAS_ABERTAS.filter(e => e !== ETAPA_GANHO).concat([ETAPA_PERDIDO]);

// BLOCO 54 (14/08/26) — espelho das propriedades condicionais obrigatórias vistas
// diretamente no pipeline Field Sales do HubSpot. Esta allowlist é a fronteira de
// escrita; um navegador comprometido não pode escolher outras propriedades do CRM.
const PROPS_PERMITIDAS = ['dealname', 'email', 'cnpj_cpf', 'celular', 'cep', 'bairro', 'cidade', 'logradouro', 'numero',
  'origem_do_lead', 'gargalo_operacional', 'nome_do_sistema', 'plano_apresentado',
  'valor_de_mrr', 'pacote_contratado', 'adicional', 'tipo_de_pagamento',
  'periodo_contratado', 'amount', 'mrr', 'deseja_criar_perfil_no_asaas_',
  'qual_maior_desafio_', 'informacoes_sobre_o_maior_desafio', 'data_da_reuniao',
  'reuniao_agendada', 'description', 'motivo_do_perdido',
  /* 04/09/26 — a Kelly preencheu o motivo e a frase do cliente, clicou em "Mover para
     Perdido" e levou "Propriedade nao permitida por esta rota". O campo e coletado por
     CAMPOS_POR_ETAPA['1396006164'] desde 03/09 e esta lista nunca o recebeu: duas listas
     que precisam concordar, e nada as comparava (agora a guarda 19 compara).
     A propriedade existe no HubSpot com este nome exato, label "Observacao Perdido" —
     nao houve mudanca la. */
  'observacao__desqualificado'];

// Exigências para ENTRAR em cada etapa. Este mapa é a barreira de integridade do
// servidor; o mapa equivalente no template existe só para orientar a interface.
const PROPS_OBRIGATORIAS_POR_ETAPA = {
  '1395880469': ['origem_do_lead'],
  '1396005401': [],
  /* CELULAR ENTRA NO DECISOR (10/09/26). Ele era exigido na CRIACAO em Prospeccao e
     saiu de la: medido no funil, 40 dos 85 negocios em Prospeccao estao sem celular
     (47%) — a exigencia cobrava um dado que a metade nao tem. No Decisor a medicao diz
     que ela e de graca: 13 negocios, ZERO sem celular.
     O ESPELHO DO CLIENTE E CAMPOS_POR_ETAPA['1395880470'], e quem compara as duas
     listas e checarObrigatoriasEspelhadas() no build — guarda que nasceu junto com
     esta linha, porque eu escrevi neste comentario que a guarda 19 ja comparava e fui
     conferir depois: ela confere PERMISSAO, nao EXIGENCIA. Divergir aqui reprova. */
  '1395880470': ['celular', 'gargalo_operacional', 'nome_do_sistema'],
  /* DEMO/PROPOSTA PASSA A EXIGIR O VALOR (02/09/26, revisão das propriedades com o
     Julyan). Esta etapa não exigia NADA, e o MRR só era pedido na Negociação — uma
     etapa depois de a proposta existir. Medido no pipeline: dos 22 negócios em
     Demo/Proposta, UM tinha valor_de_mrr. Proposta sem valor não é proposta que se possa
     medir, e medir na etapa seguinte é medir tarde.
     data_da_reuniao entra junto porque é o que separa 'apresentei' de 'marquei': sem ela
     a etapa aceita um negócio que nunca teve reunião. */
  '1395880471': ['valor_de_mrr', 'plano_apresentado', 'data_da_reuniao'],
  '1395880472': ['plano_apresentado', 'valor_de_mrr'],
  /* AG. PAGAMENTO PARA DE PEDIR amount E mrr (02/09/26). Ela pedia os TRÊS campos de
     dinheiro à mão, e foi isso que produziu a divergência que eu medi no pipeline:
       valor_de_mrr 403 x mrr 244,33 (NGW) · 349 x 299 (O Minas) · 450 x 449 (Adega 12)
       e um caso com mrr 900 num contrato TRIMESTRAL de 900 — o total no campo mensal.
     A consolidação em UM campo digitado (valor_de_mrr, com os outros dois derivados) foi
     tentada em 02/09 e DESFEITA em 03/09: os dois campos que ela apagava são os que a
     automação de fora (RPA/ASAAS) lê para gerar o link de pagamento. Três lugares para
     digitar o mesmo número são três lugares para errar — mas um lugar a menos do que a
     automação precisa é o negócio parado. A reconciliação, se vier, é com o RPA na
     frente e com o Julyan decidindo. */
  /* AMOUNT E MRR, COMO ERA — REVERTIDO EM 03/09/26. Em 02/09 eu troquei os dois por
     valor_de_mrr aqui e no formulario. Estes dois campos sao o que o RPA/ASAAS le para
     gerar o link de pagamento, e a etapa tinha aviso escrito desde 15/08 para nao ser
     tocada. Exigir aqui o que o formulario pede e o que impede o executivo de digitar
     tudo e ainda tomar recusa. */
  '1395880473': ['dealname', 'email', 'cnpj_cpf', 'celular', 'cep', 'numero',
    'pacote_contratado', 'adicional', 'tipo_de_pagamento', 'periodo_contratado',
    'amount', 'mrr', 'deseja_criar_perfil_no_asaas_', 'qual_maior_desafio_',
    'informacoes_sobre_o_maior_desafio'],
  // Enviado Onboarding não pede NADA de novo — o contrato inteiro (plano, adicional,
  // MRR, telefone, etc.) já foi coletado quando o negócio entrou em Ag. Pagamento.
  // Esta etapa é confirmação de pagamento, não coleta de dado.
  '1396006163': [],
  // Perdido exige O MOTIVO, e só ele. É a única exigência desta rota que não é dado de
  // venda: é o que transforma uma derrota em informação. Um clique a mais no pior
  // momento do negócio é o único preço, e ele se paga na Daily seguinte.
  '1396006164': ['motivo_do_perdido'],
  // Reciclagem também não pede nada — resgatar um lead de volta é uma ação de 1
  // clique, sem fricção. Se no futuro fizer sentido registrar "por que esfriou",
  // isso entra aqui como campo opcional, nunca obrigatório (senão o resgate vira
  // trabalho extra e ninguém usa).
  '1398311191': []
};

const VALORES_PERMITIDOS = {
  origem_do_lead: ['Rua', 'Indicação', 'Casa dos Dados', 'Instagram', 'Ads', 'GoogleMaps', 'Familia', 'Eventos'],
  gargalo_operacional: ['Fila', 'Falta de Garçom', 'Falta de Gestão', 'Sem fidelização', 'Demora na divisão de contas', 'Estoque'],
  plano_apresentado: ['Básico (PDV + delivery)', 'Básico (PDV + mesa + delivery)', 'Inovação', 'Pro', 'Enterprise'],
  pacote_contratado: ['Básico', 'Básico (delivery e balcão)', 'Inovação', 'Inovação (delivery e balcão)', 'Profissional', 'Profissional (delivery e balcão)', 'Enterprise', 'Enterprise (delivery e balcão)', 'Upsell', 'Produtos Personalizados', 'Básico (Delivery)', 'Básico (PDV Balcão)', 'Básico (Delivery + PDV Balcão)', 'Intermediário (Delivery + PDV Balcão + PDV Mesa)', 'Apenas Cardapio'],
  adicional: ['Sem adicionais', 'Fiscal SN', 'Maquininha POS', 'Cashback', 'Tablet', 'IA Conversacional (TEKA)', 'Totem de Autoatendimento', 'Robô de Whatsapp', 'Multilojas', 'Campanhas Personalizadas', 'Fiscal LP / LR', 'IA de Fechamento', 'TEF', 'Precificação Dinâmica', 'Display ou Comandas', 'Dark Kitchen', 'Conciliação Bancária', 'Rota Inteligente'],
  tipo_de_pagamento: ['À Vista', 'Crédito'],
  periodo_contratado: ['Mensal', 'Trimestral', 'Semestral', 'Anual'],
  deseja_criar_perfil_no_asaas_: ['true', 'false'],
  reuniao_agendada: ['true', 'false'],
  qual_maior_desafio_: ['Problemas com Atendimento', 'Gestão Financeira', 'Problemas de Gestão', 'Problemas em Fidelizar o Cliente', 'Gerenciar várias lojas', 'Controle fiscal', 'Operação', 'Suporte do sistema'],
  // As seis opções REAIS da propriedade motivo_do_perdido no HubSpot, conferidas via
  // get_properties em 02/09/26 (o rótulo de 'Reembolso' aparece como 'Estorno' na tela do
  // CRM, mas o valor gravado é 'Reembolso' — é o valor que vale aqui). Digitar um sétimo
  // motivo criaria uma fatia nova no gráfico de perda que ninguém pediu.
  //
  // 'SEM RETORNO' CONTINUA AQUI DE PROPOSITO (03/09/26), embora a TELA nao ofereca mais.
  // O Julyan aposentou a opcao: medido nos 981 perdidos de 90 dias, 'Outros' (42%) e 'Sem
  // retorno' (30%) somam 72% de motivos que nao sao decisao do cliente — e 'Sem retorno' e
  // a AUSENCIA de decisao, que pertence a `motivo_saida_cadencia`.
  //
  // Esta lista e WHITELIST DE VALIDACAO: remover um valor daqui faz esta rota RECUSAR
  // qualquer escrita que o traga. O Cockpit nao e o unico escritor — o PWA move etapa pela
  // mesma porta —, e aposentar a opcao quebrando o outro escritor seria trocar um problema
  // de relatorio por um problema de campo. Servidor TOLERA o que existe; tela nao OFERECE
  // o que aposentamos. testar-kanban-etapas guarda essa assimetria, tela dentro do
  // servidor, e continua reprovando o caso perigoso: a tela oferecer valor que o servidor
  // recusa, que trava a passagem de etapa na cara do executivo.
  motivo_do_perdido: ['Preço', 'Funcionalidade', 'Sem retorno', 'Reembolso', 'Não quer mudar de sistema', 'Outros']
};

// PISO REMOVIDO EM 03/09/26 (Julyan: "NAO TEMOS VALOR MINIMO E MAXIMO NESSAS ETAPAS, O
// TICKET DE 349 E O IDEAL Q DEVEMOS VENDER, MAS NAO E OBRIGATORIO"). A lista fica VAZIA
// em vez de o bloco sair: o mecanismo de piso continua aqui, desarmado e com a razao
// escrita, para o dia em que existir um piso de verdade. Piso apagado do codigo volta
// como numero magico solto.
// Historico do que ele causava: negocio fechado a 299 era RECUSADO na gravacao, e o
// executivo nao conseguia mover a etapa de um contrato que ja estava assinado. O mesmo
// piso foi tirado da rota do MRR em 15/08 (ver atualizar-mrr.js) e sobreviveu nesta.
// O comentario antigo dizia: piso comercial do time (R$349/mês, regra do Julyan) — a
// checagem do navegador é conveniência, esta é a que vale.
const PISO_VALOR = 349;
const PROPS_COM_PISO = [];
const PROPS_NUMERICAS = ['amount', 'valor_de_mrr', 'mrr'];

/* ══ UM CAMPO DIGITADO, DOIS DERIVADOS (02/09/26) ═══════════════════════════════════
   O pipeline tem três campos de dinheiro e eles não são a mesma coisa:
     valor_de_mrr — o mensal. É o único que uma pessoa digita.
     mrr          — também mensal, e DIVERGIA do primeiro onde os dois existiam.
     amount       — o total do PERÍODO. Provado no dado: Naha sushi 838 trimestral com
                    amount 2.514; Beto restaurante 465 semestral com amount 2.790.
   Somar amount como MRR infla por 3 ou por 6. E dois campos mensais preenchíveis à mão
   não têm como concordar — medido: 4 divergências em 40 negócios, e um caso com o total
   do trimestre no campo mensal.
   Daqui em diante o servidor DERIVA os dois: mrr é espelho de valor_de_mrr (fica porque
   automações do HubSpot podem ler) e amount é valor_de_mrr x meses do período. Se o
   cliente mandar amount ou mrr, o valor derivado sobrescreve — não é validação, é fonte
   única. Sem período conhecido, amount não é inventado: fica como está. */
const MESES_DO_PERIODO = { 'Mensal': 1, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12 };
/* DERIVAR NUNCA SOBRESCREVE O QUE A PESSOA DIGITOU (corrigido em 03/09/26).
   A versao anterior derivava mrr e amount de valor_de_mrr e mandava por cima do que
   veio no pedido. Em Ag. Pagamento isso apagava, em silencio, exatamente os dois campos
   que o executivo preenche para o RPA gerar o link — o negocio chega naquela etapa com
   valor_de_mrr das etapas anteriores, entao a derivacao SEMPRE vencia.

   Agora a derivacao serve so de preenchimento de lacuna: se o pedido trouxe o campo, o
   valor do pedido manda. Isso mantem o que a derivacao resolvia (Demo/Proposta e
   Negociacao pedem so o mensal, e mrr/amount ficavam vazios no HubSpot) sem tirar a
   caneta da mao de quem esta na frente do cliente. */
function derivarDinheiro(finais, propriedades) {
  const mensal = Number(finais.valor_de_mrr);
  if (!isFinite(mensal) || mensal <= 0) return propriedades;
  const veio = chave => Object.prototype.hasOwnProperty.call(propriedades, chave);
  const saida = { ...propriedades };
  if (!veio('mrr')) saida.mrr = String(mensal);
  const meses = MESES_DO_PERIODO[String(finais.periodo_contratado || '').trim()];
  if (meses && !veio('amount')) saida.amount = String(Number((mensal * meses).toFixed(2)));
  return saida;
}

// ══ CEP E CNPJ SO DIGITOS (04/09/26) ══════════════════════════════════════════════
// O HubSpot RECUSA a escrita inteira quando eles chegam pontuados — medido em auditoria:
// "cep: Enter only numbers and letters, not special characters like -". O executivo
// digita 29050-000 porque e assim que se escreve um CEP. Conferido no CRM: os 543
// negocios com o campo preenchido guardam so digitos, entao limpar aqui e escrever no
// formato que a base ja usa. A tela tambem limpa; esta e a ultima linha, para os
// caminhos que nao passam por ela.
const PROPS_SO_DIGITOS = { cep: 8, cnpj_cpf: 14 };
// == DIGITO VERIFICADOR DE CPF E CNPJ (04/09/26) ===================================
// O RPA do Asaas recusa documento invalido e avisa por WhatsApp horas depois, com o
// contrato ja assinado — medido em auditoria. O caso do dia foi um CNPJ com 13 digitos
// em vez de 14: um zero a menos. A tela ja confere; esta e a ultima linha.
// Aceita CPF (11) e CNPJ (14) porque a base tem os dois no mesmo campo.
function cpfEhValido(d) {
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  for (let corte = 9; corte <= 10; corte++) {
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * (corte + 1 - i);
    let dv = (soma * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== Number(d[corte])) return false;
  }
  return true;
}
function cnpjEhValido(d) {
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const corte of [12, 13]) {
    const p = pesos.slice(13 - corte);
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * p[i];
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(d[corte])) return false;
  }
  return true;
}
function conferirCpfCnpj(digitos) {
  if (digitos.length === 11) return cpfEhValido(digitos) ? null : 'CPF invalido — confira o numero.';
  if (digitos.length === 14) return cnpjEhValido(digitos) ? null : 'CNPJ invalido — confira o numero.';
  return 'CPF tem 11 digitos e CNPJ tem 14 — vieram ' + digitos.length + '.';
}

// == TAMANHO MINIMO QUE O HUBSPOT EXIGE (04/09/26) =================================
// Medido em producao: o CRM recusou a mudanca de etapa inteira com "Insira pelo menos 50
// caracteres — informacoes_sobre_o_maior_desafio". A tela ja avisa e trava; esta e a
// ultima linha, para quem nao passa por ela. O conector nao expoe essa regra: ela so
// aparece quando o HubSpot recusa, entao cada uma descoberta vira uma linha aqui.
const PROPS_TAMANHO_MINIMO = { informacoes_sobre_o_maior_desafio: 50 };

function soDigitos(chave, texto) {
  if (!(chave in PROPS_SO_DIGITOS)) return { valor: texto, erro: null };
  const d = String(texto).replace(/[^0-9]/g, '');
  if (d.length > PROPS_SO_DIGITOS[chave]) {
    return { valor: null, erro: `"${chave}" tem ${d.length} dígitos e o HubSpot aceita ${PROPS_SO_DIGITOS[chave]}.` };
  }
  /* o documento tambem passa pelo digito verificador — ver conferirCpfCnpj */
  if (chave === 'cnpj_cpf') {
    const problema = conferirCpfCnpj(d);
    if (problema) return { valor: null, erro: problema };
  }
  return { valor: d, erro: null };
}

function limparPropriedades(bruto) {
  if (!bruto || typeof bruto !== 'object') return { propriedades: {}, erro: null };
  const propriedades = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (!PROPS_PERMITIDAS.includes(chave)) {
      return { propriedades: null, erro: `Propriedade não permitida por esta rota: "${chave}".` };
    }
    // String vazia é uma escrita válida no HubSpot: significa limpar a propriedade.
    // Antes ela era descartada, mas a API respondia sucesso e o valor antigo reaparecia.
    if (valor == null || String(valor).trim() === '') {
      propriedades[chave] = '';
      continue;
    }
    const texto = String(valor).trim();
    if (PROPS_NUMERICAS.includes(chave)) {
      const n = Number(texto);
      if (!isFinite(n) || n <= 0) return { propriedades: null, erro: `Valor inválido em "${chave}".` };
      if (PROPS_COM_PISO.includes(chave) && n < PISO_VALOR) return { propriedades: null, erro: `"${chave}" abaixo do piso de R$${PISO_VALOR}.` };
      propriedades[chave] = String(n);
      continue;
    }
    if (VALORES_PERMITIDOS[chave]) {
      const valores = chave === 'adicional' ? texto.split(';').map(v => v.trim()).filter(Boolean) : [texto];
      const invalidos = valores.filter(v => !VALORES_PERMITIDOS[chave].includes(v));
      if (invalidos.length) return { propriedades: null, erro: `Valor inválido em "${chave}".` };
      if (chave === 'adicional' && valores.includes('Sem adicionais') && valores.length > 1) {
        return { propriedades: null, erro: '"Sem adicionais" não pode ser combinado com outro adicional.' };
      }
    }
    if (chave === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) {
      return { propriedades: null, erro: 'E-mail inválido.' };
    }
    if (texto.length > 2000) return { propriedades: null, erro: `"${chave}" é longo demais.` };
    /* e o minimo, que e a recusa mais cara: derruba a passagem depois de os outros 14
       campos ja terem sido preenchidos. Ver PROPS_TAMANHO_MINIMO. */
    const minimo = PROPS_TAMANHO_MINIMO[chave] || 0;
    if (minimo && texto.length < minimo) {
      return { propriedades: null, erro: `"${chave}" precisa de pelo menos ${minimo} caracteres — vieram ${texto.length}.` };
    }
    /* CEP e CNPJ so digitos, e o documento passa pelo digito verificador — depois da
       trava de tamanho, nunca antes: um `continue` aqui em cima ja deixou a trava morta. */
    const limpo = soDigitos(chave, texto);
    if (limpo.erro) return { propriedades: null, erro: limpo.erro };
    propriedades[chave] = limpo.valor;
    continue;
  }
  return { propriedades, erro: null };
}

function campoPreenchido(valor) {
  return valor != null && String(valor).trim() !== '';
}

function validarExigenciasEtapa(deal, novaEtapa, propriedades) {
  const atuais = deal.properties || {};
  const finais = { ...atuais, ...propriedades };
  const obrigatorias = PROPS_OBRIGATORIAS_POR_ETAPA[novaEtapa] || [];
  const movendo = String(atuais.dealstage || '') !== String(novaEtapa);

  // Ao mover, a etapa precisa ficar integralmente válida. Numa edição inline da etapa
  // atual, não bloqueamos saneamento de dados legados, mas impedimos apagar um campo
  // que é obrigatório naquela etapa.
  const faltantes = movendo
    ? obrigatorias.filter(prop => !campoPreenchido(finais[prop]))
    : obrigatorias.filter(prop => Object.prototype.hasOwnProperty.call(propriedades, prop) && !campoPreenchido(finais[prop]));
  if (!faltantes.length) return null;
  return `A etapa de destino exige: ${faltantes.join(', ')}.`;
}

function validarMovimentoEtapa(deal, novaEtapa) {
  const atual = String((deal.properties || {}).dealstage || '');
  // Reciclagem (resgate) não é um degrau do funil — é um bucket lateral. Um negócio
  // parado em QUALQUER etapa aberta pode ser resgatado de volta pra lá, e um negócio
  // resgatado pode voltar a avançar depois. A regra "não pula fase" existe pra
  // impedir pular Prospecção→Ag.Pagamento direto, não se aplica aqui.
  if (String(novaEtapa) === ETAPA_RECICLAGEM || atual === ETAPA_RECICLAGEM) return null;
  // PERDIDO ISENTO NOS DOIS SENTIDOS. Ida: desistir é legítimo de qualquer etapa — exigir
  // que o negócio 'suba' até Negociação para poder ser perdido produziria etapa falsa no
  // histórico só para poder desistir. Volta: perda marcada por engano tem que ter
  // desfazer, senão o Cockpit oferece um botão sem saída — e o executivo aprende a nunca
  // usá-lo, que é o mesmo que a etapa não existir.
  if (String(novaEtapa) === ETAPA_PERDIDO || atual === ETAPA_PERDIDO) return null;
  const iAtual = ETAPAS_ABERTAS.indexOf(atual);
  const iNova = ETAPAS_ABERTAS.indexOf(String(novaEtapa));
  if (iAtual >= 0 && iNova > iAtual + 1) {
    return 'O pipeline Field Sales não permite pular fases. Conclua a próxima etapa antes de avançar.';
  }
  return null;
}

/* ══ AS ETAPAS EM QUE O NEGOCIO SAI DA MAO DO EXECUTIVO ═══════════════════════════════
   Onboarding e Ganho: vendeu, a entrega e de outro time. Perdido: acabou.
   Reciclagem NAO entra — reciclar e justamente combinar um toque novo, e a tarefa dele
   e o proximo passo desse toque. */
const ETAPAS_QUE_ENCERRAM_TAREFAS = [ETAPA_GANHO, '1396006163', ETAPA_PERDIDO];

/* Fecha as tarefas ABERTAS do negocio. Devolve {fechadas, erro} — best-effort, e nunca
   silenciosa: a etapa ja mudou quando isto roda, entao falhar aqui nao pode desfazer a
   venda, mas tarefa que sobra aberta e o defeito que isto existe para resolver. */
async function fecharTarefasDoNegocio(token, dealId) {
  try {
    const r = await fetch(
      `https://api.hubapi.com/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/tasks?limit=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) return { fechadas: 0, erro: 'HTTP ' + r.status + ' ao listar as tarefas do negocio' };
    const lista = await r.json().catch(() => ({}));
    const ids = ((lista && lista.results) || []).map(x => String(x.toObjectId || x.id || '')).filter(Boolean);
    if (!ids.length) return { fechadas: 0, erro: null };

    /* SO AS ABERTAS. Ler antes de escrever custa uma chamada e evita marcar como
       concluida uma tarefa que alguem ja tinha fechado — o historico do CRM ficaria
       com a data errada, e data errada em historico e pior do que tarefa aberta. */
    const rl = await fetch('https://api.hubapi.com/crm/v3/objects/tasks/batch/read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: ['hs_task_status'], inputs: ids.map(id => ({ id: id })) })
    });
    if (!rl.ok) return { fechadas: 0, erro: 'HTTP ' + rl.status + ' ao ler o status das tarefas' };
    const det = await rl.json().catch(() => ({}));
    const abertas = ((det && det.results) || [])
      .filter(x => String((x.properties || {}).hs_task_status || '') !== 'COMPLETED')
      .map(x => String(x.id));
    if (!abertas.length) return { fechadas: 0, erro: null };

    const ru = await fetch('https://api.hubapi.com/crm/v3/objects/tasks/batch/update', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: abertas.map(id => ({ id: id, properties: { hs_task_status: 'COMPLETED' } }))
      })
    });
    if (!ru.ok) return { fechadas: 0, erro: 'HTTP ' + ru.status + ' ao fechar as tarefas' };
    return { fechadas: abertas.length, erro: null };
  } catch (e) {
    return { fechadas: 0, erro: 'excecao ao fechar tarefas: ' + String(e.message || e) };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão Supabase válida (mesmo padrão de criar-tarefa-rota.js) ----
  let emailLogado = null;
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  // ---- 2. papel de quem chamou ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  // ---- 3. dados do pedido ----
  const { dealId, novaEtapa, propriedades } = req.body || {};
  if (!dealId || !novaEtapa) return res.status(400).json({ erro: 'Faltam campos obrigatórios: dealId e novaEtapa.' });
  if (!ETAPAS_DESTINO.includes(String(novaEtapa))) {
    return res.status(400).json({ erro: 'Etapa inválida — esta rota move entre as etapas abertas do funil e Perdido.' });
  }

  const limpeza = limparPropriedades(propriedades);
  if (limpeza.erro) return res.status(400).json({ erro: limpeza.erro });

  try {
    // Nunca confia em owner/pipeline/etapa enviados pelo navegador. O HubSpot é a
    // fonte de verdade e é consultado imediatamente antes de qualquer escrita.
    const guard = await buscarDealAutorizado({
      token, dealId, usuario, propriedades: PROPS_PERMITIDAS
    });
    if (guard.erro) return res.status(guard.erro.status).json({ erro: guard.erro.mensagem });
    const erroMovimento = validarMovimentoEtapa(guard.deal, String(novaEtapa));
    if (erroMovimento) return res.status(400).json({ erro: erroMovimento });
    const erroExigencias = validarExigenciasEtapa(guard.deal, String(novaEtapa), limpeza.propriedades);
    if (erroExigencias) return res.status(400).json({ erro: erroExigencias });

    /* DINHEIRO DERIVADO, DEPOIS DA VALIDACAO E ANTES DA ESCRITA. Depois porque a
       exigencia da etapa e sobre o que a PESSOA preencheu; antes porque o PATCH e um so
       e tudo tem que ir junto. O derivado PREENCHE LACUNA e nao sobrescreve: campo que
       veio no pedido manda — ver derivarDinheiro(). */
    const finaisParaDerivar = { ...(guard.deal.properties || {}), ...limpeza.propriedades };
    const propriedadesFinais = derivarDinheiro(finaisParaDerivar, limpeza.propriedades);

    // Etapa e propriedades no MESMO PATCH de propósito: se fossem duas chamadas e a
    // segunda falhasse, o negócio ficaria na etapa nova sem os dados que a etapa exige
    // — exatamente o buraco que este bloco existe pra fechar. Uma escrita, tudo ou nada.
    const resp = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { ...propriedadesFinais, dealstage: String(novaEtapa) } })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({ erro: 'HubSpot recusou a mudança de etapa: ' + (data.message || 'sem mensagem'), detalhe: data });
    }
    /* ══ E AS TAREFAS PENDENTES ACABAM COM ELE (11/09/26) ═══════════════════════════
       Julyan: "enviado pra onboarding nao precisa ir pras tarefas da aba hoje".
       Medido no CRM antes de mexer: 12 tarefas abertas em negocios que ja estavam em
       Onboarding, oito delas do Marco, uma vencendo no proprio dia. O cockpit ja nao
       CRIAVA passo ao mover para ca; o que faltava era fechar o que a etapa anterior
       tinha deixado aberto.
       Depois do PATCH de proposito: a etapa e o que importa, e ela ja esta gravada. */
    let tarefas = { fechadas: 0, erro: null };
    if (ETAPAS_QUE_ENCERRAM_TAREFAS.includes(String(novaEtapa))) {
      tarefas = await fecharTarefasDoNegocio(token, dealId);
    }
    return res.status(200).json({
      ok: true, id: dealId, novaEtapa: String(novaEtapa),
      propriedadesGravadas: Object.keys(limpeza.propriedades),
      tarefasFechadas: tarefas.fechadas,
      tarefasFalhou: tarefas.erro,
      url: `https://app.hubspot.com/contacts/24373118/record/0-3/${dealId}`
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};

  },
  "lib/hubspot-deal-guard.js": function (module, exports, require, process) {
'use strict';

const PIPELINE_FIELD_SALES = '916011864';

function erro(status, mensagem) {
  return { status, mensagem };
}

async function buscarDealAutorizado({ token, dealId, usuario, propriedades = [] }) {
  const id = String(dealId || '').trim();
  if (!id) return { erro: erro(400, 'Falta o dealId.') };
  if (!usuario || !['manager', 'rep'].includes(usuario.role)) {
    return { erro: erro(403, 'Papel de usuário não autorizado a editar negócios.') };
  }

  const props = [...new Set(['dealname', 'pipeline', 'dealstage', 'hubspot_owner_id', ...propriedades])];
  let resposta;
  try {
    resposta = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(id)}?properties=${encodeURIComponent(props.join(','))}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e) {
    return { erro: erro(502, 'Não foi possível consultar o negócio no HubSpot: ' + String(e.message || e)) };
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    return {
      erro: erro(
        resposta.status === 404 ? 404 : 502,
        resposta.status === 404
          ? 'Negócio não encontrado no HubSpot.'
          : 'O HubSpot recusou a validação do negócio: ' + (dados.message || 'sem mensagem')
      )
    };
  }

  const deal = { ...dados, properties: dados.properties || {} };
  if (String(deal.properties.pipeline || '') !== PIPELINE_FIELD_SALES) {
    return { erro: erro(403, 'Esse negócio não pertence ao pipeline Field Sales.') };
  }
  if (usuario.role === 'rep') {
    if (!usuario.ownerId || String(usuario.ownerId).startsWith('pendente_')) {
      return { erro: erro(403, 'Seu usuário ainda não tem owner do HubSpot configurado.') };
    }
    if (String(deal.properties.hubspot_owner_id || '') !== String(usuario.ownerId)) {
      return { erro: erro(403, 'Esse negócio não é seu — somente o dono ou um gestor pode alterá-lo.') };
    }
  }

  return { deal, ownerId: deal.properties.hubspot_owner_id ? String(deal.properties.hubspot_owner_id) : null };
}

async function removerObjetoHubSpot(token, tipo, id) {
  if (!id) return false;
  try {
    const resposta = await fetch(`https://api.hubapi.com/crm/v3/objects/${tipo}/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    return resposta.ok;
  } catch (e) {
    return false;
  }
}

module.exports = { PIPELINE_FIELD_SALES, buscarDealAutorizado, removerObjetoHubSpot };

  },
  "lib/acoes-negocio/criar-nota-negocio.js": function (module, exports, require, process) {
// api/criar-nota-negocio.js
// Função serverless da Vercel — mesma arquitetura de api/criar-tarefa-rota.js.
//
// CONSOLIDAÇÃO (15/08/26) — limite de 12 funções serverless do plano Hobby da Vercel:
// este arquivo agora cobre DOIS propósitos que antes eram dois endpoints separados
// (criar-nota-negocio.js + criar-proximo-passo.js). Precisei abrir espaço pra
// api/hubspot-webhook.js sem passar do limite. A lógica de cada um não mudou NADA —
// só foram colocados atrás de um discriminador `tipo` no corpo da requisição:
//   tipo ausente ou 'nota'    → cria uma NOTE associada ao negócio (comportamento
//                               idêntico ao antigo criar-nota-negocio.js)
//   tipo === 'proximo-passo'  → cria uma TASK associada ao negócio (comportamento
//                               idêntico ao antigo criar-proximo-passo.js)
//
// Objetivo original (Julyan, 14/08/26): nota escrita no Cockpit vira uma NOTE de
// verdade no HubSpot, associada ao negócio — aparece no timeline dele, pra quem
// abrir lá. Próximo passo vira uma TASK, mesmo padrão.
//
// As duas usam a associação PADRÃO do HubSpot (crm/v4 .../associations/default/...)
// em vez de um ID numérico de tipo de associação chutado — esse ID varia por
// portal/config, e chutar errado criaria um objeto ÓRFÃO (existe no HubSpot, mas não
// aparece em lugar nenhum do negócio) sem erro nenhum aparecer aqui. A rota "default"
// deixa o próprio HubSpot resolver o tipo certo.
//
// Variáveis de ambiente na Vercel: HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY.

let USUARIOS = [];
try {
  const raw = require('../../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

const { buscarDealAutorizado, removerObjetoHubSpot } = require('../hubspot-deal-guard');
/* O MARCADOR QUE O PWA LÊ mora num módulo só — as duas rotas que criam tarefa o usam. */
const { linhaDoMarcador } = require('./marcador-do-plano');

const TIPOS_PASSO = {
  'follow-up': 'Follow-up',
  visita: 'Visita',
  reuniao: 'Reunião',
  reunião: 'Reunião',
  demo: 'Demo'
};

/* QUALIFICAÇÃO (28/08/26) — terceira coisa que este arquivo cobre, pelo MESMO motivo
   que ele já cobria duas: o limite de 12 funções serverless do plano Hobby.
   Eu tinha criado api/qualificar-negocio.js e com isso o projeto foi a 13 funções — o
   deploy da Vercel passou a falhar, e produção ficou servindo o último deploy que deu
   certo. O limite já estava documentado no topo deste arquivo desde 15/08 e eu passei
   por cima dele. A rota separada foi removida e virou este trecho.

   A consolidação saiu melhor que a rota separada, e não pior: a tela já fazia POST
   aqui para criar a tarefa do próximo passo, então a qualificação viaja no MESMO
   request. Some a ida e volta extra, e o "grava a dor antes de marcar a tarefa" deixa
   de depender de duas chamadas em sequência no navegador — vira ordem de execução
   dentro de um único handler.

   Continua sendo whitelist de DUAS propriedades e mais nada. */
const ETAPAS_QUALIFICAVEIS = ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473', '1398311191'];

/* MESMA lista do OP_GARGALO da tela (template/cockpit.template.html). Duplicada aqui
   de propósito: o servidor não pode confiar no que o navegador manda, e a propriedade
   no HubSpot é enumeração — valor fora da lista volta como erro cru da API. Validar
   aqui devolve mensagem que se entende. Se a lista mudar na tela, muda aqui também. */
const OP_GARGALO = ['Fila', 'Falta de Garçom', 'Falta de Gestão', 'Sem fidelização', 'Demora na divisão de contas', 'Estoque'];

/* Grava as duas propriedades de qualificação, se vieram. Devolve { erro } para o
   chamador abortar, ou { props } com o que foi gravado (vazio se nada veio).
   Roda ANTES de criar a tarefa de propósito: tarefa datada em cima de negócio que
   segue cego é exatamente o estado que produziu 49 negócios em Visita sem nada
   registrado. Se a qualificação falha, não existe próximo passo. */
async function gravarQualificacao({ token, dealId, deal, qualificacao }) {
  if (!qualificacao || typeof qualificacao !== 'object') return { props: {} };

  const etapa = String((deal && deal.properties && deal.properties.dealstage) || '');
  if (!ETAPAS_QUALIFICAVEIS.includes(etapa)) {
    return { erro: { status: 403, mensagem: 'Só dá pra qualificar negócio em etapa aberta do funil.' } };
  }

  const props = {};
  const sistema = qualificacao.nomeDoSistema;
  if (sistema != null && String(sistema).trim() !== '') {
    const s = String(sistema).trim();
    if (s.length > 120) return { erro: { status: 400, mensagem: 'Nome do sistema muito longo (máximo 120 caracteres).' } };
    props.nome_do_sistema = s;
  }
  const gargalo = qualificacao.gargalo;
  if (gargalo != null && String(gargalo).trim() !== '') {
    const g = String(gargalo).trim();
    if (!OP_GARGALO.includes(g)) {
      return { erro: { status: 400, mensagem: `Dor inválida. Use uma destas: ${OP_GARGALO.join(', ')}.` } };
    }
    props.gargalo_operacional = g;
  }
  if (Object.keys(props).length === 0) return { props: {} };

  try {
    const patch = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: props })
    });
    if (!patch.ok) {
      const det = await patch.json().catch(() => ({}));
      return { erro: { status: patch.status, mensagem: det.message || 'O HubSpot recusou a qualificação.' } };
    }
  } catch (e) {
    return { erro: { status: 502, mensagem: 'Falha ao gravar a qualificação: ' + String(e.message || e) } };
  }
  return { props };
}

async function tratarNota(req, res, usuario, emailLogado, token) {
  const { dealId, texto } = req.body || {};
  if (!dealId || !texto || !String(texto).trim()) return res.status(400).json({ erro: 'Faltam campos obrigatórios: dealId e texto.' });

  const guard = await buscarDealAutorizado({ token, dealId, usuario });
  if (guard.erro) return res.status(guard.erro.status).json({ erro: guard.erro.mensagem });

  // Assina a nota com quem escreveu — o HubSpot não faz isso sozinho quando a nota
  // entra via API com o token da integração (apareceria como se ninguém tivesse escrito).
  const corpo = `${String(texto).trim()}\n\n— ${usuario.nome || emailLogado} (via Cockpit)`;

  let notaId = null;
  try {
    const criar = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          hs_note_body: corpo,
          hs_timestamp: String(Date.now()),
          hubspot_owner_id: guard.ownerId || undefined
        }
      })
    });
    const data = await criar.json().catch(() => ({}));
    if (!criar.ok) {
      return res.status(criar.status).json({ etapa: 'criacao', erro: 'HubSpot recusou a criação da nota: ' + (data.message || 'sem mensagem'), detalhe: data });
    }
    notaId = data.id;
  } catch (e) {
    return res.status(500).json({ etapa: 'criacao', erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }

  try {
    const assoc = await fetch(`https://api.hubapi.com/crm/v4/objects/notes/${notaId}/associations/default/deals/${encodeURIComponent(dealId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!assoc.ok) {
      const det = await assoc.json().catch(() => ({}));
      const removida = await removerObjetoHubSpot(token, 'notes', notaId);
      return res.status(502).json({
        ok: false, etapa: 'associacao',
        erro: 'O HubSpot não associou a nota ao negócio; a operação foi cancelada' + (removida ? ' e a nota solta foi removida.' : ', mas não foi possível remover a nota solta automaticamente.'),
        detalhe: det
      });
    }
  } catch (e) {
    const removida = await removerObjetoHubSpot(token, 'notes', notaId);
    return res.status(502).json({
      ok: false, etapa: 'associacao',
      erro: 'Falha ao associar a nota ao negócio' + (removida ? '; a nota solta foi removida.' : '; não foi possível remover a nota solta automaticamente.')
    });
  }

  return res.status(200).json({ ok: true, id: notaId, associada: true });
}

async function tratarProximoPasso(req, res, usuario, token) {
  const { dealId, texto, data, tipo, hora } = req.body || {};
  if (!dealId || !texto || !String(texto).trim() || !data) {
    return res.status(400).json({ erro: 'Faltam campos obrigatórios: dealId, texto e data.' });
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data).trim());
  if (!m) return res.status(400).json({ erro: 'Campo "data" deve estar no formato AAAA-MM-DD.' });
  const ano = Number(m[1]), mes = Number(m[2]) - 1, dia = Number(m[3]);
  const teste = new Date(Date.UTC(ano, mes, dia));
  if (teste.getUTCFullYear() !== ano || teste.getUTCMonth() !== mes || teste.getUTCDate() !== dia) {
    return res.status(400).json({ erro: 'Data inválida.' });
  }

  const guard = await buscarDealAutorizado({ token, dealId, usuario });
  if (guard.erro) return res.status(guard.erro.status).json({ erro: guard.erro.mensagem });

  // Qualificação primeiro: se ela falhar, não se cria tarefa nenhuma (ver comentário
  // em gravarQualificacao). O guard acima já garantiu pipeline e dono deste negócio.
  const qual = await gravarQualificacao({
    token, dealId, deal: guard.deal, qualificacao: req.body && req.body.qualificacao
  });
  if (qual.erro) return res.status(qual.erro.status).json({ erro: qual.erro.mensagem });

  // "tipo" aqui é o TIPO DO PASSO (Follow-up/Visita/Reunião/Demo) — nada a ver com o
  // "tipo" de nível mais alto que escolhe entre nota/próximo-passo nesta rota.
  const tipoNormalizado = tipo == null ? null : TIPOS_PASSO[String(tipo).trim().toLowerCase()];
  if (tipo != null && !tipoNormalizado) {
    return res.status(400).json({ erro: 'Tipo de próximo passo inválido.' });
  }
  const assuntoLivre = String(texto).trim();
  const assunto = tipoNormalizado ? `${tipoNormalizado} - ${assuntoLivre}` : assuntoLivre;

  /* ══ A HORA DO COMPROMISSO (11/09/26) ═══════════════════════════════════════════
     Bruno: "tô agendando esse lead para uma reunião terça às 15h". Até aqui esta linha
     cravava 12:00 UTC — 09:00 de Brasília — para TODO passo datado, e o comentário
     antigo explicava por quê: "o próximo passo aqui é só data, sem hora". Era verdade
     sobre o formulário, não sobre o que o executivo precisa.

     09:00 CONTINUA SENDO O PADRÃO quando ele não escolhe hora — é a mesma convenção de
     'compromisso do dia' do resto do cockpit, e mudá-la faria toda tarefa antiga
     divergir do espelho. O que muda é que agora existe escolha.

     VALIDAÇÃO ESTRITA: hora em formato errado seria hora inventada num compromisso com
     cliente. Formato inválido recusa em vez de cair no padrão em silêncio — cair no
     padrão é como o executivo marca 15h, lê '✓ salvo' e aparece às 9h. */
  let horaH = 9, horaM = 0;
  if (hora != null && String(hora).trim() !== '') {
    const mh = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(String(hora).trim());
    if (!mh) return res.status(400).json({ erro: 'Campo "hora" deve estar no formato HH:MM.' });
    horaH = Number(mh[1]); horaM = Number(mh[2]);
  }
  const dataTarefaMs = Date.UTC(ano, mes, dia, horaH + 3, horaM, 0);

  // == NAO CRIA TAREFA GEMEA (10/09/26) =============================================
  // MEDIDO no CRM: o LUMIERE BISTRO & CAFE recebeu duas tarefas com o assunto IDENTICO
  // em 09/09, as 19:19:44 e as 19:19:47 — tres segundos de diferenca. Nao foi clique
  // duplo (o painel fecha antes de escrever): sao duas passagens seguidas caindo na
  // MESMA regua de cadencia, que e indexada por SITUACAO e nao por etapa. Na base
  // inteira ha 21 duplicatas identicas assim.
  //
  // A TELA JA EVITA O CASO COMUM (ver fn3PassoAbertoDoLead: passagem nao planta um
  // segundo passo). Esta e a ultima linha, e ela existe porque sao SEIS os lugares que
  // criam proximo passo — a trava tem de morar onde a escrita acontece, e nao em cada
  // chamador.
  //
  // SO LE E RECUSA: nenhuma tarefa e alterada ou apagada aqui. E a busca e por
  // ASSOCIACAO ao negocio, nao por assunto no portal — "Follow-up - Identificar o nome e
  // o horario do decisor" e um assunto que aparece em varios negocios ao mesmo tempo, e
  // casar por texto solto recusaria a tarefa legitima de outro negocio.
  try {
    const rAssoc = await fetch(
      `https://api.hubapi.com/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/tasks?limit=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (rAssoc.ok) {
      const dAssoc = await rAssoc.json().catch(() => ({}));
      const ids = (dAssoc.results || []).map(x => String(x.toObjectId || x.id)).filter(Boolean);
      if (ids.length) {
        const rLote = await fetch('https://api.hubapi.com/crm/v3/objects/tasks/batch/read', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: ['hs_task_subject', 'hs_task_status', 'hs_timestamp'],
            inputs: ids.slice(0, 100).map(id => ({ id: id }))
          })
        });
        if (rLote.ok) {
          const dLote = await rLote.json().catch(() => ({}));
          const alvo = assunto.slice(0, 200).trim().toLowerCase();
          const gemea = (dLote.results || []).find(function (t) {
            const p = t.properties || {};
            if (String(p.hs_task_status || '') !== 'NOT_STARTED') return false;
            if (String(p.hs_task_subject || '').trim().toLowerCase() !== alvo) return false;
            /* mesmo DIA, e nao mesmo instante: a tarefa nasce as 12:00 UTC, mas quem
               editou a data no HubSpot pode ter deixado outra hora. */
            const ms = Number(p.hs_timestamp);
            const quando = isFinite(ms) ? new Date(ms) : new Date(String(p.hs_timestamp || ''));
            if (isNaN(quando.getTime())) return false;
            return quando.getUTCFullYear() === ano && quando.getUTCMonth() === mes
              && quando.getUTCDate() === dia;
          });
          if (gemea) {
            return res.status(200).json({
              ok: true, id: String(gemea.id), jaExistia: true, criada: false,
              aviso: 'Este negócio já tinha esta tarefa aberta nesta data — não criei outra.'
            });
          }
        }
      }
    }
    // busca falhando NAO impede a criacao: o proximo passo e o que sustenta o funil, e
    // deixar de criar por causa de uma leitura e trocar duplicata por negocio descoberto.
  } catch (e) { /* idem: a trava e uma rede, nao uma porteira */ }

  let taskId = null;
  try {
    const criar = await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          hs_task_subject: assunto.slice(0, 200),
          /* O CORPO EXISTE POR CAUSA DO PWA (11/09/26). Esta tarefa nascia sem corpo
             nenhum — e o documento que foi para o time do RPA diz que TODA tarefa criada
             pelo Cockpit leva o marcador de plano. Era falso justamente para a rota que
             o executivo mais usa: o próximo passo datado da ficha do negócio.
             O formato mora em lib/acoes-negocio/marcador-do-plano.js, um lugar só, porque
             duas cópias de um formato que um sistema de fora lê divergem na primeira
             mudança — e divergem em silêncio, com cada rota tendo seu próprio teste. */
          hs_task_body: linhaDoMarcador({
            ownerId: guard.ownerId, ano: ano, mes: mes + 1, dia: dia,
            hora: horaH, minuto: horaM, tipo: tipoNormalizado || 'visita',
            origem: 'funil', dealId: dealId
          }),
          hs_task_status: 'NOT_STARTED',
          hs_task_type: 'TODO',
          hs_timestamp: String(dataTarefaMs),
          hubspot_owner_id: guard.ownerId || undefined
        }
      })
    });
    const respData = await criar.json().catch(() => ({}));
    if (!criar.ok) {
      return res.status(criar.status).json({ etapa: 'criacao', erro: 'HubSpot recusou a criação da tarefa: ' + (respData.message || 'sem mensagem'), detalhe: respData });
    }
    taskId = respData.id;
  } catch (e) {
    return res.status(500).json({ etapa: 'criacao', erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }

  try {
    const assoc = await fetch(`https://api.hubapi.com/crm/v4/objects/tasks/${taskId}/associations/default/deals/${encodeURIComponent(dealId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!assoc.ok) {
      const det = await assoc.json().catch(() => ({}));
      const removida = await removerObjetoHubSpot(token, 'tasks', taskId);
      return res.status(502).json({
        ok: false, etapa: 'associacao',
        erro: 'O HubSpot não associou a tarefa ao negócio; a operação foi cancelada' + (removida ? ' e a tarefa solta foi removida.' : ', mas não foi possível remover a tarefa solta automaticamente.'),
        detalhe: det
      });
    }
  } catch (e) {
    const removida = await removerObjetoHubSpot(token, 'tasks', taskId);
    return res.status(502).json({
      ok: false, etapa: 'associacao',
      erro: 'Falha ao associar a tarefa ao negócio' + (removida ? '; a tarefa solta foi removida.' : '; não foi possível remover a tarefa solta automaticamente.')
    });
  }

  // `qualificacao` volta pro cliente espelhar no DATA em memória — sem isso a ficha
  // continuaria cobrando o que acabou de ser gravado, até o próximo sync.
  return res.status(200).json({
    ok: true, id: taskId, associada: true,
    qualificacao: Object.keys(qual.props).length ? qual.props : null,
    url: `https://app.hubspot.com/contacts/24373118/record/0-27/${taskId}`
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão Supabase válida ----
  let emailLogado = null;
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  // ---- 2. papel de quem chamou ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  // ---- 3. despacha pro tratamento certo ----
  const tipoAcao = (req.body && req.body.tipoAcao) || 'nota';
  if (tipoAcao === 'proximo-passo') return tratarProximoPasso(req, res, usuario, token);
  return tratarNota(req, res, usuario, emailLogado, token);
};

  },
  "lib/acoes-negocio/marcador-do-plano.js": function (module, exports, require, process) {
// lib/acoes-negocio/marcador-do-plano.js
//
// O MARCADOR DE MÁQUINA QUE O PWA LÊ — UM LUGAR SÓ.
// ---------------------------------------------------------------------------------------
// Nasceu dentro de criar-tarefa-rota.js em 11/09/26 e saiu para cá no mesmo dia, quando a
// SEGUNDA rota que cria tarefa (criar-nota-negocio.js, o "próximo passo" da ficha) passou
// a precisar dele. Duas cópias de um formato que um sistema de fora lê divergem na primeira
// mudança — e divergem em silêncio, porque cada rota tem seu próprio teste.
//
// O CONTRATO, documentado para o time do PWA:
//
//   COCKPIT:PLANO:v1:<ownerId>:<AAAA-MM-DD>:<HH:MM>:<visita|reuniao>:<origem>:<dealId|->
//
// · a VERSÃO vem primeiro para quem lê ancorar nela e ignorar formato que não conhece;
//   campos novos entram no FIM, nunca no meio;
// · `-` no lugar do dealId quando o negócio ainda não existe — campo vazio some no split
//   e desloca todos os que vêm depois;
// · a data e a hora são as da tarefa, em horário de Brasília, montadas dos MESMOS números
//   que montaram o hs_timestamp. Quem lê não precisa converter fuso, e um desencontro
//   entre os dois aparece na hora.
//
// ONDE ELE VIVE NO CORPO: última linha, SEMPRE. A primeira é lida por posição pelo
// marcador de sugestão do gestor (`/^SUGESTAO_GESTOR:/`), e o plano lá cegaria a
// confirmação de sugestão.

/* AS ORIGENS SÃO LISTA FECHADA porque a origem é MEDIDA depois: "quantas visitas nasceram
   no Planejamento contra quantas nasceram no funil" só existe com origem de nome fechado.
   Texto livre vindo do navegador viraria uma coluna que ninguém consegue agrupar. */
const ORIGEM_ROTULO = {
  planejamento: 'visita posta na semana pelo Planejamento do Cockpit.',
  daily: 'visita posta no dia pela Minha Daily do Cockpit.',
  funil: 'proximo passo datado na ficha do negocio, no Meu funil do Cockpit.',
  mapa: 'conta-alvo adicionada a rota pelo mapa do Cockpit.',
  cockpit: 'conta-alvo adicionada a rota do dia pelo Cockpit (Rota & Agenda).'
};

function origemValida(bruta) {
  return ORIGEM_ROTULO[String(bruta || '')] ? String(bruta) : 'cockpit';
}

/* O ELO COM O NEGÓCIO. Só dígitos: id do HubSpot é numérico, e qualquer outra coisa aqui é
   ruído do navegador entrando num campo que um robô vai ler — inclusive dois-pontos, que
   quebraria o formato inteiro. */
function dealIdValido(bruto) {
  return /^[0-9]+$/.test(String(bruto || '')) ? String(bruto) : '';
}

function do2(v) { return String(v).padStart(2, '0'); }

/* `tipo` aceita as duas grafias que as rotas usam hoje: a delas ('visita'/'reuniao') e a do
   passo da ficha ('Follow-up'/'Visita'/'Reunião'/'Demo'). Sai sempre em minúscula sem
   acento, porque é campo de máquina. */
function tipoNormalizado(bruto) {
  const t = String(bruto || 'visita').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t.indexOf('reuni') === 0) return 'reuniao';
  if (t.indexOf('demo') === 0) return 'demo';
  if (t.indexOf('follow') === 0) return 'follow_up';
  return 'visita';
}

/* MONTA A LINHA a partir dos números que a rota já tem na mão. Devolve string — quem chama
   decide onde põe, e todas põem no fim. */
function linhaDoMarcador({ ownerId, ano, mes, dia, hora, minuto, tipo, origem, dealId }) {
  return 'COCKPIT:PLANO:v1:' + String(ownerId)
    + ':' + String(ano) + '-' + do2(mes) + '-' + do2(dia)
    + ':' + do2(hora) + ':' + do2(minuto)
    + ':' + tipoNormalizado(tipo)
    + ':' + origemValida(origem)
    + ':' + (dealIdValido(dealId) || '-');
}

module.exports = { ORIGEM_ROTULO, origemValida, dealIdValido, tipoNormalizado, linhaDoMarcador };

  },
  "lib/acoes-negocio/criar-tarefa-rota.js": function (module, exports, require, process) {
// api/criar-tarefa-rota.js
// Função serverless da Vercel — mesma arquitetura do criar-negocio.js: o navegador
// nunca conhece o HUBSPOT_TOKEN; manda só os dados da conta-alvo + o token de sessão
// do Supabase, e esta rota valida tudo antes de escrever no HubSpot.
//
// Objetivo (Julyan, 08/08/26): quando o executivo adiciona uma conta-alvo à rota do
// dia (mapa da aba Rota & Agenda), a visita PRECISA aparecer sozinha na Agenda — sem
// depender de ele também marcar no Expogo. Esta rota cria uma TAREFA no HubSpot com
// o mesmo formato que o Expogo já usa ("Visita - <restaurante>"), reaproveitando 100%
// do reconhecimento que já existe: fetch-hubspot.js, agendaTipoDoTexto (Agenda) e
// visitasTarefasHojeByOwner (contagem da Daily) já sabem ler esse padrão — nenhuma
// lógica nova de leitura foi criada, só a escrita.
//
// Variáveis de ambiente na Vercel (as mesmas já usadas pelo criar-negocio.js):
//   HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY

/* O MARCADOR QUE O PWA LE — um lugar so, compartilhado com criar-nota-negocio.js.
   Duas copias de um formato que um sistema de fora le divergem na primeira mudanca, e
   divergem em silencio: cada rota tem o seu proprio teste. */
const { ORIGEM_ROTULO, origemValida, dealIdValido, linhaDoMarcador } = require('./marcador-do-plano');

// usuarios.json vai junto no deploy (require com caminho estático é empacotado pela Vercel).
let USUARIOS = [];
try {
  const raw = require('../../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  // FAIL-CLOSED (mesmo padrão do criar-negocio.js): sem as três variáveis de ambiente
  // a rota se recusa a operar, em vez de pular a checagem de sessão.
  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão Supabase válida ----
  let emailLogado = null;
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  // ---- 2. papel de quem chamou ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  // ---- 3. dados da conta-alvo ----
  const { nome, ownerId, bairro, cidade, horaPrevista, data, acao } = req.body || {};
  if (!nome || !ownerId) return res.status(400).json({ erro: 'Faltam campos obrigatórios: nome e ownerId.' });
  const acaoNormalizada = String(acao || 'criar');
  if (!['criar', 'remover'].includes(acaoNormalizada)) return res.status(400).json({ erro: 'Ação inválida.' });

  // Escopo por papel: executivo só cria tarefa pra si mesmo; gestor pode criar pra
  // qualquer um do time (ex.: montando a rota de alguém junto no 1:1).
  if (usuario.role !== 'manager' && String(ownerId) !== String(usuario.ownerId)) {
    return res.status(403).json({ erro: 'Executivo só pode adicionar visita à própria rota — peça ao gestor para atribuir a outro dono.' });
  }

  // BLOCO 34 (13/08/26) — Julyan: "a agenda do executivo sempre tem que estar
  // preenchida, com follows e reuniões" + "o gestor pode adicionar leads nessa agenda".
  // Duas peças novas, sem mexer no contrato existente (tipo e sugeridoPorGestor são
  // opcionais; quem já chama esta rota sem eles continua recebendo "Visita - X" normal):
  //
  // 1) `tipo`: 'visita' (padrão, mantém "Visita - X") ou 'reuniao' ("Reunião - X").
  //    O prefixo é tudo que o resto do cockpit precisa — agendaTipoDoTexto já classifica
  //    por esse padrão (nenhuma lógica nova de leitura, só a escrita, mesma régua do
  //    comentário no topo deste arquivo).
  //
  // 2) `sugeridoPorGestor`: só tem efeito quando quem chama é o PRÓPRIO gestor (nunca
  //    confie em flag mandada pelo navegador sozinha — settei's aceitas aqui vêm do
  //    `usuario.role` já validado acima, não do body). Grava um marcador de MÁQUINA na
  //    primeira linha do corpo da tarefa: "SUGESTAO_GESTOR:<nome do gestor>:PENDENTE".
  //    Corpo, não assunto — o assunto "Reunião - X"/"Visita - X" tem que continuar
  //    batendo com AGENDA_RE_TITULO/agendaTipoDoTexto sem alteração nenhuma; o próprio
  //    comentário acima já avisa: mexer no PREFIXO do assunto quebra esse parsing em
  //    cadeia (agendaNomeDoLead, contagem da Daily, tudo). O corpo é lido à parte
  //    (campo `obs` do evento) e nunca participa dessas regras.
  const TIPOS_VALIDOS = { visita: 'Visita', reuniao: 'Reunião' };
  // CORREÇÃO (17/08/26, bug real em produção: tarefa criada como "undefined - FARTOS"
  // no HubSpot, hs_task_subject sujo desde a origem) — a lógica anterior
  // (`TIPOS_VALIDOS[String(...)] ? ... : 'visita'`) dependia de uma cadeia de
  // truthy/falsy fácil de escapar. Reescrita como comparação direta e explícita:
  // só vira 'reuniao' se o body pedir exatamente isso, senão é sempre 'visita'.
  // Impossível de resultar em undefined — não existe terceiro valor possível.
  const tipoPedido = (req.body && req.body.tipo === 'reuniao') ? 'reuniao' : 'visita';

  // DE QUE TELA VEIO. A prosa dizia "Rota & Agenda" para TODAS as origens — inclusive
  // para a visita posta na semana pelo Planejamento, que e de onde vem a maior parte
  // delas hoje. Frase cravada que mente e pior do que frase ausente: quem le a tarefa no
  // HubSpot procura no lugar errado. Lista fechada porque a origem e MEDIDA depois.
  /* A LISTA DE ORIGENS E A VALIDACAO DO dealId vivem em marcador-do-plano.js desde
     11/09/26, quando a rota do proximo passo passou a escrever o mesmo marcador. Duas
     copias de um formato que um sistema de fora le divergem na primeira mudanca. */
  const origem = origemValida(req.body && req.body.origem);
  const dealId = dealIdValido(req.body && req.body.dealId);
  const prefixoAssunto = TIPOS_VALIDOS[tipoPedido];
  const sugeridoPorGestor = !!(req.body && req.body.sugeridoPorGestor) && usuario.role === 'manager';

  // hs_timestamp em horário de Brasília: usa a hora prevista se veio (ex.: "14:30"),
  // senão 09:00 — mesma convenção de "compromisso do dia" usada no resto do cockpit.
  const agoraBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
  // `data` (YYYY-MM-DD) permite agendar num dia FUTURO — é o que faz o preenchimento de
  // buraco da semana funcionar. Sem ela, tudo cairia em hoje e o executivo veria a
  // quarta-feira continuar vazia depois de agendar nela.
  // Validação estrita: formato errado vira "hoje" em silêncio, e um dia inteiro de
  // planejamento iria pro lugar errado sem ninguém perceber.
  let alvoAno = agoraBRT.getUTCFullYear(), alvoMes = agoraBRT.getUTCMonth(), alvoDia = agoraBRT.getUTCDate();
  if (data != null) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data).trim());
    if (!m) return res.status(400).json({ erro: 'Campo "data" deve estar no formato AAAA-MM-DD.' });
    alvoAno = Number(m[1]); alvoMes = Number(m[2]) - 1; alvoDia = Number(m[3]);
    const teste = new Date(Date.UTC(alvoAno, alvoMes, alvoDia));
    if (teste.getUTCFullYear() !== alvoAno || teste.getUTCMonth() !== alvoMes || teste.getUTCDate() !== alvoDia) {
      return res.status(400).json({ erro: 'Data inválida.' });
    }
  }
  const [hh, mm] = (horaPrevista || '09:00').split(':').map(Number);
  const dataTarefaMs = Date.UTC(alvoAno, alvoMes, alvoDia, (hh || 9) + 3, mm || 0, 0);
  // AS MESMAS TRES VARIAVEIS que montaram o timestamp acima, em texto, para o marcador
  // de maquina do corpo. Derivar de `dataTarefaMs` obrigaria a desfazer o +3 do fuso, e
  // e assim que a data do marcador passaria a discordar da data da tarefa na virada do
  // dia. Um calculo, duas saidas.
  const do2 = (v) => String(v).padStart(2, '0');
  const diaDaTarefaISO = `${alvoAno}-${do2(alvoMes + 1)}-${do2(alvoDia)}`;
  const horaDaTarefa = `${do2(hh || 9)}:${do2(mm || 0)}`;

  /* OS MOTIVOS QUE O PLANEJAMENTO SABE MANDAR. Fechada de propósito: o corpo da
     tarefa é lido por gente e por robô, e string livre do navegador não entra nele. */
  const MOTIVO_ROTULO = {
    relacionamento: 'Motivo: visita de relacionamento — cliente da base (presença, indicação, upsell).',
    cobranca: 'Motivo: cobrar pagamento — negócio em Ag. Pagamento.'
  };
  const corpo = [
    // Marcador de máquina SEMPRE na primeira linha, quando existe — confirmar-sugestao-
    // gestor.js e o front (extrairSugestaoGestor) leem só a linha 0, nunca fazem regex
    // no corpo inteiro. `usuario.nome` é o nome de quem está logado (o gestor real, não
    // o texto que o navegador mandou), então não dá pra forjar "sugestão de outro gestor".
    sugeridoPorGestor ? `SUGESTAO_GESTOR:${usuario.nome || 'Gestor'}:PENDENTE` : null,
    // MOTIVO DA VISITA (23/09/26): a lista é FECHADA e traduzida aqui — texto livre
    // vindo do navegador no corpo de uma tarefa do CRM é campo aberto para qualquer
    // coisa. Motivo desconhecido simplesmente não escreve linha nenhuma.
    MOTIVO_ROTULO[String((req.body && req.body.motivo) || '')] || null,
    (bairro || cidade) ? `Endereço: ${[bairro, cidade].filter(Boolean).join(', ')}` : null,
    sugeridoPorGestor
      ? `Origem: ${prefixoAssunto.toLowerCase()} sugerida por ${usuario.nome || 'seu gestor'} pelo Cockpit — aguardando sua confirmação.`
      : `Origem: ${ORIGEM_ROTULO[origem]}`,   /* o rotulo mora no mesmo modulo do marcador */

    // ══ O MARCADOR DE MAQUINA (11/09/26) ═══════════════════════════════════════════
    // Julyan: o PWA puxa do HubSpot, entao o que o Cockpit planeja tem de estar LEGIVEL
    // la — nao so em prosa. Esta linha e a unica coisa neste corpo escrita para maquina;
    // o resto e para gente.
    //
    // FORMATO, fixo e versionado:
    //   COCKPIT:PLANO:v1:<ownerId>:<AAAA-MM-DD>:<HH:MM>:<visita|reuniao>:<origem>:<dealId|->
    //
    // A VERSAO E O PRIMEIRO CAMPO de proposito: quem le do outro lado ancora nela e
    // ignora linha de versao que nao conhece, em vez de quebrar quando um campo entrar.
    // O dealId e o que fecha o elo que nao existe no objeto: a tarefa NAO e associada a
    // negocio nenhum (zero chamada a /associations aqui), entao sem ele o leitor recebe
    // um nome em texto e tem de adivinhar de que negocio se trata.
    // `-` quando nao ha negocio ainda (conta de prospeccao agendada antes de virar
    // negocio) — campo vazio some no split e desloca todos os que vem depois.
    // A DATA E A HORA SAO AS DA TAREFA, reconstruidas dos mesmos numeros que montaram o
    // hs_timestamp logo acima: quem le nao precisa converter fuso para saber que dia do
    // plano e este, e um eventual desencontro entre os dois aparece na hora.
    linhaDoMarcador({ ownerId: ownerId, ano: alvoAno, mes: alvoMes + 1, dia: alvoDia,
      hora: (hh || 9), minuto: (mm || 0), tipo: tipoPedido, origem: origem, dealId: dealId })
  ].filter(Boolean).join('\n');

  // REAGENDAMENTO SEM DUPLICAR (Bloco L, 11/08):
  // Quando o executivo clica em "Gerar rota", as paradas são reordenadas por
  // proximidade — e o horário que a tarefa recebeu na ordem de CLIQUE deixa de valer.
  // Reenviar sem checar criaria uma segunda "Visita - Fulano" no mesmo dia, e o HubSpot
  // dele viraria lixo em uma semana. Então: procura uma tarefa em aberto com o mesmo
  // assunto, do mesmo dono, HOJE. Se existe, só move o horário (PATCH). Se não, cria.
  //
  // A busca filtra por dono + janela do dia + status, e o assunto é comparado aqui no
  // servidor em vez de virar filtro: `hs_task_subject` nem sempre é pesquisável por
  // igualdade dependendo do portal, e falhar essa busca faria voltar a duplicar.
  const inicioDiaMs = Date.UTC(alvoAno, alvoMes, alvoDia, 3, 0, 0);
  const fimDiaMs = inicioDiaMs + 24 * 60 * 60 * 1000;
  // BLOCO 34 — dedup por assunto continua funcionando igual: "Reunião - X" nunca
  // colide com "Visita - X" da mesma conta, então marcar as duas cotas (visita do dia +
  // reunião do dia) no mesmo lead não gera falso reagendamento de uma virando a outra.
  const assunto = `${prefixoAssunto} - ${nome}`;
  let idExistente = null;
  // DIAGNÓSTICO (11/08): a busca falhando em silêncio esconde duas coisas — que o
  // reagendamento não vai funcionar, e que reenviar a rota vai DUPLICAR tarefa. Agora
  // ela reporta, mesmo quando a criação dá certo.
  let buscaFalhou = null;
  try {
    const busca = await fetch('https://api.hubapi.com/crm/v3/objects/tasks/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [{ filters: [
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(ownerId) },
          { propertyName: 'hs_task_status', operator: 'EQ', value: 'NOT_STARTED' },
          { propertyName: 'hs_timestamp', operator: 'BETWEEN', value: String(inicioDiaMs), highValue: String(fimDiaMs) }
        ] }],
        properties: ['hs_task_subject', 'hs_timestamp'],
        limit: 100
      })
    });
    if (!busca.ok) {
      const det = await busca.json().catch(() => ({}));
      buscaFalhou = 'HTTP ' + busca.status + (det && det.message ? ' — ' + String(det.message).slice(0, 140) : '');
    }
    if (busca.ok) {
      const achados = await busca.json();
      const igual = (achados.results || []).find(t =>
        String((t.properties || {}).hs_task_subject || '').trim().toLowerCase() === assunto.trim().toLowerCase());
      if (igual) idExistente = igual.id;
    }
  } catch (e) { buscaFalhou = 'excecao: ' + String(e.message || e).slice(0, 80); }

  /* ══ UM NEGÓCIO, UM PRÓXIMO PASSO ABERTO (22/09/26) ═══════════════════════════════
     A busca acima é por ASSUNTO + dia + dono. Ela não vê que "Follow-up - Confirmar
     cobrança" e "Reunião - Confirmar data" são o MESMO negócio — e foi assim que o
     Boca a Boca do Sérgio juntou cinco tarefas abertas, quatro para o mesmo dia.

     Aqui a chave é o NEGÓCIO. Se ele já tem passo aberto, o novo reescreve aquele.
     Vai por ASSOCIAÇÃO, não por assunto: o assunto se repete entre negócios (o
     "Follow-up - Identificar o nome e o horário do decisor" existe em dezenas ao
     mesmo tempo) e casar por texto misturaria negócio de gente diferente.

     BEST-EFFORT COMO A ASSOCIAÇÃO: se esta leitura falhar, o pior caso é o que já
     acontecia antes — nasce uma tarefa a mais. Recusar a criação por causa dela
     seria trocar duplicata por passo nenhum, e passo nenhum é o defeito pior. */
  let reaproveitouDoNegocio = false;
  if (!idExistente && dealId && acaoNormalizada !== 'remover') {
    try {
      const rAssoc = await fetch(
        'https://api.hubapi.com/crm/v4/objects/deals/' + encodeURIComponent(dealId)
          + '/associations/tasks?limit=100',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (rAssoc.ok) {
        const dAssoc = await rAssoc.json();
        const ids = (dAssoc.results || [])
          .map(function (x) { return String((x.toObjectId != null ? x.toObjectId : (x.to && x.to.id)) || ''); })
          .filter(Boolean);
        if (ids.length) {
          const rLote = await fetch('https://api.hubapi.com/crm/v3/objects/tasks/batch/read', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              properties: ['hs_task_subject', 'hs_task_status', 'hs_timestamp'],
              inputs: ids.slice(0, 100).map(function (id) { return { id: id }; })
            })
          });
          if (rLote.ok) {
            const dLote = await rLote.json();
            /* ABERTA = qualquer status que não seja COMPLETED. É a mesma definição que
               a fila do dia e o snapshot usam — três definições de "aberta" seriam
               três respostas para a mesma pergunta. */
            const abertas = (dLote.results || []).filter(function (x) {
              return String((x.properties || {}).hs_task_status || '') !== 'COMPLETED';
            });
            /* A MAIS PRÓXIMA DE VENCER é a que fica: ela é o compromisso que o cliente
               está esperando primeiro. Reescrever a mais distante deixaria a urgente
               aberta e o negócio com duas de novo. */
            abertas.sort(function (a, b) {
              return Number((a.properties || {}).hs_timestamp || 0)
                - Number((b.properties || {}).hs_timestamp || 0);
            });
            if (abertas.length) {
              idExistente = abertas[0].id;
              reaproveitouDoNegocio = true;
            }
          }
        }
      }
    } catch (e) {
      /* não derruba: ver o best-effort acima */
    }
  }

  // Tirar do plano no Cockpit precisa tirar a tarefa aberta correspondente do
  // HubSpot também. Tarefa concluída não entra na busca acima e nunca é apagada:
  // realizado é histórico, não seleção de rota.
  if (acaoNormalizada === 'remover') {
    if (buscaFalhou) return res.status(502).json({ etapa: 'busca_remocao', erro: 'Não foi possível confirmar no HubSpot qual tarefa deve ser removida: ' + buscaFalhou });
    if (!idExistente) return res.status(200).json({ ok: true, removida: false, inexistente: true, buscaFalhou });
    try {
      const del = await fetch(`https://api.hubapi.com/crm/v3/objects/tasks/${idExistente}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      if (!del.ok) {
        const det = await del.json().catch(() => ({}));
        return res.status(del.status).json({ etapa: 'remocao', erro: 'HubSpot recusou remover a tarefa: ' + (det.message || 'sem mensagem'), detalhe: det });
      }
      return res.status(200).json({ ok: true, removida: true, id: idExistente, buscaFalhou });
    } catch (e) {
      return res.status(500).json({ etapa: 'remocao', erro: 'Falha ao remover a tarefa no HubSpot: ' + String(e.message || e) });
    }
  }

  // BUG REAL ENCONTRADO E CORRIGIDO (15/08/26): quando a busca de duplicidade falhava
  // (buscaFalhou setado), a remoção já bloqueava corretamente (linha acima), mas a
  // CRIAÇÃO seguia em frente mesmo assim — idExistente ficava null (porque a busca
  // nem rodou), caía direto no ramo de criação e duplicava a tarefa no HubSpot toda
  // vez que a Search API falhasse. Regra do prompt: "se a consulta de duplicidade
  // falhar, não criar uma nova tarefa" — agora aplicada nos dois caminhos, não só na
  // remoção.
  if (buscaFalhou) {
    return res.status(502).json({
      etapa: 'busca_duplicata', buscaFalhou,
      erro: 'Não foi possível confirmar no HubSpot se já existe uma tarefa igual hoje: ' + buscaFalhou + '. Não criei para evitar duplicidade — tente de novo.'
    });
  }

  /* ══ A TAREFA NA TIMELINE DO NEGÓCIO (11/09/26) ═══════════════════════════════════
     Julyan: "associa a tarefa ao negócio tbm". Antes disto o objeto nascia solto — zero
     associação — e a visita planejada não aparecia na ficha do negócio no HubSpot.

     `task_to_deal` é o tipo padrão documentado da associação básica v3, o mesmo estilo
     que api/criar-negocio.js já usa para deal_to_company e deal_to_contact. Não é id
     numérico de label customizado: label é configuração do portal, e configuração do
     HubSpot não se toca daqui.

     BEST-EFFORT, MAS NUNCA SILENCIOSA: a tarefa já existe e é válida mesmo se a
     associação falhar — o executivo vê o compromisso na Agenda de qualquer forma. Mas a
     falha volta no corpo da resposta, porque associação que some calada dá no mesmo que
     não existir, só que descoberta tarde (foi assim que negócio chegou em Ag. Pagamento
     sem contato e a cobrança do Asaas falhou depois do cliente assinar).

     IDEMPOTENTE: PUT na mesma associação duas vezes não duplica. É o que faz o
     reagendamento consertar tarefa antiga que nasceu sem vínculo, sem varredura. */
  async function associarAoNegocio(taskId) {
    if (!taskId || !dealId) return null;
    try {
      const r = await fetch(
        `https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(String(taskId))}`
          + `/associations/deals/${encodeURIComponent(dealId)}/task_to_deal`,
        { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) return 'HTTP ' + r.status + ' ao associar a tarefa ao negócio ' + dealId;
      return null;
    } catch (e) {
      return 'exceção ao associar a tarefa ao negócio: ' + String(e.message || e);
    }
  }

  if (idExistente) {
    try {
      const resp = await fetch(`https://api.hubapi.com/crm/v3/objects/tasks/${idExistente}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        /* O ASSUNTO SÓ ENTRA QUANDO A CHAVE FOI O NEGÓCIO. No reaproveitamento por
           assunto ele é igual por definição, e mandá-lo de novo seria escrita à toa;
           no reaproveitamento por negócio, não reescrever deixaria a tarefa anunciando
           o passo ANTERIOR com a data do novo — pior que duas tarefas. */
        body: JSON.stringify({ properties: Object.assign(
          { hs_timestamp: String(dataTarefaMs) },
          reaproveitouDoNegocio ? { hs_task_subject: assunto } : {}
        ) })
      });
      const data = await resp.json();
      if (!resp.ok) {
        return res.status(resp.status).json({
          etapa: 'reagendamento', httpHubspot: resp.status,
          erro: 'Reagendamento recusado pelo HubSpot: ' + (data.message || 'sem mensagem'), detalhe: data
        });
      }
      /* A tarefa reagendada pode ser ANTERIOR a esta mudança, e aí nasceu sem vínculo
         nenhum. O PUT idempotente conserta em silêncio o que dá para consertar. */
      const assocFalhou = await associarAoNegocio(idExistente);
      return res.status(200).json({
        ok: true, id: idExistente, reagendada: true, buscaFalhou: buscaFalhou,
        associadaAoNegocio: !!dealId && !assocFalhou,
        associacaoFalhou: assocFalhou,
        url: `https://app.hubspot.com/contacts/24373118/record/0-27/${idExistente}`
      });
    } catch (e) {
      return res.status(500).json({ etapa: 'reagendamento', erro: 'Falha ao reagendar no HubSpot: ' + String(e.message || e) });
    }
  }

  try {
    const resp = await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          hs_task_subject: assunto,
          hs_task_body: corpo,
          hs_task_status: 'NOT_STARTED',
          hs_task_type: 'TODO',
          hs_timestamp: String(dataTarefaMs),
          hubspot_owner_id: String(ownerId)
        }
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({
        etapa: 'criacao', httpHubspot: resp.status,
        erro: 'Criação recusada pelo HubSpot: ' + (data.message || 'sem mensagem'),
        buscaFalhou: buscaFalhou, detalhe: data
      });
    }
    const assocFalhou = await associarAoNegocio(data.id);
    return res.status(200).json({
      ok: true, id: data.id, reagendada: false, buscaFalhou: buscaFalhou,
      associadaAoNegocio: !!dealId && !assocFalhou,
      associacaoFalhou: assocFalhou,
      url: `https://app.hubspot.com/contacts/24373118/record/0-27/${data.id}`
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};

  },
  "lib/acoes-negocio/atualizar-mrr.js": function (module, exports, require, process) {
// api/atualizar-mrr.js
// Função serverless da Vercel — mesma arquitetura do criar-negocio.js: o navegador
// nunca conhece o HUBSPOT_TOKEN; manda só { dealId, mrr } + o token de sessão do
// Supabase, e esta rota valida tudo antes de escrever no HubSpot.
//
// Regras de segurança (validadas AQUI no servidor, não só na tela):
//   1. Sessão Supabase válida (mesmo check do criar-negocio).
//   2. O e-mail logado precisa existir em data/usuarios.json.
//   3. O negócio precisa ser do pipeline Field Sales E estar numa etapa de GANHO
//      (Negócio Fechado / Enviado Onboarding) — esta rota só serve pro quadro
//      "Vendas do mês", não é um editor genérico de deals.
//   4. Executivo (role: rep) só edita negócio cujo dono no HubSpot é ele mesmo.
//      Gestor (role: manager) edita qualquer um do time.
//
// Variáveis de ambiente na Vercel (as mesmas já usadas pelo criar-negocio.js):
//   HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY

const PIPELINE_FIELD_SALES = '916011864';
const STAGES_GANHO = ['1396006162', '1396006163']; // Negócio Fechado + Enviado Onboarding

// usuarios.json vai junto no deploy (require com caminho estático é empacotado pela Vercel).
// Formato real do arquivo: { _comment, usuarios: [...] } — não é um array direto.
let USUARIOS = [];
try {
  const raw = require('../../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  // FAIL-CLOSED (correção de segurança 06/08/26): antes, se SUPABASE_URL/ANON_KEY
  // faltassem na Vercel, a checagem de sessão era simplesmente PULADA e qualquer
  // pessoa na internet podia editar MRR chamando esta rota direto. Agora, sem as
  // três variáveis de ambiente a rota se recusa a operar.
  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão válida + descobrir QUEM está chamando (sempre obrigatório) ----
  let emailLogado = null;
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  // ---- 2. papel de quem chamou (usuarios.json é a fonte, igual ao login do cockpit) ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) {
    return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });
  }
  if (usuario.role !== 'manager' && usuario.role !== 'rep') {
    return res.status(403).json({ erro: 'Papel de usuário não autorizado a editar MRR.' });
  }

  // ---- 3. entrada ----
  const { dealId, mrr, zerar } = req.body || {};
  const mrrNum = Number(mrr);
  if (!dealId) return res.status(400).json({ erro: 'Falta o dealId.' });
  if (!Number.isFinite(mrrNum) || mrrNum < 0 || mrrNum > 1000000) {
    return res.status(400).json({ erro: 'MRR inválido — mande um número entre 0 e 1.000.000.' });
  }
  // CORREÇÃO (15/08/26, Julyan): a tentativa anterior de bloquear MRR abaixo de R$349
  // aqui estava ERRADA — R$349 é a META que a Takeat quer pra ficar saudável, NUNCA uma
  // trava comercial. Quem decide o valor é o executivo negociando com o cliente; a rota
  // não pode recusar um valor só por estar abaixo da meta. Removido o bloqueio de piso.
  // Mantido só o resguardo de "zerar exige ação explícita" — isso é segurança de UX
  // (evitar apagar um MRR real por engano digitando "0"), não regra comercial, e não
  // impede nenhum valor negociado > 0 de ser salvo normalmente.
  if (mrrNum === 0 && !zerar) {
    return res.status(400).json({ erro: `Pra zerar o MRR, use a ação "Zerar MRR" (é uma ação separada, não a edição normal).` });
  }

  try {
    // ---- 4. confere o negócio ANTES de escrever: pipeline, etapa de ganho e dono ----
    const getResp = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}?properties=dealname,pipeline,dealstage,hubspot_owner_id`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!getResp.ok) {
      return res.status(getResp.status === 404 ? 404 : 502).json({ erro: 'Negócio não encontrado no HubSpot.' });
    }
    const deal = await getResp.json();
    const p = deal.properties || {};
    if (p.pipeline !== PIPELINE_FIELD_SALES) {
      return res.status(403).json({ erro: 'Esse negócio não é do pipeline Field Sales.' });
    }
    if (!STAGES_GANHO.includes(p.dealstage)) {
      return res.status(403).json({ erro: 'Só dá pra editar o MRR de negócios já fechados (etapa de ganho).' });
    }
    if (usuario && usuario.role !== 'manager' && String(p.hubspot_owner_id) !== String(usuario.ownerId)) {
      return res.status(403).json({ erro: 'Esse negócio não é seu — só o dono ou o gestor pode editar o MRR.' });
    }

    // ---- 5. grava ----
    const patchResp = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      /* OS DOIS CAMPOS, NAO UM (03/09/26). Aqui gravava so valor_de_mrr, e o MRR que a
         tela MEDE e `mrr` (o de Ag. Pagamento, de onde sai o link do ASAAS). O executivo
         corrigia, a tela mudava — o patch local ja escrevia os dois — e a proxima carga
         do robo trazia o valor velho de volta, porque o HubSpot tinha recebido metade.
         Escrever nos dois e o que a tela ja assumia estar acontecendo. */
      body: JSON.stringify({ properties: {
        valor_de_mrr: String(Math.round(mrrNum)),
        mrr: String(Math.round(mrrNum))
      } })
    });
    const data = await patchResp.json();
    if (!patchResp.ok) {
      return res.status(patchResp.status).json({ erro: data.message || 'HubSpot recusou a atualização.', detalhe: data });
    }
    return res.status(200).json({ ok: true, id: String(dealId), mrr: Math.round(mrrNum) });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};

  },
  "lib/acoes-negocio/confirmar-sugestao-gestor.js": function (module, exports, require, process) {
// api/confirmar-sugestao-gestor.js
// BLOCO 34 (13/08/26) — segunda metade do "gestor pode adicionar leads na agenda do
// executivo, mas fica marcado como sugestão até ele confirmar" (decisão do Julyan).
// criar-tarefa-rota.js já sabe CRIAR a tarefa com o marcador SUGESTAO_GESTOR:...:PENDENTE
// na primeira linha do corpo (ver comentário lá); esta rota é o outro lado — tirar o
// marcador (confirmar) ou apagar a tarefa (recusar).
//
// Mesma arquitetura das outras rotas deste diretório: HUBSPOT_TOKEN nunca sai do
// servidor, o navegador manda só o id da tarefa + o token de sessão do Supabase.

let USUARIOS = [];
try {
  const raw = require('../../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

// Mesmo padrão usado na leitura (ver template: extrairSugestaoGestor) — mantido em
// espelho aqui porque o servidor não pode confiar em nada que o navegador calculou
// sobre o próprio corpo da tarefa; precisa ler o corpo real que está no HubSpot agora,
// não o que a tela tinha na hora do clique (podem ter passado minutos entre os dois).
const RE_MARCADOR = /^SUGESTAO_GESTOR:([^:\n]*):PENDENTE\n?/;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa. Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão válida (mesma checagem das outras rotas) ----
  let emailLogado = null;
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  const { taskId, acao } = req.body || {};
  if (!taskId || !['confirmar', 'recusar'].includes(acao)) {
    return res.status(400).json({ erro: 'Faltam campos obrigatórios: taskId e acao ("confirmar" ou "recusar").' });
  }

  // ---- 2. busca a tarefa real no HubSpot — nunca confia em dado vindo do navegador
  // sobre ela (dono, corpo, se ainda está pendente) ----
  let tarefa;
  try {
    const busca = await fetch(
      `https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(taskId)}?properties=hs_task_body,hubspot_owner_id,hs_task_status`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!busca.ok) {
      return res.status(busca.status === 404 ? 404 : 502).json({ erro: 'Não encontrei essa tarefa no HubSpot — pode já ter sido removida.' });
    }
    tarefa = await busca.json();
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao consultar a tarefa no HubSpot: ' + String(e.message || e) });
  }

  const donoTarefa = String((tarefa.properties || {}).hubspot_owner_id || '');
  const corpoAtual = String((tarefa.properties || {}).hs_task_body || '');
  const eraPendente = RE_MARCADOR.test(corpoAtual);

  // ---- 3. escopo: quem pode agir ----
  // Confirmar é ato do DONO da tarefa — só o executivo dono decide se aceita a
  // sugestão na própria agenda; nem o gestor que sugeriu confirma por ele (senão a
  // palavra "sugestão" não significa nada).
  // Recusar pode ser o dono OU o gestor que sugeriu — o gestor precisa poder desfazer
  // uma sugestão que já não faz sentido (ex.: o lead fechou por outro canal) sem
  // depender do executivo abrir o app.
  const souDono = usuario.role !== 'manager' && String(usuario.ownerId) === donoTarefa;
  const souGestor = usuario.role === 'manager';
  if (acao === 'confirmar' && !souDono) {
    return res.status(403).json({ erro: 'Só o executivo dono desta tarefa pode confirmar a sugestão.' });
  }
  if (acao === 'recusar' && !souDono && !souGestor) {
    return res.status(403).json({ erro: 'Você não tem permissão sobre esta tarefa.' });
  }
  if (!eraPendente) {
    // Não é erro do usuário — a tela dele pode estar desatualizada (ex.: já confirmou
    // em outro dispositivo). Devolve sucesso idempotente em vez de erro confuso.
    return res.status(200).json({ ok: true, jaResolvida: true });
  }

  if (acao === 'recusar') {
    try {
      const del = await fetch(`https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      if (!del.ok && del.status !== 404) {
        const det = await del.json().catch(() => ({}));
        return res.status(del.status).json({ erro: 'HubSpot recusou apagar a tarefa: ' + (det.message || 'sem mensagem') });
      }
      return res.status(200).json({ ok: true, recusada: true });
    } catch (e) {
      return res.status(500).json({ erro: 'Falha ao remover a tarefa no HubSpot: ' + String(e.message || e) });
    }
  }

  // acao === 'confirmar': tira só a linha do marcador, preserva o resto do corpo
  // (endereço, a frase "Origem: ..." fica como histórico de que foi sugestão — só o
  // PENDENTE some, não a rastreabilidade de quem sugeriu).
  const corpoConfirmado = corpoAtual.replace(RE_MARCADOR, '');
  try {
    const patch = await fetch(`https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { hs_task_body: corpoConfirmado } })
    });
    if (!patch.ok) {
      const det = await patch.json().catch(() => ({}));
      return res.status(patch.status).json({ erro: 'HubSpot recusou confirmar: ' + (det.message || 'sem mensagem') });
    }
    return res.status(200).json({ ok: true, confirmada: true });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao confirmar no HubSpot: ' + String(e.message || e) });
  }
};

  },
  "lib/acoes-negocio/ler-etapa-negocio.js": function (module, exports, require, process) {
// lib/acoes-negocio/ler-etapa-negocio.js
//
// LER A ETAPA ATUAL DE UM NEGÓCIO — a operação que transforma "não sei se gravou" em "sei".
// ---------------------------------------------------------------------------------------
// POR QUE ELA EXISTE, com o caso que a produziu (04/09/26):
//
// A Kelly moveu "Guaruba Açaí" de Conversa com Decisor para Perdido, com motivo "Outros" e
// a frase do cliente. A tela mostrou «Falha ao falar com o HubSpot: signal is aborted
// without reason» — o navegador cancelou a espera em 10s. Fui ao HubSpot: o negócio ESTÁ
// em Perdido, com o motivo e a observação inteira, modificado às 14:03:28Z — o minuto
// exato do print dela.
//
// Ou seja: a tela disse que falhou sobre uma gravação que deu certo. Isso é pior que o
// defeito da véspera — lá nada era escrito e a mensagem era honesta. Tela que erra nos
// DOIS sentidos não serve para decidir nada, e a saída natural do executivo (tentar de
// novo) escreve duas vezes.
//
// A CAUSA DA DEMORA não é o HubSpot ser lento: `mudar-etapa` faz DUAS idas — o GET de
// autorização, que nunca confia na etapa que o navegador informou, e o PATCH — somadas à
// partida a frio da função na Vercel. Passa de 10s sem nada estar errado.
//
// E ELEVAR O PRAZO NÃO RESOLVE SOZINHO: qualquer prazo pode estourar, e a pergunta que
// sobra é sempre a mesma — "gravou ou não?". Esta rota responde. O cliente, ao ser
// abortado, pergunta a etapa atual: se já é a de destino, a mudança aconteceu e a tela diz
// isso; se não é, a tela diz que não gravou. Nenhum dos dois é chute.
//
// SÓ LÊ, e passa pela MESMA autorização das escritas (buscarDealAutorizado), porque "qual
// a etapa deste negócio" também é informação do CRM de alguém: um executivo não confirma o
// negócio de outro. Mesmo padrão de sessão de mudar-etapa-negocio.js, linha por linha —
// uma segunda forma de validar sessão seria um segundo lugar para a regra de acesso morar.

const { buscarDealAutorizado } = require('../hubspot-deal-guard');

const USUARIOS = (() => {
  const raw = require('../../data/usuarios.json');
  return Array.isArray(raw) ? raw : (raw && Array.isArray(raw.usuarios) ? raw.usuarios : []);
})();

module.exports = async function lerEtapaNegocio(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY).' });
  }

  // ---- 1. sessão Supabase válida ----
  let emailLogado = null;
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  // ---- 2. papel de quem chamou ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  // ---- 3. o pedido ----
  const dealId = req.body && req.body.dealId;
  if (!dealId) return res.status(400).json({ erro: 'Falta o dealId.' });

  try {
    const guard = await buscarDealAutorizado({
      token, dealId, usuario, propriedades: ['dealstage', 'dealname']
    });
    if (guard.erro) return res.status(guard.erro.status).json({ erro: guard.erro.mensagem });
    const props = (guard.deal && guard.deal.properties) || {};
    return res.status(200).json({
      ok: true,
      id: String(dealId),
      etapa: String(props.dealstage || ''),
      nome: props.dealname || null
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao ler a etapa no HubSpot: ' + String(e.message || e) });
  }
};

  },
  "api/criar-negocio.js": function (module, exports, require, process) {
// api/criar-negocio.js
// Função serverless da Vercel — roda no servidor, nunca no navegador do executivo.
// É a ÚNICA peça que conhece o HUBSPOT_TOKEN (variável de ambiente da Vercel, nunca
// commitada no repo). O botão "Criar negócio" do cockpit chama esta rota via fetch();
// o navegador manda só os dados do lead e o token de sessão do Supabase — nunca a
// chave do HubSpot.
//
// Configuração necessária no painel da Vercel (Settings → Environment Variables):
//   HUBSPOT_TOKEN        = mesmo valor já usado no secret do GitHub Actions
//   SUPABASE_URL         = mesma URL do data/supabase-config.json
//   SUPABASE_ANON_KEY    = mesma anonKey do data/supabase-config.json
//   SUPABASE_SERVICE_KEY = opcional (mesma já usada por criar-empresa-prospeccao.js);
//                          sem ela, o Deal ainda é criado normalmente, só não associa
//                          à Company existente (ver comentário no corpo da função).

const PIPELINE_FIELD_SALES = '916011864';
const STAGE_BACKLOG = '1396007427'; // "Backlog" — mesma etapa onde o RPA já cria os testes

// BLOCO 49 (14/08/26) — Julyan: "o executivo tem que conseguir adicionar no hub na
// etapa prospecção as contas alvo". Antes TODA criação caía em Backlog e alguém tinha
// que mover à mão depois (na prática, ninguém movia — o Backlog virou depósito). Agora
// o cliente diz em qual etapa nasce; Backlog segue sendo o padrão pra quem não disser,
// então o RPA e qualquer chamada antiga continuam funcionando igual.
const ETAPAS_DE_ENTRADA = ['1396007427', '1395880469']; // Backlog, Prospecção

// Mesma fronteira da rota mudar-etapa-negocio: só estas props podem ser escritas daqui.
const PROPS_PERMITIDAS = ['celular', 'cep', 'bairro', 'cidade', 'logradouro', 'numero',
  'amount', 'valor_de_mrr', 'data_da_reuniao', 'reuniao_agendada', 'origem_do_lead'];
const ORIGENS_LEAD = ['Rua', 'Indicação', 'Casa dos Dados', 'Instagram', 'Ads', 'GoogleMaps', 'Familia', 'Eventos'];
// CORREÇÃO (15/08/26, Julyan): existia um piso de R$349 aqui bloqueando a criação do
// negócio abaixo desse valor — ERRADO. R$349 é a META que a Takeat persegue pra ficar
// saudável, nunca uma trava comercial: quem decide o valor real é o executivo
// negociando com o cliente. PROPS_COM_PISO/PISO_VALOR removidos; mantém validação
// básica (número finito e positivo), sem impor piso nenhum.
const PROPS_VALOR = ['amount', 'valor_de_mrr'];

// ══ CEP E CNPJ SO DIGITOS (04/09/26) ══════════════════════════════════════════════
// O HubSpot RECUSA a escrita inteira quando eles chegam pontuados — medido em auditoria:
// "cep: Enter only numbers and letters, not special characters like -". O executivo
// digita 29050-000 porque e assim que se escreve um CEP. Conferido no CRM: os 543
// negocios com o campo preenchido guardam so digitos, entao limpar aqui e escrever no
// formato que a base ja usa. A tela tambem limpa; esta e a ultima linha, para os
// caminhos que nao passam por ela.
const PROPS_SO_DIGITOS = { cep: 8, cnpj_cpf: 14 };
// == DIGITO VERIFICADOR DE CPF E CNPJ (04/09/26) ===================================
// O RPA do Asaas recusa documento invalido e avisa por WhatsApp horas depois, com o
// contrato ja assinado — medido em auditoria. O caso do dia foi um CNPJ com 13 digitos
// em vez de 14: um zero a menos. A tela ja confere; esta e a ultima linha.
// Aceita CPF (11) e CNPJ (14) porque a base tem os dois no mesmo campo.
function cpfEhValido(d) {
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  for (let corte = 9; corte <= 10; corte++) {
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * (corte + 1 - i);
    let dv = (soma * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== Number(d[corte])) return false;
  }
  return true;
}
function cnpjEhValido(d) {
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const corte of [12, 13]) {
    const p = pesos.slice(13 - corte);
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * p[i];
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(d[corte])) return false;
  }
  return true;
}
function conferirCpfCnpj(digitos) {
  if (digitos.length === 11) return cpfEhValido(digitos) ? null : 'CPF invalido — confira o numero.';
  if (digitos.length === 14) return cnpjEhValido(digitos) ? null : 'CNPJ invalido — confira o numero.';
  return 'CPF tem 11 digitos e CNPJ tem 14 — vieram ' + digitos.length + '.';
}

function soDigitos(chave, texto) {
  if (!(chave in PROPS_SO_DIGITOS)) return { valor: texto, erro: null };
  const d = String(texto).replace(/[^0-9]/g, '');
  if (d.length > PROPS_SO_DIGITOS[chave]) {
    return { valor: null, erro: `"${chave}" tem ${d.length} dígitos e o HubSpot aceita ${PROPS_SO_DIGITOS[chave]}.` };
  }
  /* o documento tambem passa pelo digito verificador — ver conferirCpfCnpj */
  if (chave === 'cnpj_cpf') {
    const problema = conferirCpfCnpj(d);
    if (problema) return { valor: null, erro: problema };
  }
  return { valor: d, erro: null };
}

function limparPropriedades(bruto) {
  if (!bruto || typeof bruto !== 'object') return { propriedades: {}, erro: null };
  const propriedades = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (!PROPS_PERMITIDAS.includes(chave)) {
      return { propriedades: null, erro: `Propriedade não permitida por esta rota: "${chave}".` };
    }
    if (valor == null || String(valor).trim() === '') continue;
    const texto = String(valor).trim();
    if (PROPS_VALOR.includes(chave)) {
      const n = Number(texto);
      if (!isFinite(n) || n < 0) return { propriedades: null, erro: `Valor inválido em "${chave}".` };
      propriedades[chave] = String(n);
      continue;
    }
    if (chave === 'reuniao_agendada' && texto !== 'true' && texto !== 'false') {
      return { propriedades: null, erro: 'reuniao_agendada só aceita true ou false.' };
    }
    if (chave === 'origem_do_lead' && !ORIGENS_LEAD.includes(texto)) {
      return { propriedades: null, erro: 'Origem do Lead inválida.' };
    }
    if (texto.length > 2000) return { propriedades: null, erro: `"${chave}" é longo demais.` };
    /* CEP e CNPJ so digitos, e o documento passa pelo digito verificador — depois da
       trava de tamanho, nunca antes: um `continue` aqui em cima ja deixou a trava morta. */
    const limpo = soDigitos(chave, texto);
    if (limpo.erro) return { propriedades: null, erro: limpo.erro };
    propriedades[chave] = limpo.valor;
    continue;
  }
  return { propriedades, erro: null };
}

// usuarios.json vai junto no deploy (require com caminho estático é empacotado pela Vercel).
// Formato real do arquivo: { _comment, usuarios: [...] } — não é um array direto.
let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

// == O CONTATO DO NEGOCIO (04/09/26) =============================================
// O RPA do Asaas parte do CONTATO e procura o negocio dele. Sem o vinculo ele falha com
// "Sem deal associado" e manda WhatsApp de erro para o executivo — medido em auditoria.
// Os negocios que geram Asaas hoje tem contato associado (Quintal da Vo -> Veronica,
// criado 0,6s antes do proprio negocio); o que o Cockpit criava nao tinha nenhum.
// MEDI ANTES DE MEXER que NAO era a Company: nenhum dos dois que geraram Asaas tem uma.
//
// ACHAR ANTES DE CRIAR, pelo telefone: o mesmo restaurante visitado duas vezes nao pode
// virar dois contatos. Busca o telefone como foi digitado E so os digitos, porque o
// portal tem os dois formatos gravados.
/* ══ JÁ EXISTE ESTE NEGÓCIO ABERTO PARA ESTE DONO? (23/09/26) ═══════════════════════
   Duas buscas, porque as duas chaves erram sozinhas: o telefone acha o mesmo lugar
   cadastrado com outro nome, e o nome acha o lugar que ninguém cadastrou telefone.
   AS ETAPAS FECHADAS NÃO CONTAM: negócio perdido em março não pode impedir o executivo
   de trabalhar o mesmo restaurante hoje — é exatamente isso que a reciclagem existe
   para fazer. */
const ETAPAS_FECHADAS = ['1396006162', '1396006163', '1396006164'];
async function negocioJaAberto(token, ownerId, nome, telefone) {
  const cab = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const digitos = String(telefone || '').replace(/[^0-9]/g, '');
  const buscas = [];
  if (digitos.length >= 8) {
    /* O MESMO NÚMERO EM TRÊS FORMATOS: busca as formas que o portal guarda. */
    [String(telefone).trim(), digitos].forEach(function (forma) {
      buscas.push({ campo: 'celular', valor: forma, por: 'telefone' });
    });
  }
  buscas.push({ campo: 'dealname', valor: String(nome || '').trim(), por: 'nome' });

  for (const b of buscas) {
    if (!b.valor) continue;
    try {
      const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
        method: 'POST', headers: cab,
        body: JSON.stringify({
          filterGroups: [{ filters: [
            { propertyName: b.campo, operator: 'EQ', value: b.valor },
            { propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(ownerId) },
            { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_FIELD_SALES }
          ] }],
          properties: ['dealname', 'dealstage', 'celular'], limit: 10
        })
      });
      if (!r.ok) continue;
      const d = await r.json();
      const achado = ((d && d.results) || []).filter(function (x) {
        const et = String((x.properties || {}).dealstage || '');
        return ETAPAS_FECHADAS.indexOf(et) < 0;
      })[0];
      if (achado) {
        return { id: String(achado.id), nome: (achado.properties || {}).dealname || null,
          etapa: (achado.properties || {}).dealstage || null, por: b.por };
      }
    } catch (e) {
      /* ══ A FALHA NÃO É SILENCIOSA (23/09/26) ═══════════════════════════════════════
         A busca de contato desta mesma rota engolia o erro e seguia criando — sem log,
         sem rastro. Foi assim que o contato do Salseiro virou TRÊS registros com o
         mesmo telefone e ninguém soube por quê. Aqui a falha aparece no log da Vercel,
         e a criação segue: recusar por causa de uma busca que caiu deixaria o executivo
         sem conseguir cadastrar na rua. */
      console.error('[criar-negocio] busca de duplicado falhou (' + b.por + '):', e && e.message);
    }
  }
  return null;
}

async function acharOuCriarContato(token, nome, telefone) {
  const cab = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const digitos = String(telefone || '').replace(/[^0-9]/g, '');
  if (digitos.length >= 10) {
    const formas = [String(telefone).trim(), digitos];
    for (const forma of formas) {
      try {
        const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST', headers: cab,
          body: JSON.stringify({
            filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'EQ', value: forma }] }],
            properties: ['phone'], limit: 1
          })
        });
        if (r.ok) {
          const d = await r.json();
          if (d && Array.isArray(d.results) && d.results[0]) {
            return { id: String(d.results[0].id), criado: false, erro: null };
          }
        }
      } catch (e) { /* a busca e otimizacao: falhar aqui so leva a criar um contato novo */ }
    }
  }
  /* NOME DA FACHADA no firstname, e nao um nome de pessoa inventado: quem atende aquele
     telefone e o dono, e o Cockpit nao pergunta o nome dele na criacao. */
  try {
    const props = { firstname: String(nome).slice(0, 100) };
    if (digitos.length >= 10) props.phone = String(telefone).trim();
    const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST', headers: cab, body: JSON.stringify({ properties: props })
    });
    const d = await r.json();
    if (!r.ok) return { id: null, criado: false, erro: (d && d.message) || ('HTTP ' + r.status) };
    return { id: String(d.id), criado: true, erro: null };
  } catch (e) {
    return { id: null, criado: false, erro: String(e.message || e) };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // ajuste para o domínio do cockpit se quiser travar mais
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  // FAIL-CLOSED (correção de segurança 06/08/26): antes, se SUPABASE_URL/ANON_KEY
  // faltassem na Vercel, a checagem de sessão era PULADA (fail-open) e qualquer pessoa
  // podia criar negócios no HubSpot chamando esta rota direto. Agora, sem as três
  // variáveis de ambiente a rota se recusa a operar.
  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  const supaService = process.env.SUPABASE_SERVICE_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão Supabase válida + QUEM está chamando (sempre obrigatório) ----
  // Não precisa de chave de admin: valida o token do próprio usuário contra o endpoint
  // público /auth/v1/user, do jeito que o Supabase recomenda para esse caso.
  let emailLogado = null;
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  // ---- 2. papel de quem chamou (usuarios.json é a fonte, igual ao atualizar-mrr) ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) {
    return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });
  }

  // ---- 3. dados do lead, validados ----
  const { nome, ownerId, telefone, endereco, bairro, cidade, tipo, nota, avaliacoes, etapa, propriedades, leadId } = req.body || {};
  if (!nome || !ownerId) {
    return res.status(400).json({ erro: 'Faltam campos obrigatórios: nome e ownerId.' });
  }

  // BUG REAL ENCONTRADO E CORRIGIDO (15/08/26): esta rota criava o Deal sempre
  // desconectado de qualquer Company — "não criar Deal desconectado da Company" era
  // um requisito explícito da revisão. Quando o front manda `leadId` (id da linha em
  // leads_prospeccao — mesmo campo que api/criar-empresa-prospeccao.js já preenche com
  // hubspot_company_id quando a Company foi criada antes), busca esse id aqui e associa
  // o Deal a ela logo depois de criado. Sem leadId (ex.: fluxo antigo de conta-alvo fria
  // que ainaind não passa por leads_prospeccao), segue sem associação — não há Company
  // conhecida pra associar, e criar uma às cegas aqui duplicaria o fluxo que já existe
  // em api/criar-empresa-prospeccao.js.
  let companyIdParaAssociar = null;
  if (leadId && supaService) {
    try {
      const leadResp = await fetch(`${supaUrl}/rest/v1/leads_prospeccao?id=eq.${encodeURIComponent(leadId)}&select=hubspot_company_id,responsavel_owner_id`, {
        headers: { apikey: supaService, Authorization: `Bearer ${supaService}` }
      });
      if (leadResp.ok) {
        const linhas = await leadResp.json();
        const linha = linhas && linhas[0];
        // Só reaproveita a Company se o lead pertencer ao MESMO dono que está sendo
        // usado para o Deal — nunca confia em leadId sozinho pra decidir associação.
        if (linha && linha.hubspot_company_id && String(linha.responsavel_owner_id) === String(ownerId)) {
          companyIdParaAssociar = String(linha.hubspot_company_id);
        }
      }
    } catch (e) { /* segue sem associação — a criação do Deal não pode travar por isso */ }
  }
  const etapaEntrada = etapa ? String(etapa) : STAGE_BACKLOG;
  if (!ETAPAS_DE_ENTRADA.includes(etapaEntrada)) {
    return res.status(400).json({ erro: 'Etapa de entrada inválida — um negócio novo só pode nascer em Backlog ou Prospecção.' });
  }
  const limpeza = limparPropriedades(propriedades);
  if (limpeza.erro) return res.status(400).json({ erro: limpeza.erro });
  if (etapaEntrada === '1395880469' && !limpeza.propriedades.origem_do_lead) {
    return res.status(400).json({ erro: 'Prospecção exige a propriedade Origem do Lead.' });
  }

  // Escopo por papel: executivo só cria negócio atribuído A ELE MESMO; gestor pode
  // atribuir a qualquer executivo. (Antes qualquer sessão podia criar em nome de qualquer um.)
  if (usuario.role !== 'manager' && String(ownerId) !== String(usuario.ownerId)) {
    return res.status(403).json({ erro: 'Executivo só pode criar negócio atribuído a si mesmo — peça ao gestor para atribuir a outro dono.' });
  }

  /* ══ NÃO CRIA O QUE JÁ ESTÁ ABERTO NA CARTEIRA DELE (23/09/26) ════════════════════
     Julyan: "se o lead já foi criado e está na carteira, NÃO PODE CRIAR DE NOVO E
     DUPLICAR". Medido: 7 dos 19 pares duplicados do funil têm os DOIS lados criados
     por esta rota.
     A RECUSA DEVOLVE O NEGÓCIO QUE JÁ EXISTE — "já existe" sem dizer qual manda ele
     procurar no escuro, e procurar no escuro foi o que produziu o duplicado.
     `permitirDuplicado` é a saída para a loja de verdade que repete telefone: a tela
     pergunta antes, ele confirma, e aí nasce. */
  if (!req.body || req.body.permitirDuplicado !== true) {
    const jaAberto = await negocioJaAberto(token, ownerId, nome,
      telefone || (limpeza.propriedades && limpeza.propriedades.celular) || null);
    if (jaAberto) {
      return res.status(409).json({
        erro: '"' + (jaAberto.nome || nome) + '" já está aberto na carteira deste executivo'
          + (jaAberto.por === 'telefone' ? ' (mesmo telefone)' : '')
          + ' — abra o negócio que existe em vez de criar outro.',
        duplicado: true,
        jaExiste: { id: jaAberto.id, nome: jaAberto.nome, etapa: jaAberto.etapa, por: jaAberto.por }
      });
    }
  }

  // Deal não tem campo próprio de telefone/endereço neste portal — vai tudo na descrição,
  // igual um humano preencheria à mão.
  const linhas = [
    telefone ? `Telefone: ${telefone}` : null,
    (endereco || bairro || cidade) ? `Endereço: ${[endereco, bairro, cidade].filter(Boolean).join(' — ')}` : null,
    tipo ? `Tipo: ${tipo}` : null,
    (nota != null && avaliacoes != null) ? `Google: ${nota} · ${avaliacoes} avaliações` : null,
    `Origem: conta-alvo — criado pelo cockpit direto em ${etapaEntrada === STAGE_BACKLOG ? 'Backlog' : 'Prospecção'}.`
  ].filter(Boolean);

  try {
    const resp = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          ...limpeza.propriedades,
          dealname: nome,
          pipeline: PIPELINE_FIELD_SALES,
          dealstage: etapaEntrada,
          hubspot_owner_id: String(ownerId),
          description: linhas.join('\n')
        }
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ erro: data.message || 'HubSpot recusou a criação.', detalhe: data });
    }

    // Associação best-effort: o Deal já existe e é válido mesmo se isto falhar — mas a
    // falha precisa aparecer, nunca ficar escondida (regra do prompt: nenhuma ação some
    // silenciosamente). `deal_to_company` é o tipo padrão documentado do HubSpot pra essa
    // associação básica v3 — não um ID numérico arriscado sem confirmação.
    let associacaoFalhou = null;
    if (companyIdParaAssociar) {
      try {
        const assoc = await fetch(
          `https://api.hubapi.com/crm/v3/objects/deals/${data.id}/associations/companies/${companyIdParaAssociar}/deal_to_company`,
          { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }
        );
        if (!assoc.ok) associacaoFalhou = 'HTTP ' + assoc.status + ' ao associar à Company ' + companyIdParaAssociar;
      } catch (e) {
        associacaoFalhou = 'exceção ao associar: ' + String(e.message || e);
      }
    }

    /* == E O CONTATO, QUE E O QUE O RPA DO ASAAS PROCURA (04/09/26) ================
       Sem este vinculo o negocio chega em Ag. Pagamento e a cobranca falha com "Sem deal
       associado" — e o executivo descobre por WhatsApp, depois de o cliente ter assinado.
       Best-effort: o negocio ja existe e e valido mesmo se isto falhar. Mas a falha VOLTA
       no retorno, porque associacao que some em silencio da no mesmo que nao existir — so
       que descoberta tarde. */
    let contatoId = null;
    let contatoCriado = false;
    let contatoFalhou = null;
    try {
      const c = await acharOuCriarContato(token, nome, telefone);
      if (!c.id) {
        contatoFalhou = c.erro || 'nao consegui achar nem criar o contato';
      } else {
        contatoId = c.id;
        contatoCriado = c.criado;
        const assoc = await fetch(
          `https://api.hubapi.com/crm/v3/objects/deals/${data.id}/associations/contacts/${contatoId}/deal_to_contact`,
          { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }
        );
        if (!assoc.ok) contatoFalhou = 'HTTP ' + assoc.status + ' ao associar ao contato ' + contatoId;
      }
    } catch (e) {
      contatoFalhou = 'excecao ao associar contato: ' + String(e.message || e);
    }

    return res.status(200).json({
      ok: true, id: data.id, etapa: etapaEntrada,
      propriedadesGravadas: Object.keys(limpeza.propriedades),
      companyIdAssociado: companyIdParaAssociar, associacaoFalhou,
      contatoId, contatoCriado, contatoFalhou,
      url: `https://app.hubspot.com/contacts/24373118/record/0-3/${data.id}`
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};

  },
  "api/desfazer-negocio.js": function (module, exports, require, process) {
// api/desfazer-negocio.js — DESFAZER o negócio criado por engano no Planejamento
// =========================================================================================
// PEDIDO (09/09/26, Julyan): "se eu coloquei sem querer o lead em prospecção no
// planejamento e retirei, ele tem que sair do funil, tem que ter uma trava, ele tem q
// confirmar, algo do tipo".
//
// O CASO REAL, medido no dia do pedido: o negócio 64905141165 ("RSM ENCOMENDAS DE PAES
// ARTESANAIS", do André) nasceu às 22:55, em Prospecção, sem valor e sem uma única
// atividade — criado por um clique no Planejamento e removido do plano em seguida. O
// cockpit tirava o cartão do dia e o negócio ficava no funil para sempre, aparecendo na
// tela do gestor como "0D · sem próximo passo" e contando no funil do time.
//
// ══ O QUE ESTA ROTA FAZ, E O QUE ELA SE RECUSA A FAZER ══════════════════════════════════
// Ela ARQUIVA o negócio no HubSpot — o DELETE da API v3 manda para a lixeira, de onde ele
// é restaurável por 90 dias. Não é apagar: é desfazer, e desfazer tem volta.
//
// Ela só faz isso quando as QUATRO condições valem, e cada uma existe por um motivo:
//   1. O NEGÓCIO FOI CRIADO AQUI. `leads_prospeccao.hubspot_deal_id` tem de apontar para
//      ele. Sem essa amarra, esta rota viraria um jeito de apagar qualquer negócio do
//      pipeline a partir do navegador.
//   2. ELE AINDA ESTÁ EM PROSPECÇÃO. Negócio que avançou de etapa é trabalho feito, e
//      trabalho feito não se desfaz por um ✕ de planejamento.
//   3. NÃO TEM VALOR NEM MENSALIDADE. Valor preenchido é alguém negociando.
//   4. NÃO TEM NENHUMA ATIVIDADE — nota, tarefa, ligação, reunião ou e-mail. Uma nota é
//      uma conversa que aconteceu; arquivar levaria o registro dela.
// Falhando qualquer uma, a resposta é 409 com o motivo, e a tela manda ele resolver no
// HubSpot. Recusar explicando é melhor que apagar em silêncio.
//
// ══ POR QUE ISTO NÃO CONTRARIA "SÓ MEXEMOS NO COCKPIT" ═════════════════════════════════
// A regra dele é sobre PROPRIEDADE e configuração do CRM: "quando eu falo não alterar
// nada, é propriedade, qualquer coisa formatada lá". Criar negócio a partir do cockpit já
// é gesto do produto (api/criar-negocio.js). Esta rota é o gesto SIMÉTRICO do mesmo
// clique, pedido por ele, e restringido ao negócio que o próprio cockpit criou e que
// ninguém tocou. Nenhuma propriedade é editada — o negócio inteiro vai para a lixeira.
//
// Variáveis de ambiente: as mesmas de api/criar-negocio.js (HUBSPOT_TOKEN, SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY).

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

/* A etapa de Prospecção do pipeline de Field Sales. Cravada de propósito: a rota só
   desfaz o que está NELA, e uma lista mais larga aqui seria a porta para desfazer
   negócio em Demo. */
const ETAPA_PROSPECCAO = '1395880469';
const PIPELINE_FIELD_SALES = '916011864';

/* As cinco associações que contam como "alguém trabalhou este negócio". */
const ATIVIDADES = ['notes', 'tasks', 'calls', 'meetings', 'emails'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  const supaService = process.env.SUPABASE_SERVICE_KEY;
  if (!token || !supaUrl || !supaAnon || !supaService) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa. Operação bloqueada por segurança.' });
  }

  /* ── 1. sessão ─────────────────────────────────────────────────────────────────── */
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  let emailLogado = null;
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  const usuario = emailLogado
    ? USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado) : null;
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  /* ── 2. o pedido ───────────────────────────────────────────────────────────────── */
  const { dealId, leadId } = req.body || {};
  if (!dealId || !leadId) {
    return res.status(400).json({ erro: 'Faltam dealId e leadId — os dois, porque é o par que prova que este negócio nasceu aqui.' });
  }

  /* ── 3. o negócio nasceu AQUI, e é do dono certo ───────────────────────────────── */
  let linha = null;
  try {
    const r = await fetch(`${supaUrl}/rest/v1/leads_prospeccao?id=eq.${encodeURIComponent(String(leadId))}`
      + '&select=id,nome,hubspot_deal_id,responsavel_owner_id,status', {
      headers: { apikey: supaService, Authorization: `Bearer ${supaService}` }
    });
    const j = await r.json().catch(() => []);
    linha = Array.isArray(j) ? j[0] : null;
  } catch (e) {
    return res.status(502).json({ erro: 'Não consegui ler a conta na fila de prospecção.' });
  }
  if (!linha) return res.status(404).json({ erro: 'Não achei esta conta na fila de prospecção.' });
  if (String(linha.hubspot_deal_id || '') !== String(dealId)) {
    return res.status(409).json({
      erro: 'Este negócio não foi criado pelo cockpit a partir desta conta — desfazer daqui poderia arquivar negócio de outra origem. Resolva no HubSpot.',
      motivo: 'nao-nasceu-aqui'
    });
  }
  /* O executivo desfaz o que é dele; o gestor desfaz de qualquer um. Mesma regra do
     criar-negocio, e pela mesma razão: quem não é dono não sabe o que está desfazendo. */
  if (usuario.role !== 'manager'
    && String(linha.responsavel_owner_id || '') !== String(usuario.ownerId || '')) {
    return res.status(403).json({ erro: 'Esta conta é da carteira de outro executivo.' });
  }

  /* ── 4. o negócio está intocado? ───────────────────────────────────────────────── */
  let negocio = null;
  try {
    const r = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}`
      + '?properties=dealname,dealstage,pipeline,amount,mrr,valor_de_mrr'
      + '&associations=' + ATIVIDADES.join(','), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.status === 404) {
      /* JÁ NÃO EXISTE: alguém arquivou antes, ou o desfazer rodou duas vezes. Isso não é
         erro para quem clicou — o resultado que ele queria já está lá. A fila é limpa
         mesmo assim, para o botão de criar voltar a aparecer. */
      await limparLead(supaUrl, supaService, leadId);
      return res.status(200).json({ ok: true, jaNaoExistia: true });
    }
    if (!r.ok) return res.status(502).json({ erro: 'O HubSpot não respondeu sobre este negócio.' });
    negocio = await r.json();
  } catch (e) {
    return res.status(502).json({ erro: 'Não consegui falar com o HubSpot.' });
  }

  const props = (negocio && negocio.properties) || {};
  if (String(props.pipeline || '') !== PIPELINE_FIELD_SALES) {
    return res.status(409).json({ erro: 'Este negócio não está no pipeline de Field Sales.', motivo: 'outro-pipeline' });
  }
  if (String(props.dealstage || '') !== ETAPA_PROSPECCAO) {
    return res.status(409).json({
      erro: 'Este negócio já saiu de Prospecção — alguém avançou a etapa. Trabalho feito não se desfaz por um ✕ de planejamento; mova ou perca no HubSpot.',
      motivo: 'avancou'
    });
  }
  const dinheiro = Number(props.amount || 0) + Number(props.mrr || 0) + Number(props.valor_de_mrr || 0);
  if (dinheiro > 0) {
    return res.status(409).json({
      erro: 'Este negócio já tem valor preenchido — alguém está negociando. Não arquivei nada.',
      motivo: 'tem-valor'
    });
  }
  const assoc = (negocio && negocio.associations) || {};
  const comAtividade = ATIVIDADES.filter(function (k) {
    const bloco = assoc[k] || assoc[k.replace(/s$/, '')] || null;
    return bloco && Array.isArray(bloco.results) && bloco.results.length > 0;
  });
  if (comAtividade.length) {
    return res.status(409).json({
      erro: 'Este negócio já tem ' + comAtividade.join(', ') + ' registrada(s) — arquivar levaria esse registro. Não arquivei nada.',
      motivo: 'tem-atividade'
    });
  }

  /* ── 5. arquiva (lixeira do HubSpot, restaurável por 90 dias) ───────────────────── */
  try {
    const r = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok && r.status !== 404) {
      const txt = await r.text().catch(() => '');
      return res.status(502).json({ erro: 'O HubSpot recusou o arquivamento: ' + String(txt).slice(0, 180) });
    }
  } catch (e) {
    return res.status(502).json({ erro: 'Não consegui arquivar no HubSpot.' });
  }

  /* ── 6. a fila volta ao estado de antes ────────────────────────────────────────── */
  const limpou = await limparLead(supaUrl, supaService, leadId);
  return res.status(200).json({
    ok: true,
    nome: linha.nome || null,
    /* SE A FILA NÃO LIMPOU, A TELA PRECISA SABER: o negócio foi arquivado e a conta
       continuaria marcada como "já criada", sem botão de criar de novo. Erro nulo sem
       linha de volta já fez tela dizer "pronto" sobre tabela intacta. */
    filaLimpa: !!limpou
  });
};

/* Tira o `hubspot_deal_id` da linha, para a conta poder ser criada de novo. O status
   continua o que era: ela nunca deixou de ser conta do executivo. */
async function limparLead(supaUrl, supaService, leadId) {
  try {
    const r = await fetch(`${supaUrl}/rest/v1/leads_prospeccao?id=eq.${encodeURIComponent(String(leadId))}`, {
      method: 'PATCH',
      headers: {
        apikey: supaService, Authorization: `Bearer ${supaService}`,
        'Content-Type': 'application/json', Prefer: 'return=representation'
      },
      body: JSON.stringify({ hubspot_deal_id: null, updated_at: new Date().toISOString() })
    });
    if (!r.ok) return false;
    const j = await r.json().catch(() => []);
    return Array.isArray(j) && j.length > 0;
  } catch (e) { return false; }
}

  },
  "api/criar-nota-negocio.js": function (module, exports, require, process) {
// api/criar-nota-negocio.js
//
// APELIDO MANTIDO DE PROPÓSITO (31/08/26).
//
// A implementação desta ação mudou de lugar: virou lib/acoes-negocio/criar-nota-negocio.js e
// é servida pela porta única /api/negocio-acao (com op:'nota'). A consolidação existia para
// liberar slots de função na Vercel — as 12 do plano Hobby estavam ocupadas e o PWA precisa de
// espaço para publicar a fila pendente do app.
//
// Só que ESTA rota, especificamente, está DOCUMENTADA para outro time:
// docs/pwa-para-cockpit.md oferece `POST /api/criar-nota-negocio` com tipoAcao:'proximo-passo'
// como o caminho autenticado para o PWA gravar próximo passo e qualificação. Apagar a URL
// romperia um contrato que eu não escrevi e não posso testar daqui — e romperia em silêncio,
// com 404, no dia em que alguém do outro lado fosse usar.
//
// Então o arquivo continua existindo como casca fina. Custa um slot (ficamos com 9 de 12, 3
// livres) e mantém a palavra dada. Quando o time do PWA confirmar que migrou para
// /api/negocio-acao, este arquivo pode ser removido — e aí voltam 4 slots.
//
// Não há lógica aqui: nem validação, nem tradução de resposta. O módulo responde por si, com o
// mesmo corpo e os mesmos códigos de erro de sempre.

module.exports = require('../lib/acoes-negocio/criar-nota-negocio');

  },
  "api/criar-empresa-prospeccao.js": function (module, exports, require, process) {
// api/criar-empresa-prospeccao.js - Etapa 4 (Prospeccao)
// Cria uma Company no HubSpot a partir de uma linha de leads_prospeccao - NUNCA um Deal.
// Regra comercial (spec): prospeccao fria cria primeiro uma Company; o Deal so nasce
// depois, quando o executivo qualifica interesse de verdade (isso continua sendo feito
// pelo fluxo ja existente, api/criar-negocio.js, manualmente, quando fizer sentido).
//
// Fail-closed nas mesmas 4 variaveis de ambiente das outras rotas de escrita
// (HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY) + a service key pra atualizar o status.

const PIPELINE_FIELD_SALES = '916011864';

let USUARIOS = [];
try {
    const raw = require('../data/usuarios.json');
    USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Metodo nao permitido' });

    const token = process.env.HUBSPOT_TOKEN;
    const supaUrl = process.env.SUPABASE_URL;
    const supaAnon = process.env.SUPABASE_ANON_KEY;
    const supaService = process.env.SUPABASE_SERVICE_KEY;
    if (!token || !supaUrl || !supaAnon || !supaService) {
          return res.status(500).json({ erro: 'Servidor sem configuracao completa.' });
    }

    const auth = req.headers.authorization || '';
    const sessionToken = auth.replace(/^Bearer\s+/i, '');
    if (!sessionToken) return res.status(401).json({ erro: 'Sem sessao. Faca login no cockpit de novo.' });
    let emailLogado = null;
    try {
          const check = await fetch(supaUrl + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + sessionToken, apikey: supaAnon } });
          if (!check.ok) return res.status(401).json({ erro: 'Sessao invalida ou expirada.' });
          const user = await check.json();
          emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
    } catch (e) { return res.status(401).json({ erro: 'Nao foi possivel validar a sessao.' }); }
    if (!emailLogado) return res.status(401).json({ erro: 'Sessao sem e-mail associado.' });

    const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
    if (!usuario) return res.status(403).json({ erro: 'E-mail logado nao esta cadastrado no time.' });

    const { leadId, acao, novoOwnerId } = req.body || {};
    if (!leadId) return res.status(400).json({ erro: 'Falta o leadId.' });

    const getResp = await fetch(supaUrl + '/rest/v1/leads_prospeccao?id=eq.' + encodeURIComponent(leadId) + '&select=*', {
          headers: { apikey: supaService, Authorization: 'Bearer ' + supaService }
    });
    if (!getResp.ok) return res.status(502).json({ erro: 'Falha ao buscar o lead no Supabase.' });
    const linhas = await getResp.json();
    const lead = linhas[0];
    if (!lead) return res.status(404).json({ erro: 'Lead nao encontrado.' });

    // BUG REAL ENCONTRADO E CORRIGIDO (15/08/26) — item 3 da revisão: "ao trocar o
    // responsável de uma conta já existente no HubSpot: atualizar o owner no HubSpot;
    // confirmar a gravação; somente depois refletir no Supabase". Antes, reatribuir
    // executivo era escrita PURA no Supabase (ver atualizarLeadProspeccao no front) —
    // quando o lead já tinha uma Company real criada, o HubSpot ficava com o owner
    // antigo pra sempre, sem ninguém perceber. Esta ação é NOVA nesta rota (não cria
    // função serverless nova — já são 12 na Vercel, no limite do plano Hobby) e roda
    // ANTES da checagem "já criado" abaixo, porque reatribuir é permitido mesmo depois
    // de criado_hubspot — é exatamente esse o caso que precisa sincronizar.
    if (acao === 'atualizar_owner') {
      /* DEVOLVER A PRÓPRIA CONTA (28/08/26).

         Reatribuir executivo continua sendo poder de gestor. O que se abre aqui é um
         caso estreito: o executivo LIMPANDO o dono de uma conta que já é dele — ou
         seja, devolvendo para a fila de pendentes para o gestor redistribuir.

         Vem do desenho do Claude Design ("Devolver as que você não vai visitar"), e a
         razão de produto é boa: conta atribuída que ele não vai visitar não é neutra,
         é pilha morta no meio da fila dele, empurrando para baixo a conta que ele
         visitaria. Devolver é melhor para os dois lados.

         Ele não pode: atribuir para si, atribuir para outro, nem tocar em conta de
         terceiro. Só soltar a própria. */
      const querDevolver = !novoOwnerId;
      const ehDonoDaConta = String(lead.responsavel_owner_id || '') === String(usuario.ownerId || '');
      if (usuario.role !== 'manager' && !(querDevolver && ehDonoDaConta)) {
        return res.status(403).json({ erro: querDevolver
          ? 'Essa conta não está atribuída a você.'
          : 'Só o gestor pode atribuir executivo. Você pode devolver as suas.' });
      }
      const ownerLimpo = novoOwnerId ? String(novoOwnerId) : '';
      if (lead.hubspot_company_id) {
        try {
          const patchResp = await fetch('https://api.hubapi.com/crm/v3/objects/companies/' + encodeURIComponent(lead.hubspot_company_id), {
            method: 'PATCH',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ properties: { hubspot_owner_id: ownerLimpo } })
          });
          if (!patchResp.ok) {
            const det = await patchResp.json().catch(() => ({}));
            return res.status(patchResp.status).json({ erro: 'HubSpot recusou atualizar o dono da empresa: ' + (det.message || 'sem mensagem'), detalhe: det });
          }
        } catch (e) {
          return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
        }
      }
      // Só grava no Supabase DEPOIS de confirmar no HubSpot (ou quando não há Company
      // ainda pra sincronizar — nada a confirmar além do próprio Supabase).
      const patchSupa = await fetch(supaUrl + '/rest/v1/leads_prospeccao?id=eq.' + encodeURIComponent(leadId), {
        method: 'PATCH',
        headers: { apikey: supaService, Authorization: 'Bearer ' + supaService, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ responsavel_owner_id: ownerLimpo || null, status: ownerLimpo ? 'atribuido' : 'pendente', updated_at: new Date().toISOString() })
      });
      if (!patchSupa.ok) return res.status(502).json({ erro: 'HubSpot confirmou, mas o Supabase recusou salvar. Recarregue e confira.' });
      return res.status(200).json({ ok: true, sincronizadoNoHubspot: !!lead.hubspot_company_id });
    }

    if (lead.status === 'criado_hubspot') return res.status(409).json({ erro: 'Esse lead ja foi criado no HubSpot.', hubspotCompanyId: lead.hubspot_company_id });

    if (usuario.role !== 'manager' && String(lead.responsavel_owner_id) !== String(usuario.ownerId)) {
          return res.status(403).json({ erro: 'Esse lead nao esta atribuido a voce.' });
    }

    try {
          const buscaResp = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
                  method: 'POST',
                  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                            filterGroups: [{ filters: [{ propertyName: 'name', operator: 'EQ', value: lead.nome }] }],
                            properties: ['name', 'city'], limit: 1
                  })
          });
          const buscaData = await buscaResp.json();
          if (buscaResp.ok && buscaData.results && buscaData.results.length > 0) {
                  // BUG REAL ENCONTRADO E CORRIGIDO (15/08/26): quando já existia uma Company
                  // com o mesmo nome, a rota só devolvia 409 e parava — o lead ficava pra
                  // sempre sem hubspot_company_id no Supabase (status nunca virava
                  // 'criado_hubspot'). Regra do prompt: "quando a Company já existir e a
                  // correspondência for válida, retornar e persistir o ID existente; não
                  // encerrar somente com 409." Mas nome igual sozinho não confirma que é a
                  // MESMA empresa (rede com unidades em cidades diferentes, nome genérico) —
                  // só reaproveita automaticamente quando a cidade também bate; senão, mantém
                  // o 409 pra revisão manual em vez de arriscar juntar duas empresas distintas.
                  const achado = buscaData.results[0];
                  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                  const cidadeBate = !norm(achado.properties && achado.properties.city) || !norm(lead.cidade)
                        || norm(achado.properties && achado.properties.city) === norm(lead.cidade);
                  if (cidadeBate) {
                        await fetch(supaUrl + '/rest/v1/leads_prospeccao?id=eq.' + encodeURIComponent(leadId), {
                                method: 'PATCH',
                                headers: { apikey: supaService, Authorization: 'Bearer ' + supaService, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                                body: JSON.stringify({ status: 'criado_hubspot', hubspot_company_id: String(achado.id), updated_at: new Date().toISOString() })
                        });
                        return res.status(200).json({ ok: true, hubspotCompanyId: achado.id, jaExistia: true, url: 'https://app.hubspot.com/contacts/24373118/company/' + achado.id });
                  }
                  return res.status(409).json({ erro: 'Existe uma empresa chamada "' + lead.nome + '" no HubSpot (id ' + achado.id + '), mas em cidade diferente — confira manualmente antes de criar ou vincular.' });
          }
    } catch (e) { }

    const linhasDesc = [
          lead.telefone ? 'Telefone: ' + lead.telefone : null,
          lead.horario_funcionamento ? 'Horario: ' + lead.horario_funcionamento : null,
          (lead.nota != null && lead.avaliacoes != null) ? 'Google: ' + lead.nota + ' - ' + lead.avaliacoes + ' avaliacoes' : null,
          'Fonte: ' + lead.fonte + ' (importado pelo cockpit em ' + new Date(lead.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ')'
        ].filter(Boolean);

    try {
          const resp = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
                  method: 'POST',
                  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                            properties: {
                                        name: lead.nome,
                                        address: lead.endereco || '',
                                        city: lead.cidade || '',
                                        state: lead.estado || '',
                                        phone: lead.telefone || '',
                                        description: linhasDesc.join('\n'),
                                        // BUG REAL ENCONTRADO E CORRIGIDO (15/08/26): a Company nascia sem
                                        // hubspot_owner_id — apontado explicitamente no prompt de revisão.
                                        // lead.responsavel_owner_id já é validado acima (é o mesmo campo
                                        // usado pra checar se o lead pertence a quem está logado).
                                        hubspot_owner_id: lead.responsavel_owner_id ? String(lead.responsavel_owner_id) : ''
                            }
                  })
          });
          const data = await resp.json();
          if (!resp.ok) return res.status(resp.status).json({ erro: data.message || 'HubSpot recusou a criacao da empresa.', detalhe: data });

      await fetch(supaUrl + '/rest/v1/leads_prospeccao?id=eq.' + encodeURIComponent(leadId), {
              method: 'PATCH',
              headers: { apikey: supaService, Authorization: 'Bearer ' + supaService, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ status: 'criado_hubspot', hubspot_company_id: String(data.id), updated_at: new Date().toISOString() })
      });

      return res.status(200).json({ ok: true, hubspotCompanyId: data.id, url: 'https://app.hubspot.com/contacts/24373118/company/' + data.id });
    } catch (e) {
          return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
    }
};

  },
  "api/restaurantes-proximos.js": function (module, exports, require, process) {
// api/restaurantes-proximos.js
// Função serverless da Vercel — mesma arquitetura de segurança do criar-tarefa-rota.js.
//
// POR QUE ESTA ROTA EXISTE (Julyan, 11/08):
// A base de contas-alvo cobre 4 cidades (Vitória 111, Rio 89, Porto Alegre 56, Vila
// Velha 14). São Paulo tem ZERO; Bruno e Michel têm 6 cada no Rio. Resultado prático: o
// executivo abre a Rota & Agenda, o mapa está vazio, e não tem de onde montar plano.
// Isso resolve sem depender do sourcing pago mensal.
//
// POR QUE NO SERVIDOR E NÃO NO NAVEGADOR (testado, não suposto):
//   fetch para overpass-api.de  -> "Failed to fetch" em 756ms (CORS bloqueado)
//   navegação direta na URL     -> 406 Not Acceptable (Apache recusa o Accept do Chrome)
//   espelho kumi.systems        -> travou o renderer do Chrome
// Do servidor não há CORS e dá pra mandar User-Agent/Accept adequados. De brinde, o
// resultado fica cacheado para o time todo.
//
// LIMITE HONESTO (a tela precisa dizer isso ao executivo):
// OpenStreetMap NÃO tem nota nem número de avaliações. Tem nome, categoria, telefone
// (quando alguém preencheu), rua, número e CEP. Serve para "portas para bater perto de
// mim", não para "as melhores da praça" — esse ranking depende de Google/Outscraper,
// que é pago.
//
// Variáveis de ambiente (as mesmas das outras rotas):
//   SUPABASE_URL, SUPABASE_ANON_KEY   -> validação de sessão (obrigatórias)
//   SUPABASE_SERVICE_KEY              -> cache (opcional; sem ela funciona sem cache)

const osm = require('../lib/osm.js');

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

// Cache aceito por até 30 dias: OSM muda devagar, e o robô renova aos 21 dias, então na
// prática nenhuma praça pré-aquecida chega perto de vencer.
const VALIDADE_DIAS = 30;

// ---------------------------------------------------------------------------
// CAMADA 1 — cache pela chave exata (mesmo ponto, mesmo raio).
// ---------------------------------------------------------------------------
async function lerCacheExato(supaUrl, serviceKey, chave) {
  if (!serviceKey) return null;
  try {
    const limite = new Date(Date.now() - VALIDADE_DIAS * 86400000).toISOString();
    const url = supaUrl + '/rest/v1/restaurantes_osm?chave=eq.' + encodeURIComponent(chave)
      + '&buscado_em=gte.' + encodeURIComponent(limite) + '&select=itens,buscado_em&limit=1';
    const r = await fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } });
    if (!r.ok) return null;
    const row = (await r.json() || [])[0];
    return row && Array.isArray(row.itens) ? { itens: row.itens, buscadoEm: row.buscado_em } : null;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// CAMADA 2 — cache por COBERTURA. Esta é a peça que faz o pré-aquecimento valer.
//
// O PROBLEMA: a chave do cache é a célula de ~110m. O executivo digita um endereço no
// autocomplete e cai numa coordenada qualquer do bairro — quase nunca na MESMA célula
// que o robô aqueceu. Só com a Camada 1, o cache pré-aquecido praticamente nunca seria
// encontrado e o robô das 23:59 seria trabalho jogado fora.
//
// A CONTA: uma busca já feita no centro C com raio R contém todo ponto a até R de C.
// Logo, o pedido do executivo (ponto P, raio r) está inteiramente coberto quando
//     dist(P, C) + r <= R
// Se está coberto, é matematicamente o mesmo resultado — só falta recortar para o raio
// pedido e recalcular o "km" a partir de P (senão a distância na tela sai errada).
// O robô aquece com R=6km e o pedido padrão é r=3km: 3km de folga em volta do âncora.
// ---------------------------------------------------------------------------
async function lerCachePorCobertura(supaUrl, serviceKey, lat, lng, raio) {
  if (!serviceKey) return null;
  try {
    const limite = new Date(Date.now() - VALIDADE_DIAS * 86400000).toISOString();
    // Caixa de busca grosseira só pra não varrer a tabela: o raio máximo aceito é 8km,
    // então nenhum centro que possa cobrir este ponto está a mais de 8km daqui. A conta
    // de contenção de verdade é feita abaixo, em JS.
    const grauLat = 8 / 111;
    const grauLng = 8 / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    const url = supaUrl + '/rest/v1/restaurantes_osm'
      + '?lat=gte.' + (lat - grauLat) + '&lat=lte.' + (lat + grauLat)
      + '&lng=gte.' + (lng - grauLng) + '&lng=lte.' + (lng + grauLng)
      + '&raio_m=gte.' + raio // um cache menor que o pedido não pode cobri-lo
      + '&buscado_em=gte.' + encodeURIComponent(limite)
      + '&select=itens,buscado_em,lat,lng,raio_m&order=buscado_em.desc&limit=20';
    const r = await fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return null;

    const cobre = rows.find(row => {
      if (!Array.isArray(row.itens)) return false;
      const d = osm.distanciaKm(lat, lng, Number(row.lat), Number(row.lng)) * 1000;
      return d + raio <= Number(row.raio_m);
    });
    if (!cobre) return null;

    return {
      itens: osm.recortarPara(cobre.itens, lat, lng, raio),
      buscadoEm: cobre.buscado_em,
      centroKm: Math.round(osm.distanciaKm(lat, lng, Number(cobre.lat), Number(cobre.lng)) * 100) / 100,
      raioOrigemKm: Number(cobre.raio_m) / 1000
    };
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  // FAIL-CLOSED, mesmo padrão das outras rotas.
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || null;
  if (!supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração (SUPABASE_URL e SUPABASE_ANON_KEY obrigatórios).' });
  }

  // ---- 1. sessão válida ----
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  let emailLogado = null;
  try {
    const check = await fetch(supaUrl + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + sessionToken, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado.' });
  if (USUARIOS.length && !USUARIOS.some(u => String(u.email).toLowerCase() === emailLogado)) {
    return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });
  }

  // ---- 2. parâmetros ----
  const body = req.body || {};
  const nLat = Number(body.lat), nLng = Number(body.lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
    return res.status(400).json({ erro: 'lat e lng são obrigatórios e numéricos.' });
  }
  // Guarda-corpo: coordenada fora do Brasil é erro de digitação, não busca legítima.
  if (nLat < -34 || nLat > 6 || nLng < -74 || nLng > -33) {
    return res.status(400).json({ erro: 'Coordenada fora do Brasil — confira o ponto de atuação.' });
  }
  // Teto de 8km: acima disso a Overpass fica lenta e deixa de ser rota de um dia.
  const raio = Math.round(Math.min(Math.max(Number(body.raioKm) || 3, 0.5), 8) * 1000);
  const chave = osm.celulaCache(nLat, nLng, raio);
  const AVISO = 'Dado do OpenStreetMap: sem nota e sem número de avaliações.';

  // ---- 3. cache exato ----
  const exato = await lerCacheExato(supaUrl, serviceKey, chave);
  if (exato) {
    return res.status(200).json({
      ok: true, origem: 'cache', buscadoEm: exato.buscadoEm,
      total: exato.itens.length, itens: exato.itens, aviso: AVISO
    });
  }

  // ---- 4. cache por cobertura (praça pré-aquecida pelo robô das 23:59) ----
  const coberto = await lerCachePorCobertura(supaUrl, serviceKey, nLat, nLng, raio);
  if (coberto) {
    return res.status(200).json({
      ok: true, origem: 'cache-regiao', buscadoEm: coberto.buscadoEm,
      total: coberto.itens.length, itens: coberto.itens, aviso: AVISO,
      // Diagnóstico: dá pra ver na resposta que veio de praça aquecida e de qual raio.
      reaproveitado: { distanciaDoCentroKm: coberto.centroKm, raioOrigemKm: coberto.raioOrigemKm }
    });
  }

  // ---- 5. Overpass ao vivo (praça fora das pré-aquecidas, ou raio maior que o do robô) ----
  const r = await osm.consultarOverpass(
    osm.montarConsulta(nLat, nLng, raio, 8),
    osm.TIMEOUT_AO_VIVO_MS
  );
  if (!r.elements) {
    return res.status(502).json({
      erro: 'Nenhum espelho da Overpass respondeu agora. Tente de novo em alguns minutos.',
      detalhe: r.erros
    });
  }

  const itens = osm.dedup(
    r.elements.map(el => osm.normalizar(el, nLat, nLng)).filter(Boolean)
  ).sort((a, b) => a.km - b.km);

  await osm.gravarCache(supaUrl, serviceKey, chave, nLat, nLng, raio, itens);

  return res.status(200).json({
    ok: true, origem: 'overpass', espelho: r.espelho,
    total: itens.length, itens: itens, aviso: AVISO,
    cacheAtivo: !!serviceKey
  });
};

  },
  "lib/osm.js": function (module, exports, require, process) {
// lib/osm.js
// Lógica compartilhada de consulta ao OpenStreetMap (Overpass).
//
// POR QUE ESTE ARQUIVO EXISTE (11/08):
// Duas coisas diferentes consultam a Overpass agora:
//   1) api/restaurantes-proximos.js  -> ao vivo, quando o executivo escolhe onde atuar
//   2) scripts/prewarm-osm.js        -> de madrugada, enchendo o cache das praças fixas
// Se cada um tivesse sua própria cópia de "montar consulta / normalizar / gerar chave de
// cache", bastaria uma divergir para o robô gravar num formato que o endpoint não acha —
// e o pré-aquecimento silenciosamente pararia de servir para nada. Fonte única aqui.
//
// Vercel inclui requires relativos no bundle da função serverless. Precedente já em
// produção neste repo: api/restaurantes-proximos.js requer '../data/usuarios.json'.

// Espelhos em ordem de preferência — REORDENADO em 11/08 com base em medição real:
// na sessão de validação os 3 espelhos "clássicos" falharam em sequência e o
// maps.mail.ru respondeu (Campo Grande/RJ, 65 itens). Custo da ordem antiga: 62s de
// espera — a 1s do limite de 60s da Vercel. Agora o que respondeu vai primeiro.
const ESPELHOS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

// Timeout por espelho no caminho AO VIVO. 8s: espelho saudável responde raio de 3km em
// 1-4s; se passou de 8s ele está sobrecarregado e insistir só queima o orçamento de 60s
// da Vercel. Pior caso 4 x 8s = 32s, com folga.
const TIMEOUT_AO_VIVO_MS = 8000;

// O robô roda no GitHub Actions, onde não existe o teto de 60s. Pode ser paciente: varre
// raio maior e prefere esperar a falhar, porque cada acerto aqui é um executivo que de
// dia não espera nada.
const TIMEOUT_ROBO_MS = 120000;

// ICP de food service. `amenity` cobre restaurante/bar/café; `shop` cobre padaria e
// confeitaria, que no Brasil é cliente Takeat tanto quanto restaurante.
function montarConsulta(lat, lng, raioMetros, timeoutSegundos) {
  const A = '["amenity"~"^(restaurant|fast_food|cafe|bar|pub|ice_cream|food_court|biergarten)$"]';
  const S = '["shop"~"^(bakery|pastry|confectionery|deli|butcher)$"]';
  const volta = '(around:' + raioMetros + ',' + lat + ',' + lng + ')';
  // O [timeout:N] manda o PRÓPRIO servidor Overpass desistir junto com o nosso abort.
  // Sem isso o espelho segue processando uma consulta que ninguém vai mais ler.
  const t = Math.max(5, Math.round(timeoutSegundos || 8));
  // "out center tags" devolve coordenada mesmo para way/relation (polígono do prédio),
  // que é como muitos restaurantes maiores estão mapeados no OSM.
  return '[out:json][timeout:' + t + '];(nwr' + A + volta + ';nwr' + S + volta + ';);out center tags;';
}

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = g => g * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const ROTULO_TIPO = {
  restaurant: 'Restaurante', fast_food: 'Lanchonete', cafe: 'Cafeteria', bar: 'Bar',
  pub: 'Bar', ice_cream: 'Sorveteria/Açaí', food_court: 'Praça de alimentação',
  biergarten: 'Bar', bakery: 'Padaria', pastry: 'Confeitaria',
  confectionery: 'Doceria', deli: 'Empório', butcher: 'Casa de carnes'
};

// Normaliza o elemento cru do OSM no formato que o cockpit já usa para conta-alvo.
function normalizar(el, lat, lng) {
  const t = (el && el.tags) || {};
  const coord = el.type === 'node' ? { lat: el.lat, lon: el.lon } : (el.center || {});
  if (coord.lat == null || coord.lon == null) return null;
  if (!t.name) return null; // sem nome não dá pra visitar: não entra
  const tipoBruto = t.amenity || t.shop || '';
  return {
    osm_id: el.type + '/' + el.id,
    nome: String(t.name).slice(0, 160),
    tipo: ROTULO_TIPO[tipoBruto] || tipoBruto || 'Food service',
    tipo_osm: tipoBruto,
    cozinha: t.cuisine ? String(t.cuisine).replace(/[;_]/g, ', ') : null,
    telefone: t.phone || t['contact:phone'] || t['contact:mobile'] || null,
    endereco: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ') || null,
    bairro: t['addr:suburb'] || t['addr:neighbourhood'] || null,
    cidade: t['addr:city'] || null,
    cep: t['addr:postcode'] || null,
    site: t.website || t['contact:website'] || null,
    horario: t.opening_hours || null,
    lat: Number(coord.lat),
    lng: Number(coord.lon),
    km: Math.round(distanciaKm(lat, lng, Number(coord.lat), Number(coord.lon)) * 100) / 100
  };
}

// Dedup: o OSM às vezes tem o node E o polígono do mesmo estabelecimento, o que viraria
// dois pinos em cima do outro.
function dedup(itens) {
  const vistos = new Set();
  return itens.filter(i => {
    const k = i.nome.toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + i.lat.toFixed(4) + ',' + i.lng.toFixed(4);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// Recalcula distância e recorta a lista para um centro DIFERENTE do que foi consultado.
// É isso que permite reaproveitar um cache de 6km do robô para um pedido de 3km em outro
// ponto do bairro — sem isso o executivo veria "km" errado na tela.
function recortarPara(itens, lat, lng, raioMetros) {
  return itens
    .map(i => Object.assign({}, i, {
      km: Math.round(distanciaKm(lat, lng, Number(i.lat), Number(i.lng)) * 100) / 100
    }))
    .filter(i => i.km * 1000 <= raioMetros)
    .sort((a, b) => a.km - b.km);
}

async function consultarOverpass(consulta, timeoutMs) {
  const erros = [];
  const limite = timeoutMs || TIMEOUT_AO_VIVO_MS;
  for (const url of ESPELHOS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), limite);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Sem User-Agent identificável a Overpass devolve 429/406 — é regra deles.
          'User-Agent': 'CockpitTakeatFieldSales/1.0 (julyan@takeat.com.br)',
          'Accept': 'application/json'
        },
        body: 'data=' + encodeURIComponent(consulta)
      });
      clearTimeout(timer);
      const host = url.split('/')[2];
      if (!resp.ok) { erros.push(host + ' -> HTTP ' + resp.status); continue; }
      const json = await resp.json();
      if (!json || !Array.isArray(json.elements)) { erros.push(host + ' -> resposta sem elements'); continue; }
      return { elements: json.elements, espelho: host, erros };
    } catch (e) {
      clearTimeout(timer);
      erros.push(url.split('/')[2] + ' -> ' + (e.name === 'AbortError' ? 'timeout ' + (limite / 1000) + 's' : String(e.message || e).slice(0, 60)));
    }
  }
  return { elements: null, espelho: null, erros };
}

// Chave do cache = célula geográfica arredondada (3 casas ≈ 110m) + raio.
// ATENÇÃO: robô e endpoint precisam gerar a chave EXATAMENTE igual. Se mudar o
// arredondamento aqui, todo o cache pré-aquecido vira inalcançável de uma vez.
function celulaCache(lat, lng, raio) {
  return Number(lat).toFixed(3) + ',' + Number(lng).toFixed(3) + ',' + raio;
}

const HEADERS_SERVICE = k => ({
  apikey: k, Authorization: 'Bearer ' + k,
  'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'
});

async function gravarCache(supaUrl, serviceKey, chave, lat, lng, raio, itens) {
  if (!serviceKey) return false;
  try {
    const r = await fetch(supaUrl + '/rest/v1/restaurantes_osm?on_conflict=chave', {
      method: 'POST',
      headers: HEADERS_SERVICE(serviceKey),
      body: JSON.stringify([{
        chave: chave, lat: lat, lng: lng, raio_m: raio,
        itens: itens, buscado_em: new Date().toISOString()
      }])
    });
    return r.ok;
  } catch (e) { return false; } // cache é otimização: falhar aqui não invalida a resposta
}

module.exports = {
  ESPELHOS, TIMEOUT_AO_VIVO_MS, TIMEOUT_ROBO_MS,
  montarConsulta, distanciaKm, normalizar, dedup, recortarPara,
  consultarOverpass, celulaCache, gravarCache
};

  },
  "api/novidades-mercado.js": function (module, exports, require, process) {
// api/novidades-mercado.js
// Empresas de foodservice ABERTAS RECENTEMENTE na praça de cada executivo (Casa dos Dados).
//
// POR QUE ESTA ROTA EXISTE (Julyan, 11/08):
// Todo o resto do cockpit olha para dentro — HubSpot e Supabase, o que o time já tocou.
// Restaurante que abriu semana passada não está em lugar nenhum desses. E é o lead com
// a melhor janela que existe: ainda não escolheu sistema de PDV, ainda não assinou com
// concorrente, e o dono está comprando tudo ao mesmo tempo.
//
// Nota deliberada sobre a régua: aqui NÃO se busca "mais bem avaliado". Avaliação alta
// significa estabelecimento maduro — que quase sempre já tem fornecedor e contrato. O
// valor desta fonte é o oposto: quem acabou de abrir.
//
// Variáveis de ambiente:
//   SUPABASE_URL, SUPABASE_ANON_KEY   -> validação de sessão (obrigatórias, fail-closed)
//   SUPABASE_SERVICE_KEY              -> cache (opcional; sem ela funciona sem cache)
//   CASADOSDADOS_TOKEN                -> chave da API (obrigatória para esta rota)

// Grandes redes / key accounts que a Takeat não atende. Mesmo arquivo que a tela usa,
// pra fila e novidade não discordarem sobre o que é lead válido.
let REDES_EXCLUIDAS = [];
try {
  const raw = require('../data/redes-excluidas.json');
  REDES_EXCLUIDAS = (raw && Array.isArray(raw.redes)) ? raw.redes : [];
} catch (e) { REDES_EXCLUIDAS = []; }

// Tira acento E pontuação: sem o segundo passo, "Bob's Burger" não casava com a entrada
// "bobs burger" — e esse caso existe de verdade na base ("Bob's Burger - General Rocca").
const semAcento = t => String(t || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function ehRedeGrande(nome) {
  const n = semAcento(nome);
  return !!n && REDES_EXCLUIDAS.some(r => n.includes(semAcento(r)));
}

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

// CNAEs de foodservice — o ICP da Takeat. Sem este filtro a busca devolve qualquer
// empresa aberta na cidade e o executivo vira triador de lista, não vendedor.
const CNAE_FOODSERVICE = [
  '5611201', // Restaurantes e similares
  '5611202', // Bares e outros estabelecimentos, com entretenimento
  '5611203', // Lanchonetes, casas de chá, de sucos e similares
  '5611204', // Bares e outros estabelecimentos, sem entretenimento
  '5620104', // Fornecimento de alimentos preparados para consumo domiciliar
  '4721102', // Padaria e confeitaria com predominância de revenda
  '1091102'  // Padaria e confeitaria com predominância de produção própria
];

// Endpoint e header conferidos na documentação oficial (v5). A versão anterior usava
// /v2/public/..., que NÃO EXISTE — só há v4 e v5. Requisição a caminho inexistente caía
// no site e voltava a página de desafio do Cloudflare ("Just a moment"), com 403 e corpo
// HTML. Parecia problema de chave; era caminho errado.
// tipo_resultado=completo é obrigatório pra vir endereço, telefone e coordenada IBGE.
// TETO POR PRAÇA (Julyan, 11/08). Não é economia de crédito — é higiene de funil.
// A fila de contas-alvo já tem 267 registros. Somar 100 CNPJs novos por praça por
// semana transformaria a Prospecção numa lista que ninguém lê. 30 é o que um executivo
// consegue tocar de verdade numa semana, junto do resto do trabalho dele.
const LIMITE_POR_PRACA = 30;

const CASA_URL = 'https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo';

// Extração de contato por FORMA do valor, não por nome de campo — ver o comentário
// grande em lib/contato-cnpj.js e as 31 checagens em scripts/testar-contato-cnpj.js.
const { extrairContato } = require('../lib/contato-cnpj');
/* A CONSULTA DE ENDEREÇO é outra fonte e outro arquivo de propósito: a Casa dos Dados
   cobra por empresa e sabe telefone e sócio; a Receita via BrasilAPI é pública, de
   graça, e é quem tem endereço e situação cadastral. Ver o cabeçalho de
   lib/cnpj-lookup.js para por que as duas continuam. */
const { buscarCnpjNaReceita } = require('../lib/cnpj-lookup');

function isoDiasAtras(dias) {
  const d = new Date(Date.now() - dias * 86400000);
  return d.toISOString().slice(0, 10);
}

// Normaliza o registro cru da Casa dos Dados no formato que o cockpit já usa para lead.
// Os nomes de campo variam conforme a versão da API, então cada um tem alternativas —
// preferir undefined a inventar valor: campo vazio na tela é honesto, campo errado não.
function normalizar(e) {
  if (!e || !e.cnpj) return null;
  const end = e.endereco || {};
  const nome = (e.nome_fantasia && String(e.nome_fantasia).trim()) || (e.razao_social && String(e.razao_social).trim()) || 'Sem nome';
  const logradouro = [end.tipo_logradouro, end.logradouro].filter(Boolean).join(' ').trim();
  return {
    cnpj: String(e.cnpj),
    nome: nome.slice(0, 160),
    razaoSocial: e.razao_social || null,
    dataAbertura: e.data_abertura || null,
    porte: (e.porte_empresa && e.porte_empresa.descricao) || null,
    endereco: [logradouro, end.numero].filter(Boolean).join(', ') || null,
    bairro: end.bairro || null,
    municipio: end.municipio || null,
    uf: end.uf || null,
    cep: end.cep || null,
    // CORREÇÃO CRÍTICA (16/08/26, Julyan: "ainda não funciona" na busca por
    // proximidade — investigado ao vivo com o Bruno): `end.ibge.latitude/longitude`
    // NÃO é o endereço do estabelecimento, é o centro geográfico do MUNICÍPIO
    // INTEIRO — confirmado que todos os leads de uma mesma cidade compartilhavam a
    // coordenada idêntica até a 13ª casa decimal, fazendo a busca "perto de mim" não
    // achar nada perto do bairro real, ou mostrar centenas de leads com a mesma
    // distância falsa. Geocodifica de verdade logo abaixo, em paralelo, onde `itens`
    // é montado — null aqui é o valor honesto até a geocodificação real acontecer.
    lat: null,
    lng: null,
    capital: e.capital_social != null ? Number(e.capital_social) : null,
    // Sem nome fantasia costuma ser empresário individual usando o próprio nome —
    // sinal fraco de estabelecimento com salão. Não descarta (pode ser cadastro
    // incompleto de um restaurante real), mas a tela avisa antes de ele ir até lá.
    semNomeFantasia: !(e.nome_fantasia && String(e.nome_fantasia).trim())
  };
}

// VERSÃO DOS FILTROS na chave do cache. Bug real, pego em 11/08: depois de acrescentar
// os filtros de MEI/contabilidade/rede, Vitória continuou devolvendo 100 resultados —
// era a linha antiga, gravada quando não havia filtro nenhum. Cache não sabe que a regra
// mudou; a chave precisa dizer. Suba este número sempre que mexer no corpo da consulta
// ou nos descartes, senão o filtro novo demora até 7 dias pra valer.
const VERSAO_FILTROS = 2;

function chaveCache(municipio, uf, dias) {
  return 'v' + VERSAO_FILTROS + '|' + String(municipio || '').toLowerCase().trim() + '|' + String(uf || '').toUpperCase().trim() + '|' + dias;
}

async function lerCache(supaUrl, serviceKey, chave, validadeHoras) {
  if (!serviceKey) return null;
  try {
    const limite = new Date(Date.now() - validadeHoras * 3600000).toISOString();
    const url = supaUrl + '/rest/v1/novidades_mercado?chave=eq.' + encodeURIComponent(chave)
      + '&buscado_em=gte.' + encodeURIComponent(limite) + '&select=itens,buscado_em&limit=1';
    const r = await fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } });
    if (!r.ok) return null;
    const row = (await r.json() || [])[0];
    return row && Array.isArray(row.itens) ? { itens: row.itens, buscadoEm: row.buscado_em } : null;
  } catch (e) { return null; }
}

async function gravarCache(supaUrl, serviceKey, chave, itens) {
  if (!serviceKey) return;
  try {
    await fetch(supaUrl + '/rest/v1/novidades_mercado?on_conflict=chave', {
      method: 'POST',
      headers: {
        apikey: serviceKey, Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ chave: chave, itens: itens, buscado_em: new Date().toISOString() }])
    });
  } catch (e) { /* cache é otimização: falhar aqui não invalida a resposta */ }
}

// Geocodifica em paralelo (Promise.all) — sequencial estourava fácil o timeout de uma
// função serverless (30 leads x algumas centenas de ms cada = pode passar dos 10s do
// plano Hobby). Paralelo, todas as chamadas saem juntas e o tempo total vira o de
// UMA chamada, não da soma de 30. Falha individual não derruba a lista inteira.
async function geocodificarLote(itens, maptilerKey) {
  if (!maptilerKey) return itens;
  return Promise.all(itens.map(async item => {
    const texto = [item.endereco, item.bairro, item.municipio, item.uf].filter(Boolean).join(', ');
    if (!texto) return item;
    try {
      const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(texto)}.json?key=${maptilerKey}&country=br&language=pt`;
      const resp = await fetch(url);
      if (!resp.ok) return item;
      const json = await resp.json();
      const top = (json.features || [])[0];
      if (!top || !Array.isArray(top.center)) return item;
      const [lng, lat] = top.center;
      return { ...item, lat, lng };
    } catch (e) { return item; }
  }));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || null;
  const casaToken = process.env.CASADOSDADOS_TOKEN || null;
  if (!supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração (SUPABASE_URL e SUPABASE_ANON_KEY obrigatórios).' });
  }
  /* A TRAVA DO TOKEN SAIU DAQUI (16/09/26) e foi para os dois ramos que consomem a
     Casa dos Dados. Na porta, ela devolvia 500 para TODA chamada — inclusive para a
     consulta de endereço na Receita, que é outra fonte e não usa este token. Porta
     fechada por causa de credencial que o pedido nem toca é o tipo de acoplamento
     que faz um recurso nascer quebrado sem ninguém entender por quê. */
  const exigirCasa = function () {
    if (casaToken) return null;
    return {
      etapa: 'config',
      erro: 'CASADOSDADOS_TOKEN não está configurada na Vercel — sem ela não dá para consultar a Casa dos Dados.'
    };
  };

  // ---- 1. sessão válida (fail-closed, mesmo padrão das outras rotas) ----
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  let emailLogado = null;
  try {
    const check = await fetch(supaUrl + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + sessionToken, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado.' });
  if (USUARIOS.length && !USUARIOS.some(u => String(u.email).toLowerCase() === emailLogado)) {
    return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });
  }

  // ---- 2. ENDEREÇO PELA RECEITA (grátis, público, sem crédito) ----
  /* É o que o formulário de Ag. Pagamento chama quando o executivo clica na lupa do
     CNPJ. Responde razão social, situação cadastral, CEP, número e logradouro.

     NÃO DEVOLVE E-MAIL NEM TELEFONE, mesmo que a Receita traga: naquele cadastro
     esses dois são muitas vezes do CONTADOR, e este formulário gera cobrança no
     Asaas — link de pagamento para a pessoa errada é o defeito que ninguém percebe
     até o cliente dizer que não recebeu. O corte está no lib, não aqui, para nenhuma
     outra tela conseguir pedir diferente.

     SEM CACHE, e de propósito: não custa crédito, a consulta é de uma empresa só e
     acontece uma vez por contrato fechado. Cache aqui seria guardar endereço de
     cliente no nosso banco para economizar nada. */
  if (req.body && req.body.cnpjReceita) {
    const r = await buscarCnpjNaReceita(req.body.cnpjReceita);
    /* QUEM RECUSOU VAI JUNTO no erro. O 403 que o Julyan levou em 16/09 dizia só "a
       consulta respondeu 403", e isso e indistinguivel de "a nossa chamada esta errada" —
       levou uma medicao fora da Vercel para descobrir que era limite de IP. Com a lista,
       a proxima vez se diagnostica pela propria tela. */
    if (r.erro) return res.status(422).json({ ok: false, erro: r.erro, tentativas: r.tentativas || null });
    return res.status(200).json({ ok: true, origem: 'receita', receita: r.dados, tentativas: r.tentativas || null });
  }

  // ---- 2a. CONTATO SOB DEMANDA (uma empresa por vez) ----
  //
  // O schema da Pesquisa Avançada (CNPJPesquisaResposta) NÃO tem telefone nem e-mail —
  // conferido na documentação. O filtro `com_telefone` apenas seleciona quem possui
  // telefone; não devolve o número. Para obter contato é preciso a Consulta CNPJ (v4),
  // que cobra crédito POR EMPRESA.
  //
  // Por isso não se busca contato das 30 de uma vez: seriam 150 créditos por semana
  // (5 praças) para telefones que ninguém pediu. Aqui o executivo pede o contato da
  // empresa em que vai agir — 1 crédito, no momento em que vale a pena. O cache é
  // longo porque telefone de CNPJ não muda.
  if (req.body && req.body.cnpj) {
    const faltaCasa = exigirCasa();
    if (faltaCasa) return res.status(500).json(faltaCasa);
    const cnpjLimpo = String(req.body.cnpj).replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ deve ter 14 dígitos.' });
    const chaveContato = 'contato|v' + VERSAO_FILTROS + '|' + cnpjLimpo;

    /* `semCache: true` pula a leitura do cache — só para verificar um conserto de parse
       sem esperar 90 dias nem invalidar o cache de todas as praças subindo
       VERSAO_FILTROS. Continua GRAVANDO no cache depois, então o crédito gasto na
       verificação não se perde. */
    const pularCache = !!(req.body && req.body.semCache === true);
    const doCacheContato = pularCache ? null : await lerCache(supaUrl, serviceKey, chaveContato, 24 * 90);
    if (doCacheContato) {
      return res.status(200).json({ ok: true, origem: 'cache', contato: doCacheContato.itens[0] || null });
    }
    try {
      const r = await fetch('https://api.casadosdados.com.br/v4/cnpj/' + cnpjLimpo, {
        method: 'GET', headers: { 'api-key': casaToken }
      });
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) { j = null; }
      if (!r.ok || !j) {
        return res.status(r.status || 502).json({
          etapa: 'consulta-cnpj', httpCasa: r.status,
          erro: (j && (j.message || j.erro)) || 'Casa dos Dados recusou a consulta de CNPJ.'
        });
      }
      /* BUG RAIZ, achado em 28/08/26 com o diagnóstico ao vivo.
         Isto era: `const d = j.cnpj || j.data || j;` — pensado para "algumas versões
         aninham o registro em .cnpj". Só que nesta versão `j.cnpj` é a STRING do próprio
         CNPJ ("67734243000124"), não um objeto. Então `d` virava a string, e
         `Object.keys(d)` devolvia ["0","1",...,"13"] — os índices dos caracteres.

         Resultado: TODA busca de campo falhava, sempre. Não era nome de campo errado,
         como o comentário antigo supunha e como eu também supus — era o desembrulho
         pegando um valor escalar. Por isso `socio` estava em 0 de 869: a extração nunca
         teve o registro na mão.

         Agora só desembrulha o que for objeto. */
      const aninhado = c => (c && typeof c === 'object' && !Array.isArray(c)) ? c : null;
      const d = aninhado(j.cnpj) || aninhado(j.data) || aninhado(j.empresa) || j;

      /* EXTRAÇÃO POR FORMA, não por nome de campo (28/08/26).
         O que havia aqui era uma lista de nomes escolhidos por semelhança com outras
         APIs de CNPJ e — como o comentário original admitia — nunca validada contra a
         resposta real. O banco mostrou o resultado: `socio` preenchido em 0 das 869
         contas-alvo.

         A tentação era pegar UMA resposta real e fixar os nomes que ela mostrasse. Isso
         consertaria hoje e voltaria a quebrar na próxima mudança de contrato — e cada
         descoberta custa 1 crédito, porque a Consulta CNPJ cobra por empresa.

         Agora a regra vive em lib/contato-cnpj.js, reconhece telefone/e-mail/sócio pela
         FORMA do valor dentro de chaves que falem daquilo, e tem 31 checagens em
         scripts/testar-contato-cnpj.js cobrindo os formatos plausíveis — inclusive os
         casos negativos que importam: CNPJ e CEP não podem virar telefone, e valor com
         cara de telefone fora de chave de telefone não é pego (trocaria erro visível por
         errado silencioso). */
      // PEDIDO (17/08/26, Julyan: "puxar endereço, sócio majoritário e telefone") —
      // endereço já vem na busca em lote (v5); telefone e sócio só saem na Consulta
      // CNPJ avulsa (v4), que é esta mesma chamada — então sócio "pega carona" no
      // crédito que já ia ser gasto pelo telefone, sem custo adicional.
      //
      // HISTÓRICO (28/08/26): aqui havia um aviso de que a chamada nunca tinha sido
      // testada ao vivo e que os nomes de campo eram palpite. O aviso estava certo —
      // `socio` ficou em 0 de 869 contas-alvo. A extração deixou de depender de nome
      // de campo (lib/contato-cnpj.js) e passou a ter teste próprio; e quando ela não
      // acha nada, a resposta traz `diagnostico` com as chaves reais recebidas. Uma
      // resposta inesperada agora se explica sozinha, sem gastar crédito no escuro.
      //
      // "Sócio majoritário" com percentual de participação não é dado público da
      // Receita Federal (QSA só traz nome + qualificação, ex.: "49-Sócio-Administrador"),
      // então mostramos o PRIMEIRO sócio da lista (geralmente o fundador/administrador)
      // como proxy — rotulado só "Sócio", pra não prometer um dado que não existe.
      const contato = extrairContato(d, cnpjLimpo);

      /* DIAGNÓSTICO DE CONTRATO (28/08/26).
         O comentário acima admite que os nomes de campo nunca foram validados contra a
         resposta real da v4 — foram escolhidos por semelhança com outras APIs de CNPJ. E
         o banco mostra o resultado disso: `socio` está preenchido em 0 das 869 contas-alvo.
         Ou o campo tem outro nome, ou ninguém nunca clicou no botão. Sem ver a resposta
         real não há como saber qual das duas.

         Então a rota passa a se auto-diagnosticar: quando o parse não encontra NEM
         telefone NEM sócio, ela devolve as chaves que realmente vieram. Nome de chave não
         é dado sensível e resolve o problema em uma chamada, em vez de exigir tentativa e
         erro a 1 crédito por tentativa.

         `bruto` só sai com `debug: true` explícito no corpo: é a resposta inteira da
         Receita para aquele CNPJ, e não deve trafegar por acidente em uso normal.
         NÃO entra no cache — o cache guarda só `contato`, para não fossilizar um
         diagnóstico junto do dado. */
      const achouAlgo = !!(contato.telefone || contato.socio);
      const diagnostico = achouAlgo ? null : {
        aviso: 'Parse não achou telefone nem sócio. Abaixo, as chaves que a Casa dos Dados devolveu de fato.',
        chavesTopo: Object.keys(j || {}),
        chavesRegistro: Object.keys(d || {}),
        temQsa: Array.isArray(d.qsa) || Array.isArray(d.socios) || Array.isArray(d.quadro_societario),
        chavesEndereco: (d.endereco && typeof d.endereco === 'object') ? Object.keys(d.endereco) : null
      };

      await gravarCache(supaUrl, serviceKey, chaveContato, [contato]);
      return res.status(200).json(Object.assign(
        { ok: true, origem: 'casadosdados', contato: contato },
        diagnostico ? { diagnostico } : {},
        (diagnostico && req.body && req.body.debug === true) ? { bruto: d } : {}
      ));
    } catch (e) {
      return res.status(500).json({ etapa: 'consulta-cnpj', erro: 'Falha ao consultar o CNPJ: ' + String(e.message || e) });
    }
  }

  // ---- 3. PESQUISA POR PRAÇA (Casa dos Dados, paga) ----
  /* O SEGUNDO CONSUMIDOR DO TOKEN. Ele também precisa exigir a credencial por conta
     própria agora que a trava saiu da porta — sem isto a busca por praça rodaria com
     token nulo e a Casa dos Dados devolveria 401, que na tela vira "nenhuma novidade"
     em vez de "falta configurar a chave". Erro de configuração tem de se dizer. */
  const faltaCasaPraca = exigirCasa();
  if (faltaCasaPraca) return res.status(500).json(faltaCasaPraca);

  const body = req.body || {};
  const municipio = String(body.municipio || '').trim();
  const uf = String(body.uf || '').trim().toUpperCase();
  if (!municipio || !uf) return res.status(400).json({ erro: 'municipio e uf são obrigatórios.' });
  // Teto de 180 dias: acima disso "recém-aberto" deixa de ser verdade e a janela some.
  const dias = Math.min(Math.max(Number(body.dias) || 60, 7), 180);
  const chave = chaveCache(municipio, uf, dias);

  // ---- 3. cache SEMANAL ----
  // 7 dias, não 12h (Julyan: "uma vez por semana"). Duas razões que apontam pro mesmo
  // número: cada consulta gasta crédito, e uma lista que muda todo dia impede o
  // executivo de terminar a da semana passada. Estabilidade aqui é feature.
  const doCache = await lerCache(supaUrl, serviceKey, chave, 24 * 7);
  if (doCache) {
    return res.status(200).json({
      ok: true, origem: 'cache', buscadoEm: doCache.buscadoEm,
      total: doCache.itens.length, itens: doCache.itens
    });
  }

  // ---- 4. Casa dos Dados ----
  // Consulta paga por crédito: 1 chamada por praça a cada 12h, nunca por tecla digitada.
  //
  // AUTENTICAÇÃO EM CASCATA (11/08): a primeira tentativa com o header `api-key` voltou
  // 403 com corpo VAZIO — sintoma de formato de autenticação recusado, não de crédito
  // acabado (que traz mensagem). A documentação da Casa dos Dados já mudou de formato
  // entre versões, então em vez de chutar uma variação por deploy, tenta as conhecidas
  // em sequência e RELATA qual passou. Para no primeiro 2xx.
  //
  // O custo disso é zero em crédito: 401/403 não consomem consulta. Assim que soubermos
  // qual vale, dá pra fixar só ela — o campo `autenticacaoQueFuncionou` na resposta é
  // exatamente esse recado.
  const variantes = [
    { nome: 'header api-key', headers: { 'api-key': casaToken } },
    { nome: 'header api_key', headers: { 'api_key': casaToken } },
    { nome: 'header Authorization Bearer', headers: { Authorization: 'Bearer ' + casaToken } },
    { nome: 'header x-api-key', headers: { 'x-api-key': casaToken } }
  ];

  try {
    const corpoConsulta = JSON.stringify({
      codigo_atividade_principal: CNAE_FOODSERVICE,
      situacao_cadastral: ['ATIVA'],
      uf: [uf.toLowerCase()],
      // A doc exemplifica município em minúsculas e sem acento ("sao paulo"), então
      // normaliza — mandar "Vitória" e receber zero seria o pior tipo de falha: silenciosa.
      municipio: [municipio.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')],
      data_abertura: { inicio: isoDiasAtras(dias), fim: isoDiasAtras(0) },
      // MEI FORA (Julyan, 11/08: "a ideia é não sujar o funil da galera").
      // A primeira consulta real a Vitória voltou 100 empresas e a primeira era
      // "68.524.312 KEVEN BRAVO FERREIRA" — MEI, razão social com CPF, sem nome
      // fantasia. MEI de foodservice é quase sempre cozinha de casa ou ambulante:
      // não tem salão, não tem comanda, não é cliente de PDV. Entram em volume e
      // afogam o restaurante de verdade que a busca deveria achar.
      mei: { excluir_optante: true },
      // Sem telefone o executivo não tem por onde começar a abordagem.
      // excluir_email_contab: sem isso o contato que vem é o escritório de contabilidade
      // que abriu o CNPJ, não o dono do restaurante. O executivo liga, fala com quem não
      // decide nada, e marca o lead como "sem interesse" — perdendo um lead que era bom.
      mais_filtros: { com_telefone: true, excluir_email_contab: true },
      limite: LIMITE_POR_PRACA,
      pagina: 1
    });

    let resp = null, json = null, usada = null;
    const tentativas = [];
    for (const v of variantes) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        const r = await fetch(CASA_URL, {
          method: 'POST',
          signal: ctrl.signal,
          headers: Object.assign({ 'Content-Type': 'application/json' }, v.headers),
          body: corpoConsulta
        });
        clearTimeout(timer);
        // Lê como TEXTO primeiro: a resposta de erro deles às vezes vem em HTML, e
        // .json() engoliria a única pista útil que existe.
        const texto = await r.text();
        let j = null;
        try { j = JSON.parse(texto); } catch (e) { j = null; }
        tentativas.push({
          via: v.nome, http: r.status,
          corpo: (j && (j.message || j.erro || j.detail || j.error)) || (texto ? texto.slice(0, 220) : '(vazio)')
        });
        if (r.ok) { resp = r; json = j || {}; usada = v.nome; break; }
      } catch (e) {
        clearTimeout(timer);
        tentativas.push({ via: v.nome, http: null, corpo: String(e.message || e).slice(0, 120) });
      }
    }

    if (!resp) {
      return res.status(502).json({
        etapa: 'casadosdados',
        erro: 'Nenhum formato de autenticação foi aceito pela Casa dos Dados.',
        // Cada linha diz o que aquele formato respondeu — é o que permite corrigir
        // sem mais um ciclo de tentativa e erro.
        tentativas: tentativas
      });
    }

    // Formato documentado: { total, cnpjs: [...] }. Mantidas alternativas como rede de
    // segurança — a doc tem "modificado há aproximadamente 1 ano" e formato muda.
    const cru = (json && (json.cnpjs || json.results || (Array.isArray(json.data) ? json.data : null))) || [];
    if (!Array.isArray(cru)) {
      return res.status(502).json({
        etapa: 'formato',
        erro: 'Resposta da Casa dos Dados veio num formato inesperado — o cockpit não sabe onde estão os registros.',
        chavesRecebidas: Object.keys(json || {})
      });
    }

    // Rede grande fora também aqui: o filtro de MEI e o de contabilidade acontecem na
    // API, mas nome de rede só dá pra avaliar depois que o registro chega.
    // EMPRESÁRIO INDIVIDUAL PELO CPF NO NOME — medido antes de decidir o corte.
    // Em Porto Alegre, 15 dos 30 resultados vinham sem nome fantasia. A tentação era
    // cortar os 15; só que 12 deles têm LTDA/EIRELI na razão social — são empresas de
    // verdade com cadastro incompleto, e cortá-las jogaria fora lead bom.
    // Os outros 3 começam com dígito: é o CPF virando razão social, padrão do
    // empresário individual sem estabelecimento. Esses saem.
    // Precisão importa: "4 Estações Restaurante LTDA" também começa com dígito e é
    // cliente legítimo. O padrão do empresário individual é o CPF INTEIRO no início —
    // 11 dígitos, com ou sem pontuação — seguido do nome da pessoa. E se houver marca
    // societária (LTDA/EIRELI/S.A./ME), é empresa: não corta em nenhuma hipótese.
    const ehPessoaFisica = i => {
      const t = String(i.razaoSocial || i.nome || '').trim();
      if (/\b(ltda|eireli|s\/?a\b|me\b|mei\b|epp\b)/i.test(t)) return false;
      const inicio = t.split(/\s+/)[0] || '';
      // >= 8 dígitos: o caso real da base ("68.524.312 ...") é a RAIZ DO CNPJ virando
      // razão social, com 8 dígitos — não CPF com 11, como eu supus primeiro. Oito é o
      // piso seguro: nenhum nome comercial começa com um número de 8 dígitos
      // ("24 Horas", "360 Graus", "4 Estações" têm 2 ou 3).
      return /^\d[\d.\-\/]*$/.test(inicio) && inicio.replace(/\D/g, '').length >= 8;
    };
    let descartadasRede = 0, descartadasPF = 0;
    const itens = cru.map(normalizar).filter(Boolean)
      .filter(i => {
        const rede = ehRedeGrande(i.nome) || ehRedeGrande(i.razaoSocial);
        if (rede) { descartadasRede++; return false; }
        if (ehPessoaFisica(i)) { descartadasPF++; return false; }
        return true;
      })
      // Mais novo primeiro: a janela de oportunidade encolhe a cada dia que passa.
      .sort((a, b) => String(b.dataAbertura || '').localeCompare(String(a.dataAbertura || '')));

    const maptilerKey = (() => { try { return require('../data/maptiler-config.json').key; } catch (e) { return null; } })();
    const itensComCoordenada = await geocodificarLote(itens, maptilerKey);

    await gravarCache(supaUrl, serviceKey, chave, itensComCoordenada);

    return res.status(200).json({
      ok: true, origem: 'casadosdados', municipio: municipio, uf: uf, dias: dias,
      autenticacaoQueFuncionou: usada,
      // Transparência do funil: quantas vieram e quantas foram cortadas, e por quê.
      // Número que encolhe sem explicação é número em que ninguém confia.
      recebidasDaApi: cru.length,
      descartadasRede: descartadasRede,
      descartadasPessoaFisica: descartadasPF,
      total: itensComCoordenada.length, itens: itensComCoordenada
    });
  } catch (e) {
    const abortou = e && e.name === 'AbortError';
    return res.status(abortou ? 504 : 500).json({
      etapa: 'casadosdados',
      erro: abortou ? 'Casa dos Dados demorou mais de 20s para responder.' : 'Falha ao falar com a Casa dos Dados: ' + String(e.message || e)
    });
  }
};

  },
  "lib/contato-cnpj.js": function (module, exports, require, process) {
// lib/contato-cnpj.js
// Extrai telefone, e-mail, sócio e endereço da resposta de uma Consulta CNPJ.
//
// POR QUE ISTO EXISTE, e por que não é uma lista de nomes de campo (28/08/26)
//
// A rota api/novidades-mercado.js montava o contato assim:
//
//   telefone: d.telefone_1 || d.telefone || (Array.isArray(d.telefones) ? ... )
//
// e o comentário dela admitia: "não testei esta chamada ao vivo — os nomes de campo
// abaixo são os mais comuns entre APIs de CNPJ brasileiras". O banco mostrou o
// resultado disso: `socio` preenchido em 0 das 869 contas-alvo.
//
// A tentação era pegar UMA resposta real e fixar os nomes que ela mostrasse. Isso
// resolveria hoje e voltaria a quebrar na próxima mudança de contrato — e cada
// descoberta custa 1 crédito da API, porque a Consulta CNPJ cobra por empresa.
//
// Então a extração passa a ser por FORMA, não por nome:
//   · telefone  -> chave cujo nome fala de telefone, com valor que TEM cara de telefone
//                  (10 a 13 dígitos, os do Brasil com DDD);
//   · e-mail    -> chave que fala de e-mail, com "@" no valor;
//   · sócio     -> primeiro item de um array que fale de QSA/sócios/quadro, pegando
//                  dentro dele a chave que fala de nome;
//   · endereço  -> montado das partes, aceitando as variações usuais.
//
// A busca é DELIBERADAMENTE rasa: nível de topo e um nível de aninhamento. Varredura
// profunda acharia telefone em qualquer lugar (inclusive do contador, do escritório de
// registro) e trocaria um erro visível por um errado silencioso.
//
// "Sócio majoritário" com percentual não é dado público da Receita (o QSA traz nome +
// qualificação), então devolvemos o PRIMEIRO da lista como proxy — geralmente o
// administrador — e a tela rotula só "Sócio", sem prometer o que o dado não é.

/* `telef` e não `telefone` (ajuste de 28/08/26, com a resposta real na mão): o campo
   desta API chama-se `contato_telefonico`, e "telefonico" não contém "telefone" nem
   "fone" — tem "foni". O prefixo `telef` cobre telefone, telefônico, telefonia. */
const RE_TELEFONE_CHAVE = /(telef|phone|fone|celular|whats)/i;
const RE_EMAIL_CHAVE = /(e[-_]?mail)/i;
const RE_SOCIO_ARRAY = /(qsa|socio|sócio|quadro)/i;
const RE_NOME_CHAVE = /(nome|name|razao|razão)/i;

/* Telefone brasileiro com DDD tem 10 (fixo) ou 11 (celular) dígitos; com +55 vai a 12
   ou 13. Fora dessa faixa é CNPJ, CEP, código de município ou id — todos numéricos e
   todos presentes numa resposta de CNPJ. É este teste que evita pegar o campo errado. */
function pareceTelefone(valor) {
  if (valor == null) return false;
  const digitos = String(valor).replace(/\D/g, '');
  return digitos.length >= 10 && digitos.length <= 13;
}

function pareceEmail(valor) {
  return typeof valor === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
}

// Camadas onde vale procurar: o objeto e um nível de objetos-filhos.
function camadas(d) {
  if (!d || typeof d !== 'object') return [];
  const out = [d];
  Object.keys(d).forEach(k => {
    const v = d[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(v);
  });
  return out;
}

function acharTelefones(d) {
  const achados = [];
  camadas(d).forEach(obj => {
    Object.keys(obj).forEach(k => {
      if (!RE_TELEFONE_CHAVE.test(k)) return;
      const v = obj[k];
      if (Array.isArray(v)) {
        v.forEach(item => {
          if (pareceTelefone(item)) achados.push(String(item));
          else if (item && typeof item === 'object') {
            Object.keys(item).forEach(k2 => { if (pareceTelefone(item[k2])) achados.push(String(item[k2])); });
          }
        });
      } else if (pareceTelefone(v)) {
        achados.push(String(v));
      }
    });
  });
  // Sem duplicata, preservando a ordem de descoberta (chaves "_1" antes de "_2" na
  // prática, porque Object.keys respeita a ordem de inserção do JSON).
  return achados.filter((t, i) => achados.indexOf(t) === i);
}

function acharEmail(d) {
  let achado = null;
  camadas(d).forEach(obj => {
    if (achado) return;
    Object.keys(obj).forEach(k => {
      if (achado || !RE_EMAIL_CHAVE.test(k)) return;
      if (pareceEmail(obj[k])) achado = String(obj[k]).trim();
    });
  });
  return achado;
}

function acharSocio(d) {
  let achado = null;
  camadas(d).forEach(obj => {
    if (achado) return;
    Object.keys(obj).forEach(k => {
      if (achado || !RE_SOCIO_ARRAY.test(k)) return;
      const v = obj[k];
      if (Array.isArray(v) && v.length) {
        const primeiro = v[0];
        if (typeof primeiro === 'string' && primeiro.trim()) { achado = primeiro.trim(); return; }
        if (primeiro && typeof primeiro === 'object') {
          const chaveNome = Object.keys(primeiro).find(k2 => RE_NOME_CHAVE.test(k2) && typeof primeiro[k2] === 'string' && primeiro[k2].trim());
          if (chaveNome) achado = String(primeiro[chaveNome]).trim();
        }
      } else if (typeof v === 'string' && v.trim() && RE_NOME_CHAVE.test(k) === false) {
        // ex.: socio_administrador: "Maria Silva" — chave fala de sócio e o valor é o nome.
        achado = v.trim();
      }
    });
  });
  return achado;
}

function acharEndereco(d) {
  const fonte = (d && d.endereco && typeof d.endereco === 'object') ? d.endereco : d;
  if (!fonte || typeof fonte !== 'object') return null;
  const pega = (...nomes) => {
    for (const n of nomes) {
      const k = Object.keys(fonte).find(x => x.toLowerCase() === n);
      if (k && fonte[k] != null && String(fonte[k]).trim()) return String(fonte[k]).trim();
    }
    return null;
  };
  const via = [pega('tipo_logradouro'), pega('logradouro', 'rua', 'endereco')].filter(Boolean).join(' ');
  const partes = [
    via || null,
    pega('numero', 'number'),
    pega('bairro'),
    pega('municipio', 'cidade'),
    pega('uf', 'estado')
  ].filter(Boolean);
  return partes.length ? partes.join(', ') : null;
}

/* Recebe o registro já desaninhado (j.cnpj || j.data || j) e devolve o contato no
   formato que a tela espera. Nunca lança: resposta inesperada devolve nulos, e quem
   chama decide o que dizer. */
function extrairContato(d, cnpjLimpo) {
  const telefones = acharTelefones(d);
  return {
    cnpj: cnpjLimpo || null,
    telefone: telefones[0] || null,
    telefone2: telefones[1] || null,
    email: acharEmail(d),
    socio: acharSocio(d),
    endereco: acharEndereco(d)
  };
}

module.exports = { extrairContato, pareceTelefone, acharTelefones, acharEmail, acharSocio, acharEndereco };

  },
  "lib/cnpj-lookup.js": function (module, exports, require, process) {
// lib/cnpj-lookup.js
// Consulta um CNPJ na Receita e devolve só o que o formulário de Ag. Pagamento precisa
// para se preencher sozinho.
//
// ══ POR QUE UMA CADEIA DE PROVEDORES, E NÃO UM (16/09/26) ═══════════════════════════
// A primeira versão chamava só a BrasilAPI. Em produção, na primeira busca de verdade,
// o Julyan levou:
//
//     "A consulta à Receita respondeu 403 — preencha à mão e siga."
//
// MEDIDO: o MESMO CNPJ responde 200 fora da Vercel. Ou seja, o 403 não é do número nem
// da nossa chamada — é do IP. A BrasilAPI limita IP de datacenter, e o IP de saída da
// Vercel é compartilhado entre muitos clientes, então ele já chega no teto sem a gente
// ter feito nada. Repetir a chamada não resolve: o que resolve é ter para onde ir.
//
// A ORDEM NÃO É ALFABÉTICA — é por COMPLETUDE, e isso foi medido no CNPJ dele:
//
//     publica.cnpj.ws    cep 29100250 · numero "680" · logradouro "RUA DOM JORGE..."
//     minhareceita.org   cep 29100250 · numero ""    · logradouro ""
//     brasilapi          cep 29100250 · numero ""    · logradouro ""   (e 403 da Vercel)
//
// Duas das três devolvem o CEP e deixam o NÚMERO vazio — e número é metade do que este
// recurso promete preencher. Por isso a cnpj.ws vem primeiro: quando ela responde, o
// executivo não digita nada.
//
// ══ O QUE ESTA FUNÇÃO NÃO DEVOLVE, DE PROPÓSITO ════════════════════════════════════
// E-MAIL E TELEFONE FICAM DE FORA mesmo quando o provedor os traz — e os três trazem. Na
// Receita esses dois campos são, com frequência, do CONTADOR, não do dono do
// restaurante. Preencher o celular do contador num formulário que gera cobrança no Asaas
// manda o link de pagamento para a pessoa errada, e ninguém percebe até o cliente
// reclamar que não recebeu. O corte fica AQUI, e não na tela, para nenhuma outra tela
// conseguir pedir diferente.
//
// SITUAÇÃO CADASTRAL VEM JUNTO: o formulário desta etapa existe para gerar cobrança, e
// CNPJ BAIXADO ou SUSPENSO é coisa que o executivo tem de ver ANTES de fechar.
//
// Nunca lança. Falha de rede, CNPJ inexistente, provedor fora do ar: devolve
// `{ erro: '...' }` e quem chama decide o que dizer. O formulário nunca trava — digitar
// tudo à mão continua sendo um caminho inteiro.

function digitosDoCnpj(bruto) {
  return String(bruto == null ? '' : bruto).replace(/\D/g, '');
}

function texto(v) {
  const s = String(v == null ? '' : v).trim();
  return s ? s : null;
}

function soDigitos(v) {
  return texto(String(v == null ? '' : v).replace(/\D/g, ''));
}

/* A FORMA ÚNICA que a tela consome, seja qual for o provedor. Cada normalizador abaixo
   devolve exatamente isto — e é isto que garante que trocar a ordem, tirar ou acrescentar
   provedor não muda uma linha da tela. */
function montar(campos) {
  const situacao = texto(campos.situacao);
  return {
    cnpj: campos.cnpj || null,
    razaoSocial: texto(campos.razaoSocial),
    nomeFantasia: texto(campos.nomeFantasia),
    /* o CEP vai só com dígitos porque é assim que o HubSpot aceita — ele recusa a
       passagem INTEIRA quando chega pontuado (ver PROPS_SO_DIGITOS no template) */
    cep: soDigitos(campos.cep),
    /* "SN" (sem número) é resposta real da Receita, e o campo do formulário é texto
       justamente por isso: virar vazio faria o executivo achar que a consulta não veio */
    numero: texto(campos.numero),
    logradouro: texto([texto(campos.tipoLogradouro), texto(campos.logradouro)]
      .filter(Boolean).join(' ')),
    bairro: texto(campos.bairro),
    municipio: texto(campos.municipio),
    uf: texto(campos.uf),
    situacao: situacao,
    /* sem caixa: a Receita escreve "ATIVA" num provedor e "Ativa" noutro, e o aviso que
       depende disto não pode falhar por causa de maiúscula */
    ativa: !!situacao && situacao.toUpperCase().indexOf('ATIVA') === 0,
    fonte: campos.fonte || null
  };
}

/* ══ OS PROVEDORES ══════════════════════════════════════════════════════════════════
   Todos públicos, todos sem chave, todos com a mesma origem de dado (a base da Receita).
   O que muda entre eles é quanto do endereço sobrevive ao caminho — e qual deles está
   disposto a atender um IP de datacenter no momento em que o executivo clica. */
const PROVEDORES = [
  {
    /* PRIMEIRO PORQUE É O MAIS COMPLETO: é o único dos três que trouxe o NÚMERO no CNPJ
       que o Julyan testou. O endereço fica em `estabelecimento`, e cidade/estado são
       objetos aninhados. */
    nome: 'cnpj.ws',
    url: function (c) { return 'https://publica.cnpj.ws/cnpj/' + c; },
    normalizar: function (j, c) {
      const e = (j && j.estabelecimento) || {};
      return montar({
        cnpj: c, fonte: 'cnpj.ws',
        razaoSocial: j && j.razao_social,
        nomeFantasia: e.nome_fantasia,
        cep: e.cep, numero: e.numero,
        tipoLogradouro: e.tipo_logradouro, logradouro: e.logradouro,
        bairro: e.bairro,
        municipio: e.cidade && e.cidade.nome,
        uf: e.estado && e.estado.sigla,
        situacao: e.situacao_cadastral
      });
    }
  },
  {
    /* MESMO FORMATO DA BRASILAPI (mesma base por trás), mas é um serviço pensado para uso
       programático e não recusou o nosso IP nos testes. */
    nome: 'minhareceita.org',
    url: function (c) { return 'https://minhareceita.org/' + c; },
    normalizar: function (j, c) { return planoDaReceita(j, c, 'minhareceita.org'); }
  },
  {
    /* ÚLTIMO PORQUE FOI ELE QUE DEU 403 DA VERCEL. Continua na fila: 403 por IP vai e
       volta, e no dia em que os dois de cima estiverem fora ele pode ser quem atende. */
    nome: 'brasilapi',
    url: function (c) { return 'https://brasilapi.com.br/api/cnpj/v1/' + c; },
    normalizar: function (j, c) { return planoDaReceita(j, c, 'brasilapi'); }
  }
];

/* o formato "plano" da Receita, que a BrasilAPI e a minhareceita compartilham */
function planoDaReceita(j, c, fonte) {
  return montar({
    cnpj: c, fonte: fonte,
    razaoSocial: j && j.razao_social,
    nomeFantasia: j && j.nome_fantasia,
    cep: j && j.cep, numero: j && j.numero,
    tipoLogradouro: j && j.descricao_tipo_de_logradouro,
    logradouro: j && j.logradouro,
    bairro: j && j.bairro,
    municipio: j && j.municipio,
    uf: j && j.uf,
    situacao: j && j.descricao_situacao_cadastral
  });
}

/* PRAZO POR PROVEDOR, e não só para o conjunto: a função da Vercel morre em 10s, e um
   provedor pendurado levaria os outros dois junto — o executivo veria "a consulta
   falhou" quando havia dois caminhos livres que ninguém tentou. */
const PRAZO_MS = 3500;

async function tentar(prov, cnpjLimpo, f) {
  const ac = (typeof AbortController === 'function') ? new AbortController() : null;
  const relogio = ac ? setTimeout(function () { ac.abort(); }, PRAZO_MS) : null;
  try {
    const r = await f(prov.url(cnpjLimpo), {
      headers: { Accept: 'application/json' },
      signal: ac ? ac.signal : undefined
    });
    if (r.status === 404) return { naoExiste: true, fonte: prov.nome };
    if (!r.ok) return { recusou: r.status, fonte: prov.nome };
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || typeof j !== 'object') return { recusou: 'formato', fonte: prov.nome };
    const dados = prov.normalizar(j, cnpjLimpo);
    /* SEM RAZÃO SOCIAL NÃO HOUVE CONSULTA. Estes serviços devolvem 200 com `{message}`
       em alguns erros, e sem esta trava o formulário se preencheria com nulos e o
       executivo acharia que a Receita não tinha endereço. */
    if (!dados.razaoSocial) return { recusou: 'sem razão social', fonte: prov.nome };
    return { dados: dados };
  } catch (e) {
    return { recusou: (e && e.name === 'AbortError') ? 'tempo' : 'rede', fonte: prov.nome };
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

async function buscarCnpjNaReceita(cnpjBruto, opcoes) {
  const op = opcoes || {};
  const f = op.fetch || (typeof fetch === 'function' ? fetch : null);
  const cnpjLimpo = digitosDoCnpj(cnpjBruto);

  if (cnpjLimpo.length === 11) {
    return { erro: 'Isso é um CPF — a consulta de endereço na Receita só existe para CNPJ.' };
  }
  if (cnpjLimpo.length !== 14) {
    return { erro: 'CNPJ precisa ter 14 dígitos para a consulta — você digitou ' + cnpjLimpo.length + '.' };
  }
  if (!f) return { erro: 'Sem fetch disponível neste ambiente.' };

  const lista = op.provedores || PROVEDORES;
  const tentativas = [];
  for (const prov of lista) {
    const r = await tentar(prov, cnpjLimpo, f);
    if (r.dados) return { dados: r.dados, tentativas: tentativas };
    /* 404 É RESPOSTA, E NÃO FALHA: o provedor consultou e a Receita não tem o número.
       Perguntar o mesmo aos outros dois gastaria dois segundos para ouvir o mesmo. */
    if (r.naoExiste) {
      return { erro: 'A Receita não tem esse CNPJ. Confira o número.', tentativas: tentativas };
    }
    tentativas.push(prov.nome + ': ' + r.recusou);
  }
  /* A LISTA DE QUEM RECUSOU VAI JUNTO. Sem ela, "a consulta falhou" é indistinguível de
     "a nossa chamada está errada" — e foi justamente isso que custou tempo no 403. */
  return {
    erro: 'Nenhuma consulta à Receita respondeu agora — preencha à mão e siga.',
    tentativas: tentativas
  };
}

module.exports = {
  buscarCnpjNaReceita, montar, planoDaReceita, digitosDoCnpj, PROVEDORES, PRAZO_MS
};

  },
};

function resolver(de, spec) {
  const partes = (de.split('/').slice(0, -1).concat(spec.split('/')));
  const saida = [];
  partes.forEach((p) => { if (p === '..') saida.pop(); else if (p && p !== '.') saida.push(p); });
  let p = saida.join('/');
  if (!/\.(js|json)$/.test(p)) p += '.js';
  return p;
}

// ambiente = { process, json(caminho) }
export function carregador(ambiente) {
  const cache = Object.create(null);
  function requireDe(de) {
    return function (spec) {
      const p = resolver(de, spec);
      if (p.endsWith('.json')) return ambiente.json(p);
      if (cache[p]) return cache[p].exports;
      const fonte = FONTES[p];
      if (!fonte) throw new Error('arquivo do Cockpit nao portado: ' + p);
      const m = { exports: {} };
      cache[p] = m;
      fonte.call(m.exports, m, m.exports, requireDe(p), ambiente.process);
      return m.exports;
    };
  }
  return (arquivo) => requireDe('')('./' + arquivo);
}
