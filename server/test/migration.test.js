import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import { copyDatabase, databaseInventory } from "../database/migration.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let client;

before(async () => {
  database = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" }, binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") } });
  client = new mongoose.mongo.MongoClient(database.getUri());
  await client.connect();
});

after(async () => {
  await client?.close();
  await database?.stop();
});

test("database migration refuses occupied targets and preserves documents, IDs and indexes", async () => {
  const source = client.db("migration_source");
  const target = client.db("migration_target");
  const userId = new mongoose.Types.ObjectId();
  const videoId = new mongoose.Types.ObjectId();
  await source.collection("users").createIndex({ email: 1 }, { unique: true });
  await source.collection("users").insertOne({ _id: userId, email: "viewer@example.test", joinedon: new Date("2026-10-04") });
  await source.collection("videofiles").insertOne({ _id: videoId, uploader: String(userId), metadata: { tags: ["sample"] } });
  await target.collection("existing").insertOne({ keep: true });
  await assert.rejects(copyDatabase(source, target), /not empty/);
  assert.equal((await target.collection("users").countDocuments({})), 0);
  await target.collection("existing").deleteMany({});

  const copied = await copyDatabase(source, target);
  assert.equal(copied.reduce((sum, item) => sum + item.documents, 0), 2);
  assert.deepEqual(await databaseInventory(target), [
    { name: "existing", documents: 0 },
    { name: "users", documents: 1 },
    { name: "videofiles", documents: 1 },
  ]);
  assert.equal(String((await target.collection("videofiles").findOne({}))._id), String(videoId));
  assert.ok((await target.collection("users").indexes()).some((index) => index.name === "email_1" && index.unique));
  assert.equal((await source.collection("users").countDocuments({})), 1);
});
