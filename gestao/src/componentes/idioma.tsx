// O idioma comum das telas de gente (G11, quadro 1f).
//
// POR QUE ISTO EXISTE
// Quatro telas tratam de pessoas — Pessoas, Comunicados, Acessos, Desativar
// acesso — e cada uma tinha inventado o próprio padrão: cartão de 330px numa,
// cartão empilhado noutra, tabela de cinco colunas na terceira, duas colunas na
// quarta. O gestor trocava de aba e trocava de idioma junto.
//
// Nada aqui é componente novo do zero: a etiqueta e a faixa SÃO as da
// `Acessos.tsx`, promovidas a lugar comum. Ficam em `componentes/` porque a
// alternativa é cada tela copiar — que é exatamente a duplicação que o handoff
// está desfazendo.
//
// A REGRA DE OURO DA LINHA: uma ação nomeada, no infinitivo do que acontece.
// "Abrir dossiê", "Corrigir cadastro", "Encerrar acesso" — nunca "Ver" nem
// "Detalhes", que obrigam a clicar para descobrir o que o botão faz.
import type { CSSProperties, ReactNode } from 'react';

export type Tom = 'erro' | 'aviso' | 'ok' | 'neutro';

/** Os quatro tons, e só eles. Vieram da `Acessos.tsx`; inventar um quinto
 *  desfaz o motivo de existir deste arquivo. */
const TONS: Record<Tom, { fundo: string; texto: string; borda: string }> = {
  erro: { fundo: 'var(--red-soft)', texto: 'var(--red)', borda: 'var(--red)' },
  aviso: { fundo: 'var(--amber-soft)', texto: 'var(--amber-ink)', borda: 'var(--amber)' },
  ok: { fundo: 'var(--green-soft)', texto: 'var(--green)', borda: 'var(--green)' },
  neutro: { fundo: 'var(--panel2)', texto: 'var(--muted)', borda: 'var(--line-btn)' },
};

