// Mudar etapa no mapa novo (prompt final corrigido §8.4).
//
// As etapas oficiais na ordem (Reciclagem e Perdido no fim), a atual marcada,
// as que o servidor recusaria desabilitadas com o motivo (pular fase, Ganho).
// Escolhida a etapa, aparecem SÓ os campos obrigatórios que o negócio ainda não
// tem (mapa_negocio, 0108), com as picklists exatas. Grava por negocio-acao
// (op mudar-etapa); a recusa do servidor aparece aqui com a mensagem dele. Sem
// sinal, entra na fila. Ag. Pagamento abre Emitir cobrança (handoff v4.1
// §7.3) — o contrato inteiro, pelo celular. Com a cobrança emitida, daqui só
// se sai para Reciclagem ou Perdido (a mesma trava do servidor).
//
// ANTES DA DEMO / DA NEGOCIAÇÃO (handoff "app menos tela", 14/10/26): o botão depende SÓ do
// que o HubSpot exige (Demo: plano, MRR e data; Negociação: plano e MRR). Se o negócio já tem
// tudo, a folha NÃO ABRE: avança com um toque e um Desfazer de 10 s. Faltando, mostra só o que
// falta, e o botão apagado diz qual campo e onde. A data da reunião já vem em "Hoje". As 4
// armas (sistema, dor, quem decide, horário) viram um bloco recolhido que nunca trava; o que
// faltou é gravado em gv2_falta_etapa e o gestor vê no Raio X. "Avançar sem preencher" saiu:
// o botão principal já faz isso.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CampoData } from '../components/CampoData';
import { Painel } from '../components/Painel';
import { Toast } from '../components/Toast';
import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';
import { enfileirar, ehErroDeRede, novoAcaoId } from '../utils/filaOffline';
import {
  AJUDA_MOTIVO, ETAPA, ETAPAS_DA_FOLHA, GARGALOS, GARGALO_OUTRA, HORARIOS, HORARIO_OUTRO, MAX_O_QUE_PESOU, MOTIVOS_PERDIDO, MOTIVOS_QUE_EXIGEM_TEXTO, PAPEIS,
  PICKLIST, PROPS_OBRIGATORIAS_POR_ETAPA, ROTULO_ETAPA, ROTULO_PROP, TIPO_CAMPO, montarPropriedades, movimentoPermitido, valorValido,
} from '../utils/fichaDeRua';
import {
  SISTEMAS_ARMAS, armasConhecidas, chipDoSistema, armasQueFaltam, enviosDasArmas, fichasDaFolha, registroDoAvanco, resumoDasArmas, sistemaParaGravar,
  type Armas, type FichaArmas,
} from '../utils/armasDaDemo';
import { negocioAcao } from '../utils/negocioAcao';
import EmitirCobranca from './EmitirCobranca';

type Props = {
  visivel: boolean;
  client: Client;
  etapaAtual: string | null;
  onFechar: () => void;
  /** `propriedades`: o que foi ao HubSpot junto (o telefone também vai para o lead do app). */
  onMudou: (codigo: string, propriedades?: Record<string, unknown>) => void;
  /** Botão de avanço do bloco NEGÓCIO: já abre na etapa escolhida. */
  destinoInicial?: string | null;
  /** Campos que já chegam preenchidos (o "Não vale" traz o motivo do Perdido). */
  preenchido?: Record<string, string> | null;
  /** Cartão do lead › "falta · tocar para completar": só as armas, sem mudar a etapa. */
  soArmas?: boolean;
};

// O que cada etapa pede, à direita da linha (handoff §6.5).
function pedeTexto(id: string): string {
  if (id === ETAPA.pagamento) return 'abre Emitir cobrança';
  const campos = PROPS_OBRIGATORIAS_POR_ETAPA[id] ?? [];
  return campos.length ? `pede ${campos.map((k) => ROTULO_PROP[k] ?? k).join(', ')}` : 'não pede nada novo';
}

const ROTULO_PICK: Record<string, string> = { Reembolso: 'Estorno', GoogleMaps: 'Google Maps', Familia: 'Família' };
type ChaveArma = 'sistema' | 'dor' | 'decisor' | 'horario';
/* Os "Outro"/"Outra" das armas que estão com o campo de texto aberto (14/10/26) */
type Abertos = { dor: boolean; papel: boolean; horario: boolean };
const NADA_ABERTO: Abertos = { dor: false, papel: false, horario: false };
/** O que veio da ficha/HubSpot e não é chip: abre o campo com o texto (dor/papel/horário livres). */
const abertosDe = (a: Armas): Abertos => ({
  dor: !!a.dor && !(GARGALOS as readonly string[]).includes(a.dor),
  papel: !!a.papel && !(PAPEIS as readonly string[]).includes(a.papel),
  horario: !!a.horario && !HORARIOS.some((h) => h.hs && h.valor === a.horario),
});
const CHAVES: ChaveArma[] = ['sistema', 'dor', 'decisor', 'horario'];
/* rede ruim na rua: o que não respondeu em 4 s não segura a folha */
const comPrazo = <T,>(p: PromiseLike<T>, ms: number, padrao: T): Promise<T> =>
  Promise.race([Promise.resolve(p).catch(() => padrao), new Promise<T>((r) => setTimeout(() => r(padrao), ms))]);
/** data da reunião como vier (AAAA-MM-DD ou ms): "dd/mm" */
const dataCurta = (v: unknown): string => {
  const s = String(v ?? '').trim();
  const d = /^[0-9]{10,}$/.test(s) ? new Date(Number(s)) : new Date(`${s.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(5, 10).split('-').reverse().join('/');
};
const hojeBRT = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const ontemBRT = () => new Date(Date.now() - 27 * 3600000).toISOString().slice(0, 10);
const juntar = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}` : xs[0] ?? '');
/* as etapas que avançam com um toque quando o negócio já tem tudo */
const UM_TOQUE: string[] = [ETAPA.demo, ETAPA.negociacao];
const ddmm = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '');

