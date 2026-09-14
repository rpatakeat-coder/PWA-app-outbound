// As tarefas que vieram do CRM — visita do planejamento, follow up do funil.
//
// Fica SEPARADA das tarefas do app: `client_tasks` é regra do próprio app
// ("este lead está há N dias parado"), e isto é compromisso que a gestão pôs
// na agenda desta pessoa. Misturar faria o vendedor não saber o que foi
// combinado com alguém.
//
// AGRUPADA POR DIA, e não em lista corrida. A primeira versão mostrava 45
// itens seguidos, 33 deles vencidos no mesmo dia, e não dava para responder "o
// que eu faço hoje?" — que é a única pergunta que essa tela existe para
// responder. Vencidas vêm primeiro porque atraso é o mais urgente; depois hoje,
// amanhã e o resto da semana.
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLayout } from '../hooks/useLayout';
import { useTarefasDoCrm, type TarefaDoCrmNaTela } from '../hooks/useTarefasDoCrm';

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Dia local 'AAAA-MM-DD' — a agenda do vendedor é o dia do aparelho dele. */
const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type Grupo = { chave: string; titulo: string; atrasado: boolean; itens: TarefaDoCrmNaTela[] };

/**
 * Agrupa por dia de vencimento. Tudo que venceu cai num grupo só — a pessoa
 * não precisa de sete cabeçalhos de atraso, precisa saber o tamanho do buraco.
 */
function agrupar(tarefas: TarefaDoCrmNaTela[], hoje: Date): Grupo[] {
  const chaveHoje = diaLocal(hoje);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const chaveAmanha = diaLocal(amanha);

  const vencidas: TarefaDoCrmNaTela[] = [];
  const porDia = new Map<string, TarefaDoCrmNaTela[]>();

  for (const t of tarefas) {
    if (!t.venceEm) {
      // Sem data não dá para agendar. Vai com as vencidas em vez de sumir:
      // tarefa sem prazo continua sendo trabalho de alguém.
      vencidas.push(t);
      continue;
    }
    const dia = diaLocal(new Date(t.venceEm));
    if (dia < chaveHoje) vencidas.push(t);
    else (porDia.get(dia) ?? porDia.set(dia, []).get(dia)!).push(t);
  }

  const grupos: Grupo[] = [];
  if (vencidas.length > 0) {
    grupos.push({
      chave: 'vencidas',
      titulo: `Vencidas · ${vencidas.length}`,
      atrasado: true,
      itens: vencidas.sort((a, b) => (a.venceEm ?? '').localeCompare(b.venceEm ?? '')),
    });
  }
  for (const dia of [...porDia.keys()].sort()) {
    const [a, m, d] = dia.split('-');
    grupos.push({
      chave: dia,
      titulo:
        dia === chaveHoje ? 'Hoje' : dia === chaveAmanha ? 'Amanhã' : `${d}/${m}/${a.slice(2)}`,
      atrasado: false,
      itens: porDia.get(dia)!.sort((x, y) => (x.venceEm ?? '').localeCompare(y.venceEm ?? '')),
    });
  }
  return grupos;
}