export function Etiqueta({ tom, texto }: { tom: Tom; texto: string }) {
  const c = TONS[tom];
  return (
    <span
      style={{
        background: c.fundo,
        color: c.texto,
        borderRadius: 999,
        padding: '2px 9px',
        fontSize: 11.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  );
}

/** Faixa de aviso. O texto diz O QUE FAZER, e nomeia o sintoma antes do campo:
 *  "some do placar" serve, "sem id_hubspot" não — ninguém reconhece o próprio
 *  chamado pelo nome da coluna.
 *
 *  `titulo` é opcional para a `DesativarAcesso` poder adotar esta faixa sem
 *  mudar as chamadas dela quando chegar a vez do G11d. */
export function Faixa({
  tom,
  titulo,
  children,
  style,
}: {
  tom: Tom;
  titulo?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const c = TONS[tom];
  return (
    <div
      style={{
        background: c.fundo,
        border: `1px solid ${c.borda}`,
        color: c.texto,
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 13,
        lineHeight: '18px',
        ...style,
      }}
    >
      {titulo && <div style={{ fontWeight: 700 }}>{titulo}</div>}
      {children}
    </div>
  );
}

/** No máximo duas letras. A mesma conta do app de campo, pelo mesmo motivo:
 *  três letras não cabem em 28px sem encolher a fonte abaixo do legível. */
export function iniciaisDe(nome: string): string {
  return (nome || '?')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({ nome, tom = 'neutro' }: { nome: string; tom?: 'neutro' | 'erro' }) {
  const c = tom === 'erro' ? TONS.erro : TONS.neutro;
  return (
    <div
      style={{
        flex: '0 0 28px',
        width: 28,
        height: 28,
        borderRadius: 999,
        background: c.fundo,
        color: c.texto,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.3px',
      }}
    >
      {iniciaisDe(nome)}
    </div>
  );
}

/** Botão de ação nomeada.
 *
 *  `primaria` é fundo vermelho, e vale **uma por bloco, no máximo** — duas
 *  primárias lado a lado é o mesmo que nenhuma: a pessoa deixa de saber qual é
 *  a ação esperada. */
export function Acao({
  children,
  onClick,
  href,
  primaria = false,
  desabilitada = false,
  tamanho = 'linha',
  titulo,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** Quando a ação é navegar. Vira `<a>`, então o botão direito e o
   *  ctrl+clique continuam funcionando. */
  href?: string;
  primaria?: boolean;
  desabilitada?: boolean;
  /** 28 dentro da linha de pessoa, 38 no rodapé de um bloco. */
  tamanho?: 'linha' | 'rodape';
  titulo?: string;
}) {
  const estilo: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: tamanho === 'linha' ? 28 : 38,
    padding: tamanho === 'linha' ? '0 10px' : '0 16px',
    borderRadius: 8,
    border: primaria ? 'none' : '1px solid var(--line-btn)',
    background: primaria ? 'var(--red)' : 'var(--panel2)',
    color: primaria ? '#fff' : 'var(--ink)',
    font: 'inherit',
    fontSize: tamanho === 'linha' ? 12 : 13,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    cursor: desabilitada ? 'not-allowed' : 'pointer',
    opacity: desabilitada ? 0.5 : 1,
  };

  if (href && !desabilitada) {
    return (
      <a href={href} style={estilo} title={titulo}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" style={estilo} onClick={onClick} disabled={desabilitada} title={titulo}>
      {children}
    </button>
  );
}

/** A linha de pessoa — a peça que as quatro telas passam a repetir.
 *
 *  `valor` é o número/data alinhado à direita, antes das ações, com
 *  `tabular-nums` para as linhas não dançarem entre si. */
export function LinhaDePessoa({
  nome,
  sublinha,
  tomDoAvatar,
  etiquetas,
  valor,
  acoes,
  esmaecida = false,
  primeira = false,
}: {
  nome: string;
  sublinha?: ReactNode;
  tomDoAvatar?: 'neutro' | 'erro';
  etiquetas?: ReactNode;
  valor?: ReactNode;
  acoes?: ReactNode;
  /** Desativado continua visível, mas apagado: ele não pede ação. */
  esmaecida?: boolean;
  /** Sem régua no topo quando é a primeira da lista. */
  primeira?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 0',
        borderTop: primeira ? 'none' : '1px solid var(--line-soft)',
        opacity: esmaecida ? 0.55 : 1,
      }}
    >
      <Avatar nome={nome} tom={tomDoAvatar} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 13.5,
            lineHeight: '20px',
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nome}
        </div>
        {sublinha && (
          <div
            style={{
              fontSize: 12,
              lineHeight: '17px',
              color: 'var(--muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sublinha}
          </div>
        )}
      </div>

      {etiquetas && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {etiquetas}
        </div>
      )}

      {valor && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--ter)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {valor}
        </div>
      )}

      {acoes && <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{acoes}</div>}
    </div>
  );
}

/** Um passo numerado, para ação de duas etapas (conferir → criar).
 *
 *  O passo BLOQUEADO diz o que falta. Botão cinza com a explicação ao lado é
 *  fácil de não ler — e a pessoa fica olhando para um botão que não responde
 *  sem saber por quê. */
export function Passo({
  numero,
  titulo,
  estado,
  children,
  acao,
}: {
  numero: number;
  titulo: string;
  estado: 'cumprido' | 'atual' | 'bloqueado';
  children?: ReactNode;
  acao?: ReactNode;
}) {
  const bolha = {
    cumprido: { fundo: 'var(--green-soft)', texto: 'var(--green)' },
    atual: { fundo: 'var(--red)', texto: '#fff' },
    bloqueado: { fundo: 'var(--panel2)', texto: 'var(--muted)' },
  }[estado];

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '12px 14px',
        borderRadius: 8,
        // Só o passo ATUAL ganha borda vermelha: é o que diz onde a pessoa
        // está sem ela precisar ler os três.
        border: `1px solid ${estado === 'atual' ? 'var(--red)' : 'var(--line-soft)'}`,
        background: estado === 'atual' ? 'var(--red-soft)' : 'transparent',
      }}
    >
      <div
        style={{
          flex: '0 0 22px',
          width: 22,
          height: 22,
          borderRadius: 999,
          background: bolha.fundo,
          color: bolha.texto,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {numero}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: '20px' }}>
          {titulo}
        </div>
        {children && (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: '18px', marginTop: 2 }}>
            {children}
          </div>
        )}
      </div>

      {acao && <div style={{ flexShrink: 0 }}>{acao}</div>}
    </div>
  );
}
