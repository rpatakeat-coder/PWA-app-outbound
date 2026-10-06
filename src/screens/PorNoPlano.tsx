// PÔR NO PLANO (Claude Design "entrega-um-plano-so", A5–A7 / C2–C5, 06/10/2026).
//
// O mapa planeja: do pino, o executivo escolhe o que vai fazer (7 chips, o sugerido pela
// etapa já marcado), o dia (com a contagem de paradas, o cheio a 15 e o sugerido pela rota)
// e, se quiser, a hora (cadeado). As três linhas de "O que acontece" mudam ao vivo. Pino que
// já está no plano: outro dia MOVE, o mesmo dia ATUALIZA, e há "Tirar do plano". Grava pelas
// funções de src/utils/planoDoPino.ts. Nada trava o salvar ("obrigatório é avisar").
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Painel } from '../components/Painel';
import { Toast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useMeetings } from '../hooks/useMeetings';
import type { Client } from '../types/client';
import { ACOES, LIMITE_DO_DIA, acaoPorId, acaoSugerida, diaComEspaco, diaSugerido, propositoDaAcao, type AcaoId } from '../utils/acoesDoPlano';
import { ehErroDeRede } from '../utils/filaOffline';
import { diasPlanejaveis, rotuloDoDia, vaiAoCockpit } from '../utils/planoNoMapa';
import { avisarQueOPlanoMudou, lerPlanoDosDias, ondeEsta, porNoPlano, tirarDoPlano, type OndeEsta, type PlanoLido } from '../utils/planoDoPino';

type Props = {
  visivel: boolean;
  client: Client;
  /** Código da etapa do negócio (ETAPA.*), ou null em conta-alvo. */
  etapaCodigo: string | null;
  tipoPino: string | null;
  cor: string;
  onFechar: () => void;
  /** depois de gravar: o dia, para a Agenda abrir nele */
  onFeito?: (dia: string) => void;
};

const HORAS = ['09:00', '10:00', '11:00', '14:00', '15:00', '15:30', '16:00', '17:00'];
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const agoraBRT = () => new Date(Date.now() - 3 * 3600000);
const ordinal = (n: number) => `${n}ª`;

