import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import app from "../app.js";
import User from "../Modals/Auth.js";
import Session from "../Modals/Session.js";
import TrustedDevice from "../Modals/TrustedDevice.js";
import Video from "../Modals/video.js";
import DailyDownloadUsage from "../Modals/DailyDownloadUsage.js";
import MonthlyDownloadUsage from "../Modals/MonthlyDownloadUsage.js";
import DownloadWindow from "../Modals/DownloadWindow.js";
import { uploadDirectory } from "../filehelp/filehelp.js";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let database;
let server;
let baseUrl;
const temporaryFiles = [];

before(async () => {
  database = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" }, binary: { downloadDir: path.join(serverDirectory, ".local-data", "binaries") } });
  await mongoose.connect(database.getUri("yourtube2_download_security_test"));
  await Promise.all([User.init(), Session.init(), TrustedDevice.init(), DailyDownloadUsage.init(), MonthlyDownloadUsage.init(), DownloadWindow.init()]);
  server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
  await Promise.all(temporaryFiles.map((file) => unlink(file).catch(() => {})));
});

test("optional trusted-browser download setting checks the current session and device", async () => {
  const registration = await fetch(`${baseUrl}/user/register`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Download security", email: `download-security-${Date.now()}@example.test`, password: "local-password-123" }) });
  assert.equal(registration.status, 201);
  const { user } = await registration.json();
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  const filename = `${randomUUID()}.mp4`;
  const filePath = path.join(uploadDirectory, filename);
  temporaryFiles.push(filePath);
  await writeFile(filePath, Buffer.from("0000ftypisom0000"));
  const video = await Video.create({ videotitle: "Trusted test", filename, filetype: "video/mp4", filepath: `/uploads/${filename}`,
    filesize: 16, videochanel: "Test", uploader: user._id, durationSeconds: 1, sourceQuality: "480p",
    renditions: [{ quality: "480p", filename }] });
  const pref = await fetch(`${baseUrl}/user/preferences/download-security`, { method: "PATCH",
    headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ restrictDownloadsToTrustedDevices: true }) });
  assert.equal(pref.status, 200);
  const route = `${baseUrl}/video/${video.id}/download`;
  const changedDevice = await fetch(route, { headers: { cookie, "x-yourtube-device-id": "another_browser_1234" } });
  assert.equal(changedDevice.status, 403);
  assert.equal((await changedDevice.json()).code, "TRUSTED_DEVICE_REQUIRED");
  const permitted = await fetch(route, { headers: { cookie } });
  assert.equal(permitted.status, 200);
  await permitted.arrayBuffer();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await TrustedDevice.deleteMany({ userId: user._id });
  const revoked = await fetch(route, { headers: { cookie } });
  assert.equal(revoked.status, 403);
});
