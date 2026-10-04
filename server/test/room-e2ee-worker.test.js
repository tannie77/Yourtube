import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const workerPath = fileURLToPath(new URL("../../yourtube/public/room-e2ee-worker.js", import.meta.url));

async function runTransform(source, direction, media, key, bytes) {
  let handler;
  vm.runInNewContext(source, { self: { addEventListener: (_name, callback) => { handler = callback; } },
    crypto: webcrypto, TransformStream, Uint8Array });
  const output = [];
  let completed;
  const completion = new Promise((resolve) => { completed = resolve; });
  const readable = new ReadableStream({ start(controller) { controller.enqueue({ data: Uint8Array.from(bytes).buffer }); controller.close(); } });
  const writable = new WritableStream({ write(frame) { output.push(new Uint8Array(frame.data)); }, close() { completed(); } });
  handler({ transformer: { options: { direction, media, key: Array.from(key) }, readable, writable } });
  await completion;
  return output[0] || null;
}

test("room media worker encrypts audio and video frames and decrypts only with the invitation key", async () => {
  const source = await readFile(workerPath, "utf8");
  const key = webcrypto.getRandomValues(new Uint8Array(32));
  const otherKey = webcrypto.getRandomValues(new Uint8Array(32));
  for (const media of ["audio", "video"]) {
    const plain = Uint8Array.from({ length: 64 }, (_, index) => index);
    const encrypted = await runTransform(source, "encrypt", media, key, plain);
    assert.ok(encrypted);
    assert.notDeepEqual(encrypted, plain);
    assert.deepEqual(await runTransform(source, "decrypt", media, key, encrypted), plain);
    assert.equal(await runTransform(source, "decrypt", media, otherKey, encrypted), null);
  }
});
