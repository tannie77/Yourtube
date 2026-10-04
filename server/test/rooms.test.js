import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import { io as connect } from "socket.io-client";
import app from "../app.js";
import CallRoom from "../Modals/CallRoom.js";
import User from "../Modals/Auth.js";
import { attachRoomSignaling } from "../rooms/signaling.js";
import { roomIceConfiguration } from "../rooms/ice.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let httpServer;
let signalling;
let baseUrl;
const clients = [];

before(async () => {
  database = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" }, binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") } });
  await mongoose.connect(database.getUri("yourtube2_rooms_test"));
  await Promise.all([User.init(), CallRoom.init()]);
  httpServer = createServer(app);
  signalling = attachRoomSignaling(httpServer, ["http://127.0.0.1:3000"]);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

test("encrypted rooms require the invitation key proof before signaling access", async () => {
  const host = await register("EncryptedHost");
  const guest = await register("EncryptedGuest");
  const digest = "a".repeat(64);
  const created = await fetch(`${baseUrl}/rooms`, { method: "POST", headers: { "content-type": "application/json", cookie: host.cookie },
    body: JSON.stringify({ title: "Protected call", e2eeKeyDigest: digest }) });
  assert.equal(created.status, 201);
  const room = (await created.json()).room;
  assert.equal(room.e2eeRequired, true);
  const guestSocket = await socket(guest.cookie);
  assert.match((await emit(guestSocket, "room:join", { roomId: room.id })).message, /complete invitation link/);
  assert.match((await emit(guestSocket, "room:join", { roomId: room.id, keyDigest: "b".repeat(64) })).message, /complete invitation link/);
  assert.equal((await emit(guestSocket, "room:join", { roomId: room.id, keyDigest: digest })).ok, true);
});

test("authenticated rooms receive STUN and configured TURN servers", async () => {
  const unauthenticated = await fetch(`${baseUrl}/rooms/ice`);
  assert.equal(unauthenticated.status, 401);
  const user = await register("IceUser");
  const response = await fetch(`${baseUrl}/rooms/ice`, { headers: { cookie: user.cookie } });
  assert.equal(response.status, 200);
  assert.match((await response.json()).iceServers[0].urls[0], /^stun:/);
  assert.deepEqual(roomIceConfiguration({
    ROOM_STUN_URLS: "stun:example.org:3478",
    ROOM_TURN_URLS: "turns:relay.example.org:5349",
    ROOM_TURN_USERNAME: "temporary-user",
    ROOM_TURN_CREDENTIAL: "temporary-password",
  }), { iceServers: [{ urls: ["stun:example.org:3478"] }, { urls: ["turns:relay.example.org:5349"], username: "temporary-user", credential: "temporary-password" }], relayConfigured: true });
});

after(async () => {
  for (const client of clients) client.disconnect();
  if (signalling) await new Promise((resolve) => signalling.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 50));
  await mongoose.disconnect();
  if (database) await database.stop();
});

