// Composition root: lee el snapshot local del CSV, abre/crea el SQLite del
// catalogo, y corre el import idempotente. No es una unidad CCDD-contractada
// -- solo compone piezas que ya tienen su propio contrato (ver
// knowledge/contracts/catalog-*.md), igual que src/agent/main.ts.
import fs from "node:fs";
import { importCatalog } from "./import_catalog.ts";
import { openCatalogDb } from "./catalog_db.ts";

const CSV_PATH = "data/woocommerce-sample-data.csv";
const DB_PATH = "data/catalog.sqlite";

const csvText = fs.readFileSync(CSV_PATH, "utf8");
const db = openCatalogDb(DB_PATH);

const result = importCatalog(csvText, db);
db.close();

console.log(`Catalog import (${DB_PATH}): ${result.inserted} inserted, ${result.skipped} skipped, ${result.total} total.`);
