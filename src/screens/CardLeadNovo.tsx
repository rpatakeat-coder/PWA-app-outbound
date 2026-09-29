// Cartão do lead do app de campo v4.1 (handoff §6.3).
//
// Espiada: uma ação grande (Cheguei), três secundárias (Ligar/+ Telefone/É
// meu · Ir · Agendar) e "…". Meia: chips de sinal, alertas, o bloco NEGÓCIO,
// dono e origem, e a grade de "mais". As abas Histórico · Agenda · Dados
// continuam as do ClientBottomSheet (ficha cheia). Toda ação chama o MESMO
// handler que o card já usava.
import React from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Alert } from '../components/Alert';
import { Toast } from '../components/Toast';
import type { Client } from '../types/client';
import { ORIGEM, origemDoFiltro } from '../utils/lentes';
import { openGoogleMaps, type TravelMode } from '../utils/navigation';
import type { Pino } from '../utils/pinoP2';
import { distanciaTexto, fatosDoCard, sinaisDoCliente } from '../utils/cardNovo';
import { ETAPA, PROPS_OBRIGATORIAS_POR_ETAPA, ROTULO_ETAPA, ROTULO_PROP, pareceNomeDePessoa } from '../utils/fichaDeRua';

export { distanciaTexto };
import { openWhatsapp, toWhatsappNumber } from '../utils/whatsapp';

export type AcoesCardNovo = {
  onMarkVisited?: () => void;
  onChangeStage?: () => void;
  onScheduleMeeting?: () => void;
  onAddToRoute?: () => void;
  onDismissContaAlvo?: () => void;
  onEdit?: () => void;
  onClose: () => void;
  /** Peek → ficha completa (abas Histórico · Agenda · Dados). */
  onExpandir?: () => void;
  /** Alerta de cobrança: encerra a tarefa do HubSpot + registra a ligação. */
  onLiguei?: () => void;
  /** "É meu": assume o lead sem dono que está na rota de hoje (assumirLead). */
  onEMeu?: () => void;
  /** "Mover o pino": abre a edição de localização. */
  onMoverPino?: () => void;
  /** Botão de avanço do bloco NEGÓCIO: abre Mudar etapa já na etapa destino. */
  onAvancar?: (destino: string, preenchido?: Record<string, string>) => void;
};

export type DadosCardNovo = {
  client: Client;
  pino: Pino;
  planoNumero: number | null;
  naRota: boolean;
  visitadoHoje: boolean;
  distanciaM: number | null;
  responsavelNome: string | null;
  etapaRotulo: string | null;
  /** Código canônico da etapa (etapa_de_para / snapshot). */
  etapaCodigo?: string | null;
  isMarkingVisited: boolean;
  /** Mesma conta do alerta "Localização aproximada" do card. */
  aproximado?: boolean;
  /** Tarefa de cobrança (SLA) aberta no HubSpot para este lead — a MESMA da aba Tarefas. */
  cobranca?: { texto: string; assunto: string } | null;
};

const ROTULO_TEMP: Record<string, string> = { Q: 'LEAD QUENTE', M: 'LEAD MORNO', F: 'LEAD FRIO', X: 'PERDIDO', '?': 'ETAPA NÃO RECONHECIDA' };

function kicker(d: DadosCardNovo): string {
  const { pino, client } = d;
  const partes: string[] = [];
  if (pino.tipo === 'cliente') partes.push('CLIENTE TAKEAT');
  else if (pino.tipo === 'ex') partes.push('EX-CLIENTE');
  else if (pino.tipo === 'alvo') partes.push('CONTA-ALVO');
  else partes.push(ROTULO_TEMP[pino.temp ?? '?']);
  if (d.planoNumero) partes.push(`PLANO ${d.planoNumero}`);
  if (!partes.length) partes.push((client.status ?? '').toUpperCase());
  return `● ${partes.join(' · ')}`;
}

