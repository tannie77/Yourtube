import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import CheckoutOrder from "../Modals/CheckoutOrder.js";
import Subscription from "../Modals/Subscription.js";
import RazorpayWebhookEvent from "../Modals/RazorpayWebhookEvent.js";
import User from "../Modals/Auth.js";
import { billingCycles, findPlan, paidPlanIds } from "./plans.js";
import { deliverReceipt } from "./receipts.js";
import { isActive, orderIntent, readSubscription } from "./state.js";
import { publicOrder } from "./checkout.js";

const planEnvName = (planId, cycle) => `RAZORPAY_PLAN_${planId.toUpperCase()}_${cycle.toUpperCase()}`;
const providerId = (value, prefix) => typeof value === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);

export function razorpayConfigured() {
  if (process.env.NODE_ENV === "production") return false;
  const configuredIds = paidPlanIds.flatMap((planId) => billingCycles.map((cycle) => process.env[planEnvName(planId, cycle.id)]));
  return /^rzp_test_[A-Za-z0-9]+$/.test(process.env.RAZORPAY_TEST_KEY_ID || "") &&
    Boolean(process.env.RAZORPAY_TEST_KEY_SECRET) && Boolean(process.env.RAZORPAY_WEBHOOK_SECRET) &&
    configuredIds.every((id) => providerId(id, "plan")) && new Set(configuredIds).size === configuredIds.length;
}

function configuredPlan(planId, cycle) {
  const value = process.env[planEnvName(planId, cycle)];
  return providerId(value, "plan") ? value : null;
}

function localPlanFor(providerPlanId) {
  for (const planId of paidPlanIds) for (const cycle of billingCycles) {
    if (configuredPlan(planId, cycle.id) === providerPlanId) return { planId, billingCycle: cycle.id };
  }
  return null;
}

export function verifyHmac(message, signature, secret) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature) || !secret) return false;
  const expected = createHmac("sha256", secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

async function razorpayRequest(method, path, body) {
  if (!razorpayConfigured()) throw new Error("Razorpay Test is not configured.");
  const credentials = Buffer.from(`${process.env.RAZORPAY_TEST_KEY_ID}:${process.env.RAZORPAY_TEST_KEY_SECRET}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Razorpay Test API rejected ${method} ${path} (${response.status}).`);
  return result;
}

function termFromProvider(providerSubscription) {
  const start = Number(providerSubscription?.current_start);
  const end = Number(providerSubscription?.current_end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return null;
  return { startsAt: new Date(start * 1000), expiresAt: new Date(end * 1000) };
}

export async function startRazorpay(request, response) {
  if (!razorpayConfigured()) return response.status(503).json({ message: "Razorpay Test keys and webhook secret are not configured yet." });
  const { planId, billingCycle, idempotencyKey } = request.body || {};
  const plan = findPlan(planId);
  const providerPlanId = configuredPlan(planId, billingCycle);
  if (!plan || plan.id === "free" || !providerPlanId || !billingCycles.some((cycle) => cycle.id === billingCycle) ||
      typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
    return response.status(400).json({ message: "Choose a configured paid plan and billing term." });
  }
  try {
    const previous = await CheckoutOrder.findOne({ userId: request.user._id, idempotencyKey });
    if (previous) {
      if (previous.planId !== planId || previous.billingCycle !== billingCycle || previous.provider !== "razorpay") return response.status(409).json({ message: "Checkout key already used." });
      return response.json({ order: publicOrder(previous), keyId: process.env.RAZORPAY_TEST_KEY_ID });
    }
    const current = await readSubscription(request.user._id);
    if (isActive(current) || (current?.provider === "razorpay" && current.autoRenew && !current.cancelAtPeriodEnd)) {
      return response.status(409).json({ message: "A paid or renewing membership already exists. Use the plan change controls or wait for the current subscription to settle." });
    }
    const pending = await CheckoutOrder.findOne({ userId: request.user._id, status: { $in: ["pending", "processing"] } });
    if (pending) return response.status(409).json({ message: "Complete or wait for your existing checkout before starting another." });

    const order = await CheckoutOrder.create({ userId: request.user._id, idempotencyKey, provider: "razorpay", intent: "purchase",
      planId, billingCycle, amountPaise: plan.pricesPaise[billingCycle], verificationSecret: randomBytes(32).toString("hex") });
    try {
      const cycleCounts = { monthly: 120, quarterly: 40, yearly: 10 };
      const providerSubscription = await razorpayRequest("POST", "/subscriptions", {
        plan_id: providerPlanId, total_count: cycleCounts[billingCycle], quantity: 1, customer_notify: true,
        notes: { yourtube_order_id: order.id, yourtube_user_id: String(request.user._id) },
      });
      if (!providerId(providerSubscription.id, "sub")) throw new Error("Razorpay returned an invalid subscription ID.");
      order.razorpaySubscriptionId = providerSubscription.id;
      await order.save();
      return response.status(201).json({ order: publicOrder(order), keyId: process.env.RAZORPAY_TEST_KEY_ID });
    } catch (error) {
      await CheckoutOrder.updateOne({ _id: order._id }, { $set: { status: "failed", failureReason: "Razorpay Test subscription could not be created." } });
      throw error;
    }
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ message: "Checkout already exists. Refresh and try again." });
    console.error("Razorpay Test checkout failed:", error.message);
    return response.status(502).json({ message: "Razorpay Test checkout is temporarily unavailable." });
  }
}

