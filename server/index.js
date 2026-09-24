import mongoose from "mongoose";
import app from "./app.js";
import { backfillUsernames } from "./security/username.js";
import CommentAttempt from "./Modals/CommentAttempt.js";
import CommentFingerprint from "./Modals/CommentFingerprint.js";
import CommentReport from "./Modals/CommentReport.js";
import CommentTranslation from "./Modals/CommentTranslation.js";
import DailyDownloadUsage from "./Modals/DailyDownloadUsage.js";
import DownloadRecord from "./Modals/DownloadRecord.js";
import DownloadWindow from "./Modals/DownloadWindow.js";
import LoginAttempt from "./Modals/LoginAttempt.js";
import OtpChallenge from "./Modals/OtpChallenge.js";
import Session from "./Modals/Session.js";
import TrustedDevice from "./Modals/TrustedDevice.js";
import { recoverDownloads } from "./video/download-usage.js";

const port = Number(process.env.PORT) || 5000;
const databaseUrl = process.env.LOCAL_DB_URL || "mongodb://127.0.0.1:27017/vidcircle";

try {
  await mongoose.connect(databaseUrl, { serverSelectionTimeoutMS: 5000 });
  await backfillUsernames();
  await Promise.all([CommentAttempt.init(), CommentFingerprint.init(), CommentReport.init(), CommentTranslation.init(), DailyDownloadUsage.init(), DownloadRecord.init(), DownloadWindow.init(), LoginAttempt.init(), OtpChallenge.init(), Session.init(), TrustedDevice.init()]);
  const recovery = await recoverDownloads();
  if (recovery.failedRecords) console.log(`Recovered ${recovery.failedRecords} unfinished local downloads.`);
  app.listen(port, () => console.log(`VidCircle local API: http://127.0.0.1:${port}`));
} catch (error) {
  console.error("Local MongoDB is unavailable. Start it with `npm run db` in the server folder.", error);
  process.exitCode = 1;
}
