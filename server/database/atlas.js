import { setServers } from "node:dns";
import { isIP } from "node:net";

const DEFAULT_DATABASE = "yourtube2";

export class AtlasConfigurationError extends Error {}

export function atlasConfiguration(environment = process.env) {
  const uri = environment.MONGODB_URI?.trim();
  if (!uri) {
    throw new AtlasConfigurationError("Set MONGODB_URI in server/.env to your MongoDB Atlas driver connection string.");
  }

  let parsed;
  try { parsed = new URL(uri); }
  catch { throw new AtlasConfigurationError("MONGODB_URI is not a valid MongoDB Atlas connection string."); }
  if (parsed.protocol !== "mongodb+srv:" || !parsed.hostname.toLowerCase().endsWith(".mongodb.net")) {
    throw new AtlasConfigurationError("MONGODB_URI must be an Atlas mongodb+srv:// connection string, not a local database URL.");
  }
  let credentials;
  try { credentials = decodeURIComponent(parsed.username + parsed.password); }
  catch { throw new AtlasConfigurationError("MONGODB_URI has invalid username or password encoding."); }
  if (!parsed.username || !parsed.password || /<|>/.test(credentials)) {
    throw new AtlasConfigurationError("Replace the Atlas database username and password placeholders in MONGODB_URI.");
  }

  const dbName = environment.MONGODB_DB_NAME?.trim() || DEFAULT_DATABASE;
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(dbName)) {
    throw new AtlasConfigurationError("MONGODB_DB_NAME must be 1–63 letters, digits, underscores or hyphens.");
  }
  const pathDatabase = decodeURIComponent(parsed.pathname.slice(1));
  if (pathDatabase && pathDatabase !== dbName) {
    throw new AtlasConfigurationError("The database in MONGODB_URI must match MONGODB_DB_NAME, or be omitted.");
  }
  const dnsServers = environment.MONGODB_DNS_SERVERS?.split(",").map((server) => server.trim()).filter(Boolean) || [];
  if (dnsServers.some((server) => !isIP(server))) {
    throw new AtlasConfigurationError("MONGODB_DNS_SERVERS must contain comma-separated DNS server IP addresses.");
  }
  if (dnsServers.length) setServers(dnsServers);
  return { uri, dbName };
}

export function atlasFailureMessage(error) {
  return error instanceof AtlasConfigurationError
    ? error.message
    : "Could not connect to MongoDB Atlas. Check the cluster status, database user, password, and Network Access IP list.";
}
