import express from "express";
import { deletecomment, getallcomment, postcomment, editcomment, searchMentions, reactToComment, getCommentHistory } from "../Controllers/comments.js";
import { requireAuth } from "../security/session.js";
import { requireAdmin } from "../security/session.js";
import { getTranslationLanguages, translateComment } from "../Controllers/comment-translation.js";
import { moderationQueue, reportComment, reviewReport } from "../Controllers/comment-moderation.js";

const routes = express.Router();

routes.use(requireAuth);
routes.get("/mentions", searchMentions);
routes.get("/languages", getTranslationLanguages);
routes.get("/moderation/queue", requireAdmin, moderationQueue);
routes.post("/moderation/:id", requireAdmin, reviewReport);
routes.get("/:id/history", getCommentHistory);
routes.put("/:id/reaction", reactToComment);
routes.post("/:id/translate", translateComment);
routes.post("/:id/report", reportComment);
routes.get("/:videoid", getallcomment);
routes.post("/:videoid", postcomment);
routes.patch("/:id", editcomment);
routes.delete("/:id", deletecomment);

export default routes;
