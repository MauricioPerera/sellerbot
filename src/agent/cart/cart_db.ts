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
  getPromotionId(conversationId: string): string | null;
  setPromotionId(conversationId: string, id: string | null): void;
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
      couponCode TEXT,
      promotionId TEXT
    )
  `);

  // Migrate older carts tables (pre-promotions) that lack the coupon/promotion
  // columns. CREATE TABLE IF NOT EXISTS does not add columns to an existing
  // table, so an older data/cart.sqlite would make the INSERT below fail with
  // "table carts has no column named promotionId".
  const cartCols = db.prepare("PRAGMA table_info(carts)").all() as { name: string }[];
  const cartColNames = new Set(cartCols.map((c) => c.name));
  for (const col of ["couponCode", "promotionId"]) {
    if (!cartColNames.has(col)) {
      db.exec(`ALTER TABLE carts ADD COLUMN ${col} TEXT`);
    }
  }

  // UPSERT that preserves a previously applied couponCode/promotionId: on
  // conflict we only overwrite items/updatedAt, never the coupon or promotion
  // columns (contract invariant).
  const upsert = db.prepare(`
    INSERT INTO carts (conversationId, items, updatedAt, couponCode, promotionId)
    VALUES (?, ?, ?, NULL, NULL)
    ON CONFLICT(conversationId) DO UPDATE SET
      items = excluded.items,
      updatedAt = excluded.updatedAt
  `);
  const getById = db.prepare("SELECT * FROM carts WHERE conversationId = ?");
  const getCoupon = db.prepare("SELECT couponCode FROM carts WHERE conversationId = ?");
  const setCoupon = db.prepare(`
    UPDATE carts SET couponCode = ? WHERE conversationId = ?
  `);
  const getPromotion = db.prepare("SELECT promotionId FROM carts WHERE conversationId = ?");
  const setPromotion = db.prepare(`
    UPDATE carts SET promotionId = ? WHERE conversationId = ?
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
    getPromotionId(conversationId: string): string | null {
      const row = getPromotion.get(conversationId) as { promotionId: string | null } | undefined;
      if (row === undefined) return null;
      return row.promotionId;
    },
    setPromotionId(conversationId: string, id: string | null): void {
      if (id === null) {
        // Idempotent: no-op if no cart exists, otherwise clear the promotion.
        setPromotion.run(null, conversationId);
        return;
      }
      const row = getById.get(conversationId) as Record<string, unknown> | undefined;
      if (row === undefined) {
        throw new Error(`setPromotionId: cart for ${conversationId} does not exist`);
      }
      setPromotion.run(id, conversationId);
    },
    close(): void {
      db.close();
    },
  };
}