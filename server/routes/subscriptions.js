import express from "express";
import Subscription from "../Modals/Subscription.js";
import { requireAuth } from "../security/session.js";
import { billingCycles, plans } from "../subscriptions/plans.js";
import { createOrder, getOrder, getReceipt, listOrders, retryReceipt, simulateResult, verifyResult } from "../subscriptions/checkout.js";
import { isActive, publicSubscription, readSubscription } from "../subscriptions/state.js";

const routes = express.Router();

routes.get("/plans", (_request, response) => {
  return response.json({
    plans,
    billingCycles,
    currency: "INR",
    pricingNote: "Illustrative local test prices. No real money is collected.",
  });
});

routes.get("/orders", requireAuth, listOrders);
routes.post("/orders", requireAuth, createOrder);
routes.get("/orders/:id", requireAuth, getOrder);
routes.post("/orders/:id/simulate", requireAuth, simulateResult);
routes.post("/orders/:id/verify", requireAuth, verifyResult);
routes.get("/orders/:id/receipt", requireAuth, getReceipt);
routes.post("/orders/:id/receipt/send", requireAuth, retryReceipt);

routes.get("/me", requireAuth, async (request, response, next) => {
  try {
    const record = await readSubscription(request.user._id);
    response.set("Cache-Control", "no-store");
    return response.json(publicSubscription(record, request.user._id));
  } catch (error) {
    next(error);
  }
});

routes.post("/me/cancel", requireAuth, async (request, response, next) => {
  try {
    const current = await readSubscription(request.user._id);
    if (!isActive(current)) return response.status(409).json({ message: "There is no active term to cancel." });
    const record = current.cancelAtPeriodEnd ? current : await Subscription.findOneAndUpdate(
      { _id: current._id, expiresAt: { $gt: new Date() } },
      { $set: { cancelAtPeriodEnd: true } },
      { returnDocument: "after" },
    );
    if (!record) return response.status(409).json({ message: "This term has already expired." });
    response.set("Cache-Control", "no-store");
    return response.json(publicSubscription(record, request.user._id));
  } catch (error) {
    next(error);
  }
});

export default routes;
