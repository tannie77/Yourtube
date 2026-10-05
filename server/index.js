import { createServer } from "node:http";
import app, { allowedOrigins } from "./app.js";
import { attachRoomSignaling } from "./rooms/signaling.js";
import { prepareDatabase } from "./bootstrap.js";
import { atlasFailureMessage } from "./database/atlas.js";

const port = Number(process.env.PORT) || 5000;

try {
  const dbName = await prepareDatabase();
  const httpServer = createServer(app);
  attachRoomSignaling(httpServer, allowedOrigins);
  httpServer.listen(port, () => console.log(`YourTube 2.0 API: http://127.0.0.1:${port} (MongoDB Atlas: ${dbName})`));
} catch (error) {
  console.error(`Atlas startup failed: ${atlasFailureMessage(error)}`);
  process.exitCode = 1;
}
