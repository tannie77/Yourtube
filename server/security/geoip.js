import { isIP } from "node:net";
import { Reader } from "@maxmind/geoip2-node";

let openedPath = "";
let readerPromise;

function publicIp(ip) {
  if (!isIP(ip)) return false;
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0));
  }
  return !/^(?:::1$|::$|fe[89ab][0-9a-f]:|f[cd][0-9a-f]{2}:|2001:db8:)/i.test(ip);
}

export async function approximateGeoLocation(ip, environment = process.env) {
  const file = environment.GEOIP_CITY_DB_PATH?.trim();
  if (!file || !publicIp(ip)) return null;
  if (openedPath !== file) {
    openedPath = file;
    readerPromise = Reader.open(file, { watchForUpdates: true }).catch((error) => {
      openedPath = "";
      readerPromise = undefined;
      throw error;
    });
  }
  try {
    const result = (await readerPromise).city(ip);
    const latitude = result.location?.latitude;
    const longitude = result.location?.longitude;
    return {
      city: String(result.city?.names?.en || "").slice(0, 80),
      state: String(result.subdivisions?.[0]?.names?.en || "").slice(0, 80),
      country: String(result.country?.names?.en || "").slice(0, 80),
      approximateLocation: Number.isFinite(latitude) && Number.isFinite(longitude) ? `${latitude.toFixed(2)}, ${longitude.toFixed(2)}` : "",
    };
  } catch {
    return null;
  }
}
