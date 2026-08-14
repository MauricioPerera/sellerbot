// Dataset dummy de cupones (issue #6, batch 1 -- sin promociones vinculadas).
// A diferencia del catalogo (snapshot real de WooCommerce), no existe un
// dataset de cupones de origen para vendorizar: son inventados a mano para
// demo/desarrollo. No es una unidad CCDD-contractada (es data, no logica);
// la logica que la consume es evaluate_coupon.ts.
import type { Coupon } from "./evaluate_coupon.ts";

export const COUPONS: Coupon[] = [
  {
    code: "WELCOME10",
    discountType: "percentage",
    discountValue: 10,
    minPurchaseCents: null,
    validFrom: null,
    validUntil: null,
    applicableProductIds: null,
    appliesToPromotionalItems: true,
  },
  {
    code: "AHORRA500",
    discountType: "fixed",
    discountValue: 50000,
    minPurchaseCents: 100000,
    validFrom: null,
    validUntil: null,
    applicableProductIds: null,
    appliesToPromotionalItems: true,
  },
  {
    code: "HOODIE15",
    discountType: "percentage",
    discountValue: 15,
    minPurchaseCents: null,
    validFrom: null,
    validUntil: null,
    applicableProductIds: ["145", "139", "136"],
    appliesToPromotionalItems: false,
  },
  {
    code: "VERANO2025",
    discountType: "percentage",
    discountValue: 20,
    minPurchaseCents: null,
    validFrom: "2025-01-01T00:00:00.000Z",
    validUntil: "2025-03-31T23:59:59.999Z",
    applicableProductIds: null,
    appliesToPromotionalItems: true,
  },
];

export function findCoupon(code: string): Coupon | null {
  const normalized = code.trim().toUpperCase();
  return COUPONS.find((c) => c.code === normalized) ?? null;
}
