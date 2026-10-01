# YourTube 2.0

This is the new working app based on the original YourTube clone. It keeps the clone's Next.js Pages Router and layout while reusing VidCircle's account and protected-video code.

## Migrated so far

- Local registration, password sign-in, session cookies, trusted-browser OTP through Mailpit, and owner-checked channel edits.
- Session-owned MP4 uploads (up to 100 MB), optional WebVTT captions, metadata validation, private preview frames, and generated quality variants.
- Authenticated video feed, search, owner channel list, custom watch player, and private watch history. Video, caption, and preview responses use access checks, and playback supports byte ranges. The player reuses VidCircle's resume and progress tracking, timeline previews, quality and speed controls, captions, keyboard shortcuts, theatre and full-screen modes, Picture-in-Picture, cross-tab pause, and up-next countdown.
- Light/dark controls on sign-in and signed-in pages. Signed-out choices stay in the browser; signed-in choices are saved to the account.
- VidCircle's membership catalogue, signed local test checkout, order history, receipts, renewal, upgrade, scheduled downgrade, cancellation, and expiry are available through the new Membership page. Video access, quality gates, daily viewing reservation, and watch-progress endpoints use the active plan.
- Protected MP4 downloads, plan-based daily download limits, interrupted-transfer recovery, a watch-page Download action, and private download history are migrated from VidCircle.
- Session-owned Likes and Watch later, with actions on video cards and watch pages and private library pages.
- The watch-page conversation supports Unicode comments, replies, resolved @mentions, like/dislike reactions, four sort modes, author-only timed edits and soft deletion, private revision history, and local abuse, duplicate, flood, and posting-challenge checks. Viewers can translate comments on demand to English, Hindi, or Spanish and report another user's comment once. A designated administrator can dismiss reports or remove comments from a review queue with a retained moderation log. Comment actions follow the viewer's video plan.
- The Security page shows active sessions, trusted browsers, and recent sign-in attempts. Viewers can revoke individual or other sessions, remove trusted browsers, set a local test city/state for the next sign-in check, and save an automatic, light, or dark appearance choice to their account.
- The Video rooms page creates authenticated private rooms with 24-character links. Signed-in people can join without media or choose camera and microphone, see participants, switch devices, mute, pause video, share a screen, raise a hand, and send live messages and files up to 128 KB. Messages and files are relayed live and are not stored; they clear on leaving or refreshing. The host can make a local recording, which downloads to their browser and shows a recording indicator to everyone in the room. The server enforces a four-person limit, locked entry, host/co-host actions, removal, and chat/file/screen-share permissions. Peer media uses VidCircle's local WebRTC mesh with no TURN relay, so connectivity outside the local network is not guaranteed. Three-browser live media, screen sharing, recording, and device QA are still pending.

## Local setup

Use Node.js 22 and install `ffmpeg` and `ffprobe` on your PATH for video upload processing. The new app uses its own local MongoDB database, `yourtube2`, rather than VidCircle's `vidcircle` database.

1. From `server/`, run `npm ci`, then `npm run db` in one terminal and `npm run start` in another.
2. From `yourtube/`, run `npm ci` and `npm run dev -- --hostname 127.0.0.1`.
3. Open `http://127.0.0.1:3000/`; signed-out visits go to `/sign-in`. Use this hostname for both frontend and API so local session cookies work consistently.
   In development, **Continue with local preview** creates a demo account and opens the app without entering credentials. It uses a normal local session; each click creates a new demo account.
