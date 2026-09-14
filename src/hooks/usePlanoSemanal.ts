// O plano da semana — a INTENÇÃO, que é coisa diferente da rota.
//
// A divisão, decidida na migration 20260914_planos_semanais e que vale repetir
// porque é o eixo inteiro desta tela:
//
//   planos_semanais = INTENÇÃO (que região em cada dia, que leads pretendo)
//   field_routes    = FATO     (a rota do dia, que eu percorro)
//
// O plano MATERIALIZA em rota; nunca reporta o que aconteceu. Por isso aqui
// não há nenhuma contagem de realizado, e por isso os leads são uma LISTA por
// dia e não uma grade de horas: hora prometida é precisão que a rua não tem —
// eu reordeno na calçada, e o app reordena por estrada.
//
// `fechado_em` separa "não planejei" de "planejei e ainda estou mexendo". Sem
// essa distinção, segunda de manhã todo dia sem plano parece igual, e não é.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { diaBRT } from './useMinhaDaily';

const TABELA_AUSENTE = 'PGRST205';

/** Chaves dos dias úteis. Sábado e domingo não existem no plano: a rua não acontece neles. */
export const DIAS_UTEIS = ['seg', 'ter', 'qua', 'qui', 'sex'] as const;
export type DiaUtil = (typeof DIAS_UTEIS)[number];

export const ROTULO_DO_DIA: Record<DiaUtil, string> = {
  seg: 'Segunda',
  ter: 'Terça',
  qua: 'Quarta',
  qui: 'Quinta',
  sex: 'Sexta',
};

export type PlanoSemanal = {
  dataSegunda: string;
  regioes: Partial<Record<DiaUtil, string>>;
  leadsPorDia: Partial<Record<DiaUtil, string[]>>;
  diasBloqueados: DiaUtil[];
  fechadoEm: string | null;
  /** Null = a tabela ainda não existe; a tela diz isso em vez de mostrar vazio. */
  indisponivel: string | null;
};

/**
 * Segunda-feira da semana de `dia`, em Brasília.
 *
 * Domingo pertence à semana que TERMINOU, não à que começa: quem abre o app no
 * domingo à noite para ver o que vem está olhando a semana que acabou, e
 * mostrar a seguinte vazia seria responder outra pergunta.
 */
export function segundaDaSemana(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  const recuo = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  d.setUTCDate(d.getUTCDate() - recuo);
  return d.toISOString().slice(0, 10);
}

/** A data real de cada dia útil da semana que começa em `segunda`. */
export function diaDaSemana(segunda: string, dia: DiaUtil): string {
  const i = DIAS_UTEIS.indexOf(dia);
  const d = new Date(`${segunda}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
}

const VAZIO = (segunda: string, indisponivel: string | null = null): PlanoSemanal => ({
  dataSegunda: segunda,
  regioes: {},
  leadsPorDia: {},
  diasBloqueados: [],
  fechadoEm: null,
  indisponivel,
});

export function usePlanoSemanal(enabled: boolean, referencia = diaBRT(new Date())) {
  const qc = useQueryClient();
  const segunda = segundaDaSemana(referencia);

  const query = useQuery<PlanoSemanal>({
    queryKey: ['plano_semanal', segunda],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: sessao } = await supabase.auth.getUser();
      const meuId = sessao?.user?.id;
      if (!meuId) return VAZIO(segunda);

      const { data, error } = await supabase
        .from('planos_semanais')
        .select('regioes, leads_por_dia, dias_bloqueados, fechado_em')
        .eq('seller_id', meuId)
        .eq('data_segunda', segunda)
        .maybeSingle();
      if (error) {
        if (error.code === TABELA_AUSENTE) {
          return VAZIO(
            segunda,
            'O planejamento da semana ainda não foi configurado no banco.',
          );
        }
        throw error;
      }
      if (!data) return VAZIO(segunda);

      return {
        dataSegunda: segunda,
        regioes: (data.regioes as PlanoSemanal['regioes']) ?? {},
        leadsPorDia: (data.leads_por_dia as PlanoSemanal['leadsPorDia']) ?? {},
        diasBloqueados: (data.dias_bloqueados as DiaUtil[]) ?? [],
        fechadoEm: (data.fechado_em as string | null) ?? null,
        indisponivel: null,
      };
    },
  });

  const salvar = useMutation({
    mutationFn: async (plano: Partial<PlanoSemanal>) => {
      const { data: sessao } = await supabase.auth.getUser();
      const meuId = sessao?.user?.id;
      if (!meuId) throw new Error('sem sessão');
      const atual = query.data ?? VAZIO(segunda);
      const { error } = await supabase.from('planos_semanais').upsert(
        {
          seller_id: meuId,
          data_segunda: segunda,
          regioes: plano.regioes ?? atual.regioes,
          leads_por_dia: plano.leadsPorDia ?? atual.leadsPorDia,
          dias_bloqueados: plano.diasBloqueados ?? atual.diasBloqueados,
          fechado_em:
            plano.fechadoEm !== undefined ? plano.fechadoEm : atual.fechadoEm,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'seller_id,data_segunda' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plano_semanal', segunda] });
    },
  });

  return { plano: query.data ?? VAZIO(segunda), carregando: query.isLoading, salvar, segunda };
}
