// O rodape de frescor — de quando e' o numero que voce esta' olhando.
//
// O cockpit le' o Supabase ao vivo, entao o rodape sempre existiu ("Dados lidos
// do Supabase ao vivo · 14/09/2026, 11:38"). O que faltava era ele dizer
// alguma coisa quando a leitura PAROU de acontecer.
//
// Por que aqui e nao em cada tela: se a mensagem de "nao consegui atualizar"
// fosse escrita seis vezes, seis telas diriam a mesma falha com palavras
// diferentes — e uma delas acabaria apagando o numero em vez de rotula-lo,
// que e' exatamente a armadilha 8 do pacote ("erro de rede virando zero").
//
// O `prefixo` e' a janela de tempo da tela, e ela CONTINUA na tela quando a
// atualizacao falha. O aviso entra ACIMA, nunca no lugar: perder o rotulo de
// janela justo no momento em que o numero envelheceu seria trocar um problema
// por outro pior.
export function Frescor({
  atualizadoEm,
  desatualizado,
  aoTentarDeNovo,
  prefixo = 'Dados lidos do Supabase ao vivo',
}: {
  atualizadoEm: Date;
  desatualizado: boolean;
  aoTentarDeNovo: () => void;
  prefixo?: string;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      {desatualizado && (
        // Ambar, nao vermelho: o dado na tela continua bom, so' parou no tempo.
        // Vermelho e' "acao e alerta" no pacote, e diria que ha' algo errado
        // com o numero — nao ha'.
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--amber-soft)',
            color: 'var(--amber-ink)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 8,
          }}
        >
          <span>
            <strong>Não consegui atualizar.</strong> Estes números são da leitura abaixo e podem
            ter mudado desde então.
          </span>
          <button
            type="button"
            onClick={aoTentarDeNovo}
            style={{
              border: '1px solid var(--line-btn)',
              background: 'transparent',
              color: 'inherit',
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
        {prefixo} ·{' '}
        {atualizadoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </div>
    </div>
  );
}