export default function MudarEtapaNovo({ visivel, client, etapaAtual: etapaDoPino, onFechar, onMudou, destinoInicial = null, preenchido = null, soArmas = false }: Props) {
  const [destino, setDestino] = useState<string | null>(null);
  const [digitado, setDigitado] = useState<Record<string, string>>({});
  const [jaTem, setJaTem] = useState<Record<string, unknown>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [recusa, setRecusa] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /* as armas: o que se sabe (fichas, a folha e o negócio) e o que está na tela */
  const [fichas, setFichas] = useState<FichaArmas[] | null>(null);
  const [daFolha, setDaFolha] = useState<FichaArmas[]>([]);
  const [armas, setArmas] = useState<Armas | null>(null);
  const [conhecidas, setConhecidas] = useState<Armas | null>(null);
  const [tocadas, setTocadas] = useState<Record<string, boolean>>({});
  const [outroSistema, setOutroSistema] = useState(false);
  const [abertos, setAbertos] = useState<Abertos>(NADA_ABERTO);
  const [jaTemPronto, setJaTemPronto] = useState(false);
  /* com tudo sabido, a folha nem abre: até decidir, o painel fica fechado */
  const [decidido, setDecidido] = useState(false);
  const [armasAbertas, setArmasAbertas] = useState(false);
  const [outraData, setOutraData] = useState(false);
  const dealId = client.id_hubspot ? String(client.id_hubspot) : null;
  /* A ETAPA QUE VALE: a lida ao vivo do HubSpot, senão a do pino. O pino pode estar velho (o
     gestor moveu no kanban): com a do pino na frente, o avanço de um toque fazia o negócio VOLTAR.
     O mapa antigo e a lista de tarefas nem sabem a etapa do pino. */
  const lidaAoVivo = String(jaTem.dealstage ?? '').trim();
  const etapaAtual = (/^[0-9]+$/.test(lidaAoVivo) ? lidaAoVivo : null) ?? etapaDoPino;
  const [tentativa, setTentativa] = useState(0);
  const execId = client.vendedor_id_hubspot ? String(client.vendedor_id_hubspot) : null;
  const nome = client.empresa?.trim() || client.nome;

  useEffect(() => {
    if (!visivel) return;
    setDestino(soArmas ? null : destinoInicial); setDigitado(preenchido ? { ...preenchido } : {}); setErros({}); setRecusa(null);
    setArmas(null); setConhecidas(null); setTocadas({}); setOutroSistema(false); setAbertos(NADA_ABERTO); setJaTemPronto(false); setFichas(null); setDaFolha([]);
    setDecidido(!(UM_TOQUE.includes(destinoInicial ?? '') || soArmas) || !dealId);
    setArmasAbertas(false); setOutraData(false);
    if (client.id) {
      void comPrazo(supabase.from('fichas_de_rua').select('ocorrido_em, decisor_nome, decisor_papel, horario_dono, sistema, dor')
        .eq('client_id', client.id).order('ocorrido_em', { ascending: false }).limit(10)
        .then(({ data }) => (data ?? []) as FichaArmas[]), 4000, [] as FichaArmas[]).then(setFichas);
    } else setFichas([]);
    if (!dealId) return;
    /* o que a folha já gravou (gv2_falta_etapa.armas) vale como ficha, pela data */
    void supabase.from('gv2_falta_etapa').select('criado_em, armas').eq('negocio_id', dealId).order('criado_em', { ascending: false }).limit(5)
      .then(({ data }) => setDaFolha(fichasDaFolha((data ?? []) as { criado_em: string; armas: Record<string, unknown> | null }[])), () => setDaFolha([]));
    // Snapshot do Cockpit (mapa_negocio) + leitura AO VIVO do HubSpot (ler_negocio):
    // o snapshot atrasa até 2 h e pedia de novo o que o registro acabou de gravar
    // (auditoria 26/09). O vivo vence; o telefone do cadastro é a última reserva.
    let vivo = true;
    const base: Record<string, unknown> = client.telefone ? { celular: client.telefone } : {};
    setJaTem(base);
    /* cada leitura com prazo de 4 s: a leitura ao vivo sem resposta deixava as armas girando
       para sempre (auditoria 14/10/26) */
    const vazio = {} as Record<string, unknown>;
    Promise.all([
      comPrazo(supabase.rpc('mapa_negocio', { p_deal: dealId }).then(({ data }) => (data as Record<string, unknown>) ?? {}), 4000, vazio),
      client.vendedor_id_hubspot
        ? comPrazo(supabase.functions.invoke('hubspot-sync', { body: { type: 'ler_negocio', id_hubspot: dealId, owner_id: String(client.vendedor_id_hubspot) } })
            .then(({ data }) => ((data as { propriedades?: Record<string, unknown> } | null)?.propriedades ?? {})), 4000, vazio)
        : Promise.resolve(vazio),
    ]).then(([snap, aoVivo]) => { if (vivo) { setJaTem({ ...base, ...snap, ...aoVivo }); setJaTemPronto(true); } });
    /* rede lenta: em 2,5 s a folha abre de qualquer jeito, com as armas carregando */
    const t = setTimeout(() => { if (vivo) setDecidido(true); }, 2500);
    return () => { vivo = false; clearTimeout(t); };
  }, [visivel, dealId, destinoInicial, soArmas, tentativa]); // eslint-disable-line react-hooks/exhaustive-deps

  const ehDemo = destino === ETAPA.demo && !!dealId;
  const ehNeg = destino === ETAPA.negociacao && !!dealId;
  const comArmas = (ehDemo || soArmas) && !!dealId;
  const todasFichas = fichas == null ? null : [...daFolha, ...fichas];
  /* as armas nascem quando o negócio e as fichas chegaram: preenchidas com o que se sabe */
  useEffect(() => {
    if (!comArmas || armas || !jaTemPronto || todasFichas == null) return;
    const k = armasConhecidas(jaTem, todasFichas);
    setArmas(k); setConhecidas(k);
    setOutroSistema(chipDoSistema(k.sistema) === 'Outro');
    setAbertos(abertosDe(k));
  }, [comArmas, armas, jaTemPronto, todasFichas, jaTem]);

  /* Emitir cobranca escreve sozinha o texto do desafio (28/10/26): precisa da dor e do sistema
     que as fichas de rua sabem. As armas da demo nascem so no caminho da Demo, entao aqui elas
     sao calculadas de novo, pela MESMA regra - ficha recente vence o negocio. */
  const armasParaCobranca = useMemo(
    () => (destino === ETAPA.pagamento && todasFichas != null ? armasConhecidas(jaTem, todasFichas) : null),
    [destino, todasFichas, jaTem],
  );

  /* "O que pesou" aparece para QUALQUER motivo escolhido (14/10/26); só é exigido nos que não
     se explicam sozinhos — montarPropriedades decide, e manda o opcional quando vem escrito */
  const exigidos = destino
    ? [...(PROPS_OBRIGATORIAS_POR_ETAPA[destino] ?? []),
      ...(destino === ETAPA.perdido && digitado.motivo_do_perdido ? ['observacao__desqualificado'] : [])]
      /* valor de lixo ("." no sistema) conta como vazio: é o que se escrevia só para passar */
      .filter((k) => k === 'motivo_do_perdido' || k === 'observacao__desqualificado' || !valorValido(jaTem[k]))
    : [];
  /* A DATA DA REUNIÃO JÁ VEM EM "HOJE" (o executivo troca se foi ontem ou outro dia) */
  useEffect(() => {
    if (destino === ETAPA.demo && jaTemPronto && exigidos.includes('data_da_reuniao') && !digitado.data_da_reuniao) {
      setDigitado((d) => ({ ...d, data_da_reuniao: hojeBRT() }));
    }
  }, [destino, jaTemPronto]); // eslint-disable-line react-hooks/exhaustive-deps
  /* SÓ CONTA ARMA ONDE HÁ ARMA (14/10/26). Negociação usa o mesmo rodapé da Demo, mas não
     tem armas: contava 4 que nunca apareciam e o botão ficava em "Faltam 4" para sempre —
     nenhum negócio avançou para Negociação pelo mapa novo desde 06/10 (Snack Paradise). */
  const faltamArmas = !comArmas ? 0 : armas ? armasQueFaltam(armas).length : 4;
  const faltando = exigidos.filter((k) => !String(digitado[k] ?? '').trim());
  const faltamExig = faltando.length;

  /* COMPLETO NÃO ABRE (Demo e Negociação): o que o HubSpot exige já está no negócio → avança
     com um toque e o Desfazer. As armas não contam: elas nunca travam. Na Demo espera as
     fichas (4 s no máximo) para registrar as armas junto. */
  useEffect(() => {
    if (!visivel || decidido || soArmas || !UM_TOQUE.includes(destinoInicial ?? '') || !jaTemPronto) return;
    if (destinoInicial === ETAPA.demo && !armas) return;
    const ordem: string[] = [ETAPA.prospeccao, ETAPA.visita, ETAPA.decisor, ETAPA.demo, ETAPA.negociacao];
    const vizinho = !!etapaAtual && ordem.indexOf(destinoInicial ?? '') - ordem.indexOf(etapaAtual) === 1;
    if (exigidos.length === 0 && vizinho) void confirmar('auto');
    else setDecidido(true);
  }, [visivel, decidido, armas, jaTemPronto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (soArmas && armas && !decidido) setDecidido(true); }, [soArmas, armas, decidido]);

  /** grava o que se sabia e o que faltou (o gestor vê no Raio X); nunca segura a etapa */
  function registrar(etapa: string) {
    if (!dealId || !execId || !armas) return;
    void supabase.from('gv2_falta_etapa').insert(registroDoAvanco({ dealId, execId, etapa, armas }))
      .then(({ error }) => { if (error) console.warn('[gv2_falta_etapa]', error.message); });
  }
  function mandarArmas(): { n: number; feitos: Promise<number> } {
    if (!dealId || !armas || !conhecidas) return { n: 0, feitos: Promise.resolve(0) };
    /* SÓ O QUE FOI TOCADO vai ao HubSpot: o sistema/dor de uma ficha antiga não sobrescreve o que
       o negócio tem (no avanço de um toque a folha nem abre) */
    const tocado: Armas = { sistema: tocadas.sistema ? armas.sistema : '', dor: tocadas.dor ? armas.dor : '', horario: tocadas.horario ? armas.horario : '',
      decisor: tocadas.decisor ? armas.decisor : '', papel: armas.papel };
    const envios = enviosDasArmas({ dealId, ownerId: execId, negocio: jaTem, armas: tocado, decisorNoNegocio: !tocado.decisor || tocado.decisor === conhecidas.decisor });
    const feitos = Promise.all(envios.map((e) => supabase.functions.invoke('hubspot-sync', { body: e.corpo }).then(({ error }) => {
      if (error) { Toast.mostrar(`${e.rotulo} não foi ao HubSpot: ${error.message}`, 'erro'); return 0; }
      return 1;
    }, () => 0))).then((r) => r.reduce((a: number, x: number) => a + x, 0));
    return { n: envios.length, feitos };
  }

  async function salvarSoArmas() {
    if (!armas || enviando) return;
    setEnviando(true);
    // ESPERA O HUBSPOT (auditoria 16/10/26): o aviso de "salvas" saía antes dos envios terminarem e
    // dizia HubSpot mesmo quando todos falhavam; e "no Cockpit" mesmo sem registro (sem execId)
    const { n, feitos } = mandarArmas();
    registrar('armas');
    const ok = await feitos;
    const noCockpit = !!(dealId && execId && armas);
    if (n && ok === n) Toast.mostrar(`Armas de ${nome} salvas · HubSpot${noCockpit ? ' + Cockpit' : ''}`, 'ok');
    else if (n && ok > 0) Toast.mostrar(`Armas de ${nome}: ${ok} de ${n} foram ao HubSpot`, 'aviso');
    else if (!n && noCockpit) Toast.mostrar(`Armas de ${nome} salvas no Cockpit`, 'ok');
    setEnviando(false);
    onFechar();
  }

  /* DESFAZER (10 s): volta à etapa de antes pelo mesmo caminho, com fecharTarefas:false. O
     servidor cobra da etapa de volta o que ela exige: se o negócio não tem, não oferece. */
  function oferecerDesfazer(texto: string, para: string, enviado: Record<string, unknown> = {}) {
    /* a etapa real é a lida ao vivo (o rótulo do pino pode estar velho); Desfazer só existe
       nos avanços do funil — Perdido fecha tarefas, Onboarding não tem volta, Reciclagem é lateral */
    const lida = String(jaTem.dealstage ?? '').trim();
    const antes = /^[0-9]+$/.test(lida) ? lida : etapaAtual;
    const avanco = [ETAPA.visita, ETAPA.decisor, ETAPA.demo, ETAPA.negociacao].includes(para as never);
    const finais = { ...jaTem, ...enviado };
    const voltaPassa = !!antes && (PROPS_OBRIGATORIAS_POR_ETAPA[antes] ?? []).every((k) => valorValido(finais[k]));
    if (!antes || !dealId || antes === para || !avanco || !voltaPassa) { Toast.mostrar(texto, 'ok'); return; }
    Toast.mostrar(texto, 'ok', {
      rotulo: 'Desfazer',
      onPress: () => {
        void negocioAcao({ op: 'mudar-etapa', dealId, novaEtapa: antes, propriedades: {}, fecharTarefas: false, etapaEsperada: para })
          .then(() => { onMudou(antes); Toast.mostrar(`${nome} voltou para ${ROTULO_ETAPA[antes] ?? 'a etapa de antes'}`, 'ok'); })
          .catch((err: unknown) => Toast.mostrar(`Não deu para desfazer: ${String((err as Error)?.message ?? err)}`, 'erro'));
      },
    }, 10000);
  }

  async function confirmar(modo: 'com' | 'auto' = 'com') {
    if (!destino || !dealId || enviando) return;
    // nome_do_sistema com a grafia acertada (14/10/26); a tela continua mostrando o que foi digitado
    const paraGravar = digitado.nome_do_sistema ? { ...digitado, nome_do_sistema: sistemaParaGravar(digitado.nome_do_sistema) } : digitado;
    const { propriedades, erros: e, gargaloOutro } = montarPropriedades(destino, paraGravar, jaTem);
    setErros(e);
    if (Object.keys(e).length) { setDecidido(true); return; }
    setEnviando(true); setRecusa(null);
    /* dor "Outra": fora de `propriedades` (enum do HubSpot); o servidor aceita no lugar do gargalo */
    /* etapaEsperada: se a etapa real mudou desde a leitura, o servidor devolve 409 em vez de gravar por cima */
    const corpo = { op: 'mudar-etapa', dealId, novaEtapa: destino, propriedades, ...(gargaloOutro ? { gargaloOutro } : {}), ...(etapaAtual ? { etapaEsperada: etapaAtual } : {}) };
    try {
      await negocioAcao(corpo);
      onMudou(destino, propriedades as Record<string, unknown>);
      /* AS ARMAS VÃO DEPOIS DA ETAPA, pelas rotas da ficha de visita: a etapa é o que o
         executivo pediu; as armas são complemento e não podem segurá-la */
      if (ehDemo && armas) {
        mandarArmas();
        registrar(ROTULO_ETAPA[destino]);
      }
      oferecerDesfazer(modo === 'auto'
        ? `Em ${ROTULO_ETAPA[destino]} · ${destino === ETAPA.demo ? 'plano, MRR e data' : 'plano e MRR'} já no negócio`
        : `${nome} foi para ${ROTULO_ETAPA[destino]} · HubSpot + Cockpit`, destino, propriedades as Record<string, unknown>);
      onFechar();
    } catch (err) {
      if (ehErroDeRede(err)) {
        await enfileirar({ acaoId: novoAcaoId(), tipo: 'negocio', rotulo: `Etapa → ${ROTULO_ETAPA[destino]} · ${nome}`, payload: { corpo } });
        Toast.mostrar(`Sem sinal · ${ROTULO_ETAPA[destino]} na fila, sobe sozinho`, 'fila');
        onFechar();
      } else {
        setRecusa(String((err as Error)?.message ?? err));
        setDecidido(true);
      }
    } finally {
      setEnviando(false);
    }
  }

  const campo = (k: string) => {
    const tipo = TIPO_CAMPO[k] ?? 'texto';
    /* gargalo: "Outra" abre "Qual é a dor?" (14/10/26); o texto vai como gargaloOutro, nunca no enum */
    const opcoes = k === 'motivo_do_perdido' ? MOTIVOS_PERDIDO.map((m) => m.valor)
      : k === 'gargalo_operacional' && PICKLIST[k] ? [...PICKLIST[k], GARGALO_OUTRA] : PICKLIST[k];
    const pesouOpcional = k === 'observacao__desqualificado' && !MOTIVOS_QUE_EXIGEM_TEXTO.includes(digitado.motivo_do_perdido ?? '');
    return (
      <View key={k} style={s.campoBloco}>
        <Text style={s.campoRotulo}>{k === 'observacao__desqualificado' ? (pesouOpcional ? 'O que pesou · opcional' : 'O que pesou') : (ROTULO_PROP[k] ?? k).replace(/^./, (c) => c.toUpperCase())}</Text>
        {tipo === 'selecao' && opcoes ? (
          <View style={s.chips}>
            {opcoes.map((o) => (
              <Pressable key={o} accessibilityRole="button" accessibilityState={{ selected: digitado[k] === o }}
                onPress={() => setDigitado((d) => ({ ...d, [k]: o }))} style={[s.chip, digitado[k] === o && s.chipAtivo]}>
                <Text style={[s.chipTexto, digitado[k] === o && s.chipTextoAtivo]}>{ROTULO_PICK[o] ?? o}</Text>
              </Pressable>
            ))}
          </View>
        ) : tipo === 'data' && k === 'data_da_reuniao' && !outraData ? (
          <View style={s.chips}>
            {[{ v: hojeBRT(), r: `Hoje, ${hojeBRT().split('-').reverse().slice(0, 2).join('/')}` }, { v: ontemBRT(), r: 'Ontem' }].map((o) => (
              <Pressable key={o.r} accessibilityRole="button" accessibilityState={{ selected: digitado[k] === o.v }}
                onPress={() => setDigitado((d) => ({ ...d, [k]: o.v }))} style={[s.chip, digitado[k] === o.v && s.chipAtivo]}>
                <Text style={[s.chipTexto, digitado[k] === o.v && s.chipTextoAtivo]}>{o.r}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => setOutraData(true)} style={s.chip}><Text style={s.chipTexto}>Outra</Text></Pressable>
          </View>
        ) : tipo === 'data' ? (
          // abre o calendário do aparelho (o TextInput descartava type="date")
          <CampoData
            valor={digitado[k] ?? ''}
            aoMudar={(v) => setDigitado((d) => ({ ...d, [k]: v }))}
            rotulo={(ROTULO_PROP[k] ?? k).replace(/^./, (c) => c.toUpperCase())}
            estilo={s.input}
          />
        ) : (
          <TextInput
            style={s.input}
            value={digitado[k] ?? ''}
            onChangeText={(v) => setDigitado((d) => ({ ...d, [k]: v }))}
            placeholder={tipo === 'numero' ? 'R$ por mês' : tipo === 'tel' ? '(27) 99999-9999' : ''}
            placeholderTextColor="#8B919C"
            keyboardType={tipo === 'numero' ? 'decimal-pad' : tipo === 'tel' ? 'phone-pad' : 'default'}
            {...(k === 'observacao__desqualificado' ? { maxLength: MAX_O_QUE_PESOU } : {})}
          />
        )}
        {k === 'motivo_do_perdido' && !!AJUDA_MOTIVO[digitado[k] ?? ''] && <Text style={s.ajuda}>{AJUDA_MOTIVO[digitado[k] ?? '']}</Text>}
        {k === 'gargalo_operacional' && digitado[k] === GARGALO_OUTRA && (
          <TextInput style={s.input} value={digitado.gargalo_outro ?? ''} onChangeText={(v) => setDigitado((d) => ({ ...d, gargalo_outro: v }))}
            placeholder="Qual é a dor?" placeholderTextColor="#8B919C" maxLength={200} />
        )}
        {!!erros[k] && <Text style={s.erro}>{erros[k]}</Text>}
      </View>
    );
  };

  /* a etiqueta de cada arma: de onde veio, ok, ou falta */
  const etiqueta = (k: ChaveArma): { texto: string; tom: 'ok' | 'falta' } => {
    if (!armas || !armas[k]) return { texto: 'falta', tom: 'falta' };
    if (tocadas[k] || !conhecidas || armas[k] !== conhecidas[k]) return { texto: 'ok', tom: 'ok' };
    const campoFicha = { sistema: 'sistema', dor: 'dor', decisor: 'decisor_nome', horario: 'horario_dono' }[k] as keyof FichaArmas;
    const daLista = (lista: FichaArmas[]) => lista.find((f) => String(f[campoFicha] ?? '').trim() === String(armas[k]));
    const f = daLista(fichas ?? []);
    const fl = daLista(daFolha);
    if (fl && (!f || String(fl.ocorrido_em) > String(f.ocorrido_em))) return { texto: `da folha · ${ddmm(fl.ocorrido_em)}`, tom: 'ok' };
    if (f) return { texto: `da ficha · ${ddmm(f.ocorrido_em)}`, tom: 'ok' };
    return { texto: 'do HubSpot', tom: 'ok' };
  };
  const mudar = (m: Partial<Armas>) => {
    setArmas((a) => (a ? { ...a, ...m } : a));
    setTocadas((t) => ({ ...t, ...Object.fromEntries(Object.keys(m).filter((x) => x !== 'papel').map((x) => [x, true])) }));
  };

  const de = etapaAtual ? ROTULO_ETAPA[etapaAtual] ?? '' : '';
  const titulo = soArmas ? 'Suas armas' : ehDemo ? 'Antes da Demo' : ehNeg ? 'Antes da Negociação' : `Mudar etapa · ${nome}`;
  const sub = soArmas ? `${nome} · ${de}` : (ehDemo || ehNeg) && destino ? `${nome} · ${de ? `${de} → ` : ''}${ROTULO_ETAPA[destino]}` : null;
  const nDe4 = 4 - faltamArmas;
  const faltamTudo = faltamExig;
  const ORDEM_FUNIL: string[] = [ETAPA.prospeccao, ETAPA.visita, ETAPA.decisor, ETAPA.demo, ETAPA.negociacao, ETAPA.pagamento];
  const jaPassou = (ehDemo || ehNeg) && !!etapaAtual && !!destino && ORDEM_FUNIL.indexOf(etapaAtual) >= ORDEM_FUNIL.indexOf(destino);
  const rotuloFalta = (k: string) => (k === 'plano_apresentado' ? 'o plano' : k === 'valor_de_mrr' ? 'o MRR' : k === 'data_da_reuniao' ? 'a data' : ROTULO_PROP[k] ?? k);

  const rodapeArmas = (
    <View style={s.rodapeCol}>
      {soArmas ? (
        <Pressable accessibilityRole="button" style={[s.botao52, s.fundoPrin]} onPress={salvarSoArmas} disabled={enviando || !armas}>
          {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoPrinTexto}>Salvar as armas</Text>}
        </Pressable>
      ) : jaPassou ? (
        /* o pino estava velho: o negócio já está nesta etapa ou além — mover seria VOLTAR */
        <>
          <Text style={s.legendaRodape}>{`${nome} já está em ${ROTULO_ETAPA[etapaAtual ?? ''] ?? 'uma etapa à frente'} no HubSpot`}</Text>
          <Pressable accessibilityRole="button" style={[s.botao52, s.bordaSec]} onPress={onFechar}>
            <Text style={s.botaoSecTexto}>Fechar</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: faltamTudo > 0 }} style={[s.botao52, faltamTudo > 0 ? s.botaoInerte : s.fundoPrin]}
            onPress={() => confirmar('com')} disabled={enviando || faltamTudo > 0}>
            {enviando ? <ActivityIndicator color="#fff" /> : (
              <Text style={faltamTudo > 0 ? s.botaoInerteTexto : s.botaoPrinTexto}>
                {faltamTudo > 0 ? `Falta ${juntar(faltando.map(rotuloFalta))} · acima` : `Mover para ${ROTULO_ETAPA[destino ?? ''] ?? 'a etapa'}`}
              </Text>
            )}
          </Pressable>
          {faltamTudo > 0 && <Text style={s.legendaRodape}>{`Com ${juntar(faltando.map(rotuloFalta))}, vira "Mover para ${ROTULO_ETAPA[destino ?? ''] ?? ''}"`}</Text>}
        </>
      )}
    </View>
  );

  return (
    <Painel visivel={visivel && decidido} aoFechar={onFechar} rotulo={titulo}
      topo={sub ? (
        <View style={s.topo}>
          <Text style={s.tituloFolha}>{titulo}</Text>
          <Text style={s.subFolha} numberOfLines={2}>{sub}</Text>
        </View>
      ) : <Text style={s.titulo}>{titulo}</Text>}
      rodape={soArmas || ehDemo || ehNeg ? rodapeArmas : destino && destino !== ETAPA.pagamento ? (
        <View style={s.rodape}>
          <Pressable accessibilityRole="button" style={[s.botao, s.botaoSec]} onPress={() => setDestino(null)} disabled={enviando}>
            <Text style={s.botaoSecTexto}>Voltar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[s.botao, s.botaoPrin]} onPress={() => confirmar('com')} disabled={enviando}>
            {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoPrinTexto}>{`Mover para ${ROTULO_ETAPA[destino]}`}</Text>}
          </Pressable>
        </View>
      ) : undefined}
    >
      <View style={s.corpo}>
        {!dealId ? (
          <Text style={s.aviso}>Este lead ainda não tem negócio no HubSpot. A etapa passa a existir quando o negócio for criado.</Text>
        ) : soArmas ? (
          <View style={{ gap: 12 }}>
            <Progresso texto="Sistema e dor são suas armas na Demo, e o gestor estuda a praça com elas." n={nDe4} de={4} />
            <SecaoArmas armas={armas} etiqueta={etiqueta} outroSistema={outroSistema} aoOutro={setOutroSistema} abertos={abertos} aoAbrir={(m) => setAbertos((a) => ({ ...a, ...m }))} mudar={mudar} />
          </View>
        ) : !destino && !etapaAtual && !jaTemPronto ? (
          <View style={{ paddingVertical: 24 }}><ActivityIndicator /></View>
        ) : !destino && !etapaAtual ? (
          <View style={{ gap: 12, paddingVertical: 12 }}>
            <Text style={s.aviso}>Não consegui ler a etapa deste negócio no HubSpot. Sem ela, a etapa não muda daqui.</Text>
            <Pressable accessibilityRole="button" onPress={() => setTentativa((n) => n + 1)} style={[s.botao52, s.bordaSec]}>
              <Text style={s.botaoSecTexto}>Tentar de novo</Text>
            </Pressable>
          </View>
        ) : !destino ? (
          [...ETAPAS_DA_FOLHA.slice(0, 7), ETAPA.ganho, ...ETAPAS_DA_FOLHA.slice(7)].map((id, i) => {
            const atual = id === etapaAtual;
            const travada = etapaAtual === ETAPA.pagamento && id !== ETAPA.reciclagem && id !== ETAPA.perdido;
            const mov = id === ETAPA.ganho
              ? { ok: false, motivo: 'só o Asaas marca, quando o pagamento cai' }
              : travada ? { ok: false, motivo: 'cobrança emitida · dados travados até o Pago' }
                : movimentoPermitido(etapaAtual, id);
            const separa = id === ETAPA.reciclagem;
            return (
              <View key={id}>
                {separa && <View style={s.divisor} />}
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: atual || !mov.ok, selected: atual }}
                  disabled={atual || !mov.ok} onPress={() => setDestino(id)} style={[s.linha, (atual || !mov.ok) && s.linhaInativa]}>
                  {atual
                    ? <View style={[s.linhaNum, { alignItems: 'center', justifyContent: 'center' }]}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: 'var(--vermelho-acao)' }} /></View>
                    : <Text style={s.linhaNum}>{i < 8 ? String(i + 1) : ''}</Text>}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.linhaRotulo, atual && s.linhaAtual]}>{ROTULO_ETAPA[id]}{atual ? ' · atual' : ''}</Text>
                    <Text style={s.linhaMotivo}>{atual ? 'atual' : !mov.ok ? mov.motivo : pedeTexto(id)}</Text>
                  </View>
                </Pressable>
              </View>
            );
          })
        ) : destino === ETAPA.pagamento ? (
          <EmitirCobranca
            visivel
            client={client}
            jaTem={jaTem}
            armas={armasParaCobranca}
            onFechar={() => { setDestino(null); onFechar(); }}
            onEmitida={(codigo) => onMudou(codigo)}
          />
        ) : ehDemo ? (
          <View style={{ gap: 12 }}>
            {/* o que o negócio já tem vira linha de fato; só o que falta é campo */}
            {(PROPS_OBRIGATORIAS_POR_ETAPA[destino] ?? []).filter((k) => !exigidos.includes(k)).map((k) => (
              <View key={k} style={s.fatoLinha}>
                <Text style={s.fatoRotulo}>{(ROTULO_PROP[k] ?? k).replace(/^./, (c) => c.toUpperCase())}</Text>
                <Text style={s.fatoValor} numberOfLines={1}>{k === 'valor_de_mrr' ? `R$ ${String(jaTem[k])}` : k === 'data_da_reuniao' ? dataCurta(jaTem[k]) : String(jaTem[k])}</Text>
                <Text style={s.fatoOrigem}>do negócio</Text>
              </View>
            ))}
            {exigidos.map(campo)}
            {/* AS ARMAS, RECOLHIDAS: nunca travam; o que faltar fica registrado para o gestor */}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: armasAbertas }} onPress={() => setArmasAbertas((v) => !v)} style={s.armasTopo}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.armasTitulo}>{`Armas da demo · ${nDe4} de 4`}</Text>
                <Text style={s.ajuda} numberOfLines={1}>{armas ? (resumoDasArmas(armas) || 'sistema, dor, quem decide · opcional') : 'carregando…'}</Text>
              </View>
              <Text style={s.armasSeta}>{armasAbertas ? '–' : '+'}</Text>
            </Pressable>
            {armasAbertas && <SecaoArmas armas={armas} etiqueta={etiqueta} outroSistema={outroSistema} aoOutro={setOutroSistema} abertos={abertos} aoAbrir={(m) => setAbertos((a) => ({ ...a, ...m }))} mudar={mudar} />}
            {!!recusa && <Text style={s.recusa}>{`O servidor recusou: ${recusa}`}</Text>}
            {!destinoInicial && <Pressable accessibilityRole="button" onPress={() => setDestino(null)} style={s.trocar}><Text style={s.trocarTexto}>Escolher outra etapa</Text></Pressable>}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {/* Negociação: o que o negócio já tem vira linha de fato; só o que falta é campo */}
            {ehNeg
              ? (PROPS_OBRIGATORIAS_POR_ETAPA[ETAPA.negociacao] ?? []).filter((k) => !exigidos.includes(k)).map((k) => (
                <View key={k} style={s.fatoLinha}>
                  <Text style={s.fatoRotulo}>{(ROTULO_PROP[k] ?? k).replace(/^./, (c) => c.toUpperCase())}</Text>
                  <Text style={s.fatoValor} numberOfLines={1}>{k === 'valor_de_mrr' ? `R$ ${String(jaTem[k])}` : String(jaTem[k])}</Text>
                  <Text style={s.fatoOrigem}>do negócio</Text>
                </View>
              ))
              : <Text style={s.ajuda}>{exigidos.length ? 'Esta etapa pede:' : 'Nada a preencher — é só confirmar.'}</Text>}
            {exigidos.map(campo)}
            {!!recusa && <Text style={s.recusa}>{`O servidor recusou: ${recusa}`}</Text>}
            {ehNeg && !destinoInicial && <Pressable accessibilityRole="button" onPress={() => setDestino(null)} style={s.trocar}><Text style={s.trocarTexto}>Escolher outra etapa</Text></Pressable>}
          </View>
        )}
      </View>
    </Painel>
  );
}

