---
type: 'Task Contract'
title: 'Evaluador de expresiones aritmeticas'
description: 'Parser recursive-descent puro para +, -, *, / y parentesis, sin eval ni Function.'
tags: ['ccdd', 'agent', 'poolside', 'tool-example']
language: typescript

task: agent_calculate_expression
intent: "Evaluar una expresion aritmetica de texto a un numero."
target: src/agent/calculate_expression.ts
signature: "function calculateExpression(expression: string): number"
test_command: "node --test src/agent/calculate_expression.test.ts"
budget:
  cyclomatic_max: 4
  nesting_max: 2
tests: "src/agent/calculate_expression.test.ts"
tests_sha256: "9bb932e33f78e1dea5e603c8045d44ea5651ff3233b56a037d708ff5e88576c9"
touch_only: ['src/agent/calculate_expression.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Evaluador de expresiones aritmeticas

## Intent
Segunda tool de ejemplo del agente (ver [get_time](./agent-tool-get-time.md)
para la primera), esta vez con input real. La razon de partirla en dos
contratos — este parser puro y el wrapper
[tool-calculate](./agent-tool-calculate.md) — es la misma que separa
[accumulate-stream-delta](./agent-accumulate-stream-delta.md) de
[execute-tool-call](./agent-execute-tool-call.md): la logica se testea
exhaustivamente sin ningun I/O, el wrapper solo adapta shape para el
modelo. Deliberadamente NO usa `eval`/`new Function` (superficie de
inyeccion de codigo inaceptable para un input que viene del modelo/usuario
final) — es un recursive-descent parser escrito a mano.

## Interface
```typescript
function calculateExpression(expression: string): number
```
Gramatica: `expr := term (('+'|'-') term)*`, `term := factor (('*'|'/') factor)*`,
`factor := number | '(' expr ')' | ('-'|'+') factor`.

## Invariants
- Nunca usa `eval`, `new Function`, ni ningun mecanismo de ejecucion de
  codigo arbitrario.
- Lanza `Error` con mensaje descriptivo ante: expresion vacia, caracter
  invalido, parentesis desbalanceado, division por cero, o texto sobrante
  despues de una expresion valida.
- El resultado nunca es `-0` (se normaliza a `0`).
- Espacios (multiples o al borde) no afectan el resultado.

## Examples
- `calculateExpression("2 + 3 * 4")` -> `14` (precedencia).
- `calculateExpression("(2 + 3) * 4")` -> `20` (parentesis).
- `calculateExpression("7 / 2")` -> `3.5`.
- `calculateExpression("1 / 0")` -> lanza `Error: division by zero`.
- `calculateExpression("")` -> lanza `Error: empty expression`.
- `calculateExpression("2 + a")` -> lanza `Error` con "unexpected character".

## Do / Don't
- DO: recursive-descent a mano, tokenizado inline (sin regex de tokenizado
  completo, sin libreria de parsing).
- DO: partir la gramatica en funciones top-level (`parseExpr`, `parseTerm`,
  `parseFactor`, `parseNumber`) que reciben un `ParserState` compartido en
  vez de closures anidadas dentro de `calculateExpression` — el gate de
  complejidad mide la funcion completa incluyendo cualquier funcion
  anidada en su cuerpo, así que anidar las cuatro funciones de la
  gramatica adentro de `calculateExpression` media 19 de ciclomatica
  contra un budget de 4; separadas a nivel de modulo, la funcion objetivo
  queda trivial (trim, chequeo de vacio, delegar, chequear sobrante).
- DON'T: usar `eval`, `new Function`, ni ninguna forma de interpretacion
  dinamica de codigo.

## Tests
(Los tests estan en `src/agent/calculate_expression.test.ts`, oraculo
congelado con `node:test`, 11 casos: exito, precedencia, parentesis
anidados, decimales, espacios, y 5 formas de error.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/calculate_expression.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/calculate_expression.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