function subtitulo(c: Client): string | null {
  // Munição traz o endereço inteiro do Google ("Av. X, 488 - Bairro, Cidade -
  // RS, CEP, Brasil"): fica só "rua, número"; o bairro vem do campo próprio.
  const enderecoCurto = (c.endereco ?? '').split(' - ')[0].trim();
  const jaTemNumero = !!c.numero && enderecoCurto.includes(String(c.numero).trim());
  const rua = [enderecoCurto, jaTemNumero ? null : c.numero?.trim()].filter(Boolean).join(', ');
  const partes = [rua, c.bairro?.trim()].filter(Boolean);
  return partes.length ? partes.join(' · ') : c.cidade?.trim() || null;
}

const CHAVE_IR = 'takeat-mapa-ir';

function abrirPor(modo: 'walking' | 'driving' | 'waze', c: Client) {
  if (c.latitude == null || c.longitude == null) return;
  try { window.localStorage.setItem(CHAVE_IR, modo); } catch { /* sem storage: só não lembra */ }
  if (modo === 'waze') {
    Linking.openURL(`https://waze.com/ul?ll=${c.latitude},${c.longitude}&navigate=yes`);
    return;
  }
  openGoogleMaps({ latitude: c.latitude, longitude: c.longitude, clientName: c.empresa?.trim() || c.nome, travelMode: modo as TravelMode });
}

/** `Ir`: pergunta a pé / carro / Waze e lembra a escolha (o peek do mapa usa direto). */
export function ir(c: Client, perguntar = true) {
  let ultima: string | null = null;
  try { ultima = window.localStorage.getItem(CHAVE_IR); } catch { /* idem */ }
  if (!perguntar && (ultima === 'walking' || ultima === 'driving' || ultima === 'waze')) {
    abrirPor(ultima, c);
    return;
  }
  Alert.alert('Ir até o lead', undefined, [
    { text: 'A pé · Google Maps', onPress: () => abrirPor('walking', c) },
    { text: 'Carro · Google Maps', onPress: () => abrirPor('driving', c) },
    { text: 'Waze', onPress: () => abrirPor('waze', c) },
    { text: 'Cancelar', style: 'cancel' },
  ]);
}

function naoVale(d: DadosCardNovo, a: AcoesCardNovo) {
  const alvo = d.pino.tipo === 'alvo' && !!a.onDismissContaAlvo;
  // Conta-alvo sai do mapa na hora (o descarte que já existe); lead com
  // negócio vai para a etapa Perdido pelo modal de etapa, que pede o motivo.
  const acao = alvo ? a.onDismissContaAlvo : a.onChangeStage;
  if (!acao) return;
  const texto = alvo ? 'Ela some do mapa e não é sugerida de novo.' : 'Abre a mudança de etapa já em Perdido, com o motivo escrito.';
  // D5 (handoff v6): o motivo escolhido não se perde mais. Lead com negócio abre Mudar
  // etapa já em Perdido, com "Outros" e o motivo no texto (os valores do HubSpot não mudam).
  const porMotivo = (motivo: string) => () => {
    if (!alvo && a.onAvancar) a.onAvancar('1396006164', { motivo_do_perdido: 'Outros', observacao__desqualificado: motivo });
    else acao();
  };
  Alert.alert('Não vale?', texto, [
    { text: 'Fechou', onPress: porMotivo('Fechou') },
    { text: 'Fora do perfil', onPress: porMotivo('Fora do perfil') },
    { text: 'Já é cliente', onPress: porMotivo('Já é cliente') },
    { text: 'Cancelar', style: 'cancel' },
  ]);
}

function ligar(c: Client) {
  const n = (c.telefone ?? '').replace(/\D/g, '');
  if (n) Linking.openURL(`tel:${n}`);
}

