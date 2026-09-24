import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import userRoutes from "./routes/auth.js";
import videoRoutes from "./routes/video.js";
import likeRoutes from "./routes/like.js";
import watchLaterRoutes from "./routes/watchlater.js";
import historyRoutes from "./routes/history.js";
import commentRoutes from "./routes/comments.js";

const app = express();
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://127.0.0.1:3000,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

// Public videos are retained until the subscription and protected-media milestone.
app.use("/uploads", express.static(path.join(serverDirectory, "uploads")));

app.get("/", (_request, response) => response.send("VidCircle local API is running"));
app.use("/user", userRoutes);
app.use("/video", videoRoutes);
app.use("/like", likeRoutes);
app.use("/watchlater", watchLaterRoutes);
app.use("/history", historyRoutes);
app.use("/comment", commentRoutes);

export default app;
