import type { AgentTool } from "../tool_registry.ts";
import type { CartDb } from "../cart/cart_db.ts";
import type { PromotionsDb } from "../promotions/promotions_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";
import { evaluatePromotion } from "../promotions/evaluate_promotion.ts";
import { addCartItem } from "../cart/cart_add_item.ts";
import { summarizeCart } from "../cart/cart_summary.ts";

export function applyPromotionTool(
  cartDb: CartDb,
  promotionsDb: PromotionsDb,
  catalog: DbProduct[],
  conversationId: string,
): AgentTool {
  return {
    name: "apply_promotion",
    description:
      "Confirm a suggested linked-product promotion: re-validate it, add the discounted product to the cart, and mark the promotion active.",
    parameters: {
      type: "object",
      properties: {
        promotion_id: { type: "string" },
      },
      required: ["promotion_id"],
      additionalProperties: false,
    },
    async execute(args) {
      const promotionId = args.promotion_id;
      if (typeof promotionId !== "string") {
        return { error: "promotion_id must be a string" };
      }

      const promotion = promotionsDb.getPromotion(promotionId);
      if (promotion === null) {
        return { error: "promotion not found" };
      }

      if (promotion.active === false) {
        return { error: "promotion not active" };
      }

      const cart = cartDb.getCart(conversationId) ?? {
        conversationId,
        items: [],
        updatedAt: new Date().toISOString(),
      };

      const product = catalog.find((p) => p.id === promotion.discountProductId);
      const priceCents = product ? product.priceCents : null;

      const evaluation = evaluatePromotion(cart, promotion, priceCents);
      if (!evaluation.applicable) {
        return { error: evaluation.reason };
      }

      const updated = addCartItem(cart, {
        productId: promotion.discountProductId,
        name: product!.name,
        quantity: 1,
        unitPriceCents: priceCents,
      });

      const saved: typeof updated = {
        ...updated,
        updatedAt: new Date().toISOString(),
      };
      cartDb.saveCart(saved);
      cartDb.setPromotionId(conversationId, promotionId);

      const item = saved.items.find(
        (i) => i.productId === promotion.discountProductId,
      )!;
      return {
        item,
        discount_cents: evaluation.discountCents,
        cart: summarizeCart(saved),
      };
    },
  };
}

export default applyPromotionTool;
