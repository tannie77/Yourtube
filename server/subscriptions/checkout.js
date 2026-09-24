import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import CheckoutOrder from "../Modals/CheckoutOrder.js";
import Subscription from "../Modals/Subscription.js";
import { billingCycles, findPlan } from "./plans.js";

const outcomeToStatus = { success: "paid", failure: "failed", cancel: "cancelled" };
const processingTimeoutMs = 15_000;

export function publicOrder(order) {
  return {
    orderId: order.id,
    planId: order.planId,
    billingCycle: order.billingCycle,
    amountPaise: order.amountPaise,
    currency: order.currency,
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
    paymentId: order.paymentId || null,
    invoiceNumber: order.invoiceNumber || null,
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

    const subscription = await Subscription.findOne({ userId: request.user._id });
    if (subscription && subscription.expiresAt > new Date()) {
      return response.status(409).json({ message: "A paid plan is already active. Plan changes are coming in a later step." });
    }

    const order = await CheckoutOrder.create({
      userId: request.user._id,
      idempotencyKey,
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

async function finishPaidOrder(order) {
  const paidAt = new Date();
  return CheckoutOrder.findOneAndUpdate(
    { _id: order._id, status: "processing" },
    { $set: {
      status: "paid",
      paidAt,
      paymentId: order.simulatedResult.paymentId,
      invoiceNumber: `VC-${order.id.toUpperCase()}`,
    } },
    { returnDocument: "after" },
  );
}

async function activateSubscription(order) {
  const now = new Date();
  const current = await Subscription.findOne({ userId: order.userId });
  if (current?.lastOrderId?.toString() === order.id) return true;
  if (current && current.expiresAt > now) return false;

  const cycle = billingCycles.find((item) => item.id === order.billingCycle);
  const values = {
    planId: order.planId,
    billingCycle: order.billingCycle,
    startedAt: now,
    expiresAt: new Date(now.getTime() + cycle.validityDays * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    lastOrderId: order._id,
  };
  if (!current) {
    try {
      await Subscription.create({ userId: order.userId, ...values });
      return true;
    } catch (error) {
      if (error.code === 11000) return false;
      throw error;
    }
  }

  const updated = await Subscription.findOneAndUpdate(
    { _id: current._id, expiresAt: { $lte: now } },
    { $set: values },
    { returnDocument: "after" },
  );
  return Boolean(updated);
}

export async function verifyResult(request, response) {
  try {
    const order = await ownedOrder(request);
    if (!order) return response.status(404).json({ message: "Order not found." });
    if (!verifiedResult(order, request.body)) {
      return response.status(400).json({ message: "The local test result could not be verified." });
    }
    if (["paid", "failed", "cancelled"].includes(order.status)) {
      return response.json({ order: publicOrder(order) });
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

    const activated = await activateSubscription(claimed);
    if (!activated) {
      const failed = await CheckoutOrder.findOneAndUpdate(
        { _id: order._id, status: "processing" },
        { $set: { status: "failed", failureReason: "Another paid plan is already active." } },
        { returnDocument: "after" },
      );
      return response.status(409).json({ order: publicOrder(failed), message: "A paid plan is already active." });
    }
    const paid = await finishPaidOrder(claimed);
    return response.json({ order: publicOrder(paid) });
  } catch (error) {
    console.error("Could not verify local test result:", error);
    return response.status(500).json({ message: "Could not verify the local test result. Retry safely." });
  }
}
