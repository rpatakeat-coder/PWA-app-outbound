// OS AVISOS LIGAM NA ABERTURA DO APP (Julyan, 19/10/26: "essa notificação tem que já ser permitida
// automaticamente, não quero que eles escolham"). Nenhum celular deixa um site ligar notificação sem
// a pessoa tocar em "Permitir" na janela do sistema, e essa janela só abre depois de um toque na
// tela. O mais perto disso: o app abre com esta tela e um botão só; quem não ativar vê de novo a cada
// abertura E a cada volta ao app (19/10/26: "toda hora que alguém abrir o app"). O "Agora não" só
// segura 2 minutos, para a janela do sistema não reabrir o pedido na mesma hora. Bloqueado nos Ajustes:
// diz onde liberar, uma vez por dia.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconBell } from '../components/icons';
import { Toast } from '../components/Toast';
import { estadoDosAvisos, ligarPush, type EstadoDoPush } from '../utils/pushDaFila';
import { useComunicadosNaoLidos } from '../hooks/useComunicados';

const PAUSA_MS = 2 * 60_000;
let adiadoEm = 0;
const CHAVE_NEGADO = 'avisos-negado-avisado';
const hojeBRT = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

export default function PedirAvisos({ ativo }: { ativo: boolean }) {
  const [estado, setEstado] = useState<EstadoDoPush | null>(null);
  const [aberto, setAberto] = useState(false);
  const [ligando, setLigando] = useState(false);
  // Um aviso por vez (19/10/26): com comunicado na frente, este espera a pessoa terminar de ler.
  const { naoLidos } = useComunicadosNaoLidos(ativo);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const verificar = () => { void estadoDosAvisos().then((e) => {
      if (!vivo) return;
      setEstado(e);
      if (e === 'ligado' || e === 'sem_suporte') { setAberto(false); return; }
      if (Date.now() - adiadoEm < PAUSA_MS) return;
      try {
        // bloqueado: avisa uma vez por dia (não adianta pedir de novo; só a pessoa libera nos Ajustes)
        if (e === 'negado') { if (localStorage.getItem(CHAVE_NEGADO) === hojeBRT()) return; localStorage.setItem(CHAVE_NEGADO, hojeBRT()); }
      } catch { /* sem armazenamento: pede mesmo assim */ }
      if (e === 'desligado' || e === 'precisa_instalar' || e === 'negado') setAberto(true);
    }).catch(() => undefined); };
    verificar();
    // voltou ao app (trocou de app e voltou, desbloqueou a tela): pede de novo
    const aoVoltar = () => { if (document.visibilityState === 'visible') verificar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { vivo = false; document.removeEventListener('visibilitychange', aoVoltar); };
  }, [ativo]);

  if (!aberto || !estado || naoLidos.length > 0) return null;
  const adiar = () => { adiadoEm = Date.now(); setAberto(false); };
  const ativar = async () => {
    setLigando(true);
    try {
      const e = await ligarPush();
      setEstado(e);
      if (e === 'ligado') { Toast.mostrar('Avisos ligados · mandei um de teste', 'ok'); setAberto(false); }
      else if (e === 'negado') Toast.mostrar('O celular recusou. Libere nos Ajustes para receber os avisos.', 'erro');
    } catch (err) { Toast.mostrar((err as Error).message, 'erro'); }
    finally { setLigando(false); }
  };

  const texto = estado === 'precisa_instalar'
    ? 'No iPhone os avisos só chegam com o app na tela de início. No Safari: toque em Compartilhar › Adicionar à Tela de Início, e abra o app pelo ícone.'
    : estado === 'negado'
      ? 'Os avisos estão bloqueados neste celular. No iPhone: Ajustes › Notificações › APP Field Sales (ou Takeat RPA, se o ícone é antigo) › Permitir. No Android: toque no cadeado ao lado do endereço › Notificações › Permitir.'
      : 'Os quentes esfriando, a hora das ligações e os recados do gestor chegam no celular. Toque em Ativar e depois em Permitir.';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={adiar}>
      <View style={s.fundo}>
        <View style={s.caixa}>
          <View style={s.circulo}><IconBell width={30} height={30} fill="#FFFFFF" /></View>
          <Text style={s.titulo}>{estado === 'negado' ? 'Avisos bloqueados' : 'Ative os avisos do app'}</Text>
          <Text style={s.texto}>{texto}</Text>
          {estado === 'desligado' && (
            <Pressable accessibilityRole="button" disabled={ligando} onPress={() => { void ativar(); }} style={[s.botao, ligando && { opacity: 0.6 }]}>
              <Text style={s.botaoTexto}>{ligando ? 'Ativando…' : 'Ativar avisos'}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={adiar} style={s.depois}>
            <Text style={s.depoisTexto}>{estado === 'desligado' ? 'Agora não' : 'Entendi'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  caixa: { width: '100%', maxWidth: 380, borderRadius: 20, backgroundColor: 'var(--surface)', padding: 22, gap: 12, alignItems: 'center' },
  circulo: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 20, fontWeight: '800', color: 'var(--text)', textAlign: 'center' },
  texto: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)', textAlign: 'center' },
  botao: { alignSelf: 'stretch', minHeight: 52, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  botaoTexto: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  depois: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  depoisTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text-muted)' },
});
