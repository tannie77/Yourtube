import mongoose from "mongoose";
import app from "./app.js";
import { backfillUsernames } from "./security/username.js";
import CommentAttempt from "./Modals/CommentAttempt.js";
import CommentFingerprint from "./Modals/CommentFingerprint.js";
import CommentReport from "./Modals/CommentReport.js";
import CommentTranslation from "./Modals/CommentTranslation.js";

const port = Number(process.env.PORT) || 5000;
const databaseUrl = process.env.LOCAL_DB_URL || "mongodb://127.0.0.1:27017/vidcircle";

try {
  await mongoose.connect(databaseUrl, { serverSelectionTimeoutMS: 5000 });
  await backfillUsernames();
  await Promise.all([CommentAttempt.init(), CommentFingerprint.init(), CommentReport.init(), CommentTranslation.init()]);
  app.listen(port, () => console.log(`VidCircle local API: http://127.0.0.1:${port}`));
} catch (error) {
  console.error("Local MongoDB is unavailable. Start it with `npm run db` in the server folder.", error);
  process.exitCode = 1;
}
