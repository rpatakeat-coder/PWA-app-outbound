// Documentação: como o sistema funciona, por escrito — e um chat para perguntar.
//
// POR QUE ESTA TELA EXISTE
// O funcionamento estava espalhado entre o código, os comentários das Edge
// Functions e a cabeça de quem construiu. Quando alguém da gestão perguntava
// "de onde vêm os leads?" ou "por que o vendedor não vê esse cliente?", a
// resposta dependia de alguém abrir o repositório.
//
// A REGRA DESTA PÁGINA: ela descreve o que o código FAZ, não o que a gente
// gostaria que ele fizesse. Cada seção diz ONDE a regra vive — arquivo,
// migration, função SQL — para que quem duvidar possa conferir, e para que a
// próxima pessoa que mudar a regra saiba que tem um texto aqui para corrigir.
//
// Documentação que envelhece em silêncio é pior que documentação nenhuma:
// ela dá confiança errada. É o motivo das DUAS defesas desta tela:
//
//   1. O que é CONFIGURAÇÃO (status que existem, quem vê o quê, prazo por
//      etapa, contagens) não é escrito aqui — é LIDO do banco a cada abertura.
//      Essas partes se atualizam sozinhas porque nunca foram texto.
//
//   2. O que é NARRATIVA continua escrito, mas as frases verificáveis passam
//      por uma conferência contra o banco ao abrir. Divergiu, aparece na cara.
//      Ver `src/dados/documentacao.ts`.
//
// O CHAT responde ancorado nas duas fontes — o texto desta página e a
// configuração lida agora — e é instruído a dizer "não sei" em vez de
// preencher lacuna. Um chat de documentação que inventa é pior que nenhum: a
// pessoa confia, age, e descobre depois.
//
// SÓ GESTOR VÊ, e isso não precisa de código aqui: o cockpit inteiro já é
// gestor-only — o `App.tsx` devolve "Este painel é da gestão" para quem não
// tem `profiles.role = 'gestor'` antes de renderizar aba nenhuma. Repetir a
// checagem nesta tela daria a impressão falsa de que as outras não têm.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../supabase';
import { conferir, fatosEmTexto, type FatosVivos, type Verificacao } from '../dados/documentacao';
import { carregarFatosVivos } from '../dados/documentacaoVivo';

/** Data da última conferência do texto contra o código. Quem alterar uma regra
 *  descrita aqui atualiza esta data — é o que separa "documentação" de
 *  "texto antigo com cara de verdade". */
const REVISADO_EM = '21/09/2026';

type Secao = { id: string; titulo: string; pergunta: string; conteudo: ReactNode };

