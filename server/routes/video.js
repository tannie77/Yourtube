import express from "express";
import multer from "multer";
import { getallvideo, getCaption, getPreview, getWatchHistory, getWatchProgress, getWatchUsage, saveWatchProgress, streamvideo, uploadvideo } from "../Controllers/video.js";
import upload from "../filehelp/filehelp.js";
import { requireAuth } from "../security/session.js";

const routes = express.Router();

function requireChannel(request, response, next) {
  if (!request.user.channelname?.trim()) {
    return response.status(403).json({ message: "Create your channel before uploading a video." });
  }
  next();
}

function receiveVideo(request, response, next) {
  upload.fields([{ name: "file", maxCount: 1 }, { name: "captions", maxCount: 1 }])(request, response, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return response.status(413).json({ message: "MP4 videos must be 100 MB or smaller." });
    }
    return response.status(400).json({ message: error.message || "Could not read the video file." });
  });
}

routes.post("/upload", requireAuth, requireChannel, receiveVideo, uploadvideo);
routes.get("/getall", requireAuth, getallvideo);
routes.get("/usage/me", requireAuth, getWatchUsage);
routes.get("/history/me", requireAuth, getWatchHistory);
routes.get("/:id/progress", requireAuth, getWatchProgress);
routes.put("/:id/progress", requireAuth, saveWatchProgress);
routes.get("/:id/media", requireAuth, streamvideo);
routes.get("/:id/captions", requireAuth, getCaption);
routes.get("/:id/preview/:index", requireAuth, getPreview);

export default routes;
