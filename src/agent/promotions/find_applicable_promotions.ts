import type { Cart } from "../cart/cart_db.ts";
import type { Promotion } from "./promotions_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";
import { evaluatePromotion } from "./evaluate_promotion.ts";

export interface ApplicablePromotion {
  promotion_id: string;
  discount_product_id: string;
  discount_product_name: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  discount_cents: number;
}

export function findApplicablePromotions(
  cart: Cart | null,
  promotions: Promotion[],
  catalog: DbProduct[],
): ApplicablePromotion[] {
  if (cart === null || cart.items.length === 0) {
    return [];
  }

  const result: ApplicablePromotion[] = [];
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
      discount_cents: evaluation.discountCents as number,
    });
  }
  return result;
}

export default findApplicablePromotions;