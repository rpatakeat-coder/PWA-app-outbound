import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { Client, ClientMeeting, ClientMeetingFormData } from '../types/client';
import {
  sendHubspotEvent,
  createAgendaEngagement,
  rescheduleAgendaEngagement,
  cancelAgendaEngagement,
} from '../utils/hubspotSync';

export function useMeetings() {
  const queryClient = useQueryClient();
  const { isAuthenticated, user, profile } = useAuth();

  // Carrega reuniões agendadas pelo proprio usuario (a policy do banco ja
  // filtra; o .eq aqui eh defensivo + ajuda performance). Gestor (role no
  // banco) faz bypass: pega tudo, igual o RLS permite.
  const isGestor = profile?.role === 'gestor';
  const query = useQuery<ClientMeeting[]>({
    queryKey: ['client_meetings', isGestor ? 'all' : user?.id],
    queryFn: async () => {
      let q = supabase.from('client_meetings').select('*');
      if (!isGestor && user?.id) {
        q = q.eq('created_by', user.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClientMeeting[];
    },
    enabled: isAuthenticated && !!user?.id,
  });

  const meetings = query.data ?? [];

  const meetingsByClient = meetings.reduce<Record<string, ClientMeeting[]>>((acc, m) => {
    if (!acc[m.client_id]) acc[m.client_id] = [];
    acc[m.client_id].push(m);
    return acc;
  }, {});

  const upcomingByClient = meetings.reduce<Record<string, number>>((acc, m) => {
    if (m.status !== 'agendada') return acc;
    if (new Date(m.scheduled_at).getTime() < Date.now()) return acc;
    acc[m.client_id] = (acc[m.client_id] ?? 0) + 1;
    return acc;
  }, {});

  const addMeeting = useMutation({
    mutationFn: async ({
      form,
      client,
      invite,
    }: {
      form: ClientMeetingFormData;
      client: Client;
      invite?: { enviar: boolean; email: string | null };
    }) => {
      const insertPayload = {
        client_id: form.client_id,
        scheduled_at: form.scheduled_at,
        duration_minutes: form.duration_minutes,
        observacoes: form.observacoes ?? null,
        type: form.type,
        created_by: user?.id ?? null,
      };

      const { data, error } = await supabase
        .from('client_meetings')
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      const meeting = data as ClientMeeting;

      const scheduled = new Date(meeting.scheduled_at);
      const ends = new Date(scheduled.getTime() + meeting.duration_minutes * 60_000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const data_reuniao = `${pad(scheduled.getDate())}/${pad(scheduled.getMonth() + 1)}/${scheduled.getFullYear()}`;
      const horario = `${pad(scheduled.getHours())}:${pad(scheduled.getMinutes())}`;
      const horario_fim = `${pad(ends.getHours())}:${pad(ends.getMinutes())}`;

      // Título sugerido pro Google Agenda — n8n usa pra diferenciar
      // reunião de follow up na organização da agenda.
      const isFollowUp = meeting.type === 'follow_up';
      const titulo_evento = isFollowUp
        ? `Follow Up - ${client.nome}`
        : `Reunião - ${client.nome}`;

      // reuniao/followup criam evento no Google Calendar — isso CONTINUA no
      // n8n (credencial OAuth do Google vive la); o helper roteia direto.
      sendHubspotEvent({
          // O Switch do n8n espera 'reuniao' | 'followup' (SEM underscore —
          // validado em 07/07/2026: 'follow_up' não casa com a rota e cai na
          // default de criar deal no HubSpot). No banco o tipo segue 'follow_up'.
          type: isFollowUp ? 'followup' : meeting.type,
          titulo_evento,
          meeting_id: meeting.id,
          lead_id: client.id,
          lead_nome: client.nome,
          lead_empresa: client.empresa,
          lead_status: client.status,
          lead_email: client.email,
          latitude: client.latitude !== null ? String(client.latitude) : null,
          longitude: client.longitude !== null ? String(client.longitude) : null,
          data_reuniao,
          horario,
          horario_fim,
          duracao_minutos: meeting.duration_minutes,
          scheduled_at: meeting.scheduled_at,
          ends_at: ends.toISOString(),
          observacoes: meeting.observacoes,
          enviar_convite_email: invite?.enviar ?? false,
          email_convite: invite?.enviar ? (invite.email ?? null) : null,
          vendedor_id: profile?.id_hubspot ?? null,
          vendedor_nome: profile?.full_name ?? null,
          vendedor_email: profile?.email ?? null,
          vendedor_uid: user?.id ?? null,
          enviado_em: new Date().toISOString(),
      }).catch((err) => console.warn('[WEBHOOK] reuniao falhou:', err));

      // Follow up -> Task no HubSpot; demo/reuniao -> Meeting no HubSpot.
      // AWAITED (nao fire-and-forget): no mobile, uma Promise solta era suspensa
      // quando o vendedor fechava o modal / trocava de tela logo apos agendar, e
      // a criacao se perdia (reuniao/follow up ficava sem engagement). Esperar
      // aqui garante criar + gravar o id ANTES do mutation resolver (o spinner
      // "salvando" ja cobre esse tempinho). Erro no HubSpot NAO quebra o
      // agendamento — a reuniao ja esta salva no banco.
      if (client.id_hubspot) {
        try {
          const engagementId = await createAgendaEngagement({
            meetingType: meeting.type ?? 'reuniao',
            id_hubspot: client.id_hubspot as string,
            titulo: titulo_evento,
            descricao: meeting.observacoes,
            scheduled_at: meeting.scheduled_at,
            duration_minutes: meeting.duration_minutes,
            owner_id: profile?.id_hubspot ?? null,
          });
          if (engagementId) {
            await supabase
              .from('client_meetings')
              .update({ hs_engagement_id: engagementId })
              .eq('id', meeting.id);
          }
        } catch (err) {
          console.warn('[HUBSPOT] criar engagement da agenda falhou:', err);
        }
      }

      return meeting;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client_meetings'] }),
  });

  // Reagenda uma reunião existente: muda data/hora (e opcionalmente duração e
  // observações) na MESMA linha, e dispara o webhook de novo pro n8n atualizar
  // o evento no Google Agenda. Mantém o id — o n8n casa pelo meeting_id.
  const rescheduleMeeting = useMutation({
    mutationFn: async ({
      meeting,
      client,
      scheduled_at,
      duration_minutes,
      observacoes,
      invite,
      motivo,
    }: {
      meeting: ClientMeeting;
      client: Client;
      scheduled_at: string;
      duration_minutes: number;
      observacoes?: string | null;
      invite?: { enviar: boolean; email: string | null };
      motivo?: string | null;
    }) => {
      // Guarda o horário anterior nas observações pra ficar o rastro de que
      // houve remarcação (o card não tem campo próprio pra histórico).
      const prev = new Date(meeting.scheduled_at);
      const padN = (n: number) => String(n).padStart(2, '0');
      const prevLabel = `${padN(prev.getDate())}/${padN(prev.getMonth() + 1)}/${prev.getFullYear()} ${padN(prev.getHours())}:${padN(prev.getMinutes())}`;
      const trilha = `[Reagendada — antes: ${prevLabel}${motivo ? ` • motivo: ${motivo}` : ''}]`;
      const baseObs = (observacoes ?? meeting.observacoes ?? '').trim();
      const novaObs = baseObs ? `${trilha}\n${baseObs}` : trilha;

      const { data, error } = await supabase
        .from('client_meetings')
        .update({
          scheduled_at,
          duration_minutes,
          observacoes: novaObs,
          status: 'agendada',
        })
        .eq('id', meeting.id)
        .select()
        .single();
      if (error) throw error;
      const updated = data as ClientMeeting;

      const scheduled = new Date(updated.scheduled_at);
      const ends = new Date(scheduled.getTime() + updated.duration_minutes * 60_000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const data_reuniao = `${pad(scheduled.getDate())}/${pad(scheduled.getMonth() + 1)}/${scheduled.getFullYear()}`;
      const horario = `${pad(scheduled.getHours())}:${pad(scheduled.getMinutes())}`;
      const horario_fim = `${pad(ends.getHours())}:${pad(ends.getMinutes())}`;

      const isFollowUp = updated.type === 'follow_up';
      const titulo_evento = isFollowUp
        ? `Follow Up - ${client.nome}`
        : `Reunião - ${client.nome}`;

      // Mesmo webhook do agendamento (n8n roteia por 'type'), mas com
      // reagendamento=true + o horário antigo pra ele achar/mover o evento.
      sendHubspotEvent({
        type: isFollowUp ? 'followup' : updated.type,
        reagendamento: true,
        scheduled_at_anterior: meeting.scheduled_at,
        motivo_reagendamento: motivo ?? null,
        titulo_evento,
        meeting_id: updated.id,
        lead_id: client.id,
        lead_nome: client.nome,
        lead_empresa: client.empresa,
        lead_status: client.status,
        lead_email: client.email,
        latitude: client.latitude !== null ? String(client.latitude) : null,
        longitude: client.longitude !== null ? String(client.longitude) : null,
        data_reuniao,
        horario,
        horario_fim,
        duracao_minutos: updated.duration_minutes,
        scheduled_at: updated.scheduled_at,
        ends_at: ends.toISOString(),
        observacoes: updated.observacoes,
        enviar_convite_email: invite?.enviar ?? false,
        email_convite: invite?.enviar ? (invite.email ?? null) : null,
        vendedor_id: profile?.id_hubspot ?? null,
        vendedor_nome: profile?.full_name ?? null,
        vendedor_email: profile?.email ?? null,
        vendedor_uid: user?.id ?? null,
        enviado_em: new Date().toISOString(),
      }).catch((err) => console.warn('[WEBHOOK] reagendamento falhou:', err));

      // Atualiza o MESMO engagement no HubSpot (novo horário). Se a reunião foi
      // criada antes desta feature (sem hs_engagement_id), cria agora e guarda.
      // AWAITED (nao fire-and-forget) — mesma razao do addMeeting: no mobile a
      // Promise solta se perdia ao fechar o modal.
      if (client.id_hubspot) {
        try {
          if (updated.hs_engagement_id) {
            await rescheduleAgendaEngagement({
              meetingType: updated.type ?? 'reuniao',
              engagement_id: updated.hs_engagement_id,
              titulo: titulo_evento,
              descricao: updated.observacoes,
              scheduled_at: updated.scheduled_at,
              duration_minutes: updated.duration_minutes,
            });
          } else {
            const engagementId = await createAgendaEngagement({
              meetingType: updated.type ?? 'reuniao',
              id_hubspot: client.id_hubspot as string,
              titulo: titulo_evento,
              descricao: updated.observacoes,
              scheduled_at: updated.scheduled_at,
              duration_minutes: updated.duration_minutes,
              owner_id: profile?.id_hubspot ?? null,
            });
            if (engagementId) {
              await supabase
                .from('client_meetings')
                .update({ hs_engagement_id: engagementId })
                .eq('id', updated.id);
            }
          }
        } catch (err) {
          console.warn('[HUBSPOT] atualizar engagement da agenda falhou:', err);
        }
      }

      return updated;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client_meetings'] }),
  });

  // Recebe a reunião inteira (não só o id): precisa do type + hs_engagement_id
  // pra concluir a Task / cancelar a Meeting no HubSpot antes de apagar a linha.
  const deleteMeeting = useMutation({
    mutationFn: async (meeting: ClientMeeting) => {
      if (meeting.hs_engagement_id) {
        try {
          await cancelAgendaEngagement({
            meetingType: meeting.type ?? 'reuniao',
            engagement_id: meeting.hs_engagement_id,
          });
        } catch (err) {
          console.warn('[HUBSPOT] concluir/cancelar engagement falhou:', err);
        }
      }
      const { error } = await supabase.from('client_meetings').delete().eq('id', meeting.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client_meetings'] }),
  });

  return {
    meetings,
    meetingsByClient,
    upcomingByClient,
    isLoading: query.isLoading,
    error: query.error,
    addMeeting,
    rescheduleMeeting,
    deleteMeeting,
  };
}
