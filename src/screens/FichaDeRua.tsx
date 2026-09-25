// Ficha de rua (mapa novo, entrega 5; prompt final corrigido §8.3).
//
// Tela cheia depois do check-in. Pede SÓ o que falta; dois obrigatórios (Como
// foi e Próximo passo). Salvar manda tudo pela porta única do Cockpit
// (negocio-acao): a nota DESFECHO_VISITA v1, a tarefa do próximo passo (com
// sistema e dor) e a etapa sugerida, com as regras do servidor. Sem sinal, o
// que não subiu entra na fila offline. A tela "Ficha salva" diz, item a item,
// o que foi para HubSpot + Cockpit, o que ficou na fila e o que foi recusado.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { Client } from '../types/client';
import { enfileirar, ehErroDeRede, novoAcaoId } from '../utils/filaOffline';
import {
  COMO_FOI, DIAS_REUNIAO, FICHA_VAZIA, GARGALOS, MOTIVOS_PERDIDO, PAPEIS, PROXIMOS, ROTULO_ETAPA, TIPOS,
  completude, etapaSugerida, faltandoParaEtapa, notaDaVisita, pareceNomeDePessoa, proximoPassoDaFicha, rotuloSalvar,
  type Ficha,
} from '../utils/fichaDeRua';
import { ehRecusa, negocioAcao } from '../utils/negocioAcao';

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
};

type Resultado = { rotulo: string; estado: 'ok' | 'fila' | 'falhou' | 'pulado'; detalhe?: string };

const hojeBRT = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const hora = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); } catch { return ''; }
};

