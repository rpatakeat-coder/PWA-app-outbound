import { Linking } from 'react-native';
import { Alert } from '../components/Alert';
import { gravarContato } from './contatoDeCampo';

// Helpers de WhatsApp, movidos do App.tsx na extracao das telas (prompt 02).
export function toWhatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length < 10) return null;
  // Se ja tem DDI 55 (13 digitos) ou outro DDI longo, mantem; senao adiciona 55.
  if (d.length >= 12 && d.startsWith('55')) return d;
  return `55${d}`;
}

/** `contato`: quando vem do cartão de um lead, abrir a conversa conta como ponto de contato
 *  no dossiê de campo do gestor (0144). O app não vê a conversa: o que se mede é o toque. */
export function openWhatsapp(rawPhone: string | null | undefined, contato?: { clientId?: string | null; dealId?: string | null }): boolean {
  const num = toWhatsappNumber(rawPhone);
  if (!num) {
    Alert.alert('Telefone invalido', 'O telefone do cliente nao tem formato valido pra abrir o WhatsApp.');
    return false;
  }
  const url = `https://wa.me/${num}`;
  if (contato) void gravarContato({ canal: 'whatsapp', clientId: contato.clientId, dealId: contato.dealId });
  Linking.openURL(url).catch(() =>
    Alert.alert('Erro', 'Nao foi possivel abrir o WhatsApp. Verifique se o aplicativo esta instalado.'),
  );
  return true;
}
