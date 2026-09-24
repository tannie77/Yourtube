export type BillingCycleId = "monthly" | "quarterly" | "yearly";

export type Plan = {
  id: "free" | "bronze" | "silver" | "gold";
  name: string;
  summary: string;
  pricesPaise: Record<BillingCycleId, number>;
  features: {
    maxQuality: string;
    dailyWatchMinutes: number | null;
    dailyDownloads: number;
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
};

export type SubscriptionSnapshot = {
  userId: string;
  effectivePlanId: Plan["id"];
  status: "free" | "active" | "expired";
  billingCycle: BillingCycleId | null;
  startedAt: string | null;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
  autoRenew: false;
};

export type SimulatedResult = {
  outcome: "success" | "failure" | "cancel";
  paymentId: string;
  signature: string;
};

export type CheckoutOrder = {
  orderId: string;
  planId: Exclude<Plan["id"], "free">;
  billingCycle: BillingCycleId;
  amountPaise: number;
  currency: "INR";
  status: "pending" | "processing" | "paid" | "failed" | "cancelled";
  createdAt: string;
  paidAt: string | null;
  paymentId: string | null;
  invoiceNumber: string | null;
  failureReason: string | null;
  simulatedResult: SimulatedResult | null;
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
