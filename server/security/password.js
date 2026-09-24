import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;

  const [salt, hashHex] = storedHash.split(":");
  if (!salt || !hashHex || !/^[0-9a-f]+$/i.test(hashHex)) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== 64) return false;

  const actual = await scrypt(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}
