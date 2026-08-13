// Composition helper compartido entre main.ts (CLI) y web/server.ts (UI web):
// no es una unidad CCDD-contractada, es orquestacion que combina piezas ya
// contractadas (AgentMessage de agent_loop.ts, ConversationDb, DbProduct).
// Extraido para no duplicar esta logica entre los dos composition roots.
import type { AgentMessage } from "../agent_loop.ts";
import type { ConversationDb, ConversationState } from "./conversation_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";

// Re-deriva el estado conversacional escaneando tool_calls a search_products/
// get_product_detail y sus resultados (mensajes role "tool" emparejados por
// tool_call_id) en TODO el historial, y lo persiste. Barato para una sesion
// de chat tipica; se re-calcula de cero en vez de trackear deltas.
export function updateConversationState(
  allMessages: AgentMessage[],
  db: ConversationDb,
  conversationId: string,
): void {
  const prior = db.getState(conversationId);
  let lastSearchQuery = prior?.lastSearchQuery ?? null;
  let lastSearchResultIds = prior?.lastSearchResultIds ?? [];
  let lastViewedProductId = prior?.lastViewedProductId ?? null;

  for (const msg of allMessages) {
    if (msg.role !== "assistant" || !msg.tool_calls) continue;
    for (const call of msg.tool_calls) {
      const toolResult = allMessages.find((m) => m.role === "tool" && m.tool_call_id === call.id);
      if (!toolResult || typeof toolResult.content !== "string") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(toolResult.content);
      } catch {
        continue;
      }
      if (call.function.name === "search_products" && parsed && typeof parsed === "object" && "results" in parsed) {
        lastSearchResultIds = (parsed as { results: Array<{ id: string }> }).results.map((r) => r.id);
        try {
          const args = JSON.parse(call.function.arguments) as { query?: unknown };
          if (typeof args.query === "string") lastSearchQuery = args.query;
        } catch {
          // arguments crudos incompletos durante el stream: se ignora, no rompe el resto.
        }
      }
      if (call.function.name === "get_product_detail" && parsed && typeof parsed === "object" && "product" in parsed) {
        lastViewedProductId = (parsed as { product: { id: string } }).product.id;
      }
    }
  }

  db.saveState({
    conversationId,
    lastSearchQuery,
    lastSearchResultIds,
    lastViewedProductId,
    updatedAt: new Date().toISOString(),
  });
}

export function describeProduct(catalog: DbProduct[], id: string): string {
  const product = catalog.find((p) => p.id === id);
  return product ? `${product.name} (id: ${product.id})` : `id ${id} (ya no esta en el catalogo)`;
}

export function buildResumeContext(catalog: DbProduct[], state: ConversationState | null): string | null {
  if (state === null) return null;
  const parts: string[] = [];
  if (state.lastSearchQuery !== null && state.lastSearchResultIds.length > 0) {
    const list = state.lastSearchResultIds
      .map((id, i) => `${i + 1}. ${describeProduct(catalog, id)}`)
      .join("; ");
    parts.push(`Tu ultima busqueda fue "${state.lastSearchQuery}" con estos resultados: ${list}.`);
  }
  if (state.lastViewedProductId !== null) {
    parts.push(`El ultimo producto que mostraste en detalle fue ${describeProduct(catalog, state.lastViewedProductId)}.`);
  }
  if (parts.length === 0) return null;
  return `Contexto recuperado de una sesion anterior de esta conversacion (id ${state.conversationId}): ${parts.join(" ")} Si el usuario continua refiriendose a esto (ej. "el segundo", "ese producto"), usa esta informacion sin volver a buscar de cero.`;
}
