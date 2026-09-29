// O meu plano de desenvolvimento — o PDI do Cockpit, visto do app.
//
// DESDE A 0082 (24/09/2026) o PDI é o do Cockpit, e este hook lia o formato antigo
// (pdi_documentos.seller_id, pdi_compromissos.pdi_id/texto/feito_em, RPC
// pdi_marcar_feito): a consulta quebrava com 42703 e a tela de desempenho perdia o
// bloco inteiro. No formato do Cockpit (28/09/2026):
//   · os ACORDOS são texto da análise semanal (narrativas.reps[owner].compromissos),
//     identificados pela POSIÇÃO;
//   · o ESTADO vive em pdi_compromissos (owner_id + versao_analise), em arrays pelo
//     mesmo índice: checked[i], validado_em[i], devolvido_em[i], devolvido_motivo[i].
// Os dois chegam juntos pela cockpit-dados?recurso=meu-pdi, só os meus.
//
// Marcar "feito" grava checked[i] no mesmo upsert que o Cockpit usa (a RLS deixa o
// dono escrever a própria linha). Validar e devolver continuam sendo do gestor.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, usuarioDaSessao } from '../integrations/supabase/client';

export type EstadoDoCompromisso = 'aberto' | 'feito' | 'validado' | 'devolvido';

export type MeuCompromisso = {
  id: string;
  texto: string;
  feito: boolean;
  estado: EstadoDoCompromisso;
  devolvidoMotivo: string | null;
};

export type MeuPdi = { titulo: string; compromissos: MeuCompromisso[] } | null;

type Resposta = {
  ok?: boolean; semOwner?: boolean; versaoAnalise?: string; ownerId?: string;
  compromissos?: string[];
  estado?: { checked?: boolean[] | null; validado_em?: (string | null)[] | null; devolvido_em?: (string | null)[] | null; devolvido_motivo?: (string | null)[] | null } | null;
};

// Mesma derivação do Cockpit: devolvido vence validado vence feito — a última palavra
// do gestor é a que vale.
export function estadoDoAcordo(i: number, est: Resposta['estado']): EstadoDoCompromisso {
  const feito = !!(est && est.checked && est.checked[i]);
  const validado = (est && est.validado_em && est.validado_em[i]) || null;
  const devolvido = (est && est.devolvido_em && est.devolvido_em[i]) || null;
  if (devolvido && (!validado || devolvido > validado)) return 'devolvido';
  if (validado) return 'validado';
  return feito ? 'feito' : 'aberto';
}

export function useMeuPdi(enabled: boolean) {
  const qc = useQueryClient();

  const query = useQuery<{ pdi: MeuPdi; bruto: Resposta | null }>({
    queryKey: ['meu_pdi'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('cockpit-dados?recurso=meu-pdi', { method: 'GET' });
      // Sem PDI (fora da equipe, sem owner, rede): a tela segue sem o bloco.
      if (error || !data || !(data as Resposta).ok || (data as Resposta).semOwner) return { pdi: null, bruto: null };
      const r = data as Resposta;
      const textos = (r.compromissos || []).filter((t) => typeof t === 'string' && t.trim());
      if (!textos.length) return { pdi: null, bruto: r };
      return {
        bruto: r,
        pdi: {
          titulo: 'Acordos da semana',
          compromissos: textos.map((texto, i) => {
            const estado = estadoDoAcordo(i, r.estado);
            return {
              id: String(i),
              texto,
              feito: !!(r.estado && r.estado.checked && r.estado.checked[i]),
              estado,
              devolvidoMotivo: (r.estado && r.estado.devolvido_motivo && r.estado.devolvido_motivo[i]) || null,
            };
          }),
        },
      };
    },
  });

  const marcar = useMutation({
    mutationFn: async ({ id, feito }: { id: string; feito: boolean }) => {
      const r = query.data?.bruto;
      const { data: s } = await usuarioDaSessao();
      if (!s?.user?.id) throw new Error('Sua sessão não está pronta. Tente de novo em instantes.');
      const { data: perfil } = await supabase.from('profiles').select('id_hubspot').eq('id', s.user.id).maybeSingle();
      const ownerId = (perfil as { id_hubspot?: string | null } | null)?.id_hubspot;
      if (!r || !r.versaoAnalise || !ownerId) throw new Error('PDI indisponível agora.');
      const n = (r.compromissos || []).length;
      const checked = Array.from({ length: n }, (_, i) => !!(r.estado && r.estado.checked && r.estado.checked[i]));
      checked[Number(id)] = feito;
      const { error } = await supabase.from('pdi_compromissos').upsert({
        owner_id: String(ownerId), versao_analise: r.versaoAnalise, checked,
        atualizado_por: s?.user?.email ?? null, updated_at: new Date().toISOString(),
      }, { onConflict: 'owner_id,versao_analise' });
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['meu_pdi'] }); },
  });

  return { pdi: query.data?.pdi ?? null, carregando: query.isLoading, marcar };
}
