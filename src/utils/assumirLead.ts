// "É meu" do mapa novo (prompt final §7.9; Julyan 26/09: "se o lead estiver na
// rota dele, ele pode colocar direto no funil pelo mapa, clicando em é meu").
//
// Dois caminhos, conforme o lead já tenha negócio no HubSpot ou não:
//   - com negócio: Edge Function assumir-negocio troca o dono (travas no
//     servidor: sem dono ou dono fora do time, na rota de hoje, funil do
//     Field Sales; Backlog com origem sobe para Prospecção);
//   - sem negócio: create_pin da hubspot-sync (o mesmo do cadastro e da conta-
//     alvo na visita) cria o negócio em Prospecção com o executivo como dono.
import { supabase } from '../integrations/supabase/client';
import { origemDoLeadHs } from './origemDoLead';
import { sendHubspotEvent } from './hubspotSync';
import type { Client } from '../types/client';
import { decidirProspeccao, type Eu } from './entrarEmProspeccao';

export type ResultadoAssumir = { ok: true; etapa: string | null; aviso: string | null; idHubspot?: string | null; jaExistia?: boolean } | { ok: false; erro: string };

async function erroDaFuncao(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try { const j = await ctx.clone().json(); if (j?.erro) return String(j.erro); } catch { /* corpo não-JSON */ }
  }
  return (error as Error)?.message ?? 'Não consegui assumir agora.';
}

export async function assumirLead(
  client: Client,
  eu: { idHubspot: string | null; nome: string | null },
): Promise<ResultadoAssumir> {
  if (!eu.idHubspot) return { ok: false, erro: 'Seu usuário não tem dono no HubSpot. Peça para a gestão corrigir em Acessos.' };

  if (client.id_hubspot) {
    const { data, error } = await supabase.functions.invoke('assumir-negocio', { body: { clientId: client.id } });
    if (error) return { ok: false, erro: await erroDaFuncao(error) };
    const d = data as { etapa?: string | null; aviso?: string | null } | null;
    return { ok: true, etapa: d?.etapa ?? null, aviso: d?.aviso ?? null };
  }

  // Sem negócio: nasce no funil (Prospecção) com o executivo como dono.
  try {
    const body = await sendHubspotEvent({
      type: 'create_pin',
      id: client.id,
      bairro: client.bairro,
      celular: client.telefone,
      cep: client.cep,
      cidade: client.cidade,
      dealname: client.empresa ?? client.nome,
      email: client.email,
      estado_uf: client.estado,
      id_hubspot: null,
      latitude: client.latitude !== null ? String(client.latitude) : null,
      logradouro: client.endereco,
      longitude: client.longitude !== null ? String(client.longitude) : null,
      nome: client.nome,
      numero_do_local: client.numero,
      observacoes: client.observacoes,
      url: client.url_hubspot,
      vendedor_id: eu.idHubspot,
      vendedor_nome: eu.nome ?? '',
      origem_do_lead: origemDoLeadHs(client),
    });
    const o = (typeof body === 'object' && body ? body : null) as Record<string, unknown> | null;
    const id = typeof body === 'string' ? body : (o?.id_hubspot ?? o?.deal_id ?? o?.id ?? null);
    const jaExistia = o?.deduped === true;
    await supabase.from('clients').update({
      ...(jaExistia ? {} : { vendedor_id_hubspot: eu.idHubspot }),
      ...(id ? { id_hubspot: String(id) } : {}),
      ...(o?.url_hubspot ? { url_hubspot: String(o.url_hubspot) } : {}),
    }).eq('id', client.id);
    return { ok: true, etapa: jaExistia ? null : 'Prospecção', aviso: null, idHubspot: id ? String(id) : null, jaExistia };
  } catch (e) {
    return { ok: false, erro: (e as Error)?.message ?? 'O HubSpot recusou criar o negócio.' };
  }
}

/** O lead planejado (ou registrado na ficha) entra no funil se ainda não tem negócio. Devolve o
 *  client com o negócio, para quem chamou mandar o próximo passo ao HubSpot no mesmo gesto, e o
 *  aviso quando não criou (ninguém fica achando que o lead está no funil sem estar).
 *
 *  O PINO SE RELÊ ANTES (16/10/26): a ficha abre com o pino de ANTES do check-in, e o check-in da
 *  conta-alvo cria o negócio sozinho. Com o pino velho, a ficha pediria outro; o servidor deduplica,
 *  mas a tela diria "em Prospecção" de um negócio que já foi a Visita. `jaTinha` = usar o que existe. */
export async function entrarEmProspeccao(client: Client, eu: Eu, nomeDoDono?: string | null): Promise<{ client: Client; criado: boolean; jaTinha: boolean; aviso: string | null }> {
  let atual = client;
  if (!client.id_hubspot && client.id) {
    const { data } = await supabase.from('clients').select('id_hubspot, vendedor_id_hubspot, status').eq('id', client.id).maybeSingle();
    if (data) atual = { ...client, ...(data as Partial<Client>) };
  }
  if (atual.id_hubspot) return { client: atual, criado: false, jaTinha: true, aviso: null };
  const d = decidirProspeccao(atual, eu, nomeDoDono);
  if (!d.criar) return { client: atual, criado: false, jaTinha: false, aviso: d.motivo };
  const r = await assumirLead(atual, eu);
  if (r.ok === false) return { client: atual, criado: false, jaTinha: false, aviso: `o lead não entrou no funil (${r.erro})` };
  if (!r.idHubspot) return { client: atual, criado: false, jaTinha: false, aviso: 'o HubSpot não devolveu o negócio: confira em alguns minutos se ele entrou em Prospecção' };
  if (r.jaExistia) return { client: { ...atual, id_hubspot: r.idHubspot }, criado: false, jaTinha: true, aviso: null };
  return { client: { ...atual, id_hubspot: r.idHubspot, vendedor_id_hubspot: eu.idHubspot, etapa: 'Prospecção' }, criado: true, jaTinha: false, aviso: null };
}
