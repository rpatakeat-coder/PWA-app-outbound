// PARA FECHAR (07/10/2026; desenho novo em 19/10/2026, handoff "Agenda do App" §2.4). Julyan: "como eles
// vão dar esse desfecho? onde eles marcam isso pra não ficar estourado?". A reunião ou retorno que
// passou e ninguém fechou aparece aqui, com Aconteceu · Remarcar · Não aconteceu (RPC
// reuniao_desfecho, 0176 — a mesma que o gestor usa na Pessoas, então os dois lados batem).
//   · check-in ou ficha no mesmo cliente e dia fecha sozinho (gatilho, 0177);
//   · conta os últimos 30 dias (é o que o gestor cobra); as mais antigas viram uma linha de rodapé;
//   · SÓ LEAD (19/10/26): reunião de cliente (status cliente/ganho_fs) não é cobrança de venda — 18
//     lembretes abertos eram de clientes. Ex-cliente (churn) fica: reconquista é venda.
// O leitor (useParaFechar) monta os itens; a Agenda do celular junta as visitas sem "Como foi" no
// mesmo aviso, e o computador usa o componente pronto.
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { Toast } from '../components/Toast';
import { proximoDiaUtil } from '../../supabase/functions/_compartilhado/filaDoDinheiro';
import { Aviso, type ItemDoAviso } from './agenda/PecasDaAgenda';

type Reuniao = { id: string; scheduled_at: string; type: string | null; client_id: string; clients: { empresa: string | null; nome: string | null; status: string | null } | null };

const JANELA_DIAS = 30;
const CLIENTE = new Set(['cliente', 'ganho_fs']);
const diaBRT = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const horaBRT = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const quandoTxt = (iso: string) => {
  const d = diaBRT(new Date(iso));
  const t = new Date(`${d}T12:00:00Z`);
  return `${DIAS[t.getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}, ${horaBRT(iso)}`;
};

export function useParaFechar(userId: string | null) {
  const qc = useQueryClient();
  const [remarcando, setRemarcando] = useState<string | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);
  const [fora, setFora] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ['sem_desfecho', userId],
    enabled: !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from('client_meetings')
        .select('id, scheduled_at, type, client_id, clients(empresa, nome, status)')
        .eq('created_by', userId!).eq('status', 'agendada')
        .lt('scheduled_at', new Date(Date.now() - 2 * 3600_000).toISOString())
        .order('scheduled_at', { ascending: false }).limit(500);
      if (error) throw error;
      return ((data ?? []) as unknown as Reuniao[]).filter((r) => !CLIENTE.has(String(r.clients?.status ?? '')));
    },
  });
  const corte = useMemo(() => new Date(Date.now() - JANELA_DIAS * 86400_000).toISOString(), []);
  const lista = (q.data ?? []).filter((r) => !fora.has(r.id));
  const recentes = lista.filter((r) => r.scheduled_at >= corte);
  const velhas = lista.length - recentes.length;

  const fechar = async (r: Reuniao, status: 'realizada' | 'nao_aconteceu' | 'remarcar', quando?: string) => {
    setGravando(r.id);
    try {
      const { error } = await supabase.rpc('reuniao_desfecho', { p_id: r.id, p_status: status, p_quando: quando ?? null });
      if (error) throw error;
      setFora((s) => new Set(s).add(r.id));
      setRemarcando(null);
      void qc.invalidateQueries({ queryKey: ['client_meetings'] });
      const nome = r.clients?.empresa?.trim() || r.clients?.nome || 'Reunião';
      Toast.mostrar(status === 'realizada' ? `${nome}: aconteceu · salvou` : status === 'nao_aconteceu' ? `${nome}: não aconteceu · salvou` : `${nome}: remarcada para ${quandoTxt(quando!)}`, 'ok');
    } catch (e) {
      Toast.mostrar(`Não salvou: ${String((e as Error)?.message ?? e)}`, 'erro');
    } finally { setGravando(null); }
  };
  /* remarcar: o mesmo horário, no próximo dia útil ou daqui a 2 e 5 dias úteis */
  const opcoes = (r: Reuniao) => {
    const h = horaBRT(r.scheduled_at);
    const hoje = diaBRT(new Date());
    return [1, 2, 5].map((n) => {
      const d = proximoDiaUtil(hoje, n, []);
      return { rot: n === 1 ? `amanhã ${h}` : `${DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`, quando: new Date(`${d}T${h}:00-03:00`).toISOString() };
    });
  };
  const itens: ItemDoAviso[] = recentes.map((r) => {
    const nome = r.clients?.empresa?.trim() || r.clients?.nome || 'Cliente';
    const ocupado = gravando === r.id;
    const sub = `${r.type === 'follow_up' ? 'Retorno' : 'Reunião'} · ${quandoTxt(r.scheduled_at)}`;
    if (remarcando === r.id) {
      return { chave: r.id, nome, sub: 'Remarcar para quando?', acoes: [
        ...opcoes(r).map((o) => ({ rotulo: o.rot, onPress: () => { void fechar(r, 'remarcar', o.quando); }, desligado: ocupado })),
        { rotulo: 'Voltar', onPress: () => setRemarcando(null) },
      ] };
    }
    return { chave: r.id, nome, sub, acoes: [
      { rotulo: 'Aconteceu', principal: true, onPress: () => { void fechar(r, 'realizada'); }, desligado: ocupado },
      { rotulo: 'Remarcar', onPress: () => setRemarcando(r.id), desligado: ocupado },
      { rotulo: 'Não aconteceu', onPress: () => { void fechar(r, 'nao_aconteceu'); }, desligado: ocupado },
    ] };
  });
  const corteDia = diaBRT(new Date(corte));
  const rodape = `${velhas ? `${velhas} ${velhas === 1 ? 'reunião' : 'reuniões'} de antes de ${corteDia.slice(8, 10)}/${corteDia.slice(5, 7)} ${velhas === 1 ? 'fica' : 'ficam'} só no HubSpot. ` : ''}Reunião com cliente não entra aqui.`;
  return { itens, rodape, carregando: q.isLoading };
}

/** O bloco pronto (Agenda do computador): só as reuniões. */
export default function SemDesfecho({ userId }: { userId: string | null }) {
  const p = useParaFechar(userId);
  if (!userId || p.carregando || !p.itens.length) return null;
  return (
    <Aviso nivel="agir" titulo={`Para fechar · ${p.itens.length}`} texto="Reuniões que já passaram e ainda não têm desfecho. O seu gestor vê esta lista."
      itens={p.itens} rodape={p.rodape} />
  );
}
