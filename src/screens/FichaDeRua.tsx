// Registro de visita do app de campo v4.1 (handoff §6.4). Folha de baixo
// depois do Cheguei, com o mapa (e o pino) visível em cima.
//
// Três toques: 1 · Como foi? → 2 · E agora? (as opções dependem do
// desfecho) → Salvar visita. "Sem interesse" pede o motivo (4º toque, a
// única exceção). O resto — quem decide, melhor horário, sistema, dor,
// telefone, tipo — fica em "Completar agora", que nunca trava e abre
// sozinho quando quem decide não estava ("saia com nome e horário").
//
// Salvar manda tudo pela porta única do Cockpit (negocio-acao): a nota
// DESFECHO_VISITA v1, a tarefa do próximo passo (com sistema e dor) e a
// etapa sugerida, com as regras do servidor. Os envios saem 5 s depois,
// para o Desfazer valer; se a página fechar nesse meio-tempo, vão para a
// fila offline e sobem sozinhos. Sem sinal, a fila também segura.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Client } from '../types/client';
import { enfileirar, ehErroDeRede, novoAcaoId } from '../utils/filaOffline';
import {
  COMO_FOI, DIAS_VOLTA, FICHA_VAZIA, GARGALOS, HORARIOS, MOTIVOS_PERDIDO, PAPEIS, ROTULO_ETAPA, ROTULO_PROP, SISTEMAS, TIPOS,
  ehVolta, etapaSugerida, faltandoParaEtapa, notaDaVisita, opcoesAgora, pareceNomeDePessoa, proximoDiaUtil, proximoPassoDaFicha, rotuloSalvar,
  type Ficha,
} from '../utils/fichaDeRua';
import { ehRecusa, negocioAcao } from '../utils/negocioAcao';
import { supabase } from '../integrations/supabase/client';
import { comprimir, enviarFoto, escolherFoto } from '../utils/fotoVisita';
import { gravarFichaNoBanco, linhaDaFicha, type LinhaFicha } from '../utils/fichaNoBanco';
import { CampoData } from '../components/CampoData';
import { IconClose as SiClose, IconCheck as SiCheck, IconChevronDown as SiDown } from '../components/icons';

export type CamposCadastro = { empresa?: string; telefone?: string; categoria?: string };

type Props = {
  visivel: boolean;
  client: Client;
  checkinEm: string;           // ISO do check-in
  etapaAtual: string | null;   // código canônico
  primeiraVisita: boolean;
  proxima: { numero: number; nome: string; client: Client } | null;
  onFechar: () => void;
  onProxima: (c: Client) => void;
  /** Grava nome do lugar / telefone / tipo no lead (mesmo caminho do cadastro). */
  onSalvarCadastro: (campos: CamposCadastro) => Promise<void>;
  /** Etapa mudou no HubSpot: o app põe o rótulo no lead para a letra do pino mudar na hora. */
  onEtapaMudou: (codigo: string) => void;
  /** "Ver na Agenda": abre a Agenda no dia do próximo passo (ou hoje). */
  onAgenda?: (dia: string | null) => void;
  /** Visita declarada (0109): o chip diz isso, não "GPS confere". */
  declarada?: boolean;
  /** Foto de prova (GPS falhou) que não subiu no check-in: entra já escolhida. */
  fotoProva?: Blob | null;
  /** A foto de prova já subiu no check-in: a ficha grava com_foto mesmo sem foto nova. */
  fotoNoCheckin?: boolean;
  /** id_hubspot de quem registra (pasta da foto e dono no Cockpit). */
  ownerId?: string | null;
  /** Negócio de COLEGA: o próximo passo vira tarefa do dono, na Agenda dele (28/09/2026). */
  donoColega?: string | null;
};

type Resultado = { rotulo: string; estado: 'ok' | 'fila' | 'falhou' | 'pulado'; detalhe?: string };
type Envio = { corpo: Record<string, unknown>; rotulo: string; etapa?: string; rota?: 'hubspot-sync' };

const hojeBRT = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const diaMes = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
const JANELA_DESFAZER_MS = 5000;

