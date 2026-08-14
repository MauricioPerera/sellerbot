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
import addToCartTool from "../tools/add_to_cart.ts";
import removeFromCartTool from "../tools/remove_from_cart.ts";
import updateCartQuantityTool from "../tools/update_cart_quantity.ts";
import viewCartTool from "../tools/view_cart.ts";
import confirmPurchaseTool from "../tools/confirm_purchase.ts";
import checkOrderStatusTool from "../tools/check_order_status.ts";
import applyCouponTool from "../tools/apply_coupon.ts";
import removeCouponTool from "../tools/remove_coupon.ts";
import checkPromotionsTool from "../tools/check_promotions.ts";
import applyPromotionTool from "../tools/apply_promotion.ts";
import removePromotionTool from "../tools/remove_promotion.ts";
import { openCatalogDb } from "../catalog/catalog_db.ts";
import { openConversationDb } from "../conversation/conversation_db.ts";
import { openCartDb } from "../cart/cart_db.ts";
import { openOrdersDb } from "../orders/orders_db.ts";
import type { OrderStatus } from "../orders/orders_db.ts";
import { filterOrders } from "../orders/filter_orders.ts";
import { openPromotionsDb } from "../promotions/promotions_db.ts";
import { COUPONS } from "../coupons/coupons_data.ts";
import { buildResumeContext, updateConversationState } from "../conversation/conversation_context.ts";
import { renderMarkdown } from "./render_markdown.ts";
import { renderPayPage } from "./render_pay_page.ts";

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
const cartDb = openCartDb("data/cart.sqlite");
const ordersDb = openOrdersDb("data/orders.sqlite");
const promotionsDb = openPromotionsDb("data/promotions.sqlite");
const client = createPoolsideClient({ apiKey });

// El registro se arma por conversationId (no una sola vez global) porque las
// tools de carrito estan atadas a esa conversacion especifica -- el servidor
// atiende muchas conversaciones concurrentes desde el mismo proceso.
function buildRegistry(conversationId: string) {
  return createToolRegistry([
    getTimeTool(),
    calculateTool(),
    searchProductsTool(catalog),
    getProductDetailTool(catalog),
    addToCartTool(cartDb, catalog, conversationId),
    removeFromCartTool(cartDb, conversationId),
    updateCartQuantityTool(cartDb, conversationId),
    viewCartTool(cartDb, COUPONS, promotionsDb, catalog, conversationId),
    confirmPurchaseTool(cartDb, ordersDb, COUPONS, promotionsDb, catalog, conversationId),
    checkOrderStatusTool(ordersDb),
    applyCouponTool(cartDb, COUPONS, conversationId),
    removeCouponTool(cartDb, conversationId),
    checkPromotionsTool(cartDb, promotionsDb, catalog, conversationId),
    applyPromotionTool(cartDb, promotionsDb, catalog, conversationId),
    removePromotionTool(cartDb, conversationId),
  ]);
}

