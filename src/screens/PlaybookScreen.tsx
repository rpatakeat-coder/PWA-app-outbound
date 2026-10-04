// Aba Playbook (prompt final, Parte B §B5).
//
// Fonte única: cockpit_config.playbook, pela cockpit-dados?recurso=playbook —
// as mesmas páginas do Cockpit (o executivo recebe sem o capítulo Liderança).
// Mudar uma página no Cockpit muda aqui sem deploy do app.
//
// "Lida" grava em playbook_progresso, o mesmo lugar em que o Cockpit guarda
// (RLS: cada um só escreve a própria linha). O % rolado é conveniência do
// aparelho (localStorage), como a última carga, que sustenta a aba sem sinal.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { IconBook, IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconSearch, useIconColors } from '../components/icons';
import { useLayout } from '../hooks/useLayout';
import {
  buscarObjecoes, cartaoContextual, continuarLendo, filtrarPaginas, objecoesDoPlaybook, rotuloProgresso, sugestoesDaEtapa,
  type Objecao, type PaginaPlaybook, type Playbook, type Progresso,
} from '../utils/playbook';

const CHAVE_CACHE = 'takeat-playbook-cache';
const CHAVE_LIDAS_PENDENTES = 'takeat-playbook-lidas-pendentes';
const chaveProgresso = (email: string) => `takeat-playbook-progresso:${email.toLowerCase()}`;

const ler = <T,>(k: string): T | null => {
  try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
};
const gravar = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* aparelho sem espaço: segue sem cache */ }
};

async function buscarPlaybook(): Promise<Playbook> {
  const { data, error } = await supabase.functions.invoke('cockpit-dados?recurso=playbook', { method: 'GET' });
  if (error) throw error;
  const pb = (data as { playbook?: Playbook } | null)?.playbook;
  if (!pb || !Array.isArray(pb.paginas)) throw new Error('Playbook vazio');
  gravar(CHAVE_CACHE, pb);
  return pb;
}

export type ProximaParada = { nome: string; numero: number; etapa: string | null; dealId?: string | null };

type Props = {
  email: string | null | undefined;
  proximaParada: ProximaParada | null;
};

