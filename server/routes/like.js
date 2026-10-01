import express from "express";
import { addLike, getallLikedVideo, removeLike } from "../controllers/like.js";
import { requireAuth } from "../security/session.js";

const routes = express.Router();
routes.use(requireAuth);
routes.get("/me", getallLikedVideo);
routes.put("/:videoId", addLike);
routes.delete("/:videoId", removeLike);
export default routes;
