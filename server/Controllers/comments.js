import { createHash, randomInt } from "node:crypto";
import Comment from "../Modals/comments.js";
import CommentReaction from "../Modals/CommentReaction.js";
import CommentAttempt from "../Modals/CommentAttempt.js";
import CommentFingerprint from "../Modals/CommentFingerprint.js";
import User from "../Modals/Auth.js";
import Video from "../Modals/video.js";
import { commentSafetyError } from "../security/comment-safety.js";

const MAX_COMMENT_LENGTH = 2000;
const SORT_MODES = ["newest", "oldest", "liked", "relevant"];
const configuredWindow = Number(process.env.COMMENT_EDIT_WINDOW_MINUTES);
export const editWindowMinutes = Number.isInteger(configuredWindow) && configuredWindow > 0 && configuredWindow <= 1440
  ? configuredWindow
  : 15;
const editWindowMs = editWindowMinutes * 60 * 1000;

function validId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

function cleanBody(value) {
  if (typeof value !== "string") return null;
  const body = value.normalize("NFC").trim();
  return body && Array.from(body).length <= MAX_COMMENT_LENGTH ? body : null;
}

function createdAt(comment) {
  return comment.createdAt || comment.commentedon;
}

function canChange(comment, userId, now = Date.now()) {
  const posted = createdAt(comment);
  return String(comment.userid?._id || comment.userid) === String(userId) &&
    !comment.deletedAt && posted instanceof Date &&
    posted.getTime() + editWindowMs > now;
}

function revisionOf(comment) {
  return comment.revision || 1;
}

function revisionFilter(expectedRevision) {
  return expectedRevision === 1
    ? { $or: [{ revision: 1 }, { revision: null }] }
    : { revision: expectedRevision };
}

function initialHistory(comment) {
  if (comment.revisionHistory?.length) return [];
  return [{ revision: revisionOf(comment), action: "snapshot", commentbody: comment.commentbody || "", changedAt: createdAt(comment) }];
}

function mentionsIn(body) {
  const handles = new Set();
  for (const match of body.matchAll(/(?<![a-z0-9_])@([a-z0-9][a-z0-9-]{2,49})/gi)) {
    handles.add(match[1].toLowerCase());
  }
  return [...handles];
}

async function resolveMentions(body) {
  const handles = mentionsIn(body);
  if (!handles.length) return [];
  return User.find({ username: { $in: handles } }).select("_id name username").lean();
}

function serialize(comment, userId, reaction = {}) {
  const author = comment.userid && typeof comment.userid === "object" && "name" in comment.userid
    ? comment.userid
    : null;
  const mentions = Array.isArray(comment.mentions) ? comment.mentions.filter((user) => user && typeof user === "object" && "username" in user) : [];
  return {
    _id: String(comment._id),
    videoid: String(comment.videoid),
    parentId: comment.parentId ? String(comment.parentId) : null,
    commentbody: comment.deletedAt ? null : comment.commentbody,
    author: {
      _id: author ? String(author._id) : null,
      name: author?.name || comment.usercommented || "Former member",
      username: author?.username || null,
      image: author?.image || null,
      location: author?.location || null,
    },
    mentions: comment.deletedAt ? [] : mentions.map((user) => ({ _id: String(user._id), name: user.name, username: user.username })),
    createdAt: createdAt(comment),
    editedAt: comment.editedAt || null,
    deletedAt: comment.deletedAt || null,
    revision: revisionOf(comment),
    canEdit: canChange(comment, userId),
    likes: comment.deletedAt ? 0 : reaction.likes || 0,
    dislikes: comment.deletedAt ? 0 : reaction.dislikes || 0,
    viewerReaction: comment.deletedAt ? null : reaction.viewerReaction || null,
  };
}

async function findVideo(videoId) {
  if (!validId(videoId)) return null;
  return Video.exists({ _id: videoId });
}

