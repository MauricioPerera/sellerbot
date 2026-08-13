import type { DbProduct } from "./catalog_db.ts";

export interface ProductDetail {
  product: DbProduct;
  variations: DbProduct[];
}

export function getProductDetail(products: DbProduct[], id: string): ProductDetail | null {
  const product = products.find((p) => p.id === id);
  if (product === undefined) return null;

  const variations =
    product.type === "variable"
      ? products
          .filter((p) => p.type === "variation" && p.parentId === id)
          .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0))
      : [];

  return { product, variations };
}