import type { AgentTool } from "../tool_registry.ts";
import type { CartDb } from "../cart/cart_db.ts";
import { summarizeCart } from "../cart/cart_summary.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";
import type { PromotionsDb } from "../promotions/promotions_db.ts";
import type { PromotionRule } from "../promotions/evaluate_promotion.ts";
import { combineDiscounts } from "../promotions/combine_discounts.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";

export function viewCartTool(
  cartDb: CartDb,
  coupons: Coupon[],
  promotionsDb: PromotionsDb,
  catalog: DbProduct[],
  conversationId: string,
): AgentTool {
  return {
    name: "view_cart",
    description: "Show the current contents of the shopping cart (items, subtotals and total).",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      const cart = cartDb.getCart(conversationId);
      if (cart === null) {
        return { items: [], totalCents: 0 };
      }

      const summary = summarizeCart(cart);

      const couponCode = cartDb.getCouponCode(conversationId);
      const coupon = coupons.find((c) => c.code === couponCode) ?? null;

      const promotionId = cartDb.getPromotionId(conversationId);
      let promotionRule: PromotionRule | null = null;
      let discountPriceCents: number | null = null;
      if (promotionId !== null) {
        const promotion = promotionsDb.getPromotion(promotionId);
        if (promotion !== null && promotion.active === true) {
          promotionRule = promotion;
          const discountProduct = catalog.find((p) => p.id === promotion.discountProductId);
          discountPriceCents = discountProduct === undefined ? null : discountProduct.priceCents;
        }
      }

      const result = combineDiscounts(cart, coupon, promotionRule, discountPriceCents, new Date().toISOString());
      if (!result.couponApplicable && !result.promotionApplicable) {
        return summary;
      }

      const enriched: Record<string, unknown> = { ...summary };
      if (result.couponApplicable) {
        enriched.couponCode = couponCode;
        enriched.discountCents = result.couponDiscountCents;
      }
      if (result.promotionApplicable) {
        enriched.promotionId = promotionId;
        enriched.promotionDiscountCents = result.promotionDiscountCents;
      }
      enriched.finalTotalCents = result.finalTotalCents;
      return enriched;
    },
  };
}

export default viewCartTool;