function Botao({ rotulo, onPress, estilo, texto, desabilitado, tracejado, acessivel }: {
  rotulo: string; onPress?: () => void; estilo?: object; texto?: object; desabilitado?: boolean; tracejado?: boolean; acessivel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={acessivel ?? rotulo}
      accessibilityState={{ disabled: !!desabilitado || !onPress }}
      disabled={desabilitado || !onPress}
      onPress={onPress}
      style={({ pressed }) => [s.botao, estilo, tracejado && s.tracejado, (desabilitado || !onPress) && s.desabilitado, pressed && { opacity: 0.8 }]}
    >
      <Text style={[s.botaoTexto, texto]} numberOfLines={1}>{rotulo}</Text>
    </Pressable>
  );
}

function BotaoCheguei({ d, a }: { d: DadosCardNovo; a: AcoesCardNovo }) {
  // Visitado hoje: o toque abre o registro direto, sem outro check-in.
  const sub = d.visitadoHoje ? 'visitado hoje · não vira segunda visita' : 'abre o registro da visita';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cheguei: fazer check-in"
      disabled={!a.onMarkVisited || d.isMarkingVisited}
      onPress={a.onMarkVisited}
      style={({ pressed }) => [s.cheguei, (!a.onMarkVisited || d.isMarkingVisited) && s.desabilitado, pressed && { opacity: 0.85 }]}
    >
      {d.isMarkingVisited ? <ActivityIndicator color="#fff" /> : (
        <>
          <Text style={s.chegueiTexto}>{d.visitadoHoje ? 'Registrar de novo' : 'Cheguei'}</Text>
          {!!sub && <Text style={s.chegueiSub}>{sub}</Text>}
        </>
      )}
    </Pressable>
  );
}

