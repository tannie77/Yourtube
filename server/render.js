import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app, { allowedOrigins } from "./app.js";
import { prepareDatabase } from "./bootstrap.js";
import { atlasFailureMessage } from "./database/atlas.js";
import { attachRoomSignaling } from "./rooms/signaling.js";

const requireFrontend = createRequire(new URL("../yourtube/package.json", import.meta.url));
const next = requireFrontend("next");
const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../yourtube");
const port = Number(process.env.PORT) || 10000;

try {
  const dbName = await prepareDatabase();
  const frontend = next({ dev: false, dir: frontendDirectory });
  await frontend.prepare();
  app.use((request, response) => frontend.getRequestHandler()(request, response));
  const server = createServer(app);
  attachRoomSignaling(server, allowedOrigins);
  server.listen(port, "0.0.0.0", () => {
    console.log(`YourTube is listening on port ${port} (MongoDB Atlas: ${dbName})`);
  });
} catch (error) {
  console.error(`YourTube startup failed: ${atlasFailureMessage(error)}`);
  process.exitCode = 1;
}
