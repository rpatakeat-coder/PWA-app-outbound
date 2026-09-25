// GERADO por scripts/portar-cockpit-api.cjs a partir de cockpit-unificado@2a51316.
// NAO EDITAR: cada funcao abaixo e um arquivo do Cockpit, byte a byte. Para mudar
// uma regra, mude no Cockpit e gere de novo.
export const ORIGEM = "2a51316";
export const ROTAS = ["negocio-acao","criar-negocio","desfazer-negocio","criar-nota-negocio","criar-empresa-prospeccao","restaurantes-proximos","novidades-mercado","importar-leads","buscar-leads"];
export const JSONS = ["data/cadencias.json","data/comissionamento.json","data/leads-referencia.json","data/maptiler-config.json","data/redes-excluidas.json","data/supabase-config.json","data/temperatura.json","data/territorios.json","data/usuarios.json"];

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
  "api/importar-leads.js": function (module, exports, require, process) {
// api/importar-leads.js — Etapa 4 (Prospecção)
// Recebe um lote de leads já raspados (Outscraper, Google Places, Firecrawl/iFood,
// Firecrawl/TripAdvisor — qualquer fonte no mesmo formato normalizado) e grava na área
// de staging (tabela leads_prospeccao). NUNCA cria Company/Deal aqui — isso só acontece
// depois, quando algém confirma manualmente em api/criar-empresa-prospeccao.js.
//
// Dois jeitos de chamar esta rota, os dois seguros (nenhum token de fonte externa
// aparece no navegador):
//   1. Sessão do gestor; o executivo só pode materializar uma sugestão da Casa dos
//      Dados já atribuída ao próprio owner (Authorization: Bearer <token supabase>).
//   2. Um webhook/automação server-to-server (ex.: Make.com) com o header
//      x-import-secret == process.env.IMPORT_SECRET — pensado pra quando o Outscraper
//      (ou um cenário do Make) empurrar dados direto, sem passar pelo navegador de ninguém.
//
// Variáveis de ambiente novas: IMPORT_SECRET (string qualquer, só você e o Make sabem).

const { montarDadosCompletos } = require('../scripts/montar-dados.js');

const FONTES_ROTULO = {
  outscraper: 'Outscraper', google_places: 'Google Places',
  tripadvisor: 'Tripadvisor', ifood: 'iFood', manual: 'Manual',
  // BLOCO 14 (12/08/26): a Casa dos Dados vira fonte de primeira classe. Antes so dava
  // pra importar como "manual", o que apagava a origem e, pior, caia no corte de
  // qualidade padrao -- ver FONTES_SEM_AVALIACAO logo abaixo.
  casa_dos_dados: 'Casa dos Dados'
};

// Fontes cujo lead NAO PODE ter avaliacao, por definicao. Uma empresa que abriu ha dez
// dias nao tem 100 avaliacoes no Google -- nao e lead ruim, e lead novo, e e exatamente
// o que queremos atacar: restaurante recem-aberto ainda nao escolheu sistema. Aplicar o
// corte de volume aqui reprovaria 100% da Casa dos Dados, e foi por isso que nada dela
// chegou na fila de Prospeccao. O corte continua valendo integralmente para Outscraper,
// Google Places, TripAdvisor e iFood, onde a ausencia de avaliacao indica de fato
// estabelecimento fraco ou cadastro sujo.
const FONTES_SEM_AVALIACAO = new Set(['casa_dos_dados']);

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

function normalizarTelefone(tel) {
  if (!tel) return null;
  let digitos = String(tel).replace(/\D/g, '');  // A mesma linha costuma vir como +55 27... no Tripadvisor e 27... no iFood.
  // Normaliza o DDI brasileiro para que fontes diferentes não virem duas contas.
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) digitos = digitos.slice(2);
  return digitos.length >= 8 ? digitos : null;
}

