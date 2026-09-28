// O canal ao vivo do mapa (Cockpit v5, contrato Mapa ⇄ Cockpit, 28/09/2026).
//
// A migration 0128 grava um sinal pequeno em `sinais_ao_vivo` sempre que um pino, um
// negócio, uma parada, um plano, uma visita ou um comunicado muda — venha a mudança do
// próprio app, do Cockpit ou do robô. Aqui o mapa escuta esse sinal e atualiza só o que
// ele afeta: o pino muda de cor, a parada aparece e o sino acende sem ninguém recarregar.
// O sinal não traz conteúdo: quem relê é o app, com a sessão e a RLS de sempre.
//
// PINO SE RELÊ LINHA A LINHA. Invalidar ['clients'] relê a base inteira do recorte
// (~9 mil linhas para o gestor, 12 s medidos em 26/09): com um sinal por pino isso
// travaria o mapa. A linha que mudou é relida e trocada no cache; pino que NASCEU
// (pino-novo) não está em cache nenhum, e só por ele a base é relida — no máximo uma vez
// por minuto, porque a sincronização cria pinos em lote.
//
// Executivo só reage ao que é dele (ou ao que não tem dono, como comunicado); o gestor
// reage a tudo. Vários sinais em sequência viram UMA releitura (junta 1,2 s).
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { CLIENT_LIST_COLUMNS } from './useClients';
import type { Client } from '../types/client';

type Sinal = { tipo?: string; owner_id?: string | null; client_id?: string | null; deal_id?: string | null };

// O que cada tipo de sinal torna velho no mapa (chaves do react-query). `pino` e
// `pino-novo` também mexem em ['clients'], pelo caminho próprio (ver acima).
export const INVALIDA_POR_TIPO: Record<string, string[][]> = {
  pino: [['mapa-contexto']],
  'pino-novo': [['mapa-contexto']],
  negocio: [['mapa-contexto'], ['tarefas_crm']],
  visita: [['meu_dia'], ['minha_daily'], ['client_visits']],
  foto: [['client_visits']],
  ficha: [['meu_dia']],
  parada: [['field_routes'], ['field_route_stops'], ['meu_dia']],
  plano: [['field_routes'], ['field_route_stops'], ['meu_dia']],
  comunicado: [['avisos_gestor'], ['comunicados_nao_lidos']],
  recado: [['avisos_gestor']],
  // 0129: o gestor validou ou devolveu um acordo do 1:1 (ou eu marquei em outro aparelho)
  pdi: [['meu_pdi']],
  // 0130: agendamento (Agendar do app) criado, reagendado ou cancelado
  agenda: [['client_meetings']],
  // cockpit-api: próximo passo criado no Cockpit (tarefa no HubSpot) — a Agenda e as Tarefas releem
  tarefa: [['tarefas_crm']],
};

export function sinalMeInteressa(s: Sinal, meuOwnerId: string | null, ehGestor: boolean): boolean {
  if (!s || !s.tipo || !INVALIDA_POR_TIPO[s.tipo]) return false;
  if (ehGestor) return true;
  if (!s.owner_id) return true;
  return !!meuOwnerId && String(s.owner_id) === String(meuOwnerId);
}

const RELER_BASE_NO_MAXIMO_A_CADA_MS = 60_000;

export function useAoVivo(ativo: boolean, meuOwnerId: string | null, ehGestor: boolean) {
  const qc = useQueryClient();
  const tipos = useRef<Set<string>>(new Set());
  const pinos = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseRelidaEm = useRef(0);
  const donoRef = useRef({ meuOwnerId, ehGestor });
  donoRef.current = { meuOwnerId, ehGestor };

  useEffect(() => {
    if (!ativo) return;
    const aplicar = async () => {
      timer.current = null;
      const chaves = new Map<string, string[]>();
      tipos.current.forEach((tipo) => (INVALIDA_POR_TIPO[tipo] || []).forEach((k) => chaves.set(k.join('|'), k)));
      const nasceu = tipos.current.has('pino-novo');
      const ids = [...pinos.current].slice(0, 200);
      tipos.current.clear();
      pinos.current.clear();
      chaves.forEach((k) => { void qc.invalidateQueries({ queryKey: k }); });
      if (nasceu && Date.now() - baseRelidaEm.current > RELER_BASE_NO_MAXIMO_A_CADA_MS) {
        baseRelidaEm.current = Date.now();
        void qc.invalidateQueries({ queryKey: ['clients'] });
        return;
      }
      if (!ids.length) return;
      const { data, error } = await supabase.from('clients').select(CLIENT_LIST_COLUMNS).in('id', ids);
      if (error || !Array.isArray(data)) return;
      const porId = new Map((data as unknown as Client[]).map((c) => [c.id, c]));
      // Só TROCA o que já está no cache: pôr um pino num recorte (bounds, status) de que
      // ele não faz parte mostraria pino onde a consulta não o traria.
      qc.setQueriesData<Client[]>({ queryKey: ['clients'] }, (lista) => {
        if (!lista) return lista;
        let mudou = false;
        const nova = lista.map((c) => {
          const n = porId.get(c.id);
          if (!n) return c;
          mudou = true;
          return { ...c, ...n };
        });
        return mudou ? nova : lista;
      });
    };
    const canal = supabase
      .channel('ao-vivo-mapa')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sinais_ao_vivo' }, (payload) => {
        const s = (payload.new || {}) as Sinal;
        const { meuOwnerId: dono, ehGestor: gestor } = donoRef.current;
        if (!sinalMeInteressa(s, dono, gestor)) return;
        tipos.current.add(String(s.tipo));
        if ((s.tipo === 'pino' || s.tipo === 'visita') && s.client_id) pinos.current.add(String(s.client_id));
        if (!timer.current) timer.current = setTimeout(() => { void aplicar(); }, 1200);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      supabase.removeChannel(canal);
    };
  }, [ativo, qc]);
}
