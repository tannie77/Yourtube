import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import Comment from "../Modals/comment.js";
import CommentAttempt from "../Modals/CommentAttempt.js";
import CommentFingerprint from "../Modals/CommentFingerprint.js";
import CommentReaction from "../Modals/CommentReaction.js";
import CommentReport from "../Modals/CommentReport.js";
import CommentTranslation from "../Modals/CommentTranslation.js";
import CommentModerationEvent from "../Modals/CommentModerationEvent.js";
import User from "../Modals/Auth.js";
import Video from "../Modals/video.js";
import { commentFingerprint, commentSafetyError } from "../security/comment-safety.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let httpServer;
let baseUrl;
let serial = 0;
const originalTurnstileSiteKey = process.env.TURNSTILE_SITE_KEY;
const originalTurnstileSecretKey = process.env.TURNSTILE_SECRET_KEY;

before(async () => {
  process.env.TURNSTILE_SITE_KEY = "";
  process.env.TURNSTILE_SECRET_KEY = "";
  database = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" }, binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") } });
  await mongoose.connect(database.getUri("yourtube2_comments_test"));
  await Promise.all([CommentAttempt.init(), CommentFingerprint.init(), CommentReaction.init(), CommentReport.init(), CommentTranslation.init()]);
  httpServer = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  if (originalTurnstileSiteKey === undefined) delete process.env.TURNSTILE_SITE_KEY;
  else process.env.TURNSTILE_SITE_KEY = originalTurnstileSiteKey;
  if (originalTurnstileSecretKey === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalTurnstileSecretKey;
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
  const response = await request("/user/register", null, "POST", { name, email: `comments-${serial}@example.test`, password: "local-password-123" });
  assert.equal(response.status, 201);
  return { user: (await response.json()).user, cookie: response.headers.get("set-cookie").split(";")[0] };
}

async function createVideo(owner, title, accessPlan = "free") {
  return Video.create({
    videotitle: title, filename: "sample.mp4", filetype: "video/mp4", filepath: "/uploads/private.mp4",
    filesize: 1024, videochanel: "Test channel", uploader: owner.user._id,
    sourceQuality: "480p", durationSeconds: 60, accessPlan,
  });
}

