// Registrar uma tarefa que não é visita — ligação, retorno, cobrança, follow-up
// (28/09/2026). Serve à aba Tarefas e à Agenda: as duas abrem esta mesma folha, e o
// registro sai igual das duas. A regra mora em src/utils/registroDeTarefa.ts.
//
// Ao salvar: a tarefa conclui no HubSpot com a nota de COMO FOI (5 s de Desfazer,
// fila sem sinal — concluirComDesfazer) e, passada a janela, o próximo passo vira
// tarefa nova pela porta única (visita entra no Planejamento e na Agenda).
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Painel } from '../components/Painel';
import { Toast } from '../components/Toast';
import { IconCall, useIconColors } from '../components/icons';
import { concluirComDesfazer } from '../utils/concluirTarefa';
import { diaBRT } from '../utils/abaTarefas';
import {
  COMO_FOI, PROXIMOS, diaUtilDepois, notaDoRegistro, pedidoDoProximo, proximoSugerido, type ComoFoi,
} from '../utils/registroDeTarefa';

export type TarefaParaRegistrar = {
  id: string;
  assunto: string;
  dealId: string | null;
  nome: string | null;
  telefone?: string | null;
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

  useEffect(() => { setComoFoi(null); setProximoId('nada'); setNota(''); }, [tarefa?.id]);

  if (!tarefa) return null;
  const hoje = diaBRT(new Date())!;
  const proximo = PROXIMOS.find((p) => p.id === proximoId)!.proximo;
  const data = proximo.tipo === 'nada' ? null : diaUtilDepois(hoje, proximo.dias);
  const fone = tarefa.telefone ? soDigitos(tarefa.telefone) : '';

  const registrar = () => {
    if (!comoFoi) return;
    const t = tarefa;
    const texto = notaDoRegistro({ comoFoi, assunto: t.assunto, nota, proximo, data });
    const passo = data ? pedidoDoProximo({ dealId: t.dealId, proximo, data, nome: t.nome, nota }) : null;
    aoSumir?.(t.id);
    aoFechar();
    concluirComDesfazer({
      pedido: { taskId: t.id, nota: t.dealId ? { dealId: t.dealId, texto } : null, proximo: passo },
      rotulo: `Registro · ${t.nome ?? t.assunto}`,
      textoToast: passo ? `✓ Registrado · próximo em ${data!.split('-').reverse().slice(0, 2).join('/')}` : '✓ Registrado · HubSpot + Cockpit',
      aoVoltar: () => aoVoltar?.(t.id),
      // A conclusão, a nota e o próximo passo saem juntos (concluirTarefa), inclusive pela
      // fila quando não há sinal.
      aoGravar: () => { void queryClient.invalidateQueries({ queryKey: ['tarefas_crm'] }); },
    });
  };

  const chip = (chave: string, rotulo: string, ativo: boolean, aoTocar: () => void) => (
    <Pressable key={chave} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={aoTocar} style={[s.chip, ativo && s.chipAtivo]}>
      <Text style={[s.chipTexto, ativo && s.chipTextoAtivo]}>{rotulo}</Text>
    </Pressable>
  );

  return (
    <Painel visivel aoFechar={aoFechar} rotulo="Registrar a tarefa" topo={
      <View style={{ gap: 2 }}>
        <Text style={s.titulo} numberOfLines={2}>{tarefa.nome ?? 'Tarefa'}</Text>
        <Text style={s.sub} numberOfLines={2}>{tarefa.assunto}</Text>
      </View>
    }>
      <View style={s.corpo}>
        {!!fone && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Ligar para ${tarefa.nome ?? 'o lead'}`} style={s.ligar}
            onPress={() => { void Linking.openURL(`tel:${fone.length <= 11 ? '+55' + fone : '+' + fone}`); }}>
            <IconCall width={20} height={20} fill="#FFFFFF" />
            <Text style={s.ligarTexto}>{`Ligar agora · ${tarefa.telefone}`}</Text>
          </Pressable>
        )}

        <Text style={s.secao}>COMO FOI</Text>
        <View style={s.chips}>
          {COMO_FOI.map((c) => chip(c.id, c.rotulo, comoFoi === c.id, () => { setComoFoi(c.id); setProximoId(proximoSugerido(c.id)); }))}
        </View>

        <Text style={s.secao}>E AGORA</Text>
        <View style={s.chips}>
          {PROXIMOS.map((p) => chip(p.id, p.rotulo, proximoId === p.id, () => setProximoId(p.id)))}
        </View>
        {!tarefa.dealId && proximo.tipo !== 'nada' && (
          <Text style={s.aviso}>Esta tarefa não está ligada a um negócio: o registro entra, mas o próximo passo não tem onde nascer.</Text>
        )}

        <TextInput
          value={nota}
          onChangeText={setNota}
          placeholder="Uma linha, se quiser (ex.: pediu para ligar depois das 15h)"
          placeholderTextColor={cores.muted}
          style={s.nota}
          maxLength={200}
        />

        <Pressable accessibilityRole="button" disabled={!comoFoi} onPress={registrar} style={[s.salvar, !comoFoi && { opacity: 0.45 }]}>
          <Text style={s.salvarTexto}>{comoFoi ? 'Registrar' : 'Escolha como foi'}</Text>
        </Pressable>
      </View>
    </Painel>
  );
}

const s = StyleSheet.create({
  titulo: { fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text-muted)' },
  corpo: { gap: 10, paddingBottom: 16 },
  ligar: { minHeight: 48, borderRadius: 12, backgroundColor: '#16A34A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  ligarTexto: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  secao: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: 'var(--text-muted)', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center' },
  chipAtivo: { backgroundColor: 'var(--text)', borderColor: 'var(--text)' },
  chipTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  chipTextoAtivo: { color: 'var(--bg)' },
  aviso: { fontSize: 12, color: 'var(--tint-amber-text, #B45309)' },
  nota: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', paddingHorizontal: 12, fontSize: 15, color: 'var(--text)', backgroundColor: 'var(--surface)' },
  salvar: { minHeight: 50, borderRadius: 14, backgroundColor: '#C8131B', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  salvarTexto: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
