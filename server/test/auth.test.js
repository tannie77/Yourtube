import assert from "node:assert/strict";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import User from "../Modals/Auth.js";

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
  await User.init();
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

test("unfamiliar contexts require Mailpit OTP and security controls manage sessions, trust and theme", async () => {
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
            body = "";
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

  const email = `security-${Date.now()}@example.test`;
  const password = "local-password-123";
  const baseHeaders = {
    "x-vidcircle-device-id": "browser_device_alpha_123456",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
  };

  try {
    const registration = await request("/user/register", {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ name: "Security Student", email, password, testCity: "Pune", testState: "Maharashtra" }),
    });
    assert.equal(registration.status, 201);
    const registrationCookie = registration.headers.get("set-cookie").split(";")[0];
    await request("/user/logout", { method: "POST", headers: { cookie: registrationCookie } });

    const trustedLogin = await request("/user/login", {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ email, password, testCity: "Pune", testState: "Maharashtra" }),
    });
    assert.equal(trustedLogin.status, 200);
    const trustedCookie = trustedLogin.headers.get("set-cookie").split(";")[0];
    await request("/user/logout", { method: "POST", headers: { cookie: trustedCookie } });

    const unfamiliarHeaders = {
      ...baseHeaders,
      "x-vidcircle-device-id": "browser_device_beta_1234567",
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    };
    const challenged = await request("/user/login", {
      method: "POST",
      headers: unfamiliarHeaders,
      body: JSON.stringify({ email, password, testCity: "Pune", testState: "Maharashtra" }),
    });
    assert.equal(challenged.status, 202);
    assert.equal(challenged.headers.get("set-cookie"), null);
    const challenge = await challenged.json();
    assert.equal(challenge.otpRequired, true);
    assert.match(challenge.challengeToken, /^[A-Za-z0-9_-]+$/);
    assert.equal(messages.length, 1);
    const code = /one-time code is: (\d{6})/.exec(messages[0])?.[1];
    assert.match(code, /^\d{6}$/);

    const incorrectOtp = await request("/user/login/otp", {
      method: "POST",
      headers: unfamiliarHeaders,
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code: "000000" }),
    });
    assert.equal(incorrectOtp.status, 400);

    const verified = await request("/user/login/otp", {
      method: "POST",
      headers: unfamiliarHeaders,
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code }),
    });
    assert.equal(verified.status, 200);
    const verifiedCookie = verified.headers.get("set-cookie").split(";")[0];

    const secondSession = await request("/user/login", {
      method: "POST",
      headers: unfamiliarHeaders,
      body: JSON.stringify({ email, password, testCity: "Pune", testState: "Maharashtra" }),
    });
    assert.equal(secondSession.status, 200);
    const secondCookie = secondSession.headers.get("set-cookie").split(";")[0];

    const security = await request("/user/security", { headers: { cookie: verifiedCookie } });
    assert.equal(security.status, 200);
    const overview = await security.json();
    assert.equal(overview.sessions.length, 2);
    assert.ok(overview.trustedDevices.some((device) => device.deviceModel === "iPhone"));
    assert.ok(overview.attempts.some((attempt) => attempt.outcome === "otp_failed"));
    assert.ok(overview.attempts.some((attempt) => attempt.outcome === "otp_verified"));

    const otherSession = overview.sessions.find((session) => !session.current);
    assert.ok(otherSession);
    assert.equal((await request(`/user/security/sessions/${otherSession.id}`, { method: "DELETE", headers: { cookie: verifiedCookie } })).status, 200);
    assert.equal((await request("/user/me", { headers: { cookie: secondCookie } })).status, 401);

    const theme = await request("/user/preferences/theme", {
      method: "PATCH",
      headers: { cookie: verifiedCookie },
      body: JSON.stringify({ themePreference: "dark" }),
    });
    assert.equal(theme.status, 200);
    assert.equal((await theme.json()).themePreference, "dark");
    const me = await request("/user/me", { headers: { cookie: verifiedCookie } });
    assert.equal((await me.json()).user.themePreference, "dark");

    const changedLocation = await request("/user/login", {
      method: "POST",
      headers: unfamiliarHeaders,
      body: JSON.stringify({ email, password, testCity: "Mumbai", testState: "Maharashtra" }),
    });
    assert.equal(changedLocation.status, 202);
    assert.equal(messages.length, 2);

    const trustedDeviceId = overview.trustedDevices.find((device) => device.deviceModel === "iPhone").id;
    assert.equal((await request(`/user/security/trusted-devices/${trustedDeviceId}`, { method: "DELETE", headers: { cookie: verifiedCookie } })).status, 200);
  } finally {
    if (priorPort === undefined) delete process.env.MAILPIT_SMTP_PORT;
    else process.env.MAILPIT_SMTP_PORT = priorPort;
    await new Promise((resolve) => smtp.close(resolve));
  }
});
