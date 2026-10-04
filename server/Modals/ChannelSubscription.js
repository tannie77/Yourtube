import mongoose from "mongoose";

const channelSubscriptionSchema = new mongoose.Schema({
  subscriber: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
}, { timestamps: true });

channelSubscriptionSchema.index({ subscriber: 1, channel: 1 }, { unique: true });
channelSubscriptionSchema.index({ channel: 1 });

export default mongoose.model("channelSubscription", channelSubscriptionSchema);
