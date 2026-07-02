import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Client, ClientMeeting, MeetingType } from '../types/client';
import { useMeetings } from '../hooks/useMeetings';

interface ScheduleMeetingModalProps {
  client: Client;
  onClose: () => void;
  // Reunião (default) ou follow up. Mesmo fluxo; muda rótulos e o tipo salvo.
  meetingType?: MeetingType;
}

// Textos que variam entre reunião e follow up.
const COPY: Record<MeetingType, {
  emoji: string;
  noun: string;      // "reunião" / "follow up"
  title: string;     // título do modal
  scheduledAlert: string;
  buttonLabel: string;
  listTitle: string;
  emptyList: string;
  cancelTitle: string;
}> = {
  reuniao: {
    emoji: '📅',
    noun: 'reunião',
    title: '📅 Agendar reunião',
    scheduledAlert: 'Reunião agendada',
    buttonLabel: 'Confirmar agendamento',
    listTitle: 'Reuniões deste lead',
    emptyList: 'Nenhuma reunião agendada.',
    cancelTitle: 'Cancelar reunião',
  },
  follow_up: {
    emoji: '🔁',
    noun: 'follow up',
    title: '🔁 Marcar Follow Up',
    scheduledAlert: 'Follow up marcado',
    buttonLabel: 'Confirmar follow up',
    listTitle: 'Follow ups deste lead',
    emptyList: 'Nenhum follow up marcado.',
    cancelTitle: 'Cancelar follow up',
  },
};

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 00, 05, ..., 55

const DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 h' },
  { value: 90, label: '1 h 30' },
  { value: 120, label: '2 h' },
];
const DEFAULT_DURATION = 30;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const formatMeetingDateLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const pad = (n: number) => String(n).padStart(2, '0');

