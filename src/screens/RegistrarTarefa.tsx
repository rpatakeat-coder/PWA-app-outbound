// Registrar uma tarefa — ligação, retorno, cobrança, follow-up (28/09/2026). Tarefa de
// visita ou reunião também abre aqui (o Ligar sempre), mas não conclui: só o Cheguei prova visita. Serve à aba Tarefas e à Agenda: as duas abrem esta mesma folha, e o
// registro sai igual das duas. A regra mora em src/utils/registroDeTarefa.ts.
//
// Ao salvar: a tarefa conclui no HubSpot com a nota de COMO FOI (5 s de Desfazer,
// fila sem sinal — concluirComDesfazer) e, passada a janela, o próximo passo vira
// tarefa nova pela porta única (visita entra no Planejamento e na Agenda).
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';

import { Painel } from '../components/Painel';
import { Toast } from '../components/Toast';
import { IconCall, useIconColors } from '../components/icons';
import { concluirComDesfazer } from '../utils/concluirTarefa';
import { enfileirar, ehErroDeRede, novoAcaoId } from '../utils/filaOffline';
import { ETAPA, MOTIVOS_PERDIDO, MOTIVOS_QUE_EXIGEM_TEXTO } from '../utils/fichaDeRua';
import { ehRecusa, negocioAcao } from '../utils/negocioAcao';
import { diaBRT } from '../utils/abaTarefas';
import {
  COMO_FOI, PROXIMOS, diaUtilDepois, notaDoRegistro, pedidoDoProximo, podeRegistrar, proximoSugerido, type ComoFoi,
} from '../utils/registroDeTarefa';

export type TarefaParaRegistrar = {
  id: string;
  assunto: string;
  dealId: string | null;
  nome: string | null;
  telefone?: string | null;
  /** Visita ou reunião: registra a ligação e o próximo passo, sem concluir (ver concluirTarefa). */
  presencial?: boolean;
};

type Props = {
  tarefa: TarefaParaRegistrar | null;
  aoFechar: () => void;
  /** Some da lista na hora; `voltou` devolve se desfizer ou o HubSpot recusar. */
  aoSumir?: (id: string) => void;
  aoVoltar?: (id: string) => void;
};

const soDigitos = (t: string) => t.replace(/\D+/g, '');