test("comments and replies use the session, enforce video access, and preserve replies after soft deletion", async () => {
  const owner = await register("First viewer");
  const other = await register("Second viewer");
  const free = await createVideo(owner, "Conversation demo");
  const premium = await createVideo(owner, "Members conversation", "silver");
  const second = await createVideo(owner, "Another conversation");
  const route = `/comment/${free._id}`;

  assert.equal((await request(route)).status, 401);
  assert.equal((await request(route, null, "POST", { commentbody: "Hello" })).status, 401);
  assert.equal((await request("/comment/not-an-id", owner.cookie)).status, 404);
  assert.equal((await request(`/comment/${premium._id}`, other.cookie)).status, 403);
  assert.equal((await request(`/comment/${premium._id}`, other.cookie, "POST", { commentbody: "No access" })).status, 403);
  assert.equal((await request(`/comment/${premium._id}`, owner.cookie)).status, 200);
  assert.equal((await request(`${route}?sort=unknown`, owner.cookie)).status, 400);

  const posted = await request(route, owner.cookie, "POST", { commentbody: "  नमस्ते 🌍 مرحبا  ", userid: other.user._id, usercommented: "Impersonator" });
  assert.equal(posted.status, 201);
  assert.match(posted.headers.get("cache-control"), /no-store/);
  const first = (await posted.json()).comment;
  assert.equal(first.commentbody, "नमस्ते 🌍 مرحبا");
  assert.equal(first.author._id, owner.user._id);
  assert.equal(first.author.name, "First viewer");
  assert.equal(first.canEdit, true);
  assert.equal((await Comment.findById(first._id)).userid.toString(), owner.user._id);
  assert.equal((await request(route, owner.cookie, "POST", { commentbody: "  " })).status, 400);
  assert.equal((await request(route, owner.cookie, "POST", { commentbody: "🙂".repeat(2001) })).status, 400);
  assert.equal((await request(`/comment/${second._id}`, other.cookie, "POST", { commentbody: "Wrong video", parentId: first._id })).status, 404);

  const replyResponse = await request(route, other.cookie, "POST", { commentbody: "A reply", parentId: first._id });
  assert.equal(replyResponse.status, 201);
  const reply = (await replyResponse.json()).comment;
  assert.equal(reply.parentId, first._id);
  assert.equal(reply.author._id, other.user._id);
  const listingResponse = await request(route, other.cookie);
  assert.match(listingResponse.headers.get("cache-control"), /no-store/);
  const listing = await listingResponse.json();
  assert.equal(listing.editWindowMinutes, 15);
  assert.equal(listing.comments.length, 2);
  assert.equal(listing.comments.find((entry) => entry._id === first._id).canEdit, false);
  assert.equal(listing.comments.find((entry) => entry._id === reply._id).canEdit, true);
  assert.equal((await request(`${route}?sort=oldest`, owner.cookie)).status, 200);

  assert.equal((await request(`/comment/${first._id}`, other.cookie, "PATCH", { commentbody: "Hijacked", expectedRevision: 1 })).status, 403);
  assert.equal((await request(`/comment/${first._id}`, other.cookie, "DELETE", { expectedRevision: 1 })).status, 403);
  assert.equal((await request(`/comment/${first._id}/history`, other.cookie)).status, 403);
  const edited = await request(`/comment/${first._id}`, owner.cookie, "PATCH", { commentbody: "Updated multilingual text हिन्दी", expectedRevision: 1 });
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).comment.revision, 2);
  assert.equal((await request(`/comment/${first._id}`, owner.cookie, "PATCH", { commentbody: "Stale update", expectedRevision: 1 })).status, 409);
  const history = (await (await request(`/comment/${first._id}/history`, owner.cookie)).json()).history;
  assert.deepEqual(history.map((entry) => entry.action), ["created", "edited"]);

  const deleted = await request(`/comment/${first._id}`, owner.cookie, "DELETE", { expectedRevision: 2 });
  assert.equal(deleted.status, 200);
  const afterDelete = (await (await request(route, owner.cookie)).json()).comments;
  assert.equal(afterDelete.find((entry) => entry._id === first._id).commentbody, null);
  assert.ok(afterDelete.find((entry) => entry._id === first._id).deletedAt);
  assert.equal(afterDelete.find((entry) => entry._id === reply._id).parentId, first._id);
  assert.equal(afterDelete.find((entry) => entry._id === reply._id).commentbody, "A reply");
  assert.equal((await Comment.findById(first._id)).commentbody, "");

  await Comment.collection.updateOne({ _id: new mongoose.Types.ObjectId(reply._id) }, { $set: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } });
  assert.equal((await request(`/comment/${reply._id}`, other.cookie, "PATCH", { commentbody: "Too late", expectedRevision: 1 })).status, 403);
  assert.equal((await request(`/comment/${reply._id}`, other.cookie, "DELETE", { expectedRevision: 1 })).status, 403);
  assert.equal((await request("/comment/postcomment", owner.cookie, "POST", { commentbody: "Legacy route" })).status, 404);
  assert.equal((await request(`/comment/editcomment/${reply._id}`, owner.cookie, "POST", { commentbody: "Legacy edit" })).status, 404);
  assert.equal((await request(`/comment/deletecomment/${reply._id}`, owner.cookie, "DELETE", { expectedRevision: 1 })).status, 404);
});

test("local safety checks block abuse, duplicates, and repeated posting without trusting supplied identities", async () => {
  assert.match(commentSafetyError("What the fuck"), /abusive/);
  assert.match(commentSafetyError("What the f.u.c.k"), /abusive/);
  assert.match(commentSafetyError("یہ بہنچود ہے"), /abusive/);
  assert.match(commentSafetyError("Quelle merde"), /abusive/);
  assert.match(commentSafetyError("Visit https://example.com"), /Links/);
  assert.match(commentSafetyError("Visit bit.ly/offer"), /Links/);
  assert.match(commentSafetyError("Open 127.0.0.1/private"), /Links/);
  assert.match(commentSafetyError("🙂🙂🙂🙂🙂🙂🙂🙂"), /repeated/);
  assert.equal(commentSafetyError("नमस्ते 🌍 مرحبا"), null);
  assert.match(commentSafetyError("@alice @bob @cat @dan @eve @fox @gus @hal @ivy"), /mention fewer/);
  assert.equal(commentFingerprint("Café, useful!"), commentFingerprint("cafe useful"));
  assert.equal(commentFingerprint("Useful\u200b comment"), commentFingerprint("useful comment"));

  const author = await register("Safety viewer");
  const free = await createVideo(author, "Safety demo");
  const route = `/comment/${free._id}`;
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "Visit https://example.com" })).status, 400);
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "One useful comment" })).status, 201);
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "ONE-useful, comment!" })).status, 409);
  const challengeResponse = await request(route, author.cookie, "POST", { commentbody: "Another thought" });
  assert.equal(challengeResponse.status, 428);
  const [a, b] = (await challengeResponse.json()).challenge.question.match(/\d+/g).map(Number);
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "Another thought", captchaAnswer: 0 })).status, 428);
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "Another thought", captchaAnswer: a + b })).status, 201);
  for (let index = 0; index < 4; index += 1) {
    assert.equal((await request(route, author.cookie, "POST", { commentbody: `Additional note ${index}` })).status, 201);
  }
  assert.equal((await request(route, author.cookie, "POST", { commentbody: "One attempt too many" })).status, 429);
  assert.equal(await Comment.countDocuments({ videoid: free._id }), 6);
});

