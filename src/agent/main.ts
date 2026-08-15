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
import checkOrderStatusTool from "./tools/check_order_status.ts";
import applyCouponTool from "./tools/apply_coupon.ts";
import removeCouponTool from "./tools/remove_coupon.ts";
import checkPromotionsTool from "./tools/check_promotions.ts";
import applyPromotionTool from "./tools/apply_promotion.ts";
import removePromotionTool from "./tools/remove_promotion.ts";
import { openCatalogDb } from "./catalog/catalog_db.ts";
import { openConversationDb } from "./conversation/conversation_db.ts";
import { openCartDb } from "./cart/cart_db.ts";
import { openOrdersDb } from "./orders/orders_db.ts";
import { openPromotionsDb } from "./promotions/promotions_db.ts";
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
const promotionsDb = openPromotionsDb("data/promotions.sqlite");
console.log(`Conversation id: ${conversationId} (set CONVERSATION_ID to resume this session later).`);

const client = createPoolsideClient({ apiKey });
const registry = createToolRegistry([
  getTimeTool(),
  calculateTool(),
  searchProductsTool(catalog),
  getProductDetailTool(catalog),
  addToCartTool(cartDb, catalog, promotionsDb, conversationId),
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
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(`Connected to ${client.config.model} via ${client.config.baseURL}.`);
console.log("Type a message and press Enter (Ctrl+C to exit).\n");

let messages: AgentMessage[] = [
  {
    role: "system",
    content:
      "Always call the calculate tool for arithmetic instead of computing it yourself, even for simple expressions. Always call the get_time tool when asked for the current time instead of guessing it. When asked about products, always call search_products first and never invent a product, price, or attribute that isn't in its results; call get_product_detail with a result's id to answer follow-up questions about a specific product or its variations. Cart: use add_to_cart to add a product/variation the user picked (never on browsing alone, only when they clearly want it added), remove_from_cart to remove one, update_cart_quantity to set an exact quantity (0 removes it), and view_cart whenever the user asks what's in their cart or before confirming a purchase. Coupons: use apply_coupon when the user gives a coupon code; if it returns an error, tell the user the exact reason instead of guessing or inventing why it failed — never claim a discount was applied unless apply_coupon confirms it. Use remove_coupon if they want to remove it or try a different one. Linked-product promotions: add_to_cart's response includes an available_promotions array — if it's non-empty, mention it to the user in plain language right there (which product, what discount) but NEVER add it or apply the discount yourself; only call apply_promotion with that promotion_id if the user explicitly agrees (e.g. 'sí, agregalo', 'dale'). Use check_promotions if the user asks about promotions later in the conversation without having just added anything. Use remove_promotion if they want to undo an applied promotion (this only stops the discount, it does not remove the product from the cart — use remove_from_cart for that separately if they also want the item gone). view_cart shows discountCents/promotionDiscountCents/finalTotalCents only when a coupon and/or promotion is currently valid; present the final total, not the pre-discount one, whenever either is applied. Checkout: only call confirm_purchase after the user EXPLICITLY confirms they want to buy (e.g. 'confirmar compra') — never on browsing or adding items alone; it fails with an error if the cart is empty or has an item with no price, so tell the user that instead of guessing. On success it returns a pay_url: present it to the user as a clickable link and tell them the order is pending payment until they complete it there. Use check_order_status with an order_id whenever the user asks about the outcome of a payment — never guess or assume it was approved, always confirm the real persisted status. All prices and cart totals are in Argentine pesos (ARS), stored as integer cents; always convert to pesos and format like '$ 1.234,56' (never show raw cents).",
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
promotionsDb.close();
process.stdout.write("Bye.\n");
