import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import User from "../Modals/Auth.js";
import AdCampaign from "../Modals/AdCampaign.js";
import AdEvent from "../Modals/AdEvent.js";
import { seedHouseCampaign } from "../ads/campaigns.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let server;
let base;

before(async () => {
  database = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" }, binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") } });
  await mongoose.connect(database.getUri("yourtube2_ads_test"));
  await Promise.all([User.init(), AdCampaign.init(), AdEvent.init()]);
  await seedHouseCampaign();
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
});

async function request(route, cookie, method = "GET", body = undefined) {
  return fetch(`${base}${route}`, { method, headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
}

test("first-party campaigns serve to free viewers and count daily unique events", async () => {
  const registered = await request("/user/register", "", "POST", { name: "Ad Tester", email: `ads-${Date.now()}@example.test`, password: "ad-test-password-123" });
  assert.equal(registered.status, 201);
  const user = (await registered.json()).user;
  const cookie = registered.headers.get("set-cookie").split(";")[0];
  const placement = await request("/ads/placement", cookie);
  assert.equal(placement.status, 200);
  const campaign = (await placement.json()).campaign;
  assert.equal(campaign.sponsor, "YourTube");
  const videoId = new mongoose.Types.ObjectId().toString();
  const event = { videoId, kind: "impression" };
  assert.equal((await (await request(`/ads/${campaign.id}/event`, cookie, "POST", event)).json()).recorded, true);
  assert.equal((await (await request(`/ads/${campaign.id}/event`, cookie, "POST", event)).json()).recorded, false);
  assert.equal((await AdCampaign.findById(campaign.id)).impressions, 1);
  assert.equal((await request("/ads/admin", cookie)).status, 403);
  await User.updateOne({ _id: user._id }, { $set: { role: "admin" } });
  const created = await request("/ads/admin", cookie, "POST", { sponsor: "Local Partner", headline: "Explore our offer", description: "An example sponsored campaign.", cta: "Learn more", destination: "https://example.com" });
  assert.equal(created.status, 201);
  assert.equal((await request("/ads/admin", cookie)).status, 200);
});
