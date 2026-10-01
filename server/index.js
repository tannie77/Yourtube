import mongoose from "mongoose";
import { createServer } from "node:http";
import app, { allowedOrigins } from "./app.js";
import { attachRoomSignaling } from "./rooms/signaling.js";
import User from "./Modals/Auth.js";
import LoginAttempt from "./Modals/LoginAttempt.js";
import OtpChallenge from "./Modals/OtpChallenge.js";
import Session from "./Modals/Session.js";
import TrustedDevice from "./Modals/TrustedDevice.js";
import CheckoutOrder from "./Modals/CheckoutOrder.js";
import Subscription from "./Modals/Subscription.js";
import DailyDownloadUsage from "./Modals/DailyDownloadUsage.js";
import DownloadWindow from "./Modals/DownloadWindow.js";
import CallRoom from "./Modals/CallRoom.js";
import { recoverDownloads } from "./video/download-usage.js";
import { backfillUsernames } from "./security/username.js";

const port = Number(process.env.PORT) || 5000;
const databaseUrl = process.env.LOCAL_DB_URL || process.env.DB_URL || "mongodb://127.0.0.1:27017/yourtube2";

try {
  await mongoose.connect(databaseUrl, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), LoginAttempt.init(), OtpChallenge.init(), Session.init(), TrustedDevice.init(), CheckoutOrder.init(), Subscription.init(), DailyDownloadUsage.init(), DownloadWindow.init(), CallRoom.init()]);
  await backfillUsernames();
  await recoverDownloads();
  const httpServer = createServer(app);
  attachRoomSignaling(httpServer, allowedOrigins);
  httpServer.listen(port, () => console.log(`YourTube 2.0 local API: http://127.0.0.1:${port}`));
} catch (error) {
  console.error("Local MongoDB is unavailable. Start it with `npm run db` in the server folder.", error);
  process.exitCode = 1;
}
