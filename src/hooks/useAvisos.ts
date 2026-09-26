// Sino de Avisos do mapa novo (prompt final §5, §8.10 e §B4 "Coerência").
//
// O sino é para o que NÃO é tarefa — as tarefas já têm o selo na aba Tarefas:
//   - atualizações do motor: conta-alvo que o motor viu fechar, fechar por um
//     tempo ou com CNPJ baixado, nos últimos 30 dias (minhas; o gestor vê todas);
//   - falhas de sincronização: envios da fila offline que não subiram.
// O selo conta o que chegou depois da última vez que a pessoa abriu o sino
// (motor) mais as falhas, que valem até serem resolvidas.
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { ouvirFila, type ItemFila } from '../utils/filaOffline';

export type AvisoMotor = {
  id: string;
  nome: string;
  cidade: string | null;
  status: 'sumiu_google' | 'fechado_temporario' | 'cnpj_baixado';
  em: string;
};

const CHAVE_VISTO = 'takeat-avisos-visto-em';
const lerVisto = () => { try { return Number(localStorage.getItem(CHAVE_VISTO)) || 0; } catch { return 0; } };

export type AvisoGestor = { id: string; titulo: string; em: string; autor: string | null };

/** Motivo curto do motor, para a linha do sino (§6.11: nome, motivo e cidade). */
export function motivoDoMotor(a: AvisoMotor): string {
  return a.status === 'sumiu_google' ? 'sumiu do Google'
    : a.status === 'cnpj_baixado' ? 'CNPJ baixado'
    : 'fechado';
}

export function textoDoMotor(a: AvisoMotor): string {
  const quando = new Date(a.em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  const oque = a.status === 'sumiu_google' ? 'sumiu do Google — pode ter fechado'
    : a.status === 'cnpj_baixado' ? 'CNPJ baixado na Receita'
    : 'fechado temporariamente no Google';
  return `Motor (${quando}): ${a.nome} ${oque}`;
}

export function useAvisos(ativo: boolean, meuOwnerId: string | null, verTodos: boolean) {
  const motor = useQuery<AvisoMotor[]>({
    queryKey: ['avisos_motor', meuOwnerId, verTodos],
    // SÓ O GESTOR (Julyan, 26/09: "isso nem era pra ter pro executivo, é lixo de
    // informação"). Conta-alvo com CNPJ baixado já sai do mapa sozinha; o resto
    // (sumiu do Google, fechado) é triagem da carteira, que é do gestor.
    enabled: ativo && verTodos,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      let q = supabase.from('clients')
        .select('id, empresa, nome, cidade, motor_status, motor_conferido_em')
        .in('motor_status', ['sumiu_google', 'fechado_temporario', 'cnpj_baixado'])
        .gte('motor_conferido_em', desde)
        .or('conta_alvo_dismissed.is.null,conta_alvo_dismissed.eq.false')
        .order('motor_conferido_em', { ascending: false })
        .limit(60);
      if (!verTodos && meuOwnerId) q = q.eq('vendedor_id_hubspot', meuOwnerId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({
        id: c.id, nome: (c.empresa?.trim() || c.nome || 'Sem nome') as string, cidade: c.cidade ?? null,
        status: c.motor_status, em: c.motor_conferido_em,
      }));
    },
  });

  // DO GESTOR: os recados dos últimos 14 dias. O não lido já abre sozinho
  // (folha na raiz do App); aqui fica o registro para reler.
  const gestor = useQuery<AvisoGestor[]>({
    queryKey: ['avisos_gestor'],
    enabled: ativo,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data, error } = await supabase.from('comunicados')
        .select('id, titulo, publicado_em, created_by_name')
        .not('publicado_em', 'is', null)
        .gte('publicado_em', desde)
        .order('publicado_em', { ascending: false })
        .limit(5);
      if (error) return []; // tabela ausente ou sem permissão: sem bloco, sem quebrar
      return ((data ?? []) as any[]).map((c) => ({ id: c.id, titulo: c.titulo, em: c.publicado_em, autor: c.created_by_name ?? null }));
    },
  });

  const [fila, setFila] = useState<ItemFila[]>([]);
  useEffect(() => (ativo ? ouvirFila(setFila) : undefined), [ativo]);
  const falhas = useMemo(() => fila.filter((i) => i.estado === 'falhou'), [fila]);

  const [vistoEm, setVistoEm] = useState<number>(lerVisto);
  const novosMotor = (motor.data ?? []).filter((a) => Date.parse(a.em) > vistoEm).length;
  const marcarVisto = () => {
    const agora = Date.now();
    setVistoEm(agora);
    try { localStorage.setItem(CHAVE_VISTO, String(agora)); } catch { /* sem storage: volta a contar */ }
  };

  return {
    motor: motor.data ?? [],
    gestor: gestor.data ?? [],
    carregando: motor.isLoading,
    falhas,
    selo: novosMotor + falhas.length,
    vistoEm,
    marcarVisto,
  };
}
