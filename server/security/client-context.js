import { createHash } from "node:crypto";

const MAX_LOCATION_LENGTH = 80;

function cleanText(value, maxLength = MAX_LOCATION_LENGTH) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
}

function normaliseIp(value) {
  const ip = cleanText(value, 80);
  if (ip === "::1") return "127.0.0.1";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function parseBrowser(userAgent) {
  const candidates = [
    ["Edge", /Edg\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [browser, pattern] of candidates) {
    const match = pattern.exec(userAgent);
    if (match) return { browser, browserVersion: match[1] };
  }
  if (/undici/i.test(userAgent)) return { browser: "API client", browserVersion: "" };
  return { browser: "Unknown browser", browserVersion: "" };
}

function parseDevice(userAgent) {
  let os = "Unknown OS";
  const windows = /Windows NT ([\d.]+)/.exec(userAgent);
  const android = /Android\s+([\d.]+)/.exec(userAgent);
  const ios = /(?:iPhone OS|CPU OS)\s+([\d_]+)/.exec(userAgent);
  const mac = /Mac OS X\s+([\d_]+)/.exec(userAgent);
  if (windows) os = `Windows ${windows[1]}`;
  else if (android) os = `Android ${android[1]}`;
  else if (ios) os = `iOS ${ios[1].replaceAll("_", ".")}`;
  else if (mac) os = `macOS ${mac[1].replaceAll("_", ".")}`;
  else if (/Linux/i.test(userAgent)) os = "Linux";

  if (/iPhone/i.test(userAgent)) return { os, deviceType: "Phone", deviceModel: "iPhone" };
  if (/iPad/i.test(userAgent)) return { os, deviceType: "Tablet", deviceModel: "iPad" };
  if (/Android/i.test(userAgent)) {
    const model = /Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|\))/.exec(userAgent)?.[1]?.trim() || "Android device";
    return { os, deviceType: /Mobile/i.test(userAgent) ? "Phone" : "Tablet", deviceModel: model };
  }
  if (/Macintosh|Mac OS X/i.test(userAgent)) return { os, deviceType: "Computer", deviceModel: "Mac" };
  if (/Windows/i.test(userAgent)) return { os, deviceType: "Computer", deviceModel: "Windows PC" };
  if (/Linux/i.test(userAgent)) return { os, deviceType: "Computer", deviceModel: "Linux computer" };
  return { os, deviceType: "Unknown device", deviceModel: "" };
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function clientContext(request, input = {}) {
  const userAgent = cleanText(request.get("user-agent") || "", 500);
  const suppliedDeviceId = cleanText(request.get("x-vidcircle-device-id") || "", 160);
  const validDeviceId = /^[A-Za-z0-9_-]{16,160}$/.test(suppliedDeviceId) ? suppliedDeviceId : "";
  const { browser, browserVersion } = parseBrowser(userAgent);
  const { os, deviceType, deviceModel } = parseDevice(userAgent);
  const ip = normaliseIp(request.socket?.remoteAddress || request.ip || "");
  const testCity = cleanText(input.testCity);
  const testState = cleanText(input.testState);
  const deviceHash = digest(validDeviceId || `fallback:${userAgent || "unknown-client"}`);
  const fingerprintHash = digest([browser, browserVersion, os, deviceType, deviceModel].join("|"));
  const contextHash = digest([deviceHash, fingerprintHash, ip, testCity.toLowerCase(), testState.toLowerCase()].join("|"));

  return { deviceHash, contextHash, ip, userAgent, browser, browserVersion, os, deviceType, deviceModel, testCity, testState };
}

export function publicClientContext(record) {
  return {
    ip: record.ip || "",
    browser: record.browser || "Unknown browser",
    browserVersion: record.browserVersion || "",
    os: record.os || "Unknown OS",
    deviceType: record.deviceType || "Unknown device",
    deviceModel: record.deviceModel || "",
    testCity: record.testCity || "",
    testState: record.testState || "",
  };
}
