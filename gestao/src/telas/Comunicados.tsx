// Comunicados — o recado do gestor, e quem confirmou que leu.
//
// A tela tem duas metades porque a pergunta tem duas metades: "o que eu
// avisei" e "quem soube". A segunda é a que não existia em lugar nenhum — e é
// a diferença entre "avisei" e "eles souberam".
//
// Regra da leitura: quem confirma é o próprio leitor, no app de campo. Esta
// tela só LÊ a confirmação; não há botão aqui para marcar por alguém, e isso é
// garantido no banco (`with check (leitor_id = auth.uid())`), não só na UI.
//
// G11b: QUEM FALTA VEM PRIMEIRO, E COM NOME.
// Até aqui a tela dizia "7 de 11 confirmaram: Bruno, Kelly…" — a lista de quem
// LEU. O gestor não precisa dela: precisa da lista de quem NÃO leu, que é a de
// quem cobrar. Por isso a linha dos faltantes vem antes, em tom de erro, e
// "Copiar nomes" existe para a cobrança sair daqui direto para o WhatsApp.
//
// "Copiar nomes" é a ÚNICA adição de comportamento desta tela, e é
// client-side: `navigator.clipboard`, nada no servidor.
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
import { Acao, Etiqueta, LinhaDePessoa } from '../componentes/idioma';

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

/** "publicado há N dias" — a idade do recado é o que decide se a cobrança já
 *  faz sentido. Hoje mesmo não é "há 0 dias". */
function idadeEmDias(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'publicado hoje';
  if (dias === 1) return 'publicado ontem';
  return `publicado há ${dias} dias`;
}

function Cartao({ c, aoMudar }: { c: Comunicado; aoMudar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const faltam = c.naoLeram.length;
  const todosLeram = faltam === 0 && c.leram.length > 0;

  return (
    <div className="cartao" style={{ marginBottom: 12 }}>
      {/* ---- cabeça: título, autoria e o Apagar ---- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, lineHeight: '22px', fontWeight: 700, color: 'var(--ink)' }}>
            {c.titulo}
          </div>
          <div style={{ fontSize: 12, lineHeight: '17px', color: 'var(--ter)', marginTop: 2 }}>
            {[
              c.criadoPor,
              new Date(c.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
              c.publicadoEm ? idadeEmDias(c.publicadoEm) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        {/* Apagar e' CONTORNO, nunca primaria: apagar recado nao e' a acao que
            a tela quer que a pessoa tome. */}
        <Acao
          onClick={async () => {
            setOcupado(true);
            await apagarComunicado(c.id);
            setOcupado(false);
            aoMudar();
          }}
          desabilitada={ocupado}
        >
          Apagar
        </Acao>
      </div>

      <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: '20px', marginTop: 10, whiteSpace: 'pre-wrap' }}>
        {c.mensagem}
      </div>

      {/* ---- a confirmação de leitura, como lista ---- */}
      <div style={{ marginTop: 12 }}>
        {todosLeram ? (
          /* Todos leram: UMA linha. Duas seria dar espaço de tela a uma
             pendência que não existe. */
          <LinhaDePessoa
            primeira
            nome={`Confirmaram ${c.leram.length} de ${c.alcance}`}
            sublinha="ninguém pendente"
            etiquetas={<Etiqueta tom="ok" texto="Todos leram" />}
          />
        ) : (
          <>
            {/* QUEM FALTA VEM PRIMEIRO. É a lista de quem cobrar, e é o motivo
                de a tela existir. */}
            {faltam > 0 && (
              <LinhaDePessoa
                primeira
                tomDoAvatar="erro"
                nome={`Faltam ${faltam} de ${c.alcance}`}
                sublinha={c.naoLeram.join(', ')}
                etiquetas={<Etiqueta tom="erro" texto="Não confirmaram" />}
                acoes={
                  <Acao
                    onClick={() => {
                      // Client-side, e só. Nada disso vai ao servidor — nem
                      // poderia: marcar leitura por alguém é proibido no banco.
                      void navigator.clipboard?.writeText(c.naoLeram.join(', '));
                      setCopiado(true);
                    }}
                  >
                    {copiado ? 'Copiado' : 'Copiar nomes'}
                  </Acao>
                }
              />
            )}
            <LinhaDePessoa
              primeira={faltam === 0}
              nome={`Confirmaram ${c.leram.length}`}
              sublinha={
                c.leram.length > 0
                  ? c.leram.join(', ')
                  : 'ninguém confirmou ainda'
              }
              etiquetas={<Etiqueta tom={c.leram.length > 0 ? 'ok' : 'neutro'} texto="Leram" />}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** O rascunho não é um cartão de recado: é uma LINHA numa lista.
 *
 *  Ele não tem confirmação de leitura para mostrar — ninguém do time podia
 *  vê-lo —, e dar a ele o mesmo cartão do publicado fazia a tela parecer ter o
 *  dobro de recados no ar. */
function LinhaDeRascunho({ c, aoMudar, primeira }: { c: Comunicado; aoMudar: () => void; primeira: boolean }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <LinhaDePessoa
      primeira={primeira}
      nome={c.titulo}
      sublinha="só você vê · sem contagem de leitura enquanto não publicar"
      etiquetas={<Etiqueta tom="neutro" texto="Rascunho" />}
      acoes={
        <Acao
          desabilitada={ocupado}
          onClick={async () => {
            setOcupado(true);
            await publicarComunicado(c.id);
            setOcupado(false);
            aoMudar();
          }}
        >
          {ocupado ? 'Publicando…' : 'Publicar'}
        </Acao>
      }
    />
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
            // `--panel` e nao `#fff`: no tema escuro `--red` e' um rosa claro
            // (#e5a1a4) e branco sobre ele da' 2,11:1. Mesmo conserto do
            // componente `Acao` — ver o comentario la'.
            style={{ ...botao, background: 'var(--red)', color: 'var(--panel)', borderColor: 'var(--red)' }}
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
        <section className="cartao" style={{ marginBottom: 18 }}>
          <h2 className="titulo-secao" style={{ marginTop: 0 }}>
            Rascunhos · {rascunhos.length}
          </h2>
          <div style={{ marginTop: 6 }}>
            {rascunhos.map((c, i) => (
              <LinhaDeRascunho key={c.id} c={c} aoMudar={recarregar} primeira={i === 0} />
            ))}
          </div>
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