test("mentions and reactions use real accounts and video access, with four sort orders", async () => {
  const author = await register("Mention Author");
  const viewer = await register("Mention Viewer");
  const free = await createVideo(author, "Social conversation");
  const premium = await createVideo(author, "Locked conversation", "silver");
  const mentions = await request(`/comment/mentions?q=${viewer.user.username.slice(0, 4)}`, author.cookie);
  assert.equal(mentions.status, 200);
  assert.ok((await mentions.json()).users.some((item) => item.username === viewer.user.username));
  assert.equal((await request("/comment/mentions?q=bad.*", author.cookie)).status, 400);
  const posted = await request(`/comment/${free._id}`, author.cookie, "POST", { commentbody: `Hello @${viewer.user.username} 👋` });
  assert.equal(posted.status, 201);
  const first = (await posted.json()).comment;
  assert.equal(first.mentions[0].username, viewer.user.username);
  const second = (await (await request(`/comment/${free._id}`, viewer.cookie, "POST", { commentbody: "A second perspective" })).json()).comment;
  assert.equal((await request(`/comment/${free._id}?sort=oldest`, viewer.cookie)).status, 200);
  assert.equal((await request(`/comment/${free._id}?sort=liked`, viewer.cookie)).status, 200);
  assert.equal((await request(`/comment/${free._id}?sort=relevant`, viewer.cookie)).status, 200);
  assert.equal((await request(`/comment/${first._id}/reaction`, viewer.cookie, "PUT", { reaction: "like" })).status, 200);
  let listing = (await (await request(`/comment/${free._id}?sort=liked`, author.cookie)).json()).comments;
  assert.equal(listing[0]._id, first._id);
  assert.equal(listing[0].likes, 1);
  assert.equal((await request(`/comment/${first._id}/reaction`, viewer.cookie, "PUT", { reaction: "dislike" })).status, 200);
  listing = (await (await request(`/comment/${free._id}`, viewer.cookie)).json()).comments;
  assert.equal(listing.find((item) => item._id === first._id).viewerReaction, "dislike");
  assert.equal((await request(`/comment/${first._id}/reaction`, viewer.cookie, "PUT", { reaction: null })).status, 200);
  assert.equal((await request(`/comment/${first._id}/reaction`, viewer.cookie, "PUT", { reaction: "heart" })).status, 400);
  const locked = (await (await request(`/comment/${premium._id}`, author.cookie, "POST", { commentbody: "Members only" })).json()).comment;
  assert.equal((await request(`/comment/${locked._id}/reaction`, viewer.cookie, "PUT", { reaction: "like" })).status, 403);
  assert.equal((await request(`/comment/${locked._id}/translate`, viewer.cookie, "POST", {})).status, 403);
  assert.equal((await request(`/comment/${locked._id}/report`, viewer.cookie, "POST", { reason: "spam" })).status, 403);
  assert.equal((await request(`/comment/${second._id}`, viewer.cookie, "PATCH", { commentbody: `Updated @${author.user.username}`, expectedRevision: 1 })).status, 200);
  const updated = (await (await request(`/comment/${free._id}`, author.cookie)).json()).comments.find((item) => item._id === second._id);
  assert.equal(updated.mentions[0].username, author.user.username);
});

