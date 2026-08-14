import type { AgentTool } from "../tool_registry.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";
import type { CartDb } from "../cart/cart_db.ts";
import { addCartItem } from "../cart/cart_add_item.ts";
import { summarizeCart } from "../cart/cart_summary.ts";

export function addToCartTool(
  cartDb: CartDb,
  catalog: DbProduct[],
  conversationId: string,
): AgentTool {
  return {
    name: "add_to_cart",
    description:
      "Add a catalog product to the conversation cart, persisting it via CartDb and returning the updated cart summary.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        quantity: { type: "number" },
      },
      required: ["product_id"],
      additionalProperties: false,
    },
    async execute(args) {
      const productId = args.product_id;
      if (typeof productId !== "string") {
        return { error: "product_id must be a string" };
      }

      const quantity = args.quantity === undefined ? 1 : args.quantity;
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return { error: "quantity must be a positive integer" };
      }

      const product = catalog.find((p) => p.id === productId);
      if (product === undefined) {
        return { error: `no product found with id ${productId}` };
      }

      const current = cartDb.getCart(conversationId) ?? {
        conversationId,
        items: [],
        updatedAt: new Date().toISOString(),
      };

      const updated = addCartItem(current, {
        productId: product.id,
        name: product.name,
        quantity,
        unitPriceCents: product.priceCents,
      });

      const saved: typeof updated = {
        ...updated,
        updatedAt: new Date().toISOString(),
      };
      cartDb.saveCart(saved);

      const item = saved.items.find((i) => i.productId === productId)!;
      return { item, cart: summarizeCart(saved) };
    },
  };
}

export default addToCartTool;