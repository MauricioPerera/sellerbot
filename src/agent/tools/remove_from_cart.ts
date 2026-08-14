import type { AgentTool } from "../tool_registry.ts";
import type { Cart, CartDb } from "../cart/cart_db.ts";
import { removeCartItem } from "../cart/cart_remove_item.ts";
import { summarizeCart } from "../cart/cart_summary.ts";

export function removeFromCartTool(cartDb: CartDb, conversationId: string): AgentTool {
  return {
    name: "remove_from_cart",
    description: "Remove an item from the conversation cart by product id.",
    parameters: {
      type: "object",
      properties: { product_id: { type: "string" } },
      required: ["product_id"],
      additionalProperties: false,
    },
    async execute(args) {
      if (typeof args.product_id !== "string") {
        return { error: "product_id must be a string" };
      }
      const current = cartDb.getCart(conversationId);
      if (current === null) {
        return { cart: { items: [], totalCents: 0 } };
      }
      const saved: Cart = {
        ...removeCartItem(current, args.product_id),
        updatedAt: new Date().toISOString(),
      };
      cartDb.saveCart(saved);
      return { cart: summarizeCart(saved) };
    },
  };
}

export default removeFromCartTool;