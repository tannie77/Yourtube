import { once } from "node:events";
import { createConnection } from "node:net";
import { connect as connectTls } from "node:tls";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import CheckoutOrder from "../Modals/CheckoutOrder.js";
import { findPlan } from "./plans.js";

const localFromAddress = "receipts@yourtube.local";

function smtpSettings(localFrom = localFromAddress) {
  if (!process.env.SMTP_HOST) return { host: "127.0.0.1", port: Number(process.env.MAILPIT_SMTP_PORT || 1025), from: localFrom, mode: "local" };
  return { host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), from: process.env.SMTP_FROM,
    user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD,
    mode: process.env.SMTP_SECURE === "true" ? "implicit-tls" : "starttls" };
}

function invoiceDetails(order) {
  const complete = Boolean(process.env.INVOICE_SELLER_NAME && process.env.INVOICE_SELLER_ADDRESS && process.env.INVOICE_SELLER_GSTIN);
  const rate = Number(process.env.INVOICE_TAX_RATE_PERCENT);
  const taxable = complete && process.env.INVOICE_TAX_RATE_PERCENT !== undefined && process.env.INVOICE_TAX_RATE_PERCENT !== "" && Number.isFinite(rate) && rate >= 0 && rate <= 100;
  const taxPaise = taxable ? Math.round(order.amountPaise * rate / (100 + rate)) : null;
  return { sellerName: process.env.INVOICE_SELLER_NAME || null, sellerAddress: process.env.INVOICE_SELLER_ADDRESS || null,
    sellerGstin: process.env.INVOICE_SELLER_GSTIN || null, taxRatePercent: taxable ? rate : null,
    taxPaise, subtotalPaise: taxPaise === null ? null : order.amountPaise - taxPaise };
}

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
    deliveryMode: smtpSettings().mode === "local" ? "local inbox" : "configured SMTP",
    supportEmail: process.env.SUPPORT_EMAIL || "support@yourtube.local",
    provider: order.provider || "local",
    ...invoiceDetails(order),
    notice: order.provider === "razorpay" ? "Razorpay Test transaction. No real money was charged. This test document is not a valid tax invoice." : "Local simulation only. No money was charged. This is not a tax invoice.",
  };
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function invoiceHtml(order, user) {
  const receipt = publicReceipt(order, user);
  const money = (paise) => `₹${(paise / 100).toFixed(2)}`;
  const date = (value) => value ? new Date(value).toISOString().slice(0, 10) : "—";
  const rows = [
    ["Reference", receipt.reference], ["Payment provider", receipt.provider === "razorpay" ? "Razorpay Test" : "Local simulation"],
    ["Transaction ID", receipt.paymentId], ["Customer", `${user.name} <${receipt.recipient}>`],
    ["Plan", `${receipt.planName} (${receipt.billingCycle})`], ["Term starts", date(receipt.termStartsAt)], ["Term ends", date(receipt.termExpiresAt)],
    ["Subtotal", receipt.subtotalPaise === null ? "—" : money(receipt.subtotalPaise)],
    ["Tax", receipt.taxPaise === null ? "Not configured" : `${money(receipt.taxPaise)} (${receipt.taxRatePercent}%, included)`],
    ["Total", money(receipt.amountPaise)], ["Support", receipt.supportEmail],
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test invoice ${escapeHtml(receipt.reference)}</title><style>body{font:16px system-ui,sans-serif;color:#111;max-width:760px;margin:40px auto;padding:0 24px}h1{margin-bottom:4px}p{line-height:1.5}table{width:100%;border-collapse:collapse;margin:30px 0}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th{width:32%}.notice{padding:16px;background:#fff0ec;border-radius:10px}.seller{margin-top:20px}@media print{body{margin:0;max-width:none}}</style></head><body><h1>YourTube test invoice</h1><p>Issued ${date(receipt.paidAt)} · ${escapeHtml(receipt.reference)}</p><p class="seller"><strong>${escapeHtml(receipt.sellerName || "Seller details not configured")}</strong><br>${escapeHtml(receipt.sellerAddress || "")}${receipt.sellerGstin ? `<br>GSTIN ${escapeHtml(receipt.sellerGstin)}` : ""}</p><table>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table><p class="notice">${escapeHtml(receipt.notice)}</p><p>Use your browser's Print command to save this document as a PDF.</p></body></html>`;
}

function receiptText(order, user) {
  const receipt = publicReceipt(order, user);
  return [
    "YourTube test payment receipt and invoice details",
    "",
    `Hello ${user.name},`,
    `Your ${receipt.intent} test payment was verified. No real money was charged.`,
    "",
    `Plan: ${receipt.planName} (${receipt.billingCycle})`,
    `Illustrative amount: INR ${(receipt.amountPaise / 100).toFixed(2)}`,
    `Reference: ${receipt.reference}`,
    `Order ID: ${receipt.orderId}`,
    `Test payment ID: ${receipt.paymentId}`,
    `Term starts: ${receipt.termStartsAt ? new Date(receipt.termStartsAt).toISOString() : "Earlier prototype order"}`,
    `Term ends: ${receipt.termExpiresAt ? new Date(receipt.termExpiresAt).toISOString() : "See membership page"}`,
    `Seller: ${receipt.sellerName || "Configure INVOICE_SELLER_NAME"}`,
    `Seller address: ${receipt.sellerAddress || "Configure INVOICE_SELLER_ADDRESS"}`,
    `Seller GSTIN: ${receipt.sellerGstin || "Configure INVOICE_SELLER_GSTIN"}`,
    ...(receipt.taxPaise === null ? [] : [`Subtotal: INR ${(receipt.subtotalPaise / 100).toFixed(2)}`, `Tax (${receipt.taxRatePercent}%): INR ${(receipt.taxPaise / 100).toFixed(2)}`]),
    "",
    receipt.notice,
    `Support: ${receipt.supportEmail}`,
  ].join("\r\n");
}

export async function sendPlatformEmail(recipient, subject, body, invoice = null, localFrom = localFromAddress) {
  if (process.env.EMAIL_DELIVERY_DISABLED === "true") throw new Error("Email delivery is paused.");
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)) {
    throw new Error("Invalid email address.");
  }
  if (typeof subject !== "string" || !subject || /[\r\n]/.test(subject)) throw new Error("Invalid email subject.");
  const config = smtpSettings(localFrom);
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535 || !config.from || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(config.from)) throw new Error("Invalid SMTP configuration.");
  if (config.mode !== "local" && (!config.user || !config.password)) throw new Error("SMTP credentials are incomplete.");
  let socket = config.mode === "implicit-tls" ? connectTls({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true }) : createConnection({ host: config.host, port: config.port });
  socket.setTimeout(10_000, () => socket.destroy(new Error("SMTP timed out.")));
  socket.on("error", () => {});
  let lines = createInterface({ input: socket, crlfDelay: Infinity });
  let iterator = lines[Symbol.asyncIterator]();
  let completed = false;

  async function expect(codes) {
    while (true) {
      const { value, done } = await iterator.next();
      if (done || !/^\d{3}[ -]/.test(value)) throw new Error("SMTP connection closed unexpectedly.");
      const code = Number(value.slice(0, 3));
      if (!codes.includes(code)) throw new Error(`SMTP rejected the message (${code}).`);
      if (value[3] === " ") return;
    }
  }

  try {
    await once(socket, config.mode === "implicit-tls" ? "secureConnect" : "connect");
    await expect([220]);
    socket.write("EHLO yourtube.local\r\n");
    await expect([250]);
    if (config.mode === "starttls") {
      socket.write("STARTTLS\r\n");
      await expect([220]);
      lines.close();
      socket = connectTls({ socket, servername: config.host, rejectUnauthorized: true });
      socket.setTimeout(10_000, () => socket.destroy(new Error("SMTP timed out.")));
      socket.on("error", () => {});
      await once(socket, "secureConnect");
      lines = createInterface({ input: socket, crlfDelay: Infinity });
      iterator = lines[Symbol.asyncIterator]();
      socket.write("EHLO yourtube.local\r\n");
      await expect([250]);
    }
    if (config.user) {
      socket.write(`AUTH PLAIN ${Buffer.from(`\0${config.user}\0${config.password}`).toString("base64")}\r\n`);
      await expect([235]);
    }
    socket.write(`MAIL FROM:<${config.from}>\r\n`);
    await expect([250]);
    socket.write(`RCPT TO:<${recipient}>\r\n`);
    await expect([250, 251]);
    socket.write("DATA\r\n");
    await expect([354]);
    const headers = [`From: YourTube <${config.from}>`, `To: <${recipient}>`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0"];
    let message;
    if (invoice === null) {
      message = [...headers, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", body].join("\r\n");
    } else {
      const boundary = `yourtube-${randomBytes(12).toString("hex")}`;
      const encodedInvoice = Buffer.from(invoice, "utf8").toString("base64").match(/.{1,76}/g).join("\r\n");
      message = [
        ...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
        `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", body,
        `--${boundary}`, 'Content-Type: text/html; name="YourTube-test-invoice.html"',
        "Content-Transfer-Encoding: base64", 'Content-Disposition: attachment; filename="YourTube-test-invoice.html"',
        "", encodedInvoice, `--${boundary}--`, "",
      ].join("\r\n");
    }
    const safeMessage = message.replace(/\r\n\./g, "\r\n..");
    socket.write(`${safeMessage}\r\n.\r\n`);
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
    await sendPlatformEmail(user.email, `YourTube test receipt ${claimed.invoiceNumber}`, receiptText(claimed, user), invoiceHtml(claimed, user));
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
