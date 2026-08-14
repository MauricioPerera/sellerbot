import type { AgentTool } from "../tool_registry.ts";
import type { Cart, CartDb } from "../cart/cart_db.ts";
import { setCartItemQuantity } from "../cart/cart_set_quantity.ts";
import { summarizeCart } from "../cart/cart_summary.ts";

export function updateCartQuantityTool(cartDb: CartDb, conversationId: string): AgentTool {
  return {
    name: "update_cart_quantity",
    description:
      "Set the absolute quantity of an item already in the conversation cart. " +
      "Use quantity 0 to remove the item.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        quantity: { type: "number" },
      },
      required: ["product_id", "quantity"],
      additionalProperties: false,
    },
    async execute(args) {
      if (typeof args.product_id !== "string") {
        return { error: "product_id must be a string" };
      }
      if (!Number.isInteger(args.quantity) || (args.quantity as number) < 0) {
        return { error: "quantity must be a non-negative integer" };
      }

      const existing = cartDb.getCart(conversationId);
      const cart: Cart = existing ?? {
        conversationId,
        items: [],
        updatedAt: new Date().toISOString(),
      };

      try {
        const updated = setCartItemQuantity(cart, args.product_id, args.quantity as number);
        const saved: Cart = {
          ...updated,
          updatedAt: new Date().toISOString(),
        };
        cartDb.saveCart(saved);
        return { cart: summarizeCart(saved) };
      } catch {
        return { error: `product_id not in cart: ${args.product_id}` };
      }
    },
  };
}

export default updateCartQuantityTool;