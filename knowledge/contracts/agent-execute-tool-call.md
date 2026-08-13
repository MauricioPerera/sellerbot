---
type: 'Task Contract'
title: 'Dispatcher de tool_calls'
description: 'Resuelve un tool_call acumulado contra el registro de tools, parsea sus argumentos JSON y ejecuta la tool.'
tags: ['ccdd', 'agent', 'poolside']

task: agent_execute_tool_call
intent: "Ejecutar un tool_call acumulado contra el registro de tools y devolver el mensaje de rol tool."
target: src/agent/execute_tool_call.ts
signature: "async function executeToolCall(toolCall: AccumulatedToolCall, registry: ToolRegistry): Promise<ToolResultMessage>"
test_command: "node --test src/agent/execute_tool_call.test.ts"
budget:
  cyclomatic_max: 6
  nesting_max: 2
tests: "src/agent/execute_tool_call.test.ts"
tests_sha256: "27ed1df46186b37c205cffbe9208723d71ccbc45d51b3ff97a3d28a4fb19dea2"
touch_only: ['src/agent/execute_tool_call.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Dispatcher de tool_calls

## Intent
Puente entre el `AccumulatedToolCall` que arma
[accumulate-stream-delta](./agent-accumulate-stream-delta.md) y el
`AgentTool.execute` real de [tool-registry](./agent-tool-registry.md).
Nunca hace red por si mismo: el oraculo lo verifica con tools mockeadas
inyectadas via el registro, no con tools reales de red.

## Interface
```typescript
export interface ToolResultMessage { role: "tool"; tool_call_id: string; content: string; }
async function executeToolCall(
  toolCall: AccumulatedToolCall,
  registry: ToolRegistry,
): Promise<ToolResultMessage>
```

## Invariants
- Siempre devuelve un `ToolResultMessage` (nunca lanza), incluso ante tool
  desconocida o argumentos JSON invalidos.
- `content` es siempre un string JSON valido (`JSON.stringify` del
  resultado o de un objeto `{ error: string }`).
- `tool_call_id` en la salida es siempre igual al `id` de entrada.

## Examples
- Tool `echo` registrada, `arguments: '{"text":"hi"}'` -> `content` es
  `JSON.stringify({ echoed: "hi" })`.
- `arguments: ""` -> se trata como `{}`.
- Tool con nombre no registrado -> `content` es
  `JSON.stringify({ error: "unknown tool: <name>" })`.
- `arguments: "{not-json"` -> `content` es
  `JSON.stringify({ error: "invalid JSON arguments" })`.

## Do / Don't
- DO: capturar el `JSON.parse` de `arguments` en un `try/catch` propio.
- DON'T: dejar que un error de `tool.execute` se propague sin capturar
  (para esta version, un tool que lanza no esta cubierto por el oraculo;
  cualquier tool real debe manejar sus propios errores).

## Tests
(Los tests estan en `src/agent/execute_tool_call.test.ts`, oraculo
congelado con `node:test`, usando una tool `echo` en memoria.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/execute_tool_call.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/execute_tool_call.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