export default function PlaybookScreen({ email, proximaParada }: Props) {
  const cores = useIconColors();
  const layout = useLayout();
  const duas = layout.ehDesktop;
  const cache = useMemo(() => ler<Playbook>(CHAVE_CACHE), []);
  const { data: pb, isLoading, isError, refetch } = useQuery({
    queryKey: ['playbook'],
    queryFn: buscarPlaybook,
    initialData: cache ?? undefined,
    // O cache do aparelho aparece na hora; a carga do servidor vem por cima.
    initialDataUpdatedAt: 0,
    staleTime: 10 * 60 * 1000,
  });

  const [termo, setTermo] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [aberta, setAberta] = useState<{ id: string; ancora?: string } | null>(null);
  const [resposta, setResposta] = useState<Objecao | null>(null);
  const [biblioteca, setBiblioteca] = useState(false);
  const [prog, setProg] = useState<Progresso>(() => (email ? ler<Progresso>(chaveProgresso(email)) ?? {} : {}));
  // O que o negócio da próxima porta já tem (dor, sistema, celular do decisor):
  // escolhe o cartão do topo. Sem negócio ou sem sinal, fica vazio e o cartão
  // cai em "achar o decisor" ou na etapa.
  const [jaTem, setJaTem] = useState<{ celular?: string; gargalo_operacional?: string; nome_do_sistema?: string }>({});
  const dealDaProxima = proximaParada?.dealId ?? null;
  useEffect(() => {
    setJaTem({});
    if (!dealDaProxima) return;
    let vivo = true;
    void supabase.rpc('mapa_negocio', { p_deal: dealDaProxima }).then(({ data }) => { if (vivo && data) setJaTem(data as never); });
    return () => { vivo = false; };
  }, [dealDaProxima]);

  // "Lida" que o Cockpit já registrou (outro aparelho, a tela do Cockpit).
  useEffect(() => {
    if (!email) return;
    let vivo = true;
    void supabase.from('playbook_progresso').select('guia_slug, tipo, concluido_em')
      .eq('user_email', email.toLowerCase()).eq('tipo', 'leitura')
      .then(({ data }) => {
        if (!vivo || !data?.length) return;
        setProg((p) => {
          const n = { ...p };
          for (const l of data as Array<{ guia_slug: string; concluido_em: string }>) {
            n[l.guia_slug] = { pct: 100, lida: true, em: n[l.guia_slug]?.em ?? Date.parse(l.concluido_em) };
          }
          return n;
        });
      });
    return () => { vivo = false; };
  }, [email]);

  useEffect(() => { if (email) gravar(chaveProgresso(email), prog); }, [email, prog]);

  // SEM SINAL, A "LIDA" ESPERA NA FILA (docs/12 §5): grava no aparelho e sobe quando a rede volta.
  const enviarLidas = useCallback(async () => {
    const pend = ler<Array<{ user_email: string; guia_slug: string; tipo: string; concluido_em: string }>>(CHAVE_LIDAS_PENDENTES) ?? [];
    if (!pend.length) return;
    const { error } = await supabase.from('playbook_progresso').upsert(pend, { onConflict: 'user_email,guia_slug' });
    if (!error) gravar(CHAVE_LIDAS_PENDENTES, []);
  }, []);
  useEffect(() => {
    void enviarLidas();
    if (typeof window === 'undefined') return;
    const on = () => { void enviarLidas(); };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [enviarLidas]);

  const marcarLida = useCallback((id: string) => {
    setProg((p) => (p[id]?.lida ? p : { ...p, [id]: { pct: 100, lida: true, em: Date.now() } }));
    if (!email) return;
    const linha = { user_email: email.toLowerCase(), guia_slug: id, tipo: 'leitura', concluido_em: new Date().toISOString() };
    void supabase.from('playbook_progresso').upsert(linha, { onConflict: 'user_email,guia_slug' }).then(({ error }) => {
      if (!error) return;
      const pend = ler<Array<typeof linha>>(CHAVE_LIDAS_PENDENTES) ?? [];
      gravar(CHAVE_LIDAS_PENDENTES, [...pend.filter((x) => x.guia_slug !== id), linha]);
    });
  }, [email]);

  const anotarRolagem = useCallback((id: string, pct: number) => {
    setProg((p) => {
      const atual = p[id];
      if (atual?.lida || (atual && pct <= atual.pct + 2)) return p;
      return { ...p, [id]: { pct: Math.min(100, pct), em: Date.now() } };
    });
  }, []);

  const objecoes = useMemo(() => (pb ? objecoesDoPlaybook(pb) : []), [pb]);

  if (!pb) {
    return (
      <View style={s.centro}>
        {isLoading ? <ActivityIndicator color="#C8131B" /> : null}
        <Text style={s.vazio}>
          {isError ? 'Não consegui carregar o Playbook. Sem sinal, ele aparece depois da primeira carga.' : 'Abrindo o Playbook salvo…'}
        </Text>
        {isError && (
          <TouchableOpacity accessibilityRole="button" style={s.botaoSec} onPress={() => void refetch()}>
            <Text style={s.botaoSecTexto}>Tentar de novo</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const abrirResposta = (o: Objecao) => { setAberta(null); setResposta(o); marcarLida(o.paginaId); };
  const abrirPagina = (id: string, ancora?: string) => { setResposta(null); setAberta({ id, ancora }); };

  const pagina = aberta ? pb.paginas.find((p) => p.id === aberta.id) ?? null : null;
  const leitor = pagina ? (
    <Leitor
      pagina={pagina}
      ancora={aberta?.ancora}
      progresso={prog[pagina.id]}
      aoVoltar={() => setAberta(null)}
      semVoltar={duas}
      aoAbrir={(id, ancora) => { if (pb.paginas.some((p) => p.id === id)) setAberta({ id, ancora }); }}
      aoRolar={(pct) => anotarRolagem(pagina.id, pct)}
      aoMarcarLida={() => marcarLida(pagina.id)}
    />
  ) : null;
  // Celular: a página ou a resposta ocupam a tela; computador: ficam na coluna da direita.
  if (!duas && leitor) return leitor;

  const buscando = termo.trim().length > 0;
  const objecoesVistas = buscando ? buscarObjecoes(objecoes, termo) : objecoes;
  const lista = filtrarPaginas(pb, termo, categoria);
  const sugeridas = proximaParada && !buscando ? sugestoesDaEtapa(pb, proximaParada.etapa) : [];
  const cartao = proximaParada && !buscando
    ? cartaoContextual(pb, { etapa: proximaParada.etapa, temNegocio: !!proximaParada.dealId, celular: jaTem.celular, gargalo: jaTem.gargalo_operacional, sistema: jaTem.nome_do_sistema })
    : null;
  const outras = cartao ? sugeridas.filter((p) => p.id !== cartao.pagina.id) : sugeridas;
  const continuar = !buscando ? continuarLendo(pb, prog) : null;
  const categorias = pb.categorias.filter((c) => pb.paginas.some((p) => p.categoria === c));
  const lidas = pb.paginas.filter((p) => prog[p.id]?.lida).length;
  const salvo = !!cache || !!pb;

  const respostaVista = resposta ? (
    <ScrollView style={s.tela} contentContainerStyle={s.conteudo}>
      {!duas && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Voltar ao Playbook" style={s.voltar} onPress={() => setResposta(null)}>
          <IconChevronLeft width={24} height={24} fill={cores.onSurface} />
          <Text style={s.voltarTexto}>Playbook</Text>
        </TouchableOpacity>
      )}
      <Text style={s.secao}>O DONO DISSE</Text>
      <Text style={s.respPergunta}>{`“${resposta.pergunta}”`}</Text>
      <View style={s.fala}>
        <Text style={s.falaRotulo}>FALA PRONTA</Text>
        <Text style={s.falaTexto}>{resposta.fala}</Text>
      </View>
      {resposta.seInsistir.length > 0 && (
        <View style={s.bloco}>
          <Text style={s.secao}>SE ELE INSISTIR</Text>
          {resposta.seInsistir.map((f, i) => <Text key={i} style={s.blocoTexto}>{f}</Text>)}
        </View>
      )}
      {!!resposta.diagnostico && (
        <View style={s.bloco}>
          <Text style={s.secao}>POR QUE ELE DIZ ISSO</Text>
          <Text style={s.blocoTexto}>{resposta.diagnostico}</Text>
        </View>
      )}
      {!!resposta.followUp && (
        <View style={s.bloco}>
          <Text style={s.secao}>SE NÃO FECHAR NA HORA · FOLLOW-UP</Text>
          <Text style={s.blocoTexto}>{`“${resposta.followUp}”`}</Text>
        </View>
      )}
      <View style={s.bloco}>
        <Text style={s.secao}>NO REGISTRO DA VISITA</Text>
        <Text style={s.blocoTexto}>Anote qual objeção apareceu. Objeção que se repete no território vira assunto do 1:1.</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" style={s.botaoSec} onPress={() => abrirPagina(resposta.paginaId, resposta.ancora ?? undefined)}>
        <Text style={s.botaoSecTexto}>Ler a página completa</Text>
      </TouchableOpacity>
    </ScrollView>
  ) : null;
  if (!duas && respostaVista) return respostaVista;

  const inicio = (
    <ScrollView style={s.tela} contentContainerStyle={s.conteudo} keyboardShouldPersistTaps="handled">
      <View style={s.busca}>
        <IconSearch width={20} height={20} fill={cores.muted} />
        <TextInput
          style={s.buscaCampo}
          value={termo}
          onChangeText={setTermo}
          placeholder="Qual a objeção? “tá caro”, “já tenho sistema”…"
          placeholderTextColor="var(--text-faint)"
          accessibilityLabel="Buscar uma objeção ou página no Playbook"
        />
        {buscando && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => setTermo('')} style={s.alvo44}>
            <IconClose width={18} height={18} fill={cores.muted} />
          </TouchableOpacity>
        )}
      </View>
      {salvo && (
        <View style={s.salvo}>
          <IconCheck width={14} height={14} fill="var(--tint-green-text)" />
          <Text style={s.salvoTexto}>Salvo no celular · funciona sem sinal</Text>
        </View>
      )}

      {/* CARTÃO DA PRÓXIMA PORTA (§6.16): uma leitura escolhida pelo que falta naquela casa. */}
      {cartao && proximaParada && (
        <View style={s.proxima}>
          <Text style={s.proximaKicker}>{`PRÓXIMA PORTA · ${proximaParada.nome}`.toUpperCase()}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => abrirPagina(cartao.pagina.id)} style={{ gap: 2 }}>
            <Text style={s.proximaTitulo} numberOfLines={2}>{cartao.titulo}</Text>
            <Text style={s.proximaMotivo} numberOfLines={2}>{cartao.motivo}</Text>
          </TouchableOpacity>
          {outras.map((p) => (
            <TouchableOpacity key={p.id} accessibilityRole="button" style={s.proximaLinha} onPress={() => abrirPagina(p.id)}>
              <Text style={s.proximaLinhaTexto} numberOfLines={1}>{p.titulo}</Text>
              <IconChevronRight width={20} height={20} fill="#FFFFFF" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* RESPOSTA ANTES DE BIBLIOTECA (docs/12 §5): as objeções do texto oficial. */}
      {objecoesVistas.length > 0 && (
        <View style={s.grupo}>
          <Text style={s.secao}>O DONO DISSE…</Text>
          {objecoesVistas.map((o) => (
            <TouchableOpacity key={o.id} accessibilityRole="button" style={[s.linha, duas && resposta?.id === o.id && s.linhaSel]} onPress={() => abrirResposta(o)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.linhaTitulo} numberOfLines={2}>{`“${o.curta}”`}</Text>
                <Text style={s.linhaResumo} numberOfLines={1}>{o.fala}</Text>
              </View>
              <IconChevronRight width={20} height={20} fill={cores.muted} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {buscando && (
        <View style={s.grupo}>
          <Text style={s.secao}>PÁGINAS</Text>
          {lista.length === 0 && objecoesVistas.length === 0 && (
            <Text style={s.vazio}>{`Nada para “${termo.trim()}”. Tente uma palavra do dono: caro, sistema, internet, pequeno.`}</Text>
          )}
          {lista.map((p) => <LinhaPagina key={p.id} pagina={p} rotulo={rotuloProgresso(prog[p.id])} aoAbrir={() => abrirPagina(p.id)} />)}
        </View>
      )}

      {!buscando && (
        <View style={s.grupo}>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: biblioteca }} style={s.bibCabeca} onPress={() => setBiblioteca((v) => !v)}>
            <IconBook width={20} height={20} fill={cores.onSurface} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.linhaTitulo}>Biblioteca</Text>
              <Text style={s.linhaResumo}>{`${pb.paginas.length} páginas · ${lidas} lidas`}</Text>
            </View>
            <Text style={s.bibAcao}>{biblioteca ? 'fechar' : 'abrir'}</Text>
          </TouchableOpacity>
          {biblioteca && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
                {[null, ...categorias].map((c) => {
                  const ativo = categoria === c;
                  return (
                    <TouchableOpacity key={c ?? 'todas'} accessibilityRole="button" accessibilityState={{ selected: ativo }}
                      style={[s.chip, ativo && s.chipAtivo]} onPress={() => setCategoria(c)}>
                      <Text style={[s.chipTexto, ativo && s.chipTextoAtivo]}>{c ?? 'Todas'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {continuar && (
                <TouchableOpacity accessibilityRole="button" style={s.continuar} onPress={() => abrirPagina(continuar.pagina.id)}>
                  <Text style={s.secao}>CONTINUAR LENDO</Text>
                  <Text style={s.linhaTitulo} numberOfLines={1}>{continuar.pagina.titulo}</Text>
                  <View style={s.barra}><View style={[s.barraCheia, { width: `${continuar.pct}%` }]} /></View>
                </TouchableOpacity>
              )}
              {(categoria ? [categoria] : categorias).map((cat) => {
                const doGrupo = lista.filter((p) => p.categoria === cat);
                if (!doGrupo.length) return null;
                return (
                  <View key={cat} style={s.grupo}>
                    <Text style={s.secao}>{cat.toUpperCase()}</Text>
                    {doGrupo.map((p) => (
                      <LinhaPagina key={p.id} pagina={p} rotulo={rotuloProgresso(prog[p.id])} aoAbrir={() => abrirPagina(p.id)} />
                    ))}
                  </View>
                );
              })}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );

  if (!duas) return inicio;
  // Computador (P1): perguntas à esquerda, resposta (ou página) à direita.
  const direita = respostaVista ?? leitor;
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ width: layout.largura >= 1500 ? 420 : 380, borderRightWidth: 1, borderRightColor: 'var(--border)' }}>{inicio}</View>
      <View style={{ flex: 1 }}>
        {direita ?? (
          <View style={s.centro}>
            <Text style={s.vazio}>Escolha uma objeção ou uma página à esquerda.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function LinhaPagina({ pagina, rotulo, aoAbrir }: { pagina: PaginaPlaybook; rotulo: string | null; aoAbrir: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" style={s.linha} onPress={aoAbrir}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.linhaTitulo} numberOfLines={2}>{pagina.titulo}</Text>
        {!!pagina.resumo && <Text style={s.linhaResumo} numberOfLines={1}>{pagina.resumo}</Text>}
      </View>
      {rotulo && <Text style={[s.linhaProg, rotulo.startsWith('lida') && s.linhaProgLida]}>{rotulo}</Text>}
    </TouchableOpacity>
  );
}

// CSS do texto oficial, preso ao leitor. As cores vêm dos tokens do app, para
// os dois temas; tabela larga rola dentro dela, nunca a tela.
const CSS_LEITOR = `
.pb-leitor{font-size:16px;line-height:1.6;color:var(--text);overflow-wrap:anywhere}
.pb-leitor > h1:first-child{display:none}
.pb-leitor h1,.pb-leitor h2{font-size:20px;line-height:1.3;font-weight:700;margin:28px 0 8px}
.pb-leitor h3,.pb-leitor h4{font-size:17px;line-height:1.35;font-weight:700;margin:22px 0 6px}
.pb-leitor p,.pb-leitor ul,.pb-leitor ol{margin:0 0 14px}
.pb-leitor ul,.pb-leitor ol{padding-left:22px}
.pb-leitor li{margin-bottom:6px}
.pb-leitor blockquote{margin:0 0 16px;padding:12px 14px;border-left:3px solid #C8131B;background:var(--bg);border-radius:0 8px 8px 0;color:var(--text-muted)}
.pb-leitor hr{border:0;border-top:1px solid var(--border);margin:24px 0}
.pb-leitor code{font-size:14px;background:var(--bg);padding:1px 5px;border-radius:4px}
.pb-leitor table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse;margin:0 0 16px;font-size:14px}
.pb-leitor th,.pb-leitor td{border:1px solid var(--border);padding:8px 10px;text-align:left;vertical-align:top;min-width:120px}
.pb-leitor th{background:var(--bg);font-weight:700}
.pb-leitor a{color:#C8131B}
.pb-leitor .pb-ir{display:inline-flex;align-items:center;min-height:36px;margin:2px 0;padding:6px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text);font:inherit;font-size:14px;cursor:pointer}
`;

function Leitor({ pagina, ancora, progresso, aoVoltar, aoAbrir, aoRolar, aoMarcarLida, semVoltar = false }: {
  pagina: PaginaPlaybook;
  /** Computador: o leitor mora na coluna da direita, sem o Voltar. */
  semVoltar?: boolean;
  ancora?: string;
  progresso: Progresso[string] | undefined;
  aoVoltar: () => void;
  aoAbrir: (id: string, ancora?: string) => void;
  aoRolar: (pct: number) => void;
  aoMarcarLida: () => void;
}) {
  const cores = useIconColors();
  const rolagem = useRef<ScrollView>(null);
  const corpo = useRef<HTMLDivElement | null>(null);
  const [pct, setPct] = useState(0);

  // Página nova (inclusive vinda de um botão de dentro do texto): começa no
  // topo ou na âncora pedida.
  useEffect(() => {
    setPct(0);
    const t = setTimeout(() => {
      const alvo = ancora ? corpo.current?.querySelector(`[id="${CSS.escape(ancora)}"]`) : null;
      if (alvo) (alvo as HTMLElement).scrollIntoView({ block: 'start' });
      else rolagem.current?.scrollTo({ y: 0, animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, [pagina.id, ancora]);

  // Os botões do texto oficial (data-pb-ir + data-pb-ancora) e os links de
  // âncora (#…) levam a outra página ou a outro trecho — como no Cockpit.
  const aoClicarNoTexto = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('[data-pb-ir],[data-pb-page],a[href^="#"]') as HTMLElement | null;
    if (!el) return;
    e.preventDefault();
    const id = el.getAttribute('data-pb-ir') ?? el.getAttribute('data-pb-page');
    if (id) { aoAbrir(id, el.getAttribute('data-pb-ancora') ?? undefined); return; }
    const alvo = (el.getAttribute('href') ?? '').slice(1);
    const aqui = corpo.current?.querySelector(`[id="${CSS.escape(alvo)}"]`);
    if (aqui) (aqui as HTMLElement).scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const lida = !!progresso?.lida;
  return (
    <View style={s.tela}>
      <View style={s.leitorTopo}>
        {!semVoltar && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Voltar ao Playbook" style={s.voltar} onPress={aoVoltar}>
            <IconChevronLeft width={24} height={24} fill={cores.onSurface} />
            <Text style={s.voltarTexto}>Playbook</Text>
          </TouchableOpacity>
        )}
        <View style={s.barra}><View style={[s.barraCheia, { width: `${lida ? 100 : pct}%` }]} /></View>
      </View>
      <ScrollView
        ref={rolagem}
        style={{ flex: 1 }}
        contentContainerStyle={s.leitorConteudo}
        scrollEventThrottle={200}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const total = contentSize.height - layoutMeasurement.height;
          const p = total > 0 ? Math.round((contentOffset.y / total) * 100) : 100;
          setPct(p);
          aoRolar(p);
        }}
      >
        <Text style={s.leitorCategoria}>{`${pagina.categoria.toUpperCase()}${pagina.formato ? ` · ${pagina.formato}` : ''}`}</Text>
        <Text style={s.leitorTitulo}>{pagina.titulo}</Text>
        {!!pagina.resumo && <Text style={s.leitorResumo}>{pagina.resumo}</Text>}
        <style>{CSS_LEITOR}</style>
        {/* Conteúdo do Cockpit (cockpit_config, escrito pelo time), não do usuário. */}
        <div ref={corpo} className="pb-leitor" onClick={aoClicarNoTexto} dangerouslySetInnerHTML={{ __html: pagina.html ?? '' }} />
        <TouchableOpacity
          accessibilityRole="button"
          disabled={lida}
          style={[s.botaoLida, lida && s.botaoLidaFeito]}
          onPress={aoMarcarLida}
        >
          {lida && <IconCheck width={18} height={18} fill="var(--tint-green-text)" />}
          <Text style={[s.botaoLidaTexto, lida && s.botaoLidaTextoFeito]}>{lida ? 'Lida' : 'Marcar como lida'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: 'var(--bg)' },
  conteudo: { padding: 16, paddingBottom: 32, gap: 16 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: 'var(--bg)' },
  subtitulo: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)' },
  busca: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingLeft: 14, paddingRight: 4,
    borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)',
  },
  buscaCampo: { flex: 1, minWidth: 0, fontSize: 16, color: 'var(--text)', paddingVertical: 12, outlineStyle: 'none' } as never,
  alvo44: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 8, paddingRight: 16 },
  chip: {
    minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999,
    borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)',
  },
  chipAtivo: { backgroundColor: 'var(--vermelho-acao)', borderColor: 'var(--vermelho-acao)' },
  chipTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text-muted)' },
  chipTextoAtivo: { color: '#FFFFFF' },
  proxima: { backgroundColor: '#5B0A10', borderRadius: 16, padding: 16, gap: 8 },
  proximaKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--vermelho-texto)' },
  proximaMotivo: { fontSize: 13, lineHeight: 18, color: '#FECACA' },
  proximaTitulo: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: '#FFFFFF' },
  proximaLinha: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)',
  },
  proximaLinhaTexto: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  continuar: {
    padding: 16, gap: 8, borderRadius: 16, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface)',
  },
  secao: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--text-faint)' },
  grupo: { gap: 8 },
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border-soft)',
  },
  linhaTitulo: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: 'var(--text)' },
  linhaResumo: { fontSize: 13, lineHeight: 18, color: 'var(--text-muted)', marginTop: 2 },
  linhaProg: { fontSize: 12, fontWeight: '700', color: 'var(--text-muted)' },
  linhaProgLida: { color: 'var(--tint-green-text)' },
  barra: { height: 4, borderRadius: 2, backgroundColor: 'var(--border)', overflow: 'hidden' },
  barraCheia: { height: 4, backgroundColor: 'var(--vermelho-acao)' },
  vazio: { fontSize: 14, lineHeight: 20, color: 'var(--text-muted)', textAlign: 'center' },
  botaoSec: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'var(--border)' },
  botaoSecTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  leitorTopo: { paddingHorizontal: 8, paddingBottom: 8, gap: 4, backgroundColor: 'var(--surface)', borderBottomWidth: 1, borderBottomColor: 'var(--border)' },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, alignSelf: 'flex-start', paddingRight: 12 },
  voltarTexto: { fontSize: 15, fontWeight: '600', color: 'var(--text)' },
  leitorConteudo: { padding: 16, paddingBottom: 40, backgroundColor: 'var(--surface)', minHeight: '100%' as never },
  leitorCategoria: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--vermelho-texto)' },
  leitorTitulo: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: 'var(--text)', marginTop: 6 },
  leitorResumo: { fontSize: 15, lineHeight: 22, color: 'var(--text-muted)', marginTop: 8, marginBottom: 8 },
  botaoLida: { marginTop: 24, minHeight: 48, borderRadius: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--vermelho-acao)' },
  salvo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8 },
  salvoTexto: { fontSize: 12, color: 'var(--text-muted)' },
  linhaSel: { borderColor: 'var(--vermelho-acao)', backgroundColor: 'var(--tint-red)' },
  respPergunta: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: 'var(--text)' },
  fala: { padding: 16, gap: 6, borderRadius: 16, backgroundColor: 'var(--tint-red)', borderWidth: 1.5, borderColor: 'var(--vermelho-acao)' },
  falaRotulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: 'var(--vermelho-texto)' },
  falaTexto: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: 'var(--text)' },
  bloco: { padding: 14, gap: 6, borderRadius: 14, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border-soft)' },
  blocoTexto: { fontSize: 15, lineHeight: 22, color: 'var(--text)' },
  bibCabeca: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'var(--surface)', borderWidth: 1, borderColor: 'var(--border)' },
  bibAcao: { fontSize: 14, fontWeight: '600', color: 'var(--text-muted)' },
  botaoLidaFeito: { backgroundColor: 'var(--tint-green)' },
  botaoLidaTexto: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  botaoLidaTextoFeito: { color: 'var(--tint-green-text)' },
});
