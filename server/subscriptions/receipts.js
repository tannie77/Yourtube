import { once } from "node:events";
import { createConnection } from "node:net";
import { createInterface } from "node:readline";
import CheckoutOrder from "../Modals/CheckoutOrder.js";
import { findPlan } from "./plans.js";

const fromAddress = "receipts@vidcircle.local";

export function publicReceipt(order, user) {
  return {
    reference: order.invoiceNumber,
    orderId: order.id,
    paymentId: order.paymentId,
    recipient: user.email,
    planName: findPlan(order.planId)?.name || order.planId,
    billingCycle: order.billingCycle,
    intent: order.intent || "purchase",
    amountPaise: order.amountPaise,
    currency: order.currency,
    paidAt: order.paidAt,
    termStartsAt: order.termStartsAt || null,
    termExpiresAt: order.termExpiresAt || null,
    emailStatus: order.receiptStatus || "pending",
    emailSentAt: order.receiptSentAt || null,
    notice: "Local simulation only. No money was charged. This is not a tax invoice.",
  };
}

function receiptText(order, user) {
  const receipt = publicReceipt(order, user);
  return [
    "VidCircle local test receipt",
    "",
    `Hello ${user.name},`,
    `Your ${receipt.intent} test result was verified. No money was charged.`,
    "",
    `Plan: ${receipt.planName} (${receipt.billingCycle})`,
    `Illustrative amount: INR ${(receipt.amountPaise / 100).toFixed(2)}`,
    `Reference: ${receipt.reference}`,
    `Order ID: ${receipt.orderId}`,
    `Test payment ID: ${receipt.paymentId}`,
    `Term starts: ${receipt.termStartsAt ? new Date(receipt.termStartsAt).toISOString() : "Earlier prototype order"}`,
    `Term ends: ${receipt.termExpiresAt ? new Date(receipt.termExpiresAt).toISOString() : "See membership page"}`,
    "",
    "This email is captured by the local Mailpit inbox only. It is not a tax invoice.",
    "Support: support@vidcircle.local",
  ].join("\r\n");
}

async function sendToMailpit(recipient, subject, body) {
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)) {
    throw new Error("Invalid receipt email address.");
  }
  const port = Number(process.env.MAILPIT_SMTP_PORT || 1025);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local Mailpit port.");
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.setTimeout(2500, () => socket.destroy(new Error("Local Mailpit timed out.")));
  socket.on("error", () => {});
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  let completed = false;

  async function expect(codes) {
    while (true) {
      const { value, done } = await iterator.next();
      if (done || !/^\d{3}[ -]/.test(value)) throw new Error("Local Mailpit closed unexpectedly.");
      const code = Number(value.slice(0, 3));
      if (!codes.includes(code)) throw new Error(`Local Mailpit rejected the receipt (${code}).`);
      if (value[3] === " ") return;
    }
  }

  try {
    await once(socket, "connect");
    await expect([220]);
    socket.write("EHLO vidcircle.local\r\n");
    await expect([250]);
    socket.write(`MAIL FROM:<${fromAddress}>\r\n`);
    await expect([250]);
    socket.write(`RCPT TO:<${recipient}>\r\n`);
    await expect([250, 251]);
    socket.write("DATA\r\n");
    await expect([354]);
    const safeBody = body.replace(/\r?\n\./g, "\r\n..");
    socket.write(`From: VidCircle <${fromAddress}>\r\nTo: <${recipient}>\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${safeBody}\r\n.\r\n`);
    await expect([250]);
    socket.write("QUIT\r\n");
    await expect([221]);
    completed = true;
  } finally {
    lines.close();
    if (completed) socket.end();
    else socket.destroy();
  }
}

export async function deliverReceipt(order, user) {
  const staleBefore = new Date(Date.now() - 15_000);
  const claimed = await CheckoutOrder.findOneAndUpdate(
    {
      _id: order._id,
      status: "paid",
      $or: [
        { receiptStatus: { $exists: false } },
        { receiptStatus: { $in: ["pending", "failed"] } },
        { receiptStatus: "sending", receiptClaimedAt: { $lt: staleBefore } },
      ],
    },
    { $set: { receiptStatus: "sending", receiptClaimedAt: new Date() }, $inc: { receiptAttempts: 1 } },
    { returnDocument: "after" },
  );
  if (!claimed) return CheckoutOrder.findById(order._id);

  try {
    await sendToMailpit(user.email, `VidCircle local test receipt ${claimed.invoiceNumber}`, receiptText(claimed, user));
    return CheckoutOrder.findOneAndUpdate(
      { _id: claimed._id, receiptStatus: "sending" },
      { $set: { receiptStatus: "sent", receiptSentAt: new Date() } },
      { returnDocument: "after" },
    );
  } catch {
    return CheckoutOrder.findOneAndUpdate(
      { _id: claimed._id, receiptStatus: "sending" },
      { $set: { receiptStatus: "failed" } },
      { returnDocument: "after" },
    );
  }
}
