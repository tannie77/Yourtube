import Comment from "../Modals/comments.js";
import CommentReport from "../Modals/CommentReport.js";
import CommentModerationEvent from "../Modals/CommentModerationEvent.js";

function validId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

export async function reportComment(request, response) {
  if (!validId(request.params.id)) return response.status(404).json({ message: "Comment not found." });
  const reason = request.body?.reason;
  if (!["spam", "harassment", "offensive"].includes(reason)) {
    return response.status(400).json({ message: "Choose spam, harassment or offensive content." });
  }
  try {
    const comment = await Comment.findById(request.params.id).select("userid deletedAt commentbody revision");
    if (!comment) return response.status(404).json({ message: "Comment not found." });
    if (comment.deletedAt) return response.status(409).json({ message: "Deleted comments cannot be reported." });
    if (String(comment.userid) === request.user.id) return response.status(400).json({ message: "You cannot report your own comment." });
    const report = await CommentReport.create({ commentId: comment._id, reporterId: request.user._id, reason, reportedText: comment.commentbody, reportedRevision: comment.revision || 1 });
    return response.status(201).json({ report: { _id: report.id, reason, status: report.status } });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ message: "You already reported this comment." });
    console.error("Could not report comment:", error);
    return response.status(500).json({ message: "Could not send report." });
  }
}

export async function moderationQueue(_request, response) {
  try {
    const [pending, logs] = await Promise.all([
      CommentReport.find({ status: "pending" }).sort({ createdAt: 1 })
        .populate({ path: "commentId", select: "commentbody usercommented userid videoid deletedAt revision createdAt", populate: { path: "userid", select: "name username" } })
        .populate("reporterId", "name username").lean(),
      CommentModerationEvent.find().sort({ createdAt: -1 })
        .populate("adminId", "name username").lean(),
    ]);
    return response.json({ reports: pending.map((item) => ({
      _id: String(item._id), reason: item.reason, createdAt: item.createdAt,
      reportedText: item.reportedText, reportedRevision: item.reportedRevision,
      reporter: { name: item.reporterId?.name || "Former member", username: item.reporterId?.username || null },
      comment: item.commentId ? {
        _id: String(item.commentId._id), text: item.commentId.deletedAt ? null : item.commentId.commentbody,
        deletedAt: item.commentId.deletedAt, videoId: String(item.commentId.videoid),
        author: item.commentId.userid?.name || item.commentId.usercommented || "Former member",
        revision: item.commentId.revision || 1,
      } : null,
    })), logs: logs.map((item) => ({
      _id: String(item._id), commentId: String(item.commentId), decision: item.decision, reason: item.reason,
      admin: item.adminId?.name || "Former admin", createdAt: item.createdAt,
    })) });
  } catch (error) {
    console.error("Could not load moderation queue:", error);
    return response.status(500).json({ message: "Could not load moderation queue." });
  }
}

export async function reviewReport(request, response) {
  if (!validId(request.params.id)) return response.status(404).json({ message: "Report not found." });
  const decision = request.body?.decision;
  if (decision !== "dismiss" && decision !== "remove") return response.status(400).json({ message: "Choose dismiss or remove." });
  try {
    const report = await CommentReport.findById(request.params.id);
    if (!report) return response.status(404).json({ message: "Report not found." });
    if (report.status !== "pending") return response.status(409).json({ message: "This report has already been reviewed." });
    const comment = await Comment.findById(report.commentId);
    if (!comment) return response.status(404).json({ message: "The reported comment no longer exists." });

    const now = new Date();
    const claimed = await CommentReport.findOneAndUpdate(
      { _id: report._id, status: "pending" },
      { $set: { status: decision === "remove" ? "removed" : "dismissed", reviewedBy: request.user._id, reviewedAt: now } },
      { returnDocument: "after" },
    );
    if (!claimed) return response.status(409).json({ message: "This report was reviewed elsewhere. Refresh the queue." });

    let revision = comment.revision || 1;
    if (decision === "remove" && !comment.deletedAt) {
      const prior = comment.revisionHistory?.length ? [] : [{
        revision, action: "snapshot", commentbody: comment.commentbody || "", changedAt: comment.createdAt || comment.commentedon,
      }];
      const changed = await Comment.findOneAndUpdate(
        { _id: comment._id, deletedAt: null, ...(revision === 1 ? { $or: [{ revision: 1 }, { revision: null }] } : { revision }) },
        {
          $set: { commentbody: "", mentions: [], deletedAt: now, revision: revision + 1 },
          $push: { revisionHistory: { $each: [...prior, { revision: revision + 1, action: "moderated", commentbody: "", changedAt: now }] } },
        },
        { returnDocument: "after" },
      );
      if (!changed) {
        await CommentReport.updateOne({ _id: report._id, reviewedBy: request.user._id }, { $set: { status: "pending", reviewedBy: null, reviewedAt: null } });
        return response.status(409).json({ message: "The comment changed while reviewing. Refresh the queue." });
      }
      revision = changed.revision;
      await CommentReport.updateMany({ commentId: comment._id, status: "pending" }, { $set: { status: "removed", reviewedBy: request.user._id, reviewedAt: now } });
    }
    await CommentModerationEvent.create({ commentId: comment._id, reportId: report._id, adminId: request.user._id, decision, reason: report.reason, reportedText: report.reportedText, commentRevision: revision });
    return response.json({ decision, commentId: String(comment._id) });
  } catch (error) {
    console.error("Could not review report:", error);
    return response.status(500).json({ message: "Could not review report." });
  }
}
