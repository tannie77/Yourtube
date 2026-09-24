import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let httpServer;
let baseUrl;

before(async () => {
  database = await MongoMemoryServer.create({
    instance: { ip: "127.0.0.1" },
    binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") },
  });
  await mongoose.connect(database.getUri("vidcircle_test"));
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

async function request(route, options = {}) {
  return fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
}

test("local account registration, session, profile ownership and sign-out", async () => {
  const email = `student-${Date.now()}@example.test`;

  const guest = await request("/user/me");
  assert.equal(guest.status, 401);

  const invalid = await request("/user/register", {
    method: "POST",
    body: JSON.stringify({ name: "Student", email, password: "short" }),
  });
  assert.equal(invalid.status, 400);

  const registration = await request("/user/register", {
    method: "POST",
    body: JSON.stringify({ name: "Student", email, password: "local-password-123" }),
  });
  assert.equal(registration.status, 201);
  const account = (await registration.json()).user;
  assert.equal(account.email, email);
  assert.equal(account.passwordHash, undefined);
  const cookieHeader = registration.headers.get("set-cookie");
  assert.match(cookieHeader, /HttpOnly/i);
  const cookie = cookieHeader.split(";")[0];

  const duplicate = await request("/user/register", {
    method: "POST",
    body: JSON.stringify({ name: "Other", email, password: "local-password-123" }),
  });
  assert.equal(duplicate.status, 409);

  const me = await request("/user/me", { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user._id, account._id);

  const secondRegistration = await request("/user/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Second student",
      email: `second-${Date.now()}@example.test`,
      password: "another-local-password-123",
    }),
  });
  assert.equal(secondRegistration.status, 201);
  const secondAccount = (await secondRegistration.json()).user;
  const denied = await request(`/user/update/${secondAccount._id}`, {
    method: "PATCH",
    headers: { cookie },
    body: JSON.stringify({ channelname: "Wrong account" }),
  });
  assert.equal(denied.status, 403);

  const untouchedProfile = await request("/user/me", {
    headers: { cookie: secondRegistration.headers.get("set-cookie").split(";")[0] },
  });
  assert.equal((await untouchedProfile.json()).user.channelname, undefined);

  const ownProfile = await request(`/user/update/${account._id}`, {
    method: "PATCH",
    headers: { cookie },
    body: JSON.stringify({ channelname: "Student channel", description: "Local demo" }),
  });
  assert.equal(ownProfile.status, 200);
  assert.equal((await ownProfile.json()).user.channelname, "Student channel");

  const signOut = await request("/user/logout", { method: "POST", headers: { cookie } });
  assert.equal(signOut.status, 200);
  assert.equal((await request("/user/me", { headers: { cookie } })).status, 401);

  const incorrect = await request("/user/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "wrong-password" }),
  });
  assert.equal(incorrect.status, 401);

  const signIn = await request("/user/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "local-password-123" }),
  });
  assert.equal(signIn.status, 200);
  assert.equal((await signIn.json()).user._id, account._id);
});
