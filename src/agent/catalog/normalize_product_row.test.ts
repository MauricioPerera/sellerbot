import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeProductRow } from "./normalize_product_row.ts";
import type { CsvRow } from "./parse_woocommerce_csv.ts";

const ALL_COLUMNS = [
  "ID",
  "Type",
  "SKU",
  "Name",
  "description",
  "Sale price",
  "Regular price",
  "Categories",
  "Images",
  "Parent",
  "Attribute 1 name",
  "Attribute 1 value(s)",
  "Attribute 2 name",
  "Attribute 2 value(s)",
  "Attribute 3 name",
  "Attribute 3 value(s)",
];

function row(overrides: Partial<CsvRow>): CsvRow {
  const base: CsvRow = Object.fromEntries(ALL_COLUMNS.map((c) => [c, ""]));
  return { ...base, ...overrides };
}

test("normalizeProductRow maps a simple product with a regular price", () => {
  const result = normalizeProductRow(
    row({
      ID: "1",
      Type: "simple",
      SKU: "ABC",
      Name: "T-Shirt",
      description: "<p>A shirt.</p>",
      "Regular price": "19.99",
      Categories: "Clothing,Tops",
      Images: "https://example.com/a.jpg,https://example.com/b.jpg",
    }),
  );
  assert.deepEqual(result, {
    id: "1",
    sku: "ABC",
    name: "T-Shirt",
    type: "simple",
    description: "<p>A shirt.</p>",
    priceCents: 1999,
    categories: ["Clothing", "Tops"],
    images: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    parentSku: null,
    attributes: [],
  });
});

test("normalizeProductRow prefers Sale price over Regular price when both are set", () => {
  const result = normalizeProductRow(
    row({
      ID: "1",
      Type: "simple",
      SKU: "ABC",
      Name: "T-Shirt",
      "Sale price": "15",
      "Regular price": "19.99",
    }),
  );
  assert.equal(result.priceCents, 1500);
});

test("normalizeProductRow leaves priceCents null when both price fields are empty", () => {
  const result = normalizeProductRow(
    row({ ID: "17", Type: "variable", SKU: "MH01", Name: "Hoodie" }),
  );
  assert.equal(result.priceCents, null);
});

test("normalizeProductRow converts dollar strings to integer cents without float drift", () => {
  assert.equal(
    normalizeProductRow(row({ ID: "1", Type: "simple", SKU: "A", "Regular price": "52" }))
      .priceCents,
    5200,
  );
  assert.equal(
    normalizeProductRow(row({ ID: "1", Type: "simple", SKU: "A", "Regular price": "0.5" }))
      .priceCents,
    50,
  );
  assert.equal(
    normalizeProductRow(row({ ID: "1", Type: "simple", SKU: "A", "Regular price": "19.9" }))
      .priceCents,
    1990,
  );
});

test("normalizeProductRow sets parentSku from the Parent column for a variation", () => {
  const result = normalizeProductRow(
    row({ ID: "11", Type: "variation", SKU: "MH01-L-Black", Name: "Hoodie-L-Black", Parent: "MH01" }),
  );
  assert.equal(result.parentSku, "MH01");
});

test("normalizeProductRow leaves parentSku null when Parent is empty", () => {
  const result = normalizeProductRow(row({ ID: "1", Type: "simple", SKU: "A", Name: "A" }));
  assert.equal(result.parentSku, null);
});

test("normalizeProductRow splits Categories and Images, trimming and dropping empties", () => {
  const result = normalizeProductRow(
    row({
      ID: "1",
      Type: "simple",
      SKU: "A",
      Categories: "Clothing>Men, Clothing>Collections ,",
      Images: " https://example.com/a.jpg ,https://example.com/b.jpg",
    }),
  );
  assert.deepEqual(result.categories, ["Clothing>Men", "Clothing>Collections"]);
  assert.deepEqual(result.images, ["https://example.com/a.jpg", "https://example.com/b.jpg"]);
});

test("normalizeProductRow returns empty arrays when Categories/Images are blank", () => {
  const result = normalizeProductRow(row({ ID: "1", Type: "simple", SKU: "A" }));
  assert.deepEqual(result.categories, []);
  assert.deepEqual(result.images, []);
});

test("normalizeProductRow collects only the attribute slots that have a name", () => {
  const result = normalizeProductRow(
    row({
      ID: "17",
      Type: "variable",
      SKU: "MH01",
      "Attribute 1 name": "Size",
      "Attribute 1 value(s)": "XS|S|M|L|XL",
      "Attribute 2 name": "Color",
      "Attribute 2 value(s)": "Black|Gray|Orange",
    }),
  );
  assert.deepEqual(result.attributes, [
    { name: "Size", value: "XS|S|M|L|XL" },
    { name: "Color", value: "Black|Gray|Orange" },
  ]);
});

test("normalizeProductRow throws on an unrecognized Type", () => {
  assert.throws(
    () => normalizeProductRow(row({ ID: "1", Type: "grouped", SKU: "A", Name: "A" })),
    /unrecognized product type: grouped/,
  );
});