async function postingWindow(request, response) {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / 60000) * 60000);
  const key = { userId: request.user._id, windowStart };
  let attempt;
  try {
    attempt = await CommentAttempt.findOneAndUpdate(key, {
      $inc: { count: 1 },
      $setOnInsert: { challengeA: randomInt(2, 10), challengeB: randomInt(1, 10), expiresAt: new Date(now + 5 * 60000) },
    }, { upsert: true, returnDocument: "after" });
  } catch (error) {
    if (error.code !== 11000) throw error;
    attempt = await CommentAttempt.findOneAndUpdate(key, { $inc: { count: 1 } }, { returnDocument: "after" });
  }
  if (attempt.count > 10) {
    response.status(429).json({ message: "Too many comment attempts. Try again in a minute." });
    return false;
  }
  if (attempt.count > 3 && !attempt.challengeSolved) {
    const answer = request.body?.captchaAnswer;
    if (Number.isInteger(answer) && answer === attempt.challengeA + attempt.challengeB) {
      await CommentAttempt.updateOne({ _id: attempt._id }, { $set: { challengeSolved: true } });
    } else {
      response.status(428).json({ message: "Solve the local check to continue posting.", challenge: { question: `${attempt.challengeA} + ${attempt.challengeB} = ?` } });
      return false;
    }
  }
  return true;
}

