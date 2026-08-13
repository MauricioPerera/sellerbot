import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateExpression } from "./calculate_expression.ts";

test("calculateExpression evaluates a single number", () => {
  assert.equal(calculateExpression("42"), 42);
});

test("calculateExpression respects operator precedence", () => {
  assert.equal(calculateExpression("2 + 3 * 4"), 14);
});

test("calculateExpression respects parentheses over precedence", () => {
  assert.equal(calculateExpression("(2 + 3) * 4"), 20);
});

test("calculateExpression handles nested parentheses and unary minus", () => {
  assert.equal(calculateExpression("-(2 + (3 - 5)) * 2"), 0);
});

test("calculateExpression handles decimals and division", () => {
  assert.equal(calculateExpression("7 / 2"), 3.5);
});

test("calculateExpression ignores surrounding and inner whitespace", () => {
  assert.equal(calculateExpression("  1 +   2  "), 3);
});

test("calculateExpression throws on division by zero", () => {
  assert.throws(() => calculateExpression("1 / 0"), /division by zero/);
});

test("calculateExpression throws on an empty expression", () => {
  assert.throws(() => calculateExpression(""), /empty expression/);
});

test("calculateExpression throws on invalid characters", () => {
  assert.throws(() => calculateExpression("2 + a"), /unexpected character/);
});

test("calculateExpression throws on unbalanced parentheses", () => {
  assert.throws(() => calculateExpression("(1 + 2"), /expected '\)'/);
});

test("calculateExpression throws on trailing garbage after a valid expression", () => {
  assert.throws(() => calculateExpression("1 + 1)"), /unexpected trailing input/);
});
