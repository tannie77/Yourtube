import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import Comment from "../Modals/comments.js";
import CommentReaction from "../Modals/CommentReaction.js";
import Video from "../Modals/video.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let httpServer;
let baseUrl;

before(async () => {
  database = await MongoMemoryServer.create({
    instance: { ip: "127.0.0.1" },
    binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") },
  });
  await mongoose.connect(database.getUri("vidcircle_comments_test"));
  await CommentReaction.init();
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

function request(route, options = {}) {
  return fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
}

async function register(name) {
  const response = await request("/user/register", {
    method: "POST",
    body: JSON.stringify({ name, email: `${name.toLowerCase().replaceAll(" ", "-")}-${Date.now()}@example.test`, password: "local-password-123" }),
  });
  assert.equal(response.status, 201);
  return {
    user: (await response.json()).user,
    cookie: response.headers.get("set-cookie").split(";")[0],
  };
}

test("comments and replies use session ownership, an edit window, and soft deletion", async () => {
  const owner = await register("First Viewer");
  const other = await register("Second Viewer");
  const video = await Video.create({
    videotitle: "Local comments demo", filename: "demo.mp4", filetype: "video/mp4",
    filepath: "demo.mp4", filesize: 1024, videochanel: "Demo channel", uploader: owner.user._id,
  });
  const secondVideo = await Video.create({
    videotitle: "Another video", filename: "other.mp4", filetype: "video/mp4",
    filepath: "other.mp4", filesize: 1024, videochanel: "Demo channel", uploader: owner.user._id,
  });
  const route = `/comment/${video.id}`;

  assert.equal((await request(route)).status, 401);
  assert.equal((await request(route, { method: "POST", body: JSON.stringify({ commentbody: "Hello" }) })).status, 401);
  assert.equal((await request("/comment/not-an-id", { headers: { cookie: owner.cookie } })).status, 404);
  assert.equal((await request("/comment/507f1f77bcf86cd799439011", { headers: { cookie: owner.cookie } })).status, 404);

  const posted = await request(route, {
    method: "POST", headers: { cookie: owner.cookie },
    body: JSON.stringify({ commentbody: "  नमस्ते 🌍 مرحبا  ", userid: other.user._id, usercommented: "Impersonator" }),
  });
  assert.equal(posted.status, 201);
  const first = (await posted.json()).comment;
  assert.equal(first.commentbody, "नमस्ते 🌍 مرحبا");
  assert.equal(first.author._id, owner.user._id);
  assert.equal(first.author.name, "First Viewer");
  assert.equal(first.canEdit, true);
  assert.equal((await Comment.findById(first._id)).userid.toString(), owner.user._id);

  const empty = await request(route, { method: "POST", headers: { cookie: owner.cookie }, body: JSON.stringify({ commentbody: "  " }) });
  assert.equal(empty.status, 400);
  const tooLong = await request(route, { method: "POST", headers: { cookie: owner.cookie }, body: JSON.stringify({ commentbody: "🙂".repeat(2001) }) });
  assert.equal(tooLong.status, 400);
  const foreignParent = await request(`/comment/${secondVideo.id}`, {
    method: "POST", headers: { cookie: other.cookie },
    body: JSON.stringify({ commentbody: "Wrong video", parentId: first._id }),
  });
  assert.equal(foreignParent.status, 404);

  const replyResponse = await request(route, {
    method: "POST", headers: { cookie: other.cookie },
    body: JSON.stringify({ commentbody: "A reply", parentId: first._id }),
  });
  assert.equal(replyResponse.status, 201);
  const reply = (await replyResponse.json()).comment;
  assert.equal(reply.parentId, first._id);
  assert.equal(reply.author._id, other.user._id);

  const visibleToOther = await request(route, { headers: { cookie: other.cookie } });
  assert.equal(visibleToOther.status, 200);
  const listing = await visibleToOther.json();
  assert.equal(listing.editWindowMinutes, 15);
  assert.equal(listing.comments.length, 2);
  assert.equal(listing.comments.find((item) => item._id === first._id).canEdit, false);
  assert.equal(listing.comments.find((item) => item._id === reply._id).canEdit, true);

  const unauthorizedEdit = await request(`/comment/${first._id}`, {
    method: "PATCH", headers: { cookie: other.cookie }, body: JSON.stringify({ commentbody: "Hijacked", expectedRevision: 1 }),
  });
  assert.equal(unauthorizedEdit.status, 403);
  const unauthorizedDelete = await request(`/comment/${first._id}`, { method: "DELETE", headers: { cookie: other.cookie }, body: JSON.stringify({ expectedRevision: 1 }) });
  assert.equal(unauthorizedDelete.status, 403);
  assert.equal((await request(`/comment/${first._id}`, { method: "DELETE" })).status, 401);

  const edited = await request(`/comment/${first._id}`, {
    method: "PATCH", headers: { cookie: owner.cookie }, body: JSON.stringify({ commentbody: "Updated multilingual text हिन्दी", expectedRevision: 1 }),
  });
  assert.equal(edited.status, 200);
  const changed = (await edited.json()).comment;
  assert.equal(changed.commentbody, "Updated multilingual text हिन्दी");
  assert.equal(changed.revision, 2);

  const removed = await request(`/comment/${first._id}`, { method: "DELETE", headers: { cookie: owner.cookie }, body: JSON.stringify({ expectedRevision: 2 }) });
  assert.equal(removed.status, 200);
  const afterDelete = (await (await request(route, { headers: { cookie: owner.cookie } })).json()).comments;
  assert.equal(afterDelete.find((item) => item._id === first._id).commentbody, null);
  assert.ok(afterDelete.find((item) => item._id === first._id).deletedAt);
  assert.equal(afterDelete.find((item) => item._id === reply._id).parentId, first._id);
  assert.equal(afterDelete.find((item) => item._id === reply._id).commentbody, "A reply");
  assert.equal((await Comment.findById(first._id)).commentbody, "");
  assert.equal((await request(`/comment/${first._id}`, { method: "DELETE", headers: { cookie: owner.cookie }, body: JSON.stringify({ expectedRevision: 2 }) })).status, 409);

  await Comment.collection.updateOne({ _id: new mongoose.Types.ObjectId(reply._id) }, {
    $set: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
  });
  assert.equal((await request(`/comment/${reply._id}`, {
    method: "PATCH", headers: { cookie: other.cookie }, body: JSON.stringify({ commentbody: "Too late", expectedRevision: 1 }),
  })).status, 403);
  assert.equal((await request(`/comment/${reply._id}`, { method: "DELETE", headers: { cookie: other.cookie }, body: JSON.stringify({ expectedRevision: 1 }) })).status, 403);
  const expiredListing = (await (await request(route, { headers: { cookie: other.cookie } })).json()).comments;
  assert.equal(expiredListing.find((item) => item._id === reply._id).canEdit, false);

  assert.equal((await request("/comment/postcomment", {
    method: "POST", headers: { cookie: owner.cookie }, body: JSON.stringify({ commentbody: "Legacy route" }),
  })).status, 404);
  assert.equal((await request(`/comment/editcomment/${reply._id}`, {
    method: "POST", headers: { cookie: owner.cookie }, body: JSON.stringify({ commentbody: "Legacy edit" }),
  })).status, 404);
});

test("handles, profile details, mentions, reactions, sorting and revision history work locally", async () => {
  const author = await register("Conversation Author");
  const friend = await register("Conversation Friend");
  assert.match(author.user.username, /^conversation-author-[a-f\d]{8}$/);
  assert.notEqual(author.user.username, friend.user.username);
  const me = await request("/user/me", { headers: { cookie: author.cookie } });
  assert.equal((await me.json()).user.username, author.user.username);

  const invalidProfile = await request("/user/comment-profile", {
    method: "PATCH", headers: { cookie: author.cookie },
    body: JSON.stringify({ location: "X".repeat(81), image: "https://example.test/picture.png" }),
  });
  assert.equal(invalidProfile.status, 400);
  assert.equal((await request("/user/comment-profile", { method: "PATCH", body: JSON.stringify({ location: "Pune, India" }) })).status, 401);
  const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8BbrcAAAAASUVORK5CYII=";
  const profile = await request("/user/comment-profile", {
    method: "PATCH", headers: { cookie: author.cookie },
    body: JSON.stringify({ location: "Pune, India", image: tinyPng }),
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).user.location, "Pune, India");

  const search = await request(`/comment/mentions?q=${friend.user.username.slice(0, 15)}`, { headers: { cookie: author.cookie } });
  assert.equal(search.status, 200);
  const matches = (await search.json()).users;
  assert.ok(matches.some((user) => user.username === friend.user.username));
  assert.equal(matches[0].email, undefined);
  assert.equal((await request("/comment/mentions?q=.*", { headers: { cookie: author.cookie } })).status, 400);

  const video = await Video.create({
    videotitle: "Conversation features", filename: "conversation.mp4", filetype: "video/mp4",
    filepath: "conversation.mp4", filesize: 1024, videochanel: "Demo channel", uploader: author.user._id,
  });
  const route = `/comment/${video.id}`;
  const firstResponse = await request(route, {
    method: "POST", headers: { cookie: author.cookie },
    body: JSON.stringify({ commentbody: `Hello @${friend.user.username} 👋` }),
  });
  assert.equal(firstResponse.status, 201);
  const first = (await firstResponse.json()).comment;
  assert.equal(first.revision, 1);
  assert.deepEqual(first.mentions.map((user) => user.username), [friend.user.username]);
  const secondResponse = await request(route, {
    method: "POST", headers: { cookie: friend.cookie },
    body: JSON.stringify({ commentbody: "Another viewpoint" }),
  });
  assert.equal(secondResponse.status, 201);
  const second = (await secondResponse.json()).comment;

  const reactionRoute = `/comment/${first._id}/reaction`;
  assert.equal((await request(reactionRoute, { method: "PUT", headers: { cookie: author.cookie }, body: JSON.stringify({ reaction: "boost" }) })).status, 400);
  const like = await request(reactionRoute, { method: "PUT", headers: { cookie: author.cookie }, body: JSON.stringify({ reaction: "like" }) });
  assert.equal(like.status, 200);
  assert.deepEqual((await like.json()).reaction, { likes: 1, dislikes: 0, viewerReaction: "like" });
  const duplicateLike = await request(reactionRoute, { method: "PUT", headers: { cookie: author.cookie }, body: JSON.stringify({ reaction: "like" }) });
  assert.equal((await duplicateLike.json()).reaction.likes, 1);
  const otherLike = await request(reactionRoute, { method: "PUT", headers: { cookie: friend.cookie }, body: JSON.stringify({ reaction: "like" }) });
  assert.equal((await otherLike.json()).reaction.likes, 2);
  const switchReaction = await request(reactionRoute, { method: "PUT", headers: { cookie: friend.cookie }, body: JSON.stringify({ reaction: "dislike" }) });
  assert.deepEqual((await switchReaction.json()).reaction, { likes: 1, dislikes: 1, viewerReaction: "dislike" });
  assert.equal(await CommentReaction.countDocuments({ commentId: first._id }), 2);
  const clearReaction = await request(reactionRoute, { method: "PUT", headers: { cookie: friend.cookie }, body: JSON.stringify({ reaction: null }) });
  assert.deepEqual((await clearReaction.json()).reaction, { likes: 1, dislikes: 0, viewerReaction: null });

  const listed = await request(`${route}?sort=liked`, { headers: { cookie: friend.cookie } });
  assert.equal(listed.status, 200);
  const liked = (await listed.json()).comments;
  assert.equal(liked[0]._id, first._id);
  assert.equal(liked[0].author.username, author.user.username);
  assert.equal(liked[0].author.location, "Pune, India");
  assert.equal(liked[0].author.image, tinyPng);
  assert.equal(liked[0].likes, 1);
  assert.equal(liked[0].viewerReaction, null);
  const newest = (await (await request(`${route}?sort=newest`, { headers: { cookie: author.cookie } })).json()).comments;
  const oldest = (await (await request(`${route}?sort=oldest`, { headers: { cookie: author.cookie } })).json()).comments;
  assert.equal(newest[0]._id, second._id);
  assert.equal(oldest[0]._id, first._id);
  const relevant = (await (await request(`${route}?sort=relevant`, { headers: { cookie: author.cookie } })).json()).comments;
  assert.equal(relevant[0]._id, first._id);
  assert.equal((await request(`${route}?sort=unknown`, { headers: { cookie: author.cookie } })).status, 400);

  assert.equal((await request(`/comment/${first._id}`, {
    method: "PATCH", headers: { cookie: author.cookie }, body: JSON.stringify({ commentbody: "Missing revision" }),
  })).status, 400);
  const edited = await request(`/comment/${first._id}`, {
    method: "PATCH", headers: { cookie: author.cookie },
    body: JSON.stringify({ commentbody: `Updated @${friend.user.username}`, expectedRevision: 1 }),
  });
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).comment.revision, 2);
  const stale = await request(`/comment/${first._id}`, {
    method: "PATCH", headers: { cookie: author.cookie },
    body: JSON.stringify({ commentbody: "Stale text", expectedRevision: 1 }),
  });
  assert.equal(stale.status, 409);
  assert.equal((await Comment.findById(first._id)).commentbody, `Updated @${friend.user.username}`);
  assert.equal((await request(`/comment/${first._id}/history`, { headers: { cookie: friend.cookie } })).status, 403);
  const history = await request(`/comment/${first._id}/history`, { headers: { cookie: author.cookie } });
  assert.equal(history.status, 200);
  assert.deepEqual((await history.json()).history.map((event) => event.action), ["created", "edited"]);

  const deleted = await request(`/comment/${first._id}`, {
    method: "DELETE", headers: { cookie: author.cookie }, body: JSON.stringify({ expectedRevision: 2 }),
  });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).comment.revision, 3);
  assert.equal((await request(reactionRoute, { method: "PUT", headers: { cookie: friend.cookie }, body: JSON.stringify({ reaction: "like" }) })).status, 409);
  const fullHistory = (await (await request(`/comment/${first._id}/history`, { headers: { cookie: author.cookie } })).json()).history;
  assert.deepEqual(fullHistory.map((event) => event.action), ["created", "edited", "deleted"]);
  const publicDeleted = (await (await request(route, { headers: { cookie: friend.cookie } })).json()).comments.find((item) => item._id === first._id);
  assert.equal(publicDeleted.commentbody, null);
  assert.deepEqual(publicDeleted.mentions, []);

  const racing = (await (await request(route, {
    method: "POST", headers: { cookie: author.cookie }, body: JSON.stringify({ commentbody: "Edit race" }),
  })).json()).comment;
  const racingResults = await Promise.all(["First edit", "Second edit"].map((commentbody) => request(`/comment/${racing._id}`, {
    method: "PATCH", headers: { cookie: author.cookie }, body: JSON.stringify({ commentbody, expectedRevision: 1 }),
  })));
  assert.deepEqual(racingResults.map((result) => result.status).sort(), [200, 409]);
  const raceHistory = (await (await request(`/comment/${racing._id}/history`, { headers: { cookie: author.cookie } })).json()).history;
  assert.deepEqual(raceHistory.map((event) => event.revision), [1, 2]);

  const reactionRace = await Promise.all([0, 1].map(() => request(`/comment/${second._id}/reaction`, {
    method: "PUT", headers: { cookie: author.cookie }, body: JSON.stringify({ reaction: "like" }),
  })));
  assert.deepEqual(reactionRace.map((result) => result.status), [200, 200]);
  assert.equal(await CommentReaction.countDocuments({ commentId: second._id, userId: author.user._id }), 1);
});
