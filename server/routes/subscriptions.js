import express from "express";
import Subscription from "../Modals/Subscription.js";
import { requireAuth } from "../security/session.js";
import { billingCycles, plans } from "../subscriptions/plans.js";
import { createOrder, getOrder, listOrders, simulateResult, verifyResult } from "../subscriptions/checkout.js";

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

routes.get("/me", requireAuth, async (request, response, next) => {
  try {
    const record = await Subscription.findOne({ userId: request.user._id });
    const now = new Date();
    const active = Boolean(record && record.expiresAt > now);

    response.set("Cache-Control", "no-store");
    return response.json({
      userId: request.user.id,
      effectivePlanId: active ? record.planId : "free",
      status: active ? "active" : record ? "expired" : "free",
      billingCycle: active ? record.billingCycle : null,
      startedAt: active ? record.startedAt : null,
      expiresAt: active ? record.expiresAt : null,
      cancelAtPeriodEnd: active ? record.cancelAtPeriodEnd : false,
      autoRenew: false,
    });
  } catch (error) {
    next(error);
  }
});

export default routes;
