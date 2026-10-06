// Onde o pino está no plano dos próximos dias úteis (o status do cartão do pino).
// Relê quando o Pôr no plano grava (aoMudarOPlano). Falha de leitura = null (o cartão
// diz "Ainda não está no plano" só quando a leitura voltou vazia, nunca no erro).
import { useEffect, useState } from 'react';

import { diasPlanejaveis } from '../utils/planoNoMapa';
import { aoMudarOPlano, lerPlanoDosDias, ondeEsta, type OndeEsta } from '../utils/planoDoPino';

export type EstadoNoPlano = { lido: boolean; onde: OndeEsta | null };

export function useOndeNoPlano(uid: string | null | undefined, clientId: string | null | undefined): EstadoNoPlano {
  const [estado, setEstado] = useState<EstadoNoPlano>({ lido: false, onde: null });
  const [versao, setVersao] = useState(0);
  useEffect(() => aoMudarOPlano(() => setVersao((v) => v + 1)), []);
  useEffect(() => {
    if (!uid || !clientId) { setEstado({ lido: false, onde: null }); return; }
    let vivo = true;
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const dias = diasPlanejaveis(hoje, 5).map((d) => d.iso);
    lerPlanoDosDias(uid, dias).then(
      (p) => { if (vivo) setEstado({ lido: true, onde: ondeEsta(clientId, p, dias) }); },
      () => { if (vivo) setEstado({ lido: false, onde: null }); },
    );
    return () => { vivo = false; };
  }, [uid, clientId, versao]);
  return estado;
}
