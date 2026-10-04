import assert from "node:assert/strict";
import { test } from "node:test";
import { atlasConfiguration, atlasFailureMessage } from "../database/atlas.js";

test("Atlas is required for application startup and local MongoDB cannot be selected", () => {
  assert.throws(() => atlasConfiguration({}), /Set MONGODB_URI/);
  assert.throws(() => atlasConfiguration({ MONGODB_URI: "mongodb:\/\/127.0.0.1:27017/yourtube2" }), /Atlas mongodb\+srv/);
  assert.throws(() => atlasConfiguration({ MONGODB_URI: "mongodb+srv:\/\/user:pass@other.example.com/yourtube2" }), /Atlas mongodb\+srv/);
});

test("Atlas config selects one database without exposing credentials", () => {
  const uri = "mongodb+srv://database-user:secret@cluster.example.mongodb.net/?retryWrites=true&w=majority";
  assert.deepEqual(atlasConfiguration({ MONGODB_URI: uri }), { uri, dbName: "yourtube2" });
  assert.equal(atlasConfiguration({ MONGODB_URI: uri, MONGODB_DB_NAME: "yourtube2_stage" }).dbName, "yourtube2_stage");
  assert.throws(() => atlasConfiguration({ MONGODB_URI: uri.replace("secret", "<password>") }), /placeholders/);
  assert.throws(() => atlasConfiguration({ MONGODB_URI: uri.replace("/?", "/wrong?") }), /must match/);
  assert.doesNotMatch(atlasFailureMessage(new Error(`Connection failed for ${uri}`)), /secret|database-user/);
});
