"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, CircleCheck, CircleX, Clock3, CreditCard, Crown, Download, Mail, Play, RotateCcw, ShieldCheck, Sparkles, Tv2 } from "lucide-react";
import WorkspaceTopbar from "@/components/workspace-topbar";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";
import {
  formatRupees,
  formatWatchLimit,
  type BillingCycleId,
  type CheckoutOrder,
  type Plan,
  type PlanCatalogue,
  type SimulatedResult,
  type SubscriptionSnapshot,
  type TestReceipt,
} from "@/lib/subscriptions";
import styles from "./subscriptions.module.css";

type LoadState = "loading" | "ready" | "error";
type PaidPlanId = Exclude<Plan["id"], "free">;
type CheckoutSelection = { planId: PaidPlanId; billingCycle: BillingCycleId };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return fallback;
}

const outcomeButtons = [
  { outcome: "success", label: "Simulate success", icon: CircleCheck },
  { outcome: "failure", label: "Simulate failure", icon: CircleX },
  { outcome: "cancel", label: "Cancel test payment", icon: RotateCcw },
] as const;

const intentLabel = {
  purchase: "New membership",
  renewal: "Renewal",
  upgrade: "Upgrade",
  downgrade: "Scheduled downgrade",
};

const comparisonRows: { label: string; value: (plan: Plan) => string }[] = [
  { label: "Maximum source resolution", value: (plan) => plan.features.maxQuality },
  { label: "Daily clip allowance", value: (plan) => formatWatchLimit(plan.features.dailyWatchMinutes) },
  { label: "Daily downloads", value: (plan) => String(plan.features.dailyDownloads) },
  { label: "Premium videos", value: (plan) => plan.features.premiumAccess },
  { label: "Early access", value: (plan) => plan.features.earlyAccess ? "Included" : "—" },
  { label: "Exclusive courses", value: (plan) => plan.features.exclusiveCourses ? "Included" : "—" },
  { label: "Ad-free viewing", value: (plan) => plan.features.adFree ? "Included" : "—" },
];

function PlanIcon({ id }: { id: Plan["id"] }) {
  if (id === "gold") return <Crown className="size-5" aria-hidden="true" />;
  if (id === "silver") return <Sparkles className="size-5" aria-hidden="true" />;
  if (id === "bronze") return <Play className="size-5" aria-hidden="true" />;
  return <Tv2 className="size-5" aria-hidden="true" />;
}

