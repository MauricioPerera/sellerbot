---
type: 'Task Contract'
title: 'Registro de tools del agente'
description: 'Indexa una lista de AgentTool por nombre, en un Map, rechazando nombres duplicados.'
tags: ['ccdd', 'agent', 'poolside']

task: agent_tool_registry
intent: "Indexar tools por nombre en un registro, detectando duplicados."
target: src/agent/tool_registry.ts
signature: "function createToolRegistry(tools: AgentTool[]): ToolRegistry"
test_command: "node --test src/agent/tool_registry.test.ts"
budget:
  cyclomatic_max: 4
  nesting_max: 2
tests: "src/agent/tool_registry.test.ts"
tests_sha256: "6af40cc7fa148e65d2bcc9895cd055d085790de350d6a3cd447c34b416200974"
touch_only: ['src/agent/tool_registry.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Registro de tools del agente

## Intent
El agente necesita resolver un `tool_call` por nombre antes de ejecutarlo
(ver [execute-tool-call](./agent-execute-tool-call.md)) y antes de listar
las tools disponibles al modelo. Este contrato aisla esa indexacion como
funcion pura, sin tocar el cliente HTTP ni el loop de orquestacion (ver
[agent-loop](./agent-agent-loop.md)).

## Interface
```typescript
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}
export type ToolRegistry = Map<string, AgentTool>;
function createToolRegistry(tools: AgentTool[]): ToolRegistry
```

## Invariants
- El registro resultante tiene exactamente una entrada por `tool.name`.
- Nunca muta la lista de entrada.
- No lanza excepciones salvo por nombre duplicado.

## Examples
- `createToolRegistry([toolA, toolB])` -> `Map` con 2 entradas.
- `createToolRegistry([])` -> `Map` vacio, `size === 0`.
- `createToolRegistry([toolA, toolA])` -> lanza `Error: duplicate tool name: <name>`.

## Do / Don't
- DO: usar `Map` nativo, sin dependencias.
- DON'T: ejecutar `tool.execute` en ningun punto de este modulo (eso es de
  [execute-tool-call](./agent-execute-tool-call.md)).

## Tests
(Los tests estan en `src/agent/tool_registry.test.ts`, oraculo congelado
con `node:test`.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/tool_registry.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/tool_registry.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