const SYSTEM_PROMPT =
  "Always call the calculate tool for arithmetic instead of computing it yourself, even for simple expressions. Always call the get_time tool when asked for the current time instead of guessing it. When asked about products, always call search_products first and never invent a product, price, or attribute that isn't in its results; call get_product_detail with a result's id to answer follow-up questions about a specific product or its variations. Cart: use add_to_cart to add a product/variation the user picked (never on browsing alone, only when they clearly want it added), remove_from_cart to remove one, update_cart_quantity to set an exact quantity (0 removes it), and view_cart whenever the user asks what's in their cart or before confirming a purchase. Coupons: use apply_coupon when the user gives a coupon code; if it returns an error, tell the user the exact reason instead of guessing or inventing why it failed — never claim a discount was applied unless apply_coupon confirms it. Use remove_coupon if they want to remove it or try a different one. Linked-product promotions: after add_to_cart succeeds, call check_promotions to see if the product just added unlocks a discount on another product; if it returns any, mention it to the user in plain language (which product, what discount) but NEVER add it or apply the discount yourself — only call apply_promotion with that promotion_id if the user explicitly agrees (e.g. 'sí, agregalo', 'dale'). Use remove_promotion if they want to undo an applied promotion (this only stops the discount, it does not remove the product from the cart — use remove_from_cart for that separately if they also want the item gone). view_cart shows discountCents/promotionDiscountCents/finalTotalCents only when a coupon and/or promotion is currently valid; present the final total, not the pre-discount one, whenever either is applied. Checkout: only call confirm_purchase after the user EXPLICITLY confirms they want to buy (e.g. 'confirmar compra') — never on browsing or adding items alone; it fails with an error if the cart is empty or has an item with no price, so tell the user that instead of guessing. On success it returns a pay_url: present it to the user as a clickable link (format it as [pagar ahora](url) in markdown) and tell them the order is pending payment until they complete it there. Use check_order_status with an order_id whenever the user asks about the outcome of a payment — never guess or assume it was approved, always confirm the real persisted status. All prices and cart totals are in Argentine pesos (ARS), stored as integer cents; always convert to pesos and format like '$ 1.234,56' (never show raw cents). Format replies in simple markdown: use **bold** for product names, short '- ' bullet lists for options, and include a product image as ![description](url) when a get_product_detail result has one available.";

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
    messages = await runAgentTurn(client.streamChat, messages, buildRegistry(conversationId), {
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

function sendHtml(res: http.ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

// GET /pay/:token — pagina mock de pago (issue #4 batch 3). Resuelve la
// orden por payToken y la renderiza; 404 si el token no corresponde a
// ninguna orden.
function handlePayPage(req: http.IncomingMessage, res: http.ServerResponse, payToken: string): void {
  const order = ordersDb.getOrderByPayToken(payToken);
  if (order === null) {
    sendHtml(res, 404, "<p>Orden no encontrada.</p>");
    return;
  }
  sendHtml(res, 200, renderPayPage(order));
}

// POST /pay/:token/approve|reject — simula el resultado del pago mock.
// Resuelve la orden por payToken, aplica la transicion, y re-renderiza la
// misma pagina con el resultado.
function handlePayAction(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  payToken: string,
  result: "approved" | "rejected",
): void {
  const order = ordersDb.getOrderByPayToken(payToken);
  if (order === null) {
    sendHtml(res, 404, "<p>Orden no encontrada.</p>");
    return;
  }
  try {
    const { order: updated } = ordersDb.setPaymentResult(order.id, result);
    sendHtml(res, 200, renderPayPage(updated));
  } catch (err) {
    sendHtml(res, 409, `<p>${err instanceof Error ? err.message : "No se pudo procesar el pago."}</p>`);
  }
}

// GET /admin/api/orders?status=&id=&dateFrom=&dateTo= — issue #5 dashboard.
// Sin autenticacion (decision explicita del issue: uso local, un solo
// administrador). Filtra en memoria con filterOrders sobre listOrders().
const ADMIN_STATUSES = new Set(["pending_payment", "paid", "payment_failed", "shipped", "cancelled"]);

function handleAdminOrdersList(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "", "http://localhost");
  const status = url.searchParams.get("status") ?? undefined;
  const id = url.searchParams.get("id") ?? undefined;
  const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
  const dateTo = url.searchParams.get("dateTo") ?? undefined;

  if (status !== undefined && !ADMIN_STATUSES.has(status)) {
    sendJson(res, 400, { error: "invalid status" });
    return;
  }

  const orders = filterOrders(ordersDb.listOrders(), {
    status: status as OrderStatus | undefined,
    id,
    dateFrom,
    dateTo,
  });
  sendJson(res, 200, { orders });
}

// GET /admin/api/orders/:id — detalle + historial de eventos.
function handleAdminOrderDetail(res: http.ServerResponse, orderId: string): void {
  const order = ordersDb.getOrder(orderId);
  if (order === null) {
    sendJson(res, 404, { error: `no order found with id ${orderId}` });
    return;
  }
  sendJson(res, 200, { order, events: ordersDb.listEvents(orderId) });
}

// POST /admin/api/orders/:id/transition — cambio manual de estado (shipped
// o cancelled). Actor fijo "local-admin" (decision explicita del issue: sin
// login en este prototipo). La capa de dominio (adminTransition) valida la
// transicion incluso si esta ruta se invoca sin pasar por la UI.
async function handleAdminTransition(req: http.IncomingMessage, res: http.ServerResponse, orderId: string): Promise<void> {
  const raw = await readRequestBody(req);
  let payload: { toStatus?: unknown; reason?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "invalid JSON body" });
    return;
  }

  if (payload.toStatus !== "shipped" && payload.toStatus !== "cancelled") {
    sendJson(res, 400, { error: "toStatus must be 'shipped' or 'cancelled'" });
    return;
  }
  if (payload.reason !== undefined && typeof payload.reason !== "string") {
    sendJson(res, 400, { error: "reason must be a string" });
    return;
  }

  try {
    const order = ordersDb.adminTransition(orderId, payload.toStatus, "local-admin", payload.reason as string | undefined);
    sendJson(res, 200, { order });
  } catch (err) {
    sendJson(res, 409, { error: err instanceof Error ? err.message : "invalid transition" });
  }
}

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const STATIC_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/admin": { file: "admin.html", type: "text/html; charset=utf-8" },
  "/admin.html": { file: "admin.html", type: "text/html; charset=utf-8" },
  "/admin.css": { file: "admin.css", type: "text/css; charset=utf-8" },
  "/admin.js": { file: "admin.js", type: "text/javascript; charset=utf-8" },
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

const PAY_PAGE_RE = /^\/pay\/([^/]+)$/;
const PAY_ACTION_RE = /^\/pay\/([^/]+)\/(approve|reject)$/;
const ADMIN_ORDER_DETAIL_RE = /^\/admin\/api\/orders\/([^/]+)$/;
const ADMIN_ORDER_TRANSITION_RE = /^\/admin\/api\/orders\/([^/]+)\/transition$/;

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    handleChat(req, res).catch((err) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : "internal error" });
    });
    return;
  }

  const url = req.url ?? "";
  if (req.method === "GET") {
    const payMatch = url.match(PAY_PAGE_RE);
    if (payMatch) {
      handlePayPage(req, res, decodeURIComponent(payMatch[1]));
      return;
    }
    if (url === "/admin/api/orders" || url.startsWith("/admin/api/orders?")) {
      handleAdminOrdersList(req, res);
      return;
    }
    const detailMatch = url.match(ADMIN_ORDER_DETAIL_RE);
    if (detailMatch) {
      handleAdminOrderDetail(res, decodeURIComponent(detailMatch[1]));
      return;
    }
  }
  if (req.method === "POST") {
    const actionMatch = url.match(PAY_ACTION_RE);
    if (actionMatch) {
      const result = actionMatch[2] === "approve" ? "approved" : "rejected";
      handlePayAction(req, res, decodeURIComponent(actionMatch[1]), result);
      return;
    }
    const transitionMatch = url.match(ADMIN_ORDER_TRANSITION_RE);
    if (transitionMatch) {
      handleAdminTransition(req, res, decodeURIComponent(transitionMatch[1])).catch((err) => {
        sendJson(res, 500, { error: err instanceof Error ? err.message : "internal error" });
      });
      return;
    }
  }

  if (serveStatic(req, res)) return;
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`sellerbot web UI: http://localhost:${port}`);
});
