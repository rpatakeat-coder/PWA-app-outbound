import { supabase } from '../integrations/supabase/client';

// Chama a Edge Function export-agenda: manda o JSON ja montado pela tela da
// agenda, a function sobe no bucket `exports` e devolve uma signed URL (7 dias)
// — mesma UX do "Exportar TUDO" do gestor (exportReport), mas o conteudo vem
// do app (respeita o filtro de vendedor / itens que estao na tela).
export async function exportAgenda(
  payload: unknown,
  label?: string,
): Promise<{ url: string; filename: string; counts: unknown }> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login de novo.');

  const { data, error } = await supabase.functions.invoke('export-agenda', {
    body: { payload, label },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    // A function devolve JSON de erro no corpo; extrai a mensagem + detalhe.
    const ctx = (error as any)?.context;
    let msg = error.message;
    try {
      const body = await ctx?.json?.();
      if (body?.error) msg = body.detail ? `${body.error}\n\n${body.detail}` : body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (!data?.url) throw new Error(data?.error ?? 'Falha ao gerar a exportação da agenda.');
  return { url: data.url, filename: data.filename, counts: data.counts ?? null };
}
