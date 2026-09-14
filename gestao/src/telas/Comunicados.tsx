// Comunicados — o recado do gestor, e quem confirmou que leu.
//
// A tela tem duas metades porque a pergunta tem duas metades: "o que eu
// avisei" e "quem soube". A segunda é a que não existia em lugar nenhum — e é
// a diferença entre "avisei" e "eles souberam".
//
// Regra da leitura: quem confirma é o próprio leitor, no app de campo. Esta
// tela só LÊ a confirmação; não há botão aqui para marcar por alguém, e isso é
// garantido no banco (`with check (leitor_id = auth.uid())`), não só na UI.
import { useState } from 'react';
import {
  carregarComunicados,
  criarComunicado,
  publicarComunicado,
  apagarComunicado,
  type Comunicado,
} from '../dados/comunicados';
import { useVivo } from '../dados/vivo';
import { Frescor } from '../componentes/Frescor';

const botao = {
  border: '1px solid var(--line-btn)',
  background: 'transparent',
  color: 'var(--ink)',
  borderRadius: 6,
  padding: '7px 12px',
  font: 'inherit',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
} as const;

const campo = {
  width: '100%',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '10px 12px',
  font: 'inherit',
  fontSize: 14,
  color: 'var(--ink)',
  background: 'var(--panel)',
  boxSizing: 'border-box',
} as const;

function Cartao({ c, aoMudar }: { c: Comunicado; aoMudar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const rascunho = c.publicadoEm == null;
  const faltam = Math.max(0, c.alcance - c.leram.length);

  return (
    <div className="cartao" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <strong style={{ fontSize: 15, color: 'var(--ink)' }}>{c.titulo}</strong>
        {rascunho && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--amber-ink)',
              background: 'var(--amber-soft)',
              borderRadius: 10,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
            }}
          >
            rascunho — só você vê
          </span>
        )}
      </div>

      <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6, whiteSpace: 'pre-wrap' }}>
        {c.mensagem}
      </div>

      <div style={{ fontSize: 12, color: 'var(--ter)', marginTop: 10 }}>
        {c.criadoPor ? `${c.criadoPor} · ` : ''}
        {new Date(c.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </div>

      {/* A confirmação de leitura. Enquanto o recado é rascunho, não há o que
          contar — e mostrar "0 de 11 leram" para algo que ninguém podia ver
          seria acusar o time de não ler o que não foi publicado. */}
      <div style={{ fontSize: 13, marginTop: 8 }}>
        {rascunho ? (
          <span style={{ color: 'var(--ter)' }}>Ainda não publicado.</span>
        ) : c.leram.length === 0 ? (
          <span style={{ color: 'var(--muted)' }}>
            Ninguém confirmou leitura ainda — de {c.alcance} pessoas.
          </span>
        ) : (
          <span style={{ color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--ink)' }}>
              {c.leram.length} de {c.alcance}
            </strong>{' '}
            confirmaram: {c.leram.join(', ')}
            {faltam > 0 ? ` · faltam ${faltam}` : ''}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {rascunho && (
          <button
            disabled={ocupado}
            style={botao}
            onClick={async () => {
              setOcupado(true);
              await publicarComunicado(c.id);
              setOcupado(false);
              aoMudar();
            }}
          >
            Publicar para o time
          </button>
        )}
        <button
          disabled={ocupado}
          style={{ ...botao, color: 'var(--red)', borderColor: 'var(--red)' }}
          onClick={async () => {
            setOcupado(true);
            await apagarComunicado(c.id);
            setOcupado(false);
            aoMudar();
          }}
        >
          Apagar
        </button>
      </div>
    </div>
  );
}

export function Comunicados() {
  const { dados, erro, desatualizado, recarregar } = useVivo(carregarComunicados);
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  if (erro) {
    return (
      <div className="cartao" style={{ borderColor: 'var(--red)' }}>
        <strong>Não consegui carregar os comunicados.</strong>
        <div style={{ color: 'var(--muted)', marginTop: 6 }}>{erro}</div>
      </div>
    );
  }
  if (!dados) return <div className="cartao">Carregando…</div>;

  if (dados.indisponivel) {
    return (
      <div className="cartao">
        <strong>Comunicados ainda não está configurado.</strong>
        <div style={{ color: 'var(--muted)', marginTop: 6 }}>{dados.indisponivel}</div>
      </div>
    );
  }

  const enviar = async (publicarAgora: boolean) => {
    if (!titulo.trim() || !mensagem.trim()) return;
    setSalvando(true);
    setAviso(null);
    const r = await criarComunicado({ titulo, mensagem, publicarAgora });
    setSalvando(false);
    if (!r.ok) {
      setAviso(r.erro ?? 'Não consegui salvar.');
      return;
    }
    setTitulo('');
    setMensagem('');
    await recarregar();
  };

  const publicados = dados.itens.filter((c) => c.publicadoEm != null);
  const rascunhos = dados.itens.filter((c) => c.publicadoEm == null);

  return (
    <>
      <section className="cartao" style={{ marginBottom: 18 }}>
        <h2 className="titulo-secao" style={{ marginTop: 0 }}>Escrever um recado</h2>
        <input
          style={campo}
          placeholder="Título — o que a pessoa precisa saber em uma linha"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <textarea
          style={{ ...campo, marginTop: 8, minHeight: 90, resize: 'vertical' }}
          placeholder="O recado"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            disabled={salvando || !titulo.trim() || !mensagem.trim()}
            style={{ ...botao, background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
            onClick={() => enviar(true)}
          >
            {salvando ? 'Salvando…' : 'Publicar agora'}
          </button>
          <button
            disabled={salvando || !titulo.trim() || !mensagem.trim()}
            style={botao}
            onClick={() => enviar(false)}
          >
            Salvar como rascunho
          </button>
        </div>
        {aviso && (
          <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{aviso}</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--ter)', marginTop: 10, lineHeight: '16px' }}>
          Quem confirma a leitura é a própria pessoa, no app de campo. Não há como marcar por
          alguém — nem daqui.
        </div>
      </section>

      {rascunhos.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2 className="titulo-secao">Rascunhos</h2>
          {rascunhos.map((c) => (
            <Cartao key={c.id} c={c} aoMudar={recarregar} />
          ))}
        </section>
      )}

      <section>
        <h2 className="titulo-secao">Publicados</h2>
        {publicados.length === 0 ? (
          <div className="cartao" style={{ color: 'var(--muted)' }}>
            Nenhum recado publicado ainda.
          </div>
        ) : (
          publicados.map((c) => <Cartao key={c.id} c={c} aoMudar={recarregar} />)
        )}
      </section>

      <Frescor
        atualizadoEm={dados.atualizadoEm}
        desatualizado={desatualizado}
        aoTentarDeNovo={recarregar}
        prefixo="Confirmações de leitura vêm do app de campo"
      />
    </>
  );
}
