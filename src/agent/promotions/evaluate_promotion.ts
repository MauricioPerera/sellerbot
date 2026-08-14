import type { Cart } from "../cart/cart_db.ts";

export interface PromotionRule {
  triggerProductId: string;
  discountProductId: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  combinableWithCoupons: boolean;
  active: boolean;
}

export interface PromotionEvaluation {
  applicable: boolean;
  reason: string | null;
  discountCents: number | null;
}

export function evaluatePromotion(
  cart: Cart,
  rule: PromotionRule | null,
  discountProductUnitPriceCents: number | null,
): PromotionEvaluation {
  if (rule === null) {
    return { applicable: false, reason: "promotion not found", discountCents: null };
  }
  if (rule.active === false) {
    return { applicable: false, reason: "promotion not active", discountCents: null };
  }
  const triggerInCart = cart.items.some((item) => item.productId === rule.triggerProductId);
  if (!triggerInCart) {
    return { applicable: false, reason: "trigger product not in cart", discountCents: null };
  }
  if (discountProductUnitPriceCents === null) {
    return { applicable: false, reason: "discount product price unknown", discountCents: null };
  }
  const discountCents =
    rule.discountType === "percentage"
      ? Math.round((discountProductUnitPriceCents * rule.discountValue) / 100)
      : Math.min(rule.discountValue, discountProductUnitPriceCents);
  return { applicable: true, reason: null, discountCents };
}

export default evaluatePromotion;
