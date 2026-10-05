import "dotenv/config";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { uploadDirectory } from "../filehelp/filehelp.js";
import { atlasConfiguration, atlasFailureMessage } from "../database/atlas.js";
import { atlasAssetInfo, storeAtlasAsset } from "../video/media-store.js";

const apply = process.argv.includes("--apply");

try {
  const { uri, dbName } = atlasConfiguration();
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  let count = 0;
  let bytes = 0;
  for (const filename of await readdir(uploadDirectory)) {
    if (!/^[a-f0-9-]{36}(?:-(?:480p|720p|1080p|4K|preview-\d{2}))?\.(?:mp4|vtt|jpg)$/i.test(filename)) continue;
    if (await atlasAssetInfo(filename)) continue;
    const filePath = path.join(uploadDirectory, filename);
    const file = await stat(filePath);
    if (!file.isFile()) continue;
    if (apply) await storeAtlasAsset(filePath);
    count += 1;
    bytes += file.size;
  }
  console.log(`${apply ? "Copied" : "Ready to copy"} ${count} media files (${bytes} bytes) to Atlas database ${dbName}.`);
  if (!apply) console.log("Run with --apply to copy files. Local originals are kept.");
} catch (error) {
  console.error(`Media migration failed: ${atlasFailureMessage(error)}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
