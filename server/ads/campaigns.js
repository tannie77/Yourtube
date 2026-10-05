import AdCampaign from "../Modals/AdCampaign.js";

export function validAdDestination(value) {
  if (typeof value !== "string" || value.length > 500) return false;
  if (/^\/[a-z0-9/?=&%-]+$/i.test(value) && !value.startsWith("//")) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export async function seedHouseCampaign() {
  await AdCampaign.updateOne({ key: "house-gold" }, { $setOnInsert: {
    key: "house-gold", sponsor: "YourTube", headline: "Watch more with Gold",
    description: "Get the highest available quality, courses, and early access.",
    cta: "See Gold membership", destination: "/membership?plan=gold", active: true,
  } }, { upsert: true });
}
