import type { Cart, CartItem } from "./cart_db.ts";

export interface CartItemSummary extends CartItem {
  subtotalCents: number | null;
}

export interface CartSummary {
  items: CartItemSummary[];
  totalCents: number | null;
}

export function summarizeCart(cart: Cart): CartSummary {
  const items: CartItemSummary[] = [];
  let totalCents: number | null = 0;

  for (const item of cart.items) {
    const subtotalCents =
      item.unitPriceCents === null ? null : item.unitPriceCents * item.quantity;
    items.push({ ...item, subtotalCents });

    if (subtotalCents === null) {
      totalCents = null;
    } else if (totalCents !== null) {
      totalCents += subtotalCents;
    }
  }

  return { items, totalCents };
}