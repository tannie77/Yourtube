import axios from "axios";
import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import { ArrowRight, Link2, LockKeyhole, Plus, UsersRound, Video } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import type { RoomInfo } from "@/lib/room-types";
import styles from "./rooms.module.css";

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.message === "string"
    ? error.response.data.message : fallback;
}

export default function RoomsPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [joinError, setJoinError] = useState("");

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setCreateError("");
    setBusy(true);
    try {
      const key = crypto.getRandomValues(new Uint8Array(32));
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", key)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const secret = btoa(String.fromCharCode(...key)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const response = await axiosInstance.post<{ room: RoomInfo }>("/rooms", { title: title.trim(), e2eeKeyDigest: digest });
      await router.push(`/rooms/${response.data.room.id}#e2ee=${secret}`);
    } catch (error) {
      setCreateError(errorMessage(error, "Could not create the room. Try again."));
      setBusy(false);
    }
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinError("");
    try {
      const url = new URL(link.trim(), window.location.origin);
      const match = /^\/rooms\/([A-Za-z0-9_-]{24})\/?$/.exec(url.pathname);
      if (url.origin !== window.location.origin || !match) throw new Error("Invalid room link");
      void router.push(`/rooms/${match[1]}${url.hash}`);
    } catch {
      setJoinError("Paste a YourTube room link or a /rooms/… path from this app.");
    }
  }

  return <main className="yt-page">
    <section className={styles.hero} aria-labelledby="rooms-heading">
      <div className={styles.heroCopy}>
        <h1 id="rooms-heading">A place to <em>meet.</em></h1>
        <p>Create a private room and invite up to three other signed-in people. The complete invitation link carries the media encryption key.</p>
        <div className={styles.heroFacts}><span><LockKeyhole aria-hidden="true" /> Account access</span><span><UsersRound aria-hidden="true" /> Up to 4 people</span></div>
      </div>
      <div className={styles.heroArt} aria-hidden="true"><span className={styles.orbitOne} /><span className={styles.orbitTwo} /><span className={styles.heroPlay}><Video /></span></div>
    </section>

    <div className={styles.pageIntro}><h2>Start or join a room</h2><p>Rooms are private to people who have the link and a YourTube account.</p></div>
    <div className={styles.formGrid}>
      <form className={styles.formCard} onSubmit={createRoom}>
        <span className={styles.formIcon}><Plus aria-hidden="true" /></span>
        <h3>Start a room</h3>
        <p>You will host the room and control who can join, chat, or share their screen.</p>
        <label htmlFor="room-title">Room name</label>
        <input id="room-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Team catch-up" required />
        {createError && <p role="alert" className={styles.formError}>{createError}</p>}
        <button type="submit" className="yt-primary-button" disabled={busy}><Video aria-hidden="true" />{busy ? "Creating…" : "Create room"}</button>
      </form>
      <form className={styles.formCard} onSubmit={joinRoom}>
        <span className={styles.formIcon}><Link2 aria-hidden="true" /></span>
        <h3>Join with a link</h3>
        <p>Open a room link from a host. Joining this lobby will not turn on your camera or microphone.</p>
        <label htmlFor="room-link">Room link or path</label>
        <input id="room-link" value={link} onChange={(event) => setLink(event.target.value)} placeholder="/rooms/…" required />
        {joinError && <p role="alert" className={styles.formError}>{joinError}</p>}
        <button type="submit" className={styles.secondaryButton}><ArrowRight aria-hidden="true" />Open room</button>
      </form>
    </div>
    <p className={styles.pageNote}>Choose whether to join with camera and microphone. Inside you can chat, share small files, raise a hand, and present your screen. Hosts can save a local recording.</p>
  </main>;
}
