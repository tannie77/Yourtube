import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { billingCycles, plans } from "../subscriptions/plans.js";

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
dotenv.config({ path: envPath });

const keyId = process.env.RAZORPAY_TEST_KEY_ID;
const keySecret = process.env.RAZORPAY_TEST_KEY_SECRET;
if (!/^rzp_test_[A-Za-z0-9]+$/.test(keyId || "") || !keySecret) {
  console.error("Set a Razorpay Test Key ID and matching Key Secret in server/.env first.");
  process.exit(1);
}

const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
const paidPlans = plans.filter((plan) => plan.id !== "free");
const expected = paidPlans.flatMap((plan) => billingCycles.map((cycle) => ({
  envName: `RAZORPAY_PLAN_${plan.id.toUpperCase()}_${cycle.id.toUpperCase()}`,
  name: `YourTube ${plan.name} ${cycle.label}`,
  planId: plan.id,
  cycleId: cycle.id,
  amount: plan.pricesPaise[cycle.id],
  period: cycle.id,
})));

async function api(method, path, body) {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(`Razorpay returned 401 for ${path}. Check that Subscriptions is enabled for this Test Mode account.`);
    }
    throw new Error(`Razorpay returned HTTP ${response.status} for ${method} ${path}.`);
  }
  return response.json();
}

function matches(provider, target) {
  return provider?.period === target.period && provider.interval === 1 &&
    provider.item?.amount === target.amount && provider.item?.currency === "INR";
}

async function listPlans() {
  const result = [];
  for (let page = 0; page < 20; page += 1) {
    const data = await api("GET", `/plans?count=100&skip=${page * 100}`);
    if (!Array.isArray(data.items)) throw new Error("Razorpay returned an invalid plan list.");
    result.push(...data.items);
    if (data.items.length < 100) return result;
  }
  throw new Error("More than 2,000 Razorpay plans exist; review them manually before creating plans.");
}

async function savePlanId(name, id) {
  let content = await readFile(envPath, "utf8");
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const assignment = `${name}=${id}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  content = pattern.test(content) ? content.replace(pattern, assignment) : `${content.trimEnd()}${newline}${assignment}${newline}`;
  await writeFile(envPath, content, "utf8");
  process.env[name] = id;
}

try {
  const existing = await listPlans();
  for (const target of expected) {
    const configured = process.env[target.envName];
    if (configured) {
      if (!/^plan_[A-Za-z0-9]+$/.test(configured)) throw new Error(`${target.envName} has an invalid plan ID.`);
      const provider = await api("GET", `/plans/${configured}`);
      if (!matches(provider, target)) throw new Error(`${target.envName} does not match the project's billing cycle and INR price.`);
      console.log(`${target.name}: verified`);
      continue;
    }

    const candidates = existing.filter((provider) => matches(provider, target) &&
      (provider.notes?.yourtube_plan === target.planId && provider.notes?.billing_cycle === target.cycleId ||
        provider.item?.name === target.name));
    if (candidates.length > 1) throw new Error(`Multiple Razorpay plans match ${target.name}; review them before continuing.`);
    let provider = candidates[0];
    if (!provider) {
      provider = await api("POST", "/plans", {
        period: target.period,
        interval: 1,
        item: { name: target.name, amount: target.amount, currency: "INR",
          description: `YourTube ${target.planId} ${target.cycleId} membership` },
        notes: { yourtube_plan: target.planId, billing_cycle: target.cycleId },
      });
    }
    if (!/^plan_[A-Za-z0-9]+$/.test(provider?.id) || !matches(provider, target)) {
      throw new Error(`Razorpay returned an invalid plan for ${target.name}.`);
    }
    await savePlanId(target.envName, provider.id);
    existing.push(provider);
    console.log(`${target.name}: ${candidates.length ? "reused" : "created"} and saved`);
  }
  console.log("All nine Razorpay Test plan IDs are configured in server/.env.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Razorpay Test plan setup failed.");
  process.exitCode = 1;
}
