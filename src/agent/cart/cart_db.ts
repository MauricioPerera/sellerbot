export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
}

export interface Cart {
  conversationId: string;
  items: CartItem[];
  updatedAt: string;
}

export interface CartDb {
  getCart(conversationId: string): Cart | null;
  saveCart(cart: Cart): void;
  getCouponCode(conversationId: string): string | null;
  setCouponCode(conversationId: string, code: string | null): void;
  close(): void;
}

import { DatabaseSync } from "node:sqlite";

function rowToCart(row: Record<string, unknown>): Cart {
  return {
    conversationId: row.conversationId as string,
    items: JSON.parse(row.items as string) as CartItem[],
    updatedAt: row.updatedAt as string,
  };
}

export function openCartDb(location: string): CartDb {
  const db = new DatabaseSync(location);
  db.exec(`
    CREATE TABLE IF NOT EXISTS carts (
      conversationId TEXT PRIMARY KEY,
      items TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      couponCode TEXT
    )
  `);

  // UPSERT that preserves a previously applied couponCode: on conflict we
  // only overwrite items/updatedAt, never the coupon column (contract invariant).
  const upsert = db.prepare(`
    INSERT INTO carts (conversationId, items, updatedAt, couponCode)
    VALUES (?, ?, ?, NULL)
    ON CONFLICT(conversationId) DO UPDATE SET
      items = excluded.items,
      updatedAt = excluded.updatedAt
  `);
  const getById = db.prepare("SELECT * FROM carts WHERE conversationId = ?");
  const getCoupon = db.prepare("SELECT couponCode FROM carts WHERE conversationId = ?");
  const setCoupon = db.prepare(`
    UPDATE carts SET couponCode = ? WHERE conversationId = ?
  `);

  return {
    saveCart(cart: Cart): void {
      upsert.run(
        cart.conversationId,
        JSON.stringify(cart.items),
        cart.updatedAt,
      );
    },
    getCart(conversationId: string): Cart | null {
      const row = getById.get(conversationId) as Record<string, unknown> | undefined;
      if (row === undefined) return null;
      return rowToCart(row);
    },
    getCouponCode(conversationId: string): string | null {
      const row = getCoupon.get(conversationId) as { couponCode: string | null } | undefined;
      if (row === undefined) return null;
      return row.couponCode;
    },
    setCouponCode(conversationId: string, code: string | null): void {
      if (code === null) {
        // Idempotent: no-op if no cart exists, otherwise clear the coupon.
        setCoupon.run(null, conversationId);
        return;
      }
      const row = getById.get(conversationId) as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new Error(`setCouponCode: cart for ${conversationId} does not exist`);
      }
      setCoupon.run(code, conversationId);
    },
    close(): void {
      db.close();
    },
  };
}