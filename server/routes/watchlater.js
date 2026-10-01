import express from "express";
import { addWatchLater, getallwatchlater, removeWatchLater } from "../controllers/watchlater.js";
import { requireAuth } from "../security/session.js";

const routes = express.Router();
routes.use(requireAuth);
routes.get("/me", getallwatchlater);
routes.put("/:videoId", addWatchLater);
routes.delete("/:videoId", removeWatchLater);
export default routes;
