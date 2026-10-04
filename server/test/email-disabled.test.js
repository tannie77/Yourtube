import assert from "node:assert/strict";
import { test } from "node:test";
import { sendPlatformEmail } from "../subscriptions/receipts.js";

test("paused email delivery rejects an outbound message before opening SMTP", async () => {
  const previous = process.env.EMAIL_DELIVERY_DISABLED;
  process.env.EMAIL_DELIVERY_DISABLED = "true";
  try {
    await assert.rejects(sendPlatformEmail("recipient@example.test", "A test", "No message should leave."), /Email delivery is paused/);
  } finally {
    if (previous === undefined) delete process.env.EMAIL_DELIVERY_DISABLED;
    else process.env.EMAIL_DELIVERY_DISABLED = previous;
  }
});
