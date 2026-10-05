import "dotenv/config";
import cors from "cors";
import express from "express";
import userRoutes from "./routes/auth.js";
import videoRoutes from "./routes/video.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import likeRoutes from "./routes/like.js";
import watchLaterRoutes from "./routes/watchlater.js";
import commentRoutes from "./routes/comment.js";
import roomRoutes from "./routes/rooms.js";
import channelRoutes from "./routes/channels.js";
import adRoutes from "./routes/ads.js";
import { razorpayWebhook } from "./subscriptions/razorpay.js";

const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGIN || process.env.RENDER_EXTERNAL_URL || "http://127.0.0.1:3000,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.post("/subscriptions/razorpay/webhook", express.raw({ type: "application/json", limit: "1mb" }), razorpayWebhook);
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

app.get("/health", (_request, response) => response.json({ status: "ok" }));
if (!process.env.RENDER_EXTERNAL_URL) app.get("/", (_request, response) => response.send("YourTube 2.0 local API is running"));
app.use("/user", userRoutes);
app.use("/video", videoRoutes);
app.use("/subscriptions", subscriptionRoutes);
app.use("/likes", likeRoutes);
app.use("/watch-later", watchLaterRoutes);
app.use("/comment", commentRoutes);
app.use("/rooms", roomRoutes);
app.use("/channels", channelRoutes);
app.use("/ads", adRoutes);

export { allowedOrigins };
export default app;
