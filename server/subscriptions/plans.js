export const billingCycles = [
  { id: "monthly", label: "Monthly", validityDays: 30 },
  { id: "quarterly", label: "Quarterly", validityDays: 90 },
  { id: "yearly", label: "Yearly", validityDays: 365 },
];

// Sample INR prices in paise for the local prototype; no money is collected yet.
export const plans = [
  {
    id: "free",
    name: "Free",
    summary: "Get started with the essentials.",
    pricesPaise: { monthly: 0, quarterly: 0, yearly: 0 },
    features: {
      maxQuality: "480p",
      dailyWatchMinutes: 60,
      dailyDownloads: 1,
      premiumAccess: "Selected previews",
      earlyAccess: false,
      exclusiveCourses: false,
      adFree: false,
    },
  },
  {
    id: "bronze",
    name: "Bronze",
    summary: "More room for everyday watching.",
    pricesPaise: { monthly: 9900, quarterly: 26900, yearly: 99900 },
    features: {
      maxQuality: "720p",
      dailyWatchMinutes: 180,
      dailyDownloads: 3,
      premiumAccess: "Selected videos",
      earlyAccess: false,
      exclusiveCourses: false,
      adFree: false,
    },
  },
  {
    id: "silver",
    name: "Silver",
    summary: "The full library, with fewer limits.",
    pricesPaise: { monthly: 19900, quarterly: 54900, yearly: 199900 },
    features: {
      maxQuality: "1080p",
      dailyWatchMinutes: 360,
      dailyDownloads: 10,
      premiumAccess: "All premium videos",
      earlyAccess: false,
      exclusiveCourses: false,
      adFree: true,
    },
  },
  {
    id: "gold",
    name: "Gold",
    summary: "Everything VidCircle has to offer.",
    pricesPaise: { monthly: 29900, quarterly: 82900, yearly: 299900 },
    features: {
      maxQuality: "4K",
      dailyWatchMinutes: null,
      dailyDownloads: 25,
      premiumAccess: "All premium videos",
      earlyAccess: true,
      exclusiveCourses: true,
      adFree: true,
    },
  },
];

export const planIds = plans.map((plan) => plan.id);
export const paidPlanIds = planIds.filter((id) => id !== "free");

export function findPlan(id) {
  return plans.find((plan) => plan.id === id) || null;
}
