import type { AgentTool } from "../tool_registry.ts";
import type { CartDb } from "../cart/cart_db.ts";
import type { OrdersDb } from "../orders/orders_db.ts";
import { summarizeCart } from "../cart/cart_summary.ts";

export function confirmPurchaseTool(cartDb: CartDb, ordersDb: OrdersDb, conversationId: string): AgentTool {
  return {
    name: "confirm_purchase",
    description:
      "Convert the conversation's cart into a pending_payment order with a pay link, then clear the cart.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      const cart = cartDb.getCart(conversationId);
      if (cart === null || cart.items.length === 0) {
        return { error: "cart is empty" };
      }

      const summary = summarizeCart(cart);
      if (summary.totalCents === null) {
        return { error: "cart has an item with no price, cannot confirm purchase" };
      }

      const order = ordersDb.createOrder(conversationId, cart.items, summary.totalCents);
      cartDb.saveCart({ conversationId, items: [], updatedAt: new Date().toISOString() });
      return {
        order_id: order.id,
        pay_url: "/pay/" + order.payToken,
        total_cents: order.totalCents,
      };
    },
  };
}

export default confirmPurchaseTool;