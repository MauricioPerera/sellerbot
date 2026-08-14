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

## Cupones (`src/agent/coupons/coupons_data.ts`)

A diferencia del catálogo, no hay un dataset de cupones real para vendorizar
— son **inventados a mano** para demo/desarrollo (issue #6). Viven como una
constante TypeScript, no un CSV, porque son solo 4 registros pensados para
ejercitar cada regla de elegibilidad del motor (`evaluate_coupon.ts`):

| Código | Tipo | Regla que ejercita |
|---|---|---|
| `WELCOME10` | 10% sin restricciones | caso simple |
| `AHORRA500` | $500 fijo, mínimo de compra $1.000 | `minPurchaseCents` |
| `HOODIE15` | 15%, solo hoodies (ids 145/139/136) | `applicableProductIds` |
| `VERANO2025` | 20%, vigente ene-mar 2025 | `validFrom`/`validUntil` (siempre vencido en 2026, útil para probar el caso "cupón expirado") |
