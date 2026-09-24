import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server-core";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = path.join(serverDirectory, ".local-data", "mongodb");
const binaryDirectory = path.join(serverDirectory, ".local-data", "binaries");

await mkdir(dataDirectory, { recursive: true });
await mkdir(binaryDirectory, { recursive: true });

const database = await MongoMemoryServer.create({
  instance: {
    ip: "127.0.0.1",
    port: 27017,
    portGeneration: false,
    dbPath: dataDirectory,
    storageEngine: "wiredTiger",
  },
  binary: { downloadDir: binaryDirectory },
});

console.log(`Local MongoDB ready: ${database.getUri("vidcircle")}`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await database.stop({ doCleanup: false });
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
