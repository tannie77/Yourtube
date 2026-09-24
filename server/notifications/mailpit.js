import { once } from "node:events";
import { createConnection } from "node:net";
import { createInterface } from "node:readline";

const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

export async function sendLocalMail({ recipient, subject, body, fromAddress }) {
  if (!emailPattern.test(recipient) || !emailPattern.test(fromAddress)) throw new Error("Invalid local email address.");
  if (typeof subject !== "string" || !subject || /[\r\n]/.test(subject)) throw new Error("Invalid local email subject.");
  const port = Number(process.env.MAILPIT_SMTP_PORT || 1025);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local Mailpit port.");
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.setTimeout(2500, () => socket.destroy(new Error("Local Mailpit timed out.")));
  socket.on("error", () => {});
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  let completed = false;

  async function expect(codes) {
    while (true) {
      const { value, done } = await iterator.next();
      if (done || !/^\d{3}[ -]/.test(value)) throw new Error("Local Mailpit closed unexpectedly.");
      const code = Number(value.slice(0, 3));
      if (!codes.includes(code)) throw new Error(`Local Mailpit rejected the message (${code}).`);
      if (value[3] === " ") return;
    }
  }

  try {
    await once(socket, "connect");
    await expect([220]);
    socket.write("EHLO vidcircle.local\r\n");
    await expect([250]);
    socket.write(`MAIL FROM:<${fromAddress}>\r\n`);
    await expect([250]);
    socket.write(`RCPT TO:<${recipient}>\r\n`);
    await expect([250, 251]);
    socket.write("DATA\r\n");
    await expect([354]);
    const safeBody = String(body).replace(/\r?\n\./g, "\r\n..");
    socket.write(`From: VidCircle <${fromAddress}>\r\nTo: <${recipient}>\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${safeBody}\r\n.\r\n`);
    await expect([250]);
    socket.write("QUIT\r\n");
    await expect([221]);
    completed = true;
  } finally {
    lines.close();
    if (completed) socket.end();
    else socket.destroy();
  }
}
