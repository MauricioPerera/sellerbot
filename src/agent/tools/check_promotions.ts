import type { AgentTool } from "../tool_registry.ts";
import type { CartDb } from "../cart/cart_db.ts";
import type { PromotionsDb, Promotion } from "../promotions/promotions_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";
import { evaluatePromotion } from "../promotions/evaluate_promotion.ts";

export function checkPromotionsTool(
  cartDb: CartDb,
  promotionsDb: PromotionsDb,
  catalog: DbProduct[],
  conversationId: string,
): AgentTool {
  return {
    name: "check_promotions",
    description:
      "List active linked-product promotions applicable to the current cart (read-only, never applies anything).",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      const cart = cartDb.getCart(conversationId);
      if (cart === null || cart.items.length === 0) {
        return { promotions: [] };
      }

      const promotions: Promotion[] = promotionsDb.listPromotions();
      const result = [];
      for (const rule of promotions) {
        if (rule.active !== true) continue;
        const triggerInCart = cart.items.some((item) => item.productId === rule.triggerProductId);
        if (!triggerInCart) continue;
        const product = catalog.find((p) => p.id === rule.discountProductId);
        if (product === undefined) continue;
        const evaluation = evaluatePromotion(cart, rule, product.priceCents);
        if (evaluation.applicable !== true) continue;
        result.push({
          promotion_id: rule.id,
          discount_product_id: rule.discountProductId,
          discount_product_name: product.name,
          discount_type: rule.discountType,
          discount_value: rule.discountValue,
          discount_cents: evaluation.discountCents,
        });
      }
      return { promotions: result };
    },
  };
}

export default checkPromotionsTool;