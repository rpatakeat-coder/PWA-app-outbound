// Enquadrar a foto antes de subir: arrastar, ampliar, confirmar.
//
// POR QUE EXISTE
// Até 17/09/2026 o recorte era centralizado e automático. Funciona para foto
// posada; não funciona para o caso real, que é a pessoa achar uma foto onde
// aparece de lado, num grupo, ou com a cabeça na borda. O recorte automático
// entregava a orelha de alguém e não havia nada a fazer além de procurar outra
// foto.
//
// A GEOMETRIA NÃO ESTÁ AQUI. Ela é pura e testada em src/utils/fotoDePerfil.ts
// (`escalaBase`, `limitesDoOffset`, `recorteDoEnquadramento`) — é onde um sinal
// invertido põe o rosto fora do círculo sem o typecheck reclamar. Aqui só vive
// o gesto e o desenho.
//
// O CÍRCULO É A VERDADE. O avatar é redondo em todo lugar do app, então a
// prévia é redonda: mostrar um quadrado e entregar um círculo faria a pessoa
// enquadrar contando com cantos que ela nunca vai ver.
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLayout } from '../hooks/useLayout';
import {
  ZOOM_MAXIMO,
  distanciaEntre,
  limitar,
  limitesDoOffset,
  recorteDoEnquadramento,
  type Recorte,
} from '../utils/fotoDePerfil';

