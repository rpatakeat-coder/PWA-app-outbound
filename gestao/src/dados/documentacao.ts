// Os fatos que a documentação lê do banco em vez de afirmar de cor.
//
// O PROBLEMA QUE ISTO RESOLVE
// A primeira versão da aba de documentação escrevia frases como "só Outbound e
// RPA enxergam o status lead" e "Prospecção tem prazo de 3 dias". As duas eram
// verdade no dia em que foram escritas. Mas `sector_visibility` e `stage_sla`
// são CONFIGURAÇÃO — mudam pelo banco, sem passar por deploy — e o texto
// continuaria afirmando o valor velho com a mesma convicção.
//
// Documentação que envelhece em silêncio é pior que documentação nenhuma: ela
// dá confiança errada. Então o que é configuração vira CONSULTA, e o que é
// narrativa continua texto — mas com uma conferência por cima.
//
// A CONFERÊNCIA É A PARTE QUE IMPORTA
// Algumas frases do texto são afirmações verificáveis. Em vez de confiar que
// alguém vai lembrar de atualizar, a página confere cada uma contra o banco ao
// abrir e mostra na cara quando divergiu. É a diferença entre "documentação
// atualizada" e "documentação que não consegue mentir calada".
//
// ESTE ARQUIVO É PURO — nenhuma consulta, nenhum import do Supabase. É o que
// permite testá-lo com `npx tsx`, e o selo de "confere" é justamente a parte
// que não pode mentir. Quem vai ao banco é `documentacaoVivo.ts`.

export type StatusVivo = { slug: string; label: string; ativo: boolean };
export type VisibilidadeVivo = { setor: string; status: string };
export type SlaVivo = {
  etapa: string;
  dias: number | null;
  tarefa: string | null;
  ativo: boolean;
};

export type FatosVivos = {
  statuses: StatusVivo[];
  visibilidade: VisibilidadeVivo[];
  slas: SlaVivo[];
  /** Quantos leads em cada status. Agregado — nunca nome de cliente. */
  contagemPorStatus: { status: string; total: number }[];
  /** Pessoas ativas sem id_hubspot: não recebem lead nem tarefa. */
  semIdHubspot: number;
  pessoasAtivas: number;
  lidoEm: string;
  /** Motivo pelo qual não deu para medir. Null = mediu. */
  erro: string | null;
};

// ---------------------------------------------------------------------------
// A conferência
// ---------------------------------------------------------------------------

export type Situacao = 'confere' | 'divergiu' | 'nao-medido';
export type Verificacao = {
  id: string;
  /** A frase que o texto afirma, como ela aparece na página. */
  afirmacao: string;
  situacao: Situacao;
  /** O que o banco respondeu. Aparece sempre, não só quando diverge — ver
   *  abaixo por quê. */
  detalhe: string;
};

/** Os setores que a página afirma enxergarem `lead`. Mudou no banco? A
 *  conferência acusa, e é ESTA constante que tem que ser corrigida. */
export const SETORES_QUE_VEEM_LEAD = ['Outbound', 'RPA'];

/** Os status que a página afirma existirem. */
export const STATUS_AFIRMADOS = ['lead', 'cliente', 'churn', 'ganho_fs'];

/** Compara maiúsculas/minúsculas e espaços à toa — setor digitado como
 *  "outbound " no banco é o MESMO setor, e acusar divergência aí seria alarme
 *  falso que ensina a ignorar o alarme. */
const normalizar = (s: string) => s.trim().toLowerCase();

const listar = (itens: string[]) =>
  itens.length === 0 ? 'nenhum' : [...itens].sort().join(', ');

