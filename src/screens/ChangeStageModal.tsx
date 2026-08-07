import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Client } from '../types/client';
import {
  WON_STAGE_IDS,
  FUNNEL_STAGE_IDS,
  LOST_STAGE_ID,
  APP_STAGE_IDS,
  FREE_ADVANCE_MAX_STAGE_ID,
  STAGES,
  type Stage,
  type StageSubField,
} from '../constants/stages';
import { useStages } from '../hooks/useStages';
import { useStagePropertyOptions } from '../hooks/useStagePropertyOptions';
import { useClientStageChanges } from '../hooks/useClientStageChanges';
import { useClientNotes } from '../hooks/useClientNotes';
import { supabase } from '../integrations/supabase/client';
import { sendHubspotEvent } from '../utils/hubspotSync';

interface Props {
  client: Client;
  onClose: () => void;
  // Quando setado, o modal ja abre com essa etapa pre-selecionada e NAO mostra
  // o seletor de etapas (ex.: "Mover para perdido" a partir de uma tarefa).
  initialStageId?: string;
  // Chamado apos o envio bem-sucedido (ex.: resolver a tarefa que originou).
  onDone?: () => void;
  // Cria o deal no HubSpot pra um lead SEM id_hubspot (conta-alvo antes do
  // check-in, ou pin com webhook atrasado) e devolve o id. Sem isso, mover a
  // etapa de quem nao tem deal trava esperando o id chegar.
  onCreateHubspotDeal?: (client: Client) => Promise<string | null>;
}

// Normaliza "1.500,50" / "1500,50" / "1500.50" / "1500" pra "1500.50".
// Mantém só dígitos e o último separador como ponto decimal. Vazio → null.
function normalizeCurrency(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Remove R$, espaços e qualquer outro símbolo
  const cleaned = trimmed.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  // Se tem vírgula e ponto, ponto é separador de milhar; tira ele e usa vírgula como decimal
  let withDecimal = cleaned;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // o último separador é o decimal
    if (lastComma > lastDot) {
      withDecimal = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      withDecimal = cleaned.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    withDecimal = cleaned.replace(',', '.');
  }
  const n = Number(withDecimal);
  if (!Number.isFinite(n)) return null;
  return String(n);
}

