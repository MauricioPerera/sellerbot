// Composition root: servidor HTTP de la UI web (issue #3). No es una unidad
// CCDD-contractada — cablea piezas que ya tienen su propio contrato
// (poolside_client, agent_loop, tool_registry, catalog/conversation db,
// tools, render_markdown), igual que main.ts (CLI) hace con el mismo agente.
// No reimplementa reglas de producto ni de busqueda: usa exactamente el
// mismo runAgentTurn + registry que el CLI.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPoolsideClient } from "../poolside_client.ts";
import { createToolRegistry } from "../tool_registry.ts";
import { runAgentTurn } from "../agent_loop.ts";
import type { AgentMessage } from "../agent_loop.ts";
import getTimeTool from "../tools/get_time.ts";
import calculateTool from "../tools/calculate.ts";
import searchProductsTool from "../tools/search_products.ts";
import getProductDetailTool from "../tools/get_product_detail.ts";
import { openCatalogDb } from "../catalog/catalog_db.ts";
import { openConversationDb } from "../conversation/conversation_db.ts";
import { buildResumeContext, updateConversationState } from "../conversation/conversation_context.ts";
import { renderMarkdown } from "./render_markdown.ts";

const apiKey = process.env.POOLSIDE_API_KEY;
if (!apiKey) {
  console.error("Missing POOLSIDE_API_KEY environment variable.");
  process.exit(1);
}

const catalogDb = openCatalogDb("data/catalog.sqlite");
const catalog = catalogDb.listProducts();
catalogDb.close();
if (catalog.length === 0) {
  console.warn("Catalog is empty. Run `npm run import-catalog` first for product search to work.");
}

const conversationDb = openConversationDb("data/conversations.sqlite");
const client = createPoolsideClient({ apiKey });
const registry = createToolRegistry([
  getTimeTool(),
  calculateTool(),
  searchProductsTool(catalog),
  getProductDetailTool(catalog),
]);

const SYSTEM_PROMPT =
  "Always call the calculate tool for arithmetic instead of computing it yourself, even for simple expressions. Always call the get_time tool when asked for the current time instead of guessing it. When asked about products, always call search_products first and never invent a product, price, or attribute that isn't in its results; call get_product_detail with a result's id to answer follow-up questions about a specific product or its variations. Format replies in simple markdown: use **bold** for product names, short '- ' bullet lists for options, and include a product image as ![description](url) when a get_product_detail result has one available.";

// Historial completo de mensajes por conversationId, en memoria mientras el
// proceso corre (issue #3, criterio 4: historial dentro de la sesion activa).
// El contexto de busqueda/producto sobrevive un reinicio via conversationDb
// (issue #8); el historial de texto completo no — al reiniciar, se reconstruye
// un resumen a partir de ese estado persistido, igual que hace main.ts.
const sessions = new Map<string, AgentMessage[]>();

function getSessionMessages(conversationId: string): AgentMessage[] {
  const existing = sessions.get(conversationId);
  if (existing !== undefined) return existing;

  let initial: AgentMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  const resumeContext = buildResumeContext(catalog, conversationDb.getState(conversationId));
  if (resumeContext !== null) {
    initial = [...initial, { role: "system", content: resumeContext }];
  }
  sessions.set(conversationId, initial);
  return initial;
}

async function readRequestBody(req: http.IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  return body;
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

async function handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const raw = await readRequestBody(req);
  let payload: { conversationId?: unknown; message?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "invalid JSON body" });
    return;
  }

  if (typeof payload.conversationId !== "string" || payload.conversationId === "") {
    sendJson(res, 400, { error: "conversationId must be a non-empty string" });
    return;
  }
  if (typeof payload.message !== "string" || payload.message === "") {
    sendJson(res, 400, { error: "message must be a non-empty string" });
    return;
  }

  const conversationId = payload.conversationId;
  let messages = getSessionMessages(conversationId);
  messages = [...messages, { role: "user", content: payload.message }];

  const toolCalls: Array<{ name: string; args: string }> = [];
  let text = "";

  try {
    messages = await runAgentTurn(client.streamChat, messages, registry, {
      onText: (chunk) => {
        text += chunk;
      },
      onToolCall: (name, args) => {
        toolCalls.push({ name, args });
      },
    });
  } catch (err) {
    sendJson(res, 502, { error: err instanceof Error ? err.message : "agent error" });
    return;
  }

  sessions.set(conversationId, messages);
  updateConversationState(messages, conversationDb, conversationId);

  sendJson(res, 200, { html: renderMarkdown(text), toolCalls });
}

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const STATIC_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (req.method !== "GET") return false;
  const entry = STATIC_FILES[req.url ?? ""];
  if (!entry) return false;
  const filePath = path.join(PUBLIC_DIR, entry.file);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": entry.type });
    res.end(data);
  });
  return true;
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    handleChat(req, res).catch((err) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : "internal error" });
    });
    return;
  }
  if (serveStatic(req, res)) return;
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`sellerbot web UI: http://localhost:${port}`);
});
