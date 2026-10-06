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
// ANTES DA DEMO (Raio X › Praça, 06/10/26): avançar para Demo/Proposta mostra as 4 armas
// (sistema, dor, quem decide, horário) com a origem de cada uma. Completo, a folha nem
// abre. Faltando, "Avançar sem preencher" move do mesmo jeito e grava a falta em
// gv2_falta_etapa, que o gestor vê no Raio X ("obrigatório é avisar, não travar"). Os
// campos que o HubSpot exige para a etapa (plano, MRR, data) continuam obrigatórios.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CampoData } from '../components/CampoData';
import { Painel } from '../components/Painel';
import { Toast } from '../components/Toast';
import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';
import { enfileirar, ehErroDeRede, novoAcaoId } from '../utils/filaOffline';
import {
  ETAPA, ETAPAS_DA_FOLHA, GARGALOS, HORARIOS, MOTIVOS_PERDIDO, MOTIVOS_QUE_EXIGEM_TEXTO, PAPEIS, PICKLIST, PROPS_OBRIGATORIAS_POR_ETAPA, ROTULO_ETAPA,
  ROTULO_PROP, TIPO_CAMPO, montarPropriedades, movimentoPermitido,
} from '../utils/fichaDeRua';
import {
  SISTEMAS_ARMAS, armasConhecidas, armasQueFaltam, enviosDasArmas, fichasDaFolha, registroDoAvanco, rotuloDasFaltas,
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
const CHAVES: ChaveArma[] = ['sistema', 'dor', 'decisor', 'horario'];
const ddmm = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '');