export default function RegistrarTarefa({ tarefa, aoFechar, aoSumir, aoVoltar }: Props) {
  const cores = useIconColors();
  const queryClient = useQueryClient();
  const [comoFoi, setComoFoi] = useState<ComoFoi | null>(null);
  const [proximoId, setProximoId] = useState<string>('nada');
  const [nota, setNota] = useState('');
  /* SEM INTERESSE VAI A PERDIDO (16/10/26): antes fechava a tarefa e deixava o negócio aberto e sem
     passo. Agora pede o motivo, como a ficha e a aba Tarefas, e move o negócio pela porta única. */
  const [motivo, setMotivo] = useState<string | null>(null);
  const [motivoTexto, setMotivoTexto] = useState('');

  useEffect(() => { setComoFoi(null); setProximoId('nada'); setNota(''); setMotivo(null); setMotivoTexto(''); }, [tarefa?.id]);

  // O TELEFONE SEMPRE (28/09/2026, Julyan: "é sempre ter botão de ligar"). Ele vinha do lead
  // carregado no mapa; lead fora da área da tela abria a folha sem o Ligar. Sem telefone na
  // tarefa, busca pelo negócio; sem telefone nenhum, o botão fica, desligado, dizendo por quê.
  const [foneBuscado, setFoneBuscado] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setFoneBuscado(undefined);
    if (!tarefa || tarefa.telefone || !tarefa.dealId) return;
    let vivo = true;
    void supabase.from('clients').select('telefone').eq('id_hubspot', tarefa.dealId).limit(1)
      .then(({ data }) => { if (vivo) setFoneBuscado(((data && data[0]) as { telefone?: string | null } | undefined)?.telefone ?? null); });
    return () => { vivo = false; };
  }, [tarefa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tarefa) return null;
  const hoje = diaBRT(new Date())!;
  const proximo = PROXIMOS.find((p) => p.id === proximoId)!.proximo;
  const data = proximo.tipo === 'nada' ? null : diaUtilDepois(hoje, proximo.dias);
  const telefone = tarefa.telefone || foneBuscado || null;
  const fone = telefone ? soDigitos(telefone) : '';
  const temNegocio = !!tarefa.dealId;
  const perde = temNegocio && comoFoi === 'sem_interesse';
  const regra = podeRegistrar({ comoFoi, proximoId, temNegocio, motivo, motivoTexto, exigemTexto: MOTIVOS_QUE_EXIGEM_TEXTO });
  const bloqueado = !regra.pode || (!!tarefa.presencial && !tarefa.dealId);

  const registrar = () => {
    if (!comoFoi || bloqueado) return;
    const t = tarefa;
    const perdido = perde && t.dealId && motivo ? {
      op: 'mudar-etapa', dealId: t.dealId, novaEtapa: ETAPA.perdido,
      propriedades: { motivo_do_perdido: motivo, ...(motivoTexto.trim() ? { observacao__desqualificado: motivoTexto.trim().slice(0, 200) } : {}) },
    } : null;
    const texto = notaDoRegistro({ comoFoi, assunto: t.assunto, nota, proximo, data });
    const passo = data ? pedidoDoProximo({ dealId: t.dealId, proximo, data, nome: t.nome, nota }) : null;
    // visita não sai da lista: continua aberta até o Cheguei
    if (!t.presencial) aoSumir?.(t.id);
    aoFechar();
    concluirComDesfazer({
      pedido: { taskId: t.id, nota: t.dealId ? { dealId: t.dealId, texto } : null, proximo: passo, manterAberta: !!t.presencial,
        contato: { canal: 'ligacao', acaoId: novoAcaoId(), dealId: t.dealId, resultado: comoFoi, em: new Date().toISOString() } },
      rotulo: `Registro · ${t.nome ?? t.assunto}`,
      textoToast: t.presencial ? 'Ligação registrada · a visita continua aberta até o Cheguei'
        : !t.dealId ? 'Tarefa concluída · sem negócio ligado, o como foi não fica registrado'
        : perdido ? 'Registrado · o negócio vai para Perdido'
        : passo ? `Registrado · próximo em ${data!.split('-').reverse().slice(0, 2).join('/')}` : 'Registrado · HubSpot + Cockpit',
      aoVoltar: () => aoVoltar?.(t.id),
      // A conclusão, a nota e o próximo passo saem juntos (concluirTarefa), inclusive pela
      // fila quando não há sinal.
      aoGravar: () => {
        void queryClient.invalidateQueries({ queryKey: ['tarefas_crm'] });
        if (!perdido) return;
        void negocioAcao(perdido).then(() => { void queryClient.invalidateQueries({ queryKey: ['clients'] }); }).catch((e) => {
          if (ehErroDeRede(e)) return enfileirar({ acaoId: novoAcaoId(), tipo: 'negocio', rotulo: `Perdido · ${t.nome ?? t.assunto}`, payload: { corpo: perdido } });
          Toast.mostrar(`A tarefa foi registrada, mas o negócio não foi para Perdido: ${ehRecusa(e) ? (e as Error).message : String((e as Error)?.message ?? e)}`, 'erro');
          return undefined;
        });
      },
    });
  };

  const chip = (chave: string, rotulo: string, ativo: boolean, aoTocar: () => void) => (
    <Pressable key={chave} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={aoTocar} style={[s.chip, ativo && s.chipAtivo]}>
      <Text style={[s.chipTexto, ativo && s.chipTextoAtivo]}>{rotulo}</Text>
    </Pressable>
  );

  return (
    <Painel visivel aoFechar={aoFechar} rotulo="Registrar a tarefa" topo={
      <View style={{ gap: 2, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <Text style={s.titulo} numberOfLines={2}>{tarefa.nome ?? 'Tarefa'}</Text>
        <Text style={s.sub} numberOfLines={2}>{tarefa.assunto}</Text>
      </View>
    }>
      <View style={s.corpo}>
        {fone ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Ligar para ${tarefa.nome ?? 'o lead'}`} style={s.ligar}
            onPress={() => { void Linking.openURL(`tel:${fone.length <= 11 ? '+55' + fone : '+' + fone}`); }}>
            <IconCall width={20} height={20} fill="#FFFFFF" />
            <Text style={s.ligarTexto}>{`Ligar agora · ${telefone}`}</Text>
          </Pressable>
        ) : (
          <View accessibilityRole="button" accessibilityState={{ disabled: true }} style={[s.ligar, { opacity: 0.45 }]}>
            <IconCall width={20} height={20} fill="#FFFFFF" />
            <Text style={s.ligarTexto}>{foneBuscado === undefined && tarefa.dealId && !tarefa.telefone ? 'Buscando o telefone…' : 'Sem telefone no cadastro · ponha na ficha do lead'}</Text>
          </View>
        )}

        <Text style={s.secao}>COMO FOI</Text>
        <View style={s.chips}>
          {COMO_FOI.map((c) => chip(c.id, c.rotulo, comoFoi === c.id, () => { setComoFoi(c.id); setProximoId(proximoSugerido(c.id)); }))}
        </View>

        {perde ? (
          <>
            <Text style={s.secao}>VAI PARA PERDIDO · O MOTIVO</Text>
            <View style={s.chips}>
              {MOTIVOS_PERDIDO.map((m) => chip(`m-${m.valor}`, m.rotulo, motivo === m.valor, () => setMotivo(m.valor)))}
            </View>
            {!!motivo && MOTIVOS_QUE_EXIGEM_TEXTO.includes(motivo) && (
              <TextInput value={motivoTexto} onChangeText={setMotivoTexto} placeholder="O que pesou" placeholderTextColor={cores.muted} style={s.nota} maxLength={200} />
            )}
          </>
        ) : (
          <>
            <Text style={s.secao}>E AGORA</Text>
            <View style={s.chips}>
              {/* com negócio, "Nada agora" sai: todo negócio fica com o próximo passo datado (16/10/26) */}
              {PROXIMOS.filter((p) => !temNegocio || p.id !== 'nada').map((p) => chip(p.id, p.rotulo, proximoId === p.id, () => setProximoId(p.id)))}
            </View>
          </>
        )}
        {!!tarefa.presencial && (
          <Text style={s.aviso}>{tarefa.dealId
            ? 'Tarefa de visita: a ligação e o próximo passo ficam no negócio, mas ela só conclui no Cheguei, com GPS ou foto.'
            : 'Tarefa de visita sem negócio no HubSpot: não há onde registrar a ligação. Ela conclui no Cheguei, com GPS ou foto.'}</Text>
        )}
        {!tarefa.dealId && !tarefa.presencial && (
          <Text style={s.aviso}>Esta tarefa não está ligada a um negócio no HubSpot: ela é concluída, mas o como foi e o próximo passo não têm onde ficar.</Text>
        )}

        <TextInput
          value={nota}
          onChangeText={setNota}
          placeholder="Uma linha, se quiser (ex.: pediu para ligar depois das 15h)"
          placeholderTextColor={cores.muted}
          style={s.nota}
          maxLength={200}
        />

        <Pressable accessibilityRole="button" disabled={bloqueado} onPress={registrar} style={[s.salvar, bloqueado && { opacity: 0.45 }]}>
          <Text style={s.salvarTexto}>{regra.pode ? (perde ? 'Registrar e mandar para Perdido' : 'Registrar') : regra.falta}</Text>
        </Pressable>
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  titulo: { fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)' },
  // o Painel não põe margem nas faixas (cada tela põe a sua): sem isto o texto encostava na borda
  corpo: { gap: 10, paddingBottom: 16, paddingHorizontal: 16 },
  ligar: { minHeight: 48, borderRadius: 12, backgroundColor: 'var(--verde-acao)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  ligarTexto: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  secao: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: 'var(--text-muted)', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center' },
  chipAtivo: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  chipTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  chipTextoAtivo: { color: 'var(--bg)' },
  aviso: { fontSize: 12, color: 'var(--tint-amber-text, #B45309)' },
  nota: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', paddingHorizontal: 12, fontSize: 15, color: 'var(--text)', backgroundColor: 'var(--surface)' },
  salvar: { minHeight: 50, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  salvarTexto: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
