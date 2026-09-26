import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Aditi Garden game", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Aditi Garden: The Living Map<\/title>/i);
  assert.match(html, /The Living Map/);
  assert.match(html, /Find four habitat songs\./);
  assert.match(html, /Explore/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the supplied 3D garden model", async () => {
  const model = await stat(new URL("../public/assets/aditi-garden.glb", import.meta.url));
  assert.ok(model.size > 2_000_000);
  assert.ok(model.size < 3_000_000);
});
