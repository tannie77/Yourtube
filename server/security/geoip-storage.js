import { createWriteStream } from "node:fs";
import { access, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import mongoose from "mongoose";

export const GEOIP_FILENAME = "GeoLite2-City.mmdb.gz";

export function geoIpBucket() {
  if (!mongoose.connection.db) throw new Error("Atlas is unavailable for GeoIP storage.");
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "geoip_data" });
}

export async function prepareGeoIpDatabase() {
  const configured = process.env.GEOIP_CITY_DB_PATH?.trim();
  if (configured) {
    await access(configured);
    return configured;
  }
  if (process.env.GEOIP_ATLAS_ENABLED !== "true") return null;
  const file = await geoIpBucket().find({ filename: GEOIP_FILENAME }).sort({ uploadDate: -1 }).limit(1).next();
  if (!file) throw new Error("GeoIP database was not uploaded to Atlas.");
  const target = path.join(os.tmpdir(), `yourtube-${file._id}.mmdb`);
  try {
    await access(target);
  } catch {
    const temporary = `${target}.${process.pid}.tmp`;
    try {
      await pipeline(geoIpBucket().openDownloadStream(file._id), createGunzip(), createWriteStream(temporary));
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
  process.env.GEOIP_CITY_DB_PATH = target;
  console.log("GeoIP City database loaded from Atlas.");
  return target;
}
