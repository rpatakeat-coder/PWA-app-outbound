// Semana — "o que mudou e o que eu faco?".
//
// Comparacao entre a semana civil corrente e a anterior. Os deltas sao
// coloridos por SIGNIFICADO, nao por sinal: mais leads perdidos e' ruim mesmo
// aparecendo com seta pra cima. A regra mora em regras.ts e esta' testada,
// porque pintar ▲ de verde sempre e' o erro natural de quem implementa isso.
//
// A tela avisa quando a comparacao ainda esta' incompleta (segunda de manha
// comparando 1 dia contra 5) em vez de normalizar o numero. Numero ajustado pra
// "corrigir" a janela e' pior que numero com ressalva — some a ressalva e sobra
// uma metrica que ninguem sabe de onde veio.
import { useEffect, useState } from 'react';
import {
  carregarSemana,
  carregarLeituraIA,
  gerarLeituraIA,
  type DadosSemana,
  type LeituraIA,
  type MetricaSemanal,
} from '../dados/semana';
import type { Delta } from '../dados/regras';
import { Drawer } from '../componentes/Drawer';

/** Idade do texto em horas. O doc pede que a idade do dado seja rotulada e que
 *  o sistema avise quando estiver velha — o incidente que motivou a regra foi
 *  um texto de 4 dias sendo exibido como se fosse da semana. */
