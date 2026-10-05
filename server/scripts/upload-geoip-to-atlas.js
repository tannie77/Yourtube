import "dotenv/config";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import mongoose from "mongoose";
import { atlasConfiguration } from "../database/atlas.js";
import { geoIpBucket, GEOIP_FILENAME } from "../security/geoip-storage.js";

const source = process.env.GEOIP_CITY_DB_PATH?.trim();
if (!source) throw new Error("Set GEOIP_CITY_DB_PATH to your local GeoLite2 City database.");
const size = (await stat(source)).size;
if (size < 1_000_000 || size > 200_000_000) throw new Error("GeoIP City database size is unexpected.");
const hash = createHash("sha256");
for await (const chunk of createReadStream(source)) hash.update(chunk);
const sha256 = hash.digest("hex");
const { uri, dbName } = atlasConfiguration();
try {
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const bucket = geoIpBucket();
  const existing = await bucket.find({ filename: GEOIP_FILENAME, "metadata.sha256": sha256 }).limit(1).next();
  if (existing) {
    console.log(`GeoIP City database already present in Atlas (${Math.round(size / 1024 / 1024)} MB).`);
  } else {
    const stream = bucket.openUploadStream(GEOIP_FILENAME, { metadata: { sha256, sourceBytes: size } });
    await pipeline(createReadStream(source), createGzip(), stream);
    console.log(`GeoIP City database uploaded privately to Atlas (${Math.round(size / 1024 / 1024)} MB source).`);
  }
} finally {
  await mongoose.disconnect();
}
