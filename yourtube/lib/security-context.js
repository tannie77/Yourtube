const DEVICE_KEY = "vidcircle_device_id";
const LOCATION_KEY = "vidcircle_test_location";

export function getOrCreateDeviceId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return "";
  }
}

export function getLocalTestLocation() {
  if (typeof window === "undefined") return { testCity: "", testState: "" };
  try {
    const value = JSON.parse(window.localStorage.getItem(LOCATION_KEY) || "{}");
    return {
      testCity: typeof value.testCity === "string" ? value.testCity : "",
      testState: typeof value.testState === "string" ? value.testState : "",
    };
  } catch {
    return { testCity: "", testState: "" };
  }
}

export function saveLocalTestLocation(testCity, testState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCATION_KEY, JSON.stringify({ testCity: testCity.trim(), testState: testState.trim() }));
  } catch {
    // The sign-in still works when local storage is unavailable.
  }
}
