import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import User from "../Modals/Auth.js";
import Comment from "../Modals/comments.js";
import CommentAttempt from "../Modals/CommentAttempt.js";
import CommentFingerprint from "../Modals/CommentFingerprint.js";
import CommentReport from "../Modals/CommentReport.js";
import CommentModerationEvent from "../Modals/CommentModerationEvent.js";
import Video from "../Modals/video.js";
import { commentSafetyError } from "../security/comment-safety.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let httpServer;
let baseUrl;
let serial = 0;

before(async () => {
  database = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" }, binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") } });
  await mongoose.connect(database.getUri("vidcircle_comment_safety_test"));
  await Promise.all([CommentAttempt.init(), CommentFingerprint.init(), CommentReport.init(), CommentModerationEvent.init()]);
  httpServer = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
});

function request(route, cookie, method = "GET", body) {
  return fetch(`${baseUrl}${route}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function register(name) {
  serial += 1;
  const response = await request("/user/register", null, "POST", { name, email: `safety-${serial}@example.test`, password: "local-password-123" });
  assert.equal(response.status, 201);
  return { user: (await response.json()).user, cookie: response.headers.get("set-cookie").split(";")[0] };
}

async function videoFor(user, title) {
  return Video.create({ videotitle: title, filename: "demo.mp4", filetype: "video/mp4", filepath: "demo.mp4", filesize: 1024, videochanel: "Demo channel", uploader: user._id });
}

test("basic filters, duplicate guard and local challenge protect comment posting", async () => {
  assert.match(commentSafetyError("What the fuck"), /abusive/);
  assert.match(commentSafetyError("Visit https://example.com"), /Links/);
  assert.match(commentSafetyError("🙂🙂🙂🙂🙂🙂🙂🙂"), /repeated/);
  assert.match(commentSafetyError("hey hey hey hey"), /repeated words/);
  assert.equal(commentSafetyError("नमस्ते 🌍 مرحبا"), null);

  const author = await register("Safety Author");
  const video = await videoFor(author.user, "Safety checks");
  const route = `/comment/${video.id}`;
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "Visit https://example.com" })).status, 400);
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "One useful comment" })).status, 201);
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "one   useful COMMENT" })).status, 409);
  const challengeResponse = await request(route, author.cookie, "POST", { commentbody: "Another thought" });
  assert.equal(challengeResponse.status, 428);
  const question = (await challengeResponse.json()).challenge.question;
  const [a, b] = question.match(/\d+/g).map(Number);
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "Another thought", captchaAnswer: 0 })).status, 428);
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "Another thought", captchaAnswer: a + b })).status, 201);
  for (let index = 0; index < 4; index += 1) {
    assert.equal((await request(route, author.cookie, "POST", { commentbody: `Additional note ${index}` })).status, 201);
  }
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "One attempt too many" })).status, 429);
  assert.equal(await Comment.countDocuments({ videoid: video._id }), 6);

  const racer = await register("Duplicate Racer");
  const concurrent = await Promise.all([0, 1].map(() => request(route, racer.cookie, "POST", { commentbody: "Same concurrent message" })));
  assert.deepEqual(concurrent.map((item) => item.status).sort(), [201, 409]);
});

test("local translation failure keeps original text, and admin reports are reviewed and logged", async () => {
  const author = await register("Reported Author");
  const reporter = await register("Concerned Viewer");
  const admin = await register("Local Moderator");
  await User.updateOne({ _id: admin.user._id }, { $set: { role: "admin" } });
  const video = await videoFor(author.user, "Moderation demo");
  const route = `/comment/${video.id}`;

  const profile = await request("/user/comment-profile", reporter.cookie, "PATCH", { preferredLanguage: "hi" });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).user.preferredLanguage, "hi");
  assert.equal((await request("/user/comment-profile", reporter.cookie, "PATCH", { preferredLanguage: "xx" })).status, 400);

  const first = (await (await request(route, author.cookie, "POST", { commentbody: "Hello from this video" })).json()).comment;
  const second = (await (await request(route, author.cookie, "POST", { commentbody: "Another note for review" })).json()).comment;
  const reply = (await (await request(route, reporter.cookie, "POST", { commentbody: "A reply remains", parentId: second._id })).json()).comment;
  assert.equal((await request(`/comment/${first._id}`, author.cookie, "PATCH", { commentbody: "Visit www.example.com", expectedRevision: 1 })).status, 400);

  let translateCalls = 0;
  const translator = createServer(async (incoming, outgoing) => {
    let body = "";
    for await (const chunk of incoming) body += chunk;
    const payload = JSON.parse(body);
    assert.equal(payload.source, "auto");
    assert.equal(payload.target, "hi");
    translateCalls += 1;
    outgoing.writeHead(200, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ translatedText: "इस वीडियो से नमस्ते" }));
  });
  await new Promise((resolve) => translator.listen(0, "127.0.0.1", resolve));
  process.env.COMMENT_TRANSLATE_PORT = String(translator.address().port);
  try {
    const translated = await request(`/comment/${first._id}/translate`, reporter.cookie, "POST", {});
    assert.equal(translated.status, 200);
    assert.equal((await translated.json()).text, "इस वीडियो से नमस्ते");
    assert.equal((await request(`/comment/${first._id}/translate`, reporter.cookie, "POST", {})).status, 200);
    assert.equal(translateCalls, 1);
    assert.equal((await request(`/comment/${first._id}/translate`, reporter.cookie, "POST", { targetLanguage: "xx" })).status, 400);
  } finally {
    await new Promise((resolve) => translator.close(resolve));
  }
  const unavailable = await request(`/comment/${second._id}/translate`, reporter.cookie, "POST", {});
  assert.equal(unavailable.status, 503);
  const original = (await (await request(route, reporter.cookie)).json()).comments.find((item) => item._id === second._id);
  assert.equal(original.commentbody, "Another note for review");

  assert.equal((await request(`/comment/${first._id}/report`, reporter.cookie, "POST", { reason: "spam" })).status, 201);
  assert.equal((await request(`/comment/${first._id}/report`, reporter.cookie, "POST", { reason: "offensive" })).status, 409);
  assert.equal((await request(`/comment/${first._id}/report`, author.cookie, "POST", { reason: "spam" })).status, 400);
  assert.equal((await request(`/comment/${first._id}/report`, reporter.cookie, "POST", { reason: "unknown" })).status, 400);
  assert.equal((await request("/comment/moderation/queue", reporter.cookie)).status, 403);
  assert.equal((await request("/comment/moderation/queue")).status, 401);
  let queue = await request("/comment/moderation/queue", admin.cookie);
  assert.equal(queue.status, 200);
  const firstReport = (await queue.json()).reports[0];
  assert.equal(firstReport.comment.text, "Hello from this video");
  assert.equal((await request(`/comment/moderation/${firstReport._id}`, reporter.cookie, "POST", { decision: "remove" })).status, 403);
  assert.equal((await request(`/comment/moderation/${firstReport._id}`, admin.cookie, "POST", { decision: "dismiss" })).status, 200);
  assert.equal((await request(`/comment/moderation/${firstReport._id}`, admin.cookie, "POST", { decision: "remove" })).status, 409);

  assert.equal((await request(`/comment/${second._id}/report`, admin.cookie, "POST", { reason: "harassment" })).status, 201);
  queue = await request("/comment/moderation/queue", admin.cookie);
  const secondReport = (await queue.json()).reports[0];
  assert.equal((await request(`/comment/moderation/${secondReport._id}`, admin.cookie, "POST", { decision: "remove" })).status, 200);
  const listing = (await (await request(route, reporter.cookie)).json()).comments;
  assert.equal(listing.find((item) => item._id === second._id).commentbody, null);
  assert.equal(listing.find((item) => item._id === reply._id).commentbody, "A reply remains");
  assert.equal((await request(`/comment/${second._id}/translate`, reporter.cookie, "POST", {})).status, 409);
  assert.equal((await request(`/comment/${second._id}/report`, reporter.cookie, "POST", { reason: "spam" })).status, 409);
  assert.equal((await CommentReport.findById(secondReport._id)).status, "removed");
  assert.equal(await CommentModerationEvent.countDocuments(), 2);
  const reviewedQueue = (await (await request("/comment/moderation/queue", admin.cookie)).json());
  assert.equal(reviewedQueue.reports.length, 0);
  assert.deepEqual(reviewedQueue.logs.map((entry) => entry.decision), ["remove", "dismiss"]);
  const history = (await (await request(`/comment/${second._id}/history`, author.cookie)).json()).history;
  assert.deepEqual(history.map((entry) => entry.action), ["created", "moderated"]);
  delete process.env.COMMENT_TRANSLATE_PORT;
});
