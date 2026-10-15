// Registro de visita do app de campo v4.1 (handoff §6.4), enxugado em 14/10/26 pelo handoff
// "app menos tela" (design_handoff_app_menos_tela). Folha de baixo depois do Cheguei.
//
// Três toques: 1 · Como foi? → 2 · E agora? → Salvar visita. O que muda desde 14/10:
//   - UM DADO SE PEDE UMA VEZ. Quem decide, papel, celular, maior dor e sistema chegam do
//     negócio (mapa_negocio + leitura ao vivo), da última ficha e do cadastro, e aparecem como
//     fato com a origem e "corrigir". Só a lacuna vira campo.
//   - REGISTRAR NUNCA TRAVA. O que a etapa seguinte exige é aviso embaixo do botão: a visita
//     grava, a etapa fica onde está. Antes o Salvar travava e o time escrevia "." no sistema.
//   - "Apresentei agora" (a demo feita na hora: plano + MRR, reunião = hoje) sobe os degraus
//     até Demo/Proposta no mesmo toque, um por vez como o servidor aceita; e "Reunião hoje,
//     mais tarde" pede só a hora.
//   - Saíram da ficha: horário do decisor, tipo de casa, foto e nome do lugar (o gestor não
//     usa na praça; ficam no cadastro e no Cockpit). A foto de prova do check-in continua.
//
// Salvar manda tudo pela porta única do Cockpit (negocio-acao), 5 s depois, para o Desfazer
// valer; se a página fechar nesse meio-tempo, vai para a fila offline.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Client } from '../types/client';
import { enfileirar, ehErroDeRede, novoAcaoId } from '../utils/filaOffline';
import {
  AJUDA_MOTIVO, COMO_FOI, DIAS_VOLTA, ETAPA, FICHA_VAZIA, GARGALOS, GARGALO_OUTRA, HORARIOS, HORAS_REUNIAO_HOJE, MAX_O_QUE_PESOU, MOTIVOS_PERDIDO,
  MOTIVOS_QUE_EXIGEM_TEXTO, PICKLIST, ROTULO_ETAPA, ROTULO_PROP, SISTEMAS,
  PROXIMOS_PARA_NEGOCIACAO, degrausDaFicha, dorDaFicha, ehVolta, escadaAte, etapaSugerida, horaLivre, notaDaVisita, opcoesAgora, papelDaFicha, papelParaHubspot,
  proximoDiaUtil, proximoPassoDaFicha, rotuloSalvar, valorValido,
  type Ficha,
} from '../utils/fichaDeRua';
import { armasConhecidas, nomeDoSistema, sistemaParaGravar, type FichaArmas } from '../utils/armasDaDemo';
import { ehRecusa, negocioAcao } from '../utils/negocioAcao';
import { supabase } from '../integrations/supabase/client';
import { enviarFoto } from '../utils/fotoVisita';
import { gravarFichaNoBanco, linhaDaFicha, type LinhaFicha } from '../utils/fichaNoBanco';
import { CampoData } from '../components/CampoData';
import { IconClose as SiClose, IconCheck as SiCheck, IconChevronDown as SiDown } from '../components/icons';

export type CamposCadastro = { empresa?: string; telefone?: string; categoria?: string };

type Props = {
  visivel: boolean;
  client: Client;
  checkinEm: string;           // ISO do check-in
  etapaAtual: string | null;   // código canônico
  primeiraVisita: boolean;
  proxima: { numero: number; nome: string; client: Client } | null;
  onFechar: () => void;
  onProxima: (c: Client) => void;
  /** Grava o telefone no lead (mesmo caminho do cadastro). */
  onSalvarCadastro: (campos: CamposCadastro) => Promise<void>;
  /** Etapa mudou no HubSpot: o app põe o rótulo no lead para a letra do pino mudar na hora. */
  onEtapaMudou: (codigo: string) => void;
  /** "Ver na Agenda": abre a Agenda no dia do próximo passo (ou hoje). */
  onAgenda?: (dia: string | null) => void;
  /** "Fechou" na visita de retorno: depois de salvar, abre Emitir cobrança (o negócio já em Negociação). */
  onEmitirCobranca?: () => void;
  /** Visita declarada (0109): o chip diz isso, não "GPS confere". */
  declarada?: boolean;
  /** Foto de prova (GPS falhou) que não subiu no check-in: sobe junto com a visita. */
  fotoProva?: Blob | null;
  /** A foto de prova já subiu no check-in: a ficha grava com_foto mesmo sem foto nova. */
  fotoNoCheckin?: boolean;
  /** id_hubspot de quem registra (pasta da foto e dono no Cockpit). */
  ownerId?: string | null;
  /** Negócio de COLEGA: o próximo passo vira tarefa do dono, na Agenda dele (28/09/2026). */
  donoColega?: string | null;
};

type Resultado = { rotulo: string; estado: 'ok' | 'fila' | 'falhou' | 'pulado'; detalhe?: string };
type Envio = { corpo: Record<string, unknown>; rotulo: string; etapa?: string; rota?: 'hubspot-sync' };
/** O que já se sabe do restaurante, e de onde veio (a origem aparece embaixo do valor). */
type Sabido = {
  negocio: Record<string, unknown>;
  etapa: string | null;
  decisor: string; decisorDe: string; papel: string;
  celular: string; celularDe: string;
  dor: string; dorDe: string;
  sistema: string; sistemaDe: string;
  plano: string; mrr: string;
  /** melhor horário do decisor já sabido (faixa ou texto): a ficha não pergunta mais */
  horario: string;
  /** o negócio foi lido (snapshot ou ao vivo)? sem isso, nada do que se sabia vai ao HubSpot */
  lido: boolean;
  /** a leitura terminou (lida ou estourou o prazo)? antes disso a ficha ainda está lendo */
  carregado: boolean;
};
type Campo = 'decisor' | 'celular' | 'dor' | 'sistema';

const hojeBRT = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const diaMes = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
const ddmm = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '');
const JANELA_DESFAZER_MS = 5000;
/** a hora de agora em Brasília, "HH:MM" (reunião de hoje só para frente) */
const agoraHHMM = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(11, 16);
/* rede ruim na rua: o que não chegou em 4 s não segura a ficha — ela abre com o que tem */
const comPrazo = <T,>(p: PromiseLike<T>, ms: number, padrao: T): Promise<T> =>
  Promise.race([Promise.resolve(p).catch(() => padrao), new Promise<T>((r) => setTimeout(() => r(padrao), ms))]);

function montarSabido(client: Client, negocio: Record<string, unknown>, fichas: FichaArmas[], lido = false, carregado = false): Sabido {
  const a = armasConhecidas(negocio, fichas);
  const ord = [...fichas].sort((x, y) => (y.ocorrido_em ?? '').localeCompare(x.ocorrido_em ?? ''));
  const deFicha = (k: keyof FichaArmas, v: string) => {
    const f = ord.find((x) => String(x[k] ?? '').trim() === v);
    return f ? `da ficha de ${ddmm(f.ocorrido_em)}` : 'do negócio';
  };
  const empresa = client.empresa?.trim() ?? '';
  const contato = client.nome?.trim() ?? '';
  /* o "Nome do contato" do cadastro é quem a pessoa encontrou: vale como quem decide até alguém dizer outro */
  const pareceGente = valorValido(contato) && !/ainda|n[aã]o |tenho|sei|verific|teste|\?|^-+$/i.test(contato);
  const decisorCadastro = empresa && contato && pareceGente && contato.toLowerCase() !== empresa.toLowerCase() ? contato : '';
  const decisor = valorValido(a.decisor) ? a.decisor : decisorCadastro;
  const celNeg = valorValido(negocio.celular) ? String(negocio.celular) : '';
  const sistema = valorValido(a.sistema) ? a.sistema : '';
  const dor = valorValido(a.dor) ? a.dor : '';
  const plano = String(negocio.plano_apresentado ?? '');
  return {
    negocio,
    etapa: valorValido(negocio.dealstage) ? String(negocio.dealstage) : null,
    decisor, decisorDe: valorValido(a.decisor) ? (ord.some((f) => String(f.decisor_nome ?? '').trim() === a.decisor) ? deFicha('decisor_nome', a.decisor) : 'do negócio') : 'do cadastro',
    papel: decisor && decisor === a.decisor ? a.papel : '',
    celular: celNeg || client.telefone?.trim() || '', celularDe: celNeg ? 'do negócio' : 'do cadastro',
    dor, dorDe: dor ? deFicha('dor', dor) : '',
    sistema, sistemaDe: sistema ? deFicha('sistema', sistema) : '',
    plano: (PICKLIST.plano_apresentado ?? []).includes(plano) ? plano : '',
    mrr: valorValido(negocio.valor_de_mrr) ? String(negocio.valor_de_mrr) : '',
    horario: a.horario,
    lido,
    carregado,
  };
}