async function register(name) {
  const response = await fetch(`${baseUrl}/user/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email: `${name.toLowerCase()}-${Date.now()}@example.test`, password: "local-password-123" }) });
  assert.equal(response.status, 201);
  return { user: (await response.json()).user, cookie: response.headers.get("set-cookie").split(";")[0] };
}

async function socket(cookie) {
  const client = connect(baseUrl, { autoConnect: false, transports: ["websocket"], extraHeaders: { cookie, origin: "http://127.0.0.1:3000" } });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
    client.connect();
  });
}

function emit(client, event, payload) {
  return new Promise((resolve, reject) => client.timeout(3000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result)));
}

function once(client, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 3000);
    client.once(event, (value) => { clearTimeout(timeout); resolve(value); });
  });
}

function stateWhen(client, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.off("room:state", check); reject(new Error("Timed out waiting for room state")); }, 3000);
    function check(snapshot) {
      if (!predicate(snapshot)) return;
      clearTimeout(timeout);
      client.off("room:state", check);
      resolve(snapshot);
    }
    client.on("room:state", check);
  });
}

test("authenticated local rooms enforce limits, permissions, host controls and rejoin", async () => {
  const [host, member, third, fourth, fifth] = await Promise.all([register("Host"), register("Member"), register("Third"), register("Fourth"), register("Fifth")]);
  assert.equal((await fetch(`${baseUrl}/rooms/${"x".repeat(24)}`)).status, 401);
  const created = await fetch(`${baseUrl}/rooms`, { method: "POST", headers: { "content-type": "application/json", cookie: host.cookie }, body: JSON.stringify({ title: "Local team call" }) });
  assert.equal(created.status, 201);
  const room = (await created.json()).room;
  assert.match(room.id, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(room.isHost, true);
  const fetched = await fetch(`${baseUrl}/rooms/${room.id}`, { headers: { cookie: member.cookie } });
  assert.equal(fetched.status, 200);
  assert.equal((await fetched.json()).room.isHost, false);

  const unauthorized = connect(baseUrl, { autoConnect: false, transports: ["websocket"], extraHeaders: { origin: "http://127.0.0.1:3000" }, reconnection: false });
  const denied = once(unauthorized, "connect_error");
  unauthorized.connect();
  assert.match((await denied).message, /Sign in required/);
  unauthorized.disconnect();

  const [firstHostSocket, b, c, d, e] = await Promise.all([socket(host.cookie), socket(member.cookie), socket(third.cookie), socket(fourth.cookie), socket(fifth.cookie)]);
  let a = firstHostSocket;
  for (const client of [a, b, c, d]) assert.equal((await emit(client, "room:join", room.id)).ok, true);
  assert.match((await emit(e, "room:join", room.id)).message, /full/);
  const refreshedHost = await socket(host.cookie);
  assert.equal((await emit(refreshedHost, "room:join", room.id)).ok, true);
  a = refreshedHost;

  const offer = once(b, "room:signal");
  assert.equal((await emit(a, "room:signal", { to: b.id, type: "offer", description: { type: "offer", sdp: "test" } })).ok, true);
  assert.deepEqual(await offer, { from: a.id, type: "offer", description: { type: "offer", sdp: "test" } });
  const answer = once(a, "room:signal");
  assert.equal((await emit(b, "room:signal", { to: a.id, type: "answer", description: { type: "answer", sdp: "test-answer" } })).ok, true);
  assert.deepEqual(await answer, { from: b.id, type: "answer", description: { type: "answer", sdp: "test-answer" } });
  const candidate = { candidate: "local-candidate", sdpMid: "0", sdpMLineIndex: 0 };
  const ice = once(b, "room:signal");
  assert.equal((await emit(a, "room:signal", { to: b.id, type: "candidate", candidate })).ok, true);
  assert.deepEqual(await ice, { from: a.id, type: "candidate", candidate });
  assert.equal((await emit(e, "room:signal", { to: b.id, type: "offer", description: { type: "offer", sdp: "test" } })).ok, false);

  const mediaState = stateWhen(a, (snapshot) => snapshot.participants.some((person) => person.id === b.id && person.micOn && person.cameraOn));
  assert.equal((await emit(b, "room:presence", { micOn: true, cameraOn: true })).ok, true);
  assert.equal((await mediaState).participants.find((person) => person.id === b.id).cameraOn, true);

  const raised = stateWhen(a, (snapshot) => snapshot.participants.some((person) => person.id === b.id && person.handRaised));
  assert.equal((await emit(b, "room:presence", { handRaised: true })).ok, true);
  assert.equal((await raised).participants.find((person) => person.id === b.id).handRaised, true);
  const sharingState = stateWhen(a, (snapshot) => snapshot.participants.some((person) => person.id === b.id && person.sharing));
  assert.equal((await emit(b, "room:presence", { sharing: true })).ok, true);
  assert.equal((await sharingState).participants.find((person) => person.id === b.id).sharing, true);
  const chat = once(a, "room:chat");
  assert.equal((await emit(b, "room:chat", "  Hello from the lobby  ")).ok, true);
  const posted = await chat;
  assert.deepEqual({ from: posted.from, text: posted.text }, { from: b.id, text: "Hello from the lobby" });
  const sharedFile = once(a, "room:file");
  const fileData = Buffer.from("Room notes").toString("base64");
  assert.equal((await emit(b, "room:file", { name: "notes.txt", data: fileData })).ok, true);
  const shared = await sharedFile;
  assert.deepEqual({ from: shared.from, senderName: shared.senderName, name: shared.name, size: shared.size, data: shared.data }, { from: b.id, senderName: member.user.name, name: "notes.txt", size: 10, data: fileData });
  assert.deepEqual(Buffer.from(shared.data, "base64"), Buffer.from("Room notes"));
  assert.match((await emit(b, "room:file", { name: "large.txt", data: Buffer.alloc(128 * 1024 + 1).toString("base64") })).message, /128 KB/);

  assert.equal((await emit(a, "room:host", { type: "allowChat", value: false })).ok, true);
  assert.match((await emit(b, "room:chat", "Hello")).message, /disabled/);
  assert.match((await emit(b, "room:file", { name: "a.txt", data: Buffer.from("test").toString("base64") })).message, /disabled/);
  const sharingRevoked = stateWhen(b, (snapshot) => snapshot.room.allowShare === false && snapshot.participants.some((person) => person.id === b.id && !person.sharing));
  assert.equal((await emit(a, "room:host", { type: "allowShare", value: false })).ok, true);
  assert.equal((await sharingRevoked).participants.find((person) => person.id === b.id).sharing, false);
  assert.match((await emit(b, "room:presence", { sharing: true })).message, /disabled/);
  assert.equal((await emit(a, "room:presence", { sharing: true })).ok, true);
  assert.equal((await emit(a, "room:presence", { sharing: false })).ok, true);
  assert.match((await emit(b, "room:host", { type: "lock", value: true })).message, /Host controls/);

  assert.equal((await emit(a, "room:host", { type: "cohost", target: b.id, value: true })).ok, true);
  assert.equal((await emit(b, "room:presence", { sharing: true })).ok, true);
  const sharingDemoted = stateWhen(b, (snapshot) => snapshot.participants.some((person) => person.id === b.id && person.role === "member" && !person.sharing));
  assert.equal((await emit(a, "room:host", { type: "cohost", target: b.id, value: false })).ok, true);
  assert.equal((await sharingDemoted).participants.find((person) => person.id === b.id).sharing, false);
  assert.equal((await emit(a, "room:host", { type: "cohost", target: b.id, value: true })).ok, true);
  assert.equal((await emit(b, "room:chat", "Co-host message")).ok, true);
  assert.equal((await emit(b, "room:file", { name: "cohost.txt", data: fileData })).ok, true);
  assert.match((await emit(b, "room:recording", true)).message, /Only the host/);
  const recordingState = once(b, "room:state");
  assert.equal((await emit(a, "room:recording", true)).ok, true);
  assert.equal((await recordingState).room.recording, true);
  const recordingStopped = stateWhen(b, (snapshot) => snapshot.room.recording === false);
  assert.equal((await emit(a, "room:recording", false)).ok, true);
  assert.equal((await recordingStopped).room.recording, false);
  const unmutedState = stateWhen(a, (snapshot) => snapshot.participants.some((person) => person.id === c.id && person.micOn));
  assert.equal((await emit(c, "room:presence", { micOn: true })).ok, true);
  await unmutedState;
  const forceMute = once(c, "room:force-mute");
  const mutedState = stateWhen(a, (snapshot) => snapshot.participants.some((person) => person.id === c.id && !person.micOn));
  assert.equal((await emit(b, "room:host", { type: "mute", target: c.id })).ok, true);
  await forceMute;
  assert.equal((await mutedState).participants.find((person) => person.id === c.id).micOn, false);
  assert.equal((await emit(a, "room:host", { type: "lock", value: true })).ok, true);
  d.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.match((await emit(e, "room:join", room.id)).message, /locked/);
  const removed = once(c, "room:removed");
  assert.equal((await emit(a, "room:host", { type: "remove", target: c.id })).ok, true);
  await removed;
  const cAgain = await socket(third.cookie);
  assert.match((await emit(cAgain, "room:join", room.id)).message, /removed/);
  const removedRoom = await fetch(`${baseUrl}/rooms/${room.id}`, { headers: { cookie: third.cookie } });
  assert.equal((await removedRoom.json()).room.isRemoved, true);

  b.disconnect();
  const bAgain = await socket(member.cookie);
  assert.equal((await emit(bAgain, "room:join", room.id)).ok, true);
  const recordingBeforeLeave = stateWhen(bAgain, (snapshot) => snapshot.room.recording === true);
  assert.equal((await emit(a, "room:recording", true)).ok, true);
  await recordingBeforeLeave;
  const recordingAfterLeave = stateWhen(bAgain, (snapshot) => snapshot.room.recording === false);
  a.disconnect();
  assert.equal((await recordingAfterLeave).room.recording, false);
  a = await socket(host.cookie);
  assert.equal((await emit(a, "room:join", room.id)).ok, true);
  const ended = once(bAgain, "room:ended");
  await emit(a, "room:host", { type: "end" }).catch(() => {});
  await ended;
  assert.match((await emit(await socket(host.cookie), "room:join", room.id)).message, /ended/);
  const endedRoom = await fetch(`${baseUrl}/rooms/${room.id}`, { headers: { cookie: host.cookie } });
  assert.ok((await endedRoom.json()).room.endedAt);
});
