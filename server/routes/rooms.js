import { randomBytes } from "node:crypto";
import express from "express";
import CallRoom from "../Modals/CallRoom.js";
import { requireAuth } from "../security/session.js";

const routes = express.Router();
routes.use(requireAuth);

export function publicRoom(room, userId) {
  return {
    id: room.roomId,
    title: room.title,
    hostId: String(room.hostId),
    isHost: String(room.hostId) === String(userId),
    isRemoved: room.removedUserIds.some((id) => String(id) === String(userId)),
    locked: room.locked,
    allowChat: room.allowChat,
    allowShare: room.allowShare,
    endedAt: room.endedAt,
    createdAt: room.createdAt,
    participantLimit: 4,
  };
}

routes.post("/", async (request, response, next) => {
  try {
    const title = String(request.body?.title || "").trim();
    if (!title || title.length > 80) return response.status(400).json({ message: "Enter a room name of up to 80 characters." });
    const room = await CallRoom.create({
      roomId: randomBytes(18).toString("base64url"),
      hostId: request.user._id,
      title,
    });
    return response.status(201).json({ room: publicRoom(room, request.user._id) });
  } catch (error) { next(error); }
});

routes.get("/:id", async (request, response, next) => {
  try {
    if (!/^[A-Za-z0-9_-]{24}$/.test(request.params.id)) return response.status(404).json({ message: "Room not found." });
    const room = await CallRoom.findOne({ roomId: request.params.id });
    if (!room) return response.status(404).json({ message: "Room not found." });
    return response.json({ room: publicRoom(room, request.user._id) });
  } catch (error) { next(error); }
});

export default routes;