export async function confirmRazorpay(request, response) {
  const { orderId, razorpay_payment_id: paymentId, razorpay_subscription_id: subscriptionId, razorpay_signature: signature } = request.body || {};
  if (!providerId(paymentId, "pay") || !providerId(subscriptionId, "sub") || !razorpayConfigured()) return response.status(400).json({ message: "Invalid Razorpay Test response." });
  try {
    const order = await CheckoutOrder.findOne({ _id: orderId, userId: request.user._id, provider: "razorpay", razorpaySubscriptionId: subscriptionId });
    if (!order) return response.status(404).json({ message: "Checkout not found." });
    if (!verifyHmac(`${paymentId}|${subscriptionId}`, signature, process.env.RAZORPAY_TEST_KEY_SECRET)) return response.status(400).json({ message: "Razorpay Test signature did not match." });
    await CheckoutOrder.updateOne({ _id: order._id }, { $set: { razorpayAuthorizationPaymentId: paymentId } });
    const latest = await CheckoutOrder.findById(order._id);
    return response.json({ order: publicOrder(latest), message: latest.status === "paid" ? "Membership active." : "Payment authorized. Your membership activates after Razorpay confirms the subscription charge." });
  } catch (error) {
    console.error("Razorpay Test confirmation failed:", error.message);
    return response.status(500).json({ message: "Could not confirm Razorpay Test checkout." });
  }
}

export async function abandonRazorpay(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ message: "Pending checkout not found." });
  try {
    const order = await CheckoutOrder.findOne({ _id: request.params.id, userId: request.user._id, provider: "razorpay", status: "pending" });
    if (!order || !order.razorpaySubscriptionId) return response.status(404).json({ message: "Pending checkout not found." });
    if (order.razorpayAuthorizationPaymentId) return response.status(409).json({ message: "Payment authorization is already recorded. Wait for Razorpay to confirm its status." });
    const provider = await razorpayRequest("GET", `/subscriptions/${order.razorpaySubscriptionId}`);
    if (provider.status !== "created") return response.status(409).json({ message: "This subscription is already being authorized. Refresh its status." });
    await razorpayRequest("POST", `/subscriptions/${order.razorpaySubscriptionId}/cancel`, { cancel_at_cycle_end: 0 });
    const cancelled = await CheckoutOrder.findOneAndUpdate({ _id: order._id, status: "pending" },
      { $set: { status: "cancelled", failureReason: "Razorpay Test checkout abandoned before authorization." } }, { returnDocument: "after" });
    return response.json({ order: publicOrder(cancelled || await CheckoutOrder.findById(order._id)) });
  } catch (error) {
    console.error("Could not abandon Razorpay Test checkout:", error.message);
    return response.status(502).json({ message: "Could not cancel the pending Razorpay Test checkout." });
  }
}