function normalizarTexto(valor) {
  return String(valor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// CORREÇÃO (16/08/26, Julyan): mesma lista/lógica de canonizarCidade() do template —
// duplicada aqui porque este arquivo roda isolado na função serverless (sem import do
// template). Evita que fontes que mandam município em CAIXA ALTA sem acento (Casa dos
// Dados) criem registros com cidade "diferente" de quem já existe na base ("SAO PAULO"
// vs "São Paulo"), o que duplicava cards de praça no Cockpit.
const CIDADES_CANONICAS = {
  'vila velha': 'Vila Velha', 'vitoria': 'Vitória', 'rio de janeiro': 'Rio de Janeiro',
  'sao paulo': 'São Paulo', 'porto alegre': 'Porto Alegre', 'canoas': 'Canoas'
};
function canonizarCidade(cidade) {
  const bruto = String(cidade || '').trim();
  if (!bruto) return bruto;
  const chave = bruto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return CIDADES_CANONICAS[chave] || bruto;
}

// A nota não define fit comercial. O único corte de potencial é volume de avaliações.
// Ainda assim, uma categoria explicitamente fora de foodservice não pode entrar na fila
// só por ter muitas avaliações (ex.: monumento, hostel ou shopping). Fontes verticais
// como iFood/Tripadvisor podem vir sem categoria e continuam válidas.
const CATEGORIAS_FORA_FOODSERVICE = new Set([
  'hostel', 'hotel', 'lodging', 'monument', 'museu', 'park', 'tourist attraction',
  'shopping', 'shopping mall', 'store', 'supermarket', 'grocery store', 'pharmacy',
  'school', 'university', 'hospital', 'gym'
]);
function fazSentidoFoodservice(lead) {
  const categoria = normalizarTexto(lead.categoria);
  const nome = normalizarTexto(lead.nome);
  const nomeEvidenciaFoodservice = /\b(restaurante|restaurant|cafe|cafeteria|bar|pub|bistro|burger|hamburg|pizza|pizzaria|churrasc|lanch|doceria|padaria|confeitaria|cozinha|cantina|choperia|grill|comida|food|sushi|temakeria|sorvet|acai)\b/.test(nome);
  if (nomeEvidenciaFoodservice) return true;
  return !categoria || !CATEGORIAS_FORA_FOODSERVICE.has(categoria);
}

function distanciaKm(a, b) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const rad = x => Number(x) * Math.PI / 180;
  const dLat = rad(Number(b.lat) - Number(a.lat));
  const dLng = rad(Number(b.lng) - Number(a.lng));
  const lat1 = rad(a.lat), lat2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function mesmoRestaurante(a, b) {
  if (a.place_id && b.place_id && String(a.place_id) === String(b.place_id)) return true;
  const telA = normalizarTelefone(a.telefone_normalizado || a.telefone);
  const telB = normalizarTelefone(b.telefone_normalizado || b.telefone);
  if (telA && telB && telA === telB) return true;
  const mesmoNomeCidade = normalizarTexto(a.nome) && normalizarTexto(a.nome) === normalizarTexto(b.nome) &&
    normalizarTexto(a.cidade) === normalizarTexto(b.cidade);
  if (!mesmoNomeCidade) return false;
  const endA = normalizarTexto(a.endereco), endB = normalizarTexto(b.endereco);
  if (endA && endB && endA === endB) return true;
  const bairroA = normalizarTexto(a.bairro), bairroB = normalizarTexto(b.bairro);
  if (bairroA && bairroB && bairroA === bairroB) return true;
  return distanciaKm(a, b) <= 0.15;
}

function juntarFontes(a, b) {
  const fontes = [...String(a || '').split('+'), ...String(b || '').split('+')]
    .map(x => x.trim()).filter(Boolean);
  return [...new Set(fontes)].join(' + ');
}

// Não soma avaliações de plataformas: Outscraper pode representar o mesmo Google
// Places. Mantém o maior volume confiável e a nota ligada a esse volume.
function mesclarRestaurante(base, novo) {
  const novoTemMaisImpacto = (Number(novo.avaliacoes) || 0) > (Number(base.avaliacoes) || 0);
  return {
    fonte: juntarFontes(base.fonte, novo.fonte),
    place_id: base.place_id || novo.place_id || null,
    cnpj: base.cnpj || novo.cnpj || null,
    data_abertura: base.data_abertura || novo.data_abertura || null,
    categoria: base.categoria || novo.categoria || null,
    endereco: base.endereco || novo.endereco || null,
    bairro: base.bairro || novo.bairro || null,
    estado: base.estado || novo.estado || null,
    telefone: base.telefone || novo.telefone || null,
    telefone_normalizado: base.telefone_normalizado || novo.telefone_normalizado || null,
    nota: novoTemMaisImpacto ? novo.nota : base.nota,
    avaliacoes: novoTemMaisImpacto ? novo.avaliacoes : base.avaliacoes,
    lat: base.lat != null ? base.lat : novo.lat,
    lng: base.lng != null ? base.lng : novo.lng,
    presencial: base.presencial !== false || novo.presencial !== false,
    delivery: !!base.delivery || !!novo.delivery,
    horario_funcionamento: base.horario_funcionamento || novo.horario_funcionamento || null,
    ja_existe_hubspot: !!base.ja_existe_hubspot || !!novo.ja_existe_hubspot,
    updated_at: new Date().toISOString()
  };
}

// ---- Roteamento por território (mesma regra do time de campo) ----
// Lead entra no staging JÁ com o executivo certo. Cidade/bairro fora do mapa
// de território fica 'pendente' sem dono — o gestor decide, nada de chute.
// Porto Alegre: rotação Kelly/Ricardo fica pra quando o Ricardo tiver owner ID
// no HubSpot; até lá, POA e Canoas vão pra Kelly.
/* A TABELA DE TERRITORIOS MUDOU DE CASA (01/09/26).
   Ela vivia aqui dentro, e passou a ser lida por tres lugares: esta importacao, a
   redistribuicao dos leads que ja estao na base sem dono, e o backfill semanal (que
   precisa saber quantas contas buscar por executivo). Tres copias da mesma regra e o
   comeco de tres verdades — alguem corrige um bairro num lado, esquece nos outros, e o
   lead cai para quem nao pediu aquele territorio. Uma fonte: lib/territorios.js. */
const { rotearTerritorio, semAcento } = require('../lib/territorios.js');
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-import-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  const supaService = process.env.SUPABASE_SERVICE_KEY;
  const importSecret = process.env.IMPORT_SECRET;
  if (!supaUrl || !supaAnon || !supaService) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY são obrigatórios).' });
  }

  let criadoPor = null;
  let usuarioSessao = null;
  const secretRecebido = req.headers['x-import-secret'];
  if (importSecret && secretRecebido && secretRecebido === importSecret) {
    criadoPor = 'automacao-importacao';
  } else {
    const auth = req.headers.authorization || '';
    const sessionToken = auth.replace(/^Bearer\s+/i, '');
    if (!sessionToken) {
      /* DIAGNÓSTICO DE SEGREDO (28/08/26).
         Contexto: o backfill semanal da Casa dos Dados ficou 12 dias sem importar nada.
         Primeiro porque faltava IMPORT_SECRET no GitHub; depois, com o segredo
         configurado nos DOIS lados e produção redeployada, o endpoint continuou
         recusando — e "recusado" não diz se o servidor não tem a variável, se o valor
         difere, ou se alguém colou um \n junto.

         Este bloco responde essas três perguntas SEM revelar valor nenhum: presença,
         tamanhos, e se bateria depois de um trim. Comparação de tamanho e de
         igualdade-após-trim não permite reconstruir o segredo, e mata em uma tentativa
         o erro mais comum de copiar e colar.

         Só aparece quando o chamador MANDOU um segredo — ou seja, para quem já tem um
         candidato. Requisição sem header nenhum recebe a resposta seca de antes. */
      const diag = secretRecebido ? {
        servidorTemSegredo: !!importSecret,
        tamanhoNoServidor: importSecret ? String(importSecret).length : 0,
        tamanhoRecebido: String(secretRecebido).length,
        bateriaAposTrim: !!importSecret && String(secretRecebido).trim() === String(importSecret).trim(),
        dica: !importSecret
          ? 'A variável IMPORT_SECRET não existe NESTE deployment. Confira o ambiente (Production) e se houve redeploy depois de criá-la.'
          : (String(secretRecebido).trim() === String(importSecret).trim()
            ? 'Os valores batem depois de remover espaços/quebras de linha: um dos dois tem espaço em branco sobrando na ponta.'
            : 'Os valores são diferentes de verdade (não é espaço em branco). Regrave os dois com o mesmo texto.')
      } : undefined;
      return res.status(401).json(Object.assign(
        { erro: 'Sem sessão e sem segredo de importação válido.' },
        diag ? { diagnosticoSegredo: diag } : {}
      ));
    }
    try {
      const check = await fetch(`${supaUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
      });
      if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
      const user = await check.json();
      const email = (user && user.email) ? String(user.email).toLowerCase() : null;
      usuarioSessao = email ? USUARIOS.find(u => String(u.email).toLowerCase() === email) : null;
      const repImportandoCasa = usuarioSessao && usuarioSessao.role === 'rep' && req.body && req.body.fonte === 'casa_dos_dados';
      if (!usuarioSessao || (usuarioSessao.role !== 'manager' && !repImportandoCasa)) {
        return res.status(403).json({ erro: 'Executivos só podem adicionar empresas sugeridas pela Casa dos Dados no próprio território.' });
      }
      criadoPor = usuarioSessao.email;
    } catch (e) {
      return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
    }
  }

  const { fonte, leads } = req.body || {};
  if (!fonte || !['outscraper', 'google_places', 'tripadvisor', 'ifood', 'manual', 'casa_dos_dados'].includes(fonte)) {
    return res.status(400).json({ erro: 'Campo "fonte" inválido — use outscraper, google_places, tripadvisor, ifood, manual ou casa_dos_dados.' });
  }
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ erro: 'Envie "leads" como array com pelo menos 1 item.' });
  }
  if (leads.length > 500) {
    return res.status(400).json({ erro: 'Máximo 500 leads por importação — divida em lotes menores.' });
  }
  // Executivo só materializa a recomendação territorial que a própria Agenda mostrou.
  // Owner ausente ou diferente falha fechado; importações genéricas e redistribuição
  // de carteira continuam exclusivas do gestor.
  if (usuarioSessao && usuarioSessao.role === 'rep') {
    const ownerDaSessao = String(usuarioSessao.ownerId || '');
    const foraDoProprioTerritorio = fonte !== 'casa_dos_dados' || !ownerDaSessao ||
      leads.some(l => String(l.responsavel_owner_id || '') !== ownerDaSessao);
    if (foraDoProprioTerritorio) {
      return res.status(403).json({ erro: 'Você só pode adicionar uma sugestão da Casa dos Dados atribuída ao seu próprio território.' });
    }
  }

  let nomesNoHubspot = new Set();
  try {
    const completo = montarDadosCompletos();
    Object.values(completo.funilLeads || {}).forEach(lista => (lista || []).forEach(l => l.name && nomesNoHubspot.add(l.name.toLowerCase().trim())));
    (completo.temperatura.quentes || []).forEach(l => l.name && nomesNoHubspot.add(l.name.toLowerCase().trim()));
    (completo.temperatura.frios || []).forEach(l => l.name && nomesNoHubspot.add(l.name.toLowerCase().trim()));
  } catch (e) { /* dedup best-effort */ }

  // Régua oficial: somente volume de avaliações. Nota é contexto, nunca corte nem
  // desempate. O mínimo pode ser ajustado por lote, sempre com relatório explícito.
  const semCorteDeAvaliacao = FONTES_SEM_AVALIACAO.has(fonte);
  const qualidade = {
    avaliacoesMin: (req.body.qualidade && req.body.qualidade.avaliacoesMin != null)
      ? Number(req.body.qualidade.avaliacoesMin)
      : (semCorteDeAvaliacao ? 0 : 100)
  };

  const linhasTodas = leads.map(l => {
    const cidade = canonizarCidade(l.cidade || l.city || '');
    const bairro = l.bairro || null;
    const lat = l.lat != null ? l.lat : (l.latitude != null ? l.latitude : null);
    const lng = l.lng != null ? l.lng : (l.longitude != null ? l.longitude : null);
    /* Dono: explícito no lead (l.responsavel_owner_id) vence; senão, roteia por território.
       A COORDENADA VAI JUNTO (01/09/26): sem ela o roteador só consegue decidir pelo nome do
       bairro, e nome não cobre uma cidade de 96 distritos — foi assim que a regra de sobra
       despejou 290 contas numa pessoa em São Paulo. Com lat/lng, bairro que nenhuma lista
       conhece cai no executivo do centro de zona mais próximo, que é geograficamente coerente
       por construção. Ver lib/territorios.js.
       lat/lng são lidos aqui com a MESMA regra usada logo abaixo no objeto da linha: se as
       duas leituras divergirem, o dono passa a ser calculado sobre coordenada diferente da
       que fica gravada, e o km do card deixa de explicar o dono. */
    const dono = l.responsavel_owner_id ? String(l.responsavel_owner_id) : rotearTerritorio(cidade, bairro, lat, lng);
    return {
    place_id: l.place_id || null,
    cnpj: l.cnpj || null,
    data_abertura: l.data_abertura || null,
    fonte: FONTES_ROTULO[fonte],
    nome: String(l.nome || l.name || '').trim(),
    categoria: l.categoria || null,
    endereco: l.endereco || l.address || null,
    bairro,
    cidade,
    estado: l.estado || l.state || null,
    telefone: l.telefone || l.phone_number || null,
    telefone_normalizado: normalizarTelefone(l.telefone || l.phone_number),
    nota: l.nota != null ? l.nota : (l.rating != null ? l.rating : null),
    avaliacoes: l.avaliacoes != null ? l.avaliacoes : (l.rating_count != null ? l.rating_count : null),
    lat: lat,
    lng: lng,
    presencial: l.presencial !== false,
    delivery: !!l.delivery,
    horario_funcionamento: Array.isArray(l.weekday_hours) ? l.weekday_hours.join(' | ') : (l.horario_funcionamento || null),
    ja_existe_hubspot: nomesNoHubspot.has(String(l.nome || l.name || '').toLowerCase().trim()),
    responsavel_owner_id: dono,
    status: dono ? 'atribuido' : 'pendente',
    criado_por: criadoPor
    };
  }).filter(l => l.nome && l.cidade);

  // Atencao ao `== null`: para as fontes normais, avaliacao ausente E reprovacao (o
  // lead veio sem o dado que define o corte). Para a Casa dos Dados a ausencia e o
  // estado esperado, entao so reprova se vier um numero abaixo do minimo.
  const reprovadosQualidade = linhasTodas.filter(l =>
    semCorteDeAvaliacao
      ? (l.avaliacoes != null && Number(l.avaliacoes) < qualidade.avaliacoesMin)
      : (l.avaliacoes == null || Number(l.avaliacoes) < qualidade.avaliacoesMin)
  );
  const reprovadosFit = linhasTodas.filter(l => !fazSentidoFoodservice(l));
  const linhas = linhasTodas.filter(l =>
    !reprovadosQualidade.includes(l) && !reprovadosFit.includes(l)
  );

  if (linhas.length === 0) {
    const soQualidade = linhasTodas.length > 0 && reprovadosQualidade.length === linhasTodas.length;
    return res.status(400).json({
      erro: soQualidade
        ? `Nenhuma conta passou pela régua de impacto (avaliações >= ${qualidade.avaliacoesMin}; a nota não influencia).`
        : 'Nenhum restaurante válido no lote (precisa de nome, cidade, avaliações mínimas e categoria compatível com foodservice).',
      reprovados_qualidade: reprovadosQualidade.length,
      reprovados_fit: reprovadosFit.length
    });
  }

  // Carrega a base canônica para deduplicar também entre fontes diferentes. Falha
  // fechada: se não der para conferir a base, não importa e não arrisca duplicar.
  let existentes = [];
  try {
    // Pagina toda a base: o limite padrão do PostgREST não pode transformar uma
    // conta antiga em "nova" só porque ela ficou fora da primeira página.
    const tamanhoPagina = 1000;
    for (let offset = 0; ; offset += tamanhoPagina) {
      const respExistentes = await fetch(`${supaUrl}/rest/v1/leads_prospeccao?select=id,place_id,fonte,nome,categoria,endereco,bairro,cidade,estado,telefone,telefone_normalizado,nota,avaliacoes,lat,lng,presencial,delivery,horario_funcionamento,ja_existe_hubspot&limit=${tamanhoPagina}&offset=${offset}`, {
        headers: { apikey: supaService, Authorization: `Bearer ${supaService}` }
      });
      if (!respExistentes.ok) throw new Error((await respExistentes.text()).slice(0, 200));
      const pagina = await respExistentes.json();
      existentes.push(...pagina);
      if (pagina.length < tamanhoPagina) break;
    }
  } catch (e) {
    return res.status(502).json({ erro: 'Não foi possível conferir duplicidades antes da importação. Nada foi gravado: ' + String(e.message || e) });
  }

  const novas = [];
  const mesclas = new Map();
  const resultado = {
    inseridos: 0, duplicados: 0, mesclados: 0, erros: [], duplicados_exemplos: [],
    reprovados_qualidade: reprovadosQualidade.length,
    reprovados_fit: reprovadosFit.length,
    regra_qualidade: `avaliações >= ${qualidade.avaliacoesMin}; nota não influencia`,
    reprovados_exemplos: reprovadosQualidade.slice(0, 10).map(l => `${l.nome} (${l.avaliacoes ?? '?'} avaliações)`),
    reprovados_fit_exemplos: reprovadosFit.slice(0, 10).map(l => `${l.nome} (${l.categoria || 'sem categoria'})`)
  };
  linhas.forEach(l => {
    const existente = existentes.find(x => mesmoRestaurante(x, l));
    if (existente) {
      resultado.duplicados++;
      if (resultado.duplicados_exemplos.length < 10) resultado.duplicados_exemplos.push(`${l.nome} (${l.fonte} → ${existente.fonte})`);
      const camposMesclados = mesclarRestaurante(existente, l);
      Object.assign(existente, camposMesclados);
      mesclas.set(existente.id, camposMesclados);
      return;
    }
    const indiceNoLote = novas.findIndex(x => mesmoRestaurante(x, l));
    if (indiceNoLote >= 0) {
      resultado.duplicados++;
      if (resultado.duplicados_exemplos.length < 10) resultado.duplicados_exemplos.push(`${l.nome} (repetido no próprio lote)`);
      // CORREÇÃO (16/08/26): mesclarRestaurante() inclui updated_at, que só faz
      // sentido pro PATCH de um registro que já existe no Supabase (caminho de
      // `mesclas`, logo abaixo). Aqui é fusão de dois itens NOVOS dentro do mesmo
      // lote — se updated_at vazasse pro objeto, esse registro ficava com uma
      // coluna a mais que os outros de `novas`, e o insert em lote no Postgrest
      // recusa tudo com "PGRST102: All object keys must match".
      const mesclado = mesclarRestaurante(novas[indiceNoLote], l);
      delete mesclado.updated_at;
      novas[indiceNoLote] = { ...novas[indiceNoLote], ...mesclado };
      return;
    }
    novas.push(l);
  });

  // Enriquece o registro já existente com a nova fonte e com os melhores dados,
  // preservando owner, status e histórico comercial.
  const pendentesMescla = [...mesclas.entries()];
  for (let i = 0; i < pendentesMescla.length; i += 20) {
    const loteMescla = pendentesMescla.slice(i, i + 20);
    const respostas = await Promise.all(loteMescla.map(([id, campos]) => fetch(`${supaUrl}/rest/v1/leads_prospeccao?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { apikey: supaService, Authorization: `Bearer ${supaService}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(campos)
    })));
    respostas.forEach(resp => { if (resp.ok) resultado.mesclados++; else resultado.erros.push('Falha ao enriquecer um registro existente.'); });
  }

  if (novas.length > 0) {
    try {
      const resp = await fetch(`${supaUrl}/rest/v1/leads_prospeccao`, {
        method: 'POST',
        headers: {
          apikey: supaService, Authorization: `Bearer ${supaService}`,
          'Content-Type': 'application/json', Prefer: 'return=representation'
        },
        body: JSON.stringify(novas)
      });
      if (!resp.ok) {
        const texto = await resp.text();
        return res.status(502).json({ erro: 'Supabase recusou a importação: ' + texto.slice(0, 300), parcial: resultado });
      }
      const linhasInseridas = await resp.json().catch(() => []);
      resultado.inseridos = novas.length;
      // PEDIDO (19/08/26, Julyan: "eu preciso jogar alguns leads no pipe deles") — os
      // IDs recém-criados voltam na resposta, pra quem importa poder na sequência
      // materializar o negócio no HubSpot sem precisar de uma segunda tela/busca.
      resultado.leadsCriados = linhasInseridas.map(l => ({ id: l.id, nome: l.nome, responsavel_owner_id: l.responsavel_owner_id }));
      // Distribuição por executivo — pra conferir o roteamento de território no ato
      resultado.distribuicao = {};
      novas.forEach(l => {
        const chave = l.responsavel_owner_id || 'pendente_sem_dono';
        resultado.distribuicao[chave] = (resultado.distribuicao[chave] || 0) + 1;
      });
    } catch (e) {
      return res.status(500).json({ erro: 'Falha ao gravar no Supabase: ' + String(e.message || e), parcial: resultado });
    }
  }

  return res.status(200).json(resultado);
};


  },
  "scripts/montar-dados.js": function (module, exports, require, process) {
// scripts/montar-dados.js
// FONTE ÚNICA da montagem do objeto DATA do cockpit (Etapa 1b — dados atrás do login).
//
// Antes, o build.js montava o DATA e embutia TUDO dentro do public/index.html — qualquer
// visitante via o CRM inteiro no código-fonte da página, sem logar. Agora a montagem vive
// aqui e é usada por DOIS consumidores:
//   1. scripts/build.js  — gera o HTML público SÓ com o shell (login + placeholders vazios).
//   2. api/dados.js      — serverless da Vercel: valida a sessão e devolve o DATA de verdade,
//                          já filtrado pelo papel de quem pediu (gestor = tudo; executivo =
//                          o próprio funil completo + resumo agregado dos colegas).
//
// Todos os arquivos de dados entram via require() com caminho estático — é o que garante
// que a Vercel empacote os JSONs junto com a função serverless (mesmo padrão que o
// api/atualizar-mrr.js já usa pro usuarios.json).

// Arquivos opcionais — podem não existir num repo recém-clonado ou antes da 1ª execução
// dos workflows. try/catch com require estático mantém o empacotamento da Vercel funcionando.
function requireOpcional(fn) {
  try { return fn(); } catch (e) { return null; }
}

// ══ DE ONDE VEM O SNAPSHOT DO CRM (02/09/26) ═══════════════════════════════════════
// Os seis arquivos que o ROBO produz (hubspot, narrativas, resumo-semanal, weekly-raw,
// sync-status, hubspot-previous) sairam do repositorio: agora eles vivem numa tabela do
// Supabase (public.cockpit_snapshot) e a rota /api/dados os injeta aqui antes de montar.
// Motivo: cada rodada do robo commitava esses arquivos, e todo commit gera um deploy na
// Vercel — com o teto de 100 deploys/dia, a atualizacao ficava limitada a ~15 por dia.
//
// ELES SAO `let` E NAO `const`, e a troca e do PROCESSO INTEIRO, de proposito. O snapshot
// e o mesmo para todo mundo: nao existe versao do CRM por usuario. O que e por usuario e o
// FILTRO, e ele acontece depois, em filtrarParaPapel(dados, usuario), que recebe a pessoa
// por argumento. Guardar o snapshot no modulo e cache; guardar o usuario seria vazamento.
//
// E O REQUIRE CONTINUA AQUI COMO REDE: se a tabela estiver vazia ou o Supabase fora do ar,
// a rota cai no arquivo. Por isso hubspot e narrativas viraram opcionais — antes eram
// require duro, e no dia em que o arquivo deixar de ser commitado o modulo nem carregaria.
let hubspot = requireOpcional(() => require('../data/hubspot.json'));
let narrativas = requireOpcional(() => require('../data/narrativas.json'));
const usuariosRaw = require('../data/usuarios.json');

/* ══ OS GESTORES QUE TAMBÉM VENDEM (24/09/26) ═══════════════════════════════════
   Julyan vende em evento e pelo field sales, e as vendas dele contam no placar do
   time. Ele não é rep — não tem plano de dia, não entra na rodada, não tem meta
   individual — mas o que ele fecha é venda da casa.
   A lista sai do MESMO usuarios.json que define os reps, pela role: quem é manager e
   tem ownerId. Sem ownerId não dá para saber quais negócios são dele, e é por isso
   que a linha do Julyan ganhou o dele hoje. */
const GESTORES_QUE_VENDEM = (function () {
  const lista = Array.isArray(usuariosRaw) ? usuariosRaw : (usuariosRaw.usuarios || []);
  const out = {};
  lista.forEach(function (u) {
    if (!u || u.role !== 'manager') return;
    if (!u.ownerId || String(u.ownerId).startsWith('pendente_')) return;
    out[String(u.ownerId)] = { name: u.nome || 'gestor', ownerId: String(u.ownerId) };
  });
  return out;
}());

// (requireOpcional foi movida para o topo do arquivo em 02/09/26: ela passou a ser usada
// pelos primeiros requires, e declaracao de function sobe por hoisting mas fica confusa
// de ler — ver o bloco no inicio do arquivo.)
const leadsReferencia = requireOpcional(() => require('../data/leads-referencia.json')) || { pracas: [] };
/* QUEM COBRE O QUÊ (09/09/26) — a declaração única de território.
   ANTES DISTO A MESMA REGRA VIVIA EM DOIS LUGARES: a tela do gestor derivava a praça de
   cada executivo dos BAIRROS DOS LEADS DE EXEMPLO em leads-referencia.json, e a busca
   semanal tinha a própria cópia em regex (as metaBairros do backfill). As duas divergiam
   calada, e o preço foi medido em 09/09: quatro dos onze executivos não apareciam em
   praça nenhuma, e por isso não podiam receber carga de prospecção. */
const territorios = requireOpcional(() => require('../data/territorios.json')) || { territorios: [] };
const supabaseConfig = requireOpcional(() => require('../data/supabase-config.json'));
const maptilerConfig = requireOpcional(() => require('../data/maptiler-config.json'));
let resumoSemanal = requireOpcional(() => require('../data/resumo-semanal.json'));
let weeklyRaw = requireOpcional(() => require('../data/weekly-raw.json'));
// AUTOMAÇÃO 3 (13/08/26) — status da última rodada do robô da Daily: falhas de
// sincronização de realizado_visitas/avancos/propostas, se houver. Opcional porque só
// passa a existir depois da PRIMEIRA execução do fetch-hubspot.js com esta automação.
let syncStatus = requireOpcional(() => require('../data/sync-status.json'));
// Grandes redes que a Takeat não atende — usado pela Prospecção para tirar da fila
// recomendada (vai pra "Revisar escopo", não some). Dado editável em data/.
const redesExcluidas = requireOpcional(() => require('../data/redes-excluidas.json'));
let hubspotPrevious = requireOpcional(() => require('../data/hubspot-previous.json'));
// Régua de cadência (data/cadencias.json). É CONFIGURAÇÃO, não código: o template lê
// DATA.cadencias e nunca hardcoda os passos, então ajustar a régua (dias, canais, quais
// cadências existem, motivos válidos de saída) é editar esse JSON e rodar o build.
// Opcional pelo mesmo motivo dos outros: repo recém-clonado pode não ter o arquivo — aí
// o template cai no fallback mínimo e mostra "régua não configurada" em vez de inventar.
const cadencias = requireOpcional(() => require('../data/cadencias.json'));
/* Tabela do variável (data/comissionamento.json). CONFIGURAÇÃO pelo mesmo motivo das
   outras: o valor de cada faixa é decisão do Julyan, não regra de código, e a tela
   NUNCA escreve um número de dinheiro que não tenha saído daqui. Opcional como as
   demais — sem o arquivo, a tela não mostra a caixa da comissão em vez de inventar
   quanto alguém vai receber, que é o pior número errado possível. */
const comissionamento = requireOpcional(() => require('../data/comissionamento.json'));
/* Régua da temperatura (data/temperatura.json). CONFIGURAÇÃO, como cadencias: o robô
   calcula a nota com ela e a tela ESCREVE a fórmula a partir dela. Duas cópias da
   frase (uma no JSON, uma no template) divergiriam no primeiro ajuste de peso. */
const temperaturaRegua = requireOpcional(() => require('../data/temperatura.json'));

const USUARIOS = Array.isArray(usuariosRaw) ? usuariosRaw : (usuariosRaw.usuarios || []);

function fmtDate(iso) {
  const d = new Date(iso);
  // CORREÇÃO (18/08/26, achado na revisão final: "atualizado em 18/08 às 21:46"
  // exibido numa segunda-feira à noite, horário de Brasília) — a HORA já convertia
  // pro fuso certo (timeZone abaixo), mas a DATA não tinha o mesmo timeZone e usava
  // o fuso do SERVIDOR (UTC, no GitHub Actions) — à noite em Brasília (UTC-3), já é
  // "amanhã" em UTC, então a data mostrava 1 dia à frente do que realmente é aqui.
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }) +
    ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

// ============ MONTAGEM DO DATA COMPLETO (idêntica à antiga lógica do build.js) ============

// ══ A ROTA INJETA O SNAPSHOT AQUI ══════════════════════════════════════════════════
// Recebe o que veio da tabela e substitui SO o que veio preenchido. Chave ausente ou
// nula mantem o arquivo — nunca apaga um dado que existe com um vazio que chegou, porque
// tabela sem a linha e "ainda nao publicou", nao "nao ha dado".
//
// Devolve o que foi trocado, e a rota registra isso: sem esse retorno nao daria para
// saber, olhando producao, se a tela esta sendo servida pelo Supabase ou pelo arquivo —
// e essa e a unica pergunta que importa durante a virada.
function usarSnapshot(fontes) {
  const f = fontes || {};
  const trocadas = [];
  const usar = (chave, valor, aplicar) => {
    if (valor == null) return;
    aplicar(valor);
    trocadas.push(chave);
  };
  usar('hubspot', f.hubspot, v => { hubspot = v; });
  usar('narrativas', f.narrativas, v => { narrativas = v; });
  usar('resumo-semanal', f['resumo-semanal'], v => { resumoSemanal = v; });
  usar('weekly-raw', f['weekly-raw'], v => { weeklyRaw = v; });
  usar('sync-status', f['sync-status'], v => { syncStatus = v; });
  usar('hubspot-previous', f['hubspot-previous'], v => { hubspotPrevious = v; });
  return trocadas;
}

// ══ CADA LEAD DIZ EM QUE ETAPA ESTA (04/09/26) ═════════════════════════════════════
// Os objetos de funilLeads[etapa] vinham do robo SEM stageId: a etapa existia so como
// chave do mapa. Medido na ficha do negocio — ela faz ORDEM_FUNIL_FICHA.indexOf(l.stageId)
// e com -1 NAO DESENHA A TRILHA: os oito segmentos de mudar etapa nao existiam para
// negocio nenhum vindo da carga (0 segmentos medidos num lead do robo, 8 no criado na
// sessao, que nasce com stageId). O chip do topo tambem saia sem o nome da etapa.
//
// AQUI E NAO NO ROBO porque esta funcao e a porta unica — producao, preview e as suites
// passam por ela, e o snapshot do Supabase e injetado antes dela rodar. Corrigir no robo
// valeria so na proxima rodada e deixaria todo snapshot ja gravado sem o campo.
//
// `||` e nao sobrescrita: se o lead ja trouxer a etapa, a dele manda. A chave do mapa e o
// fallback, nao a autoridade.
function comEtapaNoLead(porEtapa) {
  const saida = {};
  Object.entries(porEtapa || {}).forEach(([etapa, leads]) => {
    saida[etapa] = (Array.isArray(leads) ? leads : []).map(l => (l && typeof l === 'object')
      ? Object.assign({}, l, {
          stageId: l.stageId || etapa,
          stage: l.stage || ((hubspot.stageMeta && hubspot.stageMeta.labels) ? (hubspot.stageMeta.labels[etapa] || '') : '')
        })
      : l);
  });
  return saida;
}

// O snapshot do CRM e obrigatorio para montar qualquer coisa. Sem ele — nem na tabela nem
// no arquivo — a resposta certa e um erro claro, nunca uma tela com zeros: zero negocio
// aberto e uma afirmacao sobre o funil, e nao ha funil nenhum para afirmar.
/* NARRATIVAS TAMBEM E OBRIGATORIO (03/09/26), e isto nao era verdade antes de hoje.
   Ele deixou de ser versionado (o robo commitava e cada commit gerava um deploy), entao
   nao esta mais no pacote do deploy: a UNICA fonte dele passou a ser a tabela. E ele nao
   e complemento — montarDadosCompletos() abre com Object.keys(narrativas.reps), ou seja
   ELE E O QUADRO DE EXECUTIVOS. Sem ele nao ha uma pessoa na tela.

   Antes desta linha, uma leitura de tabela que falhasse (6s de timeout em api/dados.js)
   derrubava a rota com TypeError em campo nulo — 500 e stack trace. Agora cai no mesmo
   503 com motivo que o hubspot ausente ja produzia, que e a resposta certa: a tela diz
   que nao tem dado, em vez de mentir ou explodir. Ver o bloco do .gitignore. */
function temSnapshot() { return !!(hubspot && hubspot.kpis && narrativas && narrativas.reps); }
/* QUAL das duas faltou. Vive aqui porque hubspot e narrativas sao locais deste modulo;
   a rota nao os ve. Uma funcao so, usada num lugar so, para o 503 mandar procurar no
   lugar certo: as duas chegam pelo mesmo caminho e quebram por motivos diferentes. */
function faltandoNoSnapshot() {
  const f = [];
  if (!(hubspot && hubspot.kpis)) f.push('o funil do CRM');
  if (!(narrativas && narrativas.reps)) f.push('o quadro de executivos (narrativas)');
  return f;
}

function montarDadosCompletos() {
  // Ordem de exibição = ordem em que aparecem no narrativas.json
  const ownerIds = Object.keys(narrativas.reps);

  const reps = ownerIds.map(ownerId => {
    const n = narrativas.reps[ownerId];
    const h = hubspot.reps[ownerId] || { open: 0, stages: {}, criticos: [], travados: [], leadsTravados: 0, ganhosSemana: 0, ganhosSemanaNomes: [], fechadosNoMes: 0, metaMensal: 10, metaMrr: null, metaReceita: null, patamarMeta: null, visitasHubspotHoje: 0, avancosHubspotHoje: 0, propostasHubspotHoje: 0, fechamentosHubspotHoje: 0 };

    return {
      ownerId,
      name: n.name,
      praca: n.praca,
      tag: n.tag,
      tagLabel: n.tagLabel,
      gargalo: n.gargalo,
      boasPraticas: n.boasPraticas,
      compromissos: n.compromissos,
      /* O PRAZO DE CADA COMPROMISSO, mesmo índice de `compromissos` (19/09/26). Sem ele a
         aba Pessoas não consegue dizer o que VENCEU, que é a manchete do gestor na
         segunda. Array irmão em vez de objeto porque cinco leitores indexam o texto e o
         checked[] de pdi_compromissos guarda a POSIÇÃO. */
      compromissosPrazo: Array.isArray(n.compromissosPrazo) ? n.compromissosPrazo : [],
      open: h.open,
      stages: h.stages,
      criticos: h.criticos,
      travados: h.travados || [],
      /* TODOS os abertos, enxutos — o mapa de cadência precisa da régua de cada um, e os
         recortes (criticos/travados/plotaveis) cobriam 124 dos 204 negócios do time.
         ESTE OBJETO É UM FILTRO: campo que não está nesta lista não chega à tela, e foi
         assim que metaMrr e metaReceita morreram em silêncio em 10/09. */
      abertos: Array.isArray(h.abertos) ? h.abertos : [],
      quentes: h.quentes || [],
      leadsTravados: h.leadsTravados || 0,
      ganhosSemana: h.ganhosSemana || 0,
      ganhosSemanaNomes: h.ganhosSemanaNomes || [],
      fechadosNoMes: h.fechadosNoMes || 0,
      /* ══ AS TRES METAS PASSAM, E ZERO E ZERO (10/09/26) ══════════════════════════
         Duas coisas estavam erradas nesta linha, e as duas apareceram medindo a tela
         depois da rodada do robo:

         1. ESTE OBJETO E UM FILTRO. `metaMrr` e `metaReceita` chegavam do robo e
            morriam aqui, porque nao estavam na lista — a tela recebia undefined nas
            duas metas novas.
         2. `|| 10` TRANSFORMA ZERO EM DEZ. A Amanda saiu da planilha e tem meta 0; a
            tela mostrava 10 para ela, que e exatamente o numero que este trabalho veio
            tirar. Zero e falsy, e `|| ` nao distingue "nao tem meta" de "meta zero". */
      metaMensal: h.metaMensal != null ? h.metaMensal : 10,
      metaMrr: h.metaMrr != null ? h.metaMrr : null,
      metaReceita: h.metaReceita != null ? h.metaReceita : null,
      patamarMeta: h.patamarMeta || null,
      visitasHubspotHoje: h.visitasHubspotHoje || 0,
      // BLOCO 15: nomes de quem avancou de etapa e de quem recebeu proposta hoje, pra
      // Daily & Ritmo. Vem do fetch-hubspot; enquanto o cron nao roda, chega vazio e a
      // tela mostra so a contagem, avisando que os nomes vem na proxima rodada.
      avancosHojeNomes: Array.isArray(h.avancosHojeNomes) ? h.avancosHojeNomes : [],
      propostasHojeNomes: Array.isArray(h.propostasHojeNomes) ? h.propostasHojeNomes : [],
      avancosHubspotHoje: h.avancosHubspotHoje || 0,
      propostasHubspotHoje: h.propostasHubspotHoje || 0,
      fechamentosHubspotHoje: h.fechamentosHubspotHoje || 0
    };
  });

  // ---- Semáforo de saúde geral do funil ----
  const totalAberto = hubspot.kpis.emAberto || 0;
  const totalTravados = hubspot.kpis.leadsTravados || 0;
  const pctTravados = totalAberto > 0 ? (totalTravados / totalAberto) * 100 : 0;
  let saude;
  if (pctTravados < 15) {
    saude = { nivel: 'ok', label: 'Funil saudável', detalhe: `${Math.round(pctTravados)}% dos leads abertos com SLA estourado` };
  } else if (pctTravados < 35) {
    saude = { nivel: 'warn', label: 'Atenção', detalhe: `${Math.round(pctTravados)}% dos leads abertos com SLA estourado` };
  } else {
    saude = { nivel: 'crit', label: 'Funil travado', detalhe: `${Math.round(pctTravados)}% dos leads abertos com SLA estourado` };
  }

  // ---- Deltas vs. última atualização ----
  function delta(atual, anterior) {
    if (anterior === undefined || anterior === null) return null;
    const diff = atual - anterior;
    if (diff === 0) return { sinal: 'flat', valor: 0 };
    return { sinal: diff > 0 ? 'up' : 'down', valor: Math.abs(diff) };
  }
  const kpiDeltas = hubspotPrevious ? {
    leadsCriados: delta(hubspot.kpis.leadsCriados, hubspotPrevious.kpis.leadsCriados),
    ganhos: delta(hubspot.kpis.ganhos, hubspotPrevious.kpis.ganhos),
    perdidos: delta(hubspot.kpis.perdidos, hubspotPrevious.kpis.perdidos),
    emAberto: delta(hubspot.kpis.emAberto, hubspotPrevious.kpis.emAberto),
    emReciclagem: delta(hubspot.kpis.emReciclagem, hubspotPrevious.kpis.emReciclagem),
    fechadosNoMes: delta(hubspot.kpis.fechadosNoMes, hubspotPrevious.kpis.fechadosNoMes),
    taxaAvanco: delta(hubspot.kpis.taxaAvanco, hubspotPrevious.kpis.taxaAvanco)
  } : null;

  // ---- Ranking de vendas da semana ----
  const ganhosDetalheFresco = (weeklyRaw && weeklyRaw.ganhosSemanaDetalhe) || (resumoSemanal && resumoSemanal.ganhosSemanaDetalhe) || [];
  let rankingSemanal = [];
  if (ganhosDetalheFresco.length > 0) {
    const porOwner = {};
    ganhosDetalheFresco.forEach(d => {
      if (!d.ownerId) return;
      if (!porOwner[d.ownerId]) porOwner[d.ownerId] = { count: 0, mrrTotal: 0, clientes: [] };
      porOwner[d.ownerId].count += 1;
      porOwner[d.ownerId].mrrTotal += d.mrr || 0;
      porOwner[d.ownerId].clientes.push({ nome: d.nome, mrr: d.mrr || 0 });
    });
    rankingSemanal = Object.entries(porOwner)
      .map(([ownerId, v]) => ({
        ownerId,
        name: (narrativas.reps[ownerId] || {}).name || ownerId,
        count: v.count,
        mrrTotal: v.mrrTotal,
        clientes: v.clientes
      }))
      .sort((a, b) => (b.count - a.count) || (b.mrrTotal - a.mrrTotal))
      .slice(0, 3);
  }

  // ---- Vendas do mês: as TRÊS medidas por executivo (10/09/26) ------------------
  //  Antes daqui saíam clientes e MRR. A receita (o valor TOTAL do plano negociado,
  //  `amount`) não vinha, e por isso duas das três metas do Julyan não tinham
  //  realizado nenhum na tela.
  //
  //  E O MÊS DE CADA VENDA PASSA A SER O DE COMPETÊNCIA, não o do closedate. Julyan,
  //  10/09: "uma venda do marco foi no mes passado, é q o boleto compensou na virada
  //  pro dia 1". O CRM não sabe disso — o único campo de data do ganho é o closedate.
  //  Quem sabe é ele, e a decisão está registrada em data/metas.json, negócio por
  //  negócio, com motivo. Aqui a venda ajustada SAI do mês e o ajuste viaja no payload
  //  para a tela poder dizer que houve — divergir do CRM em silêncio seria pior que o
  //  número errado.
  let vendasMes = null;
  if (Array.isArray(hubspot.vendasMes)) {
    const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const agoraBr = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const mesCorrente = agoraBr.toISOString().slice(0, 7);
    const porOwnerMes = {};
    const ajustadas = [];
    /* AS VENDAS DO GESTOR FICAM À PARTE, e não em porOwnerMes: aquela lista é o pódio
       e a régua por pessoa, e é ela que alimenta a rodada, a Daily e a meta individual.
       O gestor não tem plano de dia nem lugar na fila — o que ele tem é venda. */
    const doGestor = { count: 0, mrrTotal: 0, receitaTotal: 0, clientes: [], name: null, ownerId: null };
    /* E O QUE NÃO É DE NINGUÉM DO TIME CONTINUA FORA, mas agora CONTADO: antes ele
       sumia sem deixar rastro, e foi assim que quatro vendas do gestor ficaram um mês
       inteiro fora do placar sem ninguém ver. */
    const foraDoTime = [];
    hubspot.vendasMes.forEach(d => {
      /* SER REP GANHA DE SER GESTOR (24/09/26). O mesmo ownerId pode estar nas duas
         listas — é o caso do login de executivo que o Julyan usa para testar o funil.
         Quando isso acontece, a venda conta como venda de rep: quem tem tela de pessoa
         precisa ver a própria venda nela. O balde `doGestor` é de quem é SÓ gestor.
         Sem esta ordem, a aba do executivo mostrava 0 clientes fechados no mês com
         quatro vendas fechadas no CRM. */
      const ehRep = !!(d.ownerId && narrativas.reps[d.ownerId]);
      const ehGestor = !ehRep && !!(d.ownerId && GESTORES_QUE_VENDEM[d.ownerId]);
      if (!d.ownerId || (!ehRep && !ehGestor)) {
        foraDoTime.push({ id: d.id || null, nome: d.nome, ownerId: d.ownerId || null,
          mrr: d.mrr || 0, receita: d.receita || 0, closedate: d.closedate || null });
        return;
      }
      // A venda cujo mês de competência não é o corrente sai da conta do mês, e fica
      // registrada para a tela mostrar.
      const mes = d.mesDeCompetencia || mesCorrente;
      if (mes !== mesCorrente) {
        /* O NOME SAI DA FONTE CERTA para cada um: a do rep vem de narrativas, a do
           gestor de usuarios.json. Ler narrativas.reps[ownerId].name para o gestor
           estouraria aqui — ele não está lá, e é justamente por isso que este patch
           existe. */
        const quem = narrativas.reps[d.ownerId] || GESTORES_QUE_VENDEM[d.ownerId];
        ajustadas.push({ id: d.id || null, nome: d.nome, ownerId: d.ownerId,
          name: (quem && quem.name) || 'sem nome', mrr: d.mrr || 0, receita: d.receita || 0,
          closedate: d.closedate || null, contaEm: mes, motivo: d.ajustado || null });
        return;
      }
      if (ehGestor) {
        doGestor.count += 1;
        doGestor.mrrTotal += d.mrr || 0;
        doGestor.receitaTotal += d.receita || 0;
        doGestor.name = GESTORES_QUE_VENDEM[d.ownerId].name;
        doGestor.ownerId = d.ownerId;
        doGestor.clientes.push({ id: d.id || null, nome: d.nome, mrr: d.mrr || 0,
          receita: d.receita || 0, closedate: d.closedate || null });
        return;
      }
      if (!porOwnerMes[d.ownerId]) porOwnerMes[d.ownerId] = { count: 0, mrrTotal: 0, receitaTotal: 0, clientes: [] };
      porOwnerMes[d.ownerId].count += 1;
      porOwnerMes[d.ownerId].mrrTotal += d.mrr || 0;
      porOwnerMes[d.ownerId].receitaTotal += d.receita || 0;
      porOwnerMes[d.ownerId].clientes.push({ id: d.id || null, nome: d.nome, mrr: d.mrr || 0,
        receita: d.receita || 0, closedate: d.closedate || null });
    });
    const porRepMes = Object.entries(porOwnerMes).map(([ownerId, v]) => ({
      ownerId,
      name: narrativas.reps[ownerId].name,
      praca: narrativas.reps[ownerId].praca || '—',
      count: v.count,
      mrrTotal: v.mrrTotal,
      receitaTotal: v.receitaTotal,
      clientes: v.clientes.sort((a, b) => (b.mrr || 0) - (a.mrr || 0))
    })).sort((a, b) => (b.count - a.count) || (b.mrrTotal - a.mrrTotal));

    vendasMes = {
      mesLabel: `${MESES_PT[agoraBr.getUTCMonth()]}/${agoraBr.getUTCFullYear()}`,
      mes: mesCorrente,
      /* ══ OS TOTAIS SOMAM O TIME MAIS O GESTOR (24/09/26) ═══════════════════════
         Venda do gestor é venda da casa e conta no placar. O `porRep` abaixo NÃO a
         inclui de propósito — ele é o pódio e a régua por pessoa. Quem quiser saber a
         diferença entre os dois lê `gestor`, que viaja ao lado com nome e clientes. */
      totalClientes: porRepMes.reduce((s, r) => s + r.count, 0) + doGestor.count,
      totalMrr: porRepMes.reduce((s, r) => s + r.mrrTotal, 0) + doGestor.mrrTotal,
      totalReceita: porRepMes.reduce((s, r) => s + r.receitaTotal, 0) + doGestor.receitaTotal,
      porRep: porRepMes,
      /* A PARTE DO GESTOR, nomeada. `null` quando ele não vendeu no mês — e null é
         diferente de zero: zero seria uma linha na tela dizendo que ele não vendeu. */
      gestor: doGestor.count ? {
        ownerId: doGestor.ownerId, name: doGestor.name, count: doGestor.count,
        mrrTotal: doGestor.mrrTotal, receitaTotal: doGestor.receitaTotal,
        clientes: doGestor.clientes.sort((a, b) => (b.mrr || 0) - (a.mrr || 0))
      } : null,
      /* E O QUE FICOU FORA DO TIME, CONTADO em vez de sumido em silêncio. */
      foraDoTime: foraDoTime,
      // as vendas que saíram do mês por competência, com o motivo de cada uma
      ajustadas: ajustadas
    };
  }

  // ---- Quentes/frios com a praça anexada ----
  function comPraca(lista) {
    return (lista || []).map(l => ({ ...l, praca: (narrativas.reps[l.ownerId] || {}).praca || '—' }));
  }
  const temperaturaComPraca = {
    quentes: comPraca((hubspot.temperatura || {}).quentes),
    frios: comPraca((hubspot.temperatura || {}).frios)
  };

  return {
    /* AS OPÇÕES DAS PROPRIEDADES DE ENUMERAÇÃO, como o HubSpot as nomeia. A tela usa
       para MOSTRAR; o valor gravado continua vindo das listas do template. Sem isto a
       tela imprimia o valor cru e oito opções divergiam do CRM. */
    opcoesHubspot: hubspot.opcoesDeNegocio || null,
    hubspotUpdatedAtFmt: fmtDate(hubspot.updatedAt),
    // ITEM 4 (10/08/26): o timestamp CRU vai junto do formatado. A tela precisa dele
    // pra calcular a idade do dado e avisar em vermelho quando o robô das 5h falhou —
    // apresentar número velho na Daily sem saber que é velho era o risco real.
    hubspotUpdatedAtISO: hubspot.updatedAt || null,
    versaoAnalise: narrativas._atualizado_em || 'v1',
    kpisHub: hubspot.kpis,
    kpiDetalhe: {
      leadsCriados: (hubspot.kpiDetalhe?.leadsCriados || []).map(d => ({ ...d, vendedor: (narrativas.reps[d.ownerId] || {}).name || '—' })),
      perdidos: (hubspot.kpiDetalhe?.perdidos || []).map(d => ({ ...d, vendedor: (narrativas.reps[d.ownerId] || {}).name || '—' }))
    },
    kpiDeltas,
    /* POR QUE PERDEMOS (30/08/26): motivo de perda dos ultimos 90 dias, por motivo e por
       executivo. Vem do HubSpot em motivo_do_perdido, que o time preenche.

       DESDE 19/09 ELE CARREGA emLotePorMotivo: quanto de cada motivo foi marcado numa
       sentada. O objeto vai INTEIRO para o gestor, então os campos novos viajam
       sozinhos — não há lista de campos aqui que precise ser atualizada. */
    motivosPerda: hubspot.motivosPerda || null,
    /* Conversão por turma, velocidade de etapa e ciclo — o gestor recebe inteiro. */
    historicoEtapas: hubspot.historicoEtapas || null,
    funil: hubspot.funil,
    /* SEM ISTO A TRILHA DE ETAPAS DA FICHA NAO DESENHA — ver comEtapaNoLead. */
    funilLeads: comEtapaNoLead(hubspot.funilLeads),
    /* o numero de quem saiu do time viaja DENTRO de kpisHub, que a tela ja recebe
       inteiro — passar de novo no topo era um caminho que a lista branca do recorte por
       papel descartava em silencio. */
    /* O CORTE DA COLUNA PERDIDO desce para os dois papeis. Sem ele a tela nao tem como
       dizer 'nada saiu da carteira desde 01/09' e a coluna vazia leria como 'nunca perdi
       nada' — mentira por omissao, com 1.811 perdas no CRM. */
    perdidoVisivel: hubspot.perdidoVisivel || null,
    onboardingVisivel: hubspot.onboardingVisivel || null,
    leadsReciclagem60: hubspot.leadsReciclagem60 || [],
    vendasMes,
    temperatura: temperaturaComPraca,
    stageMeta: hubspot.stageMeta || { slaDays: {}, descriptions: {}, labels: {} },
    saude,
    reps,
    /* AGREGADO ANÔNIMO: só percentuais e a contagem de quantas pessoas entraram na
       conta. Nenhum nome, nenhum ownerId de colega, nenhuma lista. */
    habitosTime: habitosDoTime(hubspot.reps || {}, ownerIds),
    leadsReferencia: leadsReferencia.pracas || [],
    /* O MAPA INTEIRO É DO GESTOR: é com ele que a aba Rotas sabe de quem é cada praça,
       quem está sem rota declarada e o que ficou sem dono. O recorte do executivo está
       mais abaixo — ele recebe só a rota dele. */
    territorios: territorios.territorios || [],
    territoriosSemDono: territorios._sem_dono || [],
    footerText: `Fonte: HubSpot (pipeline 916011864, atualizado a cada 2h no horário comercial) + Daily (prometido/realizado) · Leads críticos = mais antigos sem avanço de etapa.`,
    // AUTOMAÇÃO 3 (13/08/26) — status da última rodada do robô: se alguma escrita de
    // realizado_visitas/avancos/propostas falhou ou não bateu na conferência pós-escrita.
    // Opcional: undefined até a primeira rodada rodar com esta automação.
    syncStatus: syncStatus || null,
    resumoSemanal: (resumoSemanal || weeklyRaw) ? {
      geradoEmFmt: resumoSemanal ? fmtDate(resumoSemanal.geradoEm) : null,
      numerosAtualizadosEmFmt: weeklyRaw ? fmtDate(weeklyRaw.geradoEm) : (resumoSemanal ? fmtDate(resumoSemanal.geradoEm) : null),
      janela: (weeklyRaw && weeklyRaw.janela) || (resumoSemanal && resumoSemanal.janela),
      /* A JANELA QUE O TEXTO DA IA DESCREVE (19/09/26), que NÃO é a de cima.
         `janela` acima vem do weekly-raw, regravado a cada daily-refresh; `porRep` e
         `comoAgir` logo abaixo vêm do resumo-semanal, escrito só no cron de domingo
         22h. A janela do weekly-raw vira na sexta 23:59 e a do resumo só no domingo:
         nesse fim de semana o placar é de uma semana e o board é da anterior. Sem
         este campo a tela não tem como saber disso, e foi assim que "2 ganhos" e
         "R$ 857 de MRR" de semanas diferentes ficaram lado a lado em 16/09. */
      janelaDaLeitura: (resumoSemanal && resumoSemanal.janela && resumoSemanal.janela.atual) || null,
      kpisComparativo: (weeklyRaw && weeklyRaw.kpisComparativo) || (resumoSemanal && resumoSemanal.kpisComparativo),
      resumoGeral: resumoSemanal ? resumoSemanal.resumoGeral : null,
      comoAgir: resumoSemanal ? resumoSemanal.comoAgir : [],
      // BLOCO 41 — faísca de 5 semanas (fechamentos/reuniões/criados) pros KPIs de time
      // da aba Semana do gestor. Só existe a partir desta build; resumo-semanal.json de
      // builds antigas não tem o campo, daí o fallback pra null (a tela desenha 1 barra só).
      serieSemanal: resumoSemanal ? (resumoSemanal.serieSemanal || null) : null,
      porRep: resumoSemanal ? (resumoSemanal.porRep || {}) : {},
      /* A aba Semana mostra um selo discreto quando a rodada da IA falhou em parte.
         Sem repassar aqui, aquele selo seria codigo morto por construcao — o campo
         existe no snapshot e nao existia nesta projecao. */
      _falhasIA: resumoSemanal ? (resumoSemanal._falhasIA || null) : null,
      ganhosSemanaDetalhe: ganhosDetalheFresco,
      reunioesSemanaDetalhe: (weeklyRaw && weeklyRaw.reunioesSemanaDetalhe) || (resumoSemanal && resumoSemanal.reunioesSemanaDetalhe) || [],
      // BLOCO 41 — "criados" por pessoa na semana (board da Semana do gestor).
      leadsCriadosSemanaDetalhe: (weeklyRaw && weeklyRaw.leadsCriadosSemanaDetalhe) || (resumoSemanal && resumoSemanal.leadsCriadosSemanaDetalhe) || [],
      quentesDemoOuNegociacao: (weeklyRaw && weeklyRaw.quentesDemoOuNegociacao) || (resumoSemanal && resumoSemanal.quentesDemoOuNegociacao) || [],
      // snapshotReps alimenta o card "Onde atacar esta semana" (visão por praça).
      // Ele só existe no weekly-raw.json — o resumo-semanal.json (texto da IA) não tem.
      // Sem esta linha o card lia undefined e sumia da tela em silêncio, sem erro.
      snapshotReps: (weeklyRaw && weeklyRaw.snapshotReps) || {},
      ranking: rankingSemanal
    } : null,
    agenda: hubspot.agenda || null,
    redesExcluidas: (redesExcluidas && Array.isArray(redesExcluidas.redes)) ? redesExcluidas.redes : [],
    // Configuração da régua de cadência — igual pros dois papéis (é política do canal,
    // não dado de cliente), por isso passa intacta pelo filtrarParaPapel.
    cadencias: cadencias || null,
    /* A TABELA DO VARIÁVEL — igual para os dois papéis, como cadencias: é política de
       remuneração, não dado de cliente. O que o filtro por papel corta é a LISTA de
       vendas por pessoa (vendasMes), e é dela que sai quantos clientes cada um tem —
       então o executivo calcula a comissão dele e não vê a do colega. */
    comissionamento: comissionamento || null,
    /* CADÊNCIA DIÁRIA (08/09/26): atividade por executivo por dia útil, do robô.
       DADO, não configuração — o filtro por papel abaixo corta para o executivo. */
    cadenciaDiaria: hubspot.cadenciaDiaria || null,
    /* A RÉGUA DA TEMPERATURA vai inteira para os dois papéis: é política de
       priorização, e a tela precisa dela para escrever de onde a nota vem. */
    temperaturaRegua: temperaturaRegua || null,
    usuarios: USUARIOS
  };
}

// ============ FILTRO POR PAPEL (o que cada login pode receber do servidor) ============
//
// Gestor: DATA completo.
// Executivo: o PRÓPRIO objeto rep completo (tudo que já via no Meu Painel) + dos colegas
// apenas o resumo agregado que o Pódio/ranking precisa — SEM clientes, funil, notas,
// gargalo ou coaching dos outros. Corte aprovado pelo Julyan em 07/08/26.

// Campos de colega visíveis pra qualquer executivo (necessários pro Pódio/seletores):
/* ══ HÁBITOS DO TIME — NÚMERO AGREGADO, SEM NOME ════════════════════════════════════
   Ver o cabeçalho de scripts/montar-dados.js? Não: a razão inteira está no commit e no
   comentário da aba. Aqui fica a mecânica.
   Três percentuais por pessoa, e o percentil 80 do time como referência. Quem não tem
   negócio aberto fica FORA da conta (n/0 não é 0%, é "não medido" — e um zero desses
   puxaria o benchmark do time inteiro para baixo). */
function pctSeguro(parte, total) {
  if (!total || total <= 0) return null;
  return Math.round((parte / total) * 100);
}

function habitosDoRep(h) {
  const abertos = Number(h && h.open) || 0;
  if (!abertos) return { cadencia: null, qualificacao: null, proximoPasso: null, abertos: 0 };
  const travados = Number(h && h.leadsTravados) || 0;
  /* a lista completa de abertos por rep não vem no snapshot; o que vem por rep são os
     recortes (travados, criticos, quentes). Para os dois hábitos de registro, a base é
     a união desses recortes — é a amostra que existe, e ela é a mesma para todo mundo. */
  const amostra = [];
  ['travados', 'criticos', 'quentes'].forEach(k => {
    (h && Array.isArray(h[k]) ? h[k] : []).forEach(l => {
      if (l && l.id && !amostra.some(x => x.id === l.id)) amostra.push(l);
    });
  });
  const comQualif = amostra.filter(l => String(l.nome_do_sistema || '').trim() && String(l.gargalo_operacional || '').trim()).length;
  const comPasso = amostra.filter(l => String(l.proximaAtividade || l.proximaReuniao || '').trim()).length;
  return {
    cadencia: pctSeguro(abertos - travados, abertos),
    qualificacao: pctSeguro(comQualif, amostra.length),
    proximoPasso: pctSeguro(comPasso, amostra.length),
    abertos
  };
}

function percentil80(valores) {
  const v = (valores || []).filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  /* percentil 80 pelo método do índice mais próximo: com 6 pessoas cai no 2º melhor. */
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil(0.8 * v.length) - 1));
  return v[i];
}

function habitosDoTime(hubspotReps, ownerIds) {
  const porRep = {};
  (ownerIds || []).forEach(id => { porRep[id] = habitosDoRep((hubspotReps || {})[id]); });
  const medidos = Object.values(porRep).filter(x => x && x.abertos > 0);
  const benchmark = {
    cadencia: percentil80(medidos.map(x => x.cadencia)),
    qualificacao: percentil80(medidos.map(x => x.qualificacao)),
    proximoPasso: percentil80(medidos.map(x => x.proximoPasso))
  };
  return { porRep, benchmark, pessoasMedidas: medidos.length };
}

function resumoDeColega(r) {
  return {
    ownerId: r.ownerId,
    name: r.name,
    praca: r.praca,
    fechadosNoMes: r.fechadosNoMes,
    metaMensal: r.metaMensal,
    metaMrr: r.metaMrr,
    metaReceita: r.metaReceita,
    patamarMeta: r.patamarMeta,
    ganhosSemana: r.ganhosSemana,
    // Estruturas vazias mas bem-tipadas: o template varre .criticos/.travados/.stages de
    // todos os reps em alguns pontos — vazio renderiza estado vazio, undefined quebraria.
    open: 0, stages: {}, criticos: [], travados: [], quentes: [], leadsTravados: 0,
    ganhosSemanaNomes: [], gargalo: null, boasPraticas: [], compromissos: [],
    tag: null, tagLabel: null,
    visitasHubspotHoje: 0, avancosHubspotHoje: 0, propostasHubspotHoje: 0, fechamentosHubspotHoje: 0
  };
}

function filtrarParaPapel(dados, usuario) {
  if (!usuario || usuario.role === 'manager') return dados;

  const meuId = String(usuario.ownerId);
  const soMeu = lista => (lista || []).filter(x => String(x.ownerId) === meuId);
  const meuNome = usuario.nome;

  const meuRep = dados.reps.find(r => String(r.ownerId) === meuId) || null;
  // Preserva a ORDEM original dos reps (o Pódio e os seletores dependem dela).
  const reps = dados.reps.map(r => (String(r.ownerId) === meuId ? r : resumoDeColega(r)));

  const vendasMes = dados.vendasMes ? {
    ...dados.vendasMes,
    porRep: dados.vendasMes.porRep.map(r =>
      String(r.ownerId) === meuId ? r : { ...r, clientes: [] } // agregado dos colegas sem nomes de cliente
    )
  } : null;

  const rs = dados.resumoSemanal;
  const resumoSemanalFiltrado = rs ? {
    ...rs,
    porRep: meuId in (rs.porRep || {}) ? { [meuId]: rs.porRep[meuId] } : {},
    ganhosSemanaDetalhe: soMeu(rs.ganhosSemanaDetalhe),
    reunioesSemanaDetalhe: soMeu(rs.reunioesSemanaDetalhe),
    // BLOCO 41 — mesmo corte de privacidade dos outros dois: o executivo só vê os
    // negócios criados que são dele, nunca os dos colegas.
    leadsCriadosSemanaDetalhe: soMeu(rs.leadsCriadosSemanaDetalhe),
    quentesDemoOuNegociacao: soMeu(rs.quentesDemoOuNegociacao),
    ranking: (rs.ranking || []).map(r =>
      String(r.ownerId) === meuId ? r : { ...r, clientes: [] }
    ),
    // PRIVACIDADE: snapshotReps traz funil, travados, quentes e meta de TODO o time.
    // O spread acima o deixaria passar inteiro pro executivo — vazamento silencioso,
    // do mesmo tipo que o corte de 07/08 fechou para clientes/funil/notas. O executivo
    // recebe só o próprio; a visão por praça é do gestor.
    snapshotReps: (rs.snapshotReps && rs.snapshotReps[meuId])
      ? { [meuId]: rs.snapshotReps[meuId] } : {}
  } : null;

  const funilLeads = {};
  Object.entries(dados.funilLeads || {}).forEach(([stage, leads]) => {
    funilLeads[stage] = soMeu(leads);
  });
  /* O corte de Perdido nao tem nome de ninguem: e a data em que o Cockpit passou a
     registrar perda. Vai inteiro para o executivo. */
  const perdidoVisivel = dados.perdidoVisivel || null;
  const onboardingVisivel = dados.onboardingVisivel || null;

  // BLOCO 4 (11/08/26) — corte por papel na agenda.
  // Nota do Expogo e tarefa criada por automação chegam do HubSpot SEM
  // hubspot_owner_id; quem diz de quem é o compromisso é o dono do NEGÓCIO associado
  // (lead_owner_id). O cliente já sabia disso — agendaNormalizar resolve por
  // lead_owner_id justamente porque "era o que fazia compromisso sumir da agenda de
  // todo mundo". Só que este filtro roda ANTES, no servidor, e cortava o item pelo
  // campo vazio: o executivo nunca recebia o registro, então não tinha o que resolver.
  // O gestor recebia tudo e via o compromisso na agenda da pessoa — os dois olhando a
  // mesma semana e vendo agendas diferentes.
  // Medido na base: 20 itens sem hubspot_owner_id, 17 deles pertencendo a alguém do
  // time (Amanda 8, Sandro 5, Bruno 4). Os outros 3 são de owner fora do time e
  // continuam fora, como devem.
  // O corte de privacidade não afrouxa: o item só passa se o dono do negócio for
  // EXATAMENTE quem está logado. Sem dono em nenhum dos dois campos, não passa.
  const meuCompromisso = it => {
    const dono = String(it.hubspot_owner_id || it.ownerId || '');
    if (dono) return dono === meuId;
    return String(it.lead_owner_id || '') === meuId;
  };
  const agenda = dados.agenda ? {
    ...dados.agenda,
    itens: (dados.agenda.itens || []).filter(meuCompromisso)
  } : null;

  // Leads da praça: só as praças onde o executivo é responsável (por nome) ou cuja praça
  // bate com a dele — nunca a carteira de leads das outras cidades.
  const leadsReferencia = (dados.leadsReferencia || []).filter(p =>
    (Array.isArray(p.responsaveis) && p.responsaveis.includes(meuNome)) || p.nome === (meuRep && meuRep.praca)
  );

  /* A ROTA DELE, E SÓ A DELE. O mapa completo diz por onde cada colega anda, e território
     de quem está ao lado não é informação do executivo — mesma regra que cortou
     snapshotReps em 07/08. O que ele PRECISA é a própria rota, porque é ela que define
     onde a prospecção dele acontece. */
  const meuTerritorio = (dados.territorios || []).filter(x => x && x.rep === meuNome);

  /* O EXECUTIVO RECEBE O PRÓPRIO HÁBITO E O NÚMERO DO TIME — nunca o porRep inteiro.
     O spread de ...dados levaria o mapa com todo mundo, que é exatamente o vazamento
     silencioso que o corte de snapshotReps fechou em 07/08. */
  /* CADÊNCIA DIÁRIA DO EXECUTIVO: só a linha dele. O heatmap do time é da tela do
     gestor; mandar `porOwner` inteiro para o executivo entregaria a atividade diária
     de cada colega no payload dele — o oposto do corte de 07/08/26. Os `dias` vão
     junto porque sem eles o sparkline não sabe a que dia cada barra pertence. */
  const cadenciaMinha = (dados.cadenciaDiaria && dados.cadenciaDiaria.porOwner) ? {
    dias: dados.cadenciaDiaria.dias || [],
    porOwner: { [meuId]: dados.cadenciaDiaria.porOwner[meuId] || null },
    fonte: dados.cadenciaDiaria.fonte || null,
    naoConta: dados.cadenciaDiaria.naoConta || null,
    truncado: dados.cadenciaDiaria.truncado || [],
    geradoEm: dados.cadenciaDiaria.geradoEm || null
  } : null;
  const habitosMeu = (dados.habitosTime && dados.habitosTime.porRep && dados.habitosTime.porRep[meuId]) || null;
  const habitosTime = dados.habitosTime ? {
    meu: habitosMeu,
    benchmark: dados.habitosTime.benchmark,
    pessoasMedidas: dados.habitosTime.pessoasMedidas
  } : null;

  return {
    ...dados,
    habitosTime,
    /* SEM ESTA LINHA o spread acima entregaria cadenciaDiaria.porOwner INTEIRO ao
       executivo — a atividade diária de cada colega no payload dele. Declarar
       cadenciaMinha e esquecer de usá-la é o vazamento em silêncio de sempre. */
    cadenciaDiaria: cadenciaMinha,
    reps,
    kpiDetalhe: {
      leadsCriados: soMeu(dados.kpiDetalhe.leadsCriados),
      perdidos: soMeu(dados.kpiDetalhe.perdidos)
    },
    /* O EXECUTIVO VE SO A PROPRIA ASSINATURA DE PERDA. O total do time e a comparacao
       entre executivos e material de gestao: saber que o colega perde mais por preco nao
       ajuda ninguem na rua, e ranking de derrota nas costas do outro nao e transparencia. */
    /* HISTÓRICO DE ETAPA DO EXECUTIVO: só a fatia dele, mais as referências do time que
       não têm nome de ninguém (velocidade por etapa, ciclo e agregado). Corte no
       servidor, como o resto do arquivo: carteira de outra pessoa não desce para o
       navegador dele. A escada por turma sai — é leitura de time, não dele. */
    historicoEtapas: dados.historicoEtapas ? {
      dias: dados.historicoEtapas.dias,
      primeiroMes: dados.historicoEtapas.primeiroMes,
      ultimoMes: dados.historicoEtapas.ultimoMes,
      minimoDaTurma: dados.historicoEtapas.minimoDaTurma,
      escada: {},
      velocidade: dados.historicoEtapas.velocidade || [],
      ciclo: dados.historicoEtapas.ciclo || null,
      agregado: dados.historicoEtapas.agregado || null,
      porOwner: { [meuId]: (dados.historicoEtapas.porOwner || {})[meuId] || null }
    } : null,
    motivosPerda: dados.motivosPerda ? {
      dias: dados.motivosPerda.dias,
      total: Object.values((dados.motivosPerda.porOwner || {})[meuId] || {}).reduce((a, b) => a + b, 0),
      porMotivo: (dados.motivosPerda.porOwner || {})[meuId] || {},
      porOwner: { [meuId]: (dados.motivosPerda.porOwner || {})[meuId] || {} },
      /* Exemplos para o clique no motivo — so os negocios DELE. Corte no servidor: perda
         de outra pessoa nao desce para o navegador dele. */
      exemplos: Object.keys(dados.motivosPerda.exemplos || {}).reduce((acc, motivo) => {
        const meus = (dados.motivosPerda.exemplos[motivo] || []).filter(x => String(x.ownerId || '') === String(meuId));
        if (meus.length) acc[motivo] = meus;
        return acc;
      }, {})
    } : null,
    temperatura: {
      quentes: soMeu(dados.temperatura.quentes),
      frios: soMeu(dados.temperatura.frios)
    },
    funilLeads,
    perdidoVisivel,
    onboardingVisivel,
    leadsReciclagem60: soMeu(dados.leadsReciclagem60 || []),
    vendasMes,
    resumoSemanal: resumoSemanalFiltrado,
    agenda,
    leadsReferencia,
    territorios: meuTerritorio,
    // AUTOMAÇÃO 3 — o relatório BRUTO do robô (falhas por executivo, verificação de
    // escrita) continua sendo do gestor. Mas o executivo precisa saber se a carga que
    // está na tela dele é confiável: recomendação em cima de snapshot velho, ou visita
    // que ficou presa no app e não subiu, muda o que ele faz às 8h30. Então ele recebe
    // um recorte: quando rodou, se a rodada teve falha, e se ALGUMA falha era dele —
    // nunca as falhas dos colegas.
    syncStatus: dados.syncStatus ? {
      ultimaExecucao: dados.syncStatus.ultimaExecucao || null,
      houveFalha: Array.isArray(dados.syncStatus.falhas) && dados.syncStatus.falhas.length > 0,
      falhaMinha: Array.isArray(dados.syncStatus.falhas)
        ? dados.syncStatus.falhas.some(f => String(f && (f.ownerId || f.owner_id) || '') === meuId)
        : false
    } : null
    // kpisHub, kpiDeltas, saude, funil (contagens agregadas do time), stageMeta,
    // hubspotUpdatedAtFmt, usuarios (nomes/e-mails do próprio time) permanecem — são
    // agregados sem detalhe de cliente, necessários pra meta coletiva e pro Pódio.
  };
}

// Config do Supabase — usada só pelo build (vai no shell público pro login funcionar).
function configSupabase() {
  return supabaseConfig ? { url: supabaseConfig.url, anonKey: supabaseConfig.anonKey } : null;
}

// Chave do MapTiler (mapa de planejamento de rota) — vem de um arquivo no repo,
// igual ao supabase-config.json, e NÃO de env var da Vercel: esse projeto não tem
// build rodando lá (deploy é estático, arquivos manuais), então uma env var no
// painel da Vercel nunca seria lida por nada. É uma chave PÚBLICA por natureza
// (o navegador precisa dela pra buscar os tiles direto) — protegida por
// restrição de domínio no próprio painel do MapTiler, não por sigilo no código.
function configMaptiler() {
  return maptilerConfig ? maptilerConfig.key : null;
}

module.exports = { montarDadosCompletos, filtrarParaPapel, configSupabase, configMaptiler, USUARIOS, usarSnapshot, temSnapshot, faltandoNoSnapshot };

  },
  "lib/territorios.js": function (module, exports, require, process) {
// lib/territorios.js
//
// QUEM É O DONO DE CADA CONTA-ALVO — uma fonte só (01/09/26).
//
// POR QUE ESTE ARQUIVO EXISTE: a tabela de territórios vivia dentro de
// api/importar-leads.js, e a partir de hoje ela é lida por três lugares diferentes —
// a importação (que dá dono a lead novo), a redistribuição dos leads que já estão na
// base sem dono, e o backfill semanal (que precisa saber quantas contas buscar por
// executivo). Três cópias da mesma regra é o começo de três verdades: alguém corrige o
// bairro num lado, esquece nos outros, e o lead cai para quem não pediu aquele
// território. Uma fonte, importada pelos três.
//
// ATUALIZAÇÃO DE 01/09/26 (Julyan): "André e Luiz vão pro RJ. Renata e Sérgio integram
// SP." Isso muda o Rio de 2 para 4 executivos e São Paulo de 1 para 3 — e é o que
// resolve o problema que a auditoria de hoje achou: 283 contas-alvo com coordenada,
// disponíveis, INVISÍVEIS na tela porque não tinham dono (252 sem dono nenhum + 31
// presas no Michel, desligado em 20/08).
//
// A CAUSA daquele buraco: o Rio era roteado por bairro, e só cinco bairros tinham dono.
// Todo o resto da cidade — Centro, Zona Sul inteira, Ilha, Zona Norte, Zona Oeste
// extrema — caía sem dono, e o cron semanal continuava despejando lá. Agora o Rio tem
// COBERTURA TOTAL: quatro zonas e uma regra de sobra que garante que nenhuma conta do
// município fique órfã. Se um bairro novo aparecer, ele cai na zona da sobra em vez de
// desaparecer.
//
// COMO A DIVISÃO FOI FEITA, e por que:
//   · geografia antes de contagem — dividir o Rio por número de leads produziria zonas
//     que atravessam a cidade, e quem visita paga o deslocamento;
//   · quem já tinha território mantém o dele (Bruno na Jacarepaguá/Zona Oeste, Sandro
//     na Grande Tijuca): mudar território de quem está rodando custa relacionamento;
//   · os dois novos entram nas duas zonas que estavam sem ninguém e são as de maior
//     densidade de restaurante — André na Zona Sul + Centro, Luiz na Zona Norte + Ilha;
//   · Campo Grande / Santa Cruz / Bangu (a antiga zona do Michel, 42 contas) vão para o
//     Bruno, que já é o executivo da Zona Oeste — é o único vizinho de verdade.

function semAcento(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '');
}

/* atalho de leitura: casa qualquer um dos nomes na chave "cidade bairro".

   FRONTEIRA DE PALAVRA, e por que ela não é detalhe (01/09/26): a primeira versão usava
   includes cru, e com isso o nome de duas letras 'se' (o distrito da Sé) casava
   "vila sao JOSE" e "SERralheiro", e 'bras' casava "BRASilandia". Como o passo do nome
   vem antes da coordenada, uma zona recebia bairro que não é dela e o executivo herdava
   o dono errado. Medido: 7 das 400 contas de São Paulo estavam assim — pouco em número e
   grosseiro em espécie, porque "Vila São José (Cidade Dutra)" na fila de quem roda o Centro
   é uma visita de 25 km. (O desequilíbrio 290 · 88 · 22 tinha outra causa, já corrigida: a
   regra de sobra por nome numa cidade de 96 distritos. Ver a NOTA de CENTROS_DE_ZONA.)
   Espaço, parêntese e fim de string são fronteira, então nome composto continua casando
   dentro de rótulo sujo: "FREGUESIA (ILHA DO GOVERNADOR)" casa 'ilha do governador' e
   "PENHA CIRCULAR" casa 'penha'. As expressões são compiladas uma vez, na carga. */
const escaparRe = n => n.replace(/[.*+?^${}()|[\]\\]/g, function (c) { return '\\' + c; });
const algum = (...nomes) => {
  const res = nomes.map(n => new RegExp('\\b' + escaparRe(n) + '\\b'));
  return t => res.some(re => re.test(t));
};

const RIO = 'rio de janeiro';
const SAOPAULO = 'sao paulo';

/* A TRAVA DE CIDADE (01/09/26) — ver a NOTA no patch terr-cidade.
   Cada regra declara a que município pertence, e o buscador só considera a regra quando
   a cidade casa. Sem isso, os homônimos entre Rio e São Paulo — Lapa, Saúde,
   Higienópolis, Jardim Botânico, Penha — mandariam conta paulistana para executivo do
   Rio: uma conta a 400 km na fila de quem trabalha a pé. Território errado é pior que
   território vazio; o vazio se resolve com sourcing, o errado com pedido de desculpas.
   Regra sem `cidade` (a da Kelly, que já testa cidade dentro do próprio teste) continua
   valendo para qualquer município — é o caso de quem cobre a cidade inteira. */
/* ══ O ID REAL, POR NOME ═══════════════════════════════════════════════════════════
   Quatro regras deste arquivo tinham `owner: idDoNome('André Gomes', 'pendente_andregomes')` e parentes — nomes
   de espera cadastrados antes do ownerId existir. NINGUÉM os resolve: o fetch-hubspot
   apenas os FILTRA. Uma regra dessas roteando um lead grava id falso em
   responsavel_owner_id, e aquele lead fica sem aparecer na Daily de ninguém.
   Agora o id sai de data/usuarios.json, por nome, e o placeholder é só o fallback de
   quem realmente ainda não tem id. */
const USUARIOS_PARA_ID = (() => {
  try {
    const u = require('../data/usuarios.json');
    const lista = Array.isArray(u) ? u : (u.usuarios || []);
    const m = {};
    lista.forEach(function (x) {
      const n = semAcento(x && (x.nome || x.name));
      if (n && x.ownerId && !String(x.ownerId).startsWith('pendente_')) m[n] = String(x.ownerId);
    });
    return m;
  } catch (e) { return {}; }
})();

function idDoNome(nome, fallback) {
  return USUARIOS_PARA_ID[semAcento(nome)] || fallback || null;
}

/* ══ AS REGRAS DECLARADAS (09/09/26) ═════════════════════════════════════════════════
   Derivadas de data/territorios.json, a mesma fonte que a tela do gestor e a busca
   semanal leem. Elas vêm ANTES das listas largas abaixo: bairro que o Julyan nomeou hoje
   ganha de bairro que estava numa lista de 01/09.

   `todoOMunicipio` gera regra de cidade inteira, respeitando `exceto` — é o caso do
   Ricardo em Porto Alegre ("só não pega cidade baixa") e do Luiz na Baixada.

   BORDA DE PALAVRA, não substring: 'vila mariana' não é 'vila maria'. Foi o defeito que a
   derivação das sub-cotas do backfill pegou hoje, e ele valeria igual aqui. */
/* ══ O BAIRRO DE VERDADE, DENTRO DE UM CAMPO SUJO ══════════════════════════════════
   MEDIDO no banco: a coluna `bairro` de leads_prospeccao frequentemente carrega o
   endereço com o bairro no fim — "Lj B - Tijuca", "Loja A B C D - Barra da Tijuca",
   "SUC 0028 - Tijuca", "frente - Tijuca", "Lj D - Rio Comprido". O que vem depois do
   ÚLTIMO " - " é o bairro; o resto é número de loja, e comparar a string inteira faria
   nenhum deles casar com nada.

   Também aparece endereço puro sem bairro nenhum ("Av. Lúcio Costa", "R. Des. Izidro").
   Nesses o resultado é o próprio texto, que não casa com bairro declarado — e o lead
   fica sem dono e VISÍVEL, que é o certo: ninguém sabe em que bairro ele está. */
function bairroLimpo(bairro) {
  let s = String(bairro == null ? '' : bairro).trim();
  const i = s.lastIndexOf(' - ');
  if (i > -1) s = s.slice(i + 3).trim();
  return semAcento(s);
}

const DECLARADOS = (() => {
  let decl = [];
  try { decl = require('../data/territorios.json').territorios || []; } catch (e) { decl = []; }
  const regras = [];
  /* ══ COMPARA O BAIRRO INTEIRO, NÃO UM PEDAÇO DELE ═══════════════════════════════
     Era ' <declarado> ' dentro de ' <cidade> <bairro do lead> ', e "Barra da Tijuca"
     contém " tijuca ": o "Tijuca" do Bruno levava a Barra do André, e o `.find` entrega
     ao primeiro que casa, ou seja a quem aparece antes no JSON. Mesma família do
     "vila maria" que casava "vila mariana", agora no caso em que um bairro é o SUFIXO do
     outro — Tijuca/Barra da Tijuca, Penha/Penha Circular, Freguesia/Freguesia (Jacarepaguá).

     O teste recebe a chave "<cidade> <bairro>" por compatibilidade com as regras antigas,
     então o bairro é o que sobra depois de tirar o nome da cidade. */
  const casaBairro = function (chaves, cidadeChave) {
    return function (t) {
      const inteiro = semAcento(t);
      let bai = inteiro;
      if (cidadeChave && bai.indexOf(cidadeChave) === 0) bai = bai.slice(cidadeChave.length).trim();
      const limpo = bairroLimpo(bai);
      return chaves.some(function (k) { return limpo === k || bai === k; });
    };
  };
  /* bairro nomeado primeiro; cidade inteira depois — senão a regra de cidade do Ricardo
     engoliria os três bairros da Kelly em Porto Alegre. */
  decl.forEach(function (tr) {
    if (!tr || tr.ativo === false) return;
    (tr.areas || []).forEach(function (a) {
      if (!a || !a.municipio || a.todoOMunicipio) return;
      const chaves = (a.bairros || []).map(semAcento).filter(Boolean);
      if (!chaves.length) return;
      regras.push({
        owner: idDoNome(tr.rep, null), nome: tr.rep,
        praca: a.municipio + '/' + a.uf + ' · declarado',
        cidade: semAcento(a.municipio), declarado: true,
        teste: casaBairro(chaves, semAcento(a.municipio))
      });
    });
  });
  decl.forEach(function (tr) {
    if (!tr || tr.ativo === false) return;
    (tr.areas || []).forEach(function (a) {
      if (!a || !a.municipio || !a.todoOMunicipio) return;
      const fora = (a.exceto || []).map(semAcento).filter(Boolean);
      const cid = semAcento(a.municipio);
      regras.push({
        owner: idDoNome(tr.rep, null), nome: tr.rep,
        praca: a.municipio + '/' + a.uf + ' · município inteiro'
          + (fora.length ? ' (exceto ' + (a.exceto || []).join(', ') + ')' : ''),
        cidade: cid, declarado: true, todoOMunicipioDeclarado: true,
        teste: function (t) {
          const alvo = ' ' + String(t || '') + ' ';
          if (fora.some(function (k) { return alvo.indexOf(' ' + k + ' ') > -1; })) return false;
          return alvo.indexOf(cid) > -1;
        }
      });
    });
  });
  /* ══ A SOBRA DA CIDADE DE UM DONO SÓ ══════════════════════════════════════════════
     A rota é declarada por BAIRRO e a busca varre o MUNICÍPIO. Medido em 09/09: 301
     leads sem dono, sendo 247 de Guarulhos em 106 bairros que ninguém nomeou (a cidade
     tem ~140), 29 de Suzano, 19 de Mogi e 5 de Salesópolis.

     Cidade com UM ÚNICO dono declarado: a sobra é dele, sem ambiguidade — ele é a única
     pessoa que anda ali. Cidade com DOIS OU MAIS: a sobra NÃO entra, porque dividir
     bairro entre duas pessoas é decisão de território e é do Julyan. Aqueles leads
     continuam sem dono e VISÍVEIS na fila da praça, onde ele distribui. Sem dono e
     visível é melhor que com dono errado. */
  const porCidade = {};
  regras.forEach(function (r) {
    if (!r.owner) return;
    (porCidade[r.cidade] = porCidade[r.cidade] || {})[r.nome] = true;
  });
  Object.keys(porCidade).forEach(function (cid) {
    const donos = Object.keys(porCidade[cid]);
    if (donos.length !== 1) return;                       /* dois donos: decisão dele */
    const base = regras.find(function (r) { return r.cidade === cid && r.nome === donos[0]; });
    if (!base || base.todoOMunicipioDeclarado) return;    /* já cobre a cidade inteira */
    regras.push({
      owner: base.owner, nome: base.nome,
      praca: cid + ' · sobra do município (único dono declarado)',
      cidade: cid, declarado: true, sobraDeclarada: true,
      teste: function (t) { return (' ' + String(t || '') + ' ').indexOf(cid) > -1; }
    });
  });

  /* regra sem id não entra: melhor SEM DONO do que com id inventado */
  return regras.filter(function (r) { return !!r.owner; });
})();

const TERRITORIOS = [
  /* ── ES ────────────────────────────────────────────────────────────────────────── */
  { owner: '86100505', nome: 'Marco Filho', praca: 'Vila Velha/ES', cidade: 'vila velha',
    teste: t => t.includes('vila velha') },
  { owner: '87069181', nome: 'Amanda Pardim', praca: 'Vitória/ES', cidade: 'vitoria',
    teste: t => t.includes('vitoria') },

  /* ── RIO DE JANEIRO: quatro zonas ──────────────────────────────────────────────
     A ordem importa: o teste mais específico vem primeiro, e a Zona Sul é testada
     antes do Centro porque "centro" aparece em nomes compostos de outras zonas. */

  /* SANDRO — Grande Tijuca e Zona Norte central (território que ele já tinha) */
  { owner: '87569072', nome: 'Sandro Brito', praca: 'RJ · Grande Tijuca', cidade: RIO,
    teste: algum('tijuca', 'vila isabel', 'maracana', 'andarai', 'grajau', 'rio comprido',
      'estacio', 'engenho novo', 'sao francisco xavier', 'riachuelo', 'todos os santos',
      'engenho de dentro', 'piedade', 'encantado', 'jacare', 'inhauma', 'cachambi',
      'meier', 'sao cristovao', 'praca da bandeira', 'usina', 'alto da boa vista') },

  /* BRUNO — Jacarepaguá, Barra e Zona Oeste (o dele + a zona que ficou sem dono
     quando o Michel saiu: Campo Grande, Santa Cruz, Bangu e vizinhas) */
  { owner: '86100506', nome: 'Bruno Martins', praca: 'RJ · Jacarepaguá e Zona Oeste', cidade: RIO,
    teste: t => algum('taquara', 'jacarepagua', 'pechincha', 'curicica', 'gardenia azul',
      'itanhanga', 'vargem grande', 'vargem pequena', 'vila valqueire', 'jardim sulacap',
      'recreio', 'barra olimpica', 'barra da tijuca', 'guaratiba', 'campo grande',
      'santa cruz', 'bangu', 'realengo', 'padre miguel', 'senador camara',
      'magalhaes bastos', 'sepetiba', 'paciencia', 'cosmos', 'senador vasconcelos',
      'inhoaiba', 'santissimo', 'campo dos afonsos', 'deodoro', 'vila militar')(t)
      || (t.includes('freguesia') && !t.includes('ilha'))
      || (t.includes(RIO) && /\banil\b/.test(t)) },

  /* ANDRÉ (novo, 01/09/26) — Zona Sul e Centro. As duas zonas de maior densidade de
     restaurante da cidade, e as duas que estavam inteiras sem dono: só Botafogo,
     Copacabana, Leblon, Ipanema e Centro somavam 77 contas invisíveis. */
  { owner: idDoNome('André Gomes', 'pendente_andregomes'), nome: 'André Gomes', praca: 'RJ · Zona Sul e Centro', cidade: RIO,
    teste: t => algum('copacabana', 'ipanema', 'leblon', 'botafogo', 'laranjeiras',
      'catete', 'flamengo', 'gloria', 'humaita', 'gavea', 'jardim botanico',
      'cosme velho', 'leme', 'rocinha', 'urca', 'lagoa', 'vidigal', 'sao conrado',
      'lapa', 'cidade nova', 'santo cristo', 'saude', 'gamboa', 'benfica',
      'catumbi', 'santa teresa', 'caju', 'mangueira')(t)
      || (t.includes(RIO) && /\bcentro\b/.test(t)) },

  /* LUIZ (novo, 01/09/26) — Zona Norte/Leste e Ilha do Governador. Cauda longa: muitos
     bairros de 1 a 6 contas cada, que só viram backlog de verdade somados. */
  { owner: idDoNome('Luiz Pimentel', 'pendente_luizpimentel'), nome: 'Luiz Pimentel', praca: 'RJ · Zona Norte e Ilha', cidade: RIO,
    teste: algum('olaria', 'penha', 'vila da penha', 'braz de pina', 'bras de pina',
      'cordovil', 'parada de lucas', 'vigario geral', 'del castilho', 'mare',
      'bonsucesso', 'ramos', 'pavuna', 'coelho neto', 'costa barros', 'rocha miranda',
      'honorio gurgel', 'guadalupe', 'iraja', 'vicente de carvalho', 'madureira',
      'campinho', 'oswaldo cruz', 'marechal hermes', 'tomas coelho', 'cavalcanti',
      'agua santa', 'jardim america', 'higienopolis', 'maria da graca', 'jacarezinho',
      'jardim carioca', 'jardim guanabara', 'cacuia', 'portuguesa', 'taua', 'paqueta',
      'galeao', 'bancarios', 'zumbi', 'praia da bandeira', 'ribeira', 'cocota',
      'pitangueiras', 'moneró', 'monero',
      /* a Freguesia da ILHA e do Luiz; a Freguesia de Jacarepagua e do Bruno. O mesmo nome
         em duas zonas da cidade — a regra do Bruno exclui 'ilha' e esta a inclui, para o
         caso nao depender da regra de sobra (na simulacao os dois cairam nela por acidente,
         e acerto por acidente e o que deixa de acertar quando alguem mexe na sobra). */
      'freguesia (ilha') },

  /* SOBRA DO RIO — a regra que fecha o buraco (01/09/26).
     Antes, bairro fora das listas caía sem dono e ficava invisível para sempre. Agora
     cai no Luiz, que cobre a maior área e a cauda mais longa. Não é "lixeira": é o
     destino explícito da exceção, registrado aqui para que a próxima pessoa saiba onde
     olhar quando um bairro novo aparecer. */
  { owner: idDoNome('Luiz Pimentel', 'pendente_luizpimentel'), nome: 'Luiz Pimentel', praca: 'RJ · sobra do município', cidade: RIO,
    sobra: true, teste: t => t.includes(RIO) },

  /* ── SÃO PAULO: três zonas ────────────────────────────────────────────────────────
     Whell mantém a Zona Sul, que é a dele desde 10/08. Renata e Sérgio entram nas duas
     regiões restantes. Nota de realidade: SP tem hoje 42 contas na base inteira, 35
     bairros com 1 ou 2 cada — dividir por três dá 14 por executivo, o que não é
     backlog. A divisão está certa; o que falta é sourcing, e é por isso que a meta de
     SP no backfill sobe de 30 para 90 nesta mesma rodada. */

  /* WHELL — Zona Sul e Oeste (a dele) */
  { owner: '89842507', nome: 'Wericles Andrade', praca: 'SP · Zona Sul e Oeste', cidade: SAOPAULO,
    teste: algum('morumbi', 'santo amaro', 'itaim bibi', 'vila olimpia', 'brooklin',
      'moema', 'campo belo', 'jardim paulista', 'pinheiros', 'vila madalena',
      'perdizes', 'alto de pinheiros', 'butanta', 'jardim das acacias',
      'chacara santo antonio', 'cidade moncoes', 'indianopolis', 'paraisopolis',
      'jardim morumbi', 'vila leopoldina', 'agua branca', 'jardim cabore',
      'jardim das pedras', 'jardim tres marias', 'vila do sol') },

  /* RENATA (nova, 01/09/26) — Centro expandido e Zona Leste */
  { owner: idDoNome('Renata Pessoa', 'pendente_renatapessoa'), nome: 'Renata Pessoa', praca: 'SP · Centro e Zona Leste', cidade: SAOPAULO,
    teste: t => algum('bela vista', 'consolacao', 'republica', 'se', 'liberdade',
      'bom retiro', 'bras', 'mooca', 'tatuape', 'vila regente feijo', 'vila gomes cardim',
      'vila bertioga', 'anhangabau', 'santa cecilia', 'higienopolis', 'pacaembu',
      'aclimacao', 'cambuci', 'ipiranga', 'vila prudente', 'sao mateus', 'itaquera',
      'penha de franca', 'vila formosa', 'cidade mae do ceu', 'jardim ana rosa',
      'parque sao rafael', 'parque industrial tomas edson', 'agua funda',
      'chacara nossa senhora do bom conselho',
      /* vindas do Sérgio na correção de mapa: ficam ao sul do Centro, colado na zona dela */
      'vila mariana', 'saude', 'jabaquara', 'planalto paulista', 'bosque da saude',
      'chacara inglesa', 'aclimacao', 'paraiso')(t)
      || (t.includes('sao paulo') && /\bcentro\b/.test(t)) },

  /* SÉRGIO (novo, 01/09/26) — Zona Norte.
     A 1ª versão desta linha dizia "Zona Norte e Vila Mariana", e isso estava errado no
     mapa: Santana fica ao norte do centro e Vila Mariana ao sul, com uns 12 km e a cidade
     inteira entre as duas. Zona que atravessa a cidade é zona que ninguém roda — o dia
     vira trânsito. Vila Mariana, Saúde e Jabaquara foram para a Renata, que faz
     fronteira com elas pelo Centro expandido. */
  { owner: idDoNome('Sérgio Caetano', 'pendente_scaetano'), nome: 'Sérgio Caetano', praca: 'SP · Zona Norte e Lapa', cidade: SAOPAULO,
    teste: algum('santana', 'tucuruvi', 'casa verde', 'freguesia do o', 'lapa',
      'barra funda', 'varzea da barra funda', 'vila guilherme', 'vila maria',
      'jacana', 'vila ede', 'parque taipas', 'brasilandia', 'pirituba', 'vila clarice',
      'jaragua', 'imirim', 'mandaqui', 'vila nova cachoeirinha', 'limao',
      'jardim sao paulo', 'parada inglesa') },

  /* SOBRA DE SÃO PAULO — mesma lógica do Rio: bairro fora das listas tem destino
     explícito em vez de virar invisível. Vai para a Renata, cuja zona (Centro
     expandido) é a de fronteira mais elástica. */
  { owner: idDoNome('Renata Pessoa', 'pendente_renatapessoa'), nome: 'Renata Pessoa', praca: 'SP · sobra do município', cidade: SAOPAULO,
    sobra: true, teste: t => t.includes('sao paulo') },

  /* ── RS ────────────────────────────────────────────────────────────────────────── */
  { owner: '91477292', nome: 'Kelly Travieso', praca: 'Porto Alegre e Canoas/RS',
    teste: algum('canoas', 'porto alegre') }
];

/* ══════════════════════════════════════════════════════════════════════════════════════
   A SOBRA POR CENTRO MAIS PRÓXIMO — ver a NOTA do patch sobra-por-coordenada.
   Nome resolve o bairro conhecido; coordenada resolve a cauda. São Paulo tem 96 distritos
   e enumerar todos de cabeça é como se erra território: um nome trocado manda o executivo
   para o outro lado da cidade.
   Os centros são os MESMOS declarados em TERRITORIO_DO_EXECUTIVO no template — repetidos
   aqui porque este módulo roda no servidor (api/importar-leads) e aquele objeto vive no
   navegador. Divergir os dois seria duas verdades sobre a mesma zona, então a lista traz
   o aviso: mudou lá, muda aqui.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const CENTROS_DE_ZONA = [
  { owner: '86100506', nome: 'Bruno Martins', cidade: RIO, lat: -22.9260, lng: -43.3760 },
  { owner: '87569072', nome: 'Sandro Brito', cidade: RIO, lat: -22.9245, lng: -43.2320 },
  { owner: idDoNome('André Gomes', 'pendente_andregomes'), nome: 'André Gomes', cidade: RIO, lat: -22.9500, lng: -43.1830 },
  { owner: idDoNome('Luiz Pimentel', 'pendente_luizpimentel'), nome: 'Luiz Pimentel', cidade: RIO, lat: -22.8420, lng: -43.2790 },
  { owner: '89842507', nome: 'Wericles Andrade', cidade: SAOPAULO, lat: -23.6520, lng: -46.7080 },
  /* centro no MEIO da zona (Centro -> Zona Leste), nao na ponta: com o centro na Se, a
     Zona Leste caia no Sergio por diferenca de 700 metros — medido com Parque Cisper. */
  { owner: idDoNome('Renata Pessoa', 'pendente_renatapessoa'), nome: 'Renata Pessoa', cidade: SAOPAULO, lat: -23.5500, lng: -46.5900 },
  { owner: idDoNome('Sérgio Caetano', 'pendente_scaetano'), nome: 'Sérgio Caetano', cidade: SAOPAULO, lat: -23.5020, lng: -46.6250 }
];

/* distância em km, suficiente para comparar centros dentro de uma cidade */
/* ══ AS CIDADES EM QUE ELE JÁ NOMEOU BAIRRO ════════════════════════════════════════
   Nelas, as listas largas de 01/09 param de valer: elas foram escritas antes das quatro
   rodadas de rota ditada e dizem o INVERSO do mapa de hoje ("André = Zona Sul e Centro",
   "Bruno = Jacarepaguá e Zona Oeste"). Bairro que ninguém nomeou fica SEM DONO e visível
   na fila da praça — sem dono e visível é melhor que com dono errado. */
const CIDADES_COM_BAIRRO_DECLARADO = (() => {
  const fora = {};
  let decl = [];
  try { decl = require('../data/territorios.json').territorios || []; } catch (e) { decl = []; }
  decl.forEach(function (tr) {
    if (!tr || tr.ativo === false) return;
    (tr.areas || []).forEach(function (a) {
      if (!a || !a.municipio || a.todoOMunicipio) return;
      if ((a.bairros || []).length) fora[semAcento(a.municipio)] = true;
    });
  });
  return fora;
})();

/* ══ O QUE ESTÁ FORA DE ROTA ════════════════════════════════════════════════════════
   `_fora_de_rota` mora em data/territorios.json desde 08/09 — "zona oeste no momento nao
   precisa" — e MEDIDO em 09/09 nenhum consumidor o lia. A frase estava escrita e não
   valia para nada: o Bruno tinha 60 leads em Campo Grande, Santa Cruz e Bangu.

   Ele corta ANTES de qualquer atribuição, inclusive da declarada: se o Julyan tirou a
   região de rota, ninguém deve receber lead dali nem por engano. */
const FORA_DE_ROTA = (() => {
  let lista = [];
  try { lista = require('../data/territorios.json')._fora_de_rota || []; } catch (e) { lista = []; }
  return lista.map(function (z) {
    return {
      cidade: semAcento(z.municipio),
      zona: z.zona || 'fora de rota',
      bairros: (z.bairros || []).map(semAcento).filter(Boolean)
    };
  }).filter(function (z) { return z.cidade && z.bairros.length; });
})();

function estaForaDeRota(cidade, bairro) {
  const cid = semAcento(cidade);
  const bai = bairroLimpo(bairro);
  if (!bai) return null;
  const z = FORA_DE_ROTA.find(function (x) {
    return cid.indexOf(x.cidade) > -1 && x.bairros.indexOf(bai) > -1;
  });
  return z || null;
}

/* ══ A SOBRA DO MUNICÍPIO, ESCOLHIDA A DEDO ═════════════════════════════════════════
   `sobraDoMunicipio: true` numa área declarada por bairro: este rep leva o RESTO daquele
   município — o bairro que ninguém nomeou, a grafia que não casa com nada, e o registro
   que veio com endereço no lugar do bairro.

   É a garantia de "nao deixa sem dono" (Julyan, 09/09) como REGRA e não como promessa de
   que eu listei os 163 bairros do Rio corretamente. */
const SOBRAS_DE_MUNICIPIO = (() => {
  let decl = [];
  try { decl = require('../data/territorios.json').territorios || []; } catch (e) { decl = []; }
  const fora = [];
  decl.forEach(function (tr) {
    if (!tr || tr.ativo === false) return;
    (tr.areas || []).forEach(function (a) {
      if (!a || !a.municipio || !a.sobraDoMunicipio) return;
      const owner = idDoNome(tr.rep, null);
      if (!owner) return;
      fora.push({
        owner: owner, nome: tr.rep,
        praca: a.municipio + '/' + a.uf + ' · sobra do município (declarada)',
        cidade: semAcento(a.municipio), declarado: true, sobraDoMunicipio: true
      });
    });
  });
  return fora;
})();

function kmEntre(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* De todos os executivos daquele município, o do centro mais próximo. Devolve null quando
   não há coordenada — e aí a regra de sobra por nome, que continua existindo, assume. */
function donoPorProximidade(cidade, lat, lng) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  const cid = semAcento(cidade);
  const candidatos = CENTROS_DE_ZONA.filter(c => cid.includes(c.cidade));
  if (!candidatos.length) return null;
  let melhor = null, menor = Infinity;
  for (const c of candidatos) {
    const d = kmEntre(Number(lat), Number(lng), c.lat, c.lng);
    if (d < menor) { menor = d; melhor = c; }
  }
  return melhor ? { owner: melhor.owner, nome: melhor.nome, praca: melhor.nome + ' · por proximidade (' + menor.toFixed(1) + ' km do centro da zona)', porCoordenada: true } : null;
}

/* A ZONA QUE VEM ESCRITA NO NOME DO BAIRRO — ver a NOTA do patch dica-de-zona.
   Só existe para São Paulo e só para as quatro zonas que a fonte escreve entre
   parênteses. Vale mais que a coordenada porque o parêntese nunca é um chute: a
   coordenada, quando o geocodificador falha, vira o centróide do município e passa a
   apontar para o centro de zona de quem estiver mais perto do centróide. */
const ZONAS_ESCRITAS = [
  { marca: ['(zona norte)', '(z norte)'], owner: idDoNome('Sérgio Caetano', 'pendente_scaetano'), nome: 'Sérgio Caetano' },
  { marca: ['(zona leste)', '(z leste)'], owner: idDoNome('Renata Pessoa', 'pendente_renatapessoa'), nome: 'Renata Pessoa' },
  { marca: ['(zona sul)', '(z sul)', '(zona oeste)', '(z oeste)'], owner: '89842507', nome: 'Wericles Andrade' }
];

function donoPorZonaEscrita(cidade, bairro) {
  const cid = semAcento(cidade);
  if (!cid.includes(SAOPAULO)) return null;
  const b = semAcento(bairro);
  const z = ZONAS_ESCRITAS.find(x => x.marca.some(m => b.includes(m)));
  return z
    ? { owner: z.owner, nome: z.nome, praca: z.nome + ' · zona escrita no nome do bairro', porZonaEscrita: true }
    : null;
}

/* ══ CIDADE DIVIDIDA POR MERIDIANO ═══════════════════════════════════════════════════
   Guarulhos tem DOIS donos e ~140 bairros, dos quais 18 estão nomeados. Sem esta regra a
   busca traz 83% do município sem dono. O divisor mora em data/territorios.json, junto do
   resto do território — não cravado aqui.

   A COORDENADA SÓ DECIDE DENTRO DA CAIXA DA CIDADE. Medido em 09/09: 38 dos 247 leads de
   Guarulhos tinham ponto entre -51,4 e -45,6 de longitude, para uma cidade de 30 km — o
   geocodificador falha e devolve outra cidade. Fora da caixa, devolve null: o lead fica
   sem dono e VISÍVEL na fila da praça, onde o gestor distribui. */
const DIVISORES = (() => {
  try { return require('../data/territorios.json')._divisores_de_cidade || []; }
  catch (e) { return []; }
})();

function donoPorMeridiano(cidade, lat, lng) {
  const cid = semAcento(cidade);
  const d = DIVISORES.find(function (x) { return cid.indexOf(semAcento(x.municipio)) > -1; });
  if (!d) return null;
  const la = Number(lat), lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  const cx = d.caixa || {};
  const dentro = Array.isArray(cx.lat) && Array.isArray(cx.lng)
    && la >= cx.lat[0] && la <= cx.lat[1] && lo >= cx.lng[0] && lo <= cx.lng[1];
  if (!dentro) return null;   /* coordenada impossível não decide território */
  const nome = lo < Number(d.corte) ? d.oeste : d.leste;
  const owner = idDoNome(nome, null);
  if (!owner) return null;
  return { owner: owner, nome: nome,
    praca: d.municipio + '/' + d.uf + ' · ' + (lo < Number(d.corte) ? 'oeste' : 'leste')
      + ' do meridiano ' + d.corte, porMeridiano: true };
}

function rotearTerritorio(cidade, bairro, lat, lng) {
  const r = regraDoTerritorio(cidade, bairro, lat, lng);
  return r ? r.owner : null;
}

/* Igual ao de cima, mas devolve a regra inteira — a redistribuição e os relatórios
   precisam do NOME e da PRAÇA para dizer o que fizeram, não só do id. */
function regraDoTerritorio(cidade, bairro, lat, lng) {
  const cid = semAcento(cidade);
  const chave = cid + ' ' + semAcento(bairro);
  /* 1º o bairro conhecido (a fronteira que não é um raio); 2º a zona escrita no nome do
     bairro, quando a fonte a declara; 3º a coordenada; 4º a sobra por nome, que só
     existe para lead sem coordenada nenhuma. */
  /* A DECLARAÇÃO DO JULYAN GANHA DE TUDO (09/09/26). Ela é a decisão de hoje; as listas
     largas abaixo são a cobertura de 01/09 que ele nunca revogou, e continuam valendo
     para o bairro que ele não nomeou. Sem esta precedência, Copacabana ia para o André
     (que saiu da Zona Sul) e Cachambi para o Sandro (que saiu da Grande Tijuca). */
  /* bairro NOMEADO primeiro; a sobra da cidade de um dono só depois — ela é o resto, e
     consultá-la antes faria a cidade inteira cair no primeiro dono mesmo onde outro tem
     bairro nomeado. */
  /* FORA DE ROTA CORTA ANTES DE TUDO: se ele tirou a região da rota, ninguém recebe
     lead dali — nem por declaração, nem por lista antiga, nem por coordenada. */
  if (estaForaDeRota(cidade, bairro)) return null;
  const declarado = DECLARADOS.find(x => !x.sobraDeclarada && cid.includes(x.cidade) && x.teste(chave));
  if (declarado) return declarado;
  const sobraDele = DECLARADOS.find(x => x.sobraDeclarada && cid.includes(x.cidade) && x.teste(chave));
  if (sobraDele) return sobraDele;
  /* o meridiano vem DEPOIS do bairro nomeado — quem nomeou a rua manda — e ANTES das
     listas largas e da coordenada genérica, porque ele é a divisão que o Julyan pediu
     para aquela cidade */
  const porMeridiano = donoPorMeridiano(cidade, lat, lng);
  if (porMeridiano) return porMeridiano;
  /* A SOBRA DECLARADA DO MUNICÍPIO vem DEPOIS do bairro nomeado de todo mundo (senão o
     dono da sobra levaria a Zona Sul do vizinho) e ANTES das listas largas de 01/09
     (senão o mapa antigo volta a decidir, que é o defeito que pôs 107 leads na carteira
     errada). É ela que cumpre o "nao deixa sem dono". */
  const sobraDoMunicipio = SOBRAS_DE_MUNICIPIO.find(x => cid.indexOf(x.cidade) > -1);
  if (sobraDoMunicipio) return sobraDoMunicipio;
  /* ══ AS LISTAS DE 01/09 NÃO VALEM ONDE ELE JÁ NOMEOU BAIRRO ═════════════════════
     Elas são cobertura para praça que ele não detalhou. Onde detalhou, elas são o mapa
     ANTIGO e o mapa antigo diz o inverso do de hoje — provado: CENTRO caía no André pela
     regra "RJ · Zona Sul e Centro", de quando ele era da Zona Sul. Deixá-las valendo é o
     que punha 107 leads de Copacabana e Botafogo na carteira de quem trabalha na Barra. */
  const cidadeDetalhada = Object.keys(CIDADES_COM_BAIRRO_DECLARADO)
    .some(function (c) { return cid.indexOf(c) > -1; });
  if (cidadeDetalhada) return null;
  const porNome = TERRITORIOS.find(x => (!x.cidade || cid.includes(x.cidade)) && x.teste(chave) && !x.sobra);
  if (porNome) return porNome;
  const porZona = donoPorZonaEscrita(cidade, bairro);
  if (porZona) return porZona;
  const porCoord = donoPorProximidade(cidade, lat, lng);
  if (porCoord) return porCoord;
  return TERRITORIOS.find(x => (!x.cidade || cid.includes(x.cidade)) && x.teste(chave)) || null;
}

module.exports = { TERRITORIOS, DECLARADOS, DIVISORES, donoPorMeridiano, FORA_DE_ROTA, estaForaDeRota, bairroLimpo, CIDADES_COM_BAIRRO_DECLARADO, SOBRAS_DE_MUNICIPIO, CENTROS_DE_ZONA, ZONAS_ESCRITAS, rotearTerritorio, regraDoTerritorio, donoPorProximidade, donoPorZonaEscrita, kmEntre, semAcento };

  },
  "api/buscar-leads.js": function (module, exports, require, process) {
// api/buscar-leads.js
//
// BUSCA SOB DEMANDA NA CASA DOS DADOS (06/09/26, aba Rotas & Prospecção do gestor).
//
// POR QUE ESTA ROTA EXISTE: a regra de ouro da aba nova é "nada entra sozinho — o gestor
// dispara a importação, por praça, quando o estoque pede". Até aqui existiam duas metades
// e faltava a ponte entre elas:
//   · scripts/backfill-casa-dos-dados.js BUSCA, mas só roda no cron de segunda;
//   · api/importar-leads.js RECEBE leads prontos, mas não sai buscando.
// Esta rota é a ponte: recebe uma praça, chama a MESMA busca do coletor semanal e entrega
// o resultado para o MESMO endpoint de importação.
//
// NÃO REIMPLEMENTA NADA. Busca, normalização, filtro de foodservice, deduplicação,
// roteamento por território e corte de qualidade continuam onde sempre estiveram e
// continuam sendo testados lá. Este arquivo tem uma responsabilidade só: autorizar o
// gestor e amarrar as duas pontas. Se um dia o critério de qualidade mudar, muda num
// lugar e vale para o cron e para o botão — que é o contrário do que já me custou caro
// neste produto (a mesma regra escrita em dois lugares, divergindo em silêncio).
//
// O QUE ESTA ROTA NÃO FAZ, e o motivo está na tela:
//   · Google Places — o coletor existe (scripts/backfill-google-places.js) e roda mensal.
//     A FONTE MUDOU PARA O SERPER em 14/09/26: a chave do Google nunca existiu — nem
//     nos Secrets do GitHub, nem na Vercel (conferido nos dois). Agora e SERPER_API_KEY,
//     e ela vive so nos Secrets do GitHub, nao nas env vars da Vercel. Sem ela aqui,
//     disparar Places por esta rota devolveria erro, entao o chip continua desabilitado
//     dizendo isso — o que mudou foi o nome da chave que falta, nao a situacao.
//   · TripAdvisor — fora da allowlist de rede e o ToS proíbe coleta automatizada. Não é
//     "ainda não fizemos": é uma fonte que não pode existir por este caminho.
//
// Variáveis de ambiente (todas já existem na Vercel):
//   CASADOSDADOS_TOKEN  -> a mesma que api/novidades-mercado.js usa
//   IMPORT_SECRET       -> o mesmo que api/importar-leads.js valida
//   SUPABASE_URL / SUPABASE_ANON_KEY -> para validar a sessão do gestor

const { CIDADES, buscarCidade, importarLote } = require('../scripts/backfill-casa-dos-dados.js');
const { montarDadosCompletos } = require('../scripts/montar-dados.js');

/* teto de segurança: o botão é do gestor, mas uma requisição HTTP não pode paginar a
   Casa dos Dados por minutos. 100 é o topo que a própria tela oferece. */
const QUANTIDADE_MAXIMA = 100;
const QUANTIDADE_PADRAO = 25;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const casaToken = process.env.CASADOSDADOS_TOKEN;
  const importSecret = process.env.IMPORT_SECRET;
  if (!casaToken) return res.status(500).json({ erro: 'CASADOSDADOS_TOKEN não configurado neste deployment.' });
  if (!importSecret) return res.status(500).json({ erro: 'IMPORT_SECRET não configurado neste deployment.' });

  /* ── SÓ O GESTOR DISPARA ──────────────────────────────────────────────────────
     Mesma checagem de api/importar-leads.js: sessão do Supabase, e-mail conferido
     contra data/usuarios.json. Aqui é mais restrito de propósito — importar-leads
     deixa o executivo trazer conta da Casa dos Dados para a própria carteira; disparar
     uma VARREDURA de praça é decisão de quem olha o estoque do time. */
  const auth = req.headers.authorization || '';
  if (!/^Bearer\s+/i.test(auth)) return res.status(401).json({ erro: 'Faça login para disparar a importação.' });
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaAnon) return res.status(500).json({ erro: 'Supabase não configurado neste deployment.' });

  let quemPediu = null;
  try {
    const check = await fetch(supaUrl + '/auth/v1/user', {
      headers: { Authorization: auth, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    const email = String(((await check.json()) || {}).email || '').toLowerCase();
    const USUARIOS = (montarDadosCompletos().usuarios) || [];
    const u = email ? USUARIOS.find(x => String(x.email).toLowerCase() === email) : null;
    if (!u || u.role !== 'manager') {
      return res.status(403).json({ erro: 'Só o gestor dispara importação de praça.' });
    }
    quemPediu = u.email;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }

  /* ── a praça tem que ser uma que o roteador saiba rotear ────────────────────────
     CIDADES é a lista do coletor, e é ela que api/importar-leads sabe transformar em
     dono. Aceitar município livre criaria lead sem território — órfão nascendo por
     digitação, que é o problema que o card de território órfão existe para resolver. */
  const municipio = String((req.body && req.body.municipio) || '').trim();
  const cfgOriginal = CIDADES.find(c => c.municipio.toLowerCase() === municipio.toLowerCase());
  if (!cfgOriginal) {
    return res.status(400).json({
      erro: 'Praça desconhecida — o roteador não saberia de quem é o lead.',
      pracasValidas: CIDADES.map(c => c.municipio)
    });
  }

  let quantidade = Number((req.body && req.body.quantidade) || QUANTIDADE_PADRAO);
  if (!isFinite(quantidade) || quantidade <= 0) quantidade = QUANTIDADE_PADRAO;
  quantidade = Math.min(Math.round(quantidade), QUANTIDADE_MAXIMA);

  /* a quantidade pedida vira o objetivo E o teto desta rodada: o coletor para de paginar
     assim que alcança, então o gestor não espera por 500 leads que ele não pediu */
  const cfg = Object.assign({}, cfgOriginal, { objetivoMinimo: quantidade, tetoMaximo: quantidade });

  try {
    const leads = await buscarCidade(cfg, casaToken);
    if (!leads || !leads.length) {
      return res.status(200).json({
        ok: true, municipio: cfgOriginal.municipio, encontrados: 0, inseridos: 0, duplicados: 0,
        aviso: 'A busca rodou e não trouxe conta nova nesta praça — o filtro de foodservice e a janela de abertura já descartam o resto.'
      });
    }
    const r = await importarLote(leads, importSecret);
    return res.status(200).json({
      ok: true,
      municipio: cfgOriginal.municipio,
      encontrados: leads.length,
      inseridos: r.inseridos || 0,
      duplicados: r.duplicados || 0,
      pedidoPor: quemPediu
    });
  } catch (e) {
    /* O ERRO CHEGA NA TELA COM O MOTIVO. Importação que "rodou" e não trouxe nada, sem
       dizer por quê, faz o gestor apertar o botão de novo — e a segunda tentativa custa
       a mesma cota de API da primeira. */
    return res.status(502).json({ erro: 'A busca na Casa dos Dados falhou: ' + (e && e.message ? e.message : 'erro desconhecido') });
  }
};

  },
  "scripts/backfill-casa-dos-dados.js": function (module, exports, require, process) {
// scripts/backfill-casa-dos-dados.js
// Roda semanalmente via GitHub Actions — busca o BACKLOG de contas-alvo da Casa dos
// Dados por CIDADE de cada executivo (diferente de api/novidades-mercado.js, que só
// busca "quem abriu essa semana" pra Agenda). Esta rodada existe pra resolver o pedido
// do Julyan: "quero ninguém sem da Casa dos Dados" — auditoria real mostrou que só 1
// conta em toda a base tinha essa fonte (criada manualmente pela Kelly), e o Wericles
// (São Paulo) não tinha NENHUM lead de fonte nenhuma.
//
// NÃO reimplementa deduplicação, roteamento por território nem filtro de qualidade —
// tudo isso já existe e já é testado em api/importar-leads.js. Este script só busca
// na Casa dos Dados, normaliza pro formato que aquele endpoint espera, e chama ele via
// HTTP (o mesmo caminho que a doc do endpoint já previa: "webhook/automação
// server-to-server, com o header x-import-secret").
//
// Variáveis de ambiente:
//   CASADOSDADOS_TOKEN  -> chave da API (mesma usada por api/novidades-mercado.js)
//   IMPORT_SECRET       -> mesmo segredo que api/importar-leads.js já valida
//   COCKPIT_URL         -> opcional, default aponta pra produção

const CASA_URL = 'https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo';
const COCKPIT_URL = process.env.COCKPIT_URL || 'https://fieldsalestakeat.vercel.app';

// CORREÇÃO (16/08/26, Julyan): "quero mais leads pra todos, pelo menos 30 por executivo".
// Cada cidade agora carrega um objetivoMinimo (soma dos executivos que ela atende) e um
// tetoMaximo de segurança (pra não virar fila que ninguém lê — mesma preocupação de antes).
// Continua sendo backlog de verdade, não só "abriu essa semana".
const TAMANHO_PAGINA_API = 40; // a Casa dos Dados pagina; busca em blocos até o teto de cada cidade
const MAX_PAGINAS_POR_CIDADE = 30; // trava de segurança — nunca deixa uma cidade paginar pra sempre
// Janela ampla o bastante pra cobrir o mercado ativo (não só "abriu esta semana",
// que é o filtro do endpoint da Agenda) — 8 anos captura o estabelecimento maduro
// que ainda pode não ter sistema de PDV, sem se limitar a CNPJ recém-nascido.
const JANELA_DIAS = 365 * 8;
// CORREÇÃO (16/08/26, Julyan, 2ª rodada): "não posso sujar o funil do gestor" — subiu
// de 60 pra 90 dias mínimos de abertura, mais margem de segurança contra CNPJ que
// ainda pode fechar ou estar com cadastro incompleto.
const DIAS_MINIMO_ABERTURA = 90;

// Uma linha por CIDADE que api/importar-leads.js sabe rotear (a função rotearTerritorio
// de lá decide o dono certo por cidade+bairro). Rio de Janeiro cobre 2 executivos
// (Bruno, Sandro — Michel foi desligado em 20/08/26) — por isso carrega metaBairros:
// sub-cotas de 30 leads por bairro de cada um, testadas com o MESMO critério de bairro
// que rotearTerritorio usa lá no endpoint (mantido em sincronia manual — se mudar um
// lado, mudar o outro).
// Cidades de executivo único (1 rep por município) só precisam do objetivoMinimo geral.
/* ══ AS CIDADES E AS SUB-COTAS SAEM DE data/territorios.json (09/09/26) ═══════════════
   ESTE ARRAY ERA A SEGUNDA CÓPIA DA MESMA REGRA. A tela do gestor decidia a praça de cada
   executivo por um caminho (os bairros dos leads de exemplo em leads-referencia.json) e
   esta busca decidia por outro (as metaBairros em regex, aqui). As duas divergiam calada,
   e o preço foi medido em 09/09: quatro dos onze executivos não apareciam em praça
   nenhuma na tela, e cinco municípios de rota real — Mogi das Cruzes, Biritiba Mirim,
   Salesópolis, Suzano e Guarulhos — não eram buscados por ninguém. Gente com rota e sem
   munição.

   AGORA A DECLARAÇÃO É UMA. O território de cada pessoa está em data/territorios.json, e
   tanto a tela quanto esta busca leem de lá. Mexer no bairro de alguém é mexer naquele
   arquivo, e é decisão do Julyan.

   O QUE ESTA DERIVAÇÃO FAZ:
   · junta os municípios de todos os territórios, um por cidade;
   · monta uma sub-cota por executivo em cada cidade que tem mais de um dono, com o teste
     de bairro vindo dos bairros DECLARADOS (e não de uma regex escrita à mão);
   · quem tem `todoOMunicipio` não gera sub-cota de bairro — ele cobre a cidade, menos o
     que estiver em `exceto`;
   · objetivo e teto por cidade escalam com quanta gente ela tem, porque cidade com três
     donos precisa de mais lead que cidade com um. */
const TERRITORIOS = (() => {
  try { return require('../data/territorios.json').territorios || []; }
  catch (e) {
    console.log('[backfill-casa-dos-dados] AVISO: nao li data/territorios.json — ' + e.message);
    return [];
  }
})();

const semAcentoBairro = s => String(s || '').toLowerCase().normalize('NFD')
  .replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const CIDADES = (() => {
  const porCidade = new Map();
  TERRITORIOS.forEach(tr => {
    if (tr && tr.ativo === false) return;   /* Amanda, em transicao para Inside */
    (tr.areas || []).forEach(a => {
      if (!a || !a.municipio) return;
      const k = a.municipio + '|' + (a.uf || '');
      if (!porCidade.has(k)) porCidade.set(k, { municipio: a.municipio, uf: a.uf, donos: [] });
      porCidade.get(k).donos.push({ rep: tr.rep, area: a });
    });
  });

  return [...porCidade.values()].map(c => {
    /* 30 contas por dono é o objetivo que já vigorava; o teto é cinco vezes isso, para a
       busca poder passar do mínimo quando um bairro rende pouco e outro rende muito. */
    const n = c.donos.length;
    const cfg = { municipio: c.municipio, uf: c.uf, objetivoMinimo: 30 * n, tetoMaximo: 150 * n };

    /* SUB-COTA SÓ ONDE HÁ MAIS DE UM DONO E OS BAIRROS ESTÃO DECLARADOS. Sem isso, a
       cidade cumpre a meta geral com contas de uma zona só e a zona do colega nasce
       vazia — foi o motivo pelo qual as sub-cotas existem desde 01/09. */
    const comBairro = c.donos.filter(d => !d.area.todoOMunicipio && (d.area.bairros || []).length);
    if (n > 1 && comBairro.length > 1) {
      /* ══ UM BAIRRO, UM DONO ═══════════════════════════════════════════════════════
         O resolvedor é compartilhado pelas metas desta cidade, e é ele que decide de
         quem é o bairro — em vez de cada meta responder por si e o mesmo lead contar
         duas vezes.

         BORDA DE PALAVRA, e não substring: 'vila mariana' NÃO é 'vila maria'. Sem a
         borda, um bairro órfão entra na rota do vizinho de nome parecido — foi o que
         aconteceu com a Vila Mariana, que está sem dono, caindo no Sérgio.

         O CONTAINMENT existe porque o CRM guarda o bairro com apêndice digitado à mão
         ("Freguesia (Jacarepaguá, entorno imediato de Taquara)", "Tijuca (Shopping
         45)"). E é por isso que a POSIÇÃO decide: o bairro é o que vem primeiro, o
         resto é contexto. Em empate, ganha a chave mais longa, que é a mais específica. */
      const donosDoBairro = comBairro.map(d => ({
        rep: d.rep,
        chaves: (d.area.bairros || []).map(semAcentoBairro).filter(Boolean)
      }));
      const cache = new Map();
      const donoDoBairro = b => {
        const alvo = ' ' + String(b || '') + ' ';
        if (cache.has(alvo)) return cache.get(alvo);
        let melhor = null;
        donosDoBairro.forEach(d => {
          d.chaves.forEach(k => {
            const pos = alvo.indexOf(' ' + k + ' ');
            if (pos < 0) return;
            if (!melhor || pos < melhor.pos || (pos === melhor.pos && k.length > melhor.tam)) {
              melhor = { rep: d.rep, pos: pos, tam: k.length };
            }
          });
        });
        const quem = melhor ? melhor.rep : null;
        cache.set(alvo, quem);
        return quem;
      };
      cfg.metaBairros = comBairro.map(d => ({
        nome: d.rep + ' (' + (d.area.bairros || []).slice(0, 3).join(', ') + '…)',
        minimo: 30,
        teste: b => donoDoBairro(b) === d.rep
      }));
    }
    return cfg;
  });
})();

/* PRAÇA SEM NENHUM TERRITÓRIO DECLARADO AINDA PRECISA SER BUSCADA. Vitória é o caso de
   hoje: a Amanda foi para Inside e ninguém assumiu, mas a praça existe no radar e o
   estoque dela não pode secar em silêncio enquanto o Julyan não reatribui. */
const CIDADES_SEM_DONO = [
  { municipio: 'Vitória', uf: 'ES', objetivoMinimo: 30, tetoMaximo: 150 }
];
CIDADES_SEM_DONO.forEach(c => {
  if (!CIDADES.some(x => x.municipio === c.municipio)) CIDADES.push(c);
});

const CNAE_FOODSERVICE = [
  '5611201', '5611202', '5611203', '5611204', '5620104', '4721102', '1091102'
];

let REDES_EXCLUIDAS = [];
try {
  const raw = require('../data/redes-excluidas.json');
  REDES_EXCLUIDAS = (raw && Array.isArray(raw.redes)) ? raw.redes : [];
} catch (e) { REDES_EXCLUIDAS = []; }

const semAcento = t => String(t || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function ehRedeGrande(nome) {
  const n = semAcento(nome);
  return !!n && REDES_EXCLUIDAS.some(r => n.includes(semAcento(r)));
}
// Mesmo padrão de api/novidades-mercado.js: CPF/raiz de CNPJ virando razão social é
// empresário individual sem estabelecimento — corta, exceto se tiver marca societária.
function ehPessoaFisica(i) {
  const t = String(i.razaoSocial || i.nome || '').trim();
  if (/\b(ltda|eireli|s\/?a\b|me\b|mei\b|epp\b)/i.test(t)) return false;
  const inicio = t.split(/\s+/)[0] || '';
  return /^\d[\d.\-\/]*$/.test(inicio) && inicio.replace(/\D/g, '').length >= 8;
}

// CORREÇÃO (16/08/26, Julyan, 2ª rodada): "filtra o que não for de food" — o CNAE de
// foodservice às vezes classifica errado (ex: mercearia/tabacaria/distribuidora
// registradas sob um CNAE de restaurante). Corta pelo NOME quando bate um desses
// padrões de varejo/serviço não-alimentício, mesmo já tendo passado pelo CNAE.
const PADROES_FORA_DE_FOODSERVICE = [
  /\bconveniencia\b/, /\bdistribuidora\b/, /\badega(s)?\b/,
  /\bhortifruti\b/, /\bfarmacia\b/, /\bdrogaria\b/, /\bpapelaria\b/, /\batacad/,
  /\bsupermercado\b/, /\bmercadinho\b/, /\bpet\b/, /\bmaterial\b/, /\bconstru/,
  /\blavanderia\b/, /\bbarbearia\b/, /\botica\b/, /\bconfec/
];
function ehForaDeFoodservice(nome) {
  const n = semAcento(nome);
  return PADROES_FORA_DE_FOODSERVICE.some(re => re.test(n));
}

function isoDiasAtras(dias) {
  const d = new Date(Date.now() - dias * 86400000);
  return d.toISOString().slice(0, 10);
}

// Mesma normalização de api/novidades-mercado.js — mantém os dois lugares que falam
// com a Casa dos Dados devolvendo o mesmo formato de lead.
function normalizar(e) {
  if (!e || !e.cnpj) return null;
  const end = e.endereco || {};
  const nome = (e.nome_fantasia && String(e.nome_fantasia).trim()) || (e.razao_social && String(e.razao_social).trim()) || 'Sem nome';
  const logradouro = [end.tipo_logradouro, end.logradouro].filter(Boolean).join(' ').trim();
  return {
    place_id: null, // Casa dos Dados não tem place_id do Google — dedup usa telefone/nome+cidade
    cnpj: String(e.cnpj), // CORREÇÃO (16/08/26, Julyan): ficha da rota pedia isso — o campo já vinha na resposta, só não era salvo
    data_abertura: e.data_abertura || null, // idem — alimenta o "Aberta há" na ficha (nome snake_case combinando com a coluna do Supabase)
    nome: nome.slice(0, 160),
    razaoSocial: e.razao_social || null,
    categoria: null, // CNAE já garantiu foodservice; categoria textual não vem desta fonte
    endereco: [logradouro, end.numero].filter(Boolean).join(', ') || null,
    bairro: end.bairro || null,
    cidade: end.municipio || null,
    estado: end.uf || null,
    // CONFIRMADO (16/08/26) na documentação oficial (docs.casadosdados.com.br): o
    // schema de resposta CNPJPesquisaResposta — tanto na v4 (Consulta CNPJ) quanto na
    // v5 (Pesquisa Avançada), mesmo com tipo_resultado=completo — NÃO tem campo de
    // telefone nenhum. `telefone` e `ddd` existem só como FILTRO de busca no corpo da
    // requisição (e `mais_filtros.com_telefone` filtra só quem tem telefone cadastrado)
    // — a API deixa buscar por telefone, mas nunca devolve o número de volta. Isso não
    // é lacuna do nosso código, é limitação real do provedor. Null é o valor correto
    // e definitivo aqui, não um "ainda não implementado".
    telefone: null,
    nota: null,
    avaliacoes: null, // Casa dos Dados não tem avaliação — api/importar-leads.js já sabe não cortar por isso
    // CORREÇÃO CRÍTICA (16/08/26, Julyan: "ainda não funciona" na busca por proximidade
    // — investigado ao vivo): `end.ibge.latitude/longitude` NÃO é o endereço do
    // estabelecimento, é o centro geográfico do MUNICÍPIO INTEIRO — confirmado que
    // TODOS os leads de uma mesma cidade compartilhavam a coordenada idêntica até a
    // 13ª casa decimal. Isso fazia a busca "perto de mim" nunca achar nada perto do
    // bairro real do executivo (o ponto genérico podia estar a mais de 10km de
    // distância de onde o lead de fato fica) e, quando achava, mostrava a MESMA
    // distância pra centenas de leads diferentes ao mesmo tempo. Corrigido geocodificando
    // o endereço real (rua + bairro + cidade) via MapTiler logo abaixo, em buscarCidade —
    // não aqui, porque normalizar() é síncrona e geocodificar precisa de await.
    lat: null,
    lng: null
  };
}

// Geocodifica o endereço real de cada lead via MapTiler — substitui a coordenada
// genérica do município (ver comentário em normalizar()). Roda uma vez por lead
// recém-importado, não a cada carregamento de tela. `country=br&language=pt` sem
// viés de proximidade aqui é seguro porque o endereço já tem cidade explícita —
// diferente da busca por texto solto do executivo (ver geocodificarLocalAtuacao no
// template, que precisa de viés porque o texto digitado não tem cidade junto).
async function geocodificarEnderecoReal(item, maptilerKey) {
  if (!maptilerKey) return item;
  const texto = [item.endereco, item.bairro, item.cidade, item.estado].filter(Boolean).join(', ');
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
  } catch (e) {
    return item; // geocode é bônus (melhora a ordenação por distância) — falhar não pode derrubar a importação
  }
}

async function autenticarECconsultar(corpoConsulta, casaToken) {
  const variantes = [
    { nome: 'header api-key', headers: { 'api-key': casaToken } },
    { nome: 'header api_key', headers: { 'api_key': casaToken } },
    { nome: 'header Authorization Bearer', headers: { Authorization: 'Bearer ' + casaToken } },
    { nome: 'header x-api-key', headers: { 'x-api-key': casaToken } }
  ];
  for (const v of variantes) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(CASA_URL, {
        method: 'POST', signal: ctrl.signal,
        headers: Object.assign({ 'Content-Type': 'application/json' }, v.headers),
        body: corpoConsulta
      });
      clearTimeout(timer);
      const texto = await r.text();
      let j = null;
      try { j = JSON.parse(texto); } catch (e) { j = null; }
      if (r.ok) return { ok: true, json: j || {}, via: v.nome };
    } catch (e) { clearTimeout(timer); }
  }
  return { ok: false };
}

// Retorna também o detalhe por metaBairro (quando a cidade tiver), pra main() poder
// avisar se algum executivo específico não bateu os 30 mesmo esticando o teto.
async function buscarCidade(cidadeCfg, casaToken) {
  const { municipio, uf, objetivoMinimo, tetoMaximo, metaBairros } = cidadeCfg;
  const leadsCidade = [];
  let pagina = 1;

  function contagemPorMeta() {
    if (!metaBairros) return null;
    return metaBairros.map(m => ({
      nome: m.nome,
      minimo: m.minimo,
      encontrados: leadsCidade.filter(l => m.teste(semAcento(l.bairro))).length
    }));
  }
  function metasBatidas() {
    if (!metaBairros) return leadsCidade.length >= objetivoMinimo;
    return contagemPorMeta().every(m => m.encontrados >= m.minimo);
  }

  while (leadsCidade.length < tetoMaximo && pagina <= MAX_PAGINAS_POR_CIDADE && !metasBatidas()) {
    const corpoConsulta = JSON.stringify({
      codigo_atividade_principal: CNAE_FOODSERVICE,
      situacao_cadastral: ['ATIVA'],
      uf: [uf.toLowerCase()],
      municipio: [municipio.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')],
      data_abertura: { inicio: isoDiasAtras(JANELA_DIAS), fim: isoDiasAtras(DIAS_MINIMO_ABERTURA) },
      mei: { excluir_optante: true },
      mais_filtros: { com_telefone: true, excluir_email_contab: true },
      limite: TAMANHO_PAGINA_API,
      pagina
    });
    const resp = await autenticarECconsultar(corpoConsulta, casaToken);
    if (!resp.ok) {
      console.log(`[backfill-casa-dos-dados] ${municipio}/${uf}: falha de autenticação/rede na página ${pagina}.`);
      break;
    }
    const cru = (resp.json && (resp.json.cnpjs || resp.json.results || (Array.isArray(resp.json.data) ? resp.json.data : null))) || [];
    if (!Array.isArray(cru) || cru.length === 0) break; // acabaram os resultados dessa cidade

    cru.forEach(raw => {
      const item = normalizar(raw);
      if (!item) return;
      if (ehRedeGrande(item.nome) || ehRedeGrande(item.razaoSocial)) return;
      if (ehPessoaFisica(item)) return;
      if (ehForaDeFoodservice(item.nome)) return;
      leadsCidade.push(item);
    });

    if (cru.length < TAMANHO_PAGINA_API) break; // última página da Casa dos Dados pra essa cidade
    pagina++;
  }
  const leadsFinais = leadsCidade.slice(0, tetoMaximo);
  // Geocodifica em série (não em paralelo) pra não estourar rate-limit da MapTiler —
  // uma cidade tem no máximo `tetoMaximo` leads (150-400), então isso soma no máximo
  // alguns minutos a mais na rodada semanal, tempo que sobra de sabra no cron.
  const maptilerKey = (() => { try { return require('../data/maptiler-config.json').key; } catch (e) { return null; } })();
  for (let i = 0; i < leadsFinais.length; i++) {
    leadsFinais[i] = await geocodificarEnderecoReal(leadsFinais[i], maptilerKey);
  }
  return { leads: leadsFinais, porMeta: contagemPorMeta() };
}

async function importarLote(leadsCidade, importSecret) {
  if (leadsCidade.length === 0) return { inseridos: 0, duplicados: 0 };
  const resp = await fetch(`${COCKPIT_URL}/api/importar-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-import-secret': importSecret },
    body: JSON.stringify({ fonte: 'casa_dos_dados', leads: leadsCidade })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.log('[backfill-casa-dos-dados] Importação recusada:', data.erro || resp.status);
    // Repassa o diagnóstico do endpoint (presença/tamanho/trim do segredo — nunca o
    // valor). Sem isto, "recusado" não distingue variável ausente de valor diferente.
    if (data.diagnosticoSegredo) console.log('[backfill-casa-dos-dados] Diagnóstico do segredo:', JSON.stringify(data.diagnosticoSegredo));
    return { inseridos: 0, duplicados: 0, erro: data.erro || String(resp.status) };
  }
  return data;
}

const fs = require('fs');

async function main() {
  const casaToken = process.env.CASADOSDADOS_TOKEN;
  const importSecret = process.env.IMPORT_SECRET;
  if (!casaToken) {
    console.log('[backfill-casa-dos-dados] Falta CASADOSDADOS_TOKEN — nada rodado.');
    process.exit(1);
  }
  // MODO FALLBACK (16/08/26): enquanto o IMPORT_SECRET não estiver ativo na Vercel
  // (precisa de redeploy, e o teto de 100 deploys/dia da Vercel travou isso hoje),
  // o script ainda busca tudo normalmente, mas em vez de chamar /api/importar-leads
  // (que recusaria sem o segredo), grava um JSON pra importação manual pelo modal
  // "colar/anexar JSON" do Cockpit (gestor, autenticado pela própria sessão — não
  // depende do IMPORT_SECRET de jeito nenhum). Assim que o IMPORT_SECRET entrar em
  // vigor na Vercel, este script volta a importar sozinho automaticamente.
  const modoManual = !importSecret;
  if (modoManual) {
    console.log('[backfill-casa-dos-dados] IMPORT_SECRET ausente — rodando em MODO MANUAL: vai gravar um JSON pra importar pelo modal do Cockpit em vez de importar sozinho.');
  }

  /* ── PULAR CIDADE NESTA RODADA (01/09/26) ──────────────────────────────────────────
     Pedido: "coloque outra lista de casa dos dados para os executivos online, menos a
     Amanda". A Amanda cobre Vitória, e a lista CIDADES acima mapeia cidade→executivo.

     Por que PARÂMETRO e não remoção da linha: "menos a Amanda" é o estado de hoje, não
     uma regra do produto. Apagar Vitória do array faria a próxima rodada automática (o
     cron de domingo) deixar a praça dela sem backlog para sempre, silenciosamente — e
     ninguém iria lembrar de recolocar. Com o parâmetro, o padrão continua sendo TODAS as
     cidades, e pular é uma escolha explícita de quem dispara, registrada no log.

     Casa sem acento e sem caixa, porque quem digita no botão do workflow vai escrever
     "vitoria" tanto quanto "Vitória". */
  const semAcento = t => String(t || '').normalize('NFD')
    .replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
    .toLowerCase().trim();
  const pularPedido = String(process.env.PULAR_CIDADES || '').split(',').map(semAcento).filter(Boolean);
  const cidadesDaRodada = CIDADES.filter(c => !pularPedido.includes(semAcento(c.municipio)));
  if (pularPedido.length) {
    const puladas = CIDADES.filter(c => pularPedido.includes(semAcento(c.municipio))).map(c => c.municipio + '/' + c.uf);
    const naoAchadas = pularPedido.filter(p => !CIDADES.some(c => semAcento(c.municipio) === p));
    console.log('[backfill-casa-dos-dados] PULANDO nesta rodada: ' + (puladas.join(', ') || '(nenhuma)'));
    /* pedido que não casa com cidade nenhuma é erro de digitação, e erro de digitação
       aqui significa importar para quem não devia — melhor parar do que adivinhar. */
    if (naoAchadas.length) {
      console.error('[backfill-casa-dos-dados] PULAR_CIDADES tem nome que não existe na lista: ' + naoAchadas.join(', '));
      console.error('  cidades conhecidas: ' + CIDADES.map(c => c.municipio).join(', '));
      process.exit(1);
    }
    if (!cidadesDaRodada.length) {
      console.error('[backfill-casa-dos-dados] todas as cidades foram puladas — nada a fazer.');
      process.exit(1);
    }
  }

  let totalInseridos = 0, totalDuplicados = 0;
  const porCidade = {};
  const todosOsLeads = [];
  // Cidades cujo POST foi RECUSADO pelo endpoint (não é o mesmo que "nada novo pra
  // inserir"). Sem esta lista, recusa em todas as cidades fechava a execução em verde.
  const recusadas = [];
  let totalEncontrados = 0;
  for (const cidadeCfg of cidadesDaRodada) {
    const { municipio, uf } = cidadeCfg;
    console.log(`[backfill-casa-dos-dados] Buscando ${municipio}/${uf}… (objetivo mínimo: ${cidadeCfg.objetivoMinimo})`);
    const { leads: leadsCidade, porMeta } = await buscarCidade(cidadeCfg, casaToken);
    console.log(`[backfill-casa-dos-dados] ${municipio}/${uf}: ${leadsCidade.length} contas após filtro (rede grande e pessoa física fora).`);
    if (porMeta) {
      porMeta.forEach(m => {
        const ok = m.encontrados >= m.minimo;
        console.log(`[backfill-casa-dos-dados]   ${ok ? '✅' : '⚠️ ABAIXO DA META'} ${m.nome}: ${m.encontrados}/${m.minimo}`);
      });
    }
    if (modoManual) {
      todosOsLeads.push(...leadsCidade);
      porCidade[`${municipio}/${uf}`] = { encontrados: leadsCidade.length, porMeta: porMeta || undefined };
    } else {
      const resultado = await importarLote(leadsCidade, importSecret);
      porCidade[`${municipio}/${uf}`] = { encontrados: leadsCidade.length, inseridos: resultado.inseridos || 0, duplicados: resultado.duplicados || 0, recusado: resultado.erro || undefined, porMeta: porMeta || undefined };
      totalInseridos += resultado.inseridos || 0;
      totalDuplicados += resultado.duplicados || 0;
      totalEncontrados += leadsCidade.length;
      if (resultado.erro) recusadas.push({ cidade: `${municipio}/${uf}`, encontrados: leadsCidade.length, erro: resultado.erro });
    }
  }

  console.log('[backfill-casa-dos-dados] Resumo final:', JSON.stringify(porCidade, null, 2));

  if (modoManual) {
    const saida = { fonte: 'casa_dos_dados', leads: todosOsLeads };
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/leads-casa-dos-dados.json', JSON.stringify(saida, null, 2));
    console.log(`[backfill-casa-dos-dados] ${todosOsLeads.length} conta(s) gravadas em artifacts/leads-casa-dos-dados.json — baixe o artifact desta execução e cole o conteúdo no modal "Importar contas" (aba colar/anexar JSON) do Cockpit.`);

    /* MODO MANUAL PASSA A FALHAR A EXECUÇÃO (28/08/26).
       O fallback foi escrito em 16/08 como ponte temporária: "assim que o IMPORT_SECRET
       entrar em vigor na Vercel, este script volta a importar sozinho". Passaram 12 dias
       e ninguém configurou — e o Action fechava em VERDE toda semana, porque tinha
       encontrado as contas e gravado o artefato.

       O que isso produziu, medido: a rodada de 24/08 encontrou 400+ contas no Rio, 39 em
       Vila Velha, 38 em Vitória, com todas as cotas por executivo batidas — e o banco
       registra ZERO linhas criadas nos últimos 7 dias. Ninguém baixa artefato. A fila de
       Prospecção ficou congelada desde 16/08, e o Julyan chegou a dizer "nem eu e os
       executivos estamos usando" — não havia nada novo para usar.

       Verde escondendo no-op é pior que vermelho: vermelho é visto. O artefato continua
       sendo publicado (a etapa de upload usa `if: always()`), então nada se perde — só o
       resultado da execução passa a dizer a verdade.

       Sai daqui sozinho no momento em que o IMPORT_SECRET existir nos dois lados. */
    const aviso = `${todosOsLeads.length} contas-alvo encontradas e NENHUMA importada: IMPORT_SECRET não está configurado.`;
    console.log(`::warning title=Prospecção não foi atualizada::${aviso}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
          '## ⚠️ A fila de Prospecção NÃO foi atualizada',
          '',
          `Encontradas **${todosOsLeads.length} contas-alvo**. Importadas: **0**.`,
          '',
          'O script não tem `IMPORT_SECRET`, então não pode chamar `api/importar-leads.js`',
          'e caiu no modo manual — gravou o JSON como artefato desta execução.',
          '',
          '**Para voltar a importar sozinho, os dois lados precisam do mesmo segredo:**',
          '',
          '1. GitHub → Settings → Secrets and variables → Actions → `IMPORT_SECRET`',
          '2. Vercel → Settings → Environment Variables → `IMPORT_SECRET` (e redeploy)',
          '',
          'Enquanto isso, dá pra importar à mão: baixe o artefato `leads-casa-dos-dados`',
          'e cole o conteúdo no modal "Importar contas" do Cockpit (aba colar/anexar JSON).',
          ''
        ].join('\n'));
      } catch (e) { /* resumo é bônus; não pode derrubar o relatório */ }
    }
    console.log('[backfill-casa-dos-dados] Encerrando com falha DE PROPÓSITO: a execução não cumpriu o que existe pra fazer.');
    process.exit(1);
  } else {
    console.log(`[backfill-casa-dos-dados] Total: ${totalInseridos} contas novas, ${totalDuplicados} já existentes (mescladas).`);

    /* FALHA QUANDO O ENDPOINT RECUSA (28/08/26 — lacuna do meu próprio conserto).
       A passagem anterior fez o MODO MANUAL falhar alto, mas deixou passar o caso
       em que o segredo existe no GitHub, o POST é feito, e o endpoint recusa: a
       execução somava inseridos=0 em todas as cidades e fechava em VERDE.

       Aconteceu ao vivo na primeira execução com o segredo configurado: as 7 cidades
       responderam "Sem sessão e sem segredo de importação válido" (segredo ausente ou
       diferente do lado da Vercel, ou faltando o redeploy) e o Action deu success.

       Recusa é diferente de "nada novo": recusa é 0 inserido E 0 duplicado com contas
       encontradas. Quando tudo está certo e não há nada novo, `duplicados` sobe. */
    if (recusadas.length > 0) {
      const aviso = `${recusadas.length} cidade(s) recusadas pelo endpoint. ${totalEncontrados} contas encontradas, ${totalInseridos} importadas.`;
      console.log(`::error title=Importação recusada::${aviso}`);
      console.log('[backfill-casa-dos-dados] Recusas:', JSON.stringify(recusadas, null, 2));
      if (process.env.GITHUB_STEP_SUMMARY) {
        try {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
            '## ❌ O endpoint recusou a importação',
            '',
            `Encontradas **${totalEncontrados}** contas. Importadas: **${totalInseridos}**.`,
            '',
            `Motivo devolvido: \`${recusadas[0].erro}\``,
            '',
            'O segredo chegou daqui (o GitHub o injetou no ambiente), então a diferença',
            'está do outro lado. Confira, na Vercel:',
            '',
            '1. `IMPORT_SECRET` existe em Settings → Environment Variables?',
            '2. O valor é **idêntico** ao do GitHub?',
            '3. Houve **redeploy** depois de criar a variável? (env var nova só vale no deploy seguinte)',
            ''
          ].join('\n'));
        } catch (e) { /* resumo é bônus */ }
      }
      process.exit(1);
    }
  }
}

