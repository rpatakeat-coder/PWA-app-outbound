// As tarefas que vieram do CRM — visita do planejamento, follow up do funil.
//
// Fica SEPARADA das tarefas do app, e não misturada, porque as duas respondem
// coisas diferentes: `client_tasks` é regra do próprio app ("este lead está há
// N dias parado"), e isto aqui é compromisso que alguém — o gestor, pelo
// Cockpit — pôs na agenda desta pessoa. Misturar faria o vendedor não saber
// o que é sugestão do sistema e o que é combinado com a gestão.
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLayout } from '../hooks/useLayout';
import { useTarefasDoCrm, type TarefaDoCrmNaTela } from '../hooks/useTarefasDoCrm';

/** dd/mm às HH:MM, no fuso do aparelho — mesmo formato do resto do app. */
const quando = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'sem data';

const ehAtrasada = (t: TarefaDoCrmNaTela) =>
  t.venceEm != null && new Date(t.venceEm).getTime() < Date.now();

export function TarefasDoCrmSecao({
  enabled,
  abrirLeadNoMapa,
}: {
  enabled: boolean;
  abrirLeadNoMapa?: (clientId: string) => void;
}) {
  const layout = useLayout();
  const { tarefas, total, semMedicao, carregando, erro } = useTarefasDoCrm(enabled);

  if (carregando) return null;

  // Sem ID do HubSpot não dá para consultar — e isso NÃO é "nenhuma tarefa".
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
          Não consegui buscar as tarefas do CRM agora. As tarefas do app abaixo continuam valendo.
        </Text>
      </View>
    );
  }

  if (tarefas.length === 0) return null;

  const atrasadas = tarefas.filter(ehAtrasada).length;

  return (
    <View style={estilos.bloco}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.titulo}>Da gestão · {tarefas.length}</Text>
        {atrasadas > 0 && <Text style={estilos.atrasoResumo}>{atrasadas} vencida{atrasadas > 1 ? 's' : ''}</Text>}
      </View>
      <Text style={estilos.ajuda}>
        Visitas e follow ups que a gestão posicionou na sua semana pelo Cockpit.
      </Text>

      {tarefas.map((t) => {
        const atrasada = ehAtrasada(t);
        const podeAbrir = t.clientId != null && abrirLeadNoMapa != null;
        return (
          <TouchableOpacity
            key={t.id}
            disabled={!podeAbrir}
            onPress={() => t.clientId && abrirLeadNoMapa?.(t.clientId)}
            accessibilityRole={podeAbrir ? 'button' : undefined}
            style={[estilos.item, { minHeight: layout.alvo }]}
          >
            <View style={[estilos.marca, atrasada && { backgroundColor: 'var(--brand-text)' }]} />
            <View style={{ flex: 1 }}>
              <Text style={estilos.assunto}>{t.assunto}</Text>
              <Text style={[estilos.data, atrasada && estilos.dataAtrasada]}>
                {atrasada ? 'venceu ' : ''}
                {quando(t.venceEm)}
                {t.tipo === 'visita' ? ' · visita' : t.tipo === 'follow_up' ? ' · follow up' : ''}
              </Text>
              {!!t.corpo && (
                <Text style={estilos.corpo} numberOfLines={2}>
                  {t.corpo}
                </Text>
              )}
              {/* O lead não está no app: a pessoa ainda vê a tarefa, só não
                  consegue abrir no mapa. Dizer isso é melhor que um toque que
                  não faz nada. */}
              {t.clientId == null && (
                <Text style={estilos.semLead}>
                  {t.versaoDesconhecida
                    ? `Esta tarefa veio num formato ${t.versaoDesconhecida} que este app ainda não lê — abra pelo HubSpot.`
                    : 'Este lead não está no seu mapa.'}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      {/* 100 é o teto de uma página. Mostrar 100 de 178 sem dizer que há mais
          seria mentir por omissão sobre o tamanho da fila. */}
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
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { fontSize: 13, fontWeight: '700', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.4 },
  atrasoResumo: { fontSize: 12, fontWeight: '700', color: 'var(--brand-text)' },
  ajuda: { fontSize: 12, color: 'var(--text-subtle)', marginTop: 4, marginBottom: 8, lineHeight: 16 },
  aviso: { fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 18 },
  item: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' },
  marca: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: 'var(--border)' },
  assunto: { fontSize: 14, fontWeight: '600', color: 'var(--text)', lineHeight: 19 },
  data: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  dataAtrasada: { color: 'var(--brand-text)', fontWeight: '700' },
  corpo: { fontSize: 12, color: 'var(--text-subtle)', marginTop: 2, lineHeight: 16 },
  semLead: { fontSize: 11, color: 'var(--text-subtle)', marginTop: 3, fontStyle: 'italic' },
});
