---
type: 'Task Contract'
title: 'Almacen SQLite de estado conversacional (upsert por conversationId)'
description: 'Persiste la ultima busqueda y el ultimo producto visto por conversacion, via node:sqlite, para sobrevivir un reinicio del proceso.'
tags: ['ccdd', 'conversation', 'sqlite']
language: typescript

task: conversation_conversation_db
intent: "Persistir el estado minimo de una conversacion via node:sqlite."
target: src/agent/conversation/conversation_db.ts
signature: "function openConversationDb(location: string): ConversationDb"
test_command: "node --test src/agent/conversation/conversation_db.test.ts"
budget:
  cyclomatic_max: 6
  nesting_max: 2
tests: "src/agent/conversation/conversation_db.test.ts"
tests_sha256: "dedd07503cf28adede69cb4e8abd8166614f8945e00bef1baf8f6c757e1580dd"
touch_only: ['src/agent/conversation/conversation_db.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Almacen SQLite de estado conversacional

## Intent
Issue #8: las preguntas de seguimiento ("que talles tiene la segunda?") hoy
funcionan solo porque el LLM ve su propio historial de mensajes DENTRO del mismo
proceso — reiniciar `main.ts` pierde todo el contexto. Este contrato es la capa de
persistencia minima que lo resuelve: guarda, por `conversationId`, la ultima query
de busqueda, los ids de sus resultados, y el ultimo producto visto en detalle.
Mismo patron que [catalog-db](../catalog-catalog-db.md) (`node:sqlite` nativo,
cero deps), con una diferencia deliberada: `saveState` es UPSERT (sobrescribe),
no falla en duplicado — una conversacion se actualiza en cada turno, no se
inserta una sola vez como un producto del catalogo.

## Interface
```typescript
export interface ConversationState {
  conversationId: string;
  lastSearchQuery: string | null;
  lastSearchResultIds: string[];
  lastViewedProductId: string | null;
  updatedAt: string;
}
export interface ConversationDb {
  getState(conversationId: string): ConversationState | null;
  saveState(state: ConversationState): void;
  close(): void;
}
function openConversationDb(location: string): ConversationDb
```

## Invariants
- `openConversationDb(location)` crea la tabla `conversations` si no existe;
  abrir el mismo archivo dos veces nunca lanza ni borra datos previos.
- `location` acepta `:memory:` y una ruta de archivo real.
- `getState(id)` con un `conversationId` sin guardar previamente devuelve `null`
  (nunca lanza).
- `saveState(state)` es un UPSERT por `conversationId`: si ya existia estado para
  ese id, el nuevo `saveState` REEMPLAZA el registro completo (no hace merge
  parcial — quien llama es responsable de leer el estado previo si necesita
  conservar un campo).
- `saveState` con el mismo `conversationId` que otro estado ya guardado NO afecta
  el estado de conversaciones distintas.
- `close()` libera el handle; no se usa el `ConversationDb` despues.

## Examples
- `getState("conv-1")` sobre una base vacia -> `null`.
- `saveState({...})` + `getState` con el mismo id -> el mismo objeto guardado.
- `saveState` dos veces con el mismo `conversationId` -> `getState` devuelve la
  segunda version (la primera se sobrescribe).
- Guardar estado para `"conv-1"`, `getState("conv-2")` -> `null` (no se mezclan).
- Guardar, cerrar, reabrir el mismo archivo -> el estado sigue ahi (simula un
  reinicio del proceso, criterio de aceptacion 2 del issue #8).

## Do / Don't
- DO: usar `node:sqlite` (`DatabaseSync`) del core de Node, sin dependencia npm.
- DO: serializar `lastSearchResultIds` (array) como columna `TEXT` con
  `JSON.stringify`/`JSON.parse`, igual que `catalog_db.ts`.
- DON'T: intentar resolver referencias en lenguaje natural ("la segunda") aca —
  eso lo hace el LLM con el contexto que `main.ts` le inyecta a partir de este
  estado; este contrato solo persiste/recupera datos.

## Tests
(Los tests estan en `src/agent/conversation/conversation_db.test.ts`, oraculo
congelado con `node:test`, usando `:memory:` para los casos deterministas y un
archivo temporal real para el caso de reinicio.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/conversation/conversation_db.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/conversation/conversation_db.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