export default function FichaDeRua({ visivel, client, checkinEm, etapaAtual, primeiraVisita, proxima, onFechar, onProxima, onSalvarCadastro, onEtapaMudou, onAgenda, declarada = false, ownerId = null, fotoProva = null, fotoNoCheckin = false, donoColega = null }: Props) {
  const [f, setF] = useState<Ficha>(FICHA_VAZIA);
  const [opcao, setOpcao] = useState<string | null>(null);
  const [completar, setCompletar] = useState(false);
  const [outroSistema, setOutroSistema] = useState(false);
  const [outraDataVolta, setOutraDataVolta] = useState(false);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  // Foto da fachada/cardápio: comprimida na hora, sobe junto com a visita.
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [preparandoFoto, setPreparandoFoto] = useState(false);
  const [fase, setFase] = useState<'form' | 'desfazer' | 'enviando' | 'salvo'>('form');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [passoSalvo, setPassoSalvo] = useState<{ data: string; texto: string; virouTarefa: boolean } | null>(null);
  const pendente = useRef<{ campos: CamposCadastro; envios: Envio[]; foto: Blob | null; linha: LinhaFicha | null; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    if (!visivel) return;
    setF(FICHA_VAZIA); setOpcao(null); setCompletar(false); setOutroSistema(false); setOutraDataVolta(false); setConfirmarSaida(false);
    setFoto(fotoProva ? { blob: fotoProva, url: URL.createObjectURL(fotoProva) } : null);
    setFase('form'); setResultados([]); setPassoSalvo(null);
  }, [visivel, client.id]);

  const nome = client.empresa?.trim() || client.nome || 'Lead';
  const pedeNome = pareceNomeDePessoa(client.empresa?.trim() || client.nome);
  const temTelefone = !!client.telefone?.trim();
  const dealId = client.id_hubspot ? String(client.id_hubspot) : null;

  const sugerida = useMemo(
    () => (dealId ? etapaSugerida({ atual: etapaAtual, comoFoi: f.comoFoi, proximo: f.proximo, primeiraVisita }) : null),
    [dealId, etapaAtual, f.comoFoi, f.proximo, primeiraVisita],
  );
  const valores: Record<string, string> = {
    celular: (f.telefone || client.telefone || '').trim(),
    gargalo_operacional: f.dor ?? '',
    nome_do_sistema: f.sistema.trim(),
    motivo_do_perdido: f.motivoPerdido ?? '',
  };
  const faltaEtapa = sugerida ? faltandoParaEtapa(sugerida, valores) : [];
  const salvar = rotuloSalvar(f, faltaEtapa);
  const set = (x: Partial<Ficha>) => setF((a) => ({ ...a, ...x }));
  const toque = 1 + (f.comoFoi ? 1 : 0) + (f.proximo ? 1 : 0);
  const passoPrevisto = proximoPassoDaFicha(f, hojeBRT());
  const faltamCompletar = [
    !f.decisor.trim(), !f.horario, !f.sistema.trim(), !f.dor, !temTelefone && !f.telefone.trim(), !client.categoria && !f.tipo, pedeNome && !f.nomeDoLugar.trim(),
  ].filter(Boolean).length;
  const legenda = !f.comoFoi || !f.proximo
    ? 'Escolha como foi e o que vem agora'
    : ehVolta(f.proximo) && !f.dataVolta
      ? 'Escolha o dia da volta'
    : f.proximo === 'sem_interesse'
      ? (f.motivoPerdido ? 'O negócio vai para Perdido, com o motivo' : 'Escolha o motivo')
      : passoPrevisto
        // negócio de colega: a tarefa é do dono no HubSpot — dizer isso, não "vai para a Agenda"
        ? `${passoPrevisto.texto} em ${diaMes(passoPrevisto.data)} vai para a Agenda ${donoColega ? `de ${donoColega} (dono do negócio)` : ''}`.trim()
        : 'Salva a visita no HubSpot e no Cockpit';

  function escolherComoFoi(id: Ficha['comoFoi']) {
    set({ comoFoi: id, proximo: null, diasReuniao: null, motivoPerdido: null, dataVolta: null });
    setOpcao(null);
    setOutraDataVolta(false);
    // Maior ralo do funil: visita que não chega em quem decide. Sai com nome e horário.
    if (id === 'decisor_ausente') setCompletar(true);
  }

  async function enviar(e: Envio, lista: Resultado[]): Promise<boolean> {
    if (e.rota === 'hubspot-sync') {
      try {
        const { error } = await supabase.functions.invoke('hubspot-sync', { body: e.corpo });
        if (error) throw error;
        lista.push({ rotulo: e.rotulo, estado: 'ok' });
        return true;
      } catch (err) {
        lista.push({ rotulo: e.rotulo, estado: 'falhou', detalhe: String((err as Error)?.message ?? err) });
        return false;
      }
    }
    try {
      await negocioAcao(e.corpo);
      lista.push({ rotulo: e.rotulo, estado: 'ok' });
      return true;
    } catch (err) {
      if (ehErroDeRede(err)) {
        await enfileirar({ acaoId: novoAcaoId(), tipo: 'negocio', rotulo: `${e.rotulo} · ${nome}`, payload: { corpo: e.corpo } });
        lista.push({ rotulo: e.rotulo, estado: 'fila', detalhe: 'salvo no celular, sobe quando voltar o sinal' });
      } else {
        lista.push({ rotulo: e.rotulo, estado: 'falhou', detalhe: ehRecusa(err) ? err.message : String((err as Error)?.message ?? err) });
      }
      return false;
    }
  }

  async function executar() {
    const p = pendente.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendente.current = null;
    setFase('enviando');
    const lista: Resultado[] = [];
    if (Object.keys(p.campos).length) {
      try { await onSalvarCadastro(p.campos); lista.push({ rotulo: 'Cadastro do lead', estado: 'ok' }); }
      catch (err) { lista.push({ rotulo: 'Cadastro do lead', estado: ehErroDeRede(err) ? 'fila' : 'falhou', detalhe: String((err as Error)?.message ?? err) }); }
    }
    if (!dealId) lista.push({ rotulo: 'HubSpot', estado: 'pulado', detalhe: 'este lead ainda não tem negócio no HubSpot' });
    for (const e of p.envios) {
      const foi = await enviar(e, lista);
      if (foi && e.etapa) onEtapaMudou(e.etapa);
    }
    if (p.foto) {
      try {
        await enviarFoto({
          blob: p.foto, ownerId, dealId, clientId: client.id,
          lat: client.latitude != null ? Number(client.latitude) : null, lng: client.longitude != null ? Number(client.longitude) : null,
        });
        lista.push({ rotulo: 'Foto da visita · vai para o gestor', estado: 'ok' });
      } catch (err) {
        lista.push({ rotulo: 'Foto da visita', estado: 'falhou', detalhe: String((err as Error)?.message ?? err) });
      }
    }
    // A ficha no banco (0120): é o que o Cockpit lê para o funil de porta.
    if (p.linha) {
      const r = await gravarFichaNoBanco(p.linha, nome);
      lista.push({ rotulo: 'Ficha no Cockpit', estado: r, ...(r === 'fila' ? { detalhe: 'salvo no celular, sobe quando voltar o sinal' } : {}) });
    }
    setResultados(lista);
    setFase('salvo');
  }

  // Página fechando dentro da janela do Desfazer: nada se perde, vai para a fila.
  useEffect(() => {
    const aoSair = () => {
      const p = pendente.current;
      if (!p) return;
      clearTimeout(p.timer);
      pendente.current = null;
      for (const e of p.envios) if (!e.rota) void enfileirar({ acaoId: novoAcaoId(), tipo: 'negocio', rotulo: `${e.rotulo} · ${nome}`, payload: { corpo: e.corpo } });
      if (p.linha) void enfileirar({ acaoId: p.linha.acao_id, tipo: 'ficha', rotulo: `Ficha · ${nome}`, payload: p.linha as unknown as Record<string, unknown> });
    };
    window.addEventListener('pagehide', aoSair);
    return () => window.removeEventListener('pagehide', aoSair);
  }, [nome]);

  function aoSalvar() {
    if (!salvar.pode || fase !== 'form') return;
    const hoje = hojeBRT();
    const campos: CamposCadastro = {};
    if (pedeNome && f.nomeDoLugar.trim()) campos.empresa = f.nomeDoLugar.trim();
    if (!temTelefone && f.telefone.trim()) campos.telefone = f.telefone.trim();
    if (f.tipo) campos.categoria = f.tipo;
    const envios: Envio[] = [];
    const passo = proximoPassoDaFicha(f, hoje);
    setPassoSalvo(passo ? { data: passo.data, texto: passo.texto, virouTarefa: !!dealId } : null);
    if (dealId) {
      envios.push({ corpo: { op: 'nota', dealId, texto: notaDaVisita(f, { cliente: nome, ocorridoEm: checkinEm, hoje }) }, rotulo: 'Nota da visita' });
      if (passo) {
        const qualificacao: Record<string, string> = {};
        if (f.sistema.trim()) qualificacao.nomeDoSistema = f.sistema.trim().slice(0, 120);
        if (f.dor) qualificacao.gargalo = f.dor;
        envios.push({
          corpo: {
            op: 'nota', tipoAcao: 'proximo-passo', dealId, texto: passo.texto, data: passo.data, tipo: passo.tipo,
            ...(Object.keys(qualificacao).length ? { qualificacao } : {}),
          },
          rotulo: `${passo.tipo === 'reuniao' ? 'Reunião' : 'Próximo passo'} em ${diaMes(passo.data)}`,
        });
      }
      // Colheita nova (handoff v4.1 decisões 14–15): quem decide vira contato
      // do negócio e o melhor horário vai para a propriedade do HubSpot.
      const horarioHs = HORARIOS.find((h) => h.valor === f.horario)?.hs;
      if (horarioHs) {
        envios.push({ rota: 'hubspot-sync', corpo: { type: 'qualificar', id_hubspot: dealId, propriedades: { melhor_horario_do_decisor: horarioHs } }, rotulo: 'Melhor horário do decisor' });
      }
      if (f.decisor.trim()) {
        envios.push({
          rota: 'hubspot-sync',
          // Sem celular: o telefone da ficha é o da CASA, não o de quem decide. Mandá-lo
          // fazia a rota achar o contato do próprio negócio pelo número e "associar"
          // o decisor a ele — nome e papel sumiam (auditoria 26/09).
          corpo: { type: 'decisor', id_hubspot: dealId, nome: f.decisor.trim(), papel: f.papel ?? undefined, owner_id: client.vendedor_id_hubspot ?? undefined },
          rotulo: 'Quem decide no negócio',
        });
      }
      if (sugerida && f.moverEtapa) {
        const propriedades: Record<string, string> = {};
        for (const k of ['celular', 'gargalo_operacional', 'nome_do_sistema', 'motivo_do_perdido']) if (valores[k]) propriedades[k] = valores[k];
        envios.push({ corpo: { op: 'mudar-etapa', dealId, novaEtapa: sugerida, propriedades }, rotulo: `Etapa → ${ROTULO_ETAPA[sugerida]}`, etapa: sugerida });
      }
    }
    const linha = linhaDaFicha(f, {
      ownerId, clientId: client.id ?? null, dealId, ocorridoEm: checkinEm, declarada,
      etapaAntes: etapaAtual ?? null, etapaDepois: dealId && sugerida && f.moverEtapa ? sugerida : null,
      comFoto: !!foto || fotoNoCheckin, bairro: client.bairro, cidade: client.cidade, hoje,
    });
    pendente.current = { campos, envios, foto: foto?.blob ?? null, linha, timer: setTimeout(() => { void executar(); }, JANELA_DESFAZER_MS) };
    setFase('desfazer');
  }

  function desfazer() {
    const p = pendente.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendente.current = null;
    setFase('form');
  }

  function fechar() {
    /* Fechar com o desfecho marcado e não salvo descartava tudo em silêncio — o "voltar"
       do aparelho bastava — e o check-in ficava sem desfecho (auditoria de 03/10/26). O
       primeiro toque avisa; o segundo fecha. Avisar, não travar. */
    if (fase === 'form' && (f.comoFoi || f.proximo) && !confirmarSaida) { setConfirmarSaida(true); return; }
    setConfirmarSaida(false);
    // Fechar dentro da janela do Desfazer não cancela: manda na hora.
    if (pendente.current) void executar();
    onFechar();
  }

  /* o toque num chip fecha o teclado na hora: com ele aberto no iPhone, o toque seguinte caía deslocado */
  const fecharTeclado = () => { try { const el = document.activeElement as HTMLElement | null; if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.blur(); } catch { /* fora do navegador */ } };
  const chip = (chave: string, rotulo: string, ativo: boolean, aoTocar: () => void) => (
    <Pressable key={chave} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={() => { fecharTeclado(); aoTocar(); }}
      style={[s.chip, ativo && s.opcaoAtiva]}>
      <Text style={[s.chipTexto, ativo && s.opcaoAtivaTexto]}>{rotulo}</Text>
    </Pressable>
  );
  const opcaoGrade = (chave: string, rotulo: string, ativo: boolean, aoTocar: () => void) => (
    <Pressable key={chave} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={aoTocar}
      style={[s.opcao, ativo && s.opcaoAtiva]}>
      <Text style={[s.opcaoTexto, ativo && s.opcaoAtivaTexto]} numberOfLines={2}>{rotulo}</Text>
    </Pressable>
  );
  const problemas = resultados.filter((r) => r.estado !== 'ok');

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={fechar}>
      <View style={s.fundo}>
        <View style={[s.folha, fase !== 'form' && s.folhaSalvo]}>
          <View style={s.alca}><View style={s.alcaBarra} /></View>

          {fase === 'form' ? (
            <>
              <View style={s.topo}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.titulo}>Registrar visita</Text>
                  <Text style={s.subtitulo} numberOfLines={1}>{`${nome} · toque ${toque} de 3`}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={fechar} style={s.fechar}>
                  <SiClose width={20} height={20} fill="var(--text-muted)" />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={s.corpo} keyboardShouldPersistTaps="handled">
                <View style={[s.gps, declarada && s.gpsDeclarada]}>
                  <Text style={[s.gpsTexto, declarada && s.gpsDeclaradaTexto]}>{declarada ? 'Visita declarada · o gestor vê que foi sem GPS' : 'GPS confere · check-in feito'}</Text>
                </View>

                <Text style={s.secao}>1 · COMO FOI?</Text>
                <View style={s.grade}>{COMO_FOI.map((c) => opcaoGrade(c.id, c.rotulo, f.comoFoi === c.id, () => escolherComoFoi(c.id)))}</View>

                {!!f.comoFoi && (
                  <>
                    <Text style={s.secao}>2 · E AGORA?</Text>
                    <View style={s.grade}>
                      {opcoesAgora(f.comoFoi).map((o) => opcaoGrade(o.id, o.rotulo, opcao === o.id, () => {
                        setOpcao(o.id);
                        set({
                          proximo: o.proximo, diasReuniao: o.dias ?? null, motivoPerdido: o.proximo === 'sem_interesse' ? f.motivoPerdido : null,
                          /* "Voltar amanhã" já diz o dia; as outras voltas esperam o executivo escolher */
                          dataVolta: o.proximo === 'voltar_amanha' ? proximoDiaUtil(hojeBRT(), 1) : (ehVolta(o.proximo) ? f.dataVolta : null),
                        });
                        if (o.proximo === 'voltar_amanha') setOutraDataVolta(false);
                      }))}
                    </View>
                  </>
                )}
                {ehVolta(f.proximo) && (
                  <>
                    <Text style={s.secao}>QUANDO VOLTAR?</Text>
                    <View style={s.chips}>
                      {DIAS_VOLTA.map((d) => {
                        const dia = proximoDiaUtil(hojeBRT(), d.dias);
                        return chip('volta' + d.dias, d.rotulo, !outraDataVolta && f.dataVolta === dia, () => { setOutraDataVolta(false); set({ dataVolta: dia }); });
                      })}
                      {chip('volta-outro', 'Outro dia', outraDataVolta, () => { setOutraDataVolta(true); set({ dataVolta: null }); })}
                    </View>
                    {outraDataVolta && (
                      <CampoData valor={f.dataVolta ?? ''} minimo={hojeBRT()} rotulo="Dia da volta"
                        aoMudar={(v) => set({ dataVolta: /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null })} />
                    )}
                    {!!f.dataVolta && (
                      <Text style={[s.ajuda, { textAlign: 'center' }]}>
                        {`Volta em ${diaMes(f.dataVolta)} (${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(`${f.dataVolta}T12:00:00Z`).getUTCDay()]})`
                          + ([0, 6].includes(new Date(`${f.dataVolta}T12:00:00Z`).getUTCDay()) ? ' · cai no fim de semana' : '')}
                      </Text>
                    )}
                  </>
                )}
                {f.proximo === 'sem_interesse' && (
                  <>
                    <Text style={s.secao}>MOTIVO</Text>
                    <View style={s.chips}>{MOTIVOS_PERDIDO.map((m) => chip(m.valor, m.rotulo, f.motivoPerdido === m.valor, () => set({ motivoPerdido: m.valor })))}</View>
                  </>
                )}

                {sugerida && (
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: f.moverEtapa }} onPress={() => set({ moverEtapa: !f.moverEtapa })} style={s.etapa}>
                    <View style={[s.caixa, f.moverEtapa && s.caixaMarcada]}>{f.moverEtapa && <SiCheck width={14} height={14} fill="#FFFFFF" />}</View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.etapaTitulo}>{`Mover para ${ROTULO_ETAPA[sugerida]}`}</Text>
                      <Text style={s.ajuda}>
                        {faltaEtapa.length
                          ? `o HubSpot pede ${faltaEtapa.map((k) => ROTULO_PROP[k] ?? k).join(' e ')} · abaixo`
                          : 'grava no HubSpot e no Cockpit junto com a visita'}
                      </Text>
                    </View>
                  </Pressable>
                )}

                <Pressable accessibilityRole="button" accessibilityState={{ expanded: completar }} onPress={() => setCompletar((v) => !v)} style={s.completarTopo}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.completarTitulo}>{`Completar agora${faltamCompletar ? ` · ${faltamCompletar === 1 ? 'falta' : 'faltam'} ${faltamCompletar}` : ''}`}</Text>
                    {f.comoFoi === 'decisor_ausente'
                      ? <Text style={s.completarAlerta}>Saia com nome e horário de quem decide</Text>
                      : <Text style={s.ajuda}>opcional · nunca trava a visita</Text>}
                  </View>
                  <View style={{ transform: [{ rotate: completar ? '180deg' : '0deg' }] }}><SiDown width={18} height={18} fill="var(--text-muted)" /></View>
                </Pressable>

                {completar && (
                  <View style={s.completar}>
                    {pedeNome && (
                      <>
                        <Text style={s.rotulo}>{`Nome do lugar · cadastrado como "${nome}"`}</Text>
                        <TextInput style={s.campo} value={f.nomeDoLugar} onChangeText={(v) => set({ nomeDoLugar: v })} placeholder="Nome na fachada" placeholderTextColor="#8B919C" />
                      </>
                    )}
                    <Text style={s.rotulo}>Quem decide</Text>
                    <TextInput style={s.campo} value={f.decisor} onChangeText={(v) => set({ decisor: v })} placeholder="Nome" placeholderTextColor="#8B919C" autoComplete="off" textContentType="none" returnKeyType="done" blurOnSubmit />
                    <View style={s.chips}>{PAPEIS.map((p) => chip(p, p, f.papel === p, () => set({ papel: f.papel === p ? null : p })))}</View>

                    <Text style={s.rotulo}>Melhor horário para achar</Text>
                    <View style={s.chips}>{HORARIOS.map((h) => chip(h.valor, h.rotulo, f.horario === h.valor, () => set({ horario: f.horario === h.valor ? null : h.valor })))}</View>

                    <Text style={s.rotulo}>Sistema que usa hoje</Text>
                    <View style={s.chips}>
                      {SISTEMAS.map((sis) => chip(sis, sis, sis === 'Outro' ? outroSistema : !outroSistema && f.sistema === sis, () => {
                        if (sis === 'Outro') { setOutroSistema(true); set({ sistema: '' }); return; }
                        setOutroSistema(false); set({ sistema: f.sistema === sis ? '' : sis });
                      }))}
                    </View>
                    {outroSistema && (
                      <TextInput style={s.campo} value={f.sistema} onChangeText={(v) => set({ sistema: v })} placeholder="Qual sistema? (ou caderno)" placeholderTextColor="#8B919C" maxLength={120} />
                    )}

                    <Text style={s.rotulo}>Maior dor</Text>
                    <View style={s.chips}>{GARGALOS.map((g) => chip(g, g, f.dor === g, () => set({ dor: f.dor === g ? null : g })))}</View>

                    <Text style={s.rotulo}>Foto da fachada ou do cardápio · vai para o gestor</Text>
                    <View style={s.fotoLinha}>
                      {foto && <Image source={{ uri: foto.url }} style={s.fotoMini} accessibilityLabel="Foto escolhida" />}
                      <Pressable
                        accessibilityRole="button"
                        disabled={preparandoFoto}
                        onPress={async () => {
                          const arq = await escolherFoto();
                          if (!arq) return;
                          setPreparandoFoto(true);
                          try {
                            const blob = await comprimir(arq);
                            setFoto({ blob, url: URL.createObjectURL(blob) });
                          } catch { /* foto ilegível: segue sem */ } finally { setPreparandoFoto(false); }
                        }}
                        style={s.chip}
                      >
                        {preparandoFoto ? <ActivityIndicator /> : <Text style={s.chipTexto}>{foto ? 'Trocar foto' : 'Tirar foto'}</Text>}
                      </Pressable>
                      {foto && (
                        <Pressable accessibilityRole="button" onPress={() => setFoto(null)} style={s.chip}>
                          <Text style={s.chipTexto}>Tirar</Text>
                        </Pressable>
                      )}
                    </View>

                    {!temTelefone && (
                      <>
                        <Text style={s.rotulo}>Telefone / WhatsApp</Text>
                        <TextInput style={s.campo} value={f.telefone} onChangeText={(v) => set({ telefone: v })} placeholder="(27) 99999-9999" placeholderTextColor="#8B919C" keyboardType="phone-pad" />
                      </>
                    )}
                    {!client.categoria && (
                      <>
                        <Text style={s.rotulo}>Tipo de casa</Text>
                        <View style={s.chips}>{TIPOS.map((t) => chip(t, t, f.tipo === t, () => set({ tipo: f.tipo === t ? null : t })))}</View>
                      </>
                    )}
                  </View>
                )}
                {!dealId && <Text style={s.aviso}>Este lead ainda não tem negócio no HubSpot: a visita salva o cadastro, e a nota e a etapa ficam para quando o negócio existir.</Text>}
              </ScrollView>
              <View style={s.rodape}>
                {confirmarSaida && (
                  <View style={{ gap: 8 }}>
                    <Text style={[s.ajuda, { color: 'var(--text)', textAlign: 'center' }]}>Sair sem salvar? O check-in fica, mas sem o desfecho nem o próximo passo.</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable accessibilityRole="button" style={s.secundario} onPress={() => setConfirmarSaida(false)}>
                        <Text style={s.secundarioTexto}>Continuar registrando</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" style={s.secundario} onPress={fechar}>
                        <Text style={s.secundarioTexto}>Sair sem salvar</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                <Pressable accessibilityRole="button" style={[s.salvar, !salvar.pode && s.salvarDesligado]} onPress={aoSalvar} disabled={!salvar.pode}>
                  <Text style={[s.salvarTexto, !salvar.pode && s.salvarTextoDesligado]}>{salvar.pode ? 'Salvar visita' : salvar.texto}</Text>
                </Pressable>
                <Text style={s.legenda} numberOfLines={1}>{legenda}</Text>
              </View>
            </>
          ) : (
            <View style={s.salvo}>
              <View style={s.salvoTopo}>
                <SiCheck width={18} height={18} fill="var(--tint-green-text)" />
                <Text style={[s.salvoTitulo, { flex: 1 }]} numberOfLines={1}>{`Visita registrada · ${nome}`}</Text>
                {fase === 'desfazer' ? (
                  <Pressable accessibilityRole="button" onPress={desfazer} style={s.desfazer}>
                    <Text style={s.desfazerTexto}>Desfazer</Text>
                  </Pressable>
                ) : fase === 'enviando' ? <ActivityIndicator color="#86EFAC" /> : null}
              </View>
              <Text style={s.ajuda}>
                {passoSalvo
                  ? `${passoSalvo.texto} · ${diaMes(passoSalvo.data)} · ${passoSalvo.virouTarefa ? (donoColega ? `na Agenda de ${donoColega}, dono do negócio` : 'na Agenda e nas Tarefas') : 'sem negócio no HubSpot, não virou tarefa'}`
                  : f.proximo === 'sem_interesse' ? 'Sem interesse: o negócio vai para Perdido.' : 'Sem próximo passo com data.'}
              </Text>
              {fase === 'salvo' && (
                <Text style={[s.ajuda, { color: problemas.some((p) => p.estado === 'falhou') ? 'var(--vermelho-texto)' : 'var(--verde-texto)' }]}>
                  {problemas.length === 0
                    ? 'Salvo · HubSpot e Cockpit atualizados'
                    : problemas.map((p) => `${p.estado === 'fila' ? 'Na fila' : p.estado === 'falhou' ? 'Falhou' : 'Pendente'} · ${p.rotulo}${p.detalhe ? `: ${p.detalhe}` : ''}`).join('\n')}
                </Text>
              )}
              {proxima && (
                <View style={s.proxima}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.proximaRotulo}>{`PRÓXIMA PORTA · ${proxima.numero} DO PLANO`}</Text>
                    <Text style={s.proximaNome} numberOfLines={1}>{proxima.nome}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => { fechar(); onProxima(proxima.client); }} style={s.proximaBotao}>
                    <Text style={s.proximaBotaoTexto}>Abrir</Text>
                  </Pressable>
                </View>
              )}
              <View style={s.salvoAcoes}>
                {onAgenda && (
                  <Pressable accessibilityRole="button" style={s.secundario} onPress={() => { fechar(); onAgenda(passoSalvo?.data ?? null); }}>
                    <Text style={s.secundarioTexto}>{passoSalvo ? 'Ver na Agenda' : 'Abrir a Agenda'}</Text>
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" style={s.secundario} onPress={fechar}>
                  <Text style={s.secundarioTexto}>Voltar ao mapa</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  folha: {
    height: '76%', backgroundColor: 'var(--surface)', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: 'var(--border)',
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: -8 },
  },
  folhaSalvo: { height: 'auto' as unknown as number },
  alca: { height: 18, alignItems: 'center', justifyContent: 'center' },
  alcaBarra: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'var(--stroke-strong)' },
  topo: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingBottom: 6 },
  titulo: { fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  subtitulo: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)', marginTop: 2 },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8, marginTop: -6 },
  fecharTexto: { fontSize: 18, color: 'var(--text-muted)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  gps: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'var(--tint-green)' },
  gpsTexto: { fontSize: 12, fontWeight: '600', color: 'var(--tint-green-text)' },
  gpsDeclarada: { backgroundColor: 'var(--tint-amber)' },
  gpsDeclaradaTexto: { color: 'var(--tint-amber-text)' },
  secao: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: 'var(--text-faint)', marginTop: 4 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcao: {
    width: '48.5%', minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, justifyContent: 'center',
    borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)',
  },
  opcaoTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  opcaoAtiva: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--vermelho-acao)', borderWidth: 1.5 },
  opcaoAtivaTexto: { color: 'var(--tint-red-text)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', justifyContent: 'center' },
  chipTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  etapa: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)' },
  caixa: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center' },
  caixaMarcada: { backgroundColor: 'var(--vermelho-acao)', borderColor: 'var(--vermelho-acao)' },
  caixaV: { color: '#fff', fontSize: 14, fontWeight: '800' },
  etapaTitulo: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  completarTopo: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'var(--border-soft)', marginTop: 4 },
  completarTitulo: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  completarAlerta: { fontSize: 12, fontWeight: '600', color: 'var(--vermelho-texto)' },
  seta: { fontSize: 14, color: 'var(--text-muted)', paddingHorizontal: 6 },
  completar: { gap: 8 },
  fotoLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  fotoMini: { width: 56, height: 56, borderRadius: 10, backgroundColor: 'var(--surface-2)' },
  rotulo: { fontSize: 13, fontWeight: '600', color: 'var(--text)', marginTop: 6 },
  ajuda: { fontSize: 12, fontWeight: '500', color: 'var(--text-muted)' },
  aviso: { fontSize: 13, color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)', padding: 10, borderRadius: 10 },
  campo: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--bg)', paddingHorizontal: 12, fontSize: 16, color: 'var(--text)' },
  rodape: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' as unknown as number, gap: 6, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  salvar: { height: 56, borderRadius: 16, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  salvarDesligado: { backgroundColor: 'var(--surface-2)' },
  salvarTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
  salvarTextoDesligado: { color: 'var(--text-muted)', fontSize: 14 },
  legenda: { fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' },
  salvo: { paddingHorizontal: 16, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' as unknown as number, gap: 8 },
  salvoTopo: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  salvoTitulo: { flex: 1, fontSize: 16, fontWeight: '700', color: 'var(--verde-texto)' },
  desfazer: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center' },
  desfazerTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  proxima: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: 'var(--surface-2)', marginTop: 4 },
  proximaRotulo: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: 'var(--vermelho-texto)' },
  proximaNome: { fontSize: 16, fontWeight: '600', color: 'var(--text)', marginTop: 2 },
  proximaBotao: { height: 48, paddingHorizontal: 22, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  proximaBotaoTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
  salvoAcoes: { flexDirection: 'row', gap: 8 },
  secundario: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  secundarioTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
});
