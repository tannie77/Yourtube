import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import CheckoutOrder from "../Modals/CheckoutOrder.js";
import Subscription from "../Modals/Subscription.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let httpServer;
let baseUrl;

before(async () => {
  database = await MongoMemoryServer.create({
    instance: { ip: "127.0.0.1" },
    binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") },
  });
  await mongoose.connect(database.getUri("vidcircle_checkout_test"));
  await Promise.all([CheckoutOrder.init(), Subscription.init()]);
  httpServer = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
});

async function account(name) {
  const response = await fetch(`${baseUrl}/user/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email: `${name}-${Date.now()}@example.test`, password: "local-password-123" }),
  });
  assert.equal(response.status, 201);
  const { user } = await response.json();
  return { user, cookie: response.headers.get("set-cookie").split(";")[0] };
}

async function api(pathname, { cookie, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}/subscriptions${pathname}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}

function orderInput(key, planId = "silver", billingCycle = "quarterly") {
  return { planId, billingCycle, idempotencyKey: key };
}

test("orders require sign-in and use server-side prices with idempotent creation", async () => {
  const { cookie } = await account("checkout-a");
  const input = orderInput("checkout_a_key_001");
  assert.equal((await api("/orders", { method: "POST", body: input })).status, 401);
  assert.equal((await api("/orders", { cookie, method: "POST", body: orderInput("bad-key", "free") })).status, 400);

  const first = await api("/orders", { cookie, method: "POST", body: { ...input, amountPaise: 1 } });
  assert.equal(first.status, 201);
  assert.equal(first.data.order.amountPaise, 54900);
  assert.equal(first.data.order.status, "pending");
  assert.equal(first.data.order.currency, "INR");

  const repeated = await api("/orders", { cookie, method: "POST", body: input });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.order.orderId, first.data.order.orderId);
  assert.equal((await api("/orders", { cookie, method: "POST", body: orderInput(input.idempotencyKey, "gold") })).status, 409);
  const history = await api("/orders", { cookie });
  assert.equal(history.data.orders.length, 1);
});

test("a signed local success activates once; tampered results and cross-account access fail", async () => {
  const owner = await account("checkout-b");
  const stranger = await account("checkout-c");
  const created = await api("/orders", { cookie: owner.cookie, method: "POST", body: orderInput("checkout_b_key_001") });
  const id = created.data.order.orderId;
  assert.equal((await api(`/orders/${id}`, { cookie: stranger.cookie })).status, 404);
  assert.equal((await api(`/orders/${id}/simulate`, { cookie: stranger.cookie, method: "POST", body: { outcome: "success" } })).status, 404);
  assert.equal((await api(`/orders/${id}/verify`, { cookie: owner.cookie, method: "POST", body: { outcome: "success" } })).status, 400);
  assert.equal((await api("/me", { cookie: owner.cookie })).data.effectivePlanId, "free");

  const issued = await api(`/orders/${id}/simulate`, { cookie: owner.cookie, method: "POST", body: { outcome: "success" } });
  assert.equal(issued.status, 200);
  assert.match(issued.data.result.signature, /^[a-f0-9]{64}$/);
  assert.equal((await api(`/orders/${id}/simulate`, { cookie: owner.cookie, method: "POST", body: { outcome: "failure" } })).status, 409);
  const forged = { ...issued.data.result, paymentId: "sim_pay_forged" };
  assert.equal((await api(`/orders/${id}/verify`, { cookie: owner.cookie, method: "POST", body: forged })).status, 400);
  assert.equal((await api("/me", { cookie: owner.cookie })).data.effectivePlanId, "free");

  const [firstAttempt, concurrentRetry] = await Promise.all([
    api(`/orders/${id}/verify`, { cookie: owner.cookie, method: "POST", body: issued.data.result }),
    api(`/orders/${id}/verify`, { cookie: owner.cookie, method: "POST", body: issued.data.result }),
  ]);
  assert.ok([200, 202].includes(firstAttempt.status));
  assert.ok([200, 202].includes(concurrentRetry.status));
  const verified = await api(`/orders/${id}`, { cookie: owner.cookie });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.order.status, "paid");
  assert.match(verified.data.order.invoiceNumber, /^VC-/);
  assert.equal(verified.data.order.paymentId, issued.data.result.paymentId);
  const active = (await api("/me", { cookie: owner.cookie })).data;
  assert.equal(active.effectivePlanId, "silver");
  assert.equal(active.billingCycle, "quarterly");
  assert.equal(active.autoRenew, false);
  assert.ok(new Date(active.expiresAt) > new Date(active.startedAt));

  const repeated = await api(`/orders/${id}/verify`, { cookie: owner.cookie, method: "POST", body: issued.data.result });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.order.invoiceNumber, verified.data.order.invoiceNumber);
  assert.equal((await Subscription.countDocuments({ userId: owner.user._id })), 1);
  assert.equal((await api("/orders", { cookie: owner.cookie, method: "POST", body: orderInput("checkout_b_key_002", "gold") })).status, 409);
});

test("failed and cancelled test results never activate a plan and remain in history", async () => {
  const { cookie } = await account("checkout-d");
  for (const [outcome, status] of [["failure", "failed"], ["cancel", "cancelled"]]) {
    const created = await api("/orders", { cookie, method: "POST", body: orderInput(`checkout_d_${outcome}_001`, "bronze", "monthly") });
    const id = created.data.order.orderId;
    const simulated = await api(`/orders/${id}/simulate`, { cookie, method: "POST", body: { outcome } });
    const verified = await api(`/orders/${id}/verify`, { cookie, method: "POST", body: simulated.data.result });
    assert.equal(verified.status, 200);
    assert.equal(verified.data.order.status, status);
    assert.equal((await api("/me", { cookie })).data.effectivePlanId, "free");
    const repeated = await api(`/orders/${id}/verify`, { cookie, method: "POST", body: simulated.data.result });
    assert.equal(repeated.data.order.status, status);
  }
  const history = await api("/orders", { cookie });
  assert.deepEqual(history.data.orders.map((order) => order.status).sort(), ["cancelled", "failed"]);
});
