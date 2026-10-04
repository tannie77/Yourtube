import express from "express";
import { channelSubscriptionStatus, myChannelSubscriptions, subscribeChannel, unsubscribeChannel } from "../controllers/channels.js";
import { requireAuth } from "../security/session.js";

const routes = express.Router();
routes.use(requireAuth);
routes.get("/subscriptions/me", myChannelSubscriptions);
routes.get("/:id/subscription", channelSubscriptionStatus);
routes.put("/:id/subscription", subscribeChannel);
routes.delete("/:id/subscription", unsubscribeChannel);
export default routes;