export default function FichaDeRua({ visivel, client, checkinEm, etapaAtual, primeiraVisita, proxima, onFechar, onProxima, onSalvarCadastro, onEtapaMudou }: Props) {
  const [f, setF] = useState<Ficha>(FICHA_VAZIA);
  const [salvando, setSalvando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  useEffect(() => { if (visivel) { setF(FICHA_VAZIA); setResultados(null); } }, [visivel, client.id]);

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

  async function enviar(corpo: Record<string, unknown>, rotulo: string, lista: Resultado[]): Promise<boolean> {
    try {
      await negocioAcao(corpo);
      lista.push({ rotulo, estado: 'ok' });
      return true;
    } catch (err) {
      if (ehErroDeRede(err)) {
        await enfileirar({ acaoId: novoAcaoId(), tipo: 'negocio', rotulo: `${rotulo} · ${nome}`, payload: { corpo } });
        lista.push({ rotulo, estado: 'fila', detalhe: 'salvo no celular, sobe quando voltar o sinal' });
      } else {
        lista.push({ rotulo, estado: 'falhou', detalhe: ehRecusa(err) ? err.message : String((err as Error)?.message ?? err) });
      }
      return false;
    }
  }

  async function aoSalvar() {
    if (!salvar.pode || salvando) return;
    setSalvando(true);
    const lista: Resultado[] = [];
    const hoje = hojeBRT();

    // 1) cadastro no app (nome do lugar, telefone, tipo)
    const campos: CamposCadastro = {};
    if (pedeNome && f.nomeDoLugar.trim()) campos.empresa = f.nomeDoLugar.trim();
    if (!temTelefone && f.telefone.trim()) campos.telefone = f.telefone.trim();
    if (f.tipo) campos.categoria = f.tipo;
    if (Object.keys(campos).length) {
      try { await onSalvarCadastro(campos); lista.push({ rotulo: 'Cadastro do lead', estado: 'ok' }); }
      catch (err) { lista.push({ rotulo: 'Cadastro do lead', estado: ehErroDeRede(err) ? 'fila' : 'falhou', detalhe: String((err as Error)?.message ?? err) }); }
    }

    if (!dealId) {
      lista.push({ rotulo: 'HubSpot', estado: 'pulado', detalhe: 'este lead ainda não tem negócio no HubSpot' });
    } else {
      // 2) nota da visita (DESFECHO_VISITA v1)
      await enviar({ op: 'nota', dealId, texto: notaDaVisita(f, { cliente: nome, ocorridoEm: checkinEm, hoje }) }, 'Nota da visita', lista);
      // 3) próximo passo com data → tarefa (+ sistema e dor no negócio)
      const passo = proximoPassoDaFicha(f, hoje);
      if (passo) {
        const qualificacao: Record<string, string> = {};
        if (f.sistema.trim()) qualificacao.nomeDoSistema = f.sistema.trim().slice(0, 120);
        if (f.dor) qualificacao.gargalo = f.dor;
        await enviar({
          op: 'nota', tipoAcao: 'proximo-passo', dealId, texto: passo.texto, data: passo.data, tipo: passo.tipo,
          ...(Object.keys(qualificacao).length ? { qualificacao } : {}),
        }, passo.tipo === 'reuniao' ? `Reunião em ${passo.data.split('-').reverse().slice(0, 2).join('/')}` : `Próximo passo em ${passo.data.split('-').reverse().slice(0, 2).join('/')}`, lista);
      }
      // 4) etapa sugerida
      if (sugerida && f.moverEtapa) {
        const propriedades: Record<string, string> = {};
        for (const k of ['celular', 'gargalo_operacional', 'nome_do_sistema', 'motivo_do_perdido']) if (valores[k]) propriedades[k] = valores[k];
        const foi = await enviar({ op: 'mudar-etapa', dealId, novaEtapa: sugerida, propriedades }, `Etapa → ${ROTULO_ETAPA[sugerida]}`, lista);
        if (foi) onEtapaMudou(sugerida);
      }
    }
    setResultados(lista);
    setSalvando(false);
  }

  const chip = (chave: string, rotulo: string, ativo: boolean, aoTocar: () => void) => (
    <Pressable key={chave} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={aoTocar}
      style={[s.chip, ativo && s.chipAtivo]}>
      <Text style={[s.chipTexto, ativo && s.chipTextoAtivo]}>{rotulo}</Text>
    </Pressable>
  );

  const cheia = completude({
    nomeReal: !pedeNome || !!f.nomeDoLugar.trim(), decisor: !!f.decisor.trim(), telefone: temTelefone || !!f.telefone.trim(),
    tipo: !!f.tipo || !!client.categoria, bairro: !!client.bairro?.trim(),
  });

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar}>
      <View style={s.tela}>
        <View style={s.faixa}>
          <Text style={s.faixaTexto} numberOfLines={1}>{`✓ Check-in · ${nome} · ${hora(checkinEm)}`}</Text>
        </View>

        {resultados ? (
          <ScrollView contentContainerStyle={s.corpo}>
            <Text style={s.titulo}>Ficha salva</Text>
            <View style={s.barraFundo}><View style={[s.barra, { width: `${(cheia / 5) * 100}%` }]} /></View>
            <Text style={s.ajuda}>{`Ficha ${cheia} de 5 · nome real, quem decide, telefone, tipo de lugar, bairro`}</Text>
            {resultados.map((r, i) => (
              <View key={i} style={s.resLinha}>
                <Text style={[s.resIcone, r.estado === 'ok' ? s.ok : r.estado === 'fila' ? s.fila : r.estado === 'falhou' ? s.falhou : s.pulado]}>
                  {r.estado === 'ok' ? '✓' : r.estado === 'fila' ? '↑' : r.estado === 'falhou' ? '✕' : '–'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.resRotulo}>{r.rotulo}</Text>
                  <Text style={s.ajuda}>{r.estado === 'ok' ? 'HubSpot + Cockpit' : r.detalhe}</Text>
                </View>
              </View>
            ))}
            <View style={s.rodapeAcoes}>
              {proxima && (
                <Pressable accessibilityRole="button" style={[s.botao, s.botaoPrincipal]} onPress={() => { onFechar(); onProxima(proxima.client); }}>
                  <Text style={s.botaoPrincipalTexto} numberOfLines={1}>{`Próxima: ${proxima.numero} · ${proxima.nome}`}</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" style={[s.botao, s.botaoSec]} onPress={onFechar}>
                <Text style={s.botaoSecTexto}>Voltar ao mapa</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : (
          <>
            <ScrollView contentContainerStyle={s.corpo} keyboardShouldPersistTaps="handled">
              <Text style={s.secao}>Como foi *</Text>
              <View style={s.chips}>{COMO_FOI.map((c) => chip(c.id, c.rotulo, f.comoFoi === c.id, () => set({ comoFoi: c.id })))}</View>

              {pedeNome && (
                <>
                  <Text style={s.secao}>Nome do lugar</Text>
                  <Text style={s.ajuda}>{`Cadastrado como "${nome}", que parece nome de pessoa.`}</Text>
                  <TextInput style={s.campo} value={f.nomeDoLugar} onChangeText={(v) => set({ nomeDoLugar: v })} placeholder="Nome na fachada" placeholderTextColor="#8B919C" />
                </>
              )}

              <Text style={s.secao}>Quem decide</Text>
              <TextInput style={s.campo} value={f.decisor} onChangeText={(v) => set({ decisor: v })} placeholder="Nome" placeholderTextColor="#8B919C" />
              <View style={s.chips}>{PAPEIS.map((p) => chip(p, p, f.papel === p, () => set({ papel: f.papel === p ? null : p })))}</View>

              <Text style={s.secao}>Sistema que usa hoje</Text>
              <TextInput style={s.campo} value={f.sistema} onChangeText={(v) => set({ sistema: v })} placeholder="Ex.: Consumer, Saipos, caderno" placeholderTextColor="#8B919C" maxLength={120} />

              <Text style={s.secao}>Maior dor</Text>
              <View style={s.chips}>{GARGALOS.map((g) => chip(g, g, f.dor === g, () => set({ dor: f.dor === g ? null : g })))}</View>

              {!temTelefone && (
                <>
                  <Text style={s.secao}>Telefone</Text>
                  <TextInput style={s.campo} value={f.telefone} onChangeText={(v) => set({ telefone: v })} placeholder="(27) 99999-9999" placeholderTextColor="#8B919C" keyboardType="phone-pad" />
                </>
              )}

              {!client.categoria && (
                <>
                  <Text style={s.secao}>Tipo de lugar</Text>
                  <View style={s.chips}>{TIPOS.map((t) => chip(t, t, f.tipo === t, () => set({ tipo: f.tipo === t ? null : t })))}</View>
                </>
              )}

              <Text style={s.secao}>Próximo passo *</Text>
              <View style={s.chips}>{PROXIMOS.map((p) => chip(p.id, p.rotulo, f.proximo === p.id, () => set({ proximo: p.id })))}</View>
              {f.proximo === 'reuniao' && (
                <View style={s.chips}>{DIAS_REUNIAO.map((d) => chip(`d${d.dias}`, d.rotulo, f.diasReuniao === d.dias, () => set({ diasReuniao: d.dias })))}</View>
              )}
              {f.proximo === 'sem_interesse' && (
                <>
                  <Text style={s.ajuda}>Motivo do perdido</Text>
                  <View style={s.chips}>{MOTIVOS_PERDIDO.map((m) => chip(m.valor, m.rotulo, f.motivoPerdido === m.valor, () => set({ motivoPerdido: m.valor })))}</View>
                </>
              )}

              {sugerida && (
                <View style={s.etapa}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.secao}>{`Mover para ${ROTULO_ETAPA[sugerida]}`}</Text>
                    <Text style={s.ajuda}>
                      {faltaEtapa.length && f.moverEtapa ? 'Esta etapa pede os campos acima que ainda faltam.' : 'Sugerido pelo próximo passo. Grava no HubSpot e no Cockpit na hora.'}
                    </Text>
                  </View>
                  <Switch value={f.moverEtapa} onValueChange={(v) => set({ moverEtapa: v })} accessibilityLabel="Mover a etapa" />
                </View>
              )}
              {!dealId && <Text style={s.aviso}>Este lead ainda não tem negócio no HubSpot: a ficha salva o cadastro, e a nota e a etapa ficam para quando o negócio existir.</Text>}
            </ScrollView>
            <View style={s.rodape}>
              <Pressable accessibilityRole="button" style={[s.botao, s.botaoSec, { flex: 1 }]} onPress={onFechar} disabled={salvando}>
                <Text style={s.botaoSecTexto}>Agora não</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={[s.botao, s.botaoPrincipal, { flex: 2 }, !salvar.pode && s.desabilitado]} onPress={aoSalvar} disabled={!salvar.pode || salvando}>
                {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoPrincipalTexto}>{salvar.texto}</Text>}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  faixa: { backgroundColor: '#14532D', paddingHorizontal: 16, paddingTop: 'max(12px, env(safe-area-inset-top))' as unknown as number, paddingBottom: 12 },
  faixaTexto: { color: '#BBF7D0', fontSize: 14, fontWeight: '800' },
  corpo: { padding: 16, gap: 10, paddingBottom: 32 },
  titulo: { fontSize: 24, fontWeight: '800', color: 'var(--text)' },
  secao: { fontSize: 14, fontWeight: '800', color: 'var(--text)', marginTop: 8 },
  ajuda: { fontSize: 12, color: 'var(--text-muted)' },
  aviso: { fontSize: 13, color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)', padding: 10, borderRadius: 10, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', justifyContent: 'center' },
  chipAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--tint-red-border)' },
  chipTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  chipTextoAtivo: { color: 'var(--tint-red-text)' },
  campo: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', paddingHorizontal: 12, fontSize: 16, color: 'var(--text)' },
  etapa: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: 'var(--surface-2)' },
  rodape: { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' as unknown as number, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  rodapeAcoes: { gap: 10, marginTop: 16 },
  botao: { minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botaoPrincipal: { backgroundColor: '#E51A31' },
  botaoPrincipalTexto: { color: '#fff', fontSize: 16, fontWeight: '800' },
  botaoSec: { borderWidth: 1, borderColor: 'var(--border)' },
  botaoSecTexto: { color: 'var(--text)', fontSize: 15, fontWeight: '800' },
  desabilitado: { opacity: 0.55 },
  barraFundo: { height: 8, borderRadius: 4, backgroundColor: 'var(--surface-2)', overflow: 'hidden' },
  barra: { height: 8, backgroundColor: '#16A34A' },
  resLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'var(--border-soft)' },
  resIcone: { width: 24, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  resRotulo: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  ok: { color: '#16A34A' }, fila: { color: '#F59E0B' }, falhou: { color: '#EF4444' }, pulado: { color: 'var(--text-muted)' },
});