test("translation cache, one-report rule, admin review, and retained replies", async () => {
  const author = await register("Reported Author");
  const reporter = await register("Concerned Viewer");
  const admin = await register("Local Moderator");
  await User.updateOne({ _id: admin.user._id }, { $set: { role: "admin" } });
  const video = await createVideo(author, "Moderation video");
  const route = `/comment/${video._id}`;
  const first = (await (await request(route, author.cookie, "POST", { commentbody: "नमस्ते, यह उपयोगी टिप्पणी है।" })).json()).comment;
  const second = (await (await request(route, author.cookie, "POST", { commentbody: "Another note for review" })).json()).comment;
  const reply = (await (await request(route, reporter.cookie, "POST", { commentbody: "This reply remains", parentId: second._id })).json()).comment;

  const profile = await request("/user/comment-profile", reporter.cookie, "PATCH", { preferredLanguage: "hi" });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).user.preferredLanguage, "hi");
  let calls = 0;
  const translator = createServer(async (incoming, outgoing) => {
    let body = "";
    for await (const chunk of incoming) body += chunk;
    assert.equal(JSON.parse(body).target, "hi");
    calls += 1;
    outgoing.writeHead(200, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ translatedText: "Hello from this video" }));
  });
  await new Promise((resolve) => translator.listen(0, "127.0.0.1", resolve));
  const translatorPort = String(translator.address().port);
  const previousPort = process.env.COMMENT_TRANSLATE_PORT;
  let translatorClosed = false;
  try {
    process.env.COMMENT_TRANSLATE_PORT = translatorPort;
    const translated = await request(`/comment/${first._id}/translate`, reporter.cookie, "POST", {});
    assert.equal(translated.status, 200);
    assert.equal((await translated.json()).text, "Hello from this video");
    assert.equal((await request(`/comment/${first._id}/translate`, reporter.cookie, "POST", {})).status, 200);
    assert.equal(calls, 1);
    await new Promise((resolve) => translator.close(resolve));
    translatorClosed = true;
    assert.equal((await request(`/comment/${second._id}/translate`, reporter.cookie, "POST", {})).status, 503);
  } finally {
    if (!translatorClosed) await new Promise((resolve) => translator.close(resolve));
    if (previousPort === undefined) delete process.env.COMMENT_TRANSLATE_PORT;
    else process.env.COMMENT_TRANSLATE_PORT = previousPort;
  }
  assert.equal((await CommentTranslation.countDocuments({ commentId: first._id })), 1);

  assert.equal((await request(`/comment/${first._id}/report`, reporter.cookie, "POST", { reason: "offensive" })).status, 201);
  assert.equal((await request(`/comment/${first._id}/report`, reporter.cookie, "POST", { reason: "spam" })).status, 409);
  assert.equal((await request(`/comment/${first._id}/report`, author.cookie, "POST", { reason: "spam" })).status, 400);
  assert.equal((await (await request(route, reporter.cookie)).json()).comments.find((item) => item._id === first._id).viewerReported, true);
  assert.equal((await (await request(route, author.cookie)).json()).comments.find((item) => item._id === first._id).viewerReported, false);
  assert.equal((await request("/comment/moderation/queue", reporter.cookie)).status, 403);
  const queued = (await (await request("/comment/moderation/queue", admin.cookie)).json()).reports[0];
  assert.equal(queued.reportedText, first.commentbody);
  assert.equal((await request(`/comment/moderation/${queued._id}`, reporter.cookie, "POST", { decision: "remove" })).status, 403);
  assert.equal((await request(`/comment/moderation/${queued._id}`, admin.cookie, "POST", { decision: "dismiss" })).status, 200);
  assert.equal((await request(`/comment/moderation/${queued._id}`, admin.cookie, "POST", { decision: "remove" })).status, 409);

  const secondReport = (await (await request(`/comment/${second._id}/report`, reporter.cookie, "POST", { reason: "harassment" })).json()).report;
  assert.equal((await request(`/comment/moderation/${secondReport._id}`, admin.cookie, "POST", { decision: "remove" })).status, 200);
  const listing = (await (await request(route, reporter.cookie)).json()).comments;
  assert.equal(listing.find((item) => item._id === second._id).commentbody, null);
  assert.equal(listing.find((item) => item._id === reply._id).commentbody, "This reply remains");
  assert.equal((await request(`/comment/${second._id}/report`, reporter.cookie, "POST", { reason: "spam" })).status, 409);
  assert.equal((await CommentReport.findById(secondReport._id)).status, "removed");
  assert.equal(await CommentModerationEvent.countDocuments(), 2);
  assert.deepEqual((await (await request(`/comment/${second._id}/history`, author.cookie)).json()).history.map((entry) => entry.action), ["created", "moderated"]);
});