/** Referência ao lugar onde a regra realmente mora. Sempre no fim da seção. */
function Fonte({ children }: { children: ReactNode }) {
  return (
    <p className="doc__fonte">
      <strong>Onde isso vive:</strong> {children}
    </p>
  );
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: ReactNode[][] }) {
  return (
    <div className="doc__tabela-envoltorio">
      <table className="doc__tabela">
        <thead>
          <tr>
            {cabecalho.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              {l.map((celula, j) => (
                <td key={j}>{celula}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** As seções, montadas com os fatos vivos quando eles chegaram.
 *
 *  É função e não constante porque as partes de CONFIGURAÇÃO são lidas do
 *  banco: status que existem, quem enxerga o quê, prazo por etapa. Enquanto
 *  `fatos` é null a seção mostra "lendo…" em vez de um valor escrito à mão —
 *  um número antigo com cara de atual é exatamente o que esta página existe
 *  para evitar. */
/** `sector_visibility` vem como uma linha por par (setor, status). A tela quer
 *  uma linha por SETOR — é como a pergunta é feita: "o que o setor Fulano
 *  enxerga?", e não "quem enxerga churn?". */
function agruparVisibilidade(fatos: FatosVivos): { setor: string; statuses: string[] }[] {
  const mapa = new Map<string, string[]>();
  for (const v of fatos.visibilidade) {
    mapa.set(v.setor, [...(mapa.get(v.setor) ?? []), v.status]);
  }
  return [...mapa.entries()]
    .map(([setor, statuses]) => ({ setor, statuses: statuses.sort() }))
    .sort((a, b) => a.setor.localeCompare(b.setor, 'pt-BR'));
}

const montarSecoes = (fatos: FatosVivos | null): Secao[] => [
  // -------------------------------------------------------------------------
  {
    id: 'visao-geral',
    titulo: 'Os dois produtos',
    pergunta: 'O que é o sistema, afinal?',
    conteudo: (
      <>
        <p>
          São <strong>dois aplicativos diferentes</strong> que dividem o mesmo banco de dados e a
          mesma sessão de login:
        </p>
        <ul>
          <li>
            <strong>App de campo</strong> — o que o vendedor usa na rua. Mapa, rota do dia,
            check-in, funil, tarefas, agenda. Roda no navegador do celular e pode ser instalado
            como app (PWA).
          </li>
          <li>
            <strong>Cockpit de gestão</strong> — este painel. Só gestor entra. Não existe versão
            de celular: é feito para tela grande.
          </li>
        </ul>
        <p>
          Entrar é sempre pelo app de campo. O cockpit lê a sessão que já existe — por isso, quem
          abre <code>/gestao</code> sem ter entrado vê “Entre pelo app de campo primeiro”.
        </p>
        <p>
          Quem é gestor é definido por <code>profiles.role = 'gestor'</code>. Vendedor comum é{' '}
          <code>user</code>; existe também <code>view</code>, que enxerga sem poder escrever.
        </p>
        <Fonte>
          <code>gestao/src/App.tsx</code> (o portão de acesso) e <code>CLAUDE.md</code> na raiz do
          repositório.
        </Fonte>
      </>
    ),
  },

  // -------------------------------------------------------------------------
  {
    id: 'de-onde-vem-o-lead',
    titulo: 'De onde vêm os leads',
    pergunta: 'Quem coloca cliente dentro do app?',
    conteudo: (
      <>
        <p>
          Existem <strong>três portas</strong>, e só três. Todo lead do app entrou por uma delas.
        </p>

        <h4>1. Do HubSpot, pelo robô (a porta principal)</h4>
        <p>
          O RPA manda o lead para uma Edge Function do Supabase, que normaliza e grava em{' '}
          <code>clients</code>. A chave é o <code>id_hubspot</code>: mandar o mesmo lead duas vezes
          atualiza a linha em vez de duplicar.
        </p>
        <p>
          <strong>A coordenada é o ponto delicado.</strong> A lat/lon que o robô manda costuma ser
          o centroide da cidade — vários leads acabavam empilhados no mesmo pino do mapa. Por isso
          o sistema tenta <em>primeiro</em> geocodificar o endereço escrito, e só usa a coordenada
          do robô como último recurso. Quando o endereço não tem número, a geocodificação cai no
          centro da rua: nesses casos o lead fica marcado como{' '}
          <strong>localização aproximada</strong>, e o raio de check-in aumenta (veja “Visita e
          check-in”).
        </p>

        <h4>2. Cadastro manual, pelo vendedor</h4>
        <p>
          O vendedor cria o lead no app apontando no mapa ou digitando o CEP. Isso{' '}
          <strong>cria contato e negócio no HubSpot na hora</strong> — não é um registro só do app.
          Apagar a linha no banco depois não desfaz o que foi criado no CRM.
        </p>

        <h4>3. Conta Alvo, sugerida pelo sistema</h4>
        <p>
          Na Rota do dia, a partir do GPS do vendedor, o sistema procura no Google um restaurante
          bem avaliado que ainda não seja cliente: <strong>nota 4,5 ou mais</strong>,{' '}
          <strong>mais de 100 avaliações</strong>, dentro de <strong>2 km</strong>. Ele entra como
          lead com <code>origem = 'conta_alvo'</code>.
        </p>
        <p>
          Diferença importante: a Conta Alvo <strong>não cria negócio no HubSpot na hora</strong>.
          O negócio só nasce quando o vendedor faz o check-in — ou seja, quando alguém de fato foi
          lá. Isso evita encher o CRM de sugestões que ninguém visitou.
        </p>
        <Fonte>
          Edge Functions <code>hubspot-lead-webhook</code> e <code>hubspot-lead-webhook-latlong</code>{' '}
          (porta 1), <code>hubspot-sync</code> tipo <code>create_pin</code> (porta 2),{' '}
          <code>conta-alvo-nearby</code> (porta 3), e <code>geocode</code> para os endereços.
        </Fonte>
      </>
    ),
  },

  // -------------------------------------------------------------------------
  {
    id: 'o-que-o-lead-carrega',
    titulo: 'Que informações cada lead carrega',
    pergunta: 'O que o app sabe sobre um cliente?',
    conteudo: (
      <>
        <p>
          Tudo vive na tabela <code>clients</code>. Agrupado por quem preenche:
        </p>
        <Tabela
          cabecalho={['Grupo', 'Campos', 'Quem preenche']}
          linhas={[
            [
              'Identificação',
              <>nome, empresa, telefone, e-mail</>,
              'O robô do HubSpot ou o vendedor no cadastro',
            ],
            [
              'Endereço',
              <>logradouro, número, bairro, CEP, cidade, estado</>,
              'Mesma origem do lead',
            ],
            [
              'Localização',
              <>
                latitude, longitude, <code>geo_source</code>, <code>geo_approximate</code>
              </>,
              'Geocodificação, ou o ponto que o vendedor marcou no mapa',
            ],
            [
              'Comercial',
              <>
                <code>status</code>, <code>etapa</code>, <code>vendedor_id_hubspot</code>,{' '}
                <code>won_at</code>
              </>,
              'O funil do app e a reconciliação com o HubSpot',
            ],
            [
              'Vínculo com o CRM',
              <>
                <code>id_hubspot</code>, <code>url_hubspot</code>
              </>,
              'Nasce junto com o negócio no HubSpot',
            ],
            [
              'Visita',
              <>
                <code>visited_at</code>, <code>visit_count</code>
              </>,
              'O check-in. O histórico completo fica em client_visits',
            ],
            [
              'Conta Alvo',
              <>nota do Google, nº de avaliações, place_id, descarte</>,
              'Só nos leads sugeridos pelo sistema',
            ],
            [
              'Uso do produto',
              <>última comanda emitida, cancelamento solicitado</>,
              'Puxado do HubSpot toda segunda',
            ],
          ]}
        />
        <p>
          Além disso, cada lead tem <strong>histórico separado</strong>: anotações (
          <code>client_notes</code>), mudanças de etapa com o motivo (
          <code>client_stage_changes</code>), visitas (<code>client_visits</code>) e compromissos (
          <code>client_meetings</code>). Esse histórico não é apagado quando a etapa muda.
        </p>
        <Fonte>
          <code>src/types/client.ts</code> tem a lista completa com comentário campo a campo.
        </Fonte>
      </>
    ),
  },

  // -------------------------------------------------------------------------
  {
    id: 'quem-ve-o-que',
    titulo: 'Quem enxerga o quê',
    pergunta: 'Por que o vendedor diz que o cliente sumiu?',
    conteudo: (
      <>
        <p>
          Esta é a causa mais comum de “o lead não aparece”, e quase nunca é bug. São{' '}
          <strong>dois filtros diferentes</strong>, e eles se confundem:
        </p>

        <h4>1. O mapa carrega só a área visível</h4>
        <p>
          O app não baixa a base inteira — carrega os leads que estão dentro da área que o mapa
          está mostrando. Afastar o mapa ou mudar de cidade muda o que existe na tela. Quando uma
          tela precisa de um lead que está fora dessa área (uma tarefa, um compromisso), ela busca
          aquele lead por id, individualmente.
        </p>
        <p>
          <strong>Sintoma clássico:</strong> “Lead não encontrado” numa tela que não é o mapa.
        </p>

        <h4>2. O setor corta por status</h4>
        <p>
          Cada setor enxerga apenas os status liberados para ele. Quem está num setor sem o status{' '}
          <code>lead</code> abre o mapa e vê pouca coisa — não porque falta permissão, mas porque
          aqueles clientes não estão liberados para o setor dele.
        </p>
        <p>
          <strong>Sintoma clássico:</strong> a tela diz “não tem dado”, e não “sem permissão”. Se
          alguém reclamar que o mapa está vazio, o setor é a primeira coisa a conferir.
        </p>
        <p className="doc__vivo-rotulo">
          Lido do banco agora — esta tabela não é texto, é a configuração de verdade:
        </p>
        {fatos ? (
          <Tabela
            cabecalho={['Setor', 'Status que enxerga']}
            linhas={agruparVisibilidade(fatos).map((l) => [
              <strong>{l.setor}</strong>,
              l.statuses.join(', ') || '—',
            ])}
          />
        ) : (
          <p className="doc__lendo">Lendo a configuração…</p>
        )}

        <h4>Os status que existem de verdade</h4>
        {fatos ? (
          <Tabela
            cabecalho={['Status', 'Nome na tela', 'Quantos leads']}
            linhas={fatos.statuses
              .filter((st) => st.ativo)
              .map((st) => [
                <code>{st.slug}</code>,
                st.label,
                (fatos.contagemPorStatus.find((c) => c.status === st.slug)?.total ?? 0)
                  .toLocaleString('pt-BR'),
              ])}
          />
        ) : (
          <p className="doc__lendo">Lendo a configuração…</p>
        )}
        <p>
          Um cliente fechado é <code>status = 'cliente'</code>. Para contar fechamento,{' '}
          <strong>o status é a fonte confiável</strong> — a data de ganho só existe nos negócios que
          passaram pelo funil do app depois que esse carimbo começou a ser gravado.
        </p>
        <Fonte>
          Tabela <code>sector_visibility</code> no banco; o recorte por área em{' '}
          <code>src/hooks/useClients.ts</code>. A medição dos status está em{' '}
          <code>design_handoff_mobile_pwa/M10-inventario-do-calor.md</code>.
        </Fonte>
      </>
    ),
  },

  // -------------------------------------------------------------------------
  {
    id: 'funil',
    titulo: 'O funil',
    pergunta: 'Como o lead anda de etapa?',
    conteudo: (
      <>
        <p>
          O app controla o pipeline <strong>Field Sales</strong> do HubSpot. A ordem é:
        </p>
        <p className="doc__funil">
          Prospecção → Visita → Conversa com decisor → Demo/Proposta → Negociação → Pagamento →
          Ganho → Onboarding
        </p>
        <p>
          <strong>Perdido</strong> está sempre disponível, de qualquer ponto.{' '}
          <strong>Backlog</strong> e <strong>Reciclagem</strong> são etapas de entrada: o vendedor
          não move ninguém <em>para</em> elas pelo app, e quem está nelas reentra pela Prospecção.
        </p>

        <h4>Até onde dá para pular</h4>
        <p>
          Até <strong>Demo/Proposta</strong> o vendedor avança livremente, várias etapas de uma
          vez. Da Demo/Proposta em diante é <strong>uma por vez</strong>, porque as etapas
          seguintes têm campos obrigatórios (MRR, CNPJ, forma de pagamento) que não podem ser
          pulados.
        </p>

        <h4>Campos obrigatórios e campos que dependem de outros</h4>
        <p>
          Algumas etapas pedem informação antes de aceitar a movimentação, e o HubSpot recusa a
          mudança se faltar. Há também campos <strong>condicionais</strong>: escolher “Maquininha
          POS” no pacote, por exemplo, passa a exigir qual é a adquirente.
        </p>
        <p>
          Quando o HubSpot recusa, o app mostra <strong>o motivo que o CRM deu</strong> — qual
          campo faltou. Se a mensagem falar de conexão, é porque a recusa realmente não chegou.
        </p>

        <h4>A etapa muda sozinha em um caso</h4>
        <p>
          O <strong>check-in move o lead para Visita</strong> automaticamente — mas só se ele
          estiver antes de Visita no funil. Quem já está em Negociação não regride por ter recebido
          uma visita.
        </p>
        <Fonte>
          <code>src/constants/stages.ts</code> (a ordem, os ids e os campos por etapa) e{' '}
          <code>src/screens/ChangeStageModal.tsx</code> (a tela que move).
        </Fonte>
      </>
    ),
  },

  // -------------------------------------------------------------------------
  {
    id: 'visita',
    titulo: 'Visita e check-in',
    pergunta: 'O que garante que o vendedor esteve lá?',
    conteudo: (
      <>
        <p>
          O check-in <strong>exige GPS</strong> e compara a posição do celular com a coordenada do
          lead. Longe demais, o sistema recusa e diz a distância.
        </p>
        <Tabela
          cabecalho={['Situação do lead', 'Distância máxima']}
          linhas={[
            ['Coordenada precisa', '200 metros'],
            ['Localização aproximada (endereço sem número, centro da rua)', '500 metros'],
          ]}
        />
        <p>
          O limite maior para localização aproximada existe porque o erro é do <em>endereço</em>,
          não do vendedor: cobrar 200 m de uma coordenada que é o meio da rua reprovaria visita
          verdadeira.
        </p>
        <p>O check-in, quando aceito, faz quatro coisas de uma vez:</p>
        <ul>
          <li>grava a visita no histórico, com GPS, data e quem foi;</li>
          <li>incrementa o contador de visitas do lead;</li>
          <li>move para a etapa Visita, se o lead estiver antes dela;</li>
          <li>registra uma tarefa concluída no HubSpot, datada na hora do check-in.</li>
        </ul>
        <p>
          Nos leads de Conta Alvo, é também o momento em que o{' '}
          <strong>negócio nasce no HubSpot</strong>.
        </p>
        <Fonte>
          Função <code>mark_client_as_visited</code> no banco (migrations{' '}
          <code>0038_update_visited_max_distance_200m.sql</code> e{' '}
          <code>0025_checkin_radius_geo_approximate.sql</code>).
        </Fonte>
      </>
    ),
  },

  // -------------------------------------------------------------------------
  {
    id: 'tarefas',
    titulo: 'Tarefas',
    pergunta: 'De onde vem a lista de tarefas do vendedor?',
    conteudo: (
      <>
        <p>
          São <strong>duas filas diferentes</strong> na mesma tela, e elas têm donos distintos:
        </p>

        <h4>Fila 1 — cobranças que o sistema gera</h4>
        <p>
          Um motor no banco roda <strong>a cada 30 minutos</strong>, sozinho, e cria cobranças a
          partir de regra. Não depende de ninguém abrir o app. Hoje há duas regras:
        </p>
        <Tabela
          cabecalho={['Regra', 'Quando aparece', 'Quando some sozinha']}
          linhas={[
            [
              <strong>Agendar Demo</strong>,
              'Lead em Conversa com decisor sem demo futura marcada. Vira D2 aos 2 dias úteis e escala para D5 aos 5.',
              'Quando ganha uma demo futura, sai da etapa, ou deixa de ser lead.',
            ],
            [
              <strong>SLA por etapa</strong>,
              'Lead parado numa etapa além do prazo daquela etapa. O prazo é configurável por etapa.',
              'Quando o lead avança de etapa.',
            ],
          ]}
        />
        <p>
          O tempo é contado em <strong>dias úteis</strong>, a partir da entrada na etapa. Tarefa
          que o vendedor concluiu ou dispensou <strong>não volta</strong> naquele mesmo episódio da
          etapa.
        </p>
        <p className="doc__vivo-rotulo">
          Os prazos são configuráveis por etapa. Lido do banco agora:
        </p>
        {fatos ? (
          fatos.slas.length === 0 ? (
            <p className="doc__lendo">
              Nenhum prazo configurado — sem isso o motor não gera tarefa de SLA nenhuma.
            </p>
          ) : (
            <Tabela
              cabecalho={['Etapa', 'Prazo', 'Tarefa que nasce', 'Ativo']}
              linhas={fatos.slas.map((sla) => [
                sla.etapa,
                sla.dias == null ? '—' : `${sla.dias} dias úteis`,
                sla.tarefa ?? '—',
                sla.ativo ? 'sim' : 'não',
              ])}
            />
          )
        ) : (
          <p className="doc__lendo">Lendo a configuração…</p>
        )}

        <h4>Fila 2 — tarefas que a gestão põe no HubSpot</h4>
        <p>
          Visitas e follow-ups criados no CRM aparecem nas mesmas colunas da tela de Tarefas e na
          Agenda do vendedor. <strong>Não há sincronização</strong>: o app consulta o HubSpot ao
          vivo cada vez que precisa da lista. Não existe cópia no banco.
        </p>
        <p>Para uma tarefa do HubSpot aparecer, três coisas precisam ser verdade:</p>
        <ul>
          <li>
            estar atribuída à pessoa (pelo <code>hubspot_owner_id</code> do perfil dela);
          </li>
          <li>
            estar <strong>não iniciada</strong> — tarefa criada já “em andamento” não aparece;
          </li>
          <li>o app precisa perguntar, e ele pergunta ao abrir, ao trocar de aba depois de 3 minutos, e ao reconectar.</li>
        </ul>
        <p>
          <strong>É mão única.</strong> Concluir no app não fecha a tarefa no HubSpot — por isso
          esses cartões não têm botão de concluir. Quem fecha é o CRM.
        </p>
        <p>
          O vínculo com o cliente vem do negócio associado à tarefa, ou de um marcador que o
          planejamento escreve no corpo dela. Quando o negócio não existe no app, o cartão abre uma
          ficha própria, com a descrição da tarefa e a opção de colocar o lead no mapa.
        </p>
        <Fonte>
          Função <code>generate_client_tasks</code> no banco (fila 1); Edge{' '}
          <code>hubspot-sync</code>, rota <code>list_tasks</code> (fila 2). A explicação das regras
          também está no “ⓘ” da aba Tarefas do app.
        </Fonte>
      </>
    ),
  },

  // -------------------------------------------------------------------------
  {
    id: 'agenda-rota',
    titulo: 'Agenda e rota do dia',
    pergunta: 'Como o dia do vendedor é planejado?',
    conteudo: (
      <>
        <p>
          A <strong>Agenda</strong> junta três coisas numa grade só: paradas da rota, compromissos
          marcados (demo e follow-up) e as tarefas que a gestão pôs no HubSpot.
        </p>
        <p>
          Agendar uma <strong>demo</strong> cria o evento no Google Calendar e o compromisso no
          HubSpot. Reagendar e cancelar acompanham os dois. O follow-up vira observação na linha do
          tempo do CRM, e cancelar marca a observação como cancelada em vez de apagá-la —
          histórico não se apaga.
        </p>
        <p>
          A <strong>Rota do dia</strong> é a sequência de paradas. O gestor monta e edita pelo
          cockpit, na aba Rotas; o vendedor também pode montar a própria. É na rota que a{' '}
          <strong>Conta Alvo</strong> aparece como sugestão.
        </p>
        <p>
          A <strong>daily</strong> é a promessa declarada pelo vendedor. No placar, a ordem de
          precedência é: promessa declarada → paradas da rota → meta padrão. O{' '}
          <strong>realizado nunca é digitado</strong> — ele deriva das visitas com check-in.
        </p>
        <Fonte>
          Edge <code>google-calendar</code>, <code>hubspot-sync</code> (rotas de meeting e nota),
          tabelas <code>field_route_stops</code> e <code>dailies</code>.
        </Fonte>
      </>
    ),
  },

  // -------------------------------------------------------------------------
  {
    id: 'volta-do-hubspot',
    titulo: 'O que volta do HubSpot',
    pergunta: 'O app fica sabendo do que muda no CRM?',
    conteudo: (
      <>
        <p>
          Em parte, e vale saber exatamente quanto — porque o que não volta automaticamente é fonte
          de confusão.
        </p>
        <Tabela
          cabecalho={['O que volta', 'Quando', 'Para quê']}
          linhas={[
            [
              'Etapa e dono do negócio',
              '10 segundos depois de o app mover a etapa',
              'Confirmar que a mudança pegou e trazer o dono atual',
            ],
            [
              'Data real do fechamento',
              'Junto com a reconciliação acima, quando o negócio chega em Ganho ou Onboarding',
              'É a data que vale para “fechados no mês”',
            ],
            [
              'Última atividade humana',
              'Sincronização periódica',
              'Alimenta o SLA da rota — nota, ligação, e-mail ou reunião de verdade',
            ],
            [
              'Uso do produto',
              'Toda segunda-feira',
              'Última comanda emitida e pedido de cancelamento',
            ],
            [
              'Etapa atual, sob demanda',
              'Quando o vendedor abre a tela de mudar etapa',
              'Corrige o app quando alguém moveu o negócio direto no CRM',
            ],
          ]}
        />
        <p>
          <strong>O que NÃO volta sozinho:</strong> mover um negócio no HubSpot não atualiza o app
          na hora. O app só descobre quando alguém abre a tela de etapa daquele lead. Até lá, o
          mapa e os filtros mostram a etapa antiga.
        </p>
        <p>
          <strong>Um detalhe que já causou problema:</strong> os nomes das etapas no app são os
          mesmos do HubSpot desde 14/09/2026. Antes havia três com nome diferente dos dois lados, e
          um negócio movido no CRM caía num balde “Pipe Antigo” do app por não casar com etapa
          nenhuma conhecida.
        </p>
        <Fonte>
          Edge <code>hubspot-sync</code> (reconciliação e rota <code>deal_stage</code>),{' '}
          <code>hubspot-activity-sync</code>, <code>hubspot-usage-sync</code>.
        </Fonte>
      </>
    ),
  },

  // -------------------------------------------------------------------------
  {
    id: 'acessos',
    titulo: 'Contas e acesso',
    pergunta: 'Como alguém entra, e como sai?',
    conteudo: (
      <>
        <p>
          Criar uma conta faz <strong>três coisas nascerem juntas</strong>: o login, o perfil e as
          permissões. Perfil sem uma delas resulta em pessoa que entra e não consegue trabalhar.
        </p>
        <p>
          O campo mais fácil de esquecer é o <strong>ID do HubSpot</strong> do vendedor. Sem ele, a
          pessoa não recebe lead nem tarefa, e a conta parece normal por meses — o problema só
          aparece pela reclamação. A aba <strong>Acessos</strong> marca quem está nessa situação.
        </p>
        {fatos && !fatos.erro && (
          <p className={fatos.semIdHubspot > 0 ? 'doc__alerta' : 'doc__vivo-rotulo'}>
            {fatos.semIdHubspot > 0 ? (
              <>
                <strong>Agora:</strong> {fatos.semIdHubspot} de {fatos.pessoasAtivas} pessoas ativas
                estão sem ID do HubSpot. Elas não recebem lead nem tarefa.
              </>
            ) : (
              <>
                Agora: todas as {fatos.pessoasAtivas} pessoas ativas têm ID do HubSpot.
              </>
            )}
          </p>
        )}
        <p>
          Desativar tem duas partes: <strong>revogar o acesso</strong> e{' '}
          <strong>decidir quem fica com a carteira</strong>. Vendedor desativado recebe o sufixo{' '}
          <code>/ DESATIVADO</code> no nome — é a convenção que várias telas leem para não contar
          essa pessoa nos números do time.
        </p>
        <Fonte>
          Edges <code>criar-usuario</code>, <code>revogar-usuario</code> e{' '}
          <code>status-usuario</code>; abas <strong>Acessos</strong> e{' '}
          <strong>Desativar acesso</strong> deste cockpit.
        </Fonte>
      </>
    ),
  },

  // -------------------------------------------------------------------------
  {
    id: 'quando-parece-errado',
    titulo: 'Quando algo parece errado',
    pergunta: 'Por onde eu começo a investigar?',
    conteudo: (
      <>
        <p>
          Os sintomas abaixo já aconteceram e têm causa conhecida. Vale conferir antes de tratar
          como defeito novo.
        </p>
        <Tabela
          cabecalho={['O que a pessoa diz', 'Causa provável']}
          linhas={[
            [
              '“O mapa está vazio.”',
              <>
                O setor dela não enxerga o status <code>lead</code>. Só Outbound e RPA enxergam.
              </>,
            ],
            [
              '“Esse cliente sumiu do app.”',
              'O mapa carrega só a área visível. Afastar o mapa ou buscar pelo nome resolve.',
            ],
            [
              '“Não consigo mover a etapa, diz erro de conexão.”',
              'Quase sempre é campo obrigatório faltando, e o CRM recusou. A mensagem mostra o motivo real.',
            ],
            [
              '“Movi no HubSpot e o app não atualizou.”',
              'Esperado. O app relê a etapa quando abre a tela de mudar etapa daquele lead.',
            ],
            [
              '“Não recebo tarefa nenhuma.”',
              'Provavelmente falta o ID do HubSpot no perfil. Confira em Acessos.',
            ],
            [
              '“O check-in não deixa eu marcar a visita.”',
              'Distância acima do limite, ou GPS desligado. O app diz a distância medida.',
            ],
            [
              '“Atualizei o app e continua igual.”',
              'Quem tem o app instalado na tela de início só troca de versão ao aceitar a atualização. Aba anônima mostra a versão nova na hora.',
            ],
            [
              '“Esse número está diferente do HubSpot.”',
              'Confira o recorte: o cockpit conta por dono, por período e por status. O CRM pode estar contando outro pipeline.',
            ],
          ]}
        />
      </>
    ),
  },
];

type Mensagem = { papel: 'usuario' | 'assistente'; texto: string };

const SUGESTOES = [
  'Por que um vendedor não está vendo os leads no mapa?',
  'De onde vêm os leads que aparecem no app?',
  'Por que alguém não recebe tarefa nenhuma?',
  'O que acontece quando o vendedor faz check-in?',
];

export function Documentacao() {
  // Índice fixo no topo em vez de sanfona: a pessoa que abre esta aba quase
  // sempre tem UMA pergunta, e rolar procurando o título é pior que clicar.
  const [ativa, setAtiva] = useState<string>('visao-geral');
  const [fatos, setFatos] = useState<FatosVivos | null>(null);

  // A configuração é lida a cada abertura da aba. Não há cache de propósito:
  // esta página existe para dizer o que vale AGORA, e um valor de dez minutos
  // atrás com cara de atual é o defeito que ela deveria evitar.
  useEffect(() => {
    let cancelado = false;
    void carregarFatosVivos().then((f) => {
      if (!cancelado) setFatos(f);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const secoes = montarSecoes(fatos);
  const verificacoes: Verificacao[] = fatos ? conferir(fatos) : [];
  const divergiu = verificacoes.filter((v) => v.situacao === 'divergiu');

  const irPara = (id: string) => {
    setAtiva(id);
    document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="doc">
      <div className="cartao doc__aviso">
        <p>
          Esta página descreve <strong>o que o sistema faz hoje</strong>, e cada seção diz onde a
          regra vive, para quem quiser conferir no código.
        </p>
        <p className="doc__revisao">
          O texto foi conferido contra o código em <strong>{REVISADO_EM}</strong>. As tabelas de
          configuração e os números vêm do banco a cada abertura — esses não envelhecem.
        </p>
      </div>

      <ChatDaDocumentacao fatos={fatos} />

      <Conferencia verificacoes={verificacoes} divergiu={divergiu.length} fatos={fatos} />

      <nav className="doc__indice" aria-label="Seções da documentação">
        {secoes.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => irPara(s.id)}
            className={`doc__indice-item${ativa === s.id ? ' doc__indice-item--ativo' : ''}`}
          >
            {s.titulo}
          </button>
        ))}
      </nav>

      {/* `id` no container: é daqui que o chat tira o texto que manda ao
          modelo. Ler o que está NA TELA, em vez de manter uma segunda cópia do
          texto para a IA, é o que impede os dois de divergirem. */}
      <div id="doc-texto">
        {secoes.map((s) => (
          <section key={s.id} id={`doc-${s.id}`} className="cartao doc__secao">
            <h3 className="doc__titulo">{s.titulo}</h3>
            <p className="doc__pergunta">{s.pergunta}</p>
            <div className="doc__conteudo">{s.conteudo}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** O resultado da conferência das frases verificáveis contra o banco. */
function Conferencia({
  verificacoes,
  divergiu,
  fatos,
}: {
  verificacoes: Verificacao[];
  divergiu: number;
  fatos: FatosVivos | null;
}) {
  const [aberto, setAberto] = useState(false);
  // Divergência não se esconde atrás de clique: ela abre sozinha. O resto fica
  // recolhido porque "tudo confere" é a resposta esperada, e resposta esperada
  // não merece espaço na tela.
  const mostrar = aberto || divergiu > 0;

  if (!fatos) return <div className="cartao doc__conferencia">Conferindo com o banco…</div>;

  return (
    <div className={`cartao doc__conferencia${divergiu > 0 ? ' doc__conferencia--alerta' : ''}`}>
      <button type="button" className="doc__conferencia-topo" onClick={() => setAberto((a) => !a)}>
        <span>
          {divergiu > 0 ? (
            <>
              <strong>{divergiu}</strong> afirmação(ões) desta página não batem com o banco
            </>
          ) : (
            <>As afirmações desta página conferem com o banco</>
          )}
        </span>
        <span className="doc__conferencia-seta">{mostrar ? '▲' : '▼'}</span>
      </button>

      {mostrar && (
        <ul className="doc__conferencia-lista">
          {verificacoes.map((v) => (
            <li key={v.id} className={`doc__check doc__check--${v.situacao}`}>
              <span className="doc__check-selo">
                {v.situacao === 'confere' ? 'confere' : v.situacao === 'divergiu' ? 'divergiu' : 'não medido'}
              </span>
              <span>
                <strong>{v.afirmacao}</strong>
                <br />
                {v.detalhe}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** O chat. Ancorado no texto que está na tela e na configuração lida agora. */
function ChatDaDocumentacao({ fatos }: { fatos: FatosVivos | null }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [rascunho, setRascunho] = useState('');
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [mensagens, pensando]);

  const perguntar = async (texto: string) => {
    const pergunta = texto.trim();
    if (!pergunta || pensando) return;
    setErro(null);
    setRascunho('');
    // O histórico mandado é o de ANTES desta pergunta — ela vai no campo
    // próprio. Mandar nos dois lugares faria o modelo ver a pergunta duas vezes.
    const historico = mensagens.slice(-8);
    setMensagens((m) => [...m, { papel: 'usuario', texto: pergunta }]);
    setPensando(true);
    try {
      // O texto vem do DOM, que é o que a pessoa está lendo. Se um dia o texto
      // mudar, o chat muda junto sem ninguém lembrar de sincronizar.
      const documentacao = document.getElementById('doc-texto')?.innerText ?? '';
      const { data, error } = await supabase.functions.invoke('documentacao-chat', {
        body: {
          pergunta,
          documentacao,
          configuracao: fatos ? fatosEmTexto(fatos) : '',
          historico,
        },
      });
      if (error) throw new Error(await mensagemDoErro(error));
      if (data?.error) throw new Error(data.error);
      const resposta = String(data?.texto ?? '').trim();
      if (!resposta) throw new Error('A resposta voltou vazia.');
      setMensagens((m) => [...m, { papel: 'assistente', texto: resposta }]);
    } catch (e) {
      // A pergunta CONTINUA na tela quando falha. Some com ela e a pessoa
      // digita de novo sem saber se o problema foi o que ela escreveu.
      setErro((e as Error)?.message ?? 'Não consegui responder agora.');
    } finally {
      setPensando(false);
    }
  };

  return (
    <div className="cartao doc__chat">
      <div className="doc__chat-topo">
        <h3 className="doc__titulo">Perguntar</h3>
        <p className="doc__pergunta">
          Responde com base nesta página e na configuração do banco. Não tem acesso a dados de
          cliente, e diz quando não sabe.
        </p>
      </div>

      {mensagens.length === 0 && !pensando && (
        <div className="doc__chat-sugestoes">
          {SUGESTOES.map((sug) => (
            <button
              key={sug}
              type="button"
              className="doc__chat-sugestao"
              onClick={() => void perguntar(sug)}
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {mensagens.length > 0 && (
        <div className="doc__chat-conversa">
          {mensagens.map((m, i) => (
            <div key={i} className={`doc__balao doc__balao--${m.papel}`}>
              {m.texto}
            </div>
          ))}
          {pensando && <div className="doc__balao doc__balao--assistente doc__balao--pensando">Pensando…</div>}
          <div ref={fimRef} />
        </div>
      )}

      {erro && <p className="doc__chat-erro">{erro}</p>}

      <form
        className="doc__chat-campo"
        onSubmit={(e) => {
          e.preventDefault();
          void perguntar(rascunho);
        }}
      >
        <input
          type="text"
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          placeholder="Como funciona…?"
          disabled={pensando}
          aria-label="Sua pergunta"
        />
        <button type="submit" disabled={pensando || !rascunho.trim()}>
          {pensando ? 'Perguntando…' : 'Perguntar'}
        </button>
      </form>
    </div>
  );
}

/** O `functions.invoke` embrulha o corpo do erro; sem abrir, toda falha vira
 *  "Edge Function returned a non-2xx status code" — que não diz nada a quem
 *  está lendo, nem a quem for investigar depois. */
async function mensagemDoErro(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const corpo = await ctx.json();
      if (corpo?.error) return traduzir(String(corpo.error));
    } catch {
      // corpo não era JSON — cai na mensagem crua
    }
  }
  return traduzir((error as Error)?.message ?? 'Falha ao chamar o chat.');
}

/** As falhas que têm dono conhecido viram frase acionável.
 *
 *  Aconteceu na primeira chamada de verdade, em 21/09/2026: a resposta trouxe o
 *  JSON cru da OpenAI — `{"error":{"message":"You have no credits remaining"…}}`
 *  — e isso apareceu inteiro na tela. Um gestor lendo aquilo não sabe se o
 *  problema é dele, do sistema ou da pergunta.
 *
 *  Traduzido aqui, no cliente, e não na Edge, para não pedir mais um deploy por
 *  causa de um texto. */
function traduzir(bruto: string): string {
  if (/insufficient_quota|no credits remaining|credit_balance_exhausted/i.test(bruto)) {
    return 'A conta da OpenAI está sem créditos, então o chat não consegue responder. Isso derruba junto a "Leitura da semana" do cockpit e a transcrição dos 1:1 — as três usam a mesma chave.';
  }
  if (/rate limit|429/i.test(bruto)) {
    return 'A OpenAI recusou por excesso de chamadas no momento. Tente de novo em um minuto.';
  }
  if (/OPENAI_API_KEY não configurada/i.test(bruto)) {
    return bruto; // já é acionável: diz o comando a rodar
  }
  if (/não encontrada|not found|404/i.test(bruto)) {
    return 'A função documentacao-chat ainda não está no ar. Rode: supabase functions deploy documentacao-chat.';
  }
  if (/demorou demais/i.test(bruto)) return bruto;
  return bruto;
}
