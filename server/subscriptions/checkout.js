import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import CheckoutOrder from "../Modals/CheckoutOrder.js";
import Subscription from "../Modals/Subscription.js";
import { billingCycles, findPlan } from "./plans.js";
import { deliverReceipt, publicReceipt } from "./receipts.js";
import { isActive, orderIntent, readSubscription, termLength } from "./state.js";

const outcomeToStatus = { success: "paid", failure: "failed", cancel: "cancelled" };
const processingTimeoutMs = 15_000;

export function publicOrder(order) {
  return {
    orderId: order.id,
    intent: order.intent || "purchase",
    fromPlanId: order.fromPlanId || null,
    planId: order.planId,
    billingCycle: order.billingCycle,
    amountPaise: order.amountPaise,
    currency: order.currency,
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
    termStartsAt: order.termStartsAt || null,
    termExpiresAt: order.termExpiresAt || null,
    paymentId: order.paymentId || null,
    invoiceNumber: order.invoiceNumber || null,
    receiptStatus: order.status === "paid" ? (order.receiptStatus || "pending") : null,
    failureReason: order.failureReason || null,
    simulatedResult: order.simulatedResult ? {
      outcome: order.simulatedResult.outcome,
      paymentId: order.simulatedResult.paymentId,
      signature: order.simulatedResult.signature,
    } : null,
  };
}

function resultPayload(order, outcome, paymentId) {
  return `${order.id}|${outcome}|${paymentId}|${order.amountPaise}|${order.currency}`;
}

function signResult(order, outcome, paymentId) {
  return createHmac("sha256", Buffer.from(order.verificationSecret, "hex"))
    .update(resultPayload(order, outcome, paymentId))
    .digest("hex");
}

