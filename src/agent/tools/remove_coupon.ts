import type { AgentTool } from "../tool_registry.ts";
import type { CartDb } from "../cart/cart_db.ts";
import { summarizeCart } from "../cart/cart_summary.ts";

export function removeCouponTool(cartDb: CartDb, conversationId: string): AgentTool {
  return {
    name: "remove_coupon",
    description:
      "Remove the coupon applied to the conversation cart (idempotent: never fails even with no cart or no coupon applied).",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      cartDb.setCouponCode(conversationId, null);
      const cart = cartDb.getCart(conversationId);
      if (cart === null) {
        return { items: [], total_cents: 0 };
      }
      const summary = summarizeCart(cart);
      return { items: summary.items, total_cents: summary.totalCents };
    },
  };
}

export default removeCouponTool;