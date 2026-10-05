import express from "express";
import mongoose from "mongoose";
import AdCampaign from "../Modals/AdCampaign.js";
import AdEvent from "../Modals/AdEvent.js";
import { requireAdmin, requireAuth } from "../security/session.js";
import { readSubscription } from "../subscriptions/state.js";
import { showLocalAd } from "../subscriptions/video-access.js";
import { validAdDestination } from "../ads/campaigns.js";

const routes = express.Router();
routes.use(requireAuth);

routes.get("/placement", async (request, response, next) => {
  try {
    if (!showLocalAd(await readSubscription(request.user._id))) return response.json({ campaign: null });
    const now = new Date();
    const campaign = await AdCampaign.findOne({ active: true, startsAt: { $lte: now }, $or: [{ endsAt: null }, { endsAt: { $gt: now } }] }).sort({ updatedAt: -1 }).lean();
    response.set("Cache-Control", "private, no-store");
    return response.json({ campaign: campaign ? { id: campaign._id, sponsor: campaign.sponsor, headline: campaign.headline, description: campaign.description, cta: campaign.cta, destination: campaign.destination } : null });
  } catch (error) { return next(error); }
});

routes.post("/:id/event", async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id) || !mongoose.isValidObjectId(request.body?.videoId) || !["impression", "click"].includes(request.body?.kind)) return response.status(400).json({ message: "Invalid ad event." });
    if (!showLocalAd(await readSubscription(request.user._id))) return response.status(403).json({ message: "Ads are disabled on this plan." });
    const now = new Date();
    const campaign = await AdCampaign.findOne({ _id: request.params.id, active: true, startsAt: { $lte: now }, $or: [{ endsAt: null }, { endsAt: { $gt: now } }] });
    if (!campaign) return response.status(404).json({ message: "Campaign unavailable." });
    const day = now.toISOString().slice(0, 10);
    const result = await AdEvent.updateOne({ campaignId: campaign._id, userId: request.user._id, videoId: request.body.videoId, day, kind: request.body.kind }, { $setOnInsert: { campaignId: campaign._id, userId: request.user._id, videoId: request.body.videoId, day, kind: request.body.kind } }, { upsert: true });
    if (result.upsertedCount) await AdCampaign.updateOne({ _id: campaign._id }, { $inc: { [request.body.kind === "click" ? "clicks" : "impressions"]: 1 } });
    return response.json({ recorded: Boolean(result.upsertedCount), destination: request.body.kind === "click" ? campaign.destination : undefined });
  } catch (error) {
    if (error?.code === 11000) return response.json({ recorded: false });
    return next(error);
  }
});

routes.get("/admin", requireAdmin, async (_request, response, next) => {
  try { return response.json(await AdCampaign.find().sort({ createdAt: -1 }).lean()); }
  catch (error) { return next(error); }
});

routes.post("/admin", requireAdmin, async (request, response, next) => {
  try {
    const { sponsor, headline, description, cta, destination, startsAt, endsAt } = request.body || {};
    if (![sponsor, headline, description, cta].every((value) => typeof value === "string" && value.trim()) || !validAdDestination(destination)) return response.status(400).json({ message: "Enter campaign text and a safe HTTPS or local link." });
    const starts = startsAt ? new Date(startsAt) : new Date();
    const ends = endsAt ? new Date(endsAt) : null;
    if (Number.isNaN(starts.getTime()) || (ends && (Number.isNaN(ends.getTime()) || ends <= starts))) return response.status(400).json({ message: "Choose valid campaign dates." });
    const campaign = await AdCampaign.create({ sponsor: sponsor.trim(), headline: headline.trim(), description: description.trim(), cta: cta.trim(), destination, startsAt: starts, endsAt: ends });
    return response.status(201).json(campaign);
  } catch (error) { return next(error); }
});

routes.patch("/admin/:id", requireAdmin, async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id) || typeof request.body?.active !== "boolean") return response.status(400).json({ message: "Choose an active status." });
    const campaign = await AdCampaign.findByIdAndUpdate(request.params.id, { active: request.body.active }, { new: true });
    return campaign ? response.json(campaign) : response.status(404).json({ message: "Campaign not found." });
  } catch (error) { return next(error); }
});

export default routes;
