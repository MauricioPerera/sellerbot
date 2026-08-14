import type { AgentTool } from "../tool_registry.ts";
import type { CartDb } from "../cart/cart_db.ts";
import { summarizeCart } from "../cart/cart_summary.ts";

export function removePromotionTool(cartDb: CartDb, conversationId: string): AgentTool {
  return {
    name: "remove_promotion",
    description:
      "Remove the linked-product promotion applied to the conversation cart (idempotent: never fails even with no cart or no promotion applied; does not remove any items).",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      cartDb.setPromotionId(conversationId, null);
      const cart = cartDb.getCart(conversationId);
      if (cart === null) {
        return { items: [], total_cents: 0 };
      }
      const summary = summarizeCart(cart);
      return { items: summary.items, total_cents: summary.totalCents };
    },
  };
}

export default removePromotionTool;
