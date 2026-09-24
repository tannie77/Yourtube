import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
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
  await mongoose.connect(database.getUri("vidcircle_subscription_test"));
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

test("plan catalogue uses one set of sample INR prices and three terms", async () => {
  const response = await fetch(`${baseUrl}/subscriptions/plans`);
  assert.equal(response.status, 200);
  const catalogue = await response.json();
  assert.equal(catalogue.currency, "INR");
  assert.deepEqual(catalogue.plans.map((plan) => plan.id), ["free", "bronze", "silver", "gold"]);
  assert.deepEqual(catalogue.billingCycles.map((cycle) => cycle.id), ["monthly", "quarterly", "yearly"]);
  assert.equal(catalogue.plans[0].features.dailyDownloads, 1);
  assert.equal(catalogue.plans[1].pricesPaise.monthly, 9900);
  assert.equal(catalogue.plans[3].features.dailyWatchMinutes, null);
});

test("account plan is Free by default and an expired paid record never grants paid status", async () => {
  assert.equal((await fetch(`${baseUrl}/subscriptions/me`)).status, 401);
  const registration = await fetch(`${baseUrl}/user/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Plan viewer",
      email: `plans-${Date.now()}@example.test`,
      password: "local-password-123",
    }),
  });
  assert.equal(registration.status, 201);
  const { user } = await registration.json();
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  const readPlan = () => fetch(`${baseUrl}/subscriptions/me`, { headers: { cookie } });

  const free = await readPlan();
  assert.equal(free.status, 200);
  assert.equal(free.headers.get("cache-control"), "no-store");
  assert.deepEqual(await free.json(), {
    userId: user._id,
    effectivePlanId: "free",
    status: "free",
    billingCycle: null,
    startedAt: null,
    expiresAt: null,
    cancelAtPeriodEnd: false,
    autoRenew: false,
  });

  const startedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await Subscription.create({ userId: user._id, planId: "silver", billingCycle: "monthly", startedAt, expiresAt });
  const active = await readPlan();
  assert.equal((await active.json()).effectivePlanId, "silver");

  await Subscription.updateOne({ userId: user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await readPlan();
  const expiredState = await expired.json();
  assert.equal(expiredState.effectivePlanId, "free");
  assert.equal(expiredState.status, "expired");
  assert.equal(expiredState.expiresAt, null);
});
