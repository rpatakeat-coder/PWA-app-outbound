// Bônus de parceiro que o executivo oferece ao cliente no fechamento
// (propriedade `bonus_escolhido` do negócio, múltipla escolha no HubSpot).
//
// Uma lista só para as duas folhas do app que mandam o negócio para
// Onboarding: o modal antigo (src/constants/stages.ts) e a folha "Mudar
// etapa" do mapa novo (src/utils/fichaDeRua.ts). No HubSpot o valor de cada
// opção é igual ao rótulo, e é o valor que vai na gravação.
//
// As opções NÃO estão na tabela stage_property_options (conferido em
// 18/11/2026) — quem a preenche é um processo fora deste repositório. Esta
// lista foi copiada do HubSpot no mesmo dia; parceiro novo cadastrado lá só
// aparece no app depois de entrar aqui. Fora, de propósito: "TESTE -
// Guilherme", marcada como DESATIVADO no HubSpot.
export const BONUS_PARCEIRO: readonly string[] = [
  'Foozi',
  'DDR',
  'Falaê',
  'Hub dos Restaurantes',
  'IMB Gastronômico (Igor Barreto) — Mentoria 2h + 50% desconto consultoria',
  'All In / Venda+ Delivery (Levi Xavier) — Treinamento IA no iFood',
  'Rodrigo Souza Consultoria — Consultoria Empresarial',
  'Movendo (Douglas Carboneri) — Diagnóstico de custo de vendas 99Food/iFood',
  'Portal Donos de Restaurantes (Marcelo Marani) — 1 ano de acesso gratuito',
  'Lucro à Mesa (João Jabur) — Diagnóstico Financeiro',
  'Ainda Não Decidiu',
  'Léo Esteves Consultoria (Léo Esteves) — Diagnóstico 360º de CMV',
  'Vend Mais Food Lab (Gabriel Torres) — Análise de cardápio no iFood',
  'Adriana Rios Consultoria (Adriana Rios) — Consultoria estratégica de negócio (2h)',
  'Dias Gastronomia (Fabiano Dias) — Cliente oculto (RJ) ou reunião diagnóstico (Brasil)',
  'Food Advisory (Flávia Funayama) — Análise presencial da operação (RT e assessoria)',
  'Park 38 Smash Burger (Ramon Andrade) — Mentoria de cardápio e autoridade',
  'Consultoria Restaurante Diamante (Tiago Hungria) — 1 mês de consultoria de delivery',
  'Maré Hub Restaurantes (Flávio Góes) — Diagnóstico de marketing, vendas e sistemas',
  'Guardião do CMV e Estoque (Alessandro Brito) — Diagnóstico gratuito de CMV e estoque',
  'Avance Consultoria (Manoela Carniel) — Diagnóstico de CMV e precificação',
  'CP1 (Lucas Assaff) — Consultoria financeira',
  'Doces e Salgados um Grande Negócio (Abner da Silva) — Curso Fábrica de Salgados Lucrativa (vitalício)',
  'Gerenciando Docerias (João Víctor Lopes) — Diagnóstico situacional da confeitaria',
  'Nicolle Regina Consultoria (Nicolle Regina) — Consultoria de cardápio especial',
  'Mercosul (Thiago Miguel) — 10% de desconto em equipamentos',
  'Trezze Contabilidade (Fernanda Fernandes) — Mentoria de 1h sobre reforma tributária',
  'Cadê O Delivery? (Cleber Melo) — 1 mês de assessoria (pizzarias/esfiharias)',
  'Saltear Marketing (Lucas Freire) — Análise estratégica 45min',
  'Impulso Digital (Éder Ovídio) — Diagnóstico + Metodologia 60 dias',
  'Agência DKS (Daniel Soares) — ROMA + setup zerado + 1 mês grátis',
  'Mesa7 (Lucas Leite) — Análise + otimização Google Meu Negócio',
  'ProLeads Company (Willams Filho) — Diagnóstico ScorePRO',
  'Virtuz (Caio Estrella) — Consultoria Marketplace iFood/99Food',
  'Agência Quirk (Gabriel Vieira) — Diagnóstico Estratégico 30 dias',
  'Norte Assessoria (Andrew Favacho) — Bônus 01: Consultoria rápida de cardápio digital (para clientes que faturam a partir de R$50k/mês)',
  'Norte Assessoria (Andrew Favacho) — Bônus 02: Cardápio estruturado, publicado em 5 dias (para clientes que faturam a partir de R$100k/mês)',
  'Norte Assessoria (Andrew Favacho) — Bônus 03: 1 mês de Assessoria Norte — tráfego pago (para clientes que faturam a partir de R$200k/mês)',
  'Strategi (Felipe Rocha) — Atração de clientes pelo Google',
  'Bear Hunter (Bruno) — 1 mês de assessoria de marketing',
  'Escala Food (Rafael Ramos) — Consultoria de delivery e canal próprio',
  'Youmatter Marketing Food (Bruno Bettelli) — 50% na 1ª mensalidade ou consultoria',
  'Vértice Growth (Emerson Lima) — Raio-X Pedido Local (aquisição e conversão)',
  'SRO (Júnior) — iFood 360',
  'Astrine Food Marketing (Débora Sagradim) — Análise gratuita de posicionamento digital',
  'Cliente não quis o bônus',
];
