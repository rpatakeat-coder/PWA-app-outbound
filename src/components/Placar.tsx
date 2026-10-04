// O placar do executivo (Um app só, PR 1 · docs/11 §1 e P1 do protótipo, 04/10/2026).
//
// Fechado (2 linhas, topo da Tarefas): traços das provadas de hoje, "x de 6 provadas
// hoje", o selo da posição na temporada; embaixo o que falta para o piso da semana e o
// variável do mês com o valor da próxima venda. Um toque abre a folha "Como estou indo"
// — a MESMA que a pílula 0/6 do Mapa abre. Uma definição por número (placar_executivo,
// 0156), escrita no rodapé da folha.
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Painel } from './Painel';
import { IconChevronRight, IconClose, IconTrophy, useIconColors } from './icons';
import { reais, textoDoPiso, type Placar } from '../hooks/useUmApp';

const VERDE = 'var(--verde-acao)';


function Tracos({ feito, meta }: { feito: number; meta: number }) {
  const total = Math.max(1, Math.max(meta, Math.min(feito, 12)));
  return (
    <View style={s.tracos} accessibilityLabel={`${feito} de ${meta} visitas provadas hoje`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.traco, i < feito && { backgroundColor: VERDE }]} />
      ))}
    </View>
  );
}

export function PlacarFechado({ dados, carregando, aoAbrir, aoAbrirRanking, largo }: {
  dados: Placar | undefined; carregando: boolean; aoAbrir: () => void; aoAbrirRanking: () => void; largo?: boolean;
}) {
  if (dados?.sem_carteira) {
    return (
      <View style={s.fechado}>
        <Text style={s.semCarteira}>Não há carteira para medir</Text>
        <Text style={s.linha2Texto}>Seu usuário não está ligado a um dono no HubSpot.</Text>
      </View>
    );
  }
  if (!dados?.hoje) {
    return (
      <View style={[s.fechado, { minHeight: 76, justifyContent: 'center' }]}>
        {carregando ? <Text style={s.linha2Texto}>Lendo o placar…</Text> : <Text style={s.linha2Texto}>Placar não medido agora. Puxe para atualizar.</Text>}
      </View>
    );
  }
  const h = dados.hoje; const m = dados.mes; const t = dados.temporada;
  const piso = textoDoPiso(dados);
  if (largo) {
    // computador: 4 células sempre abertas (prancha "Computador 1280 · Tarefas")
    const cel = (rot: string, valor: string, sub: string | null, onPress?: () => void) => (
      <Pressable accessibilityRole="button" onPress={onPress ?? aoAbrir} style={s.celula}>
        <Text style={s.celRot}>{rot}</Text>
        <Text style={s.celValor} numberOfLines={1}>{valor}</Text>
        {sub ? <Text style={s.celSub} numberOfLines={2}>{sub}</Text> : null}
      </Pressable>
    );
    return (
      <View style={s.celulas}>
        {cel('HOJE', `${h.provadas} de ${h.meta}`, `visitas provadas${h.sem_prova ? ` · ${h.sem_prova} sem prova à parte` : ''}`)}
        {cel('PISO DA SEMANA', piso?.replace('Piso: ', '') ?? '—', dados.semana ? `${dados.semana.provadas} visitas provadas · ${dados.semana.demos} ${dados.semana.demos === 1 ? 'demo' : 'demos'}` : null)}
        {cel('TEMPORADA', t?.pos ? `${t.pos}º` : '—', t?.faltam ?? null, aoAbrirRanking)}
        {cel('VARIÁVEL DO MÊS', reais(m?.variavel), m ? `${m.fechados} de ${m.meta} clientes${m.proxima_venda ? ` · a próxima vale ${reais(m.proxima_venda)}` : ''}` : null)}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir o placar: como estou indo" onPress={aoAbrir} style={s.fechado}>
      <View style={s.linha1}>
        <Tracos feito={h.provadas} meta={h.meta} />
        <Text style={s.linha1Texto} numberOfLines={1}>{`${h.provadas} de ${h.meta} provadas hoje`}</Text>
        {t?.pos ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Você está em ${t.pos}º na semana. Abrir o ranking`} onPress={aoAbrirRanking}
            style={s.seloAlvo}>
            <View style={s.selo}><IconTrophy width={12} height={12} fill="var(--text)" /><Text style={s.seloTexto}>{`${t.pos}º`}</Text></View>
          </Pressable>
        ) : null}
      </View>
      <View style={s.linha2}>
        <Text style={[s.linha2Texto, { flex: 1 }]} numberOfLines={2}>{piso ?? ''}</Text>
        {m && m.variavel != null ? (
          <Text style={s.linha2Valor} numberOfLines={1}>{`${reais(m.variavel)}${m.proxima_venda ? ` · próxima +${Math.round(m.proxima_venda)}` : ''}`}</Text>
        ) : null}
        <ChevronDoPlacar />
      </View>
    </Pressable>
  );
}

function ChevronDoPlacar() {
  const cores = useIconColors();
  return <IconChevronRight width={18} height={18} fill={cores.muted} />;
}

function Linha({ rot, sub, valor, fraco }: { rot: string; sub?: string | null; valor: string; fraco?: boolean }) {
  return (
    <View style={s.fLinha}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.fRot}>{rot}</Text>
        {sub ? <Text style={s.fSub}>{sub}</Text> : null}
      </View>
      <Text style={[s.fValor, fraco && { color: 'var(--text-muted)' }]}>{valor}</Text>
    </View>
  );
}

const horaDe = (iso: string | null | undefined) => {
  if (!iso) return null;
  const b = new Date(new Date(iso).getTime() - 3 * 3600000);
  return `${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}`;
};
const ddmm = (iso: string) => { const b = new Date(new Date(iso).getTime() - 3 * 3600000); return `${String(b.getUTCDate()).padStart(2, '0')}/${String(b.getUTCMonth() + 1).padStart(2, '0')}`; };

export function FolhaPlacar({ visivel, aoFechar, dados, carregando, aoAbrirRanking }: {
  visivel: boolean; aoFechar: () => void; dados: Placar | undefined; carregando: boolean; aoAbrirRanking: () => void;
}) {
  const cores = useIconColors();
  const h = dados?.hoje, se = dados?.semana, m = dados?.mes, rg = dados?.regua, t = dados?.temporada;
  const mesNome = new Date(Date.now() - 3 * 3600000).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' }).toUpperCase();
  return (
    <Painel visivel={visivel} aoFechar={aoFechar} rotulo="Como estou indo" topo={
      <View style={s.fTopo}>
        <View style={{ flex: 1 }}>
          <Text style={s.fTitulo}>Como estou indo</Text>
          <Text style={s.fSubtitulo}>Uma definição por número</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={aoFechar} style={s.fFechar}>
          <IconClose width={20} height={20} fill={cores.muted} />
        </Pressable>
      </View>
    }>
      <ScrollView contentContainerStyle={s.fCorpo}>
        {dados?.sem_carteira ? (
          <Text style={s.semCarteira}>Não há carteira para medir: seu usuário não está ligado a um dono no HubSpot.</Text>
        ) : !h || !se || !m ? (
          carregando ? <ActivityIndicator /> : <Text style={s.fSub}>Placar não medido agora.</Text>
        ) : (
          <>
            <View style={s.fBloco}>
              <Text style={s.fSecao}>HOJE</Text>
              <Linha rot="Visitas provadas" sub={`meta do dia ${h.meta} · sem prova à parte`} valor={`${h.provadas} de ${h.meta}`} />
              <Linha rot="Visitas sem prova" sub="declaradas ou longe do pino · não pontuam" valor={String(h.sem_prova)} fraco />
            </View>
            <View style={s.fBloco}>
              <Text style={s.fSecao}>{`SEMANA · ${ddmm(se.de)} A ${ddmm(new Date(new Date(se.ate).getTime() - 86400000).toISOString())}`}</Text>
              <Linha rot="Visitas provadas" sub={`meta ${se.meta}`} valor={`${se.provadas} de ${se.meta}`} />
              <Linha rot="Demos realizadas" sub="negócio entrou em Demo/Proposta" valor={String(se.demos)} />
              <Linha rot="Contratos" sub="negócio ganho no HubSpot" valor={String(se.contratos)} />
              <Linha rot="Pontos" sub={`meta ${se.meta_pts.toLocaleString('pt-BR')} · piso: 10 provadas e 1 demo`} valor={`${se.pts} · ${se.meta_pts ? Math.round((se.pts / se.meta_pts) * 100) : 0}%`} />
              <Linha rot="Piso da semana" sub={textoDoPiso(dados)?.replace('Piso: ', '') ?? null}
                valor={se.piso_faltam_provadas <= 0 && se.piso_faltam_demos <= 0 ? 'batido' : `faltam ${se.piso_faltam_provadas + se.piso_faltam_demos}`} />
            </View>
            <View style={s.fBloco}>
              <Text style={s.fSecao}>{`MÊS · ${mesNome}`}</Text>
              <Linha rot="Clientes fechados" sub={`meta ${m.meta}`} valor={`${m.fechados} de ${m.meta}`} />
              {m.variavel != null && <Linha rot="Variável" sub={m.por_cliente != null ? `${m.fechados} × ${reais(m.por_cliente)}` : null} valor={reais(m.variavel)} />}
              {m.degrau && <Linha rot="Próximo degrau" sub={`a partir do ${m.degrau.clientes}º, ${reais(m.degrau.por_cliente)} por cliente`} valor={`faltam ${m.degrau.faltam}`} />}
              {m.proxima_venda != null && <Linha rot="A próxima venda" sub="o que ela soma ao variável" valor={`+${reais(m.proxima_venda)}`} />}
            </View>
            {rg && (
              <View style={s.fBloco}>
                <Text style={s.fSecao}>RÉGUA DA EXCELÊNCIA · SEMANA</Text>
                <Linha rot="Próximo passo datado" sub="negócios abertos com data" valor={rg.abertos ? `${rg.com_passo} de ${rg.abertos}` : 'não medido'} fraco={!rg.abertos} />
                <Linha rot="Visita registrada no dia" sub="como foi + próximo passo" valor={rg.visitas_semana ? `${Math.round((rg.visitas_registradas_no_dia / rg.visitas_semana) * 100)}%` : 'não medido'} fraco={!rg.visitas_semana} />
                <Linha rot="Tempo até o 1º toque" sub="lead novo" valor="não medido" fraco />
              </View>
            )}
            {t?.pos ? (
              <Pressable accessibilityRole="button" onPress={aoAbrirRanking} style={[s.fBloco, { gap: 6 }]}>
                <Text style={s.fSecao}>TEMPORADA · SEMANA</Text>
                <Text style={s.fRot}>{`Você está em ${t.pos}º na semana${t.pct != null ? ` · ${Math.round(t.pct)}% da meta` : ''}`}</Text>
                {t.faltam ? <Text style={s.fSub}>{`${t.faltam}${t.proximo ? `: ${t.proximo.replace(/^\w/, (c) => c.toLowerCase())}` : ''}`}</Text> : null}
                <Text style={[s.fRot, { color: 'var(--vermelho-texto)' }]}>Ranking, destaques e conquistas ›</Text>
              </Pressable>
            ) : null}
            <Text style={s.fNota}>
              {`Visita provada: check-in com GPS perto do pino, ou foto. A sem prova aparece à parte e não pontua. Demo realizada: o negócio entrou em Demo/Proposta. Origem: app · agora${dados?.hubspot_em ? `; HubSpot · ${horaDe(dados.hubspot_em)}` : ''}.`}
            </Text>
          </>
        )}
      </ScrollView>
    </Painel>
  );
}

const s = StyleSheet.create({
  fechado: { borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  linha1: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  tracos: { flexDirection: 'row', gap: 4 },
  traco: { width: 12, height: 8, borderRadius: 4, backgroundColor: 'var(--surface-2)' },
  linha1Texto: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  seloAlvo: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center', marginVertical: -8 },
  selo: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, borderColor: 'var(--border)', paddingHorizontal: 9, height: 28 },
  seloTexto: { fontSize: 13, fontWeight: '700', color: 'var(--text)' },
  linha2: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linha2Texto: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  linha2Valor: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  chevron: { fontSize: 20, color: 'var(--text-muted)', marginLeft: 2 },
  semCarteira: { fontSize: 15, fontWeight: '700', color: 'var(--text)' },
  celulas: { flexDirection: 'row', gap: 10 },
  celula: { flex: 1, minWidth: 0, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)', padding: 14, gap: 3, minHeight: 96 },
  celRot: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: 'var(--text-muted)' },
  celValor: { fontSize: 22, fontWeight: '800', color: 'var(--text)' },
  celSub: { fontSize: 12, color: 'var(--text-muted)' },
  fTopo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  fTitulo: { fontSize: 20, fontWeight: '700', color: 'var(--text)' },
  fSubtitulo: { fontSize: 13, color: 'var(--text-muted)' },
  fFechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  fCorpo: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
  fBloco: { borderRadius: 14, borderWidth: 1, borderColor: 'var(--border-soft)', backgroundColor: 'var(--surface)', padding: 14, gap: 10 },
  fSecao: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: 'var(--text-muted)' },
  fLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fRot: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  fSub: { fontSize: 12, color: 'var(--text-muted)' },
  fValor: { fontSize: 17, fontWeight: '800', color: 'var(--text)' },
  fNota: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 17 },
});