export function TarefasDoCrmSecao({
  enabled,
  abrirLeadNoMapa,
  /** Na Agenda, mostra só o dia escolhido no seletor do topo. */
  apenasDia,
}: {
  enabled: boolean;
  abrirLeadNoMapa?: (clientId: string) => void;
  apenasDia?: Date;
}) {
  const layout = useLayout();
  const { tarefas, total, semMedicao, carregando, erro } = useTarefasDoCrm(enabled);
  // Vencidas fechadas por padrão: são passado, e abrir a tela com 33 linhas de
  // atraso empurra o dia de hoje para fora do alcance da vista.
  const [aberto, setAberto] = useState<Record<string, boolean>>({});

  const grupos = useMemo(() => {
    const base = apenasDia
      ? tarefas.filter((t) => t.venceEm && diaLocal(new Date(t.venceEm)) === diaLocal(apenasDia))
      : tarefas;
    return agrupar(base, new Date());
  }, [tarefas, apenasDia]);

  if (carregando) return null;

  if (semMedicao) {
    return (
      <View style={estilos.bloco}>
        <Text style={estilos.titulo}>Da gestão</Text>
        <Text style={estilos.aviso}>{semMedicao}</Text>
      </View>
    );
  }
  if (erro) {
    return (
      <View style={estilos.bloco}>
        <Text style={estilos.titulo}>Da gestão</Text>
        <Text style={estilos.aviso}>
          Não consegui buscar as tarefas do CRM agora. As do app continuam valendo.
        </Text>
      </View>
    );
  }
  // Na Agenda, um dia sem nada não merece cartão nenhum — o vazio já é a
  // resposta, e um bloco "0 tarefas" em cada dia vazio vira ruído.
  if (grupos.length === 0) return null;

  return (
    <View style={estilos.bloco}>
      <Text style={estilos.titulo}>Da gestão</Text>
      <Text style={estilos.ajuda}>
        {apenasDia
          ? 'Visitas e follow ups que a gestão pôs neste dia.'
          : 'Visitas e follow ups que a gestão pôs na sua semana.'}
      </Text>

      {grupos.map((g) => {
        // O dia de hoje e o de amanhã nascem abertos; vencidas e futuro, não.
        const expandido = aberto[g.chave] ?? (g.titulo === 'Hoje' || g.titulo === 'Amanhã');
        return (
          <View key={g.chave} style={{ marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => setAberto((a) => ({ ...a, [g.chave]: !expandido }))}
              accessibilityRole="button"
              style={[estilos.cabecalhoGrupo, { minHeight: layout.alvo }]}
            >
              <Text style={[estilos.tituloGrupo, g.atrasado && estilos.tituloAtrasado]}>
                {g.titulo}
              </Text>
              <Text style={estilos.contagem}>
                {g.atrasado ? '' : `${g.itens.length} · `}
                {expandido ? 'ocultar' : 'ver'}
              </Text>
            </TouchableOpacity>

            {expandido &&
              g.itens.map((t) => {
                const podeAbrir = t.clientId != null && abrirLeadNoMapa != null;
                return (
                  <TouchableOpacity
                    key={t.id}
                    disabled={!podeAbrir}
                    onPress={() => t.clientId && abrirLeadNoMapa?.(t.clientId)}
                    accessibilityRole={podeAbrir ? 'button' : undefined}
                    style={[estilos.item, { minHeight: layout.alvo }]}
                  >
                    <View style={[estilos.marca, g.atrasado && { backgroundColor: 'var(--brand-text)' }]} />
                    <View style={{ flex: 1 }}>
                      {/* O CLIENTE vem primeiro. Na primeira versão o título era
                          a ação ("Identificar o nome do decisor"), e seis
                          follow ups de clientes diferentes ficavam idênticos. */}
                      <Text style={estilos.cliente} numberOfLines={1}>
                        {t.nomeDoCliente ?? 'Cliente não identificado'}
                      </Text>
                      <Text style={estilos.acao} numberOfLines={2}>
                        {t.assunto.replace(/^(?:visita|follow.?up)\s*[-–—]\s*/i, '')}
                      </Text>
                      <Text style={[estilos.quando, g.atrasado && estilos.quandoAtrasado]}>
                        {t.venceEm ? hora(t.venceEm) : 'sem horário'}
                        {t.tipo === 'visita' ? ' · visita' : t.tipo === 'follow_up' ? ' · follow up' : ''}
                      </Text>
                      {t.versaoDesconhecida && (
                        <Text style={estilos.nota}>
                          Formato {t.versaoDesconhecida} que este app ainda não lê — abra pelo HubSpot.
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
          </View>
        );
      })}

      {total > tarefas.length && (
        <Text style={estilos.ajuda}>
          Mostrando {tarefas.length} de {total}. As demais estão no HubSpot.
        </Text>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: {
    backgroundColor: 'var(--surface)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--border)',
    padding: 14,
    marginBottom: 16,
  },
  titulo: {
    fontSize: 13,
    fontWeight: '700',
    color: 'var(--text)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  ajuda: { fontSize: 12, color: 'var(--text-subtle)', marginTop: 4, lineHeight: 16 },
  aviso: { fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 18 },
  cabecalhoGrupo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'var(--border)',
    paddingTop: 8,
  },
  tituloGrupo: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  tituloAtrasado: { color: 'var(--brand-text)' },
  contagem: { fontSize: 12, color: 'var(--text-subtle)', fontWeight: '600' },
  item: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' },
  marca: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: 'var(--border)' },
  cliente: { fontSize: 14, fontWeight: '700', color: 'var(--text)', lineHeight: 19 },
  acao: { fontSize: 13, color: 'var(--text-muted)', marginTop: 1, lineHeight: 17 },
  quando: { fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 },
  quandoAtrasado: { color: 'var(--brand-text)', fontWeight: '600' },
  nota: { fontSize: 11, color: 'var(--text-subtle)', marginTop: 3, fontStyle: 'italic' },
});
