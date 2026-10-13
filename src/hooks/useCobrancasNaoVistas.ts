// As cobranças do gestor que esta pessoa ainda não viu, para abrir sozinhas na tela inicial.
//
// O "Cobrar" do Cockpit (Hoje, Daily, Funil) grava em `sugestoes_planos` — a mesma tabela do
// recado da Pessoas. Até 13/10/26 isso só chegava ao sino, que o executivo precisa ir abrir;
// o gestor cobrava e ficava sem saber se chegou (Julyan: "quero cobrar direto no app do
// executivo"). Agora a cobrança sobe na frente dele ao abrir o app, igual ao comunicado.
//
// O "visto" fica NO APARELHO (localStorage), porque a tabela não tem coluna de leitura: é a
// mesma marca que o sino já usa para o selo, então ver aqui também apaga o selo de lá. Por
// isso a folha não promete "fica registrado que você leu" — quem mede leitura é o comunicado.
//
// Só os últimos 3 dias: cobrança de semana passada aberta hoje é ruído, e o sino guarda 14.
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, usuarioDaSessao } from '../integrations/supabase/client';

export type CobrancaNaoVista = { id: string; texto: string; autor: string | null; em: string };

/** A mesma chave do selo do sino (src/hooks/useAvisos.ts). */
const CHAVE_VISTO = 'takeat-recado-visto-em';
function vistoEm(): number {
  try { return Number(localStorage.getItem(CHAVE_VISTO)) || 0; } catch { return 0; }
}

export function useCobrancasNaoVistas(enabled: boolean) {
  const [visto, setVisto] = useState<number>(() => vistoEm());
  const query = useQuery<CobrancaNaoVista[]>({
    queryKey: ['cobrancas_nao_vistas'],
    enabled,
    // a cobrança precisa chegar com o app aberto também: relê a cada 2 minutos e ao voltar ao app
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: s0 } = await usuarioDaSessao();
      // sessão ainda não restaurada: falha e o react-query tenta de novo (o vazio não fica guardado)
      if (!s0?.user?.id) throw new Error('sessão ainda não restaurada');
      const { data: perfil } = await supabase.from('profiles').select('id_hubspot').eq('id', s0.user.id).maybeSingle();
      const meu = (perfil as { id_hubspot?: string | null } | null)?.id_hubspot;
      if (!meu) return [];
      const desde = new Date(Date.now() - 3 * 86400000).toISOString();
      const { data, error } = await supabase.from('sugestoes_planos')
        .select('id, texto, autor, created_at').eq('owner_id', String(meu))
        .gte('created_at', desde).order('created_at', { ascending: true }).limit(20);
      if (error) return []; // sem permissão ou tabela fora: sem folha, sem quebrar
      return ((data ?? []) as { id: string; texto: string | null; autor: string | null; created_at: string }[])
        .filter((r) => r.texto && String(r.texto).trim())
        .map((r) => ({ id: r.id, texto: String(r.texto), autor: r.autor ?? null, em: r.created_at }));
    },
  });

  const naoVistas = (query.data ?? []).filter((c) => Date.parse(c.em) > visto);

  const confirmar = useCallback((id: string) => {
    const c = (query.data ?? []).find((x) => x.id === id);
    const marca = Math.max(vistoEm(), c ? Date.parse(c.em) : Date.now());
    try { localStorage.setItem(CHAVE_VISTO, String(marca)); } catch { /* só nesta sessão */ }
    setVisto(marca);
  }, [query.data]);

  return { naoVistas, confirmar };
}