/* "N de 4" e a barra de segmentos: verde completo, âmbar faltando */
function Progresso({ texto, n, de }: { texto: string; n: number; de: number }) {
  const completo = n >= de;
  return (
    <View style={{ gap: 8 }}>
      <View style={s.progLinha}>
        <Text style={s.progTexto}>{texto}</Text>
        <Text style={[s.progN, completo ? s.tomOk : s.tomFalta]}>{`${n} de ${de}`}</Text>
      </View>
      <View style={s.barra}>{Array.from({ length: de }, (_, i) => <View key={i} style={[s.barraSeg, i < n && (completo ? s.barraOk : s.barraParcial)]} />)}</View>
    </View>
  );
}

/* ══ AS 4 ARMAS ══ chips de 40 px, a etiqueta de origem à direita do rótulo; nunca trava o Avançar */
function SecaoArmas({ armas, etiqueta, outroSistema, aoOutro, abertos, aoAbrir, mudar }: {
  armas: Armas | null; etiqueta: (k: ChaveArma) => { texto: string; tom: 'ok' | 'falta' };
  outroSistema: boolean; aoOutro: (v: boolean) => void; mudar: (m: Partial<Armas>) => void;
  /* "Outra"/"Outro" (14/10/26): com o campo aberto, a arma guarda o TEXTO digitado; o envio ao
     HubSpot (enviosDasArmas) já só manda o que é do enum, então o texto fica na folha */
  abertos: Abertos; aoAbrir: (m: Partial<Abertos>) => void;
}) {
  if (!armas) return <View style={s.armas}><ActivityIndicator /></View>;
  const chip = (chave: string, rotulo: string, ativo: boolean, aoTocar: () => void) => (
    <Pressable key={chave} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={aoTocar} style={[s.chip, ativo && s.chipAtivo]}>
      <Text style={[s.chipTexto, ativo && s.chipTextoAtivo]}>{rotulo}</Text>
    </Pressable>
  );
  const rotulo = (k: ChaveArma, texto: string) => {
    const e = etiqueta(k);
    return (
      <View style={s.armaCab}>
        <Text style={s.campoRotulo}>{texto}</Text>
        <Text style={[s.tag, e.tom === 'ok' ? s.tagOk : s.tagFalta]}>{e.texto}</Text>
      </View>
    );
  };
  return (
    <View style={s.armas}>
      {rotulo('sistema', 'Sistema que usa hoje')}
      <View style={s.chips}>
        {SISTEMAS_ARMAS.map((sis) => chip(sis, sis, sis === 'Outro' ? outroSistema : !outroSistema && chipDoSistema(armas.sistema) === sis, () => {
          if (sis === 'Outro') { aoOutro(true); mudar({ sistema: '' }); } else { aoOutro(false); mudar({ sistema: armas.sistema === sis ? '' : sis }); }
        }))}
      </View>
      {outroSistema && (
        <TextInput style={[s.input, !armas.sistema && s.inputFalta]} value={armas.sistema} onChangeText={(v) => mudar({ sistema: v })} placeholder="Qual sistema? (ex.: Yooga, xMenu)" placeholderTextColor="#8B919C" />
      )}
      {rotulo('dor', 'Maior dor')}
      <View style={s.chips}>
        {GARGALOS.map((g) => chip(g, g, !abertos.dor && armas.dor === g, () => { aoAbrir({ dor: false }); mudar({ dor: !abertos.dor && armas.dor === g ? '' : g }); }))}
        {chip(GARGALO_OUTRA, GARGALO_OUTRA, abertos.dor, () => { aoAbrir({ dor: !abertos.dor }); mudar({ dor: '' }); })}
      </View>
      {abertos.dor && (
        <TextInput style={[s.input, !armas.dor && s.inputFalta]} value={armas.dor} onChangeText={(v) => mudar({ dor: v })} placeholder="Qual é a dor?" placeholderTextColor="#8B919C" maxLength={200} />
      )}
      {rotulo('decisor', 'Quem decide')}
      <View style={s.decisorLinha}>
        <TextInput style={[s.input, s.decisorInput, !armas.decisor && s.inputFalta]} value={armas.decisor} onChangeText={(v) => mudar({ decisor: v })} placeholder="Nome de quem assina" placeholderTextColor="#8B919C" />
        {PAPEIS.map((p) => (p === 'Outro'
          ? chip(p, p, abertos.papel, () => { aoAbrir({ papel: !abertos.papel }); mudar({ papel: '' }); })
          : chip(p, p, !abertos.papel && armas.papel === p, () => { aoAbrir({ papel: false }); mudar({ papel: !abertos.papel && armas.papel === p ? '' : p }); })))}
      </View>
      {abertos.papel && (
        <TextInput style={s.input} value={armas.papel} onChangeText={(v) => mudar({ papel: v })} placeholder="Ex.: chef, filho do dono" placeholderTextColor="#8B919C" maxLength={40} />
      )}
      {rotulo('horario', 'Melhor horário para achar')}
      <View style={s.chips}>
        {HORARIOS.map((h) => (h.valor === HORARIO_OUTRO
          ? chip(h.valor, h.rotulo, abertos.horario, () => { aoAbrir({ horario: !abertos.horario }); mudar({ horario: '' }); })
          : chip(h.valor, h.rotulo, !abertos.horario && armas.horario === h.valor, () => { aoAbrir({ horario: false }); mudar({ horario: !abertos.horario && armas.horario === h.valor ? '' : h.valor }); })))}
      </View>
      {abertos.horario && (
        <TextInput style={[s.input, !armas.horario && s.inputFalta]} value={armas.horario} onChangeText={(v) => mudar({ horario: v })} placeholder="Ex.: só sábado de manhã" placeholderTextColor="#8B919C" maxLength={80} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  armas: { gap: 8 },
  armaCab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 },
  tag: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  tagOk: { color: 'var(--tint-green-text)', backgroundColor: 'var(--tint-green)' },
  tagFalta: { color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)' },
  topo: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  tituloFolha: { fontSize: 19, fontWeight: '700', color: 'var(--text)' },
  subFolha: { fontSize: 13, color: 'var(--text-muted)' },
  titulo: { fontSize: 18, fontWeight: '800', color: 'var(--text)', paddingHorizontal: 16, paddingVertical: 12 },
  progLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  progTexto: { flex: 1, fontSize: 13, color: 'var(--text-muted)' },
  progN: { fontSize: 13, fontWeight: '800' },
  tomOk: { color: 'var(--tint-green-text)' },
  tomFalta: { color: 'var(--tint-amber-text)' },
  barra: { flexDirection: 'row', gap: 4 },
  barraSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'var(--border)' },
  barraOk: { backgroundColor: 'var(--tint-green-text)' },
  barraParcial: { backgroundColor: 'var(--tint-amber-text)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 },
  linhaInativa: { opacity: 0.5 },
  linhaNum: { width: 22, textAlign: 'center', fontSize: 14, fontWeight: '800', color: 'var(--text-muted)' },
  linhaRotulo: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  linhaAtual: { color: 'var(--brand-text)' },
  linhaMotivo: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  divisor: { height: 1, backgroundColor: 'var(--border-soft)', marginVertical: 6 },
  ajuda: { fontSize: 13, color: 'var(--text-muted)' },
  secao: { fontSize: 14, fontWeight: '800', color: 'var(--text)', marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  aviso: { fontSize: 14, color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)', padding: 12, borderRadius: 12 },
  recusa: { fontSize: 14, color: 'var(--tint-red-text)', backgroundColor: 'var(--tint-red)', padding: 12, borderRadius: 12 },
  campoBloco: { gap: 6 },
  campoRotulo: { fontSize: 14, fontWeight: '800', color: 'var(--text)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', justifyContent: 'center' },
  chipAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  chipTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  chipTextoAtivo: { color: 'var(--tint-red-text)' },
  decisorLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  decisorInput: { flexGrow: 1, flexBasis: 160, minWidth: 0 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', paddingHorizontal: 12, fontSize: 16, color: 'var(--text)' },
  inputFalta: { borderColor: 'var(--tint-amber-border)' },
  erro: { fontSize: 12, color: 'var(--tint-red-text)' },
  trocar: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  trocarTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text-muted)', textDecorationLine: 'underline' },
  rodape: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rodapeCol: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  botao: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botao52: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botao48: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 4 },
  botaoSec: { flex: 1, borderWidth: 1, borderColor: 'var(--border)' },
  botaoSecTexto: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
  botaoSecNota: { fontSize: 12, color: 'var(--text-muted)' },
  botaoPrin: { flex: 2, backgroundColor: 'var(--vermelho-acao)' },
  botaoPrinTexto: { fontSize: 15, fontWeight: '800', color: '#fff' },
  fundoPrin: { backgroundColor: 'var(--vermelho-acao)' },
  bordaSec: { borderWidth: 1, borderColor: 'var(--border)' },
  botaoInerte: { backgroundColor: 'var(--surface-2)' },
  legendaRodape: { fontSize: 12.5, fontWeight: '500', color: 'var(--text-muted)', textAlign: 'center' },
  fatoLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderBottomWidth: 1, borderBottomColor: 'var(--border-soft)' },
  fatoRotulo: { width: 96, fontSize: 12.5, fontWeight: '500', color: 'var(--text-muted)' },
  fatoValor: { flex: 1, fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  fatoOrigem: { fontSize: 11.5, fontWeight: '500', color: 'var(--text-muted)' },
  armasTopo: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', marginTop: 4 },
  armasTitulo: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  armasSeta: { fontSize: 20, fontWeight: '600', color: 'var(--text-muted)', paddingHorizontal: 4 },
  botaoInerteTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text-muted)', textAlign: 'center' },
});
