import type { DbProduct } from "./catalog_db.ts";

export interface SearchResult {
  id: string;
  sku: string;
  name: string;
  priceCents: number | null;
  categories: string[];
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}

function searchableText(product: DbProduct): string {
  return [product.name, product.description, ...product.categories].join(" ");
}

function scoreProduct(queryTokens: Set<string>, productTokens: Set<string>): number {
  let score = 0;
  for (const token of queryTokens) {
    if (productTokens.has(token)) score += 1;
  }
  return score;
}

export function searchProducts(
  products: DbProduct[],
  query: string,
  limit = 5,
): SearchResult[] {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return [];

  const ranked: Array<{ result: SearchResult; score: number; name: string }> = [];
  for (const product of products) {
    if (product.type === "variation") continue;
    const productTokens = new Set(tokenize(searchableText(product)));
    const score = scoreProduct(queryTokens, productTokens);
    if (score === 0) continue;
    ranked.push({
      result: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        priceCents: product.priceCents,
        categories: product.categories,
      },
      score,
      name: product.name,
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  return ranked.slice(0, limit).map((r) => r.result);
}