function Cabecalho({ d, a, compacto }: { d: DadosCardNovo; a: AcoesCardNovo; compacto: boolean }) {
  const cadastrado = d.client.empresa?.trim() || d.client.nome || 'Sem nome';
  const endereco = subtitulo(d.client);
  // Prancha §7.2: nome de pessoa ("Amanda") não diz qual é o lugar. O endereço
  // vira o título e o nome cadastrado fica na linha de baixo, com Corrigir.
  const ehPessoa = pareceNomeDePessoa(cadastrado) && !!endereco;
  const nome = ehPessoa ? endereco! : cadastrado;
  const posicao = (d.aproximado ?? d.client.geo_approximate) ? '≈ posição aproximada' : 'posição exata';
  const sub = ehPessoa
    ? `cadastrado como "${cadastrado}"`
    : [endereco, distanciaTexto(d.distanciaM), posicao].filter(Boolean).join(' · ');
  return (
    <View style={s.cabecalho}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={compacto && a.onExpandir ? 'Abrir ficha completa' : undefined}
        disabled={!compacto || !a.onExpandir}
        onPress={a.onExpandir}
        style={{ flex: 1, minWidth: 0 }}
      >
        <Text style={[s.kicker, { color: d.pino.cor }]} numberOfLines={1}>{kicker(d)}</Text>
        <Text style={[s.titulo, nome.length > 40 && s.tituloLongo]} numberOfLines={compacto ? 1 : 2}>{nome}</Text>
        <Text style={[s.sub, !sub && s.vazio]} numberOfLines={2}>{sub || 'endereço não informado'}</Text>
      </Pressable>
      {ehPessoa && !compacto && a.onEdit && (
        <Pressable accessibilityRole="button" accessibilityLabel="Corrigir o nome do lugar" onPress={a.onEdit} style={s.corrigir}>
          <Text style={s.corrigirTexto}>Corrigir</Text>
        </Pressable>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={a.onClose} style={s.fechar}>
        <Text style={s.fecharTexto}>✕</Text>
      </Pressable>
    </View>
  );
}

function Fatos({ d }: { d: DadosCardNovo }) {
  // Distância e posição já estão no subtítulo; aqui ficam os sinais.
  const sinais = fatosDoCard(d).filter((f) => !f.texto.startsWith('≈') && f.texto !== 'posição exata' && f.texto !== distanciaTexto(d.distanciaM));
  if (!sinais.length) return null;
  return (
    <View style={s.fatos}>
      {sinais.map((f) => (
        <View key={f.texto} style={[s.fato, f.aviso && s.fatoAviso]}>
          <Text style={[s.fatoTexto, f.aviso && s.fatoAvisoTexto]} numberOfLines={1}>{f.texto}</Text>
        </View>
      ))}
    </View>
  );
}

// Cliente e ex-cliente: situação, comandas, última comanda e queda, já na espiada
// (Julyan 27/09). Verde = ativo, vermelho = atenção, rosa = ex-cliente.
const TOM_CLIENTE = {
  ok: { fundo: 'var(--tint-green)', tinta: 'var(--tint-green-text)' }, // A2: funcionava só no escuro
  aviso: { fundo: 'var(--tint-red)', tinta: 'var(--tint-red-text)' },
  ex: { fundo: '#3B1230', tinta: '#F9A8D4' },
} as const;
function LinhaCliente({ d }: { d: DadosCardNovo }) {
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const sinais = sinaisDoCliente(d.client, d.pino, hoje);
  if (!sinais.length) return null;
  return (
    <View style={s.fatos}>
      {sinais.map((x) => {
        const t = x.tom ? TOM_CLIENTE[x.tom] : null;
        return (
          <View key={x.texto} style={[s.fato, t && { backgroundColor: t.fundo }]}>
            <Text style={[s.fatoTexto, t && { color: t.tinta }]} numberOfLines={1}>{x.texto}</Text>
          </View>
        );
      })}
    </View>
  );
}

function assumir(d: DadosCardNovo, a: AcoesCardNovo) {
  // fora da rota, quem pergunta e põe na rota é o App (assumirDoMapa)
  if (a.onEMeu) a.onEMeu();
}

function GradeEspiada({ d, a }: { d: DadosCardNovo; a: AcoesCardNovo }) {
  const c = d.client;
  const temTel = !!c.telefone?.trim();
  const podeAssumir = d.pino.dono === 'sem' && !!a.onEMeu;
  // LIGAR E WHATSAPP À MÃO (Julyan, 26/09): com telefone, uma fileira só de
  // contato, meia largura cada — "WhatsApp" não cabe legível em 64 px na
  // fileira de quatro. Sem telefone, "+ Telefone" fica na fileira de baixo.
  const zap = temTel ? toWhatsappNumber(c.telefone) : null;
  return (
    <View style={{ gap: 8 }}>
      {temTel && (
        <View style={s.grade}>
          <Botao rotulo="Ligar" onPress={() => ligar(c)} estilo={s.botao48} acessivel={`Ligar para ${c.telefone}`} />
          <Botao rotulo="WhatsApp" onPress={() => openWhatsapp(c.telefone, { clientId: c.id, dealId: c.id_hubspot ?? null })} desabilitado={!zap} estilo={[s.botao48, s.zapBotao]} texto={s.zapTexto} acessivel="Abrir conversa no WhatsApp" />
        </View>
      )}
      <View style={s.grade}>
        {podeAssumir
          ? <Botao rotulo="É meu" onPress={() => assumir(d, a)} estilo={[s.botao48, s.eMeuBotao]} texto={s.eMeuTexto} acessivel="É meu: colocar no meu funil" />
          : !temTel && <Botao rotulo="+ Telefone" onPress={a.onEdit} estilo={s.botao48} tracejado acessivel="Adicionar telefone" />}
        <Botao rotulo="Ir" onPress={() => ir(c)} desabilitado={c.latitude == null} estilo={s.botao48} />
        <Botao rotulo="Agendar" onPress={a.onScheduleMeeting} estilo={s.botao48} />
        {a.onExpandir && <Botao rotulo="…" onPress={a.onExpandir} estilo={[s.botao48, s.botaoMais]} acessivel="Mais: abrir o cartão" />}
      </View>
    </View>
  );
}

function GradeMais({ d, a }: { d: DadosCardNovo; a: AcoesCardNovo }) {
  const c = d.client;
  return (
    <View style={s.grade2}>
      {/* Ag. Pagamento: cobrança emitida, nada muda até o Pago (o servidor também recusa). */}
      {d.etapaCodigo === ETAPA.pagamento
        ? <Botao rotulo="Dados travados" desabilitado estilo={s.botaoMeia} acessivel="Dados travados: cobrança emitida, nada muda até o Pago" />
        : <Botao rotulo="Editar dados" onPress={a.onEdit} estilo={s.botaoMeia} />}
      <Botao
        rotulo={d.naRota ? '✓ Rota de hoje' : '+ Rota de hoje'}
        onPress={d.naRota ? () => Toast.mostrar('Já está na rota de hoje', 'ok') : a.onAddToRoute}
        estilo={[s.botaoMeia, d.naRota && s.naRota]}
        texto={d.naRota ? s.naRotaTexto : undefined}
        acessivel={d.naRota ? 'Já está na rota de hoje' : 'Adicionar à rota de hoje'}
      />
      <Botao rotulo="Mover o pino" onPress={a.onMoverPino} estilo={s.botaoMeia} />
      <Botao rotulo="Não vale" onPress={() => naoVale(d, a)} desabilitado={!(d.pino.tipo === 'alvo' ? a.onDismissContaAlvo : a.onChangeStage)} estilo={s.botaoMeia} texto={s.naoValeTexto} />
    </View>
  );
}

// Bloco NEGÓCIO (handoff §7.1): barra das 8 etapas, a etapa atual com uma nota,
// UM botão de avanço (que muda conforme a etapa) e "Outra etapa".
const FUNIL8 = [ETAPA.prospeccao, ETAPA.visita, ETAPA.decisor, ETAPA.demo, ETAPA.negociacao, ETAPA.pagamento, ETAPA.ganho, ETAPA.onboarding];
function pede(destino: string): string {
  const c = PROPS_OBRIGATORIAS_POR_ETAPA[destino] ?? [];
  return c.length ? `Pede ${c.map((k) => ROTULO_PROP[k] ?? k).join(', ')}` : 'Não pede nada novo';
}
function avancoDaEtapa(codigo: string | null | undefined): { botao: string | null; destino: string | null; nota: string } {
  switch (codigo) {
    case ETAPA.prospeccao: return { botao: 'Avançar → Visita', destino: ETAPA.visita, nota: pede(ETAPA.visita) };
    case ETAPA.visita: return { botao: 'Avançar → Decisor', destino: ETAPA.decisor, nota: pede(ETAPA.decisor) };
    case ETAPA.decisor: return { botao: 'Avançar → Demo', destino: ETAPA.demo, nota: pede(ETAPA.demo) };
    case ETAPA.demo: return { botao: 'Avançar → Negociação', destino: ETAPA.negociacao, nota: pede(ETAPA.negociacao) };
    case ETAPA.negociacao: return { botao: 'Emitir cobrança', destino: ETAPA.pagamento, nota: 'O Asaas pede os dados do contrato' };
    case ETAPA.pagamento: return { botao: null, destino: null, nota: 'Cobrança emitida · dados travados até o Pago · sem pagar em 2 dias, o gestor é avisado' };
    case ETAPA.ganho: return { botao: 'Enviar para onboarding', destino: ETAPA.onboarding, nota: 'Pago · o Asaas confirmou' };
    case ETAPA.onboarding: return { botao: null, destino: null, nota: 'Com o time de implantação · as tarefas do negócio foram fechadas' };
    case ETAPA.reciclagem: return { botao: 'Voltar para Visita', destino: ETAPA.visita, nota: 'Lateral do funil' };
    case ETAPA.perdido: return { botao: 'Reabrir em Reciclagem', destino: ETAPA.reciclagem, nota: 'Perda marcada por engano tem volta' };
    default: return { botao: null, destino: null, nota: 'Etapa não reconhecida no funil Field Sales' };
  }
}

function BlocoNegocio({ d, a }: { d: DadosCardNovo; a: AcoesCardNovo }) {
  if (d.pino.tipo === 'alvo' && !d.client.id_hubspot) {
    return (
      <View style={s.negocio}>
        <Text style={s.negocioRotulo}>NEGÓCIO · FUNIL FIELD SALES</Text>
        <Text style={s.negocioEtapa}>Conta-alvo</Text>
        <Text style={s.negocioNota}>{`Importada ${d.client.origem_lead === 'casa_dos_dados' ? 'da Casa dos Dados' : 'do Google'} · ainda não é negócio de ninguém`}</Text>
        {a.onEMeu && <Botao rotulo="É meu · entrar em Prospecção" onPress={() => assumir(d, a)} estilo={[s.botao48, s.eMeuBotao]} texto={s.eMeuTexto} />}
      </View>
    );
  }
  if (d.pino.tipo === 'cliente') return null;
  if (!d.client.id_hubspot) {
    return (
      <View style={s.negocio}>
        <Text style={s.negocioRotulo}>NEGÓCIO · FUNIL FIELD SALES</Text>
        <Text style={s.negocioEtapa}>Ainda sem negócio no HubSpot</Text>
        <Text style={s.negocioNota}>O negócio nasce em Prospecção quando o lead é assumido (É meu) ou cadastrado.</Text>
      </View>
    );
  }
  const codigo = d.etapaCodigo ?? null;
  const i = codigo ? FUNIL8.indexOf(codigo) : -1;
  const av = avancoDaEtapa(codigo);
  return (
    <View style={s.negocio}>
      <View style={s.negocioTopo}>
        <Text style={s.negocioRotulo}>NEGÓCIO · FUNIL FIELD SALES</Text>
        <Text style={s.negocioRotulo}>{i >= 0 ? `${i + 1} de 8` : 'lateral do funil'}</Text>
      </View>
      <View style={s.barra8}>{FUNIL8.map((e, k) => <View key={e} style={[s.seg, k <= i && s.segFeito]} />)}</View>
      <Text style={s.negocioEtapa}>{codigo ? ROTULO_ETAPA[codigo] ?? d.etapaRotulo : d.etapaRotulo ?? 'Etapa não reconhecida'}</Text>
      <Text style={s.negocioNota}>{av.nota}</Text>
      <View style={s.grade}>
        {av.botao && av.destino && a.onAvancar && (
          <Botao rotulo={av.botao} onPress={() => a.onAvancar!(av.destino!)} estilo={[s.botao48, s.avancar]} texto={s.avancarTexto} />
        )}
        {a.onChangeStage && <Botao rotulo="Outra etapa" onPress={a.onChangeStage} estilo={[s.botao48, av.botao ? s.outra : null]} />}
      </View>
    </View>
  );
}

/** Estágio 1 (peek): o que decide a visita sem expandir. */
export function PeekCardNovo({ d, a }: { d: DadosCardNovo; a: AcoesCardNovo }) {
  return (
    <View style={s.peek}>
      <Cabecalho d={d} a={a} compacto />
      <LinhaCliente d={d} />
      <BotaoCheguei d={d} a={a} />
      <GradeEspiada d={d} a={a} />
    </View>
  );
}

/** Estágio 2 (cheio): a ordem inteira da prancha §7, até o bloco de origem. */
export function TopoCardNovo({ d, a }: { d: DadosCardNovo; a: AcoesCardNovo }) {
  const c = d.client;
  const o = ORIGEM[origemDoFiltro(d.pino)];
  const entrou = c.entrou_em
    ? new Date(c.entrou_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' })
    : null;
  const dono = d.pino.dono === 'meu'
    ? 'Você'
    : d.pino.dono === 'colega'
      ? `${d.responsavelNome ?? 'Colega'} (colega)`
      : c.vendedor_id_hubspot ? '? dono não está mais no time' : 'Sem dono';
  return (
    <View style={s.topo}>
      <Cabecalho d={d} a={a} compacto={false} />
      <LinhaCliente d={d} />
      {/* Motor (prompt §7.4): a conta-alvo sumiu do Google ou está fechada. Descartar
          tira da rota antes de alguém perder a viagem até uma porta fechada. */}
      {(d.client.motor_status === 'sumiu_google' || d.client.motor_status === 'fechado_temporario' || d.client.motor_status === 'cnpj_baixado') && (
        <View style={s.alerta}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.alertaTitulo} numberOfLines={2}>
              {`Motor (${d.client.motor_conferido_em ? new Date(d.client.motor_conferido_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—'}): ${d.client.motor_status === 'sumiu_google' ? 'sumiu do Google. Pode ter fechado.' : d.client.motor_status === 'cnpj_baixado' ? 'CNPJ baixado na Receita. A empresa pode ter fechado.' : 'fechado temporariamente no Google.'}`}
            </Text>
          </View>
          {a.onDismissContaAlvo && (
            <Pressable accessibilityRole="button" accessibilityLabel="Descartar esta conta-alvo" onPress={a.onDismissContaAlvo} style={({ pressed }) => [s.alertaBotao, pressed && { opacity: 0.8 }]}>
              <Text style={s.alertaBotaoTexto}>Descartar</Text>
            </Pressable>
          )}
        </View>
      )}
      {d.cobranca && (
        <View style={s.alerta}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.alertaTitulo} numberOfLines={1}>{d.cobranca.texto}</Text>
            <Text style={s.alertaSub} numberOfLines={1}>{d.cobranca.assunto}</Text>
          </View>
          {a.onLiguei && (
            <Pressable accessibilityRole="button" accessibilityLabel="Liguei: encerrar a cobrança" onPress={a.onLiguei} style={({ pressed }) => [s.alertaBotao, pressed && { opacity: 0.8 }]}>
              <Text style={s.alertaBotaoTexto}>Liguei</Text>
            </Pressable>
          )}
        </View>
      )}
      <BotaoCheguei d={d} a={a} />
      <GradeEspiada d={d} a={{ ...a, onExpandir: undefined }} />
      <Fatos d={d} />
      <BlocoNegocio d={d} a={a} />
      <View style={s.linhaInfo}>
        <Text style={s.infoRotulo}>DONO</Text>
        <Text style={[s.infoValor, d.pino.dono === 'sem' && { color: 'var(--amarelo-sem-dono-texto)' }]} numberOfLines={1}>{dono}</Text>
      </View>
      <View style={s.linhaInfo}>
        <Text style={s.infoRotulo}>ORIGEM</Text>
        <View style={[s.origem, { backgroundColor: o.fundo }]}>
          <Text style={[s.origemTexto, { color: o.tinta }]}>{o.rotulo}</Text>
        </View>
        <Text style={s.infoValor} numberOfLines={1}>
          {[c.origem_detalhe && c.origem_detalhe !== o.rotulo ? c.origem_detalhe : null, entrou ? `entrou em ${entrou}` : 'entrada desconhecida']
            .filter(Boolean).join(' · ')}
        </Text>
      </View>
      <GradeMais d={d} a={a} />
    </View>
  );
}

const s = StyleSheet.create({
  peek: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 10 },
  topo: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 10 },
  eMeu: { marginLeft: 'auto', minHeight: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#FACC15', alignItems: 'center', justifyContent: 'center' },
  eMeuForaDaRota: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: '#FACC15' },
  eMeuTexto: { fontSize: 14, fontWeight: '700', color: 'var(--amarelo-sem-dono-texto)' },
  eMeuTextoForaDaRota: { color: 'var(--amarelo-sem-dono-texto)' },
  alerta: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 6, paddingVertical: 6,
    borderRadius: 10, backgroundColor: 'var(--tint-red)', borderWidth: 1, borderColor: 'var(--tint-red-border)',
  },
  alertaTitulo: { fontSize: 13, fontWeight: '800', color: 'var(--tint-red-text)' },
  alertaSub: { fontSize: 13, color: 'var(--tint-red-text)', opacity: 0.85 },
  alertaBotao: { minHeight: 44, minWidth: 72, paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  alertaBotaoTexto: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88 },
  titulo: { fontSize: 20, lineHeight: 24, fontWeight: '700', color: 'var(--text)', marginTop: 2 },
  tituloLongo: { fontSize: 18, lineHeight: 22 },
  sub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 },
  vazio: { fontStyle: 'italic' },
  corrigir: { minHeight: 44, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: 'var(--tint-amber-border)', backgroundColor: 'var(--tint-amber)', alignItems: 'center', justifyContent: 'center' },
  corrigirTexto: { fontSize: 13, fontWeight: '800', color: 'var(--tint-amber-text)' },
  fechar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  fecharTexto: { fontSize: 18, color: 'var(--text-muted)' },
  fatos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fato: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'var(--surface-2)' },
  fatoTexto: { fontSize: 12, fontWeight: '700', color: 'var(--text)' },
  fatoAviso: { backgroundColor: 'var(--tint-amber)' },
  fatoAvisoTexto: { color: 'var(--tint-amber-text)' },
  cheguei: { minHeight: 56, borderRadius: 16, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  chegueiTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
  chegueiSub: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,.85)', marginTop: 1 },
  // flex:0 no RN web vira '0 1 0%' e espreme o botão a 9 px: base e encolhimento explícitos.
  botaoMais: { flexGrow: 0, flexShrink: 0, flexBasis: 56, width: 56 },
  eMeuBotao: { backgroundColor: 'transparent', borderColor: '#FACC15', borderWidth: 1.5 },
  grade2: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  botaoMeia: { flexGrow: 0, flexShrink: 0, flexBasis: '48.5%', width: '48.5%', minHeight: 48 },
  negocio: { gap: 6, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' },
  negocioRotulo: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: 'var(--text-faint)' },
  negocioTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barra8: { flexDirection: 'row', gap: 3 },
  seg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'var(--border)' },
  segFeito: { backgroundColor: 'var(--vermelho-acao)' },
  avancar: { flexGrow: 2, backgroundColor: 'var(--vermelho-acao)', borderColor: 'var(--vermelho-acao)' },
  avancarTexto: { color: '#FFFFFF', fontWeight: '700' },
  outra: { flexGrow: 1 },
  negocioEtapa: { fontSize: 16, fontWeight: '600', color: 'var(--text)' },
  negocioNota: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)' },
  grade: { flexDirection: 'row', gap: 8 },
  botao: {
    flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
    borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', paddingHorizontal: 4,
  },
  botao64: { minHeight: 64 },
  botao48: { minHeight: 48 },
  zapBotao: { backgroundColor: '#128C4A', borderColor: '#128C4A' },
  zapTexto: { color: '#FFFFFF' },
  botaoTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  tracejado: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  desabilitado: { opacity: 0.45 },
  naoValeTexto: { color: 'var(--brand-text)' },
  naRota: { backgroundColor: 'var(--tint-green)', borderColor: 'var(--tint-green-border)' },
  naRotaTexto: { color: 'var(--tint-green-text)' },
  linhaInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  infoRotulo: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: 'var(--text-muted)', width: 56 },
  infoValor: { flex: 1, fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  origem: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  expandir: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  expandirTexto: { fontSize: 13, fontWeight: '700', color: 'var(--info-text)' },
  origemTexto: { fontSize: 12, fontWeight: '800' },
});
