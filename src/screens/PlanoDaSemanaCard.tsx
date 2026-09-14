// O plano da semana — cinco dias, uma região cada.
//
// É INTENÇÃO, não rota. A rota do dia continua sendo a verdade do que se
// percorre; isto responde a pergunta que vem antes: "onde eu vou estar nesta
// semana?". A rua se organiza por região, não por hora — por isso não há
// grade de horários aqui, e sim um lugar por dia.
//
// Três estados que a tela precisa distinguir, e que um dia vazio sozinho não
// distinguiria:
//   - dia sem região  = ainda não planejei
//   - dia bloqueado   = planejei NÃO ir (folga, treinamento, feriado)
//   - plano fechado   = terminei de montar
// Sem o bloqueio, segunda de manhã um dia de folga parece falta de plano.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLayout } from '../hooks/useLayout';
import {
  DIAS_UTEIS,
  ROTULO_DO_DIA,
  diaDaSemana,
  usePlanoSemanal,
  type DiaUtil,
} from '../hooks/usePlanoSemanal';

export function PlanoDaSemanaCard({ enabled }: { enabled: boolean }) {
  const layout = useLayout();
  const { plano, carregando, salvar, segunda } = usePlanoSemanal(enabled);

  // Cópia local para digitar sem ir ao banco a cada tecla. Sincroniza quando o
  // plano chega — e só então, senão o que está sendo digitado some.
  const [regioes, setRegioes] = useState<Partial<Record<DiaUtil, string>>>({});
  useEffect(() => {
    setRegioes(plano.regioes);
  }, [plano.regioes]);

  if (carregando) return null;
  if (plano.indisponivel) {
    return (
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>Plano da semana</Text>
        <Text style={estilos.ajuda}>{plano.indisponivel}</Text>
      </View>
    );
  }

  const bloqueado = (d: DiaUtil) => plano.diasBloqueados.includes(d);
  const planejados = DIAS_UTEIS.filter((d) => (regioes[d] ?? '').trim() && !bloqueado(d)).length;

  const alternarBloqueio = (d: DiaUtil) => {
    const novos = bloqueado(d)
      ? plano.diasBloqueados.filter((x) => x !== d)
      : [...plano.diasBloqueados, d];
    salvar.mutate({ diasBloqueados: novos });
  };

  return (
    <View style={estilos.cartao}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.titulo}>Plano da semana</Text>
        {plano.fechadoEm ? (
          <Text style={estilos.selo}>fechado</Text>
        ) : (
          <Text style={estilos.seloAberto}>montando</Text>
        )}
      </View>
      <Text style={estilos.ajuda}>
        Onde você pretende estar em cada dia. É o plano — a rota do dia continua
        mandando no que você percorre.
      </Text>

      {DIAS_UTEIS.map((d) => {
        const data = diaDaSemana(segunda, d);
        const off = bloqueado(d);
        return (
          <View key={d} style={estilos.linha}>
            <View style={{ width: 84 }}>
              <Text style={estilos.dia}>{ROTULO_DO_DIA[d]}</Text>
              <Text style={estilos.data}>{data.slice(8, 10)}/{data.slice(5, 7)}</Text>
            </View>

            {off ? (
              <Text style={estilos.bloqueado}>fora da rua neste dia</Text>
            ) : (
              <TextInput
                style={[estilos.campo, { minHeight: layout.alvo }]}
                placeholder="Região"
                placeholderTextColor="var(--text-subtle)"
                value={regioes[d] ?? ''}
                onChangeText={(v) => setRegioes((r) => ({ ...r, [d]: v }))}
                onBlur={() => salvar.mutate({ regioes })}
              />
            )}

            <TouchableOpacity
              onPress={() => alternarBloqueio(d)}
              accessibilityRole="button"
              style={[estilos.botaoBloqueio, { minHeight: layout.alvo }]}
            >
              <Text style={estilos.botaoBloqueioTexto}>{off ? 'Vou' : 'Não vou'}</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={estilos.rodape}>
        <Text style={estilos.contagem}>
          {/* Zero aqui é verdade: os cinco dias estão na tela, e "nenhum
              preenchido" é uma constatação, não uma medida que faltou. */}
          {planejados === 0
            ? 'Nenhum dia definido ainda.'
            : `${planejados} de 5 dias com região.`}
        </Text>
        <TouchableOpacity
          onPress={() =>
            salvar.mutate({
              regioes,
              fechadoEm: plano.fechadoEm ? null : new Date().toISOString(),
            })
          }
          accessibilityRole="button"
          style={[estilos.botaoFechar, { minHeight: layout.alvo }]}
        >
          <Text style={estilos.botaoFecharTexto}>
            {plano.fechadoEm ? 'Reabrir' : 'Fechar o plano'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    backgroundColor: 'var(--surface)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'var(--border)',
    padding: 16,
    marginBottom: 16,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { fontSize: 16, fontWeight: '700', color: 'var(--text)' },
  selo: {
    fontSize: 11,
    fontWeight: '700',
    color: 'var(--tint-green-text)',
    backgroundColor: 'var(--tint-green)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  seloAberto: {
    fontSize: 11,
    fontWeight: '700',
    color: 'var(--tint-amber-text)',
    backgroundColor: 'var(--tint-amber)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ajuda: { fontSize: 12, color: 'var(--text-subtle)', marginTop: 4, marginBottom: 12, lineHeight: 17 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  dia: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  data: { fontSize: 11, color: 'var(--text-subtle)' },
  campo: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
  },
  bloqueado: { flex: 1, fontSize: 13, color: 'var(--text-subtle)', fontStyle: 'italic' },
  botaoBloqueio: {
    borderWidth: 1,
    borderColor: 'var(--border)',
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  botaoBloqueioTexto: { fontSize: 12, fontWeight: '600', color: 'var(--text-muted)' },
  rodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  contagem: { fontSize: 12, color: 'var(--text-muted)', flex: 1 },
  botaoFechar: {
    backgroundColor: '#222222',
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  botaoFecharTexto: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