function Calendar({
  selected,
  onSelect,
}: {
  selected: Date | null;
  onSelect: (d: Date) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [view, setView] = useState(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Grid: posições vazias antes do dia 1 + dias do mês.
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Completa a última semana pra grid 7xN ficar alinhada visualmente.
  while (cells.length % 7 !== 0) cells.push(null);

  const goPrev = () => setView(new Date(year, month - 1, 1));
  const goNext = () => setView(new Date(year, month + 1, 1));

  return (
    <View style={calStyles.wrap}>
      <View style={calStyles.header}>
        <TouchableOpacity onPress={goPrev} style={calStyles.navBtn}>
          <Text style={calStyles.navTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={calStyles.title}>{MESES[month]} {year}</Text>
        <TouchableOpacity onPress={goNext} style={calStyles.navBtn}>
          <Text style={calStyles.navTxt}>›</Text>
        </TouchableOpacity>
      </View>
      <View style={calStyles.weekRow}>
        {DIAS_SEMANA.map((d, i) => (
          <Text key={i} style={calStyles.weekDay}>{d}</Text>
        ))}
      </View>
      <View style={calStyles.grid}>
        {cells.map((day, idx) => {
          if (day == null) {
            return <View key={idx} style={calStyles.cellEmpty} />;
          }
          const cellDate = new Date(year, month, day);
          const isPast = cellDate.getTime() < today.getTime();
          const isToday = sameDay(cellDate, today);
          const isSelected = selected ? sameDay(cellDate, selected) : false;
          return (
            <TouchableOpacity
              key={idx}
              style={[
                calStyles.cell,
                isToday && calStyles.cellToday,
                isSelected && calStyles.cellSelected,
                isPast && calStyles.cellPast,
              ]}
              onPress={() => { if (!isPast) onSelect(cellDate); }}
              disabled={isPast}
            >
              <Text
                style={[
                  calStyles.cellTxt,
                  isPast && calStyles.cellTxtPast,
                  isSelected && calStyles.cellTxtSelected,
                ]}
              >
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function HourMinutePicker({
  hour,
  minute,
  onChange,
}: {
  hour: number | null;
  minute: number | null;
  onChange: (h: number | null, m: number | null) => void;
}) {
  return (
    <View style={pickerStyles.wrap}>
      <View style={pickerStyles.col}>
        <Text style={pickerStyles.colLabel}>Hora</Text>
        <ScrollView style={pickerStyles.list} nestedScrollEnabled>
          {HOURS.map((h) => {
            const active = hour === h;
            return (
              <TouchableOpacity
                key={h}
                style={[pickerStyles.item, active && pickerStyles.itemActive]}
                onPress={() => onChange(h, minute)}
              >
                <Text style={[pickerStyles.itemTxt, active && pickerStyles.itemTxtActive]}>
                  {pad(h)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <View style={pickerStyles.col}>
        <Text style={pickerStyles.colLabel}>Minuto</Text>
        <ScrollView style={pickerStyles.list} nestedScrollEnabled>
          {MINUTES.map((m) => {
            const active = minute === m;
            return (
              <TouchableOpacity
                key={m}
                style={[pickerStyles.item, active && pickerStyles.itemActive]}
                onPress={() => onChange(hour, m)}
              >
                <Text style={[pickerStyles.itemTxt, active && pickerStyles.itemTxtActive]}>
                  {pad(m)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

export function ScheduleMeetingModal({ client, onClose, meetingType = 'reuniao' }: ScheduleMeetingModalProps) {
  const copy = COPY[meetingType];
  const { addMeeting, meetingsByClient, deleteMeeting } = useMeetings();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(DEFAULT_DURATION);
  const [observacoes, setObservacoes] = useState('');
  // Convite por email: default ligado se o cliente já tem email cadastrado.
  const [enviarConvite, setEnviarConvite] = useState<boolean>(!!client.email);
  const [inviteEmail, setInviteEmail] = useState<string>(client.email ?? '');

  // Só lista agendamentos do MESMO tipo (reunião mostra reuniões, follow up
  // mostra follow ups). Linhas antigas sem type caem em 'reuniao'.
  const clientMeetings = useMemo<ClientMeeting[]>(
    () =>
      (meetingsByClient[client.id] ?? [])
        .filter(m => (m.type ?? 'reuniao') === meetingType)
        .slice()
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [meetingsByClient, client.id, meetingType],
  );

  const dateLabel = selectedDate
    ? selectedDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Nenhuma data selecionada';
  const timeLabel = hour != null && minute != null ? `${pad(hour)}:${pad(minute)}` : '--:--';

  const submit = async () => {
    if (addMeeting.isPending) return;
    if (!selectedDate) {
      Alert.alert('Data ausente', 'Escolha uma data no calendário.');
      return;
    }
    if (hour == null || minute == null) {
      Alert.alert('Horário ausente', 'Escolha hora e minuto.');
      return;
    }
    const dt = new Date(
      selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(),
      hour, minute, 0, 0,
    );
    if (dt.getTime() < Date.now() - 60_000) {
      Alert.alert('Data no passado', 'A data e horário devem ser no futuro.');
      return;
    }

    const inviteEmailTrim = inviteEmail.trim();
    if (enviarConvite) {
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmailTrim);
      if (!emailValid) {
        Alert.alert('Email inválido', 'Informe um email válido para enviar o convite ou desligue a opção.');
        return;
      }
    }

    try {
      await addMeeting.mutateAsync({
        form: {
          client_id: client.id,
          scheduled_at: dt.toISOString(),
          duration_minutes: duration,
          observacoes: observacoes.trim() || null,
          type: meetingType,
        },
        client,
        invite: { enviar: enviarConvite, email: enviarConvite ? inviteEmailTrim : null },
      });
      setSelectedDate(null);
      setHour(null);
      setMinute(null);
      setDuration(DEFAULT_DURATION);
      setObservacoes('');
      setEnviarConvite(!!client.email);
      setInviteEmail(client.email ?? '');
      Alert.alert(
        copy.scheduledAlert,
        'Agendamento salvo com sucesso.',
        [{ text: 'OK', onPress: onClose }],
      );
    } catch (err: any) {
      Alert.alert('Erro ao agendar', err?.message || 'Tente novamente.');
    }
  };

  const confirmDelete = (meeting: ClientMeeting) => {
    Alert.alert(
      copy.cancelTitle,
      `Remover ${copy.noun} de ${formatMeetingDateLabel(meeting.scheduled_at)}?`,
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            deleteMeeting.mutate(meeting.id, {
              onError: (err: any) => Alert.alert('Erro', err?.message || 'Não foi possível remover.'),
            });
          },
        },
      ],
    );
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheet}
        >
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.headerRow}>
              <Text style={styles.title}>{copy.title}</Text>
              <TouchableOpacity onPress={onClose} disabled={addMeeting.isPending}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle} numberOfLines={2}>
              {client.nome}{client.empresa ? ` • ${client.empresa}` : ''}
            </Text>

            <Text style={styles.label}>Data</Text>
            <Calendar selected={selectedDate} onSelect={setSelectedDate} />
            <Text style={styles.summary}>{dateLabel}</Text>

            <Text style={styles.label}>Horário</Text>
            <HourMinutePicker
              hour={hour}
              minute={minute}
              onChange={(h, m) => { setHour(h); setMinute(m); }}
            />
            <Text style={styles.summary}>{timeLabel}</Text>

            <Text style={styles.label}>Duração</Text>
            <View style={styles.durationRow}>
              {DURATION_OPTIONS.map((opt) => {
                const active = duration === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.durationChip, active && styles.durationChipActive]}
                    onPress={() => setDuration(opt.value)}
                    disabled={addMeeting.isPending}
                  >
                    <Text style={[styles.durationChipTxt, active && styles.durationChipTxtActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Observações</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder={`Anotações sobre o ${copy.noun}...`}
              placeholderTextColor="#94a3b8"
              value={observacoes}
              onChangeText={setObservacoes}
              multiline
              textAlignVertical="top"
              editable={!addMeeting.isPending}
            />

            <View style={styles.inviteBox}>
              <View style={styles.inviteHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteTitle}>Enviar convite por email</Text>
                  <Text style={styles.inviteSubtitle}>
                    {client.email
                      ? `Cadastrado: ${client.email}`
                      : 'Cliente sem email cadastrado — informe abaixo.'}
                  </Text>
                </View>
                <Switch
                  value={enviarConvite}
                  onValueChange={setEnviarConvite}
                  trackColor={{ false: '#cbd5e1', true: '#a78bfa' }}
                  thumbColor={enviarConvite ? '#7c3aed' : '#f8fafc'}
                  disabled={addMeeting.isPending}
                />
              </View>
              {enviarConvite && (
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder="email@exemplo.com"
                  placeholderTextColor="#94a3b8"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!addMeeting.isPending}
                />
              )}
            </View>

            <TouchableOpacity
              style={[styles.submit, addMeeting.isPending && styles.disabled]}
              onPress={submit}
              disabled={addMeeting.isPending}
            >
              {addMeeting.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>{copy.buttonLabel}</Text>
              )}
            </TouchableOpacity>

            {clientMeetings.length > 0 && (
              <View style={styles.listSection}>
                <Text style={styles.listTitle}>{copy.listTitle}</Text>
                {clientMeetings.map((m) => {
                  const isPast = new Date(m.scheduled_at).getTime() < Date.now();
                  return (
                    <View key={m.id} style={[styles.meetingRow, isPast && { opacity: 0.6 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.meetingDate}>
                          {formatMeetingDateLabel(m.scheduled_at)}
                          {isPast ? ' • passada' : ''}
                        </Text>
                        {m.observacoes ? (
                          <Text style={styles.meetingObs} numberOfLines={2}>
                            {m.observacoes}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={styles.meetingDelete}
                        onPress={() => confirmDelete(m)}
                      >
                        <Text style={styles.meetingDeleteText}>Remover</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
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
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summary: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#0f172a',
  },
  textarea: { height: 90 },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  durationChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  durationChipTxt: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  durationChipTxtActive: { color: '#fff' },
  inviteBox: {
    marginTop: 16,
    backgroundColor: '#f5f3ff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inviteTitle: { fontSize: 14, fontWeight: '700', color: '#5b21b6' },
  inviteSubtitle: { fontSize: 12, color: '#6d28d9', marginTop: 2 },
  submit: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  listSection: { marginTop: 24 },
  listTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  meetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  meetingDate: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  meetingObs: { fontSize: 12, color: '#64748b', marginTop: 2 },
  meetingDelete: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  meetingDeleteText: { fontSize: 12, fontWeight: '700', color: '#dc2626' },
});

const calStyles = StyleSheet.create({
  wrap: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
  },
  navTxt: { fontSize: 22, color: '#0f172a', marginTop: -2, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  weekRow: { flexDirection: 'row' },
  weekDay: {
    flex: 1, textAlign: 'center',
    fontSize: 11, fontWeight: '700', color: '#64748b',
    paddingVertical: 6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  cellEmpty: { width: `${100 / 7}%`, aspectRatio: 1 },
  cellToday: { borderWidth: 1, borderColor: '#7c3aed' },
  cellSelected: { backgroundColor: '#7c3aed' },
  cellPast: { opacity: 0.35 },
  cellTxt: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  cellTxtPast: { color: '#94a3b8' },
  cellTxtSelected: { color: '#fff', fontWeight: '700' },
});

const pickerStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  col: { flex: 1 },
  colLabel: {
    fontSize: 11, fontWeight: '700', color: '#64748b',
    textAlign: 'center', marginBottom: 6, textTransform: 'uppercase',
  },
  list: { maxHeight: 160 },
  item: {
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 2,
  },
  itemActive: { backgroundColor: '#7c3aed' },
  itemTxt: { fontSize: 16, color: '#0f172a', fontWeight: '600' },
  itemTxtActive: { color: '#fff', fontWeight: '700' },
});
