import type { AgentTool } from "../tool_registry.ts";
import type { CartDb } from "../cart/cart_db.ts";
import { summarizeCart } from "../cart/cart_summary.ts";

export function viewCartTool(cartDb: CartDb, conversationId: string): AgentTool {
  return {
    name: "view_cart",
    description: "Show the current contents of the shopping cart (items, subtotals and total).",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      const cart = cartDb.getCart(conversationId);
      if (cart === null) {
        return { items: [], totalCents: 0 };
      }
      return summarizeCart(cart);
    },
  };
}

export default viewCartTool;