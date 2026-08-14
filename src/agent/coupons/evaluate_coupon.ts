import type { Cart } from "../cart/cart_db.ts";

export interface Coupon {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minPurchaseCents: number | null;
  validFrom: string | null;
  validUntil: string | null;
  applicableProductIds: string[] | null;
}

export interface CouponEvaluation {
  valid: boolean;
  reason: string | null;
  discountCents: number | null;
}

export function evaluateCoupon(
  cart: Cart,
  coupon: Coupon | null,
  now: string,
): CouponEvaluation {
  if (coupon === null) {
    return { valid: false, reason: "coupon not found", discountCents: null };
  }

  if (cart.items.length === 0) {
    return { valid: false, reason: "cart is empty", discountCents: null };
  }

  for (const item of cart.items) {
    if (item.unitPriceCents === null) {
      return { valid: false, reason: "item price unknown", discountCents: null };
    }
  }

  if (coupon.validFrom !== null && now < coupon.validFrom) {
    return { valid: false, reason: "coupon not yet valid", discountCents: null };
  }

  if (coupon.validUntil !== null && now > coupon.validUntil) {
    return { valid: false, reason: "coupon expired", discountCents: null };
  }

  const applicable = coupon.applicableProductIds;
  const eligibleItems =
    applicable === null
      ? cart.items
      : cart.items.filter((i) => applicable.includes(i.productId));

  if (eligibleItems.length === 0) {
    return { valid: false, reason: "no eligible items", discountCents: null };
  }

  const fullSubtotal = cart.items.reduce(
    (sum, i) => sum + (i.unitPriceCents as number) * i.quantity,
    0,
  );

  if (coupon.minPurchaseCents !== null && fullSubtotal < coupon.minPurchaseCents) {
    return { valid: false, reason: "cart below minimum purchase", discountCents: null };
  }

  const eligibleSubtotal = eligibleItems.reduce(
    (sum, i) => sum + (i.unitPriceCents as number) * i.quantity,
    0,
  );

  const discountCents =
    coupon.discountType === "percentage"
      ? Math.round((eligibleSubtotal * coupon.discountValue) / 100)
      : Math.min(coupon.discountValue, eligibleSubtotal);

  return { valid: true, reason: null, discountCents };
}