async function applyCharge(payment, providerSubscription) {
  if (!providerId(payment?.id, "pay") || payment.status !== "captured" || payment.currency !== "INR" ||
      !providerId(providerSubscription?.id, "sub")) throw new Error("Invalid captured subscription payment.");
  const mapped = localPlanFor(providerSubscription.plan_id);
  const term = termFromProvider(providerSubscription);
  if (!mapped || !term || !Number.isInteger(payment.amount) || payment.amount !== findPlan(mapped.planId).pricesPaise[mapped.billingCycle]) {
    throw new Error("Provider plan, amount or term does not match configured membership pricing.");
  }
  const existingPayment = await CheckoutOrder.findOne({ paymentId: payment.id });
  if (existingPayment?.status === "paid") return existingPayment;
  const initial = await CheckoutOrder.findOne({ provider: "razorpay", razorpaySubscriptionId: providerSubscription.id, status: { $in: ["pending", "processing"] } });
  const current = await Subscription.findOne({ razorpaySubscriptionId: providerSubscription.id });
  if (!initial && !current) throw new Error("Unknown Razorpay Test subscription.");
  const userId = initial?.userId || current.userId;
  if (initial && (initial.planId !== mapped.planId || initial.billingCycle !== mapped.billingCycle)) throw new Error("Initial provider plan differs from checkout selection.");
  let order = existingPayment;
  if (!order && initial) {
    order = await CheckoutOrder.findOneAndUpdate({ _id: initial._id, status: "pending" },
      { $set: { status: "processing", processingAt: new Date(), paymentId: payment.id } }, { returnDocument: "after" });
    if (!order) order = await CheckoutOrder.findById(initial._id);
  }
  if (!order && current) {
    try {
      order = await CheckoutOrder.create({ userId, idempotencyKey: `rzp_${payment.id}`, provider: "razorpay",
        intent: orderIntent(current, mapped.planId), fromPlanId: current.planId, fromExpiresAt: current.expiresAt,
        planId: mapped.planId, billingCycle: mapped.billingCycle, amountPaise: payment.amount,
        verificationSecret: randomBytes(32).toString("hex"), razorpaySubscriptionId: providerSubscription.id,
        paymentId: payment.id, status: "processing", processingAt: new Date() });
    } catch (error) {
      if (error.code !== 11000) throw error;
      order = await CheckoutOrder.findOne({ paymentId: payment.id });
    }
  }
  if (!order || order.paymentId !== payment.id) throw new Error("Charge is already being processed.");
  if (order.status === "paid") return order;
  const prior = await Subscription.findOne({ userId });
  const ended = ["cancelled", "completed", "halted"].includes(providerSubscription.status);
  const cancelled = ended || Boolean(prior?.cancelAtPeriodEnd && prior.razorpaySubscriptionId === providerSubscription.id);
  const values = { planId: mapped.planId, billingCycle: mapped.billingCycle, startedAt: term.startsAt,
    expiresAt: term.expiresAt, nextRenewalAt: term.expiresAt, provider: "razorpay", razorpaySubscriptionId: providerSubscription.id,
    autoRenew: !cancelled, cancelAtPeriodEnd: cancelled,
    lastOrderId: order._id };
  if (prior && prior.razorpaySubscriptionId && prior.razorpaySubscriptionId !== providerSubscription.id && (isActive(prior) || prior.autoRenew)) throw new Error("Membership is linked to another recurring subscription.");
  if (prior && isActive(prior) && prior.provider !== "razorpay") throw new Error("A separate active membership already exists.");
  await Subscription.findOneAndUpdate({ userId }, { $set: values, $unset: { scheduledChange: 1, pendingProviderChange: 1 } }, { upsert: true, returnDocument: "after" });
  const paid = await CheckoutOrder.findOneAndUpdate({ _id: order._id, status: "processing" },
    { $set: { status: "paid", paidAt: new Date(Number(payment.created_at || Date.now() / 1000) * 1000),
      planId: mapped.planId, billingCycle: mapped.billingCycle, amountPaise: payment.amount,
      invoiceNumber: `YT-${order.id.toUpperCase()}`, termStartsAt: term.startsAt, termExpiresAt: term.expiresAt,
      receiptStatus: "pending" } }, { returnDocument: "after" });
  if (!paid) return CheckoutOrder.findById(order._id);
  const user = await User.findById(userId);
  return user ? deliverReceipt(paid, user) : paid;
}

