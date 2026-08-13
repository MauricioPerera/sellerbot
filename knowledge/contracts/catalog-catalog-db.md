---
type: 'Task Contract'
title: 'Almacen SQLite del catalogo (schema + insert/get)'
description: 'Wrapper delgado sobre node:sqlite nativo: crea el schema de productos y expone insert/get/list/close, sin dependencias npm.'
tags: ['ccdd', 'catalog', 'sqlite']
language: typescript

task: catalog_catalog_db
intent: "Exponer un almacen SQLite local de productos normalizados via node:sqlite."
target: src/agent/catalog/catalog_db.ts
signature: "function openCatalogDb(location: string): CatalogDb"
test_command: "node --test src/agent/catalog/catalog_db.test.ts"
budget:
  cyclomatic_max: 8
  nesting_max: 2
tests: "src/agent/catalog/catalog_db.test.ts"
tests_sha256: "867d12bededad9d18620e075af5bc146da41b11fe639e412921c0705da19bb38"
touch_only: ['src/agent/catalog/catalog_db.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Almacen SQLite del catalogo

## Intent
Capa de persistencia minima para el catalogo dummy de sellerbot (issue
#2). Node 24 trae `node:sqlite` (`DatabaseSync`) nativo — cero
dependencias npm nuevas. Este contrato es SOLO schema + insert + get by
id + listado completo; la busqueda por keyword y el detalle con
variaciones relacionadas son contratos separados que operan sobre el
`DbProduct[]` que devuelve `listProducts()`
(`catalog-search-products.md`, `catalog-get-product-detail.md`, aun no
escritos) — funciones puras, sin dependencia de SQLite, para no acoplar
persistencia con logica de busqueda.

## Interface
```typescript
export interface DbProduct {
  id: string;
  sku: string;
  name: string;
  type: "simple" | "variable" | "variation";
  description: string;
  priceCents: number | null;
  categories: string[];
  images: string[];
  parentId: string | null;
  attributes: Array<{ name: string; value: string }>;
}
export interface CatalogDb {
  insertProduct(product: DbProduct): void;
  getProductById(id: string): DbProduct | null;
  listProducts(): DbProduct[];
  close(): void;
}
function openCatalogDb(location: string): CatalogDb
```

## Invariants
- `openCatalogDb(location)` crea la tabla `products` si no existe
  (`CREATE TABLE IF NOT EXISTS`) — abrir el mismo archivo dos veces nunca
  lanza ni borra datos previos.
- `location` acepta `:memory:` (DB efimera en RAM, para tests) y una ruta
  de archivo real.
- `insertProduct` persiste el objeto completo; `getProductById` con el
  mismo id devuelve un objeto `DbProduct` estructuralmente igual al
  insertado (arrays y `null` incluidos).
- `getProductById` con un id inexistente devuelve `null` (nunca lanza).
- Insertar dos veces el mismo `id` lanza (constraint de clave primaria).
- `priceCents` es SIEMPRE un entero (centavos de ARS) o `null` — nunca un
  float. `insertProduct` con un `priceCents` no entero lanza
  `Error: priceCents must be an integer`. La conversion a `$ 1.234,56`
  para mostrar al usuario es responsabilidad de la capa de presentacion,
  no de esta capa de persistencia.
- `listProducts()` devuelve TODOS los productos insertados (sin filtrar
  por `type`; excluir variaciones o paginar es responsabilidad de quien
  consuma la lista), en cualquier orden — quien la use decide el orden.
  Sobre una base vacia devuelve `[]`.
- `close()` libera el handle de la base; no se usa el `CatalogDb` despues
  de llamarlo.

## Examples
- `openCatalogDb(":memory:")` + `insertProduct({id:"17",...})` +
  `getProductById("17")` -> el mismo objeto insertado.
- `getProductById("missing")` -> `null`.
- Insertar `id:"17"` dos veces -> la segunda llamada lanza.
- Abrir el mismo archivo dos veces (cerrando el primero) -> el segundo
  handle ve los datos insertados por el primero.

## Do / Don't
- DO: usar `node:sqlite` (`DatabaseSync`) del core de Node, sin ninguna
  dependencia npm.
- DO: serializar `categories`, `images` y `attributes` (arrays/objetos)
  como columnas `TEXT` con `JSON.stringify`/`JSON.parse` — es la forma
  mas simple de persistir listas sin tablas relacionadas adicionales en
  este contrato minimo.
- DON'T: agregar logica de busqueda/filtrado aca — eso es de
  `catalog-search-products.md` (contrato futuro).

## Tests
(Los tests estan en `src/agent/catalog/catalog_db.test.ts`, oraculo
congelado con `node:test`, usando `:memory:` para los casos deterministas
y un archivo temporal real para el caso de re-apertura idempotente.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/catalog/catalog_db.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/catalog/catalog_db.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