export function conferir(fatos: FatosVivos): Verificacao[] {
  if (fatos.erro) {
    // NÃO dizer "confere" quando não deu para medir. Um check verde por falta
    // de dado é a pior resposta possível: some com a dúvida sem resolvê-la.
    return [
      {
        id: 'leitura',
        afirmacao: 'As afirmações desta página conferem com o banco',
        situacao: 'nao-medido',
        detalhe: `Não consegui ler o banco agora: ${fatos.erro}`,
      },
    ];
  }

  const setoresComLead = fatos.visibilidade
    .filter((v) => normalizar(v.status) === 'lead')
    .map((v) => v.setor);
  const esperados = SETORES_QUE_VEEM_LEAD.map(normalizar).sort();
  const reais = setoresComLead.map(normalizar).sort();

  const statusAtivos = fatos.statuses.filter((s) => s.ativo).map((s) => s.slug);
  const ativosNorm = statusAtivos.map(normalizar).sort();
  const afirmadosNorm = STATUS_AFIRMADOS.map(normalizar).sort();

  return [
    {
      id: 'setores-lead',
      afirmacao: `Só ${listar(SETORES_QUE_VEEM_LEAD)} enxergam o status "lead"`,
      situacao:
        reais.length === 0
          ? 'nao-medido'
          : JSON.stringify(reais) === JSON.stringify(esperados)
            ? 'confere'
            : 'divergiu',
      detalhe:
        reais.length === 0
          ? 'Nenhum setor liberado para "lead" — ou a tabela está vazia, ou o nome do status mudou.'
          : `No banco: ${listar(setoresComLead)}`,
    },
    {
      id: 'status-ativos',
      afirmacao: `Os status ativos são ${listar(STATUS_AFIRMADOS)}`,
      situacao:
        ativosNorm.length === 0
          ? 'nao-medido'
          : JSON.stringify(ativosNorm) === JSON.stringify(afirmadosNorm)
            ? 'confere'
            : 'divergiu',
      detalhe:
        ativosNorm.length === 0
          ? 'Nenhum status ativo encontrado.'
          : `No banco: ${listar(statusAtivos)}`,
    },
    {
      id: 'sla-configurado',
      afirmacao: 'Cada etapa do funil tem um prazo (SLA) próprio, configurável',
      situacao: fatos.slas.length === 0 ? 'nao-medido' : 'confere',
      detalhe:
        fatos.slas.length === 0
          ? 'Nenhuma linha em stage_sla — o motor de tarefas por prazo não geraria nada.'
          : `${fatos.slas.filter((s) => s.ativo).length} etapa(s) com prazo ativo. A tabela abaixo é o valor de agora.`,
    },
  ];
}

/** Um resumo em texto dos fatos vivos, para mandar ao modelo do chat.
 *
 *  SÓ AGREGADO. Nenhum nome de cliente, telefone ou endereço sai daqui — o
 *  chat responde sobre COMO o sistema funciona, e para isso a configuração
 *  basta. Mandar a base para um provedor externo seria pagar um preço que a
 *  pergunta não pede. */
export function fatosEmTexto(fatos: FatosVivos): string {
  if (fatos.erro) return `(não foi possível ler a configuração do banco: ${fatos.erro})`;
  const linhas = [
    `Status ativos: ${fatos.statuses.filter((s) => s.ativo).map((s) => s.slug).join(', ') || 'nenhum'}`,
    `Visibilidade por setor: ${
      fatos.visibilidade.map((v) => `${v.setor}→${v.status}`).join('; ') || 'nenhuma'
    }`,
    `Prazos por etapa: ${
      fatos.slas
        .filter((s) => s.ativo)
        .map((s) => `${s.etapa} ${s.dias ?? '?'}d (${s.tarefa ?? 'sem tarefa'})`)
        .join('; ') || 'nenhum'
    }`,
    `Leads por status: ${
      fatos.contagemPorStatus.map((c) => `${c.status}=${c.total}`).join(', ') || 'nenhum'
    }`,
    `Pessoas ativas: ${fatos.pessoasAtivas}; sem id_hubspot: ${fatos.semIdHubspot}`,
  ];
  return linhas.join('\n');
}
