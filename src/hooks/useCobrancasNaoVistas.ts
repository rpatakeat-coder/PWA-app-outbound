// As cobranças do gestor que esta pessoa ainda não viu, para abrir sozinhas na tela inicial.
//
// O "Cobrar" do Cockpit (Hoje, Daily, Funil) grava em `sugestoes_planos` — a mesma tabela do
// recado da Pessoas. Até 13/10/26 isso só chegava ao sino, que o executivo precisa ir abrir;
// o gestor cobrava e ficava sem saber se chegou (Julyan: "quero cobrar direto no app do
// executivo"). Agora a cobrança sobe na frente dele ao abrir o app, igual ao comunicado.
//
// O "visto" fica NO APARELHO (localStorage): é a mesma marca que o sino já usa para o selo,
// então ver aqui também apaga o selo de lá. Desde 04/11/26 (0250) o "Entendi" TAMBÉM carimba
// sugestoes_planos.visto_em pela função marcar_recado_visto, e o Cockpit mostra "visto HH:MM"
// (Julyan: "quero que apareça lá, que ele veja"). Recado já visto em outro aparelho não abre de novo.
//
// Só os últimos 3 dias: cobrança de semana passada aberta hoje é ruído, e o sino guarda 14.
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, usuarioDaSessao } from '../integrations/supabase/client';

export type CobrancaNaoVista = { id: string; texto: string; autor: string | null; em: string; visto: boolean };

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
    // a cobrança precisa chegar com o app aberto também. Auditoria 02/11/26: a releitura de 2 em 2 min
    // (com 60 s de validade e a volta ao app) era a maior parte das ~1.200 leituras/dia de
    // sugestoes_planos. Agora a cobrança chega pelo sinal ao vivo 'recado' (useAoVivo, gatilho
    // sinal_recado em sugestoes_planos); os 10 min e a volta ao app ficam de rede de segurança.
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    // auditoria 02/11/26: com a aba escondida não relê (é o padrão do React Query; explícito para ninguém ligar)
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: s0 } = await usuarioDaSessao();
      // sessão ainda não restaurada: falha e o react-query tenta de novo (o vazio não fica guardado)
      if (!s0?.user?.id) throw new Error('sessão ainda não restaurada');
      const { data: perfil } = await supabase.from('profiles').select('id_hubspot').eq('id', s0.user.id).maybeSingle();
      const meu = (perfil as { id_hubspot?: string | null } | null)?.id_hubspot;
      if (!meu) return [];
      const desde = new Date(Date.now() - 3 * 86400000).toISOString();
      // visto_em: a hora do "Entendi" (0250), para o gestor
      const { data, error } = await supabase.from('sugestoes_planos')
        .select('id, texto, autor, created_at, visto_em').eq('owner_id', String(meu))
        .gte('created_at', desde).order('created_at', { ascending: true }).limit(20);
      if (error) return []; // sem permissão ou tabela fora: sem folha, sem quebrar
      return ((data ?? []) as { id: string; texto: string | null; autor: string | null; created_at: string; visto_em?: string | null }[])
        .filter((x) => x.texto && String(x.texto).trim())
        .map((x) => ({ id: x.id, texto: String(x.texto), autor: x.autor ?? null, em: x.created_at, visto: !!x.visto_em }));
    },
  });

  const naoVistas = (query.data ?? []).filter((c) => !c.visto && Date.parse(c.em) > visto);

  const confirmar = useCallback((id: string) => {
    const c = (query.data ?? []).find((x) => x.id === id);
    const marca = Math.max(vistoEm(), c ? Date.parse(c.em) : Date.now());
    try { localStorage.setItem(CHAVE_VISTO, String(marca)); } catch { /* só nesta sessão */ }
    setVisto(marca);
    // o carimbo para o gestor: este e os anteriores que a marca também apaga. Sem sinal, a folha não volta
    // (a marca local vale); o carimbo falha calado e o Cockpit segue dizendo "não viu" — é o certo.
    const ids = (query.data ?? []).filter((x) => !x.visto && Date.parse(x.em) <= marca).map((x) => x.id);
    if (ids.length) void supabase.rpc('marcar_recado_visto', { p_ids: ids }).then(() => undefined, () => undefined);
  }, [query.data]);

  return { naoVistas, confirmar };
}
