import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { Client, ClientMeeting, ClientMeetingFormData } from '../types/client';
import {
  createAgendaEngagement,
  rescheduleAgendaEngagement,
  cancelAgendaEngagement,
} from '../utils/hubspotSync';
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from '../utils/googleCalendar';

// ============================================================================
// Agenda (reuniao/follow up). Arquitetura pos-n8n:
//   DEMO (type=reuniao)  -> evento no Google Calendar (edge google-calendar).
//                           O Meeting no HubSpot vem da sync HubSpot<->Google.
//   FOLLOW UP            -> Task no HubSpot (edge hubspot-sync). SEM Google,
//                           SEM Meeting.
// As chamadas externas sao AWAITADAS (nao fire-and-forget): no mobile a Promise
// solta se perdia ao fechar o modal. Erro externo NAO quebra o agendamento (a
// linha ja esta salva no banco).
// ============================================================================

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

  // Convidados do evento no Google: e-mail do convite (se marcado; cai pro
  // e-mail do lead) + o e-mail do vendedor. Igual o n8n montava.
  const attendeesFor = (
    invite: { enviar: boolean; email: string | null } | undefined,
    client: Client,
  ): string[] => {
    const list: string[] = [];
    const inviteEmail = invite?.enviar ? (invite.email ?? client.email ?? null) : null;
    if (inviteEmail && inviteEmail.includes('@')) list.push(inviteEmail.trim());
    if (profile?.email && profile.email.includes('@')) list.push(profile.email.trim());
    return [...new Set(list)];
  };

  const tituloFor = (isFollowUp: boolean, client: Client) =>
    isFollowUp ? `Follow Up - ${client.nome}` : `Reunião - ${client.nome}`;

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

      const isFollowUp = meeting.type === 'follow_up';
      const titulo = tituloFor(isFollowUp, client);

      if (isFollowUp) {
        // Follow up -> Task no HubSpot (sem Google, sem Meeting).
        if (client.id_hubspot) {
          try {
            const engagementId = await createAgendaEngagement({
              meetingType: 'follow_up',
              id_hubspot: client.id_hubspot as string,
              titulo,
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
            console.warn('[HUBSPOT] criar Task de follow up falhou:', err);
          }
        }
      } else {
        // Demo -> evento no Google Calendar. O Meeting no HubSpot vem da sync
        // nativa HubSpot<->Google (nao criamos Meeting via API pra nao duplicar).
        try {
          const eventId = await createGoogleEvent({
            titulo,
            descricao: meeting.observacoes,
            scheduled_at: meeting.scheduled_at,
            duration_minutes: meeting.duration_minutes,
            attendees: attendeesFor(invite, client),
          });
          if (eventId) {
            await supabase
              .from('client_meetings')
              .update({ google_event_id: eventId })
              .eq('id', meeting.id);
          }
        } catch (err) {
          console.warn('[GOOGLE] criar evento da demo falhou:', err);
        }
      }

      return meeting;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client_meetings'] }),
  });

  // Reagenda: muda data/hora (e opcionalmente duração/observações) na MESMA
  // linha. Demo -> atualiza o evento no Google (a sync move o Meeting no
  // HubSpot). Follow up -> atualiza a Task no HubSpot.
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

      const isFollowUp = updated.type === 'follow_up';
      const titulo = tituloFor(isFollowUp, client);

      if (isFollowUp) {
        // Follow up -> atualiza (ou cria, se antiga sem id) a Task no HubSpot.
        if (client.id_hubspot) {
          try {
            if (updated.hs_engagement_id) {
              await rescheduleAgendaEngagement({
                meetingType: 'follow_up',
                engagement_id: updated.hs_engagement_id,
                titulo,
                descricao: updated.observacoes,
                scheduled_at: updated.scheduled_at,
                duration_minutes: updated.duration_minutes,
              });
            } else {
              const engagementId = await createAgendaEngagement({
                meetingType: 'follow_up',
                id_hubspot: client.id_hubspot as string,
                titulo,
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
            console.warn('[HUBSPOT] reagendar Task de follow up falhou:', err);
          }
        }
      } else {
        // Demo -> atualiza (ou cria, se antiga sem id) o evento no Google.
        try {
          if (updated.google_event_id) {
            await updateGoogleEvent({
              event_id: updated.google_event_id,
              titulo,
              descricao: updated.observacoes,
              scheduled_at: updated.scheduled_at,
              duration_minutes: updated.duration_minutes,
              attendees: attendeesFor(invite, client),
            });
          } else {
            const eventId = await createGoogleEvent({
              titulo,
              descricao: updated.observacoes,
              scheduled_at: updated.scheduled_at,
              duration_minutes: updated.duration_minutes,
              attendees: attendeesFor(invite, client),
            });
            if (eventId) {
              await supabase
                .from('client_meetings')
                .update({ google_event_id: eventId })
                .eq('id', updated.id);
            }
          }
        } catch (err) {
          console.warn('[GOOGLE] reagendar evento da demo falhou:', err);
        }
      }

      return updated;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client_meetings'] }),
  });

  // Remove a reunião: cancela o compromisso externo antes de apagar a linha.
  // Demo -> deleta o evento no Google (a sync remove o Meeting no HubSpot).
  // Follow up -> conclui a Task no HubSpot.
  const deleteMeeting = useMutation({
    mutationFn: async (meeting: ClientMeeting) => {
      const isFollowUp = meeting.type === 'follow_up';
      if (isFollowUp) {
        if (meeting.hs_engagement_id) {
          try {
            await cancelAgendaEngagement({
              meetingType: 'follow_up',
              engagement_id: meeting.hs_engagement_id,
            });
          } catch (err) {
            console.warn('[HUBSPOT] concluir Task de follow up falhou:', err);
          }
        }
      } else if (meeting.google_event_id) {
        try {
          await deleteGoogleEvent(meeting.google_event_id);
        } catch (err) {
          console.warn('[GOOGLE] deletar evento da demo falhou:', err);
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