function SelectField({
  subField,
  value,
  onChange,
  color,
  disabled,
  dbOptions,
  dbLabel,
}: {
  subField: Extract<StageSubField, { kind: 'select' }>;
  value: string; // sempre o internal value (vai pro payload do HubSpot)
  onChange: (v: string) => void;
  color: string;
  disabled: boolean;
  // Quando vem do banco: cada option tem { value: internal, label: display }.
  // Fallback hardcoded (subField.options) eh array de strings — o mesmo
  // valor serve como internal E display.
  dbOptions?: { value: string; label: string }[];
  dbLabel?: string;
}) {
  const opts: { value: string; label: string }[] =
    dbOptions ?? subField.options.map((o) => ({ value: o, label: o }));
  const label = dbLabel ?? subField.fieldLabel;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.subOptionsLabel}>
        {label}{subField.optional ? ' (opcional)' : ''}
      </Text>
      <View style={styles.subOptionsGrid}>
        {opts.map((opt) => {
          const selected = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.subOptionChip,
                selected && { backgroundColor: color, borderColor: color },
              ]}
              onPress={() => onChange(opt.value)}
              disabled={disabled}
            >
              <Text style={[styles.subOptionChipText, selected && { color: '#fff' }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function MultiSelectField({
  subField,
  values,
  onToggle,
  color,
  disabled,
  dbOptions,
  dbLabel,
}: {
  subField: Extract<StageSubField, { kind: 'select' }>;
  values: string[];
  onToggle: (v: string) => void;
  color: string;
  disabled: boolean;
  dbOptions?: { value: string; label: string }[];
  dbLabel?: string;
}) {
  const opts: { value: string; label: string }[] =
    dbOptions ?? subField.options.map((o) => ({ value: o, label: o }));
  const label = dbLabel ?? subField.fieldLabel;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.subOptionsLabel}>
        {label}{subField.optional ? ' (opcional)' : ''}
        {' '}<Text style={{ color: '#94a3b8', fontWeight: '500' }}>(pode escolher varios)</Text>
      </Text>
      <View style={styles.subOptionsGrid}>
        {opts.map((opt) => {
          const selected = values.includes(opt.value);
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.subOptionChip,
                selected && { backgroundColor: color, borderColor: color },
              ]}
              onPress={() => onToggle(opt.value)}
              disabled={disabled}
            >
              <Text style={[styles.subOptionChipText, selected && { color: '#fff' }]}>
                {selected ? '✓ ' : ''}{opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function CurrencyField({
  subField,
  value,
  onChange,
  disabled,
}: {
  subField: Extract<StageSubField, { kind: 'currency' }>;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.subOptionsLabel}>
        {subField.fieldLabel}{subField.optional ? ' (opcional)' : ''}
      </Text>
      <View style={styles.currencyRow}>
        <Text style={styles.currencyPrefix}>R$</Text>
        <TextInput
          style={styles.currencyInput}
          placeholder={subField.placeholder ?? '0,00'}
          placeholderTextColor="#94a3b8"
          keyboardType="decimal-pad"
          value={value}
          onChangeText={onChange}
          editable={!disabled}
        />
      </View>
    </View>
  );
}

// Mascara CEP: 00000-000 (5 digitos + hifen + 3 digitos)
function maskCep(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

// Mascara data dd/mm/aaaa (8 digitos brutos -> 10 chars formatados).
function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

// Valida data dd/mm/aaaa (formato + dia/mes/ano coerentes).
function isValidDate(v: string): boolean {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;
  // Valida data real (ex.: 31/02 invalido)
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

// Converte dd/mm/aaaa pra ISO yyyy-mm-dd (formato esperado pelo HubSpot).
function dateToIso(v: string): string {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return v;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Mascara dual CPF/CNPJ: aplica formato de CPF (000.000.000-00) ate 11 digitos
// ou CNPJ (00.000.000/0000-00) acima disso. A property cnpj_cpf no HubSpot
// aceita os dois.
function maskCnpj(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    // CPF
    let out = d;
    if (d.length > 3) out = `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length > 6) out = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    if (d.length > 9) out = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    return out;
  }
  // CNPJ
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// Validacao simples de email (formato basico — RFC completo seria overkill)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());
const isValidCep = (v: string) => v.replace(/\D/g, '').length === 8;
// Aceita 11 (CPF) ou 14 (CNPJ) digitos
const isValidCnpj = (v: string) => {
  const len = v.replace(/\D/g, '').length;
  return len === 11 || len === 14;
};

function DateField({
  subField,
  value,
  onChange,
  disabled,
}: {
  subField: Extract<StageSubField, { kind: 'date' }>;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.subOptionsLabel}>
        {subField.fieldLabel}{subField.optional ? ' (opcional)' : ''}
      </Text>
      <TextInput
        style={styles.plainInput}
        placeholder={subField.placeholder ?? 'dd/mm/aaaa'}
        placeholderTextColor="#94a3b8"
        keyboardType="number-pad"
        value={value}
        onChangeText={(raw) => onChange(maskDate(raw))}
        editable={!disabled}
        maxLength={10}
      />
    </View>
  );
}

function BooleanField({
  subField,
  value,
  onChange,
  color,
  disabled,
}: {
  subField: Extract<StageSubField, { kind: 'boolean' }>;
  value: string; // 'true' | 'false' | ''
  onChange: (v: string) => void;
  color: string;
  disabled: boolean;
}) {
  const opts: Array<{ value: 'true' | 'false'; label: string }> = [
    { value: 'true', label: 'Sim' },
    { value: 'false', label: 'Não' },
  ];
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.subOptionsLabel}>
        {subField.fieldLabel}{subField.optional ? ' (opcional)' : ''}
      </Text>
      <View style={styles.subOptionsGrid}>
        {opts.map((opt) => {
          const selected = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.subOptionChip,
                selected && { backgroundColor: color, borderColor: color },
              ]}
              onPress={() => onChange(opt.value)}
              disabled={disabled}
            >
              <Text style={[styles.subOptionChipText, selected && { color: '#fff' }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function PlainTextField({
  subField,
  value,
  onChange,
  disabled,
  kind,
}: {
  subField: Extract<StageSubField, { kind: 'text' | 'email' | 'cep' | 'cnpj' | 'textarea' }>;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  kind: 'text' | 'email' | 'cep' | 'cnpj' | 'textarea';
}) {
  const keyboardType =
    kind === 'email' ? 'email-address' :
    kind === 'cep' || kind === 'cnpj' ? 'number-pad' : 'default';
  const multiline = kind === 'textarea';
  const autoCapitalize = kind === 'email' ? 'none' : 'sentences';
  const handleChange = (raw: string) => {
    if (kind === 'cep') onChange(maskCep(raw));
    else if (kind === 'cnpj') onChange(maskCnpj(raw));
    else onChange(raw);
  };
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.subOptionsLabel}>
        {subField.fieldLabel}{subField.optional ? ' (opcional)' : ''}
      </Text>
      <TextInput
        style={[styles.plainInput, multiline && styles.plainInputMultiline]}
        placeholder={subField.placeholder ?? ''}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType as any}
        autoCapitalize={autoCapitalize as any}
        autoCorrect={kind !== 'email'}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        value={value}
        onChangeText={handleChange}
        editable={!disabled}
      />
    </View>
  );
}

export function ChangeStageModal({ client, onClose, initialStageId, onDone, onCreateHubspotDeal }: Props) {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(initialStageId ?? null);
  // Modo "etapa fixa" (ex.: mover pra Perdido a partir da tarefa): oculta o
  // seletor de etapas e mostra so os sub-campos da etapa alvo.
  const lockedStage = !!initialStageId;
  const [subValues, setSubValues] = useState<Record<string, string>>({});
  // State paralelo so pra multi-selects. Mantemos separado pra nao precisar
  // serializar arrays como string no Record<string, string> compartilhado.
  const [subValuesMulti, setSubValuesMulti] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  // Trava sincrona anti-double-tap (o submitting via state so' vira true depois
  // de um await, tarde demais pra barrar o 2o toque).
  const submitLockRef = useRef(false);

  // Pin recem-criado: o id_hubspot chega ~1-3s depois do INSERT (a edge
  // function hubspot-sync cria o deal e grava o id direto no Supabase; no
  // fallback n8n pode levar mais). Se o vendedor tenta mover de etapa nessa
  // janela, em vez de bloquear seco, a gente ESPERA o id aparecer — polling
  // curto de 2,5s em 2,5s por ate ~30s, re-buscando do Supabase.
  // resolvedHubspotId comeca com o que veio na prop e e' atualizado quando o
  // polling acha.
  const RESOLVE_MAX_ATTEMPTS = 12;
  const RESOLVE_INTERVAL_MS = 2_500;
  const [resolvedHubspotId, setResolvedHubspotId] = useState<string | null>(
    client.id_hubspot ?? null,
  );
  const [waitingId, setWaitingId] = useState(false);
  const [waitAttempt, setWaitAttempt] = useState(0);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Busca o id_hubspot atual do lead no Supabase (o webhook pode ter gravado
  // depois que o modal abriu). Retorna o id ou null.
  const fetchHubspotId = async (): Promise<string | null> => {
    const { data, error } = await supabase
      .from('clients')
      .select('id_hubspot')
      .eq('id', client.id)
      .maybeSingle();
    if (error) {
      console.warn('[change_stage] re-fetch id_hubspot falhou', error.message);
      return null;
    }
    return (data?.id_hubspot as string | null) ?? null;
  };

  // Garante um id_hubspot antes de enviar. Se ja temos, retorna na hora. Senao
  // faz ate RESOLVE_MAX_ATTEMPTS buscas espacadas, atualizando a UI (timer).
  const ensureHubspotId = async (): Promise<string | null> => {
    if (resolvedHubspotId) return resolvedHubspotId;
    setWaitingId(true);
    try {
      // Conta Alvo: nunca disparou create_pin (o deal so' nasce no engajamento)
      // — cria o deal AGORA em vez de esperar um id que nao viria. Ao mover a
      // etapa, a conta-alvo e' adotada (vira deal no HubSpot).
      if (client.conta_alvo_place_id && onCreateHubspotDeal) {
        const id = await onCreateHubspotDeal(client);
        if (id) { setResolvedHubspotId(id); return id; }
      }
      // Pin normal: o id chega via webhook em ~1-3s — faz o polling.
      for (let attempt = 1; attempt <= RESOLVE_MAX_ATTEMPTS; attempt++) {
        setWaitAttempt(attempt);
        const id = await fetchHubspotId();
        if (id) {
          setResolvedHubspotId(id);
          return id;
        }
        if (attempt < RESOLVE_MAX_ATTEMPTS) await sleep(RESOLVE_INTERVAL_MS);
      }
      // Ultimo recurso (webhook do pin falhou de vez): tenta criar o deal.
      if (onCreateHubspotDeal) {
        const id = await onCreateHubspotDeal(client);
        if (id) { setResolvedHubspotId(id); return id; }
      }
      return null;
    } finally {
      setWaitingId(false);
      setWaitAttempt(0);
    }
  };

  // Etapas do HubSpot (get_stages), com fallback pro cache/STAGES hardcoded.
  const { stages: allStages } = useStages(true);

  // Source of truth das opções: tabela stage_property_options no Supabase.
  // O hardcoded em STAGES é fallback enquanto a query carrega ou se falhar.
  const { data: groupedOptions } = useStagePropertyOptions();

  const queryClient = useQueryClient();

  // Historico local de mudancas — gravado APOS o webhook responder OK pra
  // timeline so refletir o que efetivamente saiu pro HubSpot. Se o INSERT
  // falhar (RLS, tabela ausente etc.) so logamos: a sincronia ja passou.
  const { recordChange } = useClientStageChanges(client.id);
  // Pra registrar o motivo do "Perdido" como nota (que tambem vai pro HubSpot).
  const { addNote } = useClientNotes(client.id);

  // ===== Regra de progressao: avanco LIVRE ate Demo/Proposta ==================
  // (2026-08) Antes era "1 etapa por vez" ate o fim do funil — pra chegar em
  // Demo/Proposta o vendedor tinha que passar por Visita e Conversa uma de cada
  // vez, o que deixava lento. Agora:
  //  - Lead ANTES de Demo/Proposta (ou sem etapa / numa lateral): pode PULAR
  //    direto pra qualquer etapa de (atual+1) ate Demo/Proposta de uma vez.
  //  - Lead EM Demo/Proposta ou DEPOIS: volta a 1 etapa por vez — as seguintes
  //    (Negociacao, Ag. Pagamento, Onboarding) tem campos obrigatorios que nao
  //    devem ser pulados. Teto ajustavel em FREE_ADVANCE_MAX_STAGE_ID.
  //  - Negocio Perdido sempre disponivel.
  // Pelo app o vendedor SO move dentro do funil (FUNNEL_STAGE_IDS) + Perdido; as
  // laterais nao aparecem como destino. Lead numa lateral reentra pelo funil.
  //
  // Obs.: isto NAO mexe no GPS da visita — marcar como visitado continua sendo
  // o check-in mark_client_as_visited (com validacao de localizacao).
  //
  // Indexa as etapas carregadas por id/label pra resolver a etapa atual do lead
  // (client.etapa e' LABEL) e montar os cards a partir do funil.
  const stageById = new Map(allStages.map((s) => [s.id, s]));
  const idByLabel = new Map(allStages.map((s) => [s.label, s.id]));
  const currentStageId = client.etapa ? idByLabel.get(client.etapa) ?? null : null;

  // Posicao da etapa atual DENTRO do funil (-1 se lead sem etapa ou em lateral).
  const currentFunnelIdx = currentStageId ? FUNNEL_STAGE_IDS.indexOf(currentStageId) : -1;
  // Teto do "pulo livre" (Demo/Proposta por padrao).
  const freeMaxIdx = FUNNEL_STAGE_IDS.indexOf(FREE_ADVANCE_MAX_STAGE_ID);

  // Ids do funil oferecidos como destino:
  //  - ainda antes do teto -> todas de (atual+1) ate o teto (inclusive);
  //    lead sem etapa/lateral reentra a partir da 1a (idx 0).
  //  - no teto ou depois    -> apenas a proxima (1 por vez).
  const funnelDestIds =
    currentFunnelIdx >= freeMaxIdx
      ? [FUNNEL_STAGE_IDS[currentFunnelIdx + 1]].filter((id): id is string => !!id)
      : FUNNEL_STAGE_IDS.slice(Math.max(currentFunnelIdx + 1, 0), freeMaxIdx + 1);

  // Monta a lista de destinos: as etapas liberadas do funil + Negocio Perdido.
  // So inclui ids que o app aceita (APP_STAGE_IDS) e que existem no get_stages.
  // Usa o Stage vindo do HubSpot (label/cor/ordem atuais) com os campos do app.
  const destinationIds = [...funnelDestIds, LOST_STAGE_ID].filter(
    (id): id is string => !!id && APP_STAGE_IDS.includes(id) && id !== currentStageId,
  );
  // Modo travado (initialStageId): so a etapa alvo e' destino. Fallback pro
  // hardcoded STAGES se o get_stages ainda nao trouxe essa etapa (garante que
  // "Mover pra Perdido" funcione mesmo com cache de etapas frio).
  const lockedStageObj: Stage | null = lockedStage
    ? (stageById.get(initialStageId!) ?? STAGES.find((s) => s.id === initialStageId) ?? null)
    : null;
  const visibleStages: Stage[] = lockedStage
    ? (lockedStageObj ? [lockedStageObj] : [])
    : destinationIds
        .map((id) => stageById.get(id))
        .filter((s): s is Stage => !!s);

  const selectedStage: Stage | null =
    visibleStages.find((s) => s.id === selectedStageId) ?? null;
  const subFields = selectedStage?.subFields ?? [];

  // Libera submit quando todos os obrigatorios estao preenchidos e validos.
  // Optionals podem estar vazios; se preenchidos tambem precisam ser validos.
  const allFilled = subFields.every((sf) => {
    if (sf.kind === 'select' && sf.multi) {
      const arr = subValuesMulti[sf.field] ?? [];
      if (arr.length === 0) return !!sf.optional;
      return true;
    }
    const raw = subValues[sf.field];
    const empty = !raw || !raw.trim();
    if (empty) return !!sf.optional;
    if (sf.kind === 'currency') return normalizeCurrency(raw) !== null;
    if (sf.kind === 'email') return isValidEmail(raw);
    if (sf.kind === 'cep') return isValidCep(raw);
    if (sf.kind === 'cnpj') return isValidCnpj(raw);
    if (sf.kind === 'date') return isValidDate(raw);
    if (sf.kind === 'boolean') return raw === 'true' || raw === 'false';
    return true;
  });
  const ready = !!selectedStage && allFilled && !submitting && !waitingId;

  const setSubValue = (field: string, value: string) =>
    setSubValues((prev) => ({ ...prev, [field]: value }));

  const toggleSubValueMulti = (field: string, value: string) =>
    setSubValuesMulti((prev) => {
      const current = prev[field] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [field]: next };
    });

  const submit = async () => {
    if (!selectedStage) return;
    // Guard sincrono contra double-tap: setSubmitting(true) so acontece depois
    // do await ensureHubspotId(), entao dois toques rapidos na janela do
    // polling passariam pelo disabled do botao. A ref barra o segundo na hora.
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    try {
      await submitInner();
    } finally {
      submitLockRef.current = false;
    }
  };

  const submitInner = async () => {
    if (!selectedStage) return;
    // Pin recem-criado pode ainda nao ter id_hubspot (webhook do n8n em voo).
    // Espera ele aparecer (polling curto) em vez de recusar de cara.
    const hubspotId = await ensureHubspotId();
    if (!hubspotId) {
      Alert.alert(
        'ID HubSpot ainda não chegou',
        'Esse pin foi criado há pouco e o ID do HubSpot ainda não sincronizou (tentei por ~30s). Aguarde alguns segundos e toque em enviar de novo. Se persistir, avise o suporte.',
      );
      return;
    }

    // Valida cada sub-field individualmente e monta sub_values normalizado.
    // Booleans entram como true/false nativos, datas como ISO yyyy-mm-dd,
    // multi-selects como array. Opcionais vazios sao omitidos do payload
    // (n8n decide o default).
    const subValuesPayload: Record<string, unknown> = {};
    for (const sf of subFields) {
      // Multi-select: paga state separado, envia como array.
      if (sf.kind === 'select' && sf.multi) {
        const arr = subValuesMulti[sf.field] ?? [];
        if (arr.length === 0) {
          if (sf.optional) continue;
          Alert.alert('Falta preencher', `Selecione pelo menos uma opcao em "${sf.fieldLabel}".`);
          return;
        }
        subValuesPayload[sf.field] = arr;
        continue;
      }
      const raw = subValues[sf.field]?.trim() ?? '';
      if (!raw) {
        if (sf.optional) continue;
        Alert.alert('Falta preencher', `Preencha "${sf.fieldLabel}".`);
        return;
      }
      if (sf.kind === 'currency') {
        const normalized = normalizeCurrency(raw);
        if (normalized === null) {
          Alert.alert(
            'Valor inválido',
            `"${sf.fieldLabel}" precisa ser um número (ex.: 1500 ou 1500,50).`,
          );
          return;
        }
        subValuesPayload[sf.field] = normalized;
      } else if (sf.kind === 'email') {
        if (!isValidEmail(raw)) {
          Alert.alert('E-mail inválido', `"${sf.fieldLabel}" precisa ser um e-mail válido.`);
          return;
        }
        subValuesPayload[sf.field] = raw.toLowerCase();
      } else if (sf.kind === 'cep') {
        if (!isValidCep(raw)) {
          Alert.alert('CEP inválido', `"${sf.fieldLabel}" precisa ter 8 dígitos.`);
          return;
        }
        // Envia so digitos pro webhook — quem consome decide se aplica mascara
        subValuesPayload[sf.field] = raw.replace(/\D/g, '');
      } else if (sf.kind === 'cnpj') {
        if (!isValidCnpj(raw)) {
          Alert.alert('CNPJ / CPF inválido', `"${sf.fieldLabel}" precisa ter 11 dígitos (CPF) ou 14 dígitos (CNPJ).`);
          return;
        }
        subValuesPayload[sf.field] = raw.replace(/\D/g, '');
      } else if (sf.kind === 'date') {
        if (!isValidDate(raw)) {
          Alert.alert('Data inválida', `"${sf.fieldLabel}" precisa estar no formato dd/mm/aaaa.`);
          return;
        }
        // ISO yyyy-mm-dd — formato esperado pelo HubSpot.
        subValuesPayload[sf.field] = dateToIso(raw);
      } else if (sf.kind === 'boolean') {
        if (raw !== 'true' && raw !== 'false') {
          Alert.alert('Selecione', `Escolha Sim ou Não em "${sf.fieldLabel}".`);
          return;
        }
        // Boolean nativo no payload (n8n / HubSpot esperam true/false reais).
        subValuesPayload[sf.field] = raw === 'true';
      } else {
        subValuesPayload[sf.field] = raw;
      }
    }

    // Payload identico ao que o n8n recebia — a edge function hubspot-sync
    // trata o mesmo formato, e o fallback pro n8n reusa o payload como sempre.
    const payload: Record<string, unknown> = {
      type: 'change_stage',
      id: client.id,
      id_hubspot: hubspotId,
      stage_id: selectedStage.id,
      stage_label: selectedStage.label,
    };
    if (subFields.length > 0) {
      payload.sub_values = subValuesPayload;
    }

    // ===== UI instantanea =====
    // Nada de segurar o vendedor esperando rede: reflete a etapa nova no cache
    // do react-query e fecha o modal JA. A sincronizacao (Supabase + HubSpot)
    // roda em background; a tarefa que originou (onDone) so e' resolvida quando
    // o sync CONFIRMA — se falhar de vez, reverte a etapa e reabre a tarefa.
    setSubmitting(true);
    const previousEtapa = client.etapa ?? null;
    const newEtapa = selectedStage.label;
    const stage = selectedStage;
    const subPayload = subFields.length > 0 ? (subValuesPayload as Record<string, unknown>) : null;

    // Patch cirurgico no cache: o pin/lista/detalhe mostram a etapa nova sem
    // rebaixar a lista inteira de clientes.
    queryClient.setQueriesData<Client[] | undefined>({ queryKey: ['clients'] }, (old) =>
      old?.map((c) => (c.id === client.id ? { ...c, etapa: newEtapa } : c)),
    );

    (async () => {
      // 1) Persiste a etapa nova em clients.etapa. A reconciliacao oficial
      //    (edge function le o estado canonico do HubSpot ~10s depois) grava o
      //    mesmo label + owner em seguida.
      try {
        const { error: etapaErr } = await supabase
          .from('clients')
          .update({ etapa: newEtapa, updated_at: new Date().toISOString() })
          .eq('id', client.id);
        if (etapaErr) console.warn('[change_stage] update de etapa falhou', etapaErr.message);
      } catch (err) {
        console.warn('[change_stage] update de etapa falhou', err);
      }
      // Tarefas de cadencia derivam da etapa — refresca.
      queryClient.invalidateQueries({ queryKey: ['client_tasks'] });

      // 2) Sincroniza com o HubSpot (change_stage e' PATCH idempotente, entao
      //    reexecutar e' seguro): edge function hubspot-sync, com fallback pro
      //    n8n dentro do sendHubspotEvent. 1 retry por cima.
      let synced = false;
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= 2 && !synced; attempt++) {
        try {
          await sendHubspotEvent(payload);
          synced = true;
        } catch (err) {
          lastErr = err;
          if (attempt < 2) await sleep(2000);
        }
      }

      if (!synced) {
        // Nem edge nem n8n aceitaram. Reverte pra etapa anterior — MAS so' se
        // ninguem gravou o estado canonico no meio-tempo (a reconciliacao
        // server-side da edge pode ter aplicado a etapa NOVA mesmo com a
        // resposta se perdendo). O .eq('etapa', newEtapa) garante que o revert
        // nao atropela um write mais recente e correto.
        console.warn('[change_stage] sync HubSpot falhou', lastErr);
        try {
          await supabase
            .from('clients')
            .update({ etapa: previousEtapa, updated_at: new Date().toISOString() })
            .eq('id', client.id)
            .eq('etapa', newEtapa);
        } catch (err) {
          console.warn('[change_stage] revert de etapa falhou', err);
        }
        queryClient.invalidateQueries({ queryKey: ['clients'] });
        queryClient.invalidateQueries({ queryKey: ['client_tasks'] });
        // Nao chama onDone: a tarefa que originou continua pendente pro
        // vendedor tentar de novo.
        Alert.alert(
          'Falha ao sincronizar etapa',
          `Não consegui enviar ${client.nome} para ${newEtapa} (sem conexão?). A etapa foi revertida — tente novamente.`,
        );
        return;
      }

      // 3) Sync OK — agora sim resolve a tarefa que originou a mudanca.
      onDone?.();

      // Pos-processamento. Timeline local — gravada APOS a sincronia passar,
      // pra refletir so o que efetivamente saiu pro HubSpot.
      try {
        await recordChange.mutateAsync({
          fromStage: previousEtapa,
          toStage: stage.label,
          toStageId: stage.id,
          subValues: subPayload,
        });
      } catch (err) {
        console.warn('Falhou ao registrar mudanca de etapa no historico', err);
      }

      // Carimbo de fechamento: se a etapa nova e' uma das WON (Negocio Fechado
      // OU Enviado Onboarding), marca won_at UMA UNICA VEZ. O update so aplica
      // quando won_at ainda e' NULL, entao o lead passar pelas duas etapas nao
      // recarimba (conta como 1 fechamento).
      if (WON_STAGE_IDS.includes(stage.id)) {
        try {
          await supabase.rpc('stamp_won_at', { p_client_id: client.id });
        } catch (err) {
          console.warn('Falhou ao carimbar won_at', err);
        }
      }

      // Ao mover pra Perdido, registra o motivo como NOTA (que tambem sincroniza
      // pro HubSpot via create_note). Assim o gestor ve o motivo no historico
      // do lead, nao so no sub_values da timeline.
      if (stage.id === LOST_STAGE_ID) {
        const motivo = subPayload?.['motivo_do_perdido'];
        const motivoTxt = Array.isArray(motivo) ? motivo.join(', ') : (motivo ? String(motivo) : null);
        if (motivoTxt) {
          try {
            await addNote.mutateAsync(`Negócio perdido — motivo: ${motivoTxt}`);
          } catch (err) {
            console.warn('Falhou ao registrar nota do motivo perdido', err);
          }
        }
      }
    })();

    // Modal fecha JA — o vendedor segue pro proximo passo sem esperar rede.
    // (onDone/onClose: onClose fecha a UI; onDone so' roda no sucesso, acima.)
    onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={submitting ? undefined : onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheet}
        >
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.headerRow}>
              <Text style={styles.title}>
                {lockedStage ? '🚫 Mover para perdido' : '🔄 Mover para etapa'}
              </Text>
              <TouchableOpacity onPress={onClose} disabled={submitting}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle} numberOfLines={2}>
              {client.nome}
              {client.empresa ? ` • ${client.empresa}` : ''}
            </Text>

            {!resolvedHubspotId && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⏳ Esse pin foi criado há pouco e o ID do HubSpot ainda pode
                  estar sincronizando. Pode escolher a etapa normalmente — ao
                  enviar, o app aguarda o ID chegar (alguns segundos) antes de
                  concluir.
                </Text>
              </View>
            )}

            <Text style={styles.sectionLabel}>
              {lockedStage ? 'Informe o motivo da perda' : 'Escolha a etapa nova'}
            </Text>

            {visibleStages.map((stage) => {
              const isSelected = selectedStageId === stage.id;
              return (
                <View key={stage.id}>
                  <TouchableOpacity
                    style={[
                      styles.stageCard,
                      isSelected && {
                        borderColor: stage.color,
                        backgroundColor: `${stage.color}10`,
                      },
                    ]}
                    onPress={() => {
                      if (lockedStage) return; // etapa fixa: nao permite trocar
                      setSelectedStageId(stage.id);
                      setSubValues({});
                      setSubValuesMulti({});
                    }}
                    disabled={submitting || lockedStage}
                    activeOpacity={lockedStage ? 1 : 0.2}
                  >
                    <View style={[styles.stageDot, { backgroundColor: stage.color }]} />
                    <Text
                      style={[styles.stageLabel, isSelected && { color: stage.color }]}
                    >
                      {stage.label}
                    </Text>
                    {stage.subFields && stage.subFields.length > 0 && (() => {
                      const required = stage.subFields.filter((s) => !s.optional).length;
                      const optional = stage.subFields.length - required;
                      return (
                        <Text style={styles.stageHint}>
                          + {required} obrig.{optional > 0 ? ` (${optional} opc.)` : ''}
                        </Text>
                      );
                    })()}
                  </TouchableOpacity>

                  {/* Sub-fields inline. Cada etapa pode ter múltiplos
                      (NEGOCIAÇÃO precisa de plano_apresentado + mrr). */}
                  {isSelected && stage.subFields && stage.subFields.length > 0 && (
                    <View
                      style={[styles.subOptionsWrap, { borderLeftColor: stage.color }]}
                    >
                      {stage.subFields.map((sf) => {
                        if (sf.kind === 'select') {
                          const dbGroup = groupedOptions?.[sf.field];
                          if (sf.multi) {
                            return (
                              <MultiSelectField
                                key={sf.field}
                                subField={sf}
                                values={subValuesMulti[sf.field] ?? []}
                                onToggle={(v) => toggleSubValueMulti(sf.field, v)}
                                color={stage.color}
                                disabled={submitting}
                                dbOptions={dbGroup?.options}
                                dbLabel={dbGroup?.label}
                              />
                            );
                          }
                          return (
                            <SelectField
                              key={sf.field}
                              subField={sf}
                              value={subValues[sf.field] ?? ''}
                              onChange={(v) => setSubValue(sf.field, v)}
                              color={stage.color}
                              disabled={submitting}
                              dbOptions={dbGroup?.options}
                              dbLabel={dbGroup?.label}
                            />
                          );
                        }
                        if (sf.kind === 'currency') {
                          return (
                            <CurrencyField
                              key={sf.field}
                              subField={sf}
                              value={subValues[sf.field] ?? ''}
                              onChange={(v) => setSubValue(sf.field, v)}
                              disabled={submitting}
                            />
                          );
                        }
                        if (sf.kind === 'date') {
                          return (
                            <DateField
                              key={sf.field}
                              subField={sf}
                              value={subValues[sf.field] ?? ''}
                              onChange={(v) => setSubValue(sf.field, v)}
                              disabled={submitting}
                            />
                          );
                        }
                        if (sf.kind === 'boolean') {
                          return (
                            <BooleanField
                              key={sf.field}
                              subField={sf}
                              value={subValues[sf.field] ?? ''}
                              onChange={(v) => setSubValue(sf.field, v)}
                              color={stage.color}
                              disabled={submitting}
                            />
                          );
                        }
                        return (
                          <PlainTextField
                            key={sf.field}
                            subField={sf}
                            kind={sf.kind}
                            value={subValues[sf.field] ?? ''}
                            onChange={(v) => setSubValue(sf.field, v)}
                            disabled={submitting}
                          />
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}

            <TouchableOpacity
              style={[styles.submit, !ready && styles.disabled]}
              onPress={submit}
              disabled={!ready}
            >
              {waitingId ? (
                <View style={styles.submitWaitRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.submitText}>
                    Sincronizando ID… ({waitAttempt}/{RESOLVE_MAX_ATTEMPTS})
                  </Text>
                </View>
              ) : submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>
                  {selectedStage
                    ? `Mover para ${selectedStage.label}`
                    : 'Escolha uma etapa'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  closeBtn: { fontSize: 22, color: '#94a3b8', paddingHorizontal: 4 },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 10,
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warningText: { fontSize: 12, color: '#92400e', lineHeight: 17 },
  stageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    marginBottom: 8,
    gap: 10,
  },
  stageDot: { width: 12, height: 12, borderRadius: 6 },
  stageLabel: { fontSize: 14, fontWeight: '700', color: '#0f172a', flex: 1 },
  stageHint: { fontSize: 10, color: '#94a3b8', fontStyle: 'italic' },
  subOptionsWrap: {
    marginLeft: 18,
    marginBottom: 12,
    paddingLeft: 14,
    paddingVertical: 10,
    borderLeftWidth: 3,
  },
  subOptionsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  subOptionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subOptionChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  subOptionChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
  },
  currencyPrefix: { fontSize: 14, fontWeight: '700', color: '#475569', marginRight: 6 },
  currencyInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#0f172a' },
  plainInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  plainInputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  submitWaitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  submit: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
