import "dotenv/config";
import { connect as connectSocket } from "node:net";
import { stat } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { AtlasConfigurationError, atlasConfiguration, atlasFailureMessage } from "../database/atlas.js";
import { copyDatabase, databaseInventory } from "../database/migration.js";
import { uploadDirectory } from "../filehelp/filehelp.js";

async function apiPortIsOpen(port) {
  return new Promise((resolve) => {
    const socket = connectSocket({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

function mediaNames(video) {
  const source = path.posix.basename(String(video.filepath || "").replaceAll("\\", "/"));
  const names = new Set(source ? [source] : []);
  for (const rendition of video.renditions || []) if (rendition.filename) names.add(rendition.filename);
  if (video.captionFilename) names.add(video.captionFilename);
  const stem = path.parse(source).name;
  for (let index = 1; index <= (video.previewCount || 0); index += 1) {
    names.add(`${stem}-preview-${String(index).padStart(2, "0")}.jpg`);
  }
  return names;
}

const mode = process.argv[2];
if (!["--source-only", "--preflight", "--apply"].includes(mode)) {
  console.error("Usage: npm run db:migrate -- --source-only|--preflight|--apply");
  process.exitCode = 2;
} else {
  const { MongoClient } = mongoose.mongo;
  const local = new MongoClient("mongodb://127.0.0.1:27017/?directConnection=true", { serverSelectionTimeoutMS: 5000 });
  let atlas;
  try {
    await local.connect();
    const source = local.db("yourtube2");
    const sourceInventory = await databaseInventory(source);
    console.log(`Local yourtube2: ${sourceInventory.reduce((sum, item) => sum + item.documents, 0)} records across ${sourceInventory.length} collections.`);
    for (const item of sourceInventory.filter((item) => item.documents)) console.log(`  ${item.name}: ${item.documents}`);
    const videos = await source.collection("videofiles").find({})
      .project({ filepath: 1, renditions: 1, captionFilename: 1, previewCount: 1 }).toArray();
    let missingFiles = 0;
    let assetCount = 0;
    for (const video of videos) {
      for (const name of mediaNames(video)) {
        assetCount += 1;
        if (!name || path.posix.basename(name) !== name || path.win32.basename(name) !== name ||
            !(await stat(path.join(uploadDirectory, name)).catch(() => null))) missingFiles += 1;
      }
    }
    console.log(`Local video records: ${videos.length}; referenced media assets: ${assetCount - missingFiles}/${assetCount} present in server/uploads/.`);

    if (mode !== "--source-only") {
      const { uri, dbName } = atlasConfiguration();
      atlas = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
      await atlas.connect();
      const target = atlas.db(dbName);
      await target.admin().ping();
      const targetInventory = await databaseInventory(target);
      console.log(`Atlas ${dbName}: ${targetInventory.reduce((sum, item) => sum + item.documents, 0)} existing records.`);
      if (mode === "--apply") {
        if (missingFiles) throw new Error("Some local video files are missing. Restore them before copying video records to Atlas.");
        if (await apiPortIsOpen(Number(process.env.PORT) || 5000)) {
          throw new Error("The API port is still open. Stop the old API before copying, so local records cannot change during migration.");
        }
        const copied = await copyDatabase(source, target, (item) => console.log(`Copied ${item.name}: ${item.documents}`));
        console.log(`Verified ${copied.reduce((sum, item) => sum + item.documents, 0)} records in Atlas. Local data was left intact.`);
      } else {
        if (targetInventory.some((item) => item.documents > 0)) {
          throw new Error("Atlas destination already contains records. Inspect it before deciding on a merge; migration will not overwrite them.");
        }
        console.log("Preflight finished without writing data. Use --apply after stopping the old local API.");
      }
    }
  } catch (error) {
    const safe = error instanceof AtlasConfigurationError || error?.name?.startsWith("Mongo")
      ? atlasFailureMessage(error)
      : error?.message;
    console.error(`Migration stopped: ${safe || atlasFailureMessage(error)}`);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([local.close(), atlas?.close()]);
  }
}
