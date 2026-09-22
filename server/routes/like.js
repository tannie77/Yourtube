import express from "express";
import { getallLikedVideo, handlelike } from "../Controllers/like.js";

const routes = express.Router();
routes.get("/:userId", getallLikedVideo);
routes.post("/:videoId", handlelike);
export default routes;
