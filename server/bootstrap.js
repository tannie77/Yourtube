import "dotenv/config";
import mongoose from "mongoose";
import User from "./Modals/Auth.js";
import LoginAttempt from "./Modals/LoginAttempt.js";
import OtpChallenge from "./Modals/OtpChallenge.js";
import Session from "./Modals/Session.js";
import TrustedDevice from "./Modals/TrustedDevice.js";
import CheckoutOrder from "./Modals/CheckoutOrder.js";
import Subscription from "./Modals/Subscription.js";
import DailyDownloadUsage from "./Modals/DailyDownloadUsage.js";
import MonthlyDownloadUsage from "./Modals/MonthlyDownloadUsage.js";
import DownloadWindow from "./Modals/DownloadWindow.js";
import CallRoom from "./Modals/CallRoom.js";
import RazorpayWebhookEvent from "./Modals/RazorpayWebhookEvent.js";
import ChannelSubscription from "./Modals/ChannelSubscription.js";
import { recoverDownloads } from "./video/download-usage.js";
import { backfillUsernames } from "./security/username.js";
import { atlasConfiguration } from "./database/atlas.js";

export async function prepareDatabase() {
  const { uri, dbName } = atlasConfiguration();
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  await Promise.all([
    User.init(), LoginAttempt.init(), OtpChallenge.init(), Session.init(), TrustedDevice.init(),
    CheckoutOrder.init(), Subscription.init(), DailyDownloadUsage.init(), MonthlyDownloadUsage.init(),
    DownloadWindow.init(), CallRoom.init(), RazorpayWebhookEvent.init(), ChannelSubscription.init(),
  ]);
  await backfillUsernames();
  await recoverDownloads();
  return dbName;
}