function idadeEmHoras(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

function LeituraDaSemana({
  leitura,
  dados,
  aoGerar,
  gerando,
  aviso,
}: {
  leitura: LeituraIA | null;
  dados: DadosSemana;
  aoGerar: () => void;
  gerando: boolean;
  aviso: string | null;
}) {
  const desatualizada =
    leitura != null &&
    (leitura.janela.inicio !== dados.janela.inicio || idadeEmHoras(leitura.geradoEm) > 72);

  const botao = (
    <button
      onClick={aoGerar}
      disabled={gerando}
      style={{
        border: '1px solid var(--line-btn)',
        background: 'var(--panel2)',
        borderRadius: 8,
        padding: '8px 13px',
        font: 'inherit',
        fontWeight: 700,
        fontSize: 13,
        cursor: gerando ? 'default' : 'pointer',
        color: 'var(--ink)',
        whiteSpace: 'nowrap',
      }}
    >
      {gerando ? 'Escrevendo…' : leitura ? 'Gerar de novo' : 'Gerar leitura'}
    </button>
  );

  return (
    <section className="cartao" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <h2 className="titulo-secao" style={{ marginBottom: 10 }}>
          A leitura da semana
        </h2>
        {botao}
      </div>

      {/* Falha aparece SEMPRE, e nunca deixa o texto velho passar por novo. */}
      {leitura?.falha && (
        <div
          style={{
            background: 'var(--red-soft)',
            color: 'var(--red)',
            border: '1px solid var(--red)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          <strong>A última geração falhou.</strong> {leitura.falha}
        </div>
      )}

      {aviso && (
        <div
          style={{
            background: 'var(--amber-soft)',
            color: 'var(--amber-ink)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          {aviso}
        </div>
      )}

      {leitura?.texto ? (
        <>
          {desatualizada && (
            <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              Este texto é de outra janela ({leitura.janela.inicio.slice(8, 10)}/
              {leitura.janela.inicio.slice(5, 7)}) — não descreve a semana acima.
            </div>
          )}
          <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{leitura.texto}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
            Escrito por IA a partir dos números desta tela · {leitura.modelo} ·{' '}
            {idadeEmHoras(leitura.geradoEm) < 1
              ? 'agora há pouco'
              : `há ${idadeEmHoras(leitura.geradoEm)}h`}
          </div>
        </>
      ) : (
        !leitura?.falha && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            Nenhuma leitura gerada para esta janela. Os números acima já respondem “o que
            mudou”; a leitura escreve o “e daí” — quem citar pelo nome e o que fazer primeiro.
          </div>
        )
      )}
    </section>
  );
}

function dm(dia: string) {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

const COR: Record<Delta['tom'], string> = {
  bom: 'var(--green)',
  ruim: 'var(--red)',
  neutro: 'var(--muted)',
};

function Seta({ d }: { d: Delta }) {
  if (d.diferenca === 0) return <span style={{ color: 'var(--ter)' }}>=</span>;
  return (
    <span style={{ color: COR[d.tom], fontWeight: 800 }}>
      {d.diferenca > 0 ? '▲' : '▼'} {Math.abs(d.diferenca)}
      {d.pct != null && (
        <span style={{ fontWeight: 700, fontSize: '0.85em' }}> ({Math.abs(d.pct)}%)</span>
      )}
    </span>
  );
}

function CartaoMetrica({ m, aoAbrir }: { m: MetricaSemanal; aoAbrir: () => void }) {
  return (
    <button
      onClick={aoAbrir}
      disabled={m.leads.length === 0}
      className="cartao"
      style={{
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: m.leads.length ? 'pointer' : 'default',
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{m.rotulo}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 2 }}>{m.delta.atual}</div>
      <div style={{ fontSize: 13, marginTop: 2 }}>
        <Seta d={m.delta} />
        <span style={{ color: 'var(--ter)' }}> vs {m.delta.anterior} na anterior</span>
      </div>
    </button>
  );
}

export function Semana() {
  const [dados, setDados] = useState<DadosSemana | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<MetricaSemanal | null>(null);
  const [leitura, setLeitura] = useState<LeituraIA | null>(null);
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    carregarSemana().then(setDados).catch((e) => setErro(e.message ?? String(e)));
    carregarLeituraIA().then(setLeitura);
  }, []);

  const gerar = async () => {
    if (!dados) return;
    setGerando(true);
    setAviso(null);
    const r = await gerarLeituraIA(dados);
    setGerando(false);
    if (!r.ok) {
      setAviso(
        r.configuravel
          ? 'A leitura por IA ainda não está ligada. Configure OPENAI_API_KEY nos secrets do Supabase e faça o deploy da função resumo-semanal. Os números desta tela funcionam sem isso.'
          : `Não consegui gerar: ${r.erro}`,
      );
    }
    // Recarrega dos dois jeitos: em falha, a linha de erro tambem foi gravada
    // e a tela precisa mostra-la.
    carregarLeituraIA().then(setLeitura);
  };

  if (erro) {
    return (
      <div className="cartao" style={{ borderColor: 'var(--red)' }}>
        <strong>Não consegui carregar a semana.</strong>
        <div style={{ color: 'var(--muted)', marginTop: 6 }}>{erro}</div>
      </div>
    );
  }
  if (!dados) return <div className="cartao">Comparando as duas semanas…</div>;

  const { janela, janelaAnterior, metricas, linhas, comparacaoCompleta, diasDecorridos, foraDaLista } =
    dados;
  const ganhos = metricas.find((m) => m.chave === 'ganhos')!;
  const perdidos = metricas.find((m) => m.chave === 'perdidos')!;
  const piorando = linhas.filter((l) => l.piora >= 2);

  return (
    <>
      <div
        style={{
          background: 'var(--dark)',
          color: 'var(--dark-ink)',
          borderRadius: 14,
          padding: '20px 22px',
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          {/* Janela sempre visivel — regra do doc: rotule o periodo junto do
              numero, sempre. */}
          <div style={{ color: 'var(--dark-mut)', fontSize: 13, fontWeight: 700 }}>
            janela: {dm(janela.inicio)}–{dm(janela.fim)} · anterior:{' '}
            {dm(janelaAnterior.inicio)}–{dm(janelaAnterior.fim)}
          </div>
        </div>
        <div style={{ color: 'var(--dark-mut)', marginTop: 4 }}>
          {ganhos.delta.atual > 0 ? (
            <>
              <strong style={{ color: 'var(--dark-ink)' }}>
                {ganhos.delta.atual} {ganhos.delta.atual === 1 ? 'fechamento' : 'fechamentos'}
              </strong>{' '}
              nesta semana contra {ganhos.delta.anterior} na anterior
              {perdidos.delta.atual > 0 && `, com ${perdidos.delta.atual} perdidos`}.
            </>
          ) : (
            <>
              Nenhum fechamento registrado nesta semana ({ganhos.delta.anterior} na anterior)
              {perdidos.delta.atual > 0 && ` · ${perdidos.delta.atual} perdidos`}.
            </>
          )}
        </div>
      </div>

      <LeituraDaSemana
        leitura={leitura}
        dados={dados}
        aoGerar={gerar}
        gerando={gerando}
        aviso={aviso}
      />

      {!comparacaoCompleta && (
        <div
          style={{
            background: 'var(--sunk)',
            color: 'var(--muted)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '9px 12px',
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          A semana corrente tem <strong style={{ color: 'var(--ink)' }}>{diasDecorridos} de 5</strong>{' '}
          dias úteis decorridos, e a anterior tem 5 completos. Os deltas vão parecer negativos até
          sexta — não ajustei o número para “corrigir” isso, porque um número normalizado sem
          origem clara é pior que um número com ressalva.
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        {metricas.map((m) => (
          <CartaoMetrica key={m.chave} m={m} aoAbrir={() => setAberta(m)} />
        ))}
      </div>

      <section className="cartao">
        <h2 className="titulo-secao">
          Leitura por executivo
          {piorando.length > 0 && (
            <span style={{ color: 'var(--red)', textTransform: 'none', letterSpacing: 0 }}>
              {' '}
              · {piorando.length} caindo em duas frentes ou mais
            </span>
          )}
        </h2>
        {linhas.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>Nenhum executivo ativo cadastrado.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                <th style={{ padding: '6px 0', fontWeight: 700 }}>Executivo</th>
                <th style={{ fontWeight: 700, textAlign: 'center' }}>Visitas</th>
                <th style={{ fontWeight: 700, textAlign: 'center' }}>Avanços</th>
                <th style={{ fontWeight: 700, textAlign: 'center' }}>Fechou</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr
                  key={l.perfilId}
                  style={{
                    borderTop: '1px solid var(--line-soft)',
                    background: l.piora >= 2 ? 'var(--red-soft)' : undefined,
                  }}
                >
                  <td style={{ padding: '9px 0', fontWeight: 700 }}>{l.nome}</td>
                  {[l.visitas, l.avancos, l.ganhos].map((d, i) => (
                    <td key={i} style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 800 }}>{d.atual}</div>
                      <div style={{ fontSize: 11 }}>
                        <Seta d={d} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {/* Sem esta linha, somar a coluna nao bate com o card acima e a tela
            inteira perde credibilidade. O resto NAO e' erro de conta: e'
            atividade de quem esta fora do recorte de ativos. */}
        {(foraDaLista.visitas > 0 || foraDaLista.avancos > 0 || foraDaLista.ganhos > 0) && (
          <div
            style={{
              background: 'var(--sunk)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '9px 12px',
              fontSize: 13,
              color: 'var(--muted)',
              marginTop: 12,
            }}
          >
            Os cards contam a operação inteira; esta tabela, só quem está na lista de ativos. A
            diferença é{' '}
            <strong style={{ color: 'var(--ink)' }}>
              {[
                foraDaLista.visitas && `${foraDaLista.visitas} visitas`,
                foraDaLista.avancos && `${foraDaLista.avancos} avanços`,
                foraDaLista.ganhos && `${foraDaLista.ganhos} fechamentos`,
              ]
                .filter(Boolean)
                .join(', ')}
            </strong>{' '}
            de quem está desativado, marcado como não-vendedor, ou sem perfil vinculado
            {foraDaLista.quem.length > 0 && ` (${foraDaLista.quem.join(', ')})`}.
          </div>
        )}

        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
          Setas comparam com a semana civil anterior. Verde é melhora, vermelho é piora — em
          “Perdidos”, subir é vermelho.
        </div>
      </section>

      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>
        Semana civil de segunda a sexta, horário de Brasília ·{' '}
        {dados.atualizadoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </div>

      <Drawer
        aberto={aberta != null}
        titulo={aberta?.rotulo ?? ''}
        subtitulo={
          aberta ? `${aberta.leads.length} nesta semana · ${dm(janela.inicio)}–${dm(janela.fim)}` : ''
        }
        aoFechar={() => setAberta(null)}
      >
        {aberta?.leads.map((l, i) => (
          <div key={`${l.id}-${i}`} style={{ padding: '8px 0', borderTop: '1px solid var(--line-soft)' }}>
            <div style={{ fontWeight: 700 }}>{l.nome}</div>
            {l.quem && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.quem}</div>}
          </div>
        ))}
      </Drawer>
    </>
  );
}
