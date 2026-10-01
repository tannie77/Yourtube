export type RoomInfo = {
  id: string;
  title: string;
  hostId: string;
  isHost?: boolean;
  isRemoved?: boolean;
  locked: boolean;
  allowChat: boolean;
  allowShare: boolean;
  createdAt: string;
  endedAt: string | null;
  participantLimit: number;
  recording?: boolean;
};

export type RoomParticipant = {
  id: string;
  userId: string;
  name: string;
  role: "host" | "cohost" | "member";
  micOn: boolean;
  cameraOn: boolean;
  sharing: boolean;
  handRaised: boolean;
  speaking: boolean;
  connection: "good" | "fair" | "poor" | "unknown";
};

export type ChatEntry =
  | { kind: "text"; id: string; from: string; name: string; text: string; sentAt: string }
  | { kind: "file"; id: string; from: string; name: string; fileName: string; size: number; data: string; sentAt: string };

export type RoomState = "preview" | "joining" | "joined" | "reconnecting" | "left" | "ended" | "removed";
