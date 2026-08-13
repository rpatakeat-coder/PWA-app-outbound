import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../integrations/supabase/client';
import { checkAndReloadIfUpdateAvailable } from '../utils/updates';

// Mantém o app na versão mais nova com 3 gatilhos:
//  1. Cold start (mount): checa se há build novo e recarrega se houver.
//     Resolve o caso clássico "abri o app, ainda tô na versão velha".
//  2. AppState -> active: re-checa quando o usuário volta do background.
//     Cobre o caso "ficou aberto na aba a semana toda".
//  3. Realtime subscription em app_force_reload: quando o admin (ou o
//     cron 2am) atualiza triggered_at, todo cliente conectado faz a
//     mesma dança de check + ativar + reload.
//
// No PWA quem entrega a versão nova é o service worker (ver utils/updates).
// AppState continua funcionando: o react-native-web o implementa em cima do
// visibilitychange, então 'active' = aba voltou ao primeiro plano.
export function useForceReload(enabled: boolean) {
  const lastTriggeredAt = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    // 1. Cold-start check
    checkAndReloadIfUpdateAvailable();

    // 2. Captura o triggered_at atual pra não disparar um reload na primeira
    //    leitura — só queremos reagir a UPDATEs futuros.
    (async () => {
      const { data, error } = await supabase
        .from('app_force_reload')
        .select('triggered_at')
        .eq('id', 1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('[FORCE_RELOAD] leitura inicial falhou:', error.message);
        return;
      }
      if (data?.triggered_at) {
        lastTriggeredAt.current = data.triggered_at as string;
      }
    })();

    // 3. Realtime: escuta UPDATEs na campainha
    const channel = supabase
      .channel('app_force_reload_signal')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_force_reload' },
        (payload) => {
          const next = (payload.new as { triggered_at?: string } | null)?.triggered_at;
          if (!next) return;
          if (lastTriggeredAt.current && next <= lastTriggeredAt.current) return;
          lastTriggeredAt.current = next;
          checkAndReloadIfUpdateAvailable();
        }
      )
      .subscribe();

    // 4. AppState foreground: re-check sempre que voltar do background
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndReloadIfUpdateAvailable();
    });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      sub.remove();
    };
  }, [enabled]);
}
