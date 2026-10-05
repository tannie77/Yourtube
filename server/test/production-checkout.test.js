import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import app from "../app.js";
import { isActive, publicSubscription } from "../subscriptions/state.js";

test("public deployment does not offer or accept simulated checkout", async () => {
  const previous = process.env.NODE_ENV;
  const previousPaidAccess = process.env.PAID_ACCESS_DISABLED;
  process.env.NODE_ENV = "production";
  process.env.PAID_ACCESS_DISABLED = "true";
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const plans = await fetch(`${base}/subscriptions/plans`);
    assert.equal(plans.status, 200);
    assert.equal((await plans.json()).checkoutAvailable, false);
    for (const endpoint of ["/subscriptions/orders", "/subscriptions/orders/507f1f77bcf86cd799439011/simulate", "/subscriptions/orders/507f1f77bcf86cd799439011/verify"]) {
      const result = await fetch(`${base}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      assert.equal(result.status, 503);
    }
    const testMembership = { planId: "gold", expiresAt: new Date(Date.now() + 86400000) };
    assert.equal(isActive(testMembership), false);
    assert.equal(publicSubscription(testMembership, "test-user").effectivePlanId, "free");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    if (previousPaidAccess === undefined) delete process.env.PAID_ACCESS_DISABLED;
    else process.env.PAID_ACCESS_DISABLED = previousPaidAccess;
  }
});
