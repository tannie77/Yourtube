export type BillingCycleId = "monthly" | "quarterly" | "yearly";

export type Plan = {
  id: "free" | "bronze" | "silver" | "gold";
  name: string;
  summary: string;
  pricesPaise: Record<BillingCycleId, number>;
  features: {
    maxQuality: string;
    maxPlaybackSpeed: number;
    dailyWatchMinutes: number | null;
    dailyDownloads: number;
    monthlyDownloads: number;
    premiumAccess: string;
    earlyAccess: boolean;
    exclusiveCourses: boolean;
    adFree: boolean;
  };
};

export type PlanCatalogue = {
  plans: Plan[];
  billingCycles: { id: BillingCycleId; label: string; validityDays: number }[];
  currency: "INR";
  pricingNote: string;
  razorpayTestConfigured: boolean;
  localSimulationAvailable: boolean;
  razorpayKeyId: string | null;
};

export type SubscriptionSnapshot = {
  userId: string;
  effectivePlanId: Plan["id"];
  status: "free" | "active" | "expired";
  billingCycle: BillingCycleId | null;
  startedAt: string | null;
  expiresAt: string | null;
  remainingDays: number;
  scheduledChange: {
    planId: Exclude<Plan["id"], "free">;
    billingCycle: BillingCycleId;
    startsAt: string;
    expiresAt: string;
  } | null;
  accessEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  nextRenewalAt: string | null;
  paymentProvider: "local" | "razorpay" | null;
  pendingProviderChange: { planId: Exclude<Plan["id"], "free">; billingCycle: BillingCycleId; startsAt: string | null } | null;
};

export type SimulatedResult = {
  outcome: "success" | "failure" | "cancel";
  paymentId: string;
  signature: string;
};

export type CheckoutOrder = {
  orderId: string;
  intent: "purchase" | "renewal" | "upgrade" | "downgrade";
  fromPlanId: Exclude<Plan["id"], "free"> | null;
  planId: Exclude<Plan["id"], "free">;
  billingCycle: BillingCycleId;
  amountPaise: number;
  currency: "INR";
  status: "pending" | "processing" | "paid" | "failed" | "cancelled";
  provider: "local" | "razorpay";
  razorpaySubscriptionId: string | null;
  createdAt: string;
  paidAt: string | null;
  termStartsAt: string | null;
  termExpiresAt: string | null;
  paymentId: string | null;
  invoiceNumber: string | null;
  receiptStatus: "pending" | "sending" | "sent" | "failed" | null;
  failureReason: string | null;
  simulatedResult: SimulatedResult | null;
};

export type TestReceipt = {
  reference: string;
  orderId: string;
  paymentId: string;
  recipient: string;
  planName: string;
  billingCycle: BillingCycleId;
  intent: CheckoutOrder["intent"];
  amountPaise: number;
  currency: "INR";
  paidAt: string;
  termStartsAt: string | null;
  termExpiresAt: string | null;
  emailStatus: "pending" | "sending" | "sent" | "failed";
  emailSentAt: string | null;
  notice: string;
  deliveryMode: string;
  provider: "local" | "razorpay";
  supportEmail: string;
  sellerName: string | null;
  sellerAddress: string | null;
  sellerGstin: string | null;
  taxRatePercent: number | null;
  taxPaise: number | null;
  subtotalPaise: number | null;
};

export function formatRupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function formatWatchLimit(minutes: number | null) {
  if (minutes === null) return "Unlimited";
  return `${minutes / 60} ${minutes === 60 ? "hour" : "hours"} / day`;
}
