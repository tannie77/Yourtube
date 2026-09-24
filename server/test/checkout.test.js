import assert from "node:assert/strict";
import { createServer } from "node:net";
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

async function paidOrder(cookie, key, planId, billingCycle = "monthly") {
  const created = await api("/orders", { cookie, method: "POST", body: orderInput(key, planId, billingCycle) });
  assert.equal(created.status, 201);
  const id = created.data.order.orderId;
  const simulated = await api(`/orders/${id}/simulate`, { cookie, method: "POST", body: { outcome: "success" } });
  assert.equal(simulated.status, 200);
  const verified = await api(`/orders/${id}/verify`, { cookie, method: "POST", body: simulated.data.result });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.order.status, "paid");
  return verified.data.order;
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
  const upgrade = await api("/orders", { cookie: owner.cookie, method: "POST", body: orderInput("checkout_b_key_002", "gold") });
  assert.equal(upgrade.status, 201);
  assert.equal(upgrade.data.order.intent, "upgrade");
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

test("an interrupted test checkout resumes without activating twice", async () => {
  const { user, cookie } = await account("interrupted-checkout");
  const created = await api("/orders", { cookie, method: "POST", body: orderInput("interrupted_buy_001", "bronze", "monthly") });
  const id = created.data.order.orderId;
  const issued = await api(`/orders/${id}/simulate`, { cookie, method: "POST", body: { outcome: "success" } });
  assert.equal(issued.status, 200);
  assert.equal((await api("/me", { cookie })).data.effectivePlanId, "free");

  const reopened = await api(`/orders/${id}`, { cookie });
  assert.equal(reopened.data.order.status, "pending");
  assert.deepEqual(reopened.data.order.simulatedResult, issued.data.result);
  const verified = await api(`/orders/${id}/verify`, { cookie, method: "POST", body: reopened.data.order.simulatedResult });
  assert.equal(verified.status, 200);
  const firstExpiry = (await api("/me", { cookie })).data.expiresAt;

  // Emulate a process interruption after the subscription write but before the order was finalized.
  await CheckoutOrder.updateOne({ _id: id }, { $set: { status: "processing", processingAt: new Date(Date.now() - 60_000) } });
  const resumed = await api(`/orders/${id}/verify`, { cookie, method: "POST", body: issued.data.result });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.data.order.status, "paid");
  assert.equal((await api("/me", { cookie })).data.expiresAt, firstExpiry);
  assert.equal((await Subscription.countDocuments({ userId: user._id })), 1);
});

test("renewal, upgrade, prepaid downgrade, cancellation and expiry preserve history", async () => {
  const { user, cookie } = await account("lifecycle");
  const first = await paidOrder(cookie, "lifecycle_buy_001", "bronze");
  assert.equal(first.intent, "purchase");
  const initial = (await api("/me", { cookie })).data;

  const failedUpgrade = await api("/orders", { cookie, method: "POST", body: orderInput("lifecycle_fail_001", "gold", "yearly") });
  assert.equal(failedUpgrade.data.order.intent, "upgrade");
  const failureId = failedUpgrade.data.order.orderId;
  const failedResult = await api(`/orders/${failureId}/simulate`, { cookie, method: "POST", body: { outcome: "failure" } });
  await api(`/orders/${failureId}/verify`, { cookie, method: "POST", body: failedResult.data.result });
  assert.equal((await api("/me", { cookie })).data.expiresAt, initial.expiresAt);

  const renewed = await paidOrder(cookie, "lifecycle_renew_001", "bronze", "quarterly");
  assert.equal(renewed.intent, "renewal");
  assert.equal(new Date(renewed.termStartsAt).getTime(), new Date(initial.expiresAt).getTime());
  const afterRenewal = (await api("/me", { cookie })).data;
  assert.equal(new Date(afterRenewal.expiresAt).getTime() - new Date(initial.expiresAt).getTime(), 90 * 24 * 60 * 60 * 1000);

  const upgraded = await paidOrder(cookie, "lifecycle_upgrade_001", "gold");
  assert.equal(upgraded.intent, "upgrade");
  const afterUpgrade = (await api("/me", { cookie })).data;
  assert.equal(afterUpgrade.effectivePlanId, "gold");
  assert.ok(new Date(afterUpgrade.expiresAt) < new Date(afterRenewal.expiresAt));

  const downgraded = await paidOrder(cookie, "lifecycle_down_001", "silver");
  assert.equal(downgraded.intent, "downgrade");
  const scheduled = (await api("/me", { cookie })).data;
  assert.equal(scheduled.effectivePlanId, "gold");
  assert.equal(scheduled.scheduledChange.planId, "silver");
  assert.equal(scheduled.scheduledChange.startsAt, afterUpgrade.expiresAt);
  assert.equal(scheduled.scheduledChange.expiresAt, downgraded.termExpiresAt);
  assert.equal((await api("/orders", { cookie, method: "POST", body: orderInput("lifecycle_block_001", "bronze") })).status, 409);

  const cancelled = await api("/me/cancel", { cookie, method: "POST" });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.cancelAtPeriodEnd, true);
  assert.equal(cancelled.data.accessEndsAt, scheduled.scheduledChange.expiresAt);
  assert.equal((await api("/me/cancel", { cookie, method: "POST" })).data.cancelAtPeriodEnd, true);

  await Subscription.updateOne({ userId: user._id }, { $set: {
    expiresAt: new Date(Date.now() - 1000),
    "scheduledChange.startsAt": new Date(Date.now() - 1000),
    "scheduledChange.expiresAt": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  } });
  const afterTransition = (await api("/me", { cookie })).data;
  assert.equal(afterTransition.effectivePlanId, "silver");
  assert.equal(afterTransition.scheduledChange, null);
  assert.equal(afterTransition.cancelAtPeriodEnd, true);

  await Subscription.updateOne({ userId: user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = (await api("/me", { cookie })).data;
  assert.equal(expired.effectivePlanId, "free");
  assert.equal(expired.status, "expired");
  assert.equal((await api("/orders", { cookie })).data.orders.length, 5);
});

test("an older pending order cannot change a membership after another verified order", async () => {
  const { cookie } = await account("stale-order");
  await paidOrder(cookie, "stale_first_001", "bronze");
  const old = await api("/orders", { cookie, method: "POST", body: orderInput("stale_renew_001", "bronze") });
  assert.equal(old.data.order.intent, "renewal");
  await paidOrder(cookie, "stale_upgrade_001", "gold");
  const oldId = old.data.order.orderId;
  const issued = await api(`/orders/${oldId}/simulate`, { cookie, method: "POST", body: { outcome: "success" } });
  const rejected = await api(`/orders/${oldId}/verify`, { cookie, method: "POST", body: issued.data.result });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.data.order.status, "failed");
  assert.equal((await api("/me", { cookie })).data.effectivePlanId, "gold");
});

