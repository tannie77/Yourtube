import assert from "node:assert/strict";
import { test } from "node:test";
import { clientContext } from "../security/client-context.js";
import { createStreamScheduler } from "../video/stream-priority.js";
import { validAdDestination } from "../ads/campaigns.js";

test("Render uses Cloudflare's overwritten client IP header", () => {
  const previous = process.env.RENDER_EXTERNAL_URL;
  process.env.RENDER_EXTERNAL_URL = "https://example.onrender.com";
  try {
    const headers = { "user-agent": "test", "cf-connecting-ip": "8.8.8.8", "x-forwarded-for": "1.1.1.1, 2.2.2.2" };
    const request = { socket: { remoteAddress: "10.0.0.1" }, get: (name) => headers[name] };
    assert.equal(clientContext(request).ip, "8.8.8.8");
    headers["cf-connecting-ip"] = "not-an-ip";
    assert.equal(clientContext(request).ip, "10.0.0.1");
  } finally {
    if (previous === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = previous;
  }
});

test("priority streams take the next available slot while standard streams stay bounded", async () => {
  const scheduler = createStreamScheduler({ maxActive: 2, standardLimit: 1 });
  const first = await scheduler.acquire(false);
  const standardWaiting = scheduler.acquire(false);
  const priority = await scheduler.acquire(true);
  assert.deepEqual(scheduler.snapshot(), { active: 2, standardActive: 1, priorityWaiting: 0, standardWaiting: 1 });
  priority();
  assert.equal(scheduler.snapshot().standardWaiting, 1);
  first();
  const second = await standardWaiting;
  assert.equal(scheduler.snapshot().standardActive, 1);
  second();
});

test("ads accept local and HTTPS destinations only", () => {
  assert.equal(validAdDestination("/membership?plan=gold"), true);
  assert.equal(validAdDestination("https://sponsor.example/path"), true);
  for (const value of ["//evil.example", "http://insecure.example", "javascript:alert(1)", "/\\evil.example"]) assert.equal(validAdDestination(value), false);
});
