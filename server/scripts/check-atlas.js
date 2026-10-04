import "dotenv/config";
import mongoose from "mongoose";
import { atlasConfiguration, atlasFailureMessage } from "../database/atlas.js";

try {
  const { uri, dbName } = atlasConfiguration();
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  await mongoose.connection.db.admin().ping();
  console.log(`MongoDB Atlas connection passed for database ${dbName}.`);
} catch (error) {
  console.error(`Atlas connection failed: ${atlasFailureMessage(error)}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
