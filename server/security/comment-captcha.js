const verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfigured() {
  return Boolean(process.env.TURNSTILE_SITE_KEY?.trim() && process.env.TURNSTILE_SECRET_KEY?.trim());
}

export async function verifyTurnstile(token, remoteAddress) {
  if (!turnstileConfigured() || typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
  if (typeof remoteAddress === "string" && remoteAddress.length < 80) form.set("remoteip", remoteAddress);
  try {
    const response = await fetch(verifyUrl, { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("Comment verification unavailable:", error);
    return false;
  }
}
