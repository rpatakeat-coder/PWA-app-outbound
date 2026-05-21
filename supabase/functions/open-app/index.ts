// Supabase Edge Function: open-app
// Redireciona (302) direto pro deep link do Expo Go.
//
// URL pública: https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1/open-app
//
// O Supabase força Content-Type: text/plain + CSP sandbox em Edge Functions,
// então não dá pra servir página HTML — só redirect. Os navegadores modernos
// seguem o 302 pro custom scheme exp:// e o OS dispara o Expo Go.
//
// Deploy:
//   supabase functions deploy open-app --no-verify-jwt

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const EAS_PROJECT_ID = '622d3aef-f019-4487-bdac-a675df42ebeb';
const EAS_CHANNEL = 'production';
const EXPO_RUNTIME = 'exposdk:54.0.0'; // Atualizar quando migrar SDK

const EXPO_GO_URL = `exp://u.expo.dev/${EAS_PROJECT_ID}?channel-name=${EAS_CHANNEL}&runtime-version=${EXPO_RUNTIME}`;

Deno.serve(() => {
  return new Response(null, {
    status: 302,
    headers: {
      Location: EXPO_GO_URL,
      'Cache-Control': 'no-store',
    },
  });
});