async function reserveFingerprint(userId, videoId, body) {
  const digest = createHash("sha256").update(body.toLocaleLowerCase().replace(/\s+/gu, " ")).digest("hex");
  const key = { userId, videoId, digest };
  await CommentFingerprint.deleteOne({ ...key, expiresAt: { $lte: new Date() } });
  try {
    return await CommentFingerprint.create({ ...key, expiresAt: new Date(Date.now() + 10 * 60000) });
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
}

async function reactionStats(commentIds, userId) {
  const stats = new Map();
  if (!commentIds.length) return stats;
  const [totals, mine] = await Promise.all([
    CommentReaction.aggregate([
      { $match: { commentId: { $in: commentIds } } },
      { $group: { _id: { commentId: "$commentId", kind: "$kind" }, count: { $sum: 1 } } },
    ]),
    CommentReaction.find({ commentId: { $in: commentIds }, userId }).select("commentId kind").lean(),
  ]);
  for (const item of totals) {
    const id = String(item._id.commentId);
    stats.set(id, { ...(stats.get(id) || {}), [item._id.kind === "like" ? "likes" : "dislikes"]: item.count });
  }
  for (const item of mine) {
    const id = String(item.commentId);
    stats.set(id, { ...(stats.get(id) || {}), viewerReaction: item.kind });
  }
  return stats;
}

function sortComments(comments, mode) {
  const replyCounts = new Map();
  for (const comment of comments) {
    if (comment.parentId) replyCounts.set(comment.parentId, (replyCounts.get(comment.parentId) || 0) + 1);
  }
  const now = Date.now();
  function relevantScore(comment) {
    const ageDays = Math.max(0, (now - new Date(comment.createdAt).getTime()) / 86_400_000);
    return comment.likes * 2 - comment.dislikes + Math.min(replyCounts.get(comment._id) || 0, 5) + Math.max(0, 3 - ageDays / 7);
  }
  return comments.sort((left, right) => {
    const dateDifference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    if (mode === "oldest") return -dateDifference || left._id.localeCompare(right._id);
    if (mode === "liked") return right.likes - left.likes || dateDifference || right._id.localeCompare(left._id);
    if (mode === "relevant") return relevantScore(right) - relevantScore(left) || dateDifference || right._id.localeCompare(left._id);
    return dateDifference || right._id.localeCompare(left._id);
  });
}

export async function getallcomment(request, response) {
  const sort = request.query.sort || "newest";
  if (typeof sort !== "string" || !SORT_MODES.includes(sort)) {
    return response.status(400).json({ message: "Choose a valid comment sort order." });
  }
  try {
    if (!(await findVideo(request.params.videoid))) {
      return response.status(404).json({ message: "Video not found." });
    }
    const comments = await Comment.find({ videoid: request.params.videoid })
      .populate("userid", "name username image location")
      .populate("mentions", "name username")
      .lean();
    const reactions = await reactionStats(comments.map((comment) => comment._id), request.user._id);
    const items = comments.map((comment) => serialize(comment, request.user._id, reactions.get(String(comment._id))));
    return response.json({ comments: sortComments(items, sort), sort, editWindowMinutes });
  } catch (error) {
    console.error("Could not load comments:", error);
    return response.status(500).json({ message: "Could not load comments." });
  }
}

export async function searchMentions(request, response) {
  const query = request.query.q;
  if (typeof query !== "string" || query.length > 40 || !/^[a-z0-9-]*$/i.test(query)) {
    return response.status(400).json({ message: "Search usernames with letters, numbers or hyphens." });
  }
  try {
    const users = await User.find({ username: { $regex: `^${query.toLowerCase()}` } })
      .select("_id name username image")
      .sort({ username: 1 })
      .limit(8)
      .lean();
    return response.json({ users: users.map((user) => ({ _id: String(user._id), name: user.name, username: user.username, image: user.image || null })) });
  } catch (error) {
    console.error("Could not search mentions:", error);
    return response.status(500).json({ message: "Could not search usernames." });
  }
}

export async function postcomment(request, response) {
  const commentbody = cleanBody(request.body?.commentbody);
  const parentId = request.body?.parentId ?? null;
  if (!commentbody) {
    return response.status(400).json({ message: `Write a comment of up to ${MAX_COMMENT_LENGTH} characters.` });
  }
  if (parentId !== null && !validId(parentId)) {
    return response.status(400).json({ message: "Invalid reply target." });
  }

  let fingerprint;
  try {
    if (!(await findVideo(request.params.videoid))) {
      return response.status(404).json({ message: "Video not found." });
    }
    if (parentId) {
      const parent = await Comment.exists({ _id: parentId, videoid: request.params.videoid });
      if (!parent) return response.status(404).json({ message: "Reply target not found on this video." });
    }
    if (!(await postingWindow(request, response))) return;
    const safetyError = commentSafetyError(commentbody);
    if (safetyError) return response.status(400).json({ message: safetyError });
    fingerprint = await reserveFingerprint(request.user._id, request.params.videoid, commentbody);
    if (!fingerprint) return response.status(409).json({ message: "You already posted this comment recently." });
    const mentions = await resolveMentions(commentbody);
    const now = new Date();
    const created = await Comment.create({
      userid: request.user._id,
      videoid: request.params.videoid,
      parentId,
      commentbody,
      usercommented: request.user.name,
      mentions: mentions.map((user) => user._id),
      revisionHistory: [{ revision: 1, action: "created", commentbody, changedAt: now }],
    });
    return response.status(201).json({ comment: serialize({ ...created.toObject(), userid: request.user, mentions }, request.user._id) });
  } catch (error) {
    if (fingerprint) await CommentFingerprint.deleteOne({ _id: fingerprint._id }).catch(() => {});
    console.error("Could not post comment:", error);
    return response.status(500).json({ message: "Could not post comment." });
  }
}

async function changeableComment(request, response) {
  if (!validId(request.params.id)) {
    response.status(404).json({ message: "Comment not found." });
    return null;
  }
  const comment = await Comment.findById(request.params.id);
  if (!comment) {
    response.status(404).json({ message: "Comment not found." });
    return null;
  }
  if (String(comment.userid) !== request.user.id) {
    response.status(403).json({ message: "You can only change your own comments." });
    return null;
  }
  if (comment.deletedAt) {
    response.status(409).json({ message: "This comment has already been deleted." });
    return null;
  }
  if (!canChange(comment, request.user._id)) {
    response.status(403).json({ message: `The ${editWindowMinutes}-minute edit window has ended.` });
    return null;
  }
  return comment;
}

function expectedRevision(request, response) {
  const value = request.body?.expectedRevision;
  if (!Number.isSafeInteger(value) || value < 1) {
    response.status(400).json({ message: "Refresh the comment before changing it." });
    return null;
  }
  return value;
}

export async function editcomment(request, response) {
  const commentbody = cleanBody(request.body?.commentbody);
  if (!commentbody) {
    return response.status(400).json({ message: `Write a comment of up to ${MAX_COMMENT_LENGTH} characters.` });
  }
  const safetyError = commentSafetyError(commentbody);
  if (safetyError) return response.status(400).json({ message: safetyError });
  const expected = expectedRevision(request, response);
  if (!expected) return;
  try {
    const comment = await changeableComment(request, response);
    if (!comment) return;
    if (revisionOf(comment) !== expected) return response.status(409).json({ message: "This comment changed elsewhere. Refresh before editing." });
    const mentions = await resolveMentions(commentbody);
    const now = new Date();
    const updated = await Comment.findOneAndUpdate(
      { _id: comment._id, userid: request.user._id, deletedAt: null, createdAt: { $gt: new Date(Date.now() - editWindowMs) }, ...revisionFilter(expected) },
      {
        $set: { commentbody, mentions: mentions.map((user) => user._id), editedAt: now, revision: expected + 1 },
        $push: { revisionHistory: { $each: [...initialHistory(comment), { revision: expected + 1, action: "edited", commentbody, changedAt: now }] } },
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) return response.status(409).json({ message: "Comment changed or edit window ended. Refresh and try again." });
    const reactions = await reactionStats([updated._id], request.user._id);
    return response.json({ comment: serialize({ ...updated.toObject(), userid: request.user, mentions }, request.user._id, reactions.get(updated.id)) });
  } catch (error) {
    console.error("Could not edit comment:", error);
    return response.status(500).json({ message: "Could not edit comment." });
  }
}

export async function deletecomment(request, response) {
  const expected = expectedRevision(request, response);
  if (!expected) return;
  try {
    const comment = await changeableComment(request, response);
    if (!comment) return;
    if (revisionOf(comment) !== expected) return response.status(409).json({ message: "This comment changed elsewhere. Refresh before deleting." });
    const now = new Date();
    const updated = await Comment.findOneAndUpdate(
      { _id: comment._id, userid: request.user._id, deletedAt: null, createdAt: { $gt: new Date(Date.now() - editWindowMs) }, ...revisionFilter(expected) },
      {
        $set: { commentbody: "", mentions: [], deletedAt: now, revision: expected + 1 },
        $push: { revisionHistory: { $each: [...initialHistory(comment), { revision: expected + 1, action: "deleted", commentbody: "", changedAt: now }] } },
      },
      { returnDocument: "after" },
    );
    if (!updated) return response.status(409).json({ message: "Comment changed or edit window ended. Refresh and try again." });
    return response.json({ comment: serialize({ ...updated.toObject(), userid: request.user }, request.user._id) });
  } catch (error) {
    console.error("Could not delete comment:", error);
    return response.status(500).json({ message: "Could not delete comment." });
  }
}

export async function reactToComment(request, response) {
  const kind = request.body?.reaction;
  if (kind !== "like" && kind !== "dislike" && kind !== null) {
    return response.status(400).json({ message: "Choose like, dislike or clear your reaction." });
  }
  if (!validId(request.params.id)) return response.status(404).json({ message: "Comment not found." });
  try {
    const comment = await Comment.findById(request.params.id).select("_id deletedAt");
    if (!comment) return response.status(404).json({ message: "Comment not found." });
    if (comment.deletedAt) return response.status(409).json({ message: "Deleted comments cannot receive reactions." });
    const key = { commentId: comment._id, userId: request.user._id };
    if (kind === null) {
      await CommentReaction.deleteOne(key);
    } else {
      try {
        await CommentReaction.updateOne(key, { $set: { kind } }, { upsert: true, runValidators: true });
      } catch (error) {
        if (error.code !== 11000) throw error;
        await CommentReaction.updateOne(key, { $set: { kind } }, { runValidators: true });
      }
    }
    const stats = await reactionStats([comment._id], request.user._id);
    return response.json({ reaction: { likes: stats.get(comment.id)?.likes || 0, dislikes: stats.get(comment.id)?.dislikes || 0, viewerReaction: stats.get(comment.id)?.viewerReaction || null } });
  } catch (error) {
    console.error("Could not react to comment:", error);
    return response.status(500).json({ message: "Could not save reaction." });
  }
}

export async function getCommentHistory(request, response) {
  if (!validId(request.params.id)) return response.status(404).json({ message: "Comment not found." });
  try {
    const comment = await Comment.findById(request.params.id).select("userid commentbody createdAt commentedon revisionHistory");
    if (!comment) return response.status(404).json({ message: "Comment not found." });
    if (String(comment.userid) !== request.user.id) return response.status(403).json({ message: "Only the author can view this history." });
    const history = comment.revisionHistory?.length ? comment.revisionHistory : initialHistory(comment);
    return response.json({ history });
  } catch (error) {
    console.error("Could not load comment history:", error);
    return response.status(500).json({ message: "Could not load comment history." });
  }
}