/* ── QUEM CHAMA ESTE ARQUIVO (06/09/26) ─────────────────────────────────────────
   Como PROGRAMA (o cron de segunda, e o disparo manual do workflow): roda a rodada
   inteira, todas as cidades. Como MODULO (api/buscar-leads.js, quando o gestor aperta
   o botao na aba Rotas): nao roda nada sozinho — quem chama escolhe a cidade.
   Sem esta guarda, um require aqui dispararia a varredura completa dentro de uma
   requisicao HTTP. */
if (require.main === module) {
  main().catch(e => {
    console.log('[backfill-casa-dos-dados] Falha geral:', e.message || e);
    process.exit(1);
  });
}

/* As pecas que a rota sob demanda reusa. Nada aqui e reimplementado do outro lado:
   busca, normalizacao, filtro de foodservice e o envio para /api/importar-leads sao
   ESTES, os mesmos que rodam toda segunda. */
module.exports = {
  CIDADES,
  buscarCidade,
  importarLote,
  normalizar,
  ehRedeGrande,
  ehPessoaFisica,
  ehForaDeFoodservice
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

// ambiente = { process, json(caminho), externo(nome) }
export function carregador(ambiente) {
  const cache = Object.create(null);
  function requireDe(de) {
    return function (spec) {
      if (!spec.startsWith('.')) return ambiente.externo(spec);
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