export default function MudarEtapaNovo({ visivel, client, etapaAtual, onFechar, onMudou, destinoInicial = null, preenchido = null, soArmas = false }: Props) {
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
  const [jaTemPronto, setJaTemPronto] = useState(false);
  /* com tudo sabido, a folha nem abre: até decidir, o painel fica fechado */
  const [decidido, setDecidido] = useState(false);
  const dealId = client.id_hubspot ? String(client.id_hubspot) : null;
  const execId = client.vendedor_id_hubspot ? String(client.vendedor_id_hubspot) : null;
  const nome = client.empresa?.trim() || client.nome;

  useEffect(() => {
    if (!visivel) return;
    setDestino(soArmas ? null : destinoInicial); setDigitado(preenchido ? { ...preenchido } : {}); setErros({}); setRecusa(null);
    setArmas(null); setConhecidas(null); setTocadas({}); setOutroSistema(false); setJaTemPronto(false); setFichas(null); setDaFolha([]);
    setDecidido(!(destinoInicial === ETAPA.demo || soArmas) || !dealId);
    if (client.id) {
      void supabase.from('fichas_de_rua').select('ocorrido_em, decisor_nome, decisor_papel, horario_dono, sistema, dor')
        .eq('client_id', client.id).order('ocorrido_em', { ascending: false }).limit(10)
        .then(({ data }) => setFichas((data ?? []) as FichaArmas[]), () => setFichas([]));
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
    Promise.all([
      supabase.rpc('mapa_negocio', { p_deal: dealId }).then(({ data }) => (data as Record<string, unknown>) ?? {}, () => ({})),
      client.vendedor_id_hubspot
        ? supabase.functions.invoke('hubspot-sync', { body: { type: 'ler_negocio', id_hubspot: dealId, owner_id: String(client.vendedor_id_hubspot) } })
            .then(({ data }) => ((data as { propriedades?: Record<string, unknown> } | null)?.propriedades ?? {}), () => ({}))
        : Promise.resolve({}),
    ]).then(([snap, aoVivo]) => { if (vivo) { setJaTem({ ...base, ...snap, ...aoVivo }); setJaTemPronto(true); } });
    /* rede lenta: em 2,5 s a folha abre de qualquer jeito, com as armas carregando */
    const t = setTimeout(() => { if (vivo) setDecidido(true); }, 2500);
    return () => { vivo = false; clearTimeout(t); };
  }, [visivel, dealId, destinoInicial, soArmas]); // eslint-disable-line react-hooks/exhaustive-deps

  const ehDemo = destino === ETAPA.demo && !!dealId;
  const ehNeg = destino === ETAPA.negociacao && !!dealId;
  const comArmas = (ehDemo || soArmas) && !!dealId;
  const todasFichas = fichas == null ? null : [...daFolha, ...fichas];
  /* as armas nascem quando o negócio e as fichas chegaram: preenchidas com o que se sabe */
  useEffect(() => {
    if (!comArmas || armas || !jaTemPronto || todasFichas == null) return;
    const k = armasConhecidas(jaTem, todasFichas);
    setArmas(k); setConhecidas(k);
    setOutroSistema(!!k.sistema && !(SISTEMAS_ARMAS as readonly string[]).includes(k.sistema));
  }, [comArmas, armas, jaTemPronto, todasFichas, jaTem]);

  const exigidos = destino
    ? [...(PROPS_OBRIGATORIAS_POR_ETAPA[destino] ?? []),
      ...(destino === ETAPA.perdido && MOTIVOS_QUE_EXIGEM_TEXTO.includes(digitado.motivo_do_perdido ?? '') ? ['observacao__desqualificado'] : [])]
      .filter((k) => k === 'motivo_do_perdido' || k === 'observacao__desqualificado' || !(jaTem[k] != null && String(jaTem[k]).trim()))
    : [];
  const faltamArmas = armas ? armasQueFaltam(armas).length : 4;
  const faltamExig = exigidos.filter((k) => !String(digitado[k] ?? '').trim()).length;

  /* COMPLETO NÃO ABRE: sistema, dor, decisor e horário já sabidos e nada que a etapa peça */
  useEffect(() => {
    if (!visivel || decidido || soArmas || destinoInicial !== ETAPA.demo || !armas || !jaTemPronto) return;
    if (faltamArmas === 0 && exigidos.length === 0) void confirmar('auto');
    else setDecidido(true);
  }, [visivel, decidido, armas, jaTemPronto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (soArmas && armas && !decidido) setDecidido(true); }, [soArmas, armas, decidido]);

  /** grava o que se sabia e o que faltou (o gestor vê no Raio X); nunca segura a etapa */
  function registrar(etapa: string) {
    if (!dealId || !execId || !armas) return;
    void supabase.from('gv2_falta_etapa').insert(registroDoAvanco({ dealId, execId, etapa, armas }))
      .then(({ error }) => { if (error) console.warn('[gv2_falta_etapa]', error.message); });
  }
  function mandarArmas() {
    if (!dealId || !armas || !conhecidas) return 0;
    const envios = enviosDasArmas({ dealId, ownerId: execId, negocio: jaTem, armas, decisorNoNegocio: !armas.decisor || armas.decisor === conhecidas.decisor });
    for (const e of envios) {
      void supabase.functions.invoke('hubspot-sync', { body: e.corpo }).then(({ error }) => {
        if (error) Toast.mostrar(`${e.rotulo} não foi ao HubSpot: ${error.message}`, 'erro');
      });
    }
    return envios.length;
  }

  async function salvarSoArmas() {
    if (!armas || enviando) return;
    setEnviando(true);
    const n = mandarArmas();
    registrar('armas');
    Toast.mostrar(n ? `Armas de ${nome} salvas · HubSpot + Cockpit` : `Armas de ${nome} salvas no Cockpit`, 'ok');
    setEnviando(false);
    onFechar();
  }

  async function confirmar(modo: 'com' | 'sem' | 'auto' = 'com') {
    if (!destino || !dealId || enviando) return;
    const { propriedades, erros: e } = montarPropriedades(destino, digitado, jaTem);
    setErros(e);
    if (Object.keys(e).length) { setDecidido(true); return; }
    setEnviando(true); setRecusa(null);
    const corpo = { op: 'mudar-etapa', dealId, novaEtapa: destino, propriedades };
    try {
      await negocioAcao(corpo);
      onMudou(destino, propriedades as Record<string, unknown>);
      /* AS ARMAS VÃO DEPOIS DA ETAPA, pelas rotas da ficha de visita: a etapa é o que o
         executivo pediu; as armas são complemento e não podem segurá-la */
      if (ehDemo && armas) {
        const n = mandarArmas();
        registrar(ROTULO_ETAPA[destino]);
        const falta = rotuloDasFaltas(armas);
        if (modo === 'auto') Toast.mostrar(`Movido para ${ROTULO_ETAPA[destino]} · as 4 armas já estavam na ficha`, 'ok');
        else if (falta) Toast.mostrar(`Movido para ${ROTULO_ETAPA[destino]} sem ${falta} · o gestor vê a falta`, 'aviso');
        else Toast.mostrar(`${nome} foi para ${ROTULO_ETAPA[destino]} · HubSpot + Cockpit${n ? ' · armas no negócio' : ''}`, 'ok');
      } else {
        Toast.mostrar(`${nome} foi para ${ROTULO_ETAPA[destino]} · HubSpot + Cockpit`, 'ok');
      }
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
    const opcoes = k === 'motivo_do_perdido' ? MOTIVOS_PERDIDO.map((m) => m.valor) : PICKLIST[k];
    return (
      <View key={k} style={s.campoBloco}>
        <Text style={s.campoRotulo}>{k === 'observacao__desqualificado' ? 'O que pesou' : (ROTULO_PROP[k] ?? k).replace(/^./, (c) => c.toUpperCase())}</Text>
        {tipo === 'selecao' && opcoes ? (
          <View style={s.chips}>
            {opcoes.map((o) => (
              <Pressable key={o} accessibilityRole="button" accessibilityState={{ selected: digitado[k] === o }}
                onPress={() => setDigitado((d) => ({ ...d, [k]: o }))} style={[s.chip, digitado[k] === o && s.chipAtivo]}>
                <Text style={[s.chipTexto, digitado[k] === o && s.chipTextoAtivo]}>{ROTULO_PICK[o] ?? o}</Text>
              </Pressable>
            ))}
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
          />
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
  const nPlano = 2 - exigidos.filter((k) => k === 'plano_apresentado' || k === 'valor_de_mrr').filter((k) => !String(digitado[k] ?? '').trim()).length;
  const faltamTudo = faltamArmas + faltamExig;

  const rodapeArmas = (
    <View style={s.rodapeCol}>
      {soArmas ? (
        <Pressable accessibilityRole="button" style={[s.botao52, s.fundoPrin]} onPress={salvarSoArmas} disabled={enviando || !armas}>
          {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoPrinTexto}>Salvar as armas</Text>}
        </Pressable>
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: faltamTudo > 0 }} style={[s.botao52, faltamTudo > 0 ? s.botaoInerte : s.fundoPrin]}
            onPress={() => confirmar('com')} disabled={enviando || faltamTudo > 0}>
            {enviando ? <ActivityIndicator color="#fff" /> : (
              <Text style={faltamTudo > 0 ? s.botaoInerteTexto : s.botaoPrinTexto}>
                {faltamTudo > 0 ? `${faltamTudo === 1 ? 'Falta 1' : `Faltam ${faltamTudo}`} para avançar com isso` : 'Avançar com isso'}
              </Text>
            )}
          </Pressable>
          {ehDemo && faltamArmas > 0 && (
            <Pressable accessibilityRole="button" style={[s.botao48, s.bordaSec]} onPress={() => confirmar('sem')} disabled={enviando}
              accessibilityHint="move a etapa e registra o que faltou; o gestor vê">
              <Text style={s.botaoSecTexto}>Avançar sem preencher</Text>
              <Text style={s.botaoSecNota}>a falta fica registrada e o gestor vê</Text>
            </Pressable>
          )}
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
            <SecaoArmas armas={armas} etiqueta={etiqueta} outroSistema={outroSistema} aoOutro={setOutroSistema} mudar={mudar} />
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
            onFechar={() => { setDestino(null); onFechar(); }}
            onEmitida={(codigo) => onMudou(codigo)}
          />
        ) : ehDemo ? (
          <View style={{ gap: 12 }}>
            <Progresso texto="Sistema e dor são suas armas na Demo, e o gestor estuda a praça com elas." n={nDe4} de={4} />
            <SecaoArmas armas={armas} etiqueta={etiqueta} outroSistema={outroSistema} aoOutro={setOutroSistema} mudar={mudar} />
            {!!exigidos.length && <Text style={s.secao}>{`O HubSpot pede para ${ROTULO_ETAPA[destino]}`}</Text>}
            {exigidos.map(campo)}
            {!!recusa && <Text style={s.recusa}>{`O servidor recusou: ${recusa}`}</Text>}
            {!destinoInicial && <Pressable accessibilityRole="button" onPress={() => setDestino(null)} style={s.trocar}><Text style={s.trocarTexto}>Escolher outra etapa</Text></Pressable>}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {ehNeg
              ? <Progresso texto="Plano e MRR alimentam a proposta e o link de cobrança." n={nPlano} de={2} />
              : <Text style={s.ajuda}>{exigidos.length ? 'Esta etapa pede:' : 'Nada a preencher — é só confirmar.'}</Text>}
            {ehNeg && !exigidos.length && <Text style={s.ajuda}>Plano e MRR já estão no negócio — é só confirmar.</Text>}
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
function SecaoArmas({ armas, etiqueta, outroSistema, aoOutro, mudar }: {
  armas: Armas | null; etiqueta: (k: ChaveArma) => { texto: string; tom: 'ok' | 'falta' };
  outroSistema: boolean; aoOutro: (v: boolean) => void; mudar: (m: Partial<Armas>) => void;
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
        {SISTEMAS_ARMAS.map((sis) => chip(sis, sis, sis === 'Outro' ? outroSistema : !outroSistema && armas.sistema === sis, () => {
          if (sis === 'Outro') { aoOutro(true); mudar({ sistema: '' }); } else { aoOutro(false); mudar({ sistema: armas.sistema === sis ? '' : sis }); }
        }))}
      </View>
      {outroSistema && (
        <TextInput style={[s.input, !armas.sistema && s.inputFalta]} value={armas.sistema} onChangeText={(v) => mudar({ sistema: v })} placeholder="Qual sistema? (ex.: Yooga, xMenu)" placeholderTextColor="#8B919C" />
      )}
      {rotulo('dor', 'Maior dor')}
      <View style={s.chips}>{GARGALOS.map((g) => chip(g, g, armas.dor === g, () => mudar({ dor: armas.dor === g ? '' : g })))}</View>
      {rotulo('decisor', 'Quem decide')}
      <View style={s.decisorLinha}>
        <TextInput style={[s.input, s.decisorInput, !armas.decisor && s.inputFalta]} value={armas.decisor} onChangeText={(v) => mudar({ decisor: v })} placeholder="Nome de quem assina" placeholderTextColor="#8B919C" />
        {PAPEIS.map((p) => chip(p, p, armas.papel === p, () => mudar({ papel: armas.papel === p ? '' : p })))}
      </View>
      {rotulo('horario', 'Melhor horário para achar')}
      <View style={s.chips}>{HORARIOS.map((h) => chip(h.valor, h.rotulo, armas.horario === h.valor, () => mudar({ horario: armas.horario === h.valor ? '' : h.valor })))}</View>
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
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', justifyContent: 'center' },
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
  botaoInerteTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text-muted)', textAlign: 'center' },
});
