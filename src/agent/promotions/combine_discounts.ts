import type { Cart } from "../cart/cart_db.ts";
import { evaluateCoupon } from "../coupons/evaluate_coupon.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";
import { evaluatePromotion } from "./evaluate_promotion.ts";
import type { PromotionRule } from "./evaluate_promotion.ts";
import { summarizeCart } from "../cart/cart_summary.ts";

export interface CombinedDiscountResult {
  couponApplicable: boolean;
  couponDiscountCents: number;
  promotionApplicable: boolean;
  promotionDiscountCents: number;
  totalDiscountCents: number;
  totalCents: number | null;
  finalTotalCents: number | null;
}

export function combineDiscounts(
  cart: Cart,
  coupon: Coupon | null,
  promotionRule: PromotionRule | null,
  discountProductUnitPriceCents: number | null,
  now: string,
): CombinedDiscountResult {
  const totalCents = summarizeCart(cart).totalCents;

  const promotion = evaluatePromotion(cart, promotionRule, discountProductUnitPriceCents);
  const promotionApplicable = promotion.applicable;
  const promotionDiscountCents = promotionApplicable ? (promotion.discountCents ?? 0) : 0;

  const filterCouponCart =
    promotionApplicable && coupon !== null && coupon.appliesToPromotionalItems === false;
  const couponCart = filterCouponCart
    ? {
        ...cart,
        items: cart.items.filter((item) => item.productId !== promotionRule!.discountProductId),
      }
    : cart;

  const couponEval = evaluateCoupon(couponCart, coupon, now);
  const couponApplicable = couponEval.valid;
  const couponDiscountCents = couponApplicable ? (couponEval.discountCents ?? 0) : 0;

  const totalDiscountCents = couponDiscountCents + promotionDiscountCents;
  const finalTotalCents = totalCents === null ? null : totalCents - totalDiscountCents;

  return {
    couponApplicable,
    couponDiscountCents,
    promotionApplicable,
    promotionDiscountCents,
    totalDiscountCents,
    totalCents,
    finalTotalCents,
  };
}

export default combineDiscounts;
