export const SUBSCRIPTION_UPDATED_EVENT = "vidcircle:subscription-updated";

export function announceSubscriptionUpdated() {
  window.dispatchEvent(new Event(SUBSCRIPTION_UPDATED_EVENT));
}
