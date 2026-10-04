// @ts-nocheck — CÓPIA LITERAL do motor da Calculadora de Planos do Cockpit
// (cockpit-unificado/template/cockpit.template.html, entre PC9-MOTOR-INICIO e PC9-MOTOR-FIM).
// Um app só, PR 4 (04/10/2026): a Proposta no negócio usa o MESMO cálculo do Cockpit. Não
// edite à mão: se o motor mudar lá, copie o bloco de novo (o teste calculadoraPlanos.teste.ts
// compara este arquivo com o do Cockpit). Os preços vêm do banco (pricing_config), nunca daqui.
/* PC9-MOTOR-INICIO */
const PC9_TIPO_DELIVERY = 'delivery';
const PC9_TIER_INICIAL = 'profissional';
function pc9Arred(v) { return Math.round(v); }
function pc9BRL(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
function pc9EstadoInicial(config) {
  const tipoPlano = Object.keys(config.planos)[0];
  const tiers = config.planos[tipoPlano].tiers;
  return {
    tipoPlano: tipoPlano,
    tier: tiers.some(function (t) { return t.id === PC9_TIER_INICIAL; }) ? PC9_TIER_INICIAL : (tiers[0] && tiers[0].id),
    periodicidade: config.periodicidades[0] && config.periodicidades[0].id,
    adicionaisAtivos: {},
    quantidades: {}
  };
}
function pc9TierValido(config, tipoPlano, tier) {
  const tiers = (config.planos[tipoPlano] && config.planos[tipoPlano].tiers) || [];
  return tiers.some(function (t) { return t.id === tier; }) ? tier : (tiers[0] && tiers[0].id);
}
function pc9QuantidadeDe(ad, quantidades) {
  quantidades = quantidades || {};
  if (!ad.perUnit) return 1;
  return Math.max(ad.minUnits || 1, parseInt(quantidades[ad.id], 10) || ad.minUnits || 1);
}
function pc9SituacaoDoAdicional(ad, s) {
  const tier = s.tier, tipoPlano = s.tipoPlano, ativos = s.adicionaisAtivos || {};
  const incluso = (ad.includedIn || []).indexOf(tier) >= 0;
  const disponivel = (ad.availableFor || []).indexOf(tier) >= 0;
  const bloqueado = Boolean(ad.deliveryBlocked) && tipoPlano === PC9_TIPO_DELIVERY;
  const marcado = Boolean(ativos[ad.id]);
  return { incluso: incluso, disponivel: disponivel, bloqueado: bloqueado, marcado: marcado,
    cobravel: marcado && !incluso && disponivel && !bloqueado };
}
function pc9PrecoComDesconto(preco, periodo) {
  return pc9Arred(preco * (1 - ((periodo && periodo.discount) || 0)));
}
function pc9Calcular(config, estado) {
  const tipoPlano = estado.tipoPlano, ativos = estado.adicionaisAtivos || {}, quantidades = estado.quantidades || {};
  const plano = config.planos[tipoPlano];
  const tier = pc9TierValido(config, tipoPlano, estado.tier);
  const tierData = plano.tiers.find(function (t) { return t.id === tier; });
  const periodo = config.periodicidades.find(function (p) { return p.id === estado.periodicidade; }) || config.periodicidades[0];
  const meses = periodo.months || 1;
  const basePrice = Number(tierData.price) || 0;
  const planMonthly = pc9PrecoComDesconto(basePrice, periodo);
  const adicionaisDetail = [];
  let adicionaisTotal = 0, adicionaisCheio = 0;
  config.adicionais.forEach(function (ad) {
    const s = pc9SituacaoDoAdicional(ad, { tier: tier, tipoPlano: tipoPlano, adicionaisAtivos: ativos });
    if (s.incluso) { adicionaisDetail.push(Object.assign({}, ad, { included: true, qty: 0, unitario: 0, monthly: 0 })); return; }
    if (!s.cobravel) return;
    const qty = pc9QuantidadeDe(ad, quantidades);
    const unitario = pc9PrecoComDesconto(ad.price, periodo);
    const monthly = unitario * qty;
    adicionaisTotal += monthly;
    adicionaisCheio += (Number(ad.price) || 0) * qty;
    adicionaisDetail.push(Object.assign({}, ad, { included: false, qty: qty, unitario: unitario, monthly: monthly }));
  });
  const totalMonthly = planMonthly + adicionaisTotal;
  const totalContract = totalMonthly * meses;
  const fullMonthly = basePrice + adicionaisCheio;
  const economia = (fullMonthly - totalMonthly) * meses;
  return { plano: plano, tier: tier, tierData: tierData, periodo: periodo, basePrice: basePrice, planMonthly: planMonthly,
    adicionaisDetail: adicionaisDetail, adicionaisTotal: adicionaisTotal, totalMonthly: totalMonthly,
    totalContract: totalContract, fullMonthly: fullMonthly, economia: economia };
}
function pc9FuncionalidadesDoPlano(funcionalidades, s) {
  const secoes = [];
  let atual = null;
  (funcionalidades || []).forEach(function (f) {
    if (f.section) { atual = { title: f.section, items: [] }; secoes.push(atual); }
    else if (atual && f.tiers && f.tiers[s.tier] && !(s.tipoPlano === PC9_TIPO_DELIVERY && f.excludeDelivery)) atual.items.push(f.name);
  });
  return secoes.filter(function (x) { return x.items.length > 0; });
}
function pc9DividirEmColunas(secoes) {
  const esquerda = [], direita = [];
  let pesoE = 0, pesoD = 0;
  secoes.forEach(function (s) {
    const peso = s.items.length + 1;
    if (pesoE <= pesoD) { esquerda.push(s); pesoE += peso; } else { direita.push(s); pesoD += peso; }
  });
  return [esquerda, direita];
}
function pc9Alertas(config, estado) {
  const tipoPlano = estado.tipoPlano, ativos = estado.adicionaisAtivos || {};
  const tier = pc9TierValido(config, tipoPlano, estado.tier);
  const tiers = config.planos[tipoPlano].tiers;
  const idx = tiers.findIndex(function (t) { return t.id === tier; });
  const lista = [];
  config.adicionais.forEach(function (ad) {
    const s = pc9SituacaoDoAdicional(ad, { tier: tier, tipoPlano: tipoPlano, adicionaisAtivos: ativos });
    if (!s.marcado || s.incluso) return;
    if (s.bloqueado) { lista.push({ type: 'blocked', adicional: ad.id, message: ad.name + ' não se aplica a operações delivery-only.' }); return; }
    if (!s.disponivel) { lista.push({ type: 'indisponivel', adicional: ad.id, message: ad.name + ' não está disponível no plano ' + (tiers[idx] && tiers[idx].name) + '.' }); return; }
    if (ad.blockedUpgrade && ad.blockedUpgrade === tier) {
      const alvo = tiers.slice(idx + 1).find(function (t) { return (ad.includedIn || []).indexOf(t.id) >= 0; });
      if (alvo) {
        const atuais = new Set([].concat.apply([], pc9FuncionalidadesDoPlano(config.funcionalidades, { tier: tier, tipoPlano: tipoPlano }).map(function (x) { return x.items; })));
        const extras = [].concat.apply([], pc9FuncionalidadesDoPlano(config.funcionalidades, { tier: alvo.id, tipoPlano: tipoPlano }).map(function (x) { return x.items; }))
          .filter(function (n) { return !atuais.has(n); }).slice(0, 6);
        const diff = (Number(alvo.price) || 0) - (Number(tiers[idx].price) || 0);
        lista.push({ type: 'upgrade', adicional: ad.id,
          message: 'Não vender ' + ad.name + ' isolada no ' + tiers[idx].name + '. Por +' + pc9BRL(diff) + '/mês, o cliente leva '
            + alvo.name + (extras.length ? ' com ' + extras.join(', ') : '') + '.' });
      }
    }
  });
  return lista;
}
function pc9TextoDoInvestimento(calculo) {
  const periodo = calculo.periodo;
  if (periodo.creditCard) {
    return { principal: periodo.months + 'x ' + pc9BRL(calculo.totalMonthly), detalhe: 'no cartão de crédito',
      total: 'Total: ' + pc9BRL(calculo.totalContract) };
  }
  return { principal: pc9BRL(calculo.totalMonthly) + '/mês', detalhe: null,
    total: periodo.months > 1 ? 'Total: ' + pc9BRL(calculo.totalContract) : null };
}
/* PC9-MOTOR-FIM */

export {
  PC9_TIPO_DELIVERY, PC9_TIER_INICIAL, pc9BRL, pc9EstadoInicial, pc9TierValido, pc9QuantidadeDe,
  pc9SituacaoDoAdicional, pc9PrecoComDesconto, pc9Calcular, pc9FuncionalidadesDoPlano, pc9Alertas, pc9TextoDoInvestimento,
};
