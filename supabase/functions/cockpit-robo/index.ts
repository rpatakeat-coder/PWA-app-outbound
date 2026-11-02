// cockpit-robo: o MESMO supabase/functions/cockpit-api/index.ts, publicado sem verify_jwt porque os robôs
// do GitHub (Casa dos Dados, Google Places, carteira de quem saiu) não têm JWT: aqui só abre importar-leads,
// que valida x-import-secret (ou a sessão) por conta própria.
//
// ATÉ 02/11/26 este arquivo não existia no repositório: a função publicada importava o cockpit-api de um
// commit FIXO de 14/10 pelo GitHub raw, e a cada publicação do cockpit-api os robôs ficavam com o código
// velho (auditoria do backend). Agora o import é relativo: cada deploy leva o cockpit-api do mesmo commit.
//
// Deploy: supabase functions deploy cockpit-robo --no-verify-jwt
import '../cockpit-api/index.ts';