export default function PorNoPlano({ visivel, client, etapaCodigo, tipoPino, cor, onFechar, onFeito }: Props) {
  const { user } = useAuth();
  const { addMeeting } = useMeetings();
  const uid = user?.id ?? null;
  const hoje = agoraBRT().toISOString().slice(0, 10);
  const horaAgora = agoraBRT().getUTCHours();
  const dias = useMemo(() => diasPlanejaveis(hoje, 5), [hoje]);
  const isos = dias.map((d) => d.iso);
  const nome = client.empresa?.trim() || client.nome;
  const sugerida = acaoSugerida({ etapa: etapaCodigo, tipoPino, cliente: client.status === 'cliente' || client.status === 'ganho_fs' });

  const [plano, setPlano] = useState<PlanoLido | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [antes, setAntes] = useState<OndeEsta | null>(null);
  const [acao, setAcao] = useState<AcaoId>(sugerida.id);
  const [dia, setDia] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [outraHora, setOutraHora] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!visivel || !uid) return;
    let vivo = true;
    setPlano(null); setErroLeitura(null); setAntes(null); setAcao(sugerida.id); setHora(null); setOutraHora(''); setDia(null);
    lerPlanoDosDias(uid, isos).then((p) => {
      if (!vivo) return;
      setPlano(p);
      const onde = ondeEsta(client.id, p, isos);
      setAntes(onde);
      if (onde) {
        setDia(onde.dia);
        if (onde.acao && acaoPorId(onde.acao)) setAcao(onde.acao as AcaoId);
        setHora(onde.hora);
      }
    }, (e) => { if (vivo) setErroLeitura(String((e as Error)?.message ?? e)); });
    return () => { vivo = false; };
  }, [visivel, uid, client.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const contagem = plano?.contagem ?? {};
  const ponto = client.latitude != null && client.longitude != null ? { lat: Number(client.latitude), lng: Number(client.longitude) } : null;
  const sugestaoDia = useMemo(() => (plano ? diaSugerido({ dias: isos, hoje, horaBRT: horaAgora, ponto, contagem, pontosDoDia: plano.paradas }) : null), [plano]); // eslint-disable-line react-hooks/exhaustive-deps
  const escolhido = dia ?? sugestaoDia?.dia ?? isos[0];
  const amanha = new Date(Date.parse(`${hoje}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const nomeDoDia = (d: string) => (d === hoje ? 'hoje' : d === amanha ? 'amanhã' : SEMANA_LONGA[new Date(`${d}T12:00:00Z`).getUTCDay()]);
  const a = acaoPorId(acao)!;
  const contaAlvo = !client.id_hubspot && !!client.lead_prospeccao_id;
  const jaNoDia = !!antes && antes.dia === escolhido;
  const cheio = !jaNoDia && (contagem[escolhido] ?? 0) >= LIMITE_DO_DIA && a.ehParada;
  const alternativo = cheio ? diaComEspaco(isos, contagem, escolhido) : null;
  const diaFinal = cheio ? alternativo : escolhido;
  const mudou = !!antes && (antes.dia !== escolhido || (antes.acao ?? null) !== acao || (antes.hora ?? null) !== hora);
  const ordemPrevista = jaNoDia ? antes!.ordem : (diaFinal ? (contagem[diaFinal] ?? 0) + 1 : null);

  async function confirmar() {
    if (!uid || !diaFinal || enviando) return;
    setEnviando(true);
    try {
      const r = await porNoPlano({
        uid, client, dia: diaFinal, acao, hora, antes,
        criarCompromisso: async ({ tipo, acao: ac, quando }) => {
          await addMeeting.mutateAsync({ form: { client_id: client.id, scheduled_at: quando, duration_minutes: 30, observacoes: null, type: tipo, acao: ac }, client });
        },
      });
      const onde = a.ehParada ? `${r.ordem ? ordinal(r.ordem) + ' de ' : ''}${nomeDoDia(diaFinal)}` : `Ligar · ${nomeDoDia(diaFinal)}`;
      Toast.mostrar(`${nome} · ${onde} · ${vaiAoCockpit(client) ? 'já no Planejamento do Cockpit' : 'na rota do app'}`, 'ok');
      avisarQueOPlanoMudou();
      onFeito?.(diaFinal);
      onFechar();
    } catch (e) {
      Toast.mostrar(ehErroDeRede(e) ? 'Sem sinal agora: nada foi gravado. Tente de novo quando o sinal voltar.' : `Não entrou no plano: ${String((e as Error)?.message ?? e)}`, 'erro');
    } finally {
      setEnviando(false);
    }
  }
  async function tirar() {
    if (!uid || !antes || enviando) return;
    setEnviando(true);
    try { await tirarDoPlano(uid, client.id, antes.dia); avisarQueOPlanoMudou(); Toast.mostrar(`${nome} saiu do plano de ${nomeDoDia(antes.dia)}`, 'ok'); onFechar(); }
    catch (e) { Toast.mostrar(`Não saiu do plano: ${String((e as Error)?.message ?? e)}`, 'erro'); }
    finally { setEnviando(false); }
  }

  const rotuloBotao = !diaFinal ? 'Nenhum dia com espaço'
    : cheio ? `Pôr no plano de ${nomeDoDia(diaFinal)} · ${contagem[diaFinal] ?? 0} paradas`
      : antes && antes.dia !== escolhido ? `Mover para ${nomeDoDia(escolhido)}`
        : antes && !mudou ? `Já está no plano de ${nomeDoDia(escolhido)}`
          : antes ? `Atualizar o plano de ${nomeDoDia(escolhido)}`
            : `Pôr no plano de ${nomeDoDia(escolhido)}`;
  const inativo = !diaFinal || (!!antes && !mudou && !cheio);

  return (
    <Painel visivel={visivel} aoFechar={onFechar} rotulo="Pôr no plano"
      topo={(
        <View style={s.topo}>
          <View style={[s.bola, { backgroundColor: cor }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.titulo}>{antes ? 'Mudar no plano' : 'Pôr no plano'}</Text>
            <Text style={s.sub} numberOfLines={1}>{nome}</Text>
          </View>
        </View>
      )}
      rodape={(
        <View style={s.rodape}>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: inativo || enviando }} disabled={inativo || enviando} onPress={confirmar}
            style={[s.botao, inativo ? s.botaoInerte : s.botaoPrin]}>
            {enviando ? <ActivityIndicator color="#fff" /> : <Text style={inativo ? s.botaoInerteTexto : s.botaoPrinTexto}>{rotuloBotao}</Text>}
          </Pressable>
          {antes && !antes.feita && !mudou
            ? <Pressable accessibilityRole="button" onPress={tirar} disabled={enviando} style={[s.botaoSec]}><Text style={s.botaoSecTexto}>Tirar do plano</Text></Pressable>
            : <Pressable accessibilityRole="button" onPress={onFechar} disabled={enviando} style={[s.botaoSec]}><Text style={s.botaoSecTexto}>Cancelar</Text></Pressable>}
        </View>
      )}
    >
      <View style={s.corpo}>
        {!uid ? <Text style={s.aviso}>Entre de novo no app para planejar.</Text>
          : erroLeitura ? <Text style={s.aviso}>{`Não consegui ler o seu plano: ${erroLeitura}`}</Text>
            : !plano ? <ActivityIndicator /> : (
              <>
                {antes && (
                  <View style={s.faixaAzul}>
                    <Text style={s.faixaAzulTitulo}>{`Já está no plano de ${nomeDoDia(antes.dia)}, ${rotuloDoDia(antes.dia).slice(4)}`}</Text>
                    <Text style={s.faixaAzulSub}>{`${ordinal(antes.ordem)} parada${antes.acao ? ` · ${acaoPorId(antes.acao)?.rotulo}` : ''}${antes.hora ? ` às ${antes.hora} com cadeado` : ''}. Outro dia move, não duplica.`}</Text>
                  </View>
                )}
                <Text style={s.secao}>O que vai fazer</Text>
                <View style={s.chips}>
                  {ACOES.map((x) => {
                    const ativo = x.id === acao;
                    return (
                      <Pressable key={x.id} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={() => setAcao(x.id)} style={[s.chip, ativo && s.chipAtivo]}>
                        <Text style={[s.chipTexto, ativo && s.chipTextoAtivo]}>{x.rotulo}</Text>
                        {x.id === sugerida.id && <Text style={s.chipSelo}>sugerido</Text>}
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={s.ajuda}>{`Sugerido pela etapa: ${sugerida.motivo}`}</Text>

                <Text style={s.secao}>Quando</Text>
                <View style={s.dias}>
                  {dias.map((d) => {
                    const n = contagem[d.iso] ?? 0;
                    const aqui = antes?.dia === d.iso;
                    const ativo = d.iso === escolhido;
                    const rot = aqui ? 'está aqui' : n >= LIMITE_DO_DIA ? `cheio · ${LIMITE_DO_DIA}` : n ? `${n} ${n === 1 ? 'parada' : 'paradas'}` : 'vazio';
                    return (
                      <Pressable key={d.iso} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={() => setDia(d.iso)} style={[s.dia, ativo && s.diaAtivo]}>
                        {sugestaoDia?.dia === d.iso && !antes && <View style={s.pontoSugerido} />}
                        <Text style={[s.diaCurto, ativo && s.diaTextoAtivo]}>{d.rotulo.slice(0, 3).toUpperCase()} {d.iso.slice(8, 10)}</Text>
                        <Text style={[s.diaNome, ativo && s.diaTextoAtivo]}>{d.hoje ? 'Hoje' : nomeDoDia(d.iso).replace(/^./, (c) => c.toUpperCase())}</Text>
                        <Text style={[s.diaConta, n >= LIMITE_DO_DIA && !aqui && s.tomAviso]}>{rot}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {sugestaoDia && !antes && !cheio && <Text style={s.sugerido}>{`Sugerido: ${nomeDoDia(sugestaoDia.dia)} ${sugestaoDia.motivo}`}</Text>}
                {cheio && (
                  <View style={s.faixaAmbar}>
                    <Text style={s.faixaAmbarTitulo}>{`${nomeDoDia(escolhido).replace(/^./, (c) => c.toUpperCase())} já tem ${LIMITE_DO_DIA} paradas`}</Text>
                    <Text style={s.faixaAmbarSub}>{alternativo ? 'É o máximo do Planejamento. O botão põe no dia mais perto com espaço.' : 'É o máximo do Planejamento e não há outro dia com espaço nesta semana.'}</Text>
                  </View>
                )}

                <View style={s.horaCab}><Text style={s.secao}>Hora</Text><Text style={s.opcional}>opcional</Text></View>
                <View style={s.chips}>
                  {[null, ...HORAS].map((h) => {
                    const ativo = (hora ?? null) === h;
                    return (
                      <Pressable key={h ?? 'sem'} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={() => { setHora(h); setOutraHora(''); }} style={[s.pilula, ativo && s.pilulaAtiva]}>
                        <Text style={[s.pilulaTexto, ativo && s.pilulaTextoAtivo]}>{h ?? 'Sem hora'}</Text>
                      </Pressable>
                    );
                  })}
                  <TextInput style={[s.pilula, s.outraHora, hora && !HORAS.includes(hora) && s.pilulaAtiva]} value={outraHora} placeholder="outra" placeholderTextColor="#8B919C" maxLength={5}
                    onChangeText={(v) => { const t = v.replace(/[^0-9:]/g, ''); setOutraHora(t); if (/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) setHora(t); }} accessibilityLabel="Outra hora (HH:MM)" />
                </View>
                <Text style={s.ajuda}>{hora ? `Com cadeado: ${hora} combinado com o cliente. Prende o horário, não a posição.` : 'Sem hora: entra na ordem da rota e a hora é estimada pelo caminho.'}</Text>

                <View style={s.acontece}>
                  <Text style={s.aconteceRot}>O QUE ACONTECE</Text>
                  <Text style={s.linha}>{a.ehParada ? `Entra como ${ordemPrevista ? ordinal(ordemPrevista) : 'nova'} de ${diaFinal ? nomeDoDia(diaFinal) : '—'}${hora ? `, às ${hora} com cadeado` : ''}` : `Ligar não é parada de rua: fica nas Ligações do dia de ${diaFinal ? nomeDoDia(diaFinal) : '—'}`}</Text>
                  <Text style={s.linhaSub}>{a.ehParada ? (hora ? 'A rota se ajusta em volta do horário combinado' : 'A hora sai do caminho') : 'sem posição na rota'}</Text>
                  <Text style={s.linha}>{vaiAoCockpit(client) && a.ehParada ? `Planejamento do Cockpit · ${diaFinal ? rotuloDoDia(diaFinal) : '—'} · ${a.rotulo}` : a.ehParada ? 'Sem negócio nem conta-alvo: fica na rota do app' : `Agenda do app · Ligar · ${diaFinal ? rotuloDoDia(diaFinal) : '—'}`}</Text>
                  {vaiAoCockpit(client) && a.ehParada && <Text style={s.linhaSub}>{`Propósito na grade: ${propositoDaAcao(acao, contaAlvo)}${antes && antes.dia !== escolhido ? ` · sai de ${nomeDoDia(antes.dia)}` : ''}`}</Text>}
                  <Text style={s.linha}>{!hora ? 'Sem hora: nada novo no HubSpot' : client.id_hubspot ? `HubSpot · ${a.hubspot} ${diaFinal ? rotuloDoDia(diaFinal).slice(4) : ''} ${hora}` : 'Sem negócio no HubSpot: a hora fica só no plano'}</Text>
                  <Text style={s.linhaSub}>{!hora ? `com hora, vira ${a.hubspot}` : 'vira o próximo passo do negócio'}</Text>
                </View>
              </>
            )}
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  bola: { width: 14, height: 14, borderRadius: 7 },
  titulo: { fontSize: 19, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  secao: { fontSize: 14, fontWeight: '800', color: 'var(--text)', marginTop: 8 },
  ajuda: { fontSize: 12.5, color: 'var(--text-muted)' },
  aviso: { fontSize: 14, color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)', padding: 12, borderRadius: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  chipTexto: { fontSize: 13.5, fontWeight: '700', color: 'var(--text)' },
  chipTextoAtivo: { color: 'var(--tint-red-text)' },
  chipSelo: { fontSize: 11, fontWeight: '800', color: 'var(--tint-red-text)' },
  dias: { flexDirection: 'row', gap: 6 },
  dia: { flex: 1, minHeight: 64, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', alignItems: 'center', justifyContent: 'center' },
  diaAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  diaCurto: { fontSize: 10.5, fontWeight: '700', color: 'var(--text-muted)' },
  diaNome: { fontSize: 12.5, fontWeight: '800', color: 'var(--text)' },
  diaTextoAtivo: { color: 'var(--tint-red-text)' },
  diaConta: { fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' },
  pontoSugerido: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: 'var(--vermelho-acao)' },
  sugerido: { fontSize: 12.5, fontWeight: '700', color: 'var(--tint-red-text)' },
  tomAviso: { color: 'var(--tint-amber-text)' },
  faixaAmbar: { backgroundColor: 'var(--tint-amber)', borderRadius: 12, padding: 12, gap: 2 },
  faixaAmbarTitulo: { fontSize: 14, fontWeight: '800', color: 'var(--tint-amber-text)' },
  faixaAmbarSub: { fontSize: 12.5, color: 'var(--tint-amber-text)' },
  faixaAzul: { backgroundColor: 'var(--tint-blue)', borderRadius: 12, padding: 12, gap: 2, borderWidth: 1, borderColor: 'var(--tint-blue-border)' },
  faixaAzulTitulo: { fontSize: 14, fontWeight: '800', color: 'var(--tint-blue-text)' },
  faixaAzulSub: { fontSize: 12.5, color: 'var(--tint-blue-text)' },
  horaCab: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  opcional: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 },
  pilula: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', justifyContent: 'center' },
  pilulaAtiva: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  pilulaTexto: { fontSize: 13.5, fontWeight: '700', color: 'var(--text)' },
  pilulaTextoAtivo: { color: 'var(--bg)' },
  outraHora: { width: 84, fontSize: 13.5, color: 'var(--text)', textAlign: 'center' },
  acontece: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: 'var(--surface-2)', gap: 2 },
  aconteceRot: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: 'var(--text-muted)', marginBottom: 4 },
  linha: { fontSize: 13.5, fontWeight: '700', color: 'var(--text)', marginTop: 4 },
  linhaSub: { fontSize: 12, color: 'var(--text-muted)' },
  rodape: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  botao: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botaoPrin: { backgroundColor: 'var(--vermelho-acao)' },
  botaoPrinTexto: { fontSize: 15, fontWeight: '800', color: '#fff' },
  botaoInerte: { backgroundColor: 'var(--surface-2)' },
  botaoInerteTexto: { fontSize: 15, fontWeight: '700', color: 'var(--text-muted)', textAlign: 'center' },
  botaoSec: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'var(--border)' },
  botaoSecTexto: { fontSize: 15, fontWeight: '800', color: 'var(--text)' },
});
