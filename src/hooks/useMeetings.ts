import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { Client, ClientMeeting, ClientMeetingFormData } from '../types/client';

// Mesmo webhook usado no cadastro manual de lead — diferenciado por `type` no body.
const WEBHOOK_URL = 'https://webhook.takeat.cloud/webhook/0975e1c9-2d09-42f7-b236-78c7818c0c0d';

export function useMeetings() {
  const queryClient = useQueryClient();
  const { isAuthenticated, user, profile } = useAuth();

  // Carrega TODAS as reuniões (agendadas + futuras + passadas) numa query só.
  // Volume esperado é baixo (umas reuniões por cliente) — agrupar em memória
  // é mais simples que rodar uma RPC de count por client_id.
  const query = useQuery<ClientMeeting[]>({
    queryKey: ['client_meetings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_meetings')
        .select('*');
      if (error) throw error;
      return (data ?? []) as ClientMeeting[];
    },
    enabled: isAuthenticated,
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

      fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reuniao',
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
        }),
      }).catch((err) => console.warn('[WEBHOOK] reuniao falhou:', err));

      return meeting;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client_meetings'] }),
  });

  const deleteMeeting = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('client_meetings').delete().eq('id', id);
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
    deleteMeeting,
  };
}
