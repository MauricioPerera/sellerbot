// Composition root: cablea el cliente Poolside real, el registro de tools y
// el loop de orquestacion. No es una unidad CCDD-contractada — solo compone
// piezas que ya tienen su propio contrato en knowledge/contracts/agent-*.md.
import readline from "node:readline/promises";
import { createPoolsideClient } from "./poolside_client.ts";
import { createToolRegistry } from "./tool_registry.ts";
import { runAgentTurn } from "./agent_loop.ts";
import type { AgentMessage } from "./agent_loop.ts";
import getTimeTool from "./tools/get_time.ts";
import calculateTool from "./tools/calculate.ts";
import searchProductsTool from "./tools/search_products.ts";
import getProductDetailTool from "./tools/get_product_detail.ts";
import { openCatalogDb } from "./catalog/catalog_db.ts";
import { openConversationDb } from "./conversation/conversation_db.ts";
import type { ConversationDb } from "./conversation/conversation_db.ts";

const apiKey = process.env.POOLSIDE_API_KEY;
if (!apiKey) {
  console.error("Missing POOLSIDE_API_KEY environment variable.");
  process.exit(1);
}

const catalogDb = openCatalogDb("data/catalog.sqlite");
const catalog = catalogDb.listProducts();
catalogDb.close();
if (catalog.length === 0) {
  console.warn("Catalog is empty. Run `npm run import-catalog` first for product search to work.\n");
}

const conversationId = process.env.CONVERSATION_ID ?? crypto.randomUUID();
const conversationDb = openConversationDb("data/conversations.sqlite");
console.log(`Conversation id: ${conversationId} (set CONVERSATION_ID to resume this session later).`);

// Extraccion de estado conversacional desde el historial de mensajes: busca
// tool_calls a search_products/get_product_detail y sus resultados (mensajes
// role "tool" emparejados por tool_call_id), y persiste lo mas reciente. Se
// re-deriva de cero cada turno (barato para una sesion de CLI) en vez de
// trackear deltas.
function updateConversationState(allMessages: AgentMessage[], db: ConversationDb, id: string): void {
  const prior = db.getState(id);
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
    conversationId: id,
    lastSearchQuery,
    lastSearchResultIds,
    lastViewedProductId,
    updatedAt: new Date().toISOString(),
  });
}

function describeProduct(id: string): string {
  const product = catalog.find((p) => p.id === id);
  return product ? `${product.name} (id: ${product.id})` : `id ${id} (ya no esta en el catalogo)`;
}

function buildResumeContext(state: ReturnType<ConversationDb["getState"]>): string | null {
  if (state === null) return null;
  const parts: string[] = [];
  if (state.lastSearchQuery !== null && state.lastSearchResultIds.length > 0) {
    const list = state.lastSearchResultIds.map((id, i) => `${i + 1}. ${describeProduct(id)}`).join("; ");
    parts.push(`Tu ultima busqueda fue "${state.lastSearchQuery}" con estos resultados: ${list}.`);
  }
  if (state.lastViewedProductId !== null) {
    parts.push(`El ultimo producto que mostraste en detalle fue ${describeProduct(state.lastViewedProductId)}.`);
  }
  if (parts.length === 0) return null;
  return `Contexto recuperado de una sesion anterior de esta conversacion (id ${state.conversationId}): ${parts.join(" ")} Si el usuario continua refiriendose a esto (ej. "el segundo", "ese producto"), usa esta informacion sin volver a buscar de cero.`;
}

const client = createPoolsideClient({ apiKey });
const registry = createToolRegistry([
  getTimeTool(),
  calculateTool(),
  searchProductsTool(catalog),
  getProductDetailTool(catalog),
]);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(`Connected to ${client.config.model} via ${client.config.baseURL}.`);
console.log("Type a message and press Enter (Ctrl+C to exit).\n");

let messages: AgentMessage[] = [
  {
    role: "system",
    content:
      "Always call the calculate tool for arithmetic instead of computing it yourself, even for simple expressions. Always call the get_time tool when asked for the current time instead of guessing it. When asked about products, always call search_products first and never invent a product, price, or attribute that isn't in its results; call get_product_detail with a result's id to answer follow-up questions about a specific product or its variations.",
  },
];

const resumeContext = buildResumeContext(conversationDb.getState(conversationId));
if (resumeContext !== null) {
  messages = [...messages, { role: "system", content: resumeContext }];
  console.log("(Resumed prior context for this conversation id.)\n");
}

while (true) {
  let userInput: string;
  try {
    userInput = await rl.question("> ");
  } catch {
    // Input closed (EOF/piped stdin ended): exit the loop cleanly instead
    // of crashing on ERR_USE_AFTER_CLOSE.
    break;
  }

  messages = [...messages, { role: "user", content: userInput }];

  messages = await runAgentTurn(client.streamChat, messages, registry, {
    onText: (chunk) => process.stdout.write(chunk),
    onToolCall: (name, args) => process.stdout.write(`\n[tool: ${name}(${args})]\n`),
  });

  updateConversationState(messages, conversationDb, conversationId);

  process.stdout.write("\n\n");
}

conversationDb.close();
process.stdout.write("Bye.\n");