export async function razorpayWebhook(request, response) {
  if (!razorpayConfigured() || !Buffer.isBuffer(request.body)) return response.status(503).json({ message: "Razorpay webhook is not configured." });
  if (!verifyHmac(request.body, request.get("x-razorpay-signature"), process.env.RAZORPAY_WEBHOOK_SECRET)) return response.status(401).json({ message: "Invalid webhook signature." });
  const eventId = request.get("x-razorpay-event-id");
  if (!eventId || eventId.length > 100) return response.status(400).json({ message: "Missing webhook event ID." });
  try {
    if (await RazorpayWebhookEvent.exists({ eventId })) return response.json({ ok: true });
    const event = JSON.parse(request.body.toString("utf8"));
    if (event.event === "subscription.charged") {
      const payment = event.payload?.payment?.entity;
      const subscription = event.payload?.subscription?.entity;
      await applyCharge(payment, subscription?.current_start && subscription?.current_end ? subscription : await razorpayRequest("GET", `/subscriptions/${subscription.id}`));
    } else if (["subscription.cancelled", "subscription.completed", "subscription.halted"].includes(event.event)) {
      const id = event.payload?.subscription?.entity?.id;
      if (providerId(id, "sub")) await Subscription.updateOne({ razorpaySubscriptionId: id },
        { $set: { autoRenew: false, cancelAtPeriodEnd: true, nextRenewalAt: null } });
    }
    await RazorpayWebhookEvent.create({ eventId, eventName: String(event.event || "unknown") }).catch((error) => { if (error.code !== 11000) throw error; });
    return response.json({ ok: true });
  } catch (error) {
    console.error("Razorpay Test webhook processing failed:", error.message);
    return response.status(500).json({ message: "Webhook processing failed; Razorpay may retry." });
  }
}

export async function changeRazorpayPlan(request, response) {
  const { planId, billingCycle } = request.body || {};
  const providerPlanId = configuredPlan(planId, billingCycle);
  if (!providerPlanId) return response.status(400).json({ message: "Choose a configured paid plan and term." });
  try {
    const current = await readSubscription(request.user._id);
    if (!isActive(current) || current.provider !== "razorpay" || !current.autoRenew || !current.razorpaySubscriptionId) return response.status(409).json({ message: "No active recurring Razorpay membership can be changed." });
    if (current.pendingProviderChange?.planId) return response.status(409).json({ message: "A Razorpay Test plan change is already pending confirmation." });
    const intent = orderIntent(current, planId);
    if (intent === "renewal" && current.billingCycle === billingCycle) return response.status(409).json({ message: "That plan and billing term are already active." });
    const when = intent === "downgrade" ? "cycle_end" : "now";
    const updated = await razorpayRequest("PATCH", `/subscriptions/${current.razorpaySubscriptionId}`, {
      plan_id: providerPlanId, schedule_change_at: when, customer_notify: true,
    });
    if (updated.id !== current.razorpaySubscriptionId) throw new Error("Unexpected provider subscription.");
    await Subscription.updateOne({ _id: current._id, razorpaySubscriptionId: current.razorpaySubscriptionId },
      { $set: { pendingProviderChange: { planId, billingCycle, requestedAt: new Date(),
        startsAt: when === "cycle_end" ? current.expiresAt : new Date() } } });
    return response.json({ message: when === "cycle_end" ? "Plan change scheduled for the next billing cycle." : "Plan change requested. New benefits begin after Razorpay confirms the charge.",
      providerStatus: updated.status, changeAt: when });
  } catch (error) {
    console.error("Razorpay Test plan change failed:", error.message);
    return response.status(502).json({ message: "Could not change the Razorpay Test plan." });
  }
}

export async function cancelRazorpay(current) {
  const updated = await razorpayRequest("POST", `/subscriptions/${current.razorpaySubscriptionId}/cancel`, { cancel_at_cycle_end: 1 });
  if (updated.id !== current.razorpaySubscriptionId) throw new Error("Unexpected provider subscription.");
}
