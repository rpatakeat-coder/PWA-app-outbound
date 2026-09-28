import { lerDeepLink, semDeepLink } from './deepLink';

let falhas = 0;
function igual(nome: string, veio: unknown, esperado: unknown) {
  const a = JSON.stringify(veio), b = JSON.stringify(esperado);
  if (a === b) console.log('ok  ', nome);
  else { falhas++; console.log('FALHA', nome, '— veio', a, 'esperava', b); }
}

igual('negócio pelo id do HubSpot abre o cartão', lerDeepLink('?pino=62606052382&cartao=aberto'),
  { cartaoAberto: true, pino: { dealId: '62606052382' } });
igual('sem "cartao", abre do mesmo jeito', lerDeepLink('?pino=62606052382')!.cartaoAberto, true);
igual('cartao=fechado só enquadra', lerDeepLink('?pino=62606052382&cartao=fechado')!.cartaoAberto, false);
igual('pino pelo uuid', lerDeepLink('?pino=0E1D2C3B-4A59-4687-9a8b-7c6d5e4f3a21')!.pino,
  { clientId: '0e1d2c3b-4a59-4687-9a8b-7c6d5e4f3a21' });
igual('pino com lixo é ignorado', lerDeepLink('?pino=1;drop'), null);
igual('rua', lerDeepLink('?rua=Rua%20das%20Flores'), { cartaoAberto: false, rua: 'Rua das Flores' });
igual('lente pelo nome do handoff', lerDeepLink('?lente=meu-dia')!.lente, 'dia');
igual('lente contas-alvo', lerDeepLink('?lente=contas-alvo')!.lente, 'alvo');
igual('lente desconhecida não vira nada', lerDeepLink('?lente=xyz'), null);
igual('sem deep link', lerDeepLink('?mapa=novo'), null);
igual('limpa só as chaves do link', semDeepLink('/mapa', '?mapa=novo&pino=1&cartao=aberto&lente=meu-dia', ''), '/?mapa=novo');
igual('sem sobras', semDeepLink('/', '?pino=1', '#x'), '/#x');

igual('link antigo do Cockpit abre o cartão do negócio', lerDeepLink('?acao=ligar&dealId=123&telefone=27999&origem=cockpit')!.pino, { dealId: '123' });
igual('e sai inteiro da barra', semDeepLink('/', '?acao=ligar&dealId=123&telefone=27999&origem=cockpit', ''), '/');

if (falhas) { console.log(falhas + ' falha(s)'); process.exit(1); }
console.log('deep link: todos ok');
