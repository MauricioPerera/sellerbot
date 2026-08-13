# data/

Snapshots locales versionados, sin dependencia de red en tests ni en la importación.

## `woocommerce-sample-data.csv`

Snapshot fijo de [stellarwp-sunset/woocommerce-sample-data](https://github.com/stellarwp-sunset/woocommerce-sample-data)
(rama `main`, descargado 2026-08-13), licenciado GPLv3 por su autor original. Es el catálogo
dummy que usa sellerbot para desarrollo/demo — 2037 productos (simples, variables y
variaciones) en formato estándar de export de WooCommerce.

- **No se actualiza automáticamente**: la importación (`src/agent/catalog/import_catalog.ts`)
  lee siempre este archivo local, nunca la URL remota. Si en algún momento se quiere
  refrescar el snapshot, es un paso manual explícito (volver a descargar y commitear), no
  parte del flujo normal de import/test.
- SHA-256 al momento del snapshot: `a5ea2c9d4091bd3b95b342c300655df717efb10c289f45e950f67f61ecb4ca0f`.
