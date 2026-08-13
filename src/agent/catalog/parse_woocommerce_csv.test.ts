import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWooCommerceCsv } from "./parse_woocommerce_csv.ts";

test("parseWooCommerceCsv parses a simple header + one row", () => {
  const csv = "ID,Name,Type\n17,Chaz Kangeroo Hoodie,variable\n";
  const rows = parseWooCommerceCsv(csv);
  assert.deepEqual(rows, [{ ID: "17", Name: "Chaz Kangeroo Hoodie", Type: "variable" }]);
});

test("parseWooCommerceCsv handles a quoted field containing a comma", () => {
  const csv = 'ID,Categories\n17,"Clothing>Men>Tops,Clothing>Collections"\n';
  const rows = parseWooCommerceCsv(csv);
  assert.equal(rows[0]?.Categories, "Clothing>Men>Tops,Clothing>Collections");
});

test("parseWooCommerceCsv handles a quoted field with an embedded newline", () => {
  const csv = 'ID,Description\n17,"Line one\nLine two"\n';
  const rows = parseWooCommerceCsv(csv);
  assert.equal(rows[0]?.Description, "Line one\nLine two");
});

test("parseWooCommerceCsv unescapes doubled double-quotes inside a quoted field", () => {
  const csv = 'ID,Name\n17,"He said ""hi"" to me"\n';
  const rows = parseWooCommerceCsv(csv);
  assert.equal(rows[0]?.Name, 'He said "hi" to me');
});

test("parseWooCommerceCsv keeps HTML markup in a description field intact", () => {
  const csv = 'ID,description\n17,"<p>Ideal for cold-weather training.</p>"\n';
  const rows = parseWooCommerceCsv(csv);
  assert.equal(rows[0]?.description, "<p>Ideal for cold-weather training.</p>");
});

test("parseWooCommerceCsv parses multiple data rows in order", () => {
  const csv = "ID,Name\n1,First\n2,Second\n3,Third\n";
  const rows = parseWooCommerceCsv(csv);
  assert.deepEqual(
    rows.map((r) => r.Name),
    ["First", "Second", "Third"],
  );
});

test("parseWooCommerceCsv ignores a trailing blank line at EOF", () => {
  const csv = "ID,Name\n1,First\n\n";
  const rows = parseWooCommerceCsv(csv);
  assert.equal(rows.length, 1);
});

test("parseWooCommerceCsv handles CRLF line endings", () => {
  const csv = "ID,Name\r\n1,First\r\n2,Second\r\n";
  const rows = parseWooCommerceCsv(csv);
  assert.deepEqual(
    rows.map((r) => r.Name),
    ["First", "Second"],
  );
});

test("parseWooCommerceCsv preserves empty fields as empty strings", () => {
  const csv = "ID,Name,SKU\n1,First,\n";
  const rows = parseWooCommerceCsv(csv);
  assert.equal(rows[0]?.SKU, "");
});

test("parseWooCommerceCsv returns an empty array for a header-only CSV", () => {
  const csv = "ID,Name\n";
  const rows = parseWooCommerceCsv(csv);
  assert.deepEqual(rows, []);
});