export default function SubscriptionsPage() {
  const { user } = useUser();
  const [catalogue, setCatalogue] = useState<PlanCatalogue | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [orders, setOrders] = useState<CheckoutOrder[]>([]);
  const [billingCycle, setBillingCycle] = useState<BillingCycleId>("monthly");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selection, setSelection] = useState<CheckoutSelection | null>(null);
  const [checkoutOrder, setCheckoutOrder] = useState<CheckoutOrder | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TestReceipt | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const checkoutKey = useRef<string | null>(null);

  const reload = useCallback(() => {
    setLoadState("loading");
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      axiosInstance.get<PlanCatalogue>("/subscriptions/plans"),
      axiosInstance.get<SubscriptionSnapshot>("/subscriptions/me"),
      axiosInstance.get<{ orders: CheckoutOrder[] }>("/subscriptions/orders"),
    ]).then(([plansResponse, currentResponse, ordersResponse]) => {
      if (!active) return;
      setCatalogue(plansResponse.data);
      setSubscription(currentResponse.data);
      setOrders(ordersResponse.data.orders);
      setLoadState("ready");
    }).catch(() => {
      if (active) setLoadState("error");
    });
    return () => { active = false; };
  }, [refreshKey]);

  const refreshMembership = async () => {
    const [currentResponse, ordersResponse] = await Promise.all([
      axiosInstance.get<SubscriptionSnapshot>("/subscriptions/me"),
      axiosInstance.get<{ orders: CheckoutOrder[] }>("/subscriptions/orders"),
    ]);
    setSubscription(currentResponse.data);
    setOrders(ordersResponse.data.orders);
  };

  const viewReceipt = async (order: CheckoutOrder) => {
    setReceiptError(null);
    try {
      const response = await axiosInstance.get<{ receipt: TestReceipt }>(`/subscriptions/orders/${order.orderId}/receipt`);
      setReceipt(response.data.receipt);
    } catch (error) {
      setReceiptError(errorMessage(error, "Could not load the local test receipt."));
    }
  };

  const resendReceipt = async () => {
    if (!receipt || receiptBusy) return;
    setReceiptBusy(true);
    setReceiptError(null);
    try {
      const response = await axiosInstance.post<{ receipt: TestReceipt }>(`/subscriptions/orders/${receipt.orderId}/receipt/send`);
      setReceipt(response.data.receipt);
      await refreshMembership();
    } catch (error) {
      setReceiptError(errorMessage(error, "Could not retry local inbox delivery."));
    } finally {
      setReceiptBusy(false);
    }
  };

  const cancelAtTermEnd = async () => {
    if (accountBusy || subscription?.status !== "active") return;
    setAccountBusy(true);
    setAccountMessage(null);
    try {
      const response = await axiosInstance.post<SubscriptionSnapshot>("/subscriptions/me/cancel");
      setSubscription(response.data);
      setAccountMessage("Cancellation scheduled. Your prepaid access stays available until the shown end date.");
    } catch (error) {
      setAccountMessage(errorMessage(error, "Could not schedule cancellation."));
    } finally {
      setAccountBusy(false);
    }
  };

  const choosePlan = (planId: PaidPlanId, cycle: BillingCycleId) => {
    setSelection({ planId, billingCycle: cycle });
    setCheckoutOrder(null);
    setCheckoutError(null);
    checkoutKey.current = null;
    requestAnimationFrame(() => document.getElementById("local-checkout")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const beginCheckout = async () => {
    if (!selection || checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    checkoutKey.current ||= crypto.randomUUID();
    try {
      const response = await axiosInstance.post<{ order: CheckoutOrder }>("/subscriptions/orders", {
        ...selection,
        idempotencyKey: checkoutKey.current,
      });
      setCheckoutOrder(response.data.order);
      await refreshMembership();
    } catch (error) {
      setCheckoutError(errorMessage(error, "Could not create the local test order. Retry safely."));
    } finally {
      setCheckoutBusy(false);
    }
  };

  const verifyCheckout = async (order: CheckoutOrder, result: SimulatedResult) => {
    const response = await axiosInstance.post<{ order: CheckoutOrder }>(`/subscriptions/orders/${order.orderId}/verify`, result);
    setCheckoutOrder(response.data.order);
    await refreshMembership();
    if (response.data.order.status === "paid") await viewReceipt(response.data.order);
  };

  const simulateCheckout = async (outcome: SimulatedResult["outcome"]) => {
    if (!checkoutOrder || checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const response = await axiosInstance.post<{ order: CheckoutOrder; result: SimulatedResult }>(
        `/subscriptions/orders/${checkoutOrder.orderId}/simulate`, { outcome },
      );
      setCheckoutOrder(response.data.order);
      await verifyCheckout(response.data.order, response.data.result);
    } catch (error) {
      setCheckoutError(errorMessage(error, "Could not complete the test result. Retry verification below."));
    } finally {
      setCheckoutBusy(false);
    }
  };

  const retryVerification = async () => {
    if (!checkoutOrder?.simulatedResult || checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      await verifyCheckout(checkoutOrder, checkoutOrder.simulatedResult);
    } catch (error) {
      setCheckoutError(errorMessage(error, "Verification did not finish. The same result can be retried safely."));
    } finally {
      setCheckoutBusy(false);
    }
  };

  const resumeOrder = (order: CheckoutOrder) => {
    setSelection({ planId: order.planId, billingCycle: order.billingCycle });
    setCheckoutOrder(order);
    setCheckoutError(null);
    requestAnimationFrame(() => document.getElementById("local-checkout")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const activePlan = catalogue?.plans.find((plan) => plan.id === subscription?.effectivePlanId);
  const activeCycle = catalogue?.billingCycles.find((cycle) => cycle.id === billingCycle);
  const expiry = subscription?.expiresAt
    ? formatDate(subscription.expiresAt)
    : null;
  const selectedPlan = catalogue?.plans.find((plan) => plan.id === selection?.planId);
  const selectedCycle = catalogue?.billingCycles.find((cycle) => cycle.id === selection?.billingCycle);
  const scheduledPlan = catalogue?.plans.find((plan) => plan.id === subscription?.scheduledChange?.planId);
  const currentRank = catalogue?.plans.findIndex((plan) => plan.id === subscription?.effectivePlanId) ?? 0;
  const selectedRank = catalogue?.plans.findIndex((plan) => plan.id === selection?.planId) ?? 0;
  const selectedIntent = subscription?.status !== "active" ? "purchase" :
    selectedRank === currentRank ? "renewal" : selectedRank > currentRank ? "upgrade" : "downgrade";
  const effectiveIntent: CheckoutOrder["intent"] = checkoutOrder?.intent || selectedIntent;
  const accessEnd = subscription?.accessEndsAt ? formatDate(subscription.accessEndsAt) : null;

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#172033]">
      <WorkspaceTopbar section="Membership" />
      <div className="mx-auto max-w-[1510px] px-5 pb-20 pt-7 sm:px-8 lg:px-10 lg:pt-10">
        <section className={`${styles.hero} relative overflow-hidden rounded-[30px] px-7 py-9 text-white sm:px-10 sm:py-11 lg:px-14`}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className="relative z-10 flex flex-col gap-9 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-[610px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffded4]">
                <span className="size-1.5 rounded-full bg-[#ffae98]" /> Build 2 · Membership
              </span>
              <h1 className="mt-6 text-[clamp(2.2rem,4vw,3.7rem)] font-semibold leading-[1.08] tracking-[-0.065em]">
                A plan for every <span className="text-[#ffb39f]">way to watch.</span>
              </h1>
              <p className="mt-4 max-w-[510px] text-sm leading-7 text-[#d7ddea] sm:text-base">
                Compare sample memberships, then try a local checkout. Every result is simulated; no card details or real money are involved.
              </p>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[#d9deea]">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-[#ffad97]" aria-hidden="true" /> No real payments</span>
                <span className="inline-flex items-center gap-2"><BadgeCheck className="size-4 text-[#ffad97]" aria-hidden="true" /> Prices in INR</span>
              </div>
            </div>

            <div className="w-full max-w-[350px] shrink-0 rounded-[24px] border border-white/20 bg-white/10 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.14)] backdrop-blur-md sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#d4d9e6]">Your membership</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.05em]">{loadState === "ready" ? `${activePlan?.name || "Free"} plan` : "Checking plan…"}</p>
                </div>
                <span className="flex size-11 items-center justify-center rounded-2xl bg-white/15 text-[#ffd2c4]"><Crown className="size-5" aria-hidden="true" /></span>
              </div>
              <div className="my-5 h-px bg-white/15" />
              <p className="text-sm text-[#e4e7ef]">
                {loadState !== "ready" ? "Loading your local account status." :
                  subscription?.status === "expired" ? "Your previous term expired. Free benefits are active." :
                  subscription?.cancelAtPeriodEnd && accessEnd ? `Cancellation scheduled · access ends ${accessEnd}.` :
                  subscription?.scheduledChange && expiry ? `${activePlan?.name} until ${expiry}; ${scheduledPlan?.name || subscription.scheduledChange.planId} starts next.` :
                  expiry ? `${subscription?.remainingDays} days remaining · until ${expiry}` : "Free is active with no expiry date."}
              </p>
              <p className="mt-4 truncate text-xs text-[#bfc6d7]">Signed in as {user?.email || "your local account"}</p>
            </div>
          </div>
        </section>

        {loadState === "loading" && (
          <div className="mt-9 grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading plans">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-[380px] animate-pulse rounded-[26px] bg-[#e8ebf0]" />)}
          </div>
        )}

        {loadState === "error" && (
          <section className="mt-9 rounded-[26px] border border-[#f1d3cc] bg-[#fff8f5] px-6 py-12 text-center">
            <h2 className="text-lg font-semibold">Could not load your membership</h2>
            <p className="mt-2 text-sm text-[#806d69]">Check that the local API is running, then try again.</p>
            <button type="button" className="mt-5 rounded-xl bg-[#ed6049] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#dd533d]" onClick={reload}>Retry</button>
          </section>
        )}

        {loadState === "ready" && catalogue && subscription && (
          <>
            <section className="mt-10" aria-labelledby="plan-heading">
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55]">Choose what suits you</p>
                  <h2 id="plan-heading" className="mt-1 text-2xl font-semibold tracking-[-0.05em] sm:text-[28px]">Compare memberships</h2>
                  <p className="mt-1.5 text-sm text-[#7a8494]">Sample prices and local-demo benefits. Downloads and exclusive courses are later builds.</p>
                </div>
                <div role="group" aria-label="Billing period" className="inline-flex self-start rounded-2xl border border-[#e7eaf0] bg-white p-1.5 shadow-[0_6px_18px_rgba(23,32,51,0.04)]">
                  {catalogue.billingCycles.map((cycle) => (
                    <button key={cycle.id} type="button" aria-pressed={billingCycle === cycle.id} className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${billingCycle === cycle.id ? "bg-[#172033] text-white shadow-sm" : "text-[#738095] hover:bg-[#f5f6f9] hover:text-[#172033]"}`} onClick={() => setBillingCycle(cycle.id)}>{cycle.label}</button>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {catalogue.plans.map((plan) => {
                  const isCurrent = subscription.effectivePlanId === plan.id;
                  const isFeatured = plan.id === "silver";
                  return (
                    <article key={plan.id} className={`${styles.planCard} ${isFeatured ? styles.featuredCard : ""} flex flex-col rounded-[26px] border p-6 sm:p-7`}>
                      <div className="flex items-start justify-between gap-3">
                        <span className={`${styles.planIcon} ${plan.id === "free" ? "" : styles[`icon${plan.name}`]} flex size-11 items-center justify-center rounded-2xl`}><PlanIcon id={plan.id} /></span>
                        {isCurrent ? <span className="rounded-full bg-[#e8f5ee] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#308262]">Current plan</span> :
                          isFeatured ? <span className="rounded-full bg-[#fff0ec] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#d45f49]">Most popular</span> : null}
                      </div>
                      <h3 className="mt-6 text-[23px] font-semibold tracking-[-0.05em]">{plan.name}</h3>
                      <p className="mt-1 min-h-10 text-sm leading-5 text-[#7b8494]">{plan.summary}</p>
                      <div className="mt-5 flex items-baseline gap-1">
                        <span className="text-[32px] font-semibold tracking-[-0.065em]">{formatRupees(plan.pricesPaise[billingCycle])}</span>
                        <span className="text-xs text-[#8a93a2]">{plan.id === "free" ? "forever" : billingCycle === "monthly" ? "/mo" : billingCycle === "quarterly" ? "/quarter" : "/year"}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#8a93a2]">{plan.id === "free" ? "Always available" : `${activeCycle?.validityDays} days of access · one-time term`}</p>
                      <div className="my-6 h-px bg-[#edf0f4]" />
                      <ul className="flex-1 space-y-3.5 text-sm text-[#586579]">
                        <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-[#df705a]" aria-hidden="true" /> Up to {plan.features.maxQuality} video</li>
                        <li className="flex gap-2.5"><Clock3 className="mt-0.5 size-4 shrink-0 text-[#df705a]" aria-hidden="true" /> {formatWatchLimit(plan.features.dailyWatchMinutes)}</li>
                        <li className="flex gap-2.5"><Download className="mt-0.5 size-4 shrink-0 text-[#df705a]" aria-hidden="true" /> {plan.features.dailyDownloads} {plan.features.dailyDownloads === 1 ? "download" : "downloads"} / day</li>
                        <li className="flex gap-2.5"><Sparkles className="mt-0.5 size-4 shrink-0 text-[#df705a]" aria-hidden="true" /> {plan.features.premiumAccess}</li>
                      </ul>
                      {plan.id === "free" ? (
                        <div className="mt-8 flex h-11 items-center justify-center rounded-xl border border-[#dce8e1] bg-[#f4faf6] text-sm font-semibold text-[#418064]">{isCurrent ? "Your current plan" : "Available after expiry"}</div>
                      ) : subscription.scheduledChange ? (
                        <div className="mt-8 flex h-11 items-center justify-center rounded-xl border border-dashed border-[#d8dde5] bg-[#f8f9fb] text-sm font-semibold text-[#7e899b]">Change already scheduled</div>
                      ) : (
                        <button type="button" className="mt-8 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ed6049] text-sm font-semibold text-white transition hover:bg-[#d9503a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed6049]" onClick={() => choosePlan(plan.id as PaidPlanId, billingCycle)}>
                          {subscription.status !== "active" ? "Try local checkout" : isCurrent ? "Renew plan" : catalogue.plans.findIndex((item) => item.id === plan.id) > currentRank ? "Upgrade plan" : "Schedule downgrade"} <ArrowRight className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
              <p className="mt-4 text-xs leading-5 text-[#8790a0]">{catalogue.pricingNote} Source-resolution access, a once-per-video daily clip allowance, Gold early access and a local ad placeholder work now. Selectable video quality, exact playback-time metering, downloads and courses are later builds.</p>
            </section>

            {subscription.status === "active" && (
              <section className="mt-8 flex flex-col gap-5 rounded-[24px] border border-[#e5e9ef] bg-white p-6 shadow-[0_8px_24px_rgba(23,32,51,0.025)] sm:flex-row sm:items-center sm:justify-between sm:p-7" aria-label="Manage current term">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55]">Current term</p>
                  <h2 className="mt-1 text-lg font-semibold text-[#263148]">{activePlan?.name} · {subscription.remainingDays} days remaining</h2>
                  <p className="mt-1.5 text-sm leading-6 text-[#768295]">
                    {subscription.scheduledChange
                      ? `${scheduledPlan?.name || subscription.scheduledChange.planId} begins ${formatDate(subscription.scheduledChange.startsAt)} and runs until ${formatDate(subscription.scheduledChange.expiresAt)}.`
                      : `Current access ends ${expiry}. Renew manually; there are no automatic charges.`}
                  </p>
                  {subscription.cancelAtPeriodEnd && <p className="mt-2 text-xs font-semibold text-[#a45c4b]">Cancellation scheduled after the last prepaid term on {accessEnd}.</p>}
                  {accountMessage && <p role="status" className="mt-2 text-xs text-[#a45c4b]">{accountMessage}</p>}
                </div>
                {!subscription.cancelAtPeriodEnd && (
                  <button type="button" disabled={accountBusy} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-[#e7d8d3] bg-[#fff9f7] px-4 text-sm font-semibold text-[#a45c4b] hover:bg-[#fff0ea] disabled:opacity-50" onClick={cancelAtTermEnd}>
                    {accountBusy ? "Scheduling…" : "Cancel at term end"}
                  </button>
                )}
              </section>
            )}

            <section id="local-checkout" className="mt-11 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" aria-labelledby="checkout-heading">
              <div className="rounded-[26px] border border-[#e7eaf0] bg-white p-6 shadow-[0_8px_26px_rgba(23,32,51,0.035)] sm:p-8">
                <div className="flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff0ec] text-[#de6b54]"><CreditCard className="size-5" aria-hidden="true" /></span>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55]">Safe local demo</p>
                    <h2 id="checkout-heading" className="mt-1 text-2xl font-semibold tracking-[-0.05em]">Test checkout</h2>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-6 text-[#6e798b]">Buy, renew or change a paid plan with a server-priced test order. Choose a simulated result; no payment provider is contacted.</p>
                {selection && selectedPlan ? (
                  <div className="mt-6 rounded-2xl border border-[#e9ecf1] bg-[#fafbfc] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a94a3]">Selected membership</p>
                        <p className="mt-1 text-lg font-semibold text-[#253047]">{selectedPlan.name} · {selectedCycle?.label}</p>
                        <p className="mt-1 text-xs text-[#828d9e]">{selectedCycle?.validityDays} days · one-time local term</p>
                        <p className="mt-2 text-xs font-semibold text-[#bc6956]">{intentLabel[effectiveIntent]}: {effectiveIntent === "renewal" ? "extends from current expiry" : effectiveIntent === "downgrade" ? "prepaid term starts after current expiry" : effectiveIntent === "upgrade" ? "starts now; unused time is not prorated" : "starts after verified test success"}.</p>
                      </div>
                      <p className="text-xl font-semibold text-[#253047]">{formatRupees(selectedPlan.pricesPaise[selection.billingCycle])}</p>
                    </div>
                    {!checkoutOrder ? (
                      <button type="button" disabled={checkoutBusy || Boolean(subscription.scheduledChange)} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#172033] px-5 text-sm font-semibold text-white hover:bg-[#2a3650] disabled:cursor-not-allowed disabled:opacity-50" onClick={beginCheckout}>
                        {checkoutBusy ? "Creating order…" : "Create local test order"} <ArrowRight className="size-4" aria-hidden="true" />
                      </button>
                    ) : (
                      <div className="mt-5 border-t border-[#e6e9ee] pt-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`${styles.statusBadge} ${styles[`status${checkoutOrder.status}`]}`}>{checkoutOrder.status}</span>
                          <span className="text-xs text-[#8993a2]">Order {checkoutOrder.orderId.slice(-8).toUpperCase()}</span>
                        </div>
                        {checkoutOrder.status === "pending" && !checkoutOrder.simulatedResult && (
                          <div className="mt-4 flex flex-wrap gap-2.5" aria-label="Choose local payment outcome">
                            {outcomeButtons.map(({ outcome, label, icon: Icon }) => (
                              <button key={outcome} type="button" disabled={checkoutBusy} className={`${styles.outcomeButton} ${outcome === "success" ? styles.successButton : ""}`} onClick={() => simulateCheckout(outcome)}>
                                <Icon className="size-4" aria-hidden="true" /> {checkoutBusy ? "Processing…" : label}
                              </button>
                            ))}
                          </div>
                        )}
                        {(checkoutOrder.status === "pending" || checkoutOrder.status === "processing") && checkoutOrder.simulatedResult && (
                          <div className="mt-4">
                            <p className="text-sm text-[#657186]">A {checkoutOrder.simulatedResult.outcome} result was issued. Verify the same result to finish this order.</p>
                            <button type="button" disabled={checkoutBusy} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#172033] px-5 text-sm font-semibold text-white hover:bg-[#2a3650] disabled:opacity-50" onClick={retryVerification}>
                              <RotateCcw className="size-4" aria-hidden="true" /> {checkoutBusy ? "Verifying…" : "Retry verification"}
                            </button>
                          </div>
                        )}
                        {checkoutOrder.status === "paid" && <p className="mt-4 text-sm font-medium text-[#2f8060]">Local result verified. {checkoutOrder.intent === "downgrade" ? `${selectedPlan.name} starts ${checkoutOrder.termStartsAt ? formatDate(checkoutOrder.termStartsAt) : "at the end of your term"}.` : checkoutOrder.intent === "renewal" ? `Access extended until ${checkoutOrder.termExpiresAt ? formatDate(checkoutOrder.termExpiresAt) : "your new expiry"}.` : `${selectedPlan.name} is active now.`}</p>}
                        {checkoutOrder.status === "failed" && <p className="mt-4 text-sm font-medium text-[#a75b4c]">Test payment failed. Your membership was not changed.</p>}
                        {checkoutOrder.status === "cancelled" && <p className="mt-4 text-sm font-medium text-[#68758a]">Test payment cancelled. Your membership was not changed.</p>}
                        {(checkoutOrder.status === "failed" || checkoutOrder.status === "cancelled") && !subscription.scheduledChange && (
                          <button type="button" className="mt-3 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-[#d35f49] hover:underline" onClick={() => { setCheckoutOrder(null); checkoutKey.current = null; setCheckoutError(null); }}>
                            <RotateCcw className="size-4" aria-hidden="true" /> Try another test order
                          </button>
                        )}
                        {checkoutOrder.status === "processing" && <p className="mt-3 text-xs text-[#7a8494]">The server is processing this result. A retry is safe.</p>}
                        {checkoutOrder.invoiceNumber && <p className="mt-2 text-xs text-[#7a8494]">Reference: {checkoutOrder.invoiceNumber}</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-[#dce1e9] bg-[#fafbfc] px-5 py-7 text-sm text-[#8993a2]">Select Bronze, Silver or Gold to begin.</div>
                )}
                {checkoutError && <p role="alert" className="mt-4 rounded-xl border border-[#f0c9be] bg-[#fff5f1] px-4 py-3 text-sm text-[#a65040]">{checkoutError}</p>}
              </div>

              <div className="rounded-[26px] border border-[#e7eaf0] bg-white p-6 shadow-[0_8px_26px_rgba(23,32,51,0.035)] sm:p-8">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55]">Your account</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em]">Payment history</h2>
                  </div>
                  <span className="rounded-full bg-[#f2f4f8] px-3 py-1 text-xs font-semibold text-[#707d90]">Local only</span>
                </div>
                {orders.length === 0 ? (
                  <p className="mt-6 rounded-2xl bg-[#fafbfc] px-5 py-8 text-sm text-[#8993a2]">Your local test orders will appear here.</p>
                ) : (
                  <ol className="mt-5 max-h-[430px] space-y-3 overflow-y-auto pr-1">
                    {orders.map((order) => (
                      <li key={order.orderId} className="rounded-2xl border border-[#edf0f3] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold capitalize text-[#2b3549]">{order.planId} · {order.billingCycle}</p>
                            <p className="mt-0.5 text-xs font-medium text-[#bc6956]">{intentLabel[order.intent]}</p>
                            <p className="mt-1 text-xs text-[#8b95a4]">{formatDate(order.createdAt)} · {order.orderId.slice(-8).toUpperCase()}</p>
                          </div>
                          <p className="text-sm font-semibold text-[#2b3549]">{formatRupees(order.amountPaise)}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <span className={`${styles.statusBadge} ${styles[`status${order.status}`]}`}>{order.status}</span>
                          {(order.status === "pending" || order.status === "processing") && <button type="button" className="text-xs font-semibold text-[#d8614c] hover:underline" onClick={() => resumeOrder(order)}>Resume test</button>}
                          {order.status === "paid" && <button type="button" className="text-xs font-semibold text-[#d8614c] hover:underline" onClick={() => viewReceipt(order)}>View test receipt</button>}
                        </div>
                        {order.invoiceNumber && <p className="mt-2 text-xs text-[#8590a0]">Reference: {order.invoiceNumber}</p>}
                        {order.status === "paid" && <p className="mt-1 text-xs text-[#8590a0]">Email: {order.receiptStatus === "sent" ? "captured by local inbox" : "waiting for local inbox"}</p>}
                      </li>
                    ))}
                  </ol>
                )}
                {receipt && (
                  <div className="mt-5 rounded-2xl border border-[#efd8d1] bg-[#fffaf7] p-5" aria-label="Local test receipt">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#bc6956]">Local test receipt</p>
                        <h3 className="mt-1 text-base font-semibold text-[#263148]">{receipt.planName} · {receipt.billingCycle}</h3>
                      </div>
                      <p className="text-lg font-semibold text-[#263148]">{formatRupees(receipt.amountPaise)}</p>
                    </div>
                    <dl className="mt-4 grid gap-2 text-xs text-[#687588] sm:grid-cols-2">
                      <div><dt className="font-semibold text-[#344056]">Reference</dt><dd className="mt-0.5 break-all">{receipt.reference}</dd></div>
                      <div><dt className="font-semibold text-[#344056]">Test payment</dt><dd className="mt-0.5 break-all">{receipt.paymentId}</dd></div>
                      <div><dt className="font-semibold text-[#344056]">Term</dt><dd className="mt-0.5">{receipt.termStartsAt && receipt.termExpiresAt ? `${formatDate(receipt.termStartsAt)} – ${formatDate(receipt.termExpiresAt)}` : "See membership status"}</dd></div>
                      <div><dt className="font-semibold text-[#344056]">Recipient</dt><dd className="mt-0.5 break-all">{receipt.recipient}</dd></div>
                    </dl>
                    <p className="mt-4 text-xs leading-5 text-[#8a776f]">{receipt.notice}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className={`${styles.statusBadge} ${receipt.emailStatus === "sent" ? styles.statuspaid : styles.statuspending}`}>{receipt.emailStatus === "sent" ? "Mailpit delivery sent" : receipt.emailStatus === "sending" ? "Sending to Mailpit" : receipt.emailStatus === "pending" ? "Waiting for local inbox" : "Mailpit unavailable"}</span>
                      {receipt.emailStatus !== "sent" && <button type="button" disabled={receiptBusy} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#d8614c] hover:underline disabled:opacity-50" onClick={resendReceipt}><Mail className="size-4" aria-hidden="true" /> {receiptBusy ? "Retrying…" : "Retry local email"}</button>}
                    </div>
                  </div>
                )}
                {receiptError && <p role="alert" className="mt-3 text-xs text-[#b45b49]">{receiptError}</p>}
              </div>
            </section>

            <section className="mt-12" aria-labelledby="features-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55]">The details</p>
                  <h2 id="features-heading" className="mt-1 text-2xl font-semibold tracking-[-0.05em]">Feature comparison</h2>
                </div>
                <span className="rounded-full bg-[#fff0ec] px-3 py-1.5 text-xs font-semibold text-[#c66450]">Planned entitlements</span>
              </div>
              <div className="mt-5 overflow-x-auto rounded-[24px] border border-[#e7eaf0] bg-white shadow-[0_8px_24px_rgba(23,32,51,0.025)]">
                <table className="w-full min-w-[710px] border-collapse text-left text-sm">
                  <thead><tr className="border-b border-[#e8ebf0] bg-[#fafbfc]">
                    <th scope="col" className="w-[27%] px-6 py-4 font-semibold text-[#687487]">Feature</th>
                    {catalogue.plans.map((plan) => <th key={plan.id} scope="col" className="px-4 py-4 font-semibold text-[#273249]">{plan.name}</th>)}
                  </tr></thead>
                  <tbody>{comparisonRows.map((row) => (
                    <tr key={row.label} className="border-b border-[#eef0f4] last:border-0">
                      <th scope="row" className="px-6 py-4 font-medium text-[#687487]">{row.label}</th>
                      {catalogue.plans.map((plan) => <td key={plan.id} className="px-4 py-4 text-[#2f3a4f]">{row.value(plan)}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>

            <section className="mt-9 grid gap-4 rounded-[24px] border border-[#e8ebf0] bg-white p-6 sm:grid-cols-[auto_1fr] sm:items-start sm:p-7">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-[#f3f0ff] text-[#7966ac]"><ShieldCheck className="size-5" aria-hidden="true" /></div>
              <div>
                <h2 className="text-base font-semibold">Simple local membership rules</h2>
                <p className="mt-1.5 max-w-[920px] text-sm leading-6 text-[#737e90]">A verified renewal extends the current expiry. Upgrades start immediately without prorating unused time. A verified downgrade is prepaid and begins at the end of the current term. Cancellation ends access after all prepaid terms. Nothing renews or charges automatically.</p>
                <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#d9644e] hover:text-[#b9513f]">Back to your dashboard <ArrowRight className="size-4" aria-hidden="true" /></Link>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
