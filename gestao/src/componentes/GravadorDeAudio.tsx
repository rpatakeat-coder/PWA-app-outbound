// Gravador de audio do 1:1 — grava pelo navegador ou aceita um arquivo pronto.
//
// POR QUE O BITRATE E' TAO BAIXO
// 24 kbps em Opus. Uma conversa de 40 minutos sai com ~7 MB; no padrao do
// MediaRecorder (~128 kbps) sairia com ~38 MB e seria RECUSADA pela transcricao,
// cujo teto e' 25 MB. Voz falada em Opus a 24 kbps continua perfeitamente
// inteligivel — e' fala, nao musica. O limite tecnico virou a escolha de
// qualidade em vez de virar um erro na cara do gestor no fim da reuniao.
//
// FORMATO POR NAVEGADOR
// Chrome/Edge gravam webm/opus; Safari so' grava mp4/aac. Em vez de fixar um
// formato e quebrar num deles, perguntamos ao proprio navegador o que ele
// suporta e mandamos o MIME real junto — quem transcreve precisa saber o que
// esta' recebendo.
import { useEffect, useRef, useState } from 'react';

/** Ordem de preferencia. O primeiro que o navegador aceitar vence. */
const FORMATOS = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4', // Safari
  'audio/ogg;codecs=opus',
];

const BITS_POR_SEGUNDO = 24_000;

function formatoSuportado(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f));
}

function mmss(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function GravadorDeAudio({
  aoConcluir,
  desabilitado,
}: {
  aoConcluir: (audio: Blob) => void;
  desabilitado?: boolean;
}) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<BlobPart[]>([]);
  const trilhaRef = useRef<MediaStream | null>(null);

  // Solta o microfone se o componente sair da tela no meio da gravacao. Sem
  // isto, o indicador de "gravando" do navegador fica aceso indefinidamente e a
  // pessoa nao entende por que.
  useEffect(() => {
    return () => {
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
      trilhaRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!gravando) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [gravando]);

  const comecar = async () => {
    setErro(null);
    const formato = formatoSuportado();
    if (!formato) {
      setErro('Este navegador não grava áudio. Use o botão de anexar arquivo.');
      return;
    }
    try {
      const trilha = await navigator.mediaDevices.getUserMedia({ audio: true });
      trilhaRef.current = trilha;
      const rec = new MediaRecorder(trilha, {
        mimeType: formato,
        audioBitsPerSecond: BITS_POR_SEGUNDO,
      });
      pedacosRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && pedacosRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(pedacosRef.current, { type: formato });
        trilhaRef.current?.getTracks().forEach((t) => t.stop());
        trilhaRef.current = null;
        if (blob.size > 0) aoConcluir(blob);
      };
      // Fatia de 1s: se a aba morrer no meio, o que ja' foi gravado esta' nos
      // pedacos em vez de existir so' num buffer interno.
      rec.start(1000);
      recorderRef.current = rec;
      setSegundos(0);
      setGravando(true);
    } catch (e: any) {
      setErro(
        e?.name === 'NotAllowedError'
          ? 'O navegador bloqueou o microfone. Libere a permissão e tente de novo.'
          : `Não consegui abrir o microfone: ${e?.message ?? e}`,
      );
    }
  };

  const parar = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setGravando(false);
  };

  const aoEscolherArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arq = e.target.files?.[0];
    if (arq) aoConcluir(arq);
    e.target.value = ''; // permite reescolher o mesmo arquivo
  };

  const botao = {
    border: '1px solid var(--line-btn)',
    background: 'var(--panel2)',
    borderRadius: 8,
    padding: '9px 14px',
    font: 'inherit',
    fontWeight: 700,
    fontSize: 13,
    cursor: desabilitado ? 'default' : 'pointer',
    color: 'var(--ink)',
    opacity: desabilitado ? 0.5 : 1,
  } as const;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {gravando ? (
          <button onClick={parar} style={{ ...botao, background: 'var(--red)', color: '#fff', border: 'none' }}>
            ■ Parar · {mmss(segundos)}
          </button>
        ) : (
          <button onClick={comecar} disabled={desabilitado} style={botao}>
            ● Gravar conversa
          </button>
        )}

        <label style={{ ...botao, display: 'inline-block' }}>
          Anexar arquivo
          <input
            type="file"
            accept="audio/*"
            onChange={aoEscolherArquivo}
            disabled={desabilitado}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {gravando && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6, fontWeight: 700 }}>
          Gravando. O microfone está aberto.
        </div>
      )}

      {erro && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{erro}</div>
      )}

      <div style={{ fontSize: 12, color: 'var(--ter)', marginTop: 6 }}>
        A gravação fica em área privada, visível só para gestores. Avise a pessoa antes de
        gravar.
      </div>
    </div>
  );
}
