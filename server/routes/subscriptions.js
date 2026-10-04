import express from "express";
import Subscription from "../Modals/Subscription.js";
import { requireAuth } from "../security/session.js";
import { billingCycles, plans } from "../subscriptions/plans.js";
import { createOrder, getInvoice, getOrder, getReceipt, listOrders, retryReceipt, simulateResult, verifyResult } from "../subscriptions/checkout.js";
import { isActive, publicSubscription, readSubscription } from "../subscriptions/state.js";
import { abandonRazorpay, cancelRazorpay, changeRazorpayPlan, confirmRazorpay, razorpayConfigured, startRazorpay } from "../subscriptions/razorpay.js";

const routes = express.Router();

routes.get("/plans", (_request, response) => {
  return response.json({
    plans,
    billingCycles,
    currency: "INR",
    pricingNote: razorpayConfigured() ? "Razorpay Test mode is available. Test payments do not move real money." : "Illustrative local test prices. Configure Razorpay Test credentials to enable provider checkout.",
    razorpayTestConfigured: razorpayConfigured(),
    razorpayKeyId: razorpayConfigured() ? process.env.RAZORPAY_TEST_KEY_ID : null,
  });
});

routes.get("/orders", requireAuth, listOrders);
routes.post("/orders", requireAuth, createOrder);
routes.get("/orders/:id", requireAuth, getOrder);
routes.post("/orders/:id/simulate", requireAuth, simulateResult);
routes.post("/orders/:id/verify", requireAuth, verifyResult);
routes.get("/orders/:id/receipt", requireAuth, getReceipt);
routes.get("/orders/:id/invoice", requireAuth, getInvoice);
routes.post("/orders/:id/receipt/send", requireAuth, retryReceipt);
routes.post("/razorpay/start", requireAuth, startRazorpay);
routes.post("/razorpay/confirm", requireAuth, confirmRazorpay);
routes.post("/razorpay/orders/:id/abandon", requireAuth, abandonRazorpay);
routes.post("/me/change", requireAuth, changeRazorpayPlan);

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
    if (current.provider === "razorpay" && current.autoRenew && !current.cancelAtPeriodEnd) await cancelRazorpay(current);
    const record = current.cancelAtPeriodEnd ? current : await Subscription.findOneAndUpdate(
      { _id: current._id, expiresAt: { $gt: new Date() } },
      { $set: { cancelAtPeriodEnd: true, autoRenew: false, nextRenewalAt: null } },
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
