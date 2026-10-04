import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import CheckoutOrder from "../Modals/CheckoutOrder.js";
import Subscription from "../Modals/Subscription.js";
import RazorpayWebhookEvent from "../Modals/RazorpayWebhookEvent.js";
import { verifyHmac } from "../subscriptions/razorpay.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let server;
let baseUrl;

before(async () => {
  process.env.RAZORPAY_TEST_KEY_ID = "rzp_test_localtest123";
  process.env.RAZORPAY_TEST_KEY_SECRET = "test-key-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
  process.env.RAZORPAY_PLAN_BRONZE_MONTHLY = "plan_bronzeMonthly";
  for (const plan of ["BRONZE", "SILVER", "GOLD"]) for (const cycle of ["MONTHLY", "QUARTERLY", "YEARLY"]) {
    process.env[`RAZORPAY_PLAN_${plan}_${cycle}`] ||= `plan_${plan}${cycle}`;
  }
  database = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" }, binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") } });
  await mongoose.connect(database.getUri("yourtube2_razorpay_test"));
  await Promise.all([CheckoutOrder.init(), Subscription.init(), RazorpayWebhookEvent.init()]);
  server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
});

test("Razorpay signatures use timing-safe HMAC validation", () => {
  const signature = createHmac("sha256", "test-key-secret").update("pay_demo|sub_demo").digest("hex");
  assert.equal(verifyHmac("pay_demo|sub_demo", signature, "test-key-secret"), true);
  assert.equal(verifyHmac("pay_forged|sub_demo", signature, "test-key-secret"), false);
  assert.equal(verifyHmac("pay_demo|sub_demo", "bad", "test-key-secret"), false);
});

test("signed captured charge activates recurring membership once; cancellation stops renewal", async () => {
  const registration = await fetch(`${baseUrl}/user/register`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Razorpay test", email: `razorpay-${Date.now()}@example.test`, password: "local-password-123" }) });
  assert.equal(registration.status, 201);
  const { user } = await registration.json();
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  const order = await CheckoutOrder.create({ userId: user._id, idempotencyKey: "razorpay_local_001", provider: "razorpay",
    planId: "bronze", billingCycle: "monthly", amountPaise: 9900, verificationSecret: "a".repeat(64), razorpaySubscriptionId: "sub_local123" });
  const start = Math.floor(Date.now() / 1000) - 60;
  const end = start + 30 * 24 * 60 * 60;
  const charged = { event: "subscription.charged", payload: {
    payment: { entity: { id: "pay_local123", status: "captured", currency: "INR", amount: 9900, created_at: start } },
    subscription: { entity: { id: "sub_local123", plan_id: "plan_bronzeMonthly", status: "active", current_start: start, current_end: end } },
  } };
  const send = (event, id, signature) => {
    const body = JSON.stringify(event);
    return fetch(`${baseUrl}/subscriptions/razorpay/webhook`, { method: "POST", headers: {
      "content-type": "application/json", "x-razorpay-event-id": id,
      "x-razorpay-signature": signature || createHmac("sha256", "test-webhook-secret").update(body).digest("hex"),
    }, body });
  };
  assert.equal((await send(charged, "event_bad", "0".repeat(64))).status, 401);
  assert.equal((await send(charged, "event_charge_1")).status, 200);
  assert.equal((await send(charged, "event_charge_1")).status, 200);
  const membership = await fetch(`${baseUrl}/subscriptions/me`, { headers: { cookie } });
  const snapshot = await membership.json();
  assert.equal(snapshot.effectivePlanId, "bronze");
  assert.equal(snapshot.autoRenew, true);
  assert.equal(snapshot.paymentProvider, "razorpay");
  assert.equal(new Date(snapshot.nextRenewalAt).getTime(), end * 1000);
  assert.equal((await CheckoutOrder.findById(order._id)).status, "paid");
  assert.equal(await CheckoutOrder.countDocuments({ paymentId: "pay_local123" }), 1);
  const renewalEnd = end + 30 * 24 * 60 * 60;
  const renewal = { event: "subscription.charged", payload: {
    payment: { entity: { id: "pay_local124", status: "captured", currency: "INR", amount: 9900, created_at: end } },
    subscription: { entity: { id: "sub_local123", plan_id: "plan_bronzeMonthly", status: "active", current_start: end, current_end: renewalEnd } },
  } };
  assert.equal((await send(renewal, "event_charge_2")).status, 200);
  assert.equal((await send(renewal, "event_charge_2")).status, 200);
  const renewed = await (await fetch(`${baseUrl}/subscriptions/me`, { headers: { cookie } })).json();
  assert.equal(renewed.effectivePlanId, "bronze");
  assert.equal(new Date(renewed.nextRenewalAt).getTime(), renewalEnd * 1000);
  assert.equal(await CheckoutOrder.countDocuments({ userId: user._id, status: "paid" }), 2);
  const cancelled = { event: "subscription.cancelled", payload: { subscription: { entity: { id: "sub_local123" } } } };
  assert.equal((await send(cancelled, "event_cancel_1")).status, 200);
  const ended = await (await fetch(`${baseUrl}/subscriptions/me`, { headers: { cookie } })).json();
  assert.equal(ended.autoRenew, false);
  assert.equal(ended.cancelAtPeriodEnd, true);
});