export function AjustarFotoSheet({
  url,
  largura,
  altura,
  enviando,
  aoCancelar,
  aoConfirmar,
}: {
  /** URL local da imagem escolhida (object URL). */
  url: string;
  largura: number;
  altura: number;
  enviando: boolean;
  aoCancelar: () => void;
  aoConfirmar: (recorte: Recorte) => void;
}) {
  const layout = useLayout();
  // O quadrado de trabalho. Teto de 320 para caber em 390px com margem e
  // continuar dando espaço aos botões sem rolagem.
  const viewport = Math.min(320, layout.largura - 72);

  const [escala, setEscala] = useState(1);
  const [desloc, setDesloc] = useState({ x: 0, y: 0 });

  // Refs espelham o estado porque o PanResponder é criado UMA vez: dentro dos
  // callbacks, o valor capturado no primeiro render ficaria congelado e o
  // segundo arrasto começaria do zero.
  const escalaRef = useRef(1);
  const deslocRef = useRef({ x: 0, y: 0 });
  const inicioRef = useRef({ x: 0, y: 0 });
  const pincaRef = useRef<{ distancia: number; escala: number } | null>(null);

  const aplicar = (x: number, y: number, novaEscala: number) => {
    const e = Math.max(1, Math.min(ZOOM_MAXIMO, novaEscala));
    const lim = limitesDoOffset(largura, altura, viewport, e);
    const pos = { x: limitar(x, lim.x), y: limitar(y, lim.y) };
    escalaRef.current = e;
    deslocRef.current = pos;
    setEscala(e);
    setDesloc(pos);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        inicioRef.current = deslocRef.current;
        pincaRef.current = null;
      },
      onPanResponderMove: (evt, gesto) => {
        const toques = evt.nativeEvent.touches;
        if (toques && toques.length >= 2) {
          // Pinça. A referência é tirada no primeiro quadro com dois dedos, não
          // no grant: o segundo dedo entra depois, e usar o grant faria a
          // imagem dar um salto no instante em que ele toca.
          const d = distanciaEntre(toques[0], toques[1]);
          if (!pincaRef.current) {
            pincaRef.current = { distancia: d, escala: escalaRef.current };
            return;
          }
          const base = pincaRef.current;
          if (base.distancia > 0) {
            aplicar(deslocRef.current.x, deslocRef.current.y, base.escala * (d / base.distancia));
          }
          return;
        }
        pincaRef.current = null;
        aplicar(
          inicioRef.current.x + gesto.dx,
          inicioRef.current.y + gesto.dy,
          escalaRef.current,
        );
      },
      onPanResponderRelease: () => { pincaRef.current = null; },
      onPanResponderTerminate: () => { pincaRef.current = null; },
    }),
  ).current;

  // Medidas da prévia: a imagem inteira, escalada, com o quadrado por cima.
  const fator = (viewport / Math.min(largura, altura)) * escala;
  const larguraNaTela = largura * fator;
  const alturaNaTela = altura * fator;

  const lim = limitesDoOffset(largura, altura, viewport, escala);
  const podeArrastar = lim.x > 0.5 || lim.y > 0.5;

  const passo = (delta: number) =>
    aplicar(deslocRef.current.x, deslocRef.current.y, escalaRef.current + delta);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={aoCancelar}>
      <View style={[estilos.fundo, layout.ehLargo && estilos.fundoWeb]}>
        {/* Backdrop IRMÃO, nunca envolvendo — regra do CLAUDE.md. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={enviando ? undefined : aoCancelar} />

        <View style={[estilos.folha, layout.ehLargo && estilos.folhaWeb]}>
          <Text style={estilos.titulo}>Enquadre sua foto</Text>
          <Text style={estilos.ajuda}>
            {podeArrastar
              ? 'Arraste para posicionar e use − / + para aproximar. O que estiver no círculo é o que aparece.'
              : 'Use − / + para aproximar. O que estiver no círculo é o que aparece.'}
          </Text>

          <View style={estilos.centro}>
            <View
              style={[estilos.janela, { width: viewport, height: viewport, borderRadius: viewport / 2 }]}
              {...pan.panHandlers}
            >
              <Image
                source={{ uri: url }}
                style={{
                  width: larguraNaTela,
                  height: alturaNaTela,
                  // Centraliza a imagem no quadrado e aplica o arrasto. O
                  // `position: absolute` com left/top calculados é o que
                  // mantém o mesmo referencial da geometria testada.
                  position: 'absolute',
                  left: (viewport - larguraNaTela) / 2 + desloc.x,
                  top: (viewport - alturaNaTela) / 2 + desloc.y,
                }}
                resizeMode="cover"
              />
            </View>
          </View>

          <View style={estilos.zoom}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Diminuir"
              onPress={() => passo(-0.25)}
              disabled={enviando || escala <= 1}
              style={[estilos.botaoZoom, (enviando || escala <= 1) && estilos.desabilitado]}
            >
              <Text style={estilos.botaoZoomTexto}>−</Text>
            </TouchableOpacity>
            {/* Trilha só informativa: a régua diz onde está o zoom sem virar um
                segundo controle para acertar com o dedo. */}
            <View style={estilos.trilha}>
              <View
                style={[
                  estilos.trilhaCheia,
                  { width: `${((escala - 1) / (ZOOM_MAXIMO - 1)) * 100}%` },
                ]}
              />
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Aproximar"
              onPress={() => passo(0.25)}
              disabled={enviando || escala >= ZOOM_MAXIMO}
              style={[estilos.botaoZoom, (enviando || escala >= ZOOM_MAXIMO) && estilos.desabilitado]}
            >
              <Text style={estilos.botaoZoomTexto}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={estilos.acoes}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={aoCancelar}
              disabled={enviando}
              style={[estilos.botaoVazio, { minHeight: layout.alvo }, enviando && estilos.desabilitado]}
            >
              <Text style={estilos.botaoVazioTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() =>
                aoConfirmar(
                  recorteDoEnquadramento({
                    largura,
                    altura,
                    viewport,
                    escala: escalaRef.current,
                    deslocX: deslocRef.current.x,
                    deslocY: deslocRef.current.y,
                  }),
                )
              }
              disabled={enviando}
              style={[estilos.botaoCheio, { minHeight: layout.alvo }, enviando && estilos.desabilitado]}
            >
              {enviando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={estilos.botaoCheioTexto}>Usar esta foto</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  fundoWeb: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  folha: {
    backgroundColor: 'var(--surface)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  folhaWeb: { width: '100%', maxWidth: 420, borderRadius: 12 },
  titulo: { fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  ajuda: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  centro: { alignItems: 'center', paddingVertical: 4 },
  janela: {
    overflow: 'hidden',
    backgroundColor: 'var(--surface-2)',
    borderWidth: 2,
    borderColor: 'var(--border)',
  },
  zoom: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  botaoZoom: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'var(--border)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoZoomTexto: { fontSize: 20, fontWeight: '700', color: 'var(--text)', lineHeight: 24 },
  trilha: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'var(--surface-2)', overflow: 'hidden' },
  trilhaCheia: { height: 4, backgroundColor: '#C8131B' },
  acoes: { flexDirection: 'row', gap: 10, marginTop: 4 },
  botaoVazio: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoVazioTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  botaoCheio: {
    flex: 2,
    backgroundColor: '#C8131B',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoCheioTexto: { fontSize: 14, fontWeight: '700', color: '#fff' },
  desabilitado: { opacity: 0.45 },
});
