import mongoose from "mongoose";

const schema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  eventName: { type: String, required: true },
  processedAt: { type: Date, default: Date.now },
});

export default mongoose.model("razorpayWebhookEvent", schema);
