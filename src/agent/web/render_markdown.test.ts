import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "./render_markdown.ts";

test("renderMarkdown wraps plain text in a paragraph", () => {
  assert.equal(renderMarkdown("Hello world"), "<p>Hello world</p>");
});

test("renderMarkdown escapes raw HTML instead of executing it", () => {
  const result = renderMarkdown('<script>alert(1)</script>');
  assert.ok(!result.includes("<script>"));
  assert.ok(result.includes("&lt;script&gt;"));
});

test("renderMarkdown converts **bold** to <strong>", () => {
  assert.equal(renderMarkdown("This is **bold** text"), "<p>This is <strong>bold</strong> text</p>");
});

test("renderMarkdown converts *italic* to <em>", () => {
  assert.equal(renderMarkdown("This is *italic* text"), "<p>This is <em>italic</em> text</p>");
});

test("renderMarkdown converts `code` to <code>", () => {
  assert.equal(renderMarkdown("Run `npm test` now"), "<p>Run <code>npm test</code> now</p>");
});

test("renderMarkdown converts a [text](url) link to a safe anchor", () => {
  assert.equal(
    renderMarkdown("See [the docs](https://example.com/docs)"),
    '<p>See <a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">the docs</a></p>',
  );
});

test("renderMarkdown converts an ![alt](url) image to a safe img tag", () => {
  assert.equal(
    renderMarkdown("![A hoodie](https://example.com/hoodie.jpg)"),
    '<p><img src="https://example.com/hoodie.jpg" alt="A hoodie" loading="lazy"></p>',
  );
});

test("renderMarkdown rejects a javascript: URL in a link, rendering it as plain escaped text", () => {
  const result = renderMarkdown("[click me](javascript:alert(1))");
  assert.ok(!result.includes("<a "));
  assert.ok(!result.includes("javascript:"));
});

test("renderMarkdown rejects a javascript: URL in an image, rendering it as plain escaped text", () => {
  const result = renderMarkdown("![x](javascript:alert(1))");
  assert.ok(!result.includes("<img"));
});

test("renderMarkdown separates blank-line-delimited blocks into multiple paragraphs", () => {
  assert.equal(renderMarkdown("First paragraph.\n\nSecond paragraph."), "<p>First paragraph.</p><p>Second paragraph.</p>");
});

test("renderMarkdown converts consecutive '- ' lines into a bullet list", () => {
  assert.equal(
    renderMarkdown("Options:\n\n- Small\n- Medium\n- Large"),
    "<p>Options:</p><ul><li>Small</li><li>Medium</li><li>Large</li></ul>",
  );
});

test("renderMarkdown handles bold and a link in the same paragraph", () => {
  assert.equal(
    renderMarkdown("**Yoga Mat** — [view image](https://example.com/a.jpg)"),
    '<p><strong>Yoga Mat</strong> — <a href="https://example.com/a.jpg" target="_blank" rel="noopener noreferrer">view image</a></p>',
  );
});

test("renderMarkdown returns an empty string for empty input", () => {
  assert.equal(renderMarkdown(""), "");
});

test("renderMarkdown allows a relative URL starting with / in a link", () => {
  assert.equal(
    renderMarkdown("[home](/products)"),
    '<p><a href="/products" target="_blank" rel="noopener noreferrer">home</a></p>',
  );
});

test("renderMarkdown converts a '# ' line to an <h1>", () => {
  assert.equal(renderMarkdown("# Title"), "<h1>Title</h1>");
});

test("renderMarkdown converts a '## ' line to an <h2>", () => {
  assert.equal(renderMarkdown("## Abominable Hoodie"), "<h2>Abominable Hoodie</h2>");
});

test("renderMarkdown converts a '### ' line to an <h3>", () => {
  assert.equal(renderMarkdown("### Product Details"), "<h3>Product Details</h3>");
});

test("renderMarkdown applies inline formatting inside a heading", () => {
  assert.equal(renderMarkdown("## **Abominable** Hoodie"), "<h2><strong>Abominable</strong> Hoodie</h2>");
});

test("renderMarkdown splits a heading line followed directly by list lines (no blank line) into an <h3> plus a separate <ul>", () => {
  assert.equal(
    renderMarkdown("### Details:\n- SKU: MH09\n- Price: $69.00"),
    "<h3>Details:</h3><ul><li>SKU: MH09</li><li>Price: $69.00</li></ul>",
  );
});

test("renderMarkdown splits a plain text line followed directly by list lines (no blank line) into a <p> plus a separate <ul>", () => {
  assert.equal(
    renderMarkdown("Options:\n- Small\n- Medium"),
    "<p>Options:</p><ul><li>Small</li><li>Medium</li></ul>",
  );
});

test("renderMarkdown handles two heading+list groups back to back", () => {
  assert.equal(
    renderMarkdown("### Sizes:\n- S\n- M\n\n### Colors:\n- Red\n- Blue"),
    "<h3>Sizes:</h3><ul><li>S</li><li>M</li></ul><h3>Colors:</h3><ul><li>Red</li><li>Blue</li></ul>",
  );
});