test("paid orders produce an owner-only receipt and send one local SMTP message", async () => {
  const messages = [];
  const smtp = createServer((socket) => {
    socket.write("220 local.test ESMTP\r\n");
    let buffer = "";
    let body = "";
    let readingBody = false;
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
        if (readingBody) {
          if (line === ".") {
            messages.push(body);
            readingBody = false;
            socket.write("250 queued\r\n");
          } else body += `${line}\n`;
        } else if (line.startsWith("EHLO")) socket.write("250-local.test\r\n250 OK\r\n");
        else if (line.startsWith("MAIL FROM") || line.startsWith("RCPT TO")) socket.write("250 OK\r\n");
        else if (line === "DATA") { readingBody = true; socket.write("354 End data\r\n"); }
        else if (line === "QUIT") { socket.write("221 Bye\r\n"); socket.end(); }
      }
    });
  });
  await new Promise((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const priorPort = process.env.MAILPIT_SMTP_PORT;
  process.env.MAILPIT_SMTP_PORT = String(smtp.address().port);
  try {
    const owner = await account("receipt-owner");
    const stranger = await account("receipt-stranger");
    const paid = await paidOrder(owner.cookie, "receipt_order_001", "silver");
    assert.equal(paid.receiptStatus, "sent");
    const receipt = await api(`/orders/${paid.orderId}/receipt`, { cookie: owner.cookie });
    assert.equal(receipt.status, 200);
    assert.equal(receipt.data.receipt.amountPaise, 19900);
    assert.equal(receipt.data.receipt.emailStatus, "sent");
    assert.equal((await api(`/orders/${paid.orderId}/receipt`, { cookie: stranger.cookie })).status, 404);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /No money was charged/);
    assert.match(messages[0], /silver/i);
    const retried = await api(`/orders/${paid.orderId}/receipt/send`, { cookie: owner.cookie, method: "POST" });
    assert.equal(retried.data.order.receiptStatus, "sent");
    assert.equal(messages.length, 1);

    process.env.MAILPIT_SMTP_PORT = "1";
    const renewed = await paidOrder(owner.cookie, "receipt_order_002", "silver");
    assert.equal(renewed.receiptStatus, "failed");
    assert.equal((await api("/me", { cookie: owner.cookie })).data.effectivePlanId, "silver");
    process.env.MAILPIT_SMTP_PORT = String(smtp.address().port);
    const deliveredLater = await api(`/orders/${renewed.orderId}/receipt/send`, { cookie: owner.cookie, method: "POST" });
    assert.equal(deliveredLater.status, 200);
    assert.equal(deliveredLater.data.order.receiptStatus, "sent");
    assert.equal(messages.length, 2);
  } finally {
    if (priorPort === undefined) delete process.env.MAILPIT_SMTP_PORT;
    else process.env.MAILPIT_SMTP_PORT = priorPort;
    await new Promise((resolve) => smtp.close(resolve));
  }
});
