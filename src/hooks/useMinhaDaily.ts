import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';

// Minha Daily: a promessa do dia e o que ela virou.
//
// O PROMETIDO e' declarado (tabela `dailies`). O REALIZADO e' derivado de
// client_visits — check-in com GPS. Nunca digitado: um campo de "quantas fiz"
// competiria com a operacao real e sempre perderia.
//
// FUSO DE BRASILIA em toda conta de dia. Usar toISOString() aqui faria a
// promessa das 21h virar do dia seguinte — o mesmo erro que o documento de
// replicacao lista como o que mais custou no sistema original.

const FUSO = 'America/Sao_Paulo';
const fmtDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const diaBRT = (quando: string | Date = new Date()) => fmtDia.format(new Date(quando));

const ehDiaUtil = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return d >= 1 && d <= 5;
};

/** Dias uteis de `hoje` pra tras, hoje primeiro. */
function diasUteisAte(hoje: string, quantos: number): string[] {
  const dias: string[] = [];
  const cursor = new Date(`${hoje}T12:00:00Z`);
  for (let i = 0; dias.length < quantos && i < quantos * 3 + 14; i++) {
    const dia = cursor.toISOString().slice(0, 10);
    if (ehDiaUtil(dia)) dias.push(dia);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dias;
}

export interface DiaDaMinhaDaily {
  dia: string;
  prometido: number | null;
  visitas: number;
  /** null quando nao houve promessa naquele dia: sem promessa nao ha' o que
   *  cumprir, e marcar como falha puniria quem simplesmente nao declarou. */
  cumpriu: boolean | null;
}

export interface MinhaDaily {
  hoje: DiaDaMinhaDaily;
  /** Os 5 ultimos dias uteis, do mais antigo pro mais novo. */
  semana: DiaDaMinhaDaily[];
  /** Dias uteis seguidos cumprindo, contando de ONTEM pra tras — o dia de hoje
   *  ainda esta' acontecendo e zera-lo de manha faria o numero mentir. */
  sequencia: number;
  notaDeHoje: string | null;
}

const JANELA = 30; // dias uteis olhados pra tras: cobre a sequencia com folga

export function useMinhaDaily(enabled: boolean) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const meuId = profile?.id ?? null;

  const query = useQuery<MinhaDaily | null>({
    queryKey: ['minha_daily', meuId],
    queryFn: async () => {
      if (!meuId) return null;
      const hoje = diaBRT();
      const dias = diasUteisAte(hoje, JANELA);
      const maisAntigo = dias[dias.length - 1];

      const [promessas, visitas] = await Promise.all([
        supabase
          .from('dailies')
          .select('data, prometido_visitas, nota_campo')
          .eq('seller_id', meuId)
          .gte('data', maisAntigo),
        supabase
          .from('client_visits')
          .select('visited_at')
          .eq('visited_by', meuId)
          .gte('visited_at', `${maisAntigo}T00:00:00Z`),
      ]);

      const prometidoPorDia = new Map<string, number | null>();
      const notaPorDia = new Map<string, string | null>();
      for (const p of (promessas.data ?? []) as any[]) {
        prometidoPorDia.set(p.data, p.prometido_visitas ?? null);
        notaPorDia.set(p.data, p.nota_campo ?? null);
      }

      const visitasPorDia = new Map<string, number>();
      for (const v of (visitas.data ?? []) as any[]) {
        const d = diaBRT(v.visited_at);
        visitasPorDia.set(d, (visitasPorDia.get(d) ?? 0) + 1);
      }

      const monta = (dia: string): DiaDaMinhaDaily => {
        const prometido = prometidoPorDia.get(dia) ?? null;
        const feitas = visitasPorDia.get(dia) ?? 0;
        return {
          dia,
          prometido,
          visitas: feitas,
          cumpriu: prometido == null ? null : feitas >= prometido,
        };
      };

      let sequencia = 0;
      for (const dia of dias.slice(1)) {
        const d = monta(dia);
        // Dia sem promessa nao quebra a serie nem conta: nao ha' com o que
        // comparar, e zerar por falta de declaracao puniria ferias e feriado.
        if (d.cumpriu === null) continue;
        if (d.cumpriu) sequencia++;
        else break;
      }

      return {
        hoje: monta(hoje),
        semana: diasUteisAte(hoje, 5).reverse().map(monta),
        sequencia,
        notaDeHoje: notaPorDia.get(hoje) ?? null,
      };
    },
    enabled: enabled && !!meuId,
    staleTime: 60_000,
  });

  const prometer = useMutation({
    mutationFn: async (quantas: number) => {
      if (!meuId) throw new Error('Sem sessão');
      const { error } = await supabase
        .from('dailies')
        .upsert(
          {
            seller_id: meuId,
            data: diaBRT(),
            prometido_visitas: quantas,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'seller_id,data' },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['minha_daily', meuId] }),
  });

  const anotar = useMutation({
    mutationFn: async (nota: string) => {
      if (!meuId) throw new Error('Sem sessão');
      const { error } = await supabase
        .from('dailies')
        .upsert(
          {
            seller_id: meuId,
            data: diaBRT(),
            nota_campo: nota.trim() || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'seller_id,data' },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['minha_daily', meuId] }),
  });

  return { daily: query.data ?? null, isLoading: query.isLoading, prometer, anotar };
}
