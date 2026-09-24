import express from "express";
import {
  getallhistoryVideo,
  handlehistory,
  handleview,
} from "../Controllers/history.js";
import { requireAuth } from "../security/session.js";

const routes = express.Router();
routes.use(requireAuth);
routes.get("/:userId", getallhistoryVideo);
routes.post("/views/:userId", handleview);
routes.post("/:videoId", handlehistory);
export default routes;