4. For an unfamiliar-browser sign-in, start a local Mailpit SMTP listener on `127.0.0.1:1025` and read the code in its local inbox on port 8025. See `server/.env.example` for configuration.
5. After signing in, open **Membership** in the sidebar. Choose a plan and simulate success, failure, or cancellation. No card details or real money are involved. A verified success unlocks eligible protected videos; receipts appear in the page and can be sent or retried through local Mailpit.
6. Open a watchable video and scroll to **Conversation** to post, reply, type `@` for user suggestions, react, sort, translate, or report. **Edit comment profile** sets a self-reported location, preferred translation language, and a local PNG/JPEG/WebP picture up to 256 KB. Authors can edit or soft-delete for 15 minutes by default; set `COMMENT_EDIT_WINDOW_MINUTES` on the API to an integer from 1 to 1,440 to change this local limit. Replies remain beneath a deleted-parent placeholder.
7. Open **Security** in the sidebar or account menu to review sessions and recent sign-ins. Removing a trusted browser makes its next sign-in require OTP. The local test city/state values are stored in this browser and are not geolocation.
8. Open **Video rooms** to create a room or paste a room link. Choose **Join without media** or **Join with camera and mic**; the latter asks for browser device permission. Inside the room, use the mic/camera controls and device selectors, share a screen, raise a hand, send a message or small file, and use host controls when appropriate. The host can start and stop a local recording. Share the link with another signed-in account to check a member join and live conversation. A room link stays valid until its host ends the room.

### Local demo fixtures

With MongoDB and the API running, run `npm run demo:seed` from `server/` to create three clearly named demo accounts (creator, viewer, admin), a 16-second Free captioned MP4, a 12-second Silver MP4, and Hindi and Spanish comments. The command accepts only the loopback `yourtube2` database and local API on port 5000. It can be rerun without duplicating these accounts, videos or comments, and it leaves other records alone.

The generated credentials and record IDs are in `server/.local-data/demo/manifest.json` (owner-readable only). Generated source videos are in that same ignored folder; uploaded media is also ignored. Sign-in from a new browser requests a Mailpit code, so start Mailpit before using these accounts interactively. This seed does not simulate purchases or mark any browser as trusted.

### Local comment translation

Translation uses a separate LibreTranslate process on `127.0.0.1:5001`. The current local workspace has VidCircle's Python runtime and English, Hindi, and Spanish models copied into the ignored `server/.local-data/` directory. On a fresh checkout, install the runtime with Python 3.11 and start it in its own terminal:

```sh
cd server
python3 -m venv .local-data/translate-venv
.local-data/translate-venv/bin/python -m pip install libretranslate==1.9.6
npm run translation
```

The first start downloads the offline models and needs internet; later translations run locally. If the process is stopped, the original comment remains visible and the page shows an error. `COMMENT_TRANSLATE_PORT` sets the API's loopback port. Machine translation and the local spam checks are prototype safeguards.

The **Moderation** sidebar link appears only for users whose local account has `role: "admin"`. The API enforces this role on every review request; registration creates ordinary members.

Run `npm test` from `server/` for account and protected-media integration checks, and `npm run build` from `yourtube/` for the frontend check.

See [DEMO_REVIEW.md](DEMO_REVIEW.md) for the VidCircle parity map, six demo journeys, fixture state and outstanding browser checks.

See the [YourTube 2.0 requirements tracker](outputs/01a0e3e8-d9b4-7433-af76-646a3e6c8cf2/YourTube_2.0_Requirements_Tracker.xlsx) for feature status and review notes. Install dependencies with `npm ci` in both app folders; generated dependencies, local media, and `.env` files are excluded from this branch.

## Migration boundary

The frontend now uses a responsive YouTube-style shell with one shared horizontal page gutter across the home feed, search, history, watch, downloads, membership, security, video rooms, owner channel, Liked videos, and Watch later pages. Feed chips sort the available uploads by recency or views.

The public `/uploads` route is removed. The clone's like, watch-later, and comment routes now use the signed-in session. The legacy comment post/edit/delete paths remain closed. Locked videos link to Membership. Room media controls are implemented, with live device and recording QA pending. Public channel profiles remain a later product slice; VidCircle's channel studio is owner-only. Silver and Gold hide the local demo ad placeholder; no external ad network is connected. Do not treat this branch as a deployable full VidCircle replacement yet. Existing accounts and videos from the original clone's database are not automatically migrated into the separate `yourtube2` database.
