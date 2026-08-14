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
import addToCartTool from "./tools/add_to_cart.ts";
import removeFromCartTool from "./tools/remove_from_cart.ts";
import updateCartQuantityTool from "./tools/update_cart_quantity.ts";
import viewCartTool from "./tools/view_cart.ts";
import confirmPurchaseTool from "./tools/confirm_purchase.ts";
import applyCouponTool from "./tools/apply_coupon.ts";
import removeCouponTool from "./tools/remove_coupon.ts";
import { openCatalogDb } from "./catalog/catalog_db.ts";
import { openConversationDb } from "./conversation/conversation_db.ts";
import { openCartDb } from "./cart/cart_db.ts";
import { openOrdersDb } from "./orders/orders_db.ts";
import { COUPONS } from "./coupons/coupons_data.ts";
import { buildResumeContext, updateConversationState } from "./conversation/conversation_context.ts";

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
const cartDb = openCartDb("data/cart.sqlite");
const ordersDb = openOrdersDb("data/orders.sqlite");
console.log(`Conversation id: ${conversationId} (set CONVERSATION_ID to resume this session later).`);

const client = createPoolsideClient({ apiKey });
const registry = createToolRegistry([
  getTimeTool(),
  calculateTool(),
  searchProductsTool(catalog),
  getProductDetailTool(catalog),
  addToCartTool(cartDb, catalog, conversationId),
  removeFromCartTool(cartDb, conversationId),
  updateCartQuantityTool(cartDb, conversationId),
  viewCartTool(cartDb, COUPONS, conversationId),
  confirmPurchaseTool(cartDb, ordersDb, COUPONS, conversationId),
  applyCouponTool(cartDb, COUPONS, conversationId),
  removeCouponTool(cartDb, conversationId),
]);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(`Connected to ${client.config.model} via ${client.config.baseURL}.`);
console.log("Type a message and press Enter (Ctrl+C to exit).\n");

let messages: AgentMessage[] = [
  {
    role: "system",
    content:
      "Always call the calculate tool for arithmetic instead of computing it yourself, even for simple expressions. Always call the get_time tool when asked for the current time instead of guessing it. When asked about products, always call search_products first and never invent a product, price, or attribute that isn't in its results; call get_product_detail with a result's id to answer follow-up questions about a specific product or its variations. Cart: use add_to_cart to add a product/variation the user picked (never on browsing alone, only when they clearly want it added), remove_from_cart to remove one, update_cart_quantity to set an exact quantity (0 removes it), and view_cart whenever the user asks what's in their cart or before confirming a purchase. Coupons: use apply_coupon when the user gives a coupon code; if it returns an error, tell the user the exact reason instead of guessing or inventing why it failed — never claim a discount was applied unless apply_coupon confirms it. Use remove_coupon if they want to remove it or try a different one. view_cart shows discountCents/finalTotalCents only when a coupon is currently valid; present that final total, not the pre-discount one, whenever a coupon is applied. Checkout: only call confirm_purchase after the user EXPLICITLY confirms they want to buy (e.g. 'confirmar compra') — never on browsing or adding items alone; it fails with an error if the cart is empty or has an item with no price, so tell the user that instead of guessing. On success it returns a pay_url: present it to the user as a clickable link and tell them the order is pending payment until they complete it there. All prices and cart totals are in Argentine pesos (ARS), stored as integer cents; always convert to pesos and format like '$ 1.234,56' (never show raw cents).",
  },
];

const resumeContext = buildResumeContext(catalog, conversationDb.getState(conversationId));
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
cartDb.close();
ordersDb.close();
process.stdout.write("Bye.\n");
