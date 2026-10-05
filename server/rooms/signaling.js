import { Server } from "socket.io";
import CallRoom from "../Modals/CallRoom.js";
import { authenticatedUser } from "../security/session.js";

const PARTICIPANT_LIMIT = 4;
const MAX_FILE_BYTES = 128 * 1024;

function reply(ack, result) {
  if (typeof ack === "function") ack(result);
}

function failure(ack, message) {
  reply(ack, { ok: false, message });
}

function publicParticipant(participant, room) {
  return {
    id: participant.id,
    userId: participant.userId,
    name: participant.name,
    role: participant.userId === String(room.hostId) ? "host" : room.coHostIds.some((id) => String(id) === participant.userId) ? "cohost" : "member",
    micOn: participant.micOn,
    cameraOn: participant.cameraOn,
    sharing: participant.sharing,
    handRaised: participant.handRaised,
    speaking: participant.speaking,
    connection: participant.connection,
  };
}

export function attachRoomSignaling(httpServer, allowedOrigins) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
    allowRequest: (request, callback) => callback(null, !request.headers.origin || allowedOrigins.includes(request.headers.origin)),
    maxHttpBufferSize: 256 * 1024,
  });
  const rooms = new Map();
  const recordingRooms = new Set();

  async function snapshot(roomId) {
    const room = await CallRoom.findOne({ roomId }).select("+e2eeKeyDigest");
    if (!room) return;
    const participants = [...(rooms.get(roomId)?.values() || [])].map((entry) => publicParticipant(entry, room));
    io.to(roomId).emit("room:state", {
      room: { id: room.roomId, title: room.title, hostId: String(room.hostId), locked: room.locked, allowChat: room.allowChat, allowShare: room.allowShare, createdAt: room.createdAt, endedAt: room.endedAt, participantLimit: PARTICIPANT_LIMIT, recording: recordingRooms.has(roomId), e2eeRequired: Boolean(room.e2eeKeyDigest) },
      participants,
    });
  }

  async function leave(socket) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.data.roomId = null;
    rooms.get(roomId)?.delete(socket.id);
    const departedWasHost = await CallRoom.exists({ roomId, hostId: socket.data.userId });
    if (departedWasHost) recordingRooms.delete(roomId);
    if (rooms.get(roomId)?.size === 0) rooms.delete(roomId);
    socket.leave(roomId);
    socket.to(roomId).emit("room:participant-left", { id: socket.id });
    await snapshot(roomId);
  }

  io.use(async (socket, next) => {
    try {
      const identity = await authenticatedUser({ headers: socket.request.headers });
      if (!identity) return next(new Error("Sign in required."));
      socket.data.userId = String(identity.user._id);
      socket.data.name = identity.user.name;
      next();
    } catch (error) { next(error); }
  });

  io.on("connection", (socket) => {
    const checkSession = async () => {
      try {
        const identity = await authenticatedUser({ headers: socket.request.headers });
        if (identity && String(identity.user._id) === socket.data.userId) return true;
      } catch {}
      socket.emit("room:auth-expired");
      socket.disconnect(true);
      return false;
    };
    socket.use((_packet, next) => { void checkSession().then((valid) => next(valid ? undefined : new Error("Session expired."))); });
    const sessionTimer = setInterval(() => { void checkSession(); }, 15_000);
    sessionTimer.unref?.();
    socket.on("room:join", async (input, ack) => {
      try {
        const roomId = typeof input === "string" ? input : input?.roomId;
        if (typeof roomId !== "string" || !/^[A-Za-z0-9_-]{24}$/.test(roomId)) return failure(ack, "Room not found.");
        const room = await CallRoom.findOne({ roomId }).select("+e2eeKeyDigest");
        if (!room) return failure(ack, "Room not found.");
        if (room.e2eeKeyDigest && input?.keyDigest !== room.e2eeKeyDigest) return failure(ack, "This encrypted room needs its complete invitation link.");
        if (room.endedAt) return failure(ack, "This room has ended.");
        if (room.removedUserIds.some((id) => String(id) === socket.data.userId)) return failure(ack, "A host removed you from this room.");
        if (room.locked && String(room.hostId) !== socket.data.userId && !room.coHostIds.some((id) => String(id) === socket.data.userId)) return failure(ack, "This room is locked.");
        if (socket.data.roomId && socket.data.roomId !== roomId) await leave(socket);
        let participants = rooms.get(roomId);
        if (!participants) { participants = new Map(); rooms.set(roomId, participants); }
        const oldSocket = [...participants.values()].find((entry) => entry.userId === socket.data.userId && entry.id !== socket.id);
        if (oldSocket) {
          participants.delete(oldSocket.id);
          io.sockets.sockets.get(oldSocket.id)?.disconnect(true);
        }
        if (!participants.has(socket.id) && participants.size >= PARTICIPANT_LIMIT) return failure(ack, "This small room is full (4 participants).");
        const existing = [...participants.values()].filter((entry) => entry.id !== socket.id).map((entry) => publicParticipant(entry, room));
        const participant = participants.get(socket.id) || { id: socket.id, userId: socket.data.userId, name: socket.data.name, micOn: false, cameraOn: false, sharing: false, handRaised: false, speaking: false, connection: "unknown" };
        participants.set(socket.id, participant);
        socket.data.roomId = roomId;
        socket.join(roomId);
        reply(ack, { ok: true, selfId: socket.id, peers: existing });
        await snapshot(roomId);
      } catch { failure(ack, "Could not join this room."); }
    });

    socket.on("room:signal", (payload, ack) => {
      const participants = rooms.get(socket.data.roomId);
      if (!participants?.has(socket.id) || !payload || typeof payload.to !== "string" || !participants.has(payload.to) || !["offer", "answer", "candidate"].includes(payload.type)) return failure(ack, "Invalid call signal.");
      const body = payload.type === "candidate" ? payload.candidate : payload.description;
      if (!body || typeof body !== "object" || JSON.stringify(body).length > 64_000) return failure(ack, "Invalid call signal.");
      io.to(payload.to).emit("room:signal", { from: socket.id, type: payload.type, ...(payload.type === "candidate" ? { candidate: body } : { description: body }) });
      reply(ack, { ok: true });
    });

    socket.on("room:presence", async (changes, ack) => {
      const roomId = socket.data.roomId;
      const participant = rooms.get(roomId)?.get(socket.id);
      if (!participant || !changes || typeof changes !== "object") return failure(ack, "Join the room first.");
      try {
        const room = await CallRoom.findOne({ roomId });
        if (!room || room.endedAt) return failure(ack, "This room has ended.");
        const privileged = participant.userId === String(room.hostId) || room.coHostIds.some((id) => String(id) === participant.userId);
        if (changes.sharing === true && !room.allowShare && !privileged) return failure(ack, "Screen sharing is disabled by the host.");
        for (const key of ["micOn", "cameraOn", "sharing", "handRaised", "speaking"]) if (typeof changes[key] === "boolean") participant[key] = changes[key];
        if (["good", "fair", "poor", "unknown"].includes(changes.connection)) participant.connection = changes.connection;
        await snapshot(roomId);
        reply(ack, { ok: true });
      } catch { failure(ack, "Could not update your call status."); }
    });

    socket.on("room:chat", async (text, ack) => {
      const roomId = socket.data.roomId;
      const participant = rooms.get(roomId)?.get(socket.id);
      if (!participant) return failure(ack, "Join the room first.");
      const message = typeof text === "string" ? text.trim() : "";
      if (!message || message.length > 1_000) return failure(ack, "Enter a message of up to 1,000 characters.");
      try {
        const room = await CallRoom.findOne({ roomId });
        if (!room || room.endedAt) return failure(ack, "This room has ended.");
        const privileged = participant.userId === String(room.hostId) || room.coHostIds.some((id) => String(id) === participant.userId);
        if (!room.allowChat && !privileged) return failure(ack, "Chat is disabled by the host.");
        io.to(roomId).emit("room:chat", { from: socket.id, name: participant.name, text: message, sentAt: new Date().toISOString() });
        reply(ack, { ok: true });
      } catch { failure(ack, "Could not send your message."); }
    });

    socket.on("room:file", async (file, ack) => {
      const roomId = socket.data.roomId;
      const participant = rooms.get(roomId)?.get(socket.id);
      if (!participant) return failure(ack, "Join the room first.");
      if (!file || typeof file.name !== "string" || typeof file.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.data)) return failure(ack, "Choose a small file to share.");
      const bytes = Buffer.from(file.data, "base64");
      if (!bytes.length || bytes.length > MAX_FILE_BYTES || bytes.toString("base64") !== file.data) return failure(ack, "Files must be 128 KB or smaller.");
      const name = file.name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 100);
      if (!name) return failure(ack, "Choose a named file.");
      try {
        const room = await CallRoom.findOne({ roomId });
        if (!room || room.endedAt) return failure(ack, "This room has ended.");
        const privileged = participant.userId === String(room.hostId) || room.coHostIds.some((id) => String(id) === participant.userId);
        if (!room.allowChat && !privileged) return failure(ack, "File sharing is disabled by the host.");
        io.to(roomId).emit("room:file", { from: socket.id, senderName: participant.name, name, size: bytes.length, data: file.data, sentAt: new Date().toISOString() });
        reply(ack, { ok: true });
      } catch { failure(ack, "Could not share that file."); }
    });

    socket.on("room:host", async (action, ack) => {
      const roomId = socket.data.roomId;
      const participants = rooms.get(roomId);
      const actor = participants?.get(socket.id);
      if (!actor || !action || typeof action.type !== "string") return failure(ack, "Join the room first.");
      try {
        const room = await CallRoom.findOne({ roomId });
        if (!room || room.endedAt) return failure(ack, "This room has ended.");
        const host = actor.userId === String(room.hostId);
        const cohost = room.coHostIds.some((id) => String(id) === actor.userId);
        if (!host && !cohost) return failure(ack, "Host controls are unavailable.");
        if (["lock", "allowChat", "allowShare", "cohost", "end"].includes(action.type) && !host) return failure(ack, "Only the host can change room settings.");
        if (["lock", "allowChat", "allowShare"].includes(action.type) && typeof action.value === "boolean") {
          room[action.type === "lock" ? "locked" : action.type] = action.value;
          await room.save();
          if (action.type === "allowShare" && !action.value) {
            for (const participant of participants.values()) {
              if (participant.userId !== String(room.hostId) && !room.coHostIds.some((id) => String(id) === participant.userId)) participant.sharing = false;
            }
          }
        } else if (action.type === "cohost" && typeof action.target === "string" && typeof action.value === "boolean") {
          const target = participants.get(action.target);
          if (!target || target.userId === String(room.hostId)) return failure(ack, "Choose another participant.");
          room.coHostIds = action.value ? [...new Set([...room.coHostIds.map(String), target.userId])] : room.coHostIds.filter((id) => String(id) !== target.userId);
          await room.save();
          if (!action.value && !room.allowShare) target.sharing = false;
        } else if (["mute", "remove"].includes(action.type) && typeof action.target === "string") {
          const target = participants.get(action.target);
          if (!target || target.userId === String(room.hostId) || (!host && room.coHostIds.some((id) => String(id) === target.userId))) return failure(ack, "This participant cannot be changed.");
          const targetSocket = io.sockets.sockets.get(action.target);
          if (action.type === "mute") { target.micOn = false; targetSocket?.emit("room:force-mute"); }
          else { room.removedUserIds = [...new Set([...room.removedUserIds.map(String), target.userId])]; await room.save(); targetSocket?.emit("room:removed"); targetSocket?.disconnect(true); }
        } else if (action.type === "end") {
          recordingRooms.delete(roomId);
          room.endedAt = new Date();
          await room.save();
          reply(ack, { ok: true });
          io.to(roomId).emit("room:ended");
          for (const entry of participants.values()) io.sockets.sockets.get(entry.id)?.disconnect(true);
          return;
        } else return failure(ack, "Invalid host action.");
        await snapshot(roomId);
        reply(ack, { ok: true });
      } catch { failure(ack, "Could not change this room."); }
    });

    socket.on("room:recording", async (active, ack) => {
      const roomId = socket.data.roomId;
      if (!roomId || typeof active !== "boolean") return failure(ack, "Join the room first.");
      try {
        const room = await CallRoom.findOne({ roomId });
        if (!room || room.endedAt || String(room.hostId) !== socket.data.userId) return failure(ack, "Only the host can record this room.");
        if (active) recordingRooms.add(roomId);
        else recordingRooms.delete(roomId);
        await snapshot(roomId);
        reply(ack, { ok: true });
      } catch { failure(ack, "Could not update recording status."); }
    });

    socket.on("room:leave", async (_unused, ack) => { await leave(socket); reply(ack, { ok: true }); });
    socket.on("disconnect", () => { clearInterval(sessionTimer); void leave(socket).catch((error) => console.error("Room disconnect cleanup failed:", error)); });
  });

  return io;
}
