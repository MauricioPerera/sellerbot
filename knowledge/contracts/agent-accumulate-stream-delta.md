---
type: 'Task Contract'
title: 'Acumulador de deltas de streaming'
description: 'Reduce fragmentos de streaming (texto y tool_calls fragmentados por indice) a un mensaje acumulado.'
tags: ['ccdd', 'agent', 'poolside', 'streaming']
language: typescript

task: agent_accumulate_stream_delta
intent: "Reducir un delta de streaming a un estado acumulado."
target: src/agent/accumulate_stream_delta.ts
signature: "function accumulateStreamDelta(state: AccumulatedMessage, delta: StreamDelta): AccumulatedMessage"
test_command: "node --test src/agent/accumulate_stream_delta.test.ts"
budget:
  cyclomatic_max: 5
  nesting_max: 2
tests: "src/agent/accumulate_stream_delta.test.ts"
tests_sha256: "23803c4f0646e56385fd9f7115391f333dedb4b89e12bc3fe18d220a47979121"
touch_only: ['src/agent/accumulate_stream_delta.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Acumulador de deltas de streaming

## Intent
La API de Poolside (OpenAI-compatible) entrega `tool_calls` fragmentados
chunk a chunk, identificados por `index`, no por nombre completo desde el
primer chunk. Esta es la pieza "hecha a mano" que reemplaza lo que un SDK
de mas alto nivel (como `eve`) resolveria por vos: reconstruir un mensaje
completo (texto + tool_calls) a partir de fragmentos, de forma pura y
determinista, sin tocar la red.

## Interface
```typescript
export interface AccumulatedToolCall { id: string; name: string; arguments: string; }
export interface AccumulatedMessage { content: string; toolCalls: AccumulatedToolCall[]; }
export interface StreamDelta {
  content?: string | null;
  tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
}
function accumulateStreamDelta(state: AccumulatedMessage, delta: StreamDelta): AccumulatedMessage
```

## Invariants
- `content` siempre crece por concatenacion; nunca se trunca.
- `toolCalls[i]` corresponde siempre al mismo `tool_call.index` a lo largo
  de todo el stream, sin importar en que chunk aparece cada fragmento.
- Un delta vacio (`{}`) devuelve un estado equivalente al de entrada.
- No muta el `state` recibido (devuelve un objeto nuevo).

## Examples
- Dos chunks `{content:"Hel"}`, `{content:"lo"}` -> `content === "Hello"`.
- Tres chunks de `tool_calls` en el mismo `index` (name en el primero,
  `arguments` fragmentado en los siguientes) -> un solo `AccumulatedToolCall`
  con `name` y `arguments` completos.
- Dos `tool_calls` concurrentes en `index: 0` e `index: 1` -> dos entradas
  independientes en `toolCalls`.

## Do / Don't
- DO: indexar `toolCalls` por `tc.index`, no por orden de llegada.
- DON'T: parsear `arguments` como JSON aca (eso es de
  [execute-tool-call](./agent-execute-tool-call.md)); aca es concatenacion
  de string cruda.

## Tests
(Los tests estan en `src/agent/accumulate_stream_delta.test.ts`, oraculo
congelado con `node:test`, usando chunks fijos en memoria, sin red.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/accumulate_stream_delta.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/accumulate_stream_delta.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