function verifiedResult(order, candidate) {
  const issued = order.simulatedResult;
  if (!issued || !candidate ||
      candidate.outcome !== issued.outcome ||
      candidate.paymentId !== issued.paymentId ||
      candidate.signature !== issued.signature ||
      !/^[a-f0-9]{64}$/.test(candidate.signature)) return false;

  const expected = Buffer.from(signResult(order, candidate.outcome, candidate.paymentId), "hex");
  const received = Buffer.from(candidate.signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function validOrderId(id) {
  return mongoose.isValidObjectId(id);
}

async function ownedOrder(request) {
  if (!validOrderId(request.params.id)) return null;
  return CheckoutOrder.findOne({ _id: request.params.id, userId: request.user._id }).select("+verificationSecret");
}

export async function createOrder(request, response) {
  const planId = request.body?.planId;
  const billingCycle = request.body?.billingCycle;
  const idempotencyKey = request.body?.idempotencyKey;
  const plan = findPlan(planId);
  const cycle = billingCycles.find((item) => item.id === billingCycle);
  if (!plan || plan.id === "free" || !cycle ||
      typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
    return response.status(400).json({ message: "Choose a paid plan and term, then retry checkout." });
  }

  try {
    const previous = await CheckoutOrder.findOne({ userId: request.user._id, idempotencyKey });
    if (previous) {
      if (previous.planId !== planId || previous.billingCycle !== billingCycle) {
        return response.status(409).json({ message: "This checkout request was already used for another plan." });
      }
      return response.json({ order: publicOrder(previous) });
    }

    const subscription = await readSubscription(request.user._id);
    if (isActive(subscription) && subscription.scheduledChange?.orderId) {
      return response.status(409).json({ message: "A prepaid plan change is already scheduled. Let it start before creating another order." });
    }

    const intent = orderIntent(subscription, planId);

    const order = await CheckoutOrder.create({
      userId: request.user._id,
      idempotencyKey,
      intent,
      fromPlanId: isActive(subscription) ? subscription.planId : undefined,
      fromExpiresAt: isActive(subscription) ? subscription.expiresAt : undefined,
      planId,
      billingCycle,
      amountPaise: plan.pricesPaise[billingCycle],
      verificationSecret: randomBytes(32).toString("hex"),
    });
    return response.status(201).json({ order: publicOrder(order) });
  } catch (error) {
    if (error.code === 11000) {
      const previous = await CheckoutOrder.findOne({ userId: request.user._id, idempotencyKey });
      if (previous?.planId === planId && previous.billingCycle === billingCycle) {
        return response.json({ order: publicOrder(previous) });
      }
      return response.status(409).json({ message: "This checkout request was already used." });
    }
    console.error("Could not create local checkout order:", error);
    return response.status(500).json({ message: "Could not create the local test order." });
  }
}

export async function listOrders(request, response) {
  try {
    const orders = await CheckoutOrder.find({ userId: request.user._id })
      .sort({ createdAt: -1 }).limit(20);
    response.set("Cache-Control", "no-store");
    return response.json({ orders: orders.map(publicOrder) });
  } catch (error) {
    console.error("Could not load local orders:", error);
    return response.status(500).json({ message: "Could not load payment history." });
  }
}

export async function getOrder(request, response) {
  try {
    const order = await ownedOrder(request);
    if (!order) return response.status(404).json({ message: "Order not found." });
    response.set("Cache-Control", "no-store");
    return response.json({ order: publicOrder(order) });
  } catch (error) {
    console.error("Could not load local order:", error);
    return response.status(500).json({ message: "Could not load the order." });
  }
}

export async function simulateResult(request, response) {
  const outcome = request.body?.outcome;
  if (!Object.hasOwn(outcomeToStatus, outcome)) {
    return response.status(400).json({ message: "Choose success, failure or cancel for the local test." });
  }

  try {
    const order = await ownedOrder(request);
    if (!order) return response.status(404).json({ message: "Order not found." });
    if (order.simulatedResult) {
      if (order.simulatedResult.outcome !== outcome) {
        return response.status(409).json({ message: "This test order already has a different result." });
      }
      return response.json({ order: publicOrder(order), result: publicOrder(order).simulatedResult });
    }
    if (order.status !== "pending") {
      return response.status(409).json({ message: "This order is no longer awaiting a test result." });
    }

    const paymentId = `sim_pay_${randomBytes(10).toString("hex")}`;
    const result = {
      outcome,
      paymentId,
      signature: signResult(order, outcome, paymentId),
      issuedAt: new Date(),
    };
    const issued = await CheckoutOrder.findOneAndUpdate(
      { _id: order._id, userId: request.user._id, status: "pending", simulatedResult: { $exists: false } },
      { $set: { simulatedResult: result } },
      { returnDocument: "after" },
    );
    const latest = issued || await ownedOrder(request);
    if (latest.simulatedResult.outcome !== outcome) {
      return response.status(409).json({ message: "This test order already has a different result." });
    }
    return response.json({ order: publicOrder(latest), result: publicOrder(latest).simulatedResult });
  } catch (error) {
    console.error("Could not simulate local result:", error);
    return response.status(500).json({ message: "Could not issue the local test result." });
  }
}

async function finishPaidOrder(order, term) {
  const paidAt = new Date();
  return CheckoutOrder.findOneAndUpdate(
    { _id: order._id, status: "processing" },
    { $set: {
      status: "paid",
      paidAt,
      paymentId: order.simulatedResult.paymentId,
      invoiceNumber: `VC-${order.id.toUpperCase()}`,
      termStartsAt: term.startsAt,
      termExpiresAt: term.expiresAt,
      receiptStatus: "pending",
    } },
    { returnDocument: "after" },
  );
}

async function activateSubscription(order) {
  const now = new Date();
  const current = await readSubscription(order.userId, now);
  const length = termLength(order.billingCycle);
  if (current?.lastOrderId?.toString() === order.id) {
    const scheduled = current.scheduledChange?.orderId?.toString() === order.id ? current.scheduledChange : null;
    return {
      startsAt: scheduled?.startsAt || (order.intent === "renewal" ? order.fromExpiresAt : current.startedAt),
      expiresAt: scheduled?.expiresAt || current.expiresAt,
    };
  }

  const intent = order.intent || "purchase";
  if (intent === "purchase") {
    if (isActive(current, now)) return null;
    const term = { startsAt: now, expiresAt: new Date(now.getTime() + length) };
    const values = {
      planId: order.planId,
      billingCycle: order.billingCycle,
      startedAt: term.startsAt,
      expiresAt: term.expiresAt,
      cancelAtPeriodEnd: false,
      lastOrderId: order._id,
    };
    if (!current) {
      try {
        await Subscription.create({ userId: order.userId, ...values });
        return term;
      } catch (error) {
        if (error.code === 11000) return null;
        throw error;
      }
    }
    const updated = await Subscription.findOneAndUpdate(
      { _id: current._id, expiresAt: { $lte: now }, "scheduledChange.orderId": { $exists: false } },
      { $set: values, $unset: { scheduledChange: 1 } },
      { returnDocument: "after" },
    );
    return updated ? term : null;
  }

  if (!isActive(current, now) || current.planId !== order.fromPlanId ||
      current.expiresAt.getTime() !== order.fromExpiresAt?.getTime() ||
      current.scheduledChange?.orderId) return null;

  const startsAt = intent === "upgrade" ? now : current.expiresAt;
  const term = { startsAt, expiresAt: new Date(startsAt.getTime() + length) };
  const filter = {
    _id: current._id,
    planId: order.fromPlanId,
    expiresAt: order.fromExpiresAt,
    "scheduledChange.orderId": { $exists: false },
  };
  let update;
  if (intent === "downgrade") {
    update = { $set: {
      scheduledChange: { planId: order.planId, billingCycle: order.billingCycle,
        startsAt: term.startsAt, expiresAt: term.expiresAt, orderId: order._id },
      lastOrderId: order._id,
    } };
  } else if (intent === "renewal") {
    update = { $set: { billingCycle: order.billingCycle, expiresAt: term.expiresAt,
      cancelAtPeriodEnd: false, lastOrderId: order._id } };
  } else {
    update = { $set: { planId: order.planId, billingCycle: order.billingCycle,
      startedAt: term.startsAt, expiresAt: term.expiresAt,
      cancelAtPeriodEnd: false, lastOrderId: order._id } };
  }
  const updated = await Subscription.findOneAndUpdate(filter, update, { returnDocument: "after" });
  return updated ? term : null;
}

export async function verifyResult(request, response) {
  try {
    const order = await ownedOrder(request);
    if (!order) return response.status(404).json({ message: "Order not found." });
    if (!verifiedResult(order, request.body)) {
      return response.status(400).json({ message: "The local test result could not be verified." });
    }
    if (["paid", "failed", "cancelled"].includes(order.status)) {
      const latest = order.status === "paid" && order.receiptStatus !== "sent"
        ? await deliverReceipt(order, request.user) : order;
      return response.json({ order: publicOrder(latest) });
    }

    if (order.simulatedResult.outcome !== "success") {
      const finalStatus = outcomeToStatus[order.simulatedResult.outcome];
      const updated = await CheckoutOrder.findOneAndUpdate(
        { _id: order._id, status: "pending" },
        { $set: {
          status: finalStatus,
          failureReason: finalStatus === "failed" ? "Local test payment failed." : null,
        } },
        { returnDocument: "after" },
      );
      const latest = updated || await ownedOrder(request);
      return response.json({ order: publicOrder(latest) });
    }

    const staleBefore = new Date(Date.now() - processingTimeoutMs);
    const claimed = await CheckoutOrder.findOneAndUpdate(
      { _id: order._id, userId: request.user._id,
        $or: [{ status: "pending" }, { status: "processing", processingAt: { $lt: staleBefore } }] },
      { $set: { status: "processing", processingAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!claimed) {
      const latest = await ownedOrder(request);
      return response.status(latest.status === "processing" ? 202 : 200).json({ order: publicOrder(latest) });
    }

    const term = await activateSubscription(claimed);
    if (!term) {
      const failed = await CheckoutOrder.findOneAndUpdate(
        { _id: order._id, status: "processing" },
        { $set: { status: "failed", failureReason: "Your membership changed before this test order was verified." } },
        { returnDocument: "after" },
      );
      return response.status(409).json({ order: publicOrder(failed), message: "Your membership changed. Start a new test order." });
    }
    const paid = await finishPaidOrder(claimed, term);
    const withReceipt = await deliverReceipt(paid, request.user);
    return response.json({ order: publicOrder(withReceipt) });
  } catch (error) {
    console.error("Could not verify local test result:", error);
    return response.status(500).json({ message: "Could not verify the local test result. Retry safely." });
  }
}

export async function getReceipt(request, response) {
  try {
    const order = await ownedOrder(request);
    if (!order || order.status !== "paid") return response.status(404).json({ message: "Test receipt not found." });
    response.set("Cache-Control", "no-store");
    return response.json({ receipt: publicReceipt(order, request.user) });
  } catch (error) {
    console.error("Could not load local receipt:", error);
    return response.status(500).json({ message: "Could not load the test receipt." });
  }
}

export async function retryReceipt(request, response) {
  try {
    const order = await ownedOrder(request);
    if (!order || order.status !== "paid") return response.status(404).json({ message: "Test receipt not found." });
    const latest = await deliverReceipt(order, request.user);
    return response.json({ order: publicOrder(latest), receipt: publicReceipt(latest, request.user) });
  } catch (error) {
    console.error("Could not retry local receipt:", error);
    return response.status(500).json({ message: "Could not retry the local receipt." });
  }
}