export default function FichaDeRua({ visivel, client, checkinEm, etapaAtual, primeiraVisita, proxima, onFechar, onProxima, onSalvarCadastro, onEtapaMudou, onAgenda, onEmitirCobranca, declarada = false, ownerId = null, fotoProva = null, fotoNoCheckin = false, donoColega = null }: Props) {
  const [f, setF] = useState<Ficha>(FICHA_VAZIA);
  const [opcao, setOpcao] = useState<string | null>(null);
  const [completar, setCompletar] = useState(false);
  const [corrigindo, setCorrigindo] = useState<Partial<Record<Campo, boolean>>>({});
  const [outroSistema, setOutroSistema] = useState(false);
  const [outraDataVolta, setOutraDataVolta] = useState(false);
  const [outraHora, setOutraHora] = useState(false);
  const [horaTexto, setHoraTexto] = useState('');
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [sabido, setSabido] = useState<Sabido | null>(null);
  const [fase, setFase] = useState<'form' | 'desfazer' | 'enviando' | 'salvo'>('form');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [passoSalvo, setPassoSalvo] = useState<{ data: string; texto: string; virouTarefa: boolean } | null>(null);
  /* a visita de retorno já abre com "falei com quem decide" marcado; tocou no "Como foi", o app não marca mais */
  const tocouComoFoi = useRef(false);
  const [comoFoiAuto, setComoFoiAuto] = useState(false);
  const pendente = useRef<{ campos: CamposCadastro; envios: Envio[]; foto: Blob | null; linha: LinhaFicha | null; timer: ReturnType<typeof setTimeout> } | null>(null);

  const nome = client.empresa?.trim() || client.nome || 'Lead';
  const temTelefone = !!client.telefone?.trim();
  const dealId = client.id_hubspot ? String(client.id_hubspot) : null;

  useEffect(() => {
    if (!visivel) return;
    setF(FICHA_VAZIA); setOpcao(null); setCompletar(false); setCorrigindo({}); setOutroSistema(false); setOutraDataVolta(false);
    setOutraHora(false); setHoraTexto(''); setConfirmarSaida(false); setFase('form'); setResultados([]); setPassoSalvo(null);
    tocouComoFoi.current = false; setComoFoiAuto(false);
    /* O QUE JÁ SE SABE, nas três fontes, cada uma com prazo: o negócio (snapshot do Cockpit e
       leitura ao vivo, que traz a etapa real), as fichas de visita e o cadastro */
    let vivo = true;
    setSabido(montarSabido(client, {}, []));
    const snap = dealId
      ? comPrazo(supabase.rpc('mapa_negocio', { p_deal: dealId }).then(({ data }) => (data as Record<string, unknown>) ?? {}), 4000, {} as Record<string, unknown>)
      : Promise.resolve({} as Record<string, unknown>);
    const aoVivo = dealId && client.vendedor_id_hubspot
      ? comPrazo(supabase.functions.invoke('hubspot-sync', { body: { type: 'ler_negocio', id_hubspot: dealId, owner_id: String(client.vendedor_id_hubspot) } })
        .then(({ data }) => ((data as { propriedades?: Record<string, unknown> } | null)?.propriedades ?? {})), 4000, {} as Record<string, unknown>)
      : Promise.resolve({} as Record<string, unknown>);
    const fichas = client.id
      ? comPrazo(supabase.from('fichas_de_rua').select('ocorrido_em, decisor_nome, decisor_papel, horario_dono, sistema, dor')
        .eq('client_id', client.id).order('ocorrido_em', { ascending: false }).limit(10)
        .then(({ data }) => (data ?? []) as FichaArmas[]), 4000, [] as FichaArmas[])
      : Promise.resolve([] as FichaArmas[]);
    void Promise.all([snap, aoVivo, fichas]).then(([sn, av, fs]) => {
      if (vivo) setSabido(montarSabido(client, { ...sn, ...av }, fs, Object.keys(sn).length > 0 || Object.keys(av).length > 0, true));
    });
    return () => { vivo = false; };
  }, [visivel, client.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (x: Partial<Ficha>) => setF((a) => ({ ...a, ...x }));
  const hoje = hojeBRT();
  const etapaReal = sabido?.etapa ?? etapaAtual;

  /* O VALOR QUE VALE de cada campo: o digitado agora, senão o que já se sabia */
  /* quem decide NÃO ESTAVA: o contato do cadastro não é resposta (o alerta "saia com o nome" fica) */
  const decisorSabido = f.comoFoi === 'decisor_ausente' && sabido?.decisorDe === 'do cadastro' ? '' : sabido?.decisor || '';
  const decisorEf = f.decisor.trim() || decisorSabido;
  /* nome corrigido não herda o papel de quem estava antes */
  const papelEf = f.decisor.trim() ? papelDaFicha(f) : (papelDaFicha(f) || (decisorSabido ? sabido?.papel || '' : ''));
  const sistemaEf = f.sistema.trim() || sabido?.sistema || '';
  const dorDigitada = dorDaFicha(f);
  const dorEf = dorDigitada || sabido?.dor || '';
  const dorEnum = (GARGALOS as readonly string[]).includes(dorEf) ? dorEf : '';
  const dorLivre = dorEnum ? '' : dorEf;
  const celularEf = f.telefone.trim() || sabido?.celular || '';
  const planoEf = f.plano;
  const mrrEf = f.mrr.trim();
  const fEf: Ficha = { ...f, decisor: decisorEf, sistema: sistemaEf, dor: (dorEnum || null) as Ficha['dor'], dorOutra: dorLivre ? dorLivre : null,
    papel: (['Dono', 'Gerente', 'Sócio'].includes(papelEf) ? papelEf : (papelEf ? 'Outro' : null)) as Ficha['papel'], papelOutro: ['Dono', 'Gerente', 'Sócio'].includes(papelEf) ? '' : papelEf,
    ...(sabido?.horario ? (HORARIOS.some((h) => h.hs && h.valor === sabido.horario)
      ? { horario: sabido.horario as Ficha['horario'] } : { horario: 'outro' as Ficha['horario'], horarioOutro: sabido.horario }) : {}) };

  /* OS DEGRAUS: "Apresentei agora" sobe até Demo, um por vez; o resto, a etapa sugerida de sempre */
  const apresentei = f.proximo === 'apresentei';
  /* "Fechou" e "Negociando" (visita de retorno, negócio em Demo) também pedem plano e MRR: vão a Negociação */
  const paraNegociacao = !!f.proximo && PROXIMOS_PARA_NEGOCIACAO.includes(f.proximo);
  const pedePlano = apresentei || paraNegociacao;
  const alvoFinal = apresentei ? ETAPA.demo : paraNegociacao ? ETAPA.negociacao : null;
  const degraus = useMemo(() => {
    if (!dealId || !f.comoFoi || !f.proximo) return [] as string[];
    /* sem o negócio lido não se sabe a etapa real nem o que ele tem: a visita grava, a etapa espera */
    if (!sabido?.lido) return [] as string[];
    if (alvoFinal) return escadaAte(etapaReal, alvoFinal);
    const sug = etapaSugerida({ atual: etapaReal, comoFoi: f.comoFoi, proximo: f.proximo, primeiraVisita });
    return sug ? [sug] : [];
  }, [dealId, f.comoFoi, f.proximo, alvoFinal, etapaReal, primeiraVisita, sabido?.lido]);
  const digitado = new Set<string>([
    ...(f.telefone.trim() ? ['celular'] : []), ...(dorDigitada ? ['gargalo_operacional'] : []), ...(f.sistema.trim() ? ['nome_do_sistema'] : []),
    /* plano/MRR contam como "dito agora" só se mudaram em relação ao negócio */
    ...(f.plano && f.plano !== sabido?.plano ? ['plano_apresentado'] : []), ...(f.mrr.trim() && f.mrr.trim() !== sabido?.mrr ? ['valor_de_mrr'] : []), 'motivo_do_perdido',
  ]);
  const plano = degrausDaFicha({
    degraus, negocio: sabido?.negocio ?? {}, digitado, dorLivre, hoje, motivoTexto: f.motivoTexto, negocioLido: !!sabido?.lido,
    valores: {
      celular: celularEf, gargalo_operacional: dorEnum, nome_do_sistema: sistemaParaGravar(sistemaEf), motivo_do_perdido: f.motivoPerdido ?? '',
      plano_apresentado: planoEf, valor_de_mrr: mrrEf,
    },
  });
  const ultimo = plano.vai.length ? plano.vai[plano.vai.length - 1].etapa : null;
  const vaiAoAlvo = !!alvoFinal && ultimo === alvoFinal;
  const faltaTexto = plano.falta.map((k) => ROTULO_PROP[k] ?? k);
  const juntar = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}` : xs[0] ?? '');

  const salvar = rotuloSalvar(f);
  const toque = 1 + (f.comoFoi ? 1 : 0) + (f.proximo ? 1 : 0);
  const passoPrevisto = proximoPassoDaFicha(fEf, hoje);
  /* Completar agora: quem decide, celular, dor e sistema — "N de 4 já sabidos" */
  const sabidos = [decisorEf, celularEf, dorEf, sistemaEf].filter(Boolean).length;
  const aviso = !!plano.paraEm && !!f.comoFoi && !!f.proximo;
  /* a etapa não vai mudar e a pessoa precisa saber por quê */
  const querSubir = !!dealId && !!f.comoFoi && !!f.proximo && (!!alvoFinal || !!etapaSugerida({ atual: etapaReal, comoFoi: f.comoFoi, proximo: f.proximo, primeiraVisita }));
  const avisoLeitura = querSubir && !sabido?.lido
    ? (sabido?.carregado ? 'Não consegui ler o negócio no HubSpot: a visita grava, a etapa fica onde está' : 'Lendo o negócio no HubSpot…')
    : (!!alvoFinal && !ultimo && !plano.paraEm && !!f.proximo ? `A etapa fica em ${ROTULO_ETAPA[etapaReal ?? ''] ?? 'onde está'}` : null);
  const legenda = !f.comoFoi || !f.proximo
    ? 'Escolha como foi e o que vem agora'
    : avisoLeitura
      ? avisoLeitura
    : aviso
      ? `Falta ${juntar(faltaTexto)} para ir a ${ROTULO_ETAPA[alvoFinal ?? plano.paraEm as string]} · salvo a visita mesmo assim`
      : f.proximo === 'reuniao' && f.diasReuniao === 0 && !f.horaReuniao
        ? 'Escolha a hora da reunião'
        : ehVolta(f.proximo) && !f.dataVolta
          ? 'Escolha o dia da volta'
          : f.proximo === 'sem_interesse'
            ? (!f.motivoPerdido ? 'Escolha o motivo'
              : MOTIVOS_QUE_EXIGEM_TEXTO.includes(f.motivoPerdido) && !f.motivoTexto.trim() ? 'Escreva o que pesou' : 'O negócio vai para Perdido, com o motivo')
            : apresentei
              ? (vaiAoAlvo ? 'Grava visita e etapa juntos · Desfazer por 5 s' : 'Grava a visita e o retorno da proposta')
              : f.proximo === 'fechou'
                ? (vaiAoAlvo || etapaReal === ETAPA.negociacao ? 'Depois de salvar, a cobrança abre aqui' : 'Grava a visita; a cobrança pede o negócio em Negociação')
              : passoPrevisto
                // negócio de colega: a tarefa é do dono no HubSpot — dizer isso, não "vai para a Agenda"
                ? `${passoPrevisto.texto} ${passoPrevisto.data === hoje ? `hoje${passoPrevisto.hora ? ` às ${passoPrevisto.hora}` : ''}` : `em ${diaMes(passoPrevisto.data)}`} vai para a Agenda ${donoColega ? `de ${donoColega} (dono do negócio)` : ''}`.trim()
                : 'Salva a visita no HubSpot e no Cockpit';

  function escolherComoFoi(id: Ficha['comoFoi']) {
    tocouComoFoi.current = true; setComoFoiAuto(false);
    set({ comoFoi: id, proximo: null, diasReuniao: null, horaReuniao: null, motivoPerdido: null, motivoTexto: '', dataVolta: null });
    setOpcao(null); setOutraDataVolta(false); setOutraHora(false);
    // Maior ralo do funil: visita que não chega em quem decide. Sai com o nome.
    if (id === 'decisor_ausente') setCompletar(true);
  }

  /* A VISITA DE RETORNO (Julyan, 14/10/26): quem decide já é conhecido (do negócio ou de uma
     ficha, nunca só do cadastro) e não é a 1ª visita → o "Como foi" já vem em "Falei com <nome>".
     O executivo troca com um toque se não foi isso. */
  const decisorConhecido = !!sabido?.lido && !!sabido.decisor && sabido.decisorDe !== 'do cadastro';
  useEffect(() => {
    if (!visivel || primeiraVisita || !decisorConhecido || tocouComoFoi.current || f.comoFoi) return;
    set({ comoFoi: 'falou_com_decisor' });
    setComoFoiAuto(true);
  }, [visivel, primeiraVisita, decisorConhecido]); // eslint-disable-line react-hooks/exhaustive-deps

  /* tocou "Apresentei/Fechou/Negociando" antes do negócio carregar: plano e MRR chegam quando ele chega
     (só se a pessoa ainda não escreveu nada) */
  useEffect(() => {
    if (!pedePlano || !sabido?.lido) return;
    if (!f.plano && sabido.plano) set({ plano: sabido.plano });
    if (!f.mrr && sabido.mrr) set({ mrr: sabido.mrr });
  }, [sabido?.lido, pedePlano]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(e: Envio, lista: Resultado[]): Promise<boolean> {
    if (e.rota === 'hubspot-sync') {
      try {
        const { error } = await supabase.functions.invoke('hubspot-sync', { body: e.corpo });
        if (error) throw error;
        lista.push({ rotulo: e.rotulo, estado: 'ok' });
        return true;
      } catch (err) {
        lista.push({ rotulo: e.rotulo, estado: 'falhou', detalhe: String((err as Error)?.message ?? err) });
        return false;
      }
    }
    try {
      await negocioAcao(e.corpo);
      lista.push({ rotulo: e.rotulo, estado: 'ok' });
      return true;
    } catch (err) {
      if (ehErroDeRede(err)) {
        await enfileirar({ acaoId: novoAcaoId(), tipo: 'negocio', rotulo: `${e.rotulo} · ${nome}`, payload: { corpo: e.corpo } });
        lista.push({ rotulo: e.rotulo, estado: 'fila', detalhe: 'salvo no celular, sobe quando voltar o sinal' });
      } else {
        lista.push({ rotulo: e.rotulo, estado: 'falhou', detalhe: ehRecusa(err) ? err.message : String((err as Error)?.message ?? err) });
      }
      return false;
    }
  }

  async function executar() {
    const p = pendente.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendente.current = null;
    setFase('enviando');
    const lista: Resultado[] = [];
    if (Object.keys(p.campos).length) {
      try { await onSalvarCadastro(p.campos); lista.push({ rotulo: 'Cadastro do lead', estado: 'ok' }); }
      catch (err) { lista.push({ rotulo: 'Cadastro do lead', estado: ehErroDeRede(err) ? 'fila' : 'falhou', detalhe: String((err as Error)?.message ?? err) }); }
    }
    if (!dealId) lista.push({ rotulo: 'HubSpot', estado: 'pulado', detalhe: 'este lead ainda não tem negócio no HubSpot' });
    /* os degraus vão em ordem: se um é recusado, os de cima não têm como subir */
    let degrauFalhou = false;
    let degrauNaFila = false;
    let subiuAte: string | null = null;
    for (const e of p.envios) {
      /* sem sinal, a fila sobe em ordem: o degrau de cima entra atrás do de baixo */
      if (e.etapa && degrauNaFila) {
        await enfileirar({ acaoId: novoAcaoId(), tipo: 'negocio', rotulo: `${e.rotulo} · ${nome}`, payload: { corpo: e.corpo } });
        lista.push({ rotulo: e.rotulo, estado: 'fila', detalhe: 'na fila, sobe depois do degrau de baixo' });
        subiuAte = e.etapa;
        continue;
      }
      if (e.etapa && degrauFalhou) { lista.push({ rotulo: e.rotulo, estado: 'pulado', detalhe: 'o degrau de baixo não subiu' }); continue; }
      const foi = await enviar(e, lista);
      if (foi && e.etapa) { onEtapaMudou(e.etapa); subiuAte = e.etapa; }
      if (!foi && e.etapa) { if (lista[lista.length - 1]?.estado === 'fila') { degrauNaFila = true; subiuAte = e.etapa; } else degrauFalhou = true; }
    }
    /* o banco diz a etapa que DE FATO subiu (ou entrou na fila), não a que se pretendia */
    if (p.linha) p.linha = { ...p.linha, etapa_depois: subiuAte };
    if (p.foto) {
      try {
        await enviarFoto({
          blob: p.foto, ownerId, dealId, clientId: client.id, tiradaEm: checkinEm,
          lat: client.latitude != null ? Number(client.latitude) : null, lng: client.longitude != null ? Number(client.longitude) : null,
        });
        lista.push({ rotulo: 'Foto da visita · vai para o gestor', estado: 'ok' });
      } catch (err) {
        lista.push({ rotulo: 'Foto da visita', estado: 'falhou', detalhe: String((err as Error)?.message ?? err) });
      }
    }
    // A ficha no banco (0120): é o que o Cockpit lê para o funil de porta.
    if (p.linha) {
      const r = await gravarFichaNoBanco(p.linha, nome);
      lista.push({ rotulo: 'Ficha no Cockpit', estado: r, ...(r === 'fila' ? { detalhe: 'salvo no celular, sobe quando voltar o sinal' } : {}) });
    }
    setResultados(lista);
    setFase('salvo');
  }

  // Página fechando dentro da janela do Desfazer: nada se perde, vai para a fila.
  useEffect(() => {
    const aoSair = () => {
      const p = pendente.current;
      if (!p) return;
      clearTimeout(p.timer);
      pendente.current = null;
      for (const e of p.envios) if (!e.rota) void enfileirar({ acaoId: novoAcaoId(), tipo: 'negocio', rotulo: `${e.rotulo} · ${nome}`, payload: { corpo: e.corpo } });
      if (p.linha) void enfileirar({ acaoId: p.linha.acao_id, tipo: 'ficha', rotulo: `Ficha · ${nome}`, payload: p.linha as unknown as Record<string, unknown> });
    };
    window.addEventListener('pagehide', aoSair);
    return () => window.removeEventListener('pagehide', aoSair);
  }, [nome]);

  function aoSalvar() {
    if (!salvar.pode || fase !== 'form') return;
    const campos: CamposCadastro = {};
    if (!temTelefone && f.telefone.trim()) campos.telefone = f.telefone.trim();
    const envios: Envio[] = [];
    const passo = proximoPassoDaFicha(fEf, hoje);
    setPassoSalvo(passo ? { data: passo.data, texto: passo.texto, virouTarefa: !!dealId } : null);
    if (dealId) {
      envios.push({ corpo: { op: 'nota', dealId, texto: notaDaVisita(fEf, { cliente: nome, ocorridoEm: checkinEm, hoje }) }, rotulo: 'Nota da visita' });
      /* A ETAPA VAI ANTES DA TAREFA: a nota do próximo passo grava sistema e dor de novo
         (qualificacao) e não pode chegar antes do degrau que os exige */
      plano.vai.forEach((d, i) => {
        const esperada = i === 0 ? etapaReal : plano.vai[i - 1].etapa;
        envios.push({ corpo: { op: 'mudar-etapa', dealId, novaEtapa: d.etapa, propriedades: d.propriedades, ...(d.gargaloOutro ? { gargaloOutro: d.gargaloOutro } : {}), ...(esperada ? { etapaEsperada: esperada } : {}) }, rotulo: `Etapa → ${ROTULO_ETAPA[d.etapa]}`, etapa: d.etapa });
      });
      if (passo) {
        const qualificacao: Record<string, string> = {};
        if (f.sistema.trim()) qualificacao.nomeDoSistema = sistemaParaGravar(f.sistema);
        // só a dor da lista: a "Outra" vai na nota (o servidor recusa gargalo fora do enum)
        if (f.dor) qualificacao.gargalo = f.dor;
        envios.push({
          corpo: {
            op: 'nota', tipoAcao: 'proximo-passo', dealId, texto: passo.texto, data: passo.data, tipo: passo.tipo,
            ...(passo.hora ? { hora: passo.hora } : {}),
            ...(Object.keys(qualificacao).length ? { qualificacao } : {}),
          },
          rotulo: `${passo.tipo === 'reuniao' ? 'Reunião' : 'Próximo passo'} em ${passo.data === hoje ? 'hoje' : diaMes(passo.data)}`,
        });
      }
      /* quem decide vira contato do negócio quando o nome ou o papel foi dito agora (a rota
         acha o contato pelo nome e só atualiza o papel: não duplica) */
      if (f.decisor.trim() || (f.papel && decisorEf)) {
        envios.push({
          rota: 'hubspot-sync',
          // Sem celular: o telefone da ficha é o da CASA, não o de quem decide (auditoria 26/09).
          corpo: { type: 'decisor', id_hubspot: dealId, nome: decisorEf, papel: papelParaHubspot(papelEf), owner_id: client.vendedor_id_hubspot ?? undefined },
          rotulo: 'Quem decide no negócio',
        });
      }
    }
    /* a linha do banco leva o que foi DITO nesta visita (sistema e dor que já se sabiam não viram
       "da ficha de hoje"). Quem decide é exceção: "Falei com quem decide" CONFIRMA a pessoa, e o
       Cockpit mede "ficha com decisor" por essa coluna */
    const linha = linhaDaFicha(f.comoFoi === 'falou_com_decisor' && decisorEf ? { ...f, decisor: decisorEf, papel: fEf.papel, papelOutro: fEf.papelOutro } : f, {
      ownerId, clientId: client.id ?? null, dealId, ocorridoEm: checkinEm, declarada,
      etapaAntes: etapaReal ?? null, etapaDepois: ultimo,
      comFoto: !!fotoProva || fotoNoCheckin, bairro: client.bairro, cidade: client.cidade, hoje,
    });
    pendente.current = { campos, envios, foto: fotoProva, linha, timer: setTimeout(() => { void executar(); }, JANELA_DESFAZER_MS) };
    setFase('desfazer');
  }

  function desfazer() {
    const p = pendente.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendente.current = null;
    setFase('form');
  }

  function fechar() {
    /* Fechar com o desfecho marcado e não salvo descartava tudo em silêncio (auditoria de
       03/10/26). O primeiro toque avisa; o segundo fecha. Avisar, não travar. */
    if (fase === 'form' && (f.comoFoi || f.proximo) && !confirmarSaida) { setConfirmarSaida(true); return; }
    setConfirmarSaida(false);
    // Fechar dentro da janela do Desfazer não cancela: manda na hora.
    if (pendente.current) void executar();
    onFechar();
  }

  /* o toque num chip fecha o teclado na hora: com ele aberto no iPhone, o toque seguinte caía deslocado */
  const fecharTeclado = () => { try { const el = document.activeElement as HTMLElement | null; if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.blur(); } catch { /* fora do navegador */ } };
  const chip = (chave: string, rotulo: string, ativo: boolean, aoTocar: () => void) => (
    <Pressable key={chave} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={() => { fecharTeclado(); aoTocar(); }}
      style={[s.chip, ativo && s.opcaoAtiva]}>
      <Text style={[s.chipTexto, ativo && s.opcaoAtivaTexto]}>{rotulo}</Text>
    </Pressable>
  );
  const opcaoGrade = (chave: string, rotulo: string, ativo: boolean, aoTocar: () => void, sub?: string) => (
    <Pressable key={chave} accessibilityRole="button" accessibilityState={{ selected: ativo }} onPress={aoTocar}
      style={[s.opcao, sub ? s.opcaoGrande : null, ativo && s.opcaoAtiva]}>
      <Text style={[s.opcaoTexto, ativo && s.opcaoAtivaTexto]} numberOfLines={2}>{rotulo}</Text>
      {!!sub && <Text style={[s.opcaoSub, ativo && s.opcaoAtivaTexto]} numberOfLines={1}>{sub}</Text>}
    </Pressable>
  );
  /* A LINHA DE FATO: rótulo · valor · de onde veio · corrigir (handoff A4) */
  const fato = (campo: Campo, rotulo: string, valor: string, origem: string, extra?: React.ReactNode) => (
    <View key={campo} style={s.fato}>
      <View style={s.fatoLinha}>
        <Text style={s.fatoRotulo}>{rotulo}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.fatoValor} numberOfLines={1}>{valor}</Text>
          {!!origem && <Text style={s.fatoOrigem}>{origem}</Text>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Corrigir ${rotulo}`} onPress={() => setCorrigindo((c) => ({ ...c, [campo]: true }))} style={s.corrigir}>
          <Text style={s.corrigirTexto}>corrigir</Text>
        </Pressable>
      </View>
      {extra}
    </View>
  );
  const papelSeg = (
    <View style={s.segmento}>
      {(['Dono', 'Gerente'] as const).map((p) => (
        <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected: papelEf === p }} onPress={() => set({ papel: f.papel === p ? null : p })}
          style={[s.segItem, papelEf === p && s.segItemAtivo]}>
          <Text style={[s.segTexto, papelEf === p && s.opcaoAtivaTexto]}>{p}</Text>
        </Pressable>
      ))}
    </View>
  );
  const editorSistema = (
    <>
      <View style={s.chips}>
        {SISTEMAS.map((sis) => chip(sis, sis, sis === 'Outro' ? outroSistema : !outroSistema && f.sistema === sis, () => {
          if (sis === 'Outro') { setOutroSistema(true); set({ sistema: '' }); return; }
          setOutroSistema(false); set({ sistema: f.sistema === sis ? '' : sis });
        }))}
      </View>
      {outroSistema && (
        <TextInput style={s.campo} value={f.sistema} onChangeText={(v) => set({ sistema: v })} placeholder="Qual sistema? (ou caderno)" placeholderTextColor="#8B919C" maxLength={120} />
      )}
    </>
  );
  const editorDor = (
    <>
      <View style={s.chips}>
        {GARGALOS.map((g) => chip(g, g, f.dor === g, () => set({ dor: f.dor === g ? null : g, dorOutra: null })))}
        {chip(GARGALO_OUTRA, GARGALO_OUTRA, f.dorOutra != null, () => set({ dor: null, dorOutra: f.dorOutra != null ? null : '' }))}
      </View>
      {f.dorOutra != null && (
        <TextInput style={s.campo} value={f.dorOutra} onChangeText={(v) => set({ dorOutra: v })} placeholder="Qual é a dor?" placeholderTextColor="#8B919C" maxLength={200} />
      )}
    </>
  );
  const editorCelular = (
    <TextInput style={s.campo} value={f.telefone} onChangeText={(v) => set({ telefone: v })} placeholder="(27) 99999-9999" placeholderTextColor="#8B919C" keyboardType="phone-pad" />
  );
  const editorDecisor = (
    <>
      <TextInput style={s.campo} value={f.decisor} onChangeText={(v) => set({ decisor: v })} placeholder="Nome de quem decide" placeholderTextColor="#8B919C" autoComplete="off" textContentType="none" returnKeyType="done" blurOnSubmit />
      {papelSeg}
    </>
  );
  /* um campo: fato quando já se sabe (e não está corrigindo), editor quando falta */
  const campoDe = (campo: Campo, rotulo: string, valor: string, origem: string, editor: React.ReactNode, extraFato?: React.ReactNode) => (
    valor && !corrigindo[campo] && !(campo === 'sistema' && (f.sistema || outroSistema)) && !(campo === 'dor' && (f.dor || f.dorOutra != null))
      ? fato(campo, rotulo, campo === 'sistema' ? nomeDoSistema(valor) : valor, origem, extraFato)
      : (
        <View key={campo} style={{ gap: 8 }}>
          <Text style={s.rotulo}>{rotulo}</Text>
          {editor}
        </View>
      )
  );
  const problemas = resultados.filter((r) => r.estado !== 'ok');
  const sabidoDe = (campo: Campo) => (campo === 'decisor' ? (f.decisor.trim() ? 'dito agora' : sabido?.decisorDe ?? '')
    : campo === 'celular' ? (f.telefone.trim() ? 'dito agora' : sabido?.celularDe ?? '')
      : campo === 'dor' ? (dorDigitada ? 'dito agora' : sabido?.dorDe ?? '')
        : (f.sistema.trim() ? 'dito agora' : sabido?.sistemaDe ?? ''));
  /* "Apresentei agora": o que falta para passar por Decisor aparece no topo, só o que falta */
  const faltaDecisor = pedePlano && plano.paraEm === ETAPA.decisor ? plano.falta : [];
  const mostrarNoTopo = [
    ...((faltaDecisor.includes('nome_do_sistema') || ((!!f.sistema || outroSistema) && !sabido?.sistema)) ? ['nome_do_sistema'] : []),
    ...((faltaDecisor.includes('gargalo_operacional') || ((!!f.dor || f.dorOutra != null) && !sabido?.dor)) ? ['gargalo_operacional'] : []),
    ...((faltaDecisor.includes('celular') || (!!f.telefone && !sabido?.celular)) ? ['celular'] : []),
  ];
  /* "Falei com a Marta (dono)": o nome de quem decide quando já se sabe */
  const primeiroNome = (sabido?.decisor ?? '').trim().split(/\s+/)[0] ?? '';
  const rotuloFalei = decisorConhecido && primeiroNome ? `Falei com ${primeiroNome}${sabido?.papel ? ` (${sabido.papel.toLowerCase()})` : ''}` : null;
  const rotuloDe = (id: string, padrao: string) => (id === 'falou_com_decisor' && rotuloFalei ? rotuloFalei : padrao);
  const rotuloComoFoi = rotuloDe(f.comoFoi ?? '', COMO_FOI.find((c) => c.id === f.comoFoi)?.rotulo ?? '');
  const textoSalvar = !salvar.pode ? salvar.texto : vaiAoAlvo && alvoFinal ? `Salvar · vai a ${ROTULO_ETAPA[alvoFinal]}` : 'Salvar visita';

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={fechar}>
      <View style={s.fundo}>
        <View style={[s.folha, fase !== 'form' && s.folhaSalvo]}>
          <View style={s.alca}><View style={s.alcaBarra} /></View>

          {fase === 'form' ? (
            <>
              <View style={s.topo}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.titulo}>{apresentei ? 'Apresentei agora' : 'Registrar visita'}</Text>
                  <Text style={s.subtitulo} numberOfLines={1}>
                    {apresentei && etapaReal ? `${nome} · ${ROTULO_ETAPA[etapaReal] ?? ''} → Demo/Proposta` : `${nome} · toque ${toque} de 3`}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={fechar} style={s.fechar}>
                  <SiClose width={20} height={20} fill="var(--text-muted)" />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={s.corpo} keyboardShouldPersistTaps="handled">
                {!f.comoFoi && (
                  <View style={[s.gps, declarada && s.gpsDeclarada]}>
                    <Text style={[s.gpsTexto, declarada && s.gpsDeclaradaTexto]}>{declarada ? 'Visita declarada · o gestor vê que foi sem GPS' : 'GPS confere · check-in feito'}</Text>
                  </View>
                )}

                {/* 1 · COMO FOI: respondido, vira uma linha com "trocar" (uma decisão por tela) */}
                {f.comoFoi ? (
                  <View style={s.respondido}>
                    <Text style={s.respondidoRotulo}>1 · COMO FOI</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.respondidoValor} numberOfLines={1}>{rotuloComoFoi}</Text>
                      {comoFoiAuto && <Text style={s.fatoOrigem}>marcado pela última visita · troque se não foi</Text>}
                    </View>
                    <Pressable accessibilityRole="button" onPress={() => escolherComoFoi(null)} style={s.corrigir}>
                      <Text style={s.corrigirTexto}>trocar</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Text style={s.secao}>1 · COMO FOI?</Text>
                    <View style={s.grade}>{COMO_FOI.map((c) => opcaoGrade(c.id, rotuloDe(c.id, c.rotulo), false, () => escolherComoFoi(c.id)))}</View>
                  </>
                )}

                {/* "Apresentei agora" abre no lugar do resto: a grade vira uma linha com "trocar" */}
                {apresentei && (
                  <View style={s.respondido}>
                    <Text style={s.respondidoRotulo}>2 · E AGORA</Text>
                    <Text style={s.respondidoValor} numberOfLines={1}>Apresentei agora</Text>
                    <Pressable accessibilityRole="button" onPress={() => { setOpcao(null); set({ proximo: null }); }} style={s.corrigir}>
                      <Text style={s.corrigirTexto}>trocar</Text>
                    </Pressable>
                  </View>
                )}
                {!!f.comoFoi && !apresentei && (
                  <>
                    <Text style={s.secao}>2 · E AGORA?</Text>
                    <View style={s.grade}>
                      {opcoesAgora(f.comoFoi, etapaReal).map((o) => opcaoGrade(o.id, o.rotulo, opcao === o.id, () => {
                        setOpcao(o.id);
                        setOutraHora(false);
                        if (o.proximo === 'apresentei' || PROXIMOS_PARA_NEGOCIACAO.includes(o.proximo)) set({ plano: f.plano || sabido?.plano || '', mrr: f.mrr || sabido?.mrr || '' });
                        set({
                          proximo: o.proximo, diasReuniao: o.dias ?? null, horaReuniao: null, motivoPerdido: o.proximo === 'sem_interesse' ? f.motivoPerdido : null,
                          /* "Voltar amanhã" já diz o dia; as outras voltas esperam o executivo escolher */
                          dataVolta: o.proximo === 'voltar_amanha' ? proximoDiaUtil(hoje, 1) : (ehVolta(o.proximo) ? f.dataVolta : null),
                        });
                        if (o.proximo === 'voltar_amanha') setOutraDataVolta(false);
                      }, o.sub))}
                    </View>
                  </>
                )}

                {/* REUNIÃO HOJE: só a hora, numa linha de chips logo abaixo */}
                {f.proximo === 'reuniao' && f.diasReuniao === 0 && (
                  <>
                    <Text style={s.secao}>QUE HORAS?</Text>
                    <View style={s.chips}>
                      {HORAS_REUNIAO_HOJE.filter((h) => Number(h.slice(0, 2)) > new Date(Date.now() - 3 * 3600000).getUTCHours()).map((h) => chip(h, h.replace(':00', 'h'), !outraHora && f.horaReuniao === h, () => { setOutraHora(false); set({ horaReuniao: h }); }))}
                      {chip('hora-outra', 'outra', outraHora, () => { setOutraHora(true); set({ horaReuniao: horaLivre(horaTexto) }); })}
                    </View>
                    {outraHora && (
                      <TextInput style={s.campo} value={horaTexto} inputMode="numeric" placeholder="ex.: 18h30" placeholderTextColor="#8B919C" maxLength={6}
                        onChangeText={(v) => { setHoraTexto(v); const h = horaLivre(v); set({ horaReuniao: h && h > agoraHHMM() ? h : null }); }} />
                    )}
                  </>
                )}

                {/* APRESENTEI AGORA / FECHOU / NEGOCIANDO: o que falta de Decisor (só o que falta), plano, MRR */}
                {pedePlano && (
                  <>
                    {/* o campo escolhido agora continua na tela (para ver e trocar); some só o que já se sabia */}
                    {!!dealId && degraus.includes(ETAPA.decisor) && (mostrarNoTopo.length ? (
                      <View style={faltaDecisor.length ? s.blocoFalta : s.blocoFaltaOk}>
                        <Text style={s.blocoFaltaTitulo}>{faltaDecisor.length
                          ? `Para passar por Decisor falta só · ${juntar(faltaDecisor.map((k) => ROTULO_PROP[k] ?? k))}`
                          : 'Decisor pronto · confira o que você escolheu'}</Text>
                        {mostrarNoTopo.includes('nome_do_sistema') && editorSistema}
                        {mostrarNoTopo.includes('gargalo_operacional') && editorDor}
                        {mostrarNoTopo.includes('celular') && editorCelular}
                      </View>
                    ) : (
                      <View style={s.blocoOk}>
                        <View style={s.okCheck}><SiCheck width={14} height={14} fill="#FFFFFF" /></View>
                        <Text style={s.blocoOkTexto}>Decisor pronto · celular, dor e sistema ok</Text>
                      </View>
                    ))}
                    <Text style={s.rotulo}>{`Plano apresentado${sabido?.plano && !f.plano ? ' · do negócio' : ''}`}</Text>
                    <View style={s.chips}>
                      {(PICKLIST.plano_apresentado ?? []).map((p) => chip(p, p, planoEf === p, () => set({ plano: p })))}
                    </View>
                    <Text style={s.rotulo}>{`MRR mensal (R$)${sabido?.mrr && !f.mrr ? ' · do negócio' : ''}`}</Text>
                    <TextInput style={[s.campo, !mrrEf && s.campoFoco]} value={f.mrr} onChangeText={(v) => set({ mrr: v })}
                      placeholder="R$ por mês" placeholderTextColor="#8B919C" keyboardType="decimal-pad" />
                    {apresentei && (
                      <View style={s.fatoLinha}>
                        <Text style={s.fatoRotulo}>Reunião</Text>
                        <Text style={[s.fatoValor, { flex: 1 }]}>{`Hoje, ${diaMes(hoje)} · agora`}</Text>
                      </View>
                    )}
                    {!dealId && <Text style={s.ajuda}>Sem negócio no HubSpot: a visita grava, a etapa fica para quando ele existir.</Text>}
                  </>
                )}

                {ehVolta(f.proximo) && (
                  <>
                    <Text style={s.secao}>{f.proximo === 'retorno' || f.proximo === 'negociando' ? 'QUANDO É O RETORNO?' : 'QUANDO VOLTAR?'}</Text>
                    <View style={s.chips}>
                      {DIAS_VOLTA.map((d) => {
                        const dia = proximoDiaUtil(hoje, d.dias);
                        return chip('volta' + d.dias, d.rotulo, !outraDataVolta && f.dataVolta === dia, () => { setOutraDataVolta(false); set({ dataVolta: dia }); });
                      })}
                      {chip('volta-outro', 'Outro dia', outraDataVolta, () => { setOutraDataVolta(true); set({ dataVolta: null }); })}
                    </View>
                    {outraDataVolta && (
                      <CampoData valor={f.dataVolta ?? ''} minimo={hoje} rotulo="Dia da volta"
                        aoMudar={(v) => set({ dataVolta: /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null })} />
                    )}
                    {!!f.dataVolta && (
                      <Text style={[s.ajuda, { textAlign: 'center' }]}>
                        {`Volta em ${diaMes(f.dataVolta)} (${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(`${f.dataVolta}T12:00:00Z`).getUTCDay()]})`
                          + ([0, 6].includes(new Date(`${f.dataVolta}T12:00:00Z`).getUTCDay()) ? ' · cai no fim de semana' : '')}
                      </Text>
                    )}
                  </>
                )}
                {f.proximo === 'sem_interesse' && (
                  <>
                    <Text style={s.secao}>MOTIVO</Text>
                    <View style={s.chips}>{MOTIVOS_PERDIDO.map((m) => chip(m.valor, m.rotulo, f.motivoPerdido === m.valor, () => set({ motivoPerdido: m.valor })))}</View>
                    {!!f.motivoPerdido && !!AJUDA_MOTIVO[f.motivoPerdido ?? ''] && <Text style={s.ajuda}>{AJUDA_MOTIVO[f.motivoPerdido ?? '']}</Text>}
                    {/* "O que pesou" (14/10/26): para todo motivo; obrigatório só nos que não se explicam sozinhos */}
                    {!!f.motivoPerdido && (
                      <TextInput style={s.campo} value={f.motivoTexto} onChangeText={(v) => set({ motivoTexto: v })} maxLength={MAX_O_QUE_PESOU}
                        placeholder={MOTIVOS_QUE_EXIGEM_TEXTO.includes(f.motivoPerdido ?? '') ? 'O que pesou (obrigatório)' : 'O que pesou (opcional)'} placeholderTextColor="#8B919C" />
                    )}
                  </>
                )}

                {/* A CAIXA DA ETAPA: diz para onde vai, ou o que falta — nunca bloqueia o Salvar */}
                {!apresentei && !!f.proximo && (ultimo || plano.paraEm) && (
                  <View style={ultimo ? s.blocoOk : s.blocoAviso}>
                    <View style={[s.okCheck, !ultimo && s.avisoCheck]}><SiCheck width={14} height={14} fill="#FFFFFF" /></View>
                    <Text style={ultimo ? s.blocoOkTexto : s.blocoAvisoTexto}>
                      {ultimo
                        ? `Vai para ${ROTULO_ETAPA[ultimo]}${(PROPS_PEDIDAS[ultimo] ?? '') ? ` · ${PROPS_PEDIDAS[ultimo]} ok` : ''}`
                        : `Mover para ${ROTULO_ETAPA[plano.paraEm as string]} · falta ${juntar(faltaTexto)}`}
                    </Text>
                  </View>
                )}

                {!apresentei && (
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: completar }} onPress={() => setCompletar((v) => !v)} style={s.completarTopo}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.completarTitulo}>Completar agora</Text>
                      {f.comoFoi === 'decisor_ausente' && !decisorEf
                        ? <Text style={s.completarAlerta}>Saia com o nome de quem decide</Text>
                        : <Text style={s.ajuda}>{sabidos === 4 ? '4 de 4 já sabidos · nada a preencher' : `${sabidos} de 4 já sabidos · opcional`}</Text>}
                    </View>
                    <View style={{ transform: [{ rotate: completar ? '180deg' : '0deg' }] }}><SiDown width={18} height={18} fill="var(--text-muted)" /></View>
                  </Pressable>
                )}

                {!apresentei && completar && (
                  <View style={s.completar}>
                    {campoDe('decisor', 'Quem decide', decisorEf, sabidoDe('decisor'), editorDecisor, papelSeg)}
                    {campoDe('celular', 'Celular', celularEf, sabidoDe('celular'), editorCelular)}
                    {campoDe('dor', 'Maior dor', dorEf, sabidoDe('dor'), editorDor)}
                    {campoDe('sistema', 'Sistema que usa hoje', sistemaEf, sabidoDe('sistema'), editorSistema)}
                  </View>
                )}
                {!dealId && <Text style={s.aviso}>Este lead ainda não tem negócio no HubSpot: a visita salva o cadastro, e a nota e a etapa ficam para quando o negócio existir.</Text>}
              </ScrollView>
              <View style={s.rodape}>
                {confirmarSaida && (
                  <View style={{ gap: 8 }}>
                    <Text style={[s.ajuda, { color: 'var(--text)', textAlign: 'center' }]}>Sair sem salvar? O check-in fica, mas sem o desfecho nem o próximo passo.</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable accessibilityRole="button" style={s.secundario} onPress={() => setConfirmarSaida(false)}>
                        <Text style={s.secundarioTexto}>Continuar registrando</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" style={s.secundario} onPress={fechar}>
                        <Text style={s.secundarioTexto}>Sair sem salvar</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                <Pressable accessibilityRole="button" style={[s.salvar, !salvar.pode && s.salvarDesligado]} onPress={aoSalvar} disabled={!salvar.pode}>
                  <Text style={[s.salvarTexto, !salvar.pode && s.salvarTextoDesligado]}>{textoSalvar}</Text>
                </Pressable>
                <Text style={[s.legenda, aviso && s.legendaAviso]} numberOfLines={2}>{legenda}</Text>
              </View>
            </>
          ) : (
            <View style={s.salvo}>
              <View style={s.salvoTopo}>
                <SiCheck width={18} height={18} fill="var(--tint-green-text)" />
                <Text style={[s.salvoTitulo, { flex: 1 }]} numberOfLines={1}>{`Visita registrada · ${nome}`}</Text>
                {fase === 'desfazer' ? (
                  <Pressable accessibilityRole="button" onPress={desfazer} style={s.desfazer}>
                    <Text style={s.desfazerTexto}>Desfazer</Text>
                  </Pressable>
                ) : fase === 'enviando' ? <ActivityIndicator color="#86EFAC" /> : null}
              </View>
              <Text style={s.ajuda}>
                {[ultimo ? `Etapa → ${ROTULO_ETAPA[ultimo]}` : null,
                  passoSalvo
                    ? `${passoSalvo.texto} · ${passoSalvo.data === hoje ? 'hoje' : diaMes(passoSalvo.data)} · ${passoSalvo.virouTarefa ? (donoColega ? `na Agenda de ${donoColega}, dono do negócio` : 'na Agenda e nas Tarefas') : 'sem negócio no HubSpot, não virou tarefa'}`
                    : f.proximo === 'sem_interesse' ? 'Sem interesse: o negócio vai para Perdido.' : 'Sem próximo passo com data.'].filter(Boolean).join('\n')}
              </Text>
              {fase === 'salvo' && (
                <Text style={[s.ajuda, { color: problemas.some((p) => p.estado === 'falhou') ? 'var(--vermelho-texto)' : 'var(--verde-texto)' }]}>
                  {problemas.length === 0
                    ? 'Salvo · HubSpot e Cockpit atualizados'
                    : problemas.map((p) => `${p.estado === 'fila' ? 'Na fila' : p.estado === 'falhou' ? 'Falhou' : 'Pendente'} · ${p.rotulo}${p.detalhe ? `: ${p.detalhe}` : ''}`).join('\n')}
                </Text>
              )}
              {fase === 'salvo' && f.proximo === 'fechou' && onEmitirCobranca && (ultimo === ETAPA.negociacao || etapaReal === ETAPA.negociacao) && (
                <Pressable accessibilityRole="button" onPress={() => { onEmitirCobranca(); }} style={s.salvar}>
                  <Text style={s.salvarTexto}>Emitir a cobrança agora</Text>
                </Pressable>
              )}
              {proxima && (
                <View style={s.proxima}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.proximaRotulo}>{`PRÓXIMA PORTA · ${proxima.numero} DO PLANO`}</Text>
                    <Text style={s.proximaNome} numberOfLines={1}>{proxima.nome}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => { fechar(); onProxima(proxima.client); }} style={s.proximaBotao}>
                    <Text style={s.proximaBotaoTexto}>Abrir</Text>
                  </Pressable>
                </View>
              )}
              <View style={s.salvoAcoes}>
                {onAgenda && (
                  <Pressable accessibilityRole="button" style={s.secundario} onPress={() => { fechar(); onAgenda(passoSalvo?.data ?? null); }}>
                    <Text style={s.secundarioTexto}>{passoSalvo ? 'Ver na Agenda' : 'Abrir a Agenda'}</Text>
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" style={s.secundario} onPress={fechar}>
                  <Text style={s.secundarioTexto}>Voltar ao mapa</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* o que cada degrau exige, para a caixa "Vai para X · … já no negócio" */
const PROPS_PEDIDAS: Record<string, string> = {
  [ETAPA.decisor]: 'celular, dor e sistema',
  [ETAPA.demo]: 'plano, MRR e data',
  [ETAPA.negociacao]: 'plano e MRR',
};

const s = StyleSheet.create({
  fundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  folha: {
    height: '76%', backgroundColor: 'var(--surface)', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: 'var(--border)',
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: -8 },
  },
  folhaSalvo: { height: 'auto' as unknown as number },
  alca: { height: 18, alignItems: 'center', justifyContent: 'center' },
  alcaBarra: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'var(--stroke-strong)' },
  topo: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingBottom: 6 },
  titulo: { fontSize: 18, fontWeight: '700', color: 'var(--text)' },
  subtitulo: { fontSize: 13, fontWeight: '500', color: 'var(--text-muted)', marginTop: 2 },
  fechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8, marginTop: -6 },
  fecharTexto: { fontSize: 18, color: 'var(--text-muted)' },
  corpo: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  gps: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'var(--tint-green)' },
  gpsTexto: { fontSize: 12, fontWeight: '600', color: 'var(--tint-green-text)' },
  gpsDeclarada: { backgroundColor: 'var(--tint-amber)' },
  gpsDeclaradaTexto: { color: 'var(--tint-amber-text)' },
  secao: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: 'var(--text-faint)', marginTop: 4 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcao: {
    width: '48.5%', minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, justifyContent: 'center',
    borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)',
  },
  opcaoTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  opcaoAtiva: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--vermelho-acao)', borderWidth: 1.5 },
  opcaoAtivaTexto: { color: 'var(--tint-red-text)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', justifyContent: 'center' },
  chipTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  etapa: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)' },
  caixa: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: 'var(--stroke-strong)', alignItems: 'center', justifyContent: 'center' },
  caixaMarcada: { backgroundColor: 'var(--vermelho-acao)', borderColor: 'var(--vermelho-acao)' },
  caixaV: { color: '#fff', fontSize: 14, fontWeight: '800' },
  etapaTitulo: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  completarTopo: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'var(--border-soft)', marginTop: 4 },
  completarTitulo: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  completarAlerta: { fontSize: 12, fontWeight: '600', color: 'var(--vermelho-texto)' },
  seta: { fontSize: 14, color: 'var(--text-muted)', paddingHorizontal: 6 },
  completar: { gap: 8 },
  fotoLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  fotoMini: { width: 56, height: 56, borderRadius: 10, backgroundColor: 'var(--surface-2)' },
  rotulo: { fontSize: 13, fontWeight: '600', color: 'var(--text)', marginTop: 6 },
  ajuda: { fontSize: 12, fontWeight: '500', color: 'var(--text-muted)' },
  aviso: { fontSize: 13, color: 'var(--tint-amber-text)', backgroundColor: 'var(--tint-amber)', padding: 10, borderRadius: 10 },
  campo: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--bg)', paddingHorizontal: 12, fontSize: 16, color: 'var(--text)' },
  rodape: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' as unknown as number, gap: 6, borderTopWidth: 1, borderTopColor: 'var(--border-soft)' },
  salvar: { height: 56, borderRadius: 16, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  salvarDesligado: { backgroundColor: 'var(--surface-2)' },
  salvarTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
  salvarTextoDesligado: { color: 'var(--text-muted)', fontSize: 14 },
  legenda: { fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' },
  salvo: { paddingHorizontal: 16, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' as unknown as number, gap: 8 },
  salvoTopo: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  salvoTitulo: { flex: 1, fontSize: 16, fontWeight: '700', color: 'var(--verde-texto)' },
  desfazer: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: 'var(--border)', justifyContent: 'center' },
  desfazerTexto: { fontSize: 14, fontWeight: '700', color: 'var(--text)' },
  proxima: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: 'var(--surface-2)', marginTop: 4 },
  proximaRotulo: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: 'var(--vermelho-texto)' },
  proximaNome: { fontSize: 16, fontWeight: '600', color: 'var(--text)', marginTop: 2 },
  proximaBotao: { height: 48, paddingHorizontal: 22, borderRadius: 14, backgroundColor: 'var(--vermelho-acao)', alignItems: 'center', justifyContent: 'center' },
  proximaBotaoTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
  salvoAcoes: { flexDirection: 'row', gap: 8 },
  secundario: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: 'var(--border)', alignItems: 'center', justifyContent: 'center' },
  secundarioTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  opcaoGrande: { minHeight: 58 },
  opcaoSub: { fontSize: 11.5, fontWeight: '500', color: 'var(--text-faint)', marginTop: 2 },
  respondido: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' },
  respondidoRotulo: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, color: 'var(--text-faint)' },
  respondidoValor: { flex: 1, fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  corrigir: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  corrigirTexto: { fontSize: 13, fontWeight: '600', color: 'var(--text-muted)', textDecorationLine: 'underline' },
  fato: { gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'var(--border-soft)' },
  fatoLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  fatoRotulo: { width: 86, fontSize: 12.5, fontWeight: '500', color: 'var(--text-faint)' },
  fatoValor: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  fatoOrigem: { fontSize: 11.5, fontWeight: '500', color: 'var(--text-faint)', marginTop: 1 },
  segmento: { flexDirection: 'row', gap: 8 },
  segItem: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', alignItems: 'center', justifyContent: 'center' },
  segItemAtivo: { backgroundColor: 'var(--tint-red)', borderColor: 'var(--vermelho-acao)', borderWidth: 1.5 },
  segTexto: { fontSize: 14, fontWeight: '600', color: 'var(--text)' },
  blocoFalta: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: 'var(--tint-amber-border)' },
  blocoFaltaOk: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: 'var(--tint-green-border)' },
  blocoFaltaTitulo: { fontSize: 13, fontWeight: '600', color: 'var(--text)' },
  blocoOk: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'var(--tint-green)' },
  blocoOkTexto: { flex: 1, fontSize: 13, fontWeight: '600', color: 'var(--tint-green-text)' },
  blocoAviso: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'var(--tint-amber)' },
  blocoAvisoTexto: { flex: 1, fontSize: 13, fontWeight: '600', color: 'var(--tint-amber-text)' },
  okCheck: { width: 22, height: 22, borderRadius: 6, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' },
  avisoCheck: { backgroundColor: 'var(--vermelho-acao)' },
  campoFoco: { borderWidth: 2, borderColor: 'var(--vermelho-acao)' },
  legendaAviso: { color: 'var(--tint-amber-text)', fontWeight: '600' },
});
