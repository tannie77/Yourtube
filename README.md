# VidCircle local prototype

VidCircle is one local video-platform application built from the existing YourTube codebase. The six internship requirements are delivered as reviewable builds in [the milestone plan](docs/MILESTONES.md). Cloud integrations are replaced by clearly labelled local equivalents until the corresponding application flows work end to end.

## Run locally

Use Node.js 22 or newer and install local `ffprobe`/`ffmpeg` with the `libx264` and AAC encoders. Uploads use them to inspect the MP4, make lower-quality copies and generate timeline frames; integration tests also use them. From `server/`, install dependencies and start the local database in one terminal:

```sh
cd server
npm install
npm run db
```

The first database start downloads a MongoDB executable into `server/.local-data/`. Subsequent starts reuse it and preserve the local database. In a second terminal, start the API:

```sh
cd server
npm run start
```

In a third terminal, start the frontend:

```sh
cd yourtube
npm install
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000`; it redirects to sign-in. After creating a local account or signing in, the app opens `/dashboard`. Use `127.0.0.1` consistently for the frontend and API so the browser sends the local session cookie. The API defaults to `http://127.0.0.1:5000`, and the database defaults to `mongodb://127.0.0.1:27017/vidcircle`. Optional settings are listed in `server/.env.example`.

## Try the local video flow

1. Create an account, then create a channel from the dashboard.
2. Open your channel, choose an MP4 up to 100 MB, optionally add a WebVTT caption file up to 1 MB, give it a title and upload it. Generating local qualities and preview frames can take a while for longer clips.
3. Watch it from your channel or the dashboard. The watch page has custom controls and saves your position for the next visit.
4. Refresh the page or sign in with another account to check that the video remains in the library. A user cannot upload under another channel's identity.

Video files stay in `server/uploads/` and metadata stays in local MongoDB. Files are served only through the authenticated `/video/:id/media` endpoint, which checks the current plan and daily allowance. Uploaded files, database data and credentials must not be committed. A browser-saved copy cannot be revoked.

## Check the first build

```sh
cd server && npm test
cd ../yourtube && npm run build
```

Build 1 covers local registration, sign-in, sign-out, session restoration, channel creation/editing, a dashboard, MP4 upload and basic playback. Build 2 covers local membership and protected media. Build 3 adds custom player controls, saved progress, local quality choices, optional captions, timeline previews and next-video controls. Later builds add comments, downloads, OTP and calls. Existing prototype pages outside the new routes still contain unfinished behaviour and lint errors; see the milestone plan for their sequence.

## Build 2: local membership and protected playback

From the signed-in dashboard, open **Membership** to compare Free, Bronze, Silver and Gold across monthly, quarterly and yearly sample prices. New accounts start on Free; an expired paid record also reads as Free. Select a paid plan, create a local test order, then simulate success, failure or cancellation. Only a signed, server-verified success changes the membership. Failed and cancelled orders leave it unchanged. Orders and test-payment references appear in the account's local history, and retrying the same checkout request or result is safe.

The same test checkout supports manual renewals, immediate upgrades and prepaid downgrades scheduled for the current term's end. Upgrades do not prorate unused time. Cancellation marks the end of the last prepaid term; nothing renews automatically. The page shows remaining days, scheduled changes, order history and a local test receipt. An expired term reads as Free without deleting its orders.

This is a simulation: no card details, payment provider or real money are involved. The order reference and receipt are not tax invoices. A test checkout interrupted before verification does not activate a plan; reopening and verifying the same signed result resumes safely.

### Protected local videos

Channel owners can choose a minimum viewer plan (Free, Bronze, Silver or Gold) while uploading an MP4, and optionally give Gold members seven days of early access. Existing uploads without a plan remain Free and get source metadata on first read. New uploads generate lower-resolution copies where needed. Video access is the higher of the owner's minimum plan and the lowest available quality; selecting a quality is then capped at Free/480p, Bronze/720p, Silver/1080p or Gold/4K. Older uploads without copies retain the source-resolution gate. The uploader can always preview their own file. Signed-in viewers see locked cards and a Membership link. The API checks the current subscription on every media request, including byte ranges; expired plans lose paid access. Only authenticated `/video/:id/media` serves stored files, so a direct URL does not bypass the checks.

On first playback of each video per IST day, the server reserves that clip's full duration against the plan's daily allowance (Free 60, Bronze 180, Silver 360 minutes; Gold unlimited). Later range requests and replays of that same clip do not charge again. A clip longer than the remaining allowance cannot start. This is an intentionally approximate local plan meter, not a measurement of seconds actually watched for billing or quota. Starting protected playback also records an owner-only watch-history entry; the `/history` page keeps it after plan expiry. Free/Bronze see a clearly labelled local ad placeholder; Silver/Gold do not. No ad network is contacted. Phase 3B saves viewing progress separately. Daily download quotas and exclusive courses belong to later builds.

## Build 3A: custom local player

Open any video your plan can watch. The player now has its own controls for play/pause, a draggable timeline, 10-second skips, volume/mute, 0.5×–2× speed, theatre mode, full screen, Picture-in-Picture, loading/buffer/progress information and a keyboard-help panel. Controls hide while playing and return when you move the pointer or focus them. Shortcuts: Space or K to play/pause; left/right for 10 seconds; Shift+left/right for 30 seconds; up/down for volume; M for mute; comma/period for slower/faster; T for theatre; F for full screen; P for PiP; ? or H for help. Shortcuts are ignored while typing in a field. Full screen and PiP depend on browser support and may be unavailable in the in-app browser.

## Build 3B: saved watch progress

The player loads your private saved position before playback and resumes there when you press Play. It saves about every five seconds and on pause, seek, end or leaving the page. **Start over** clears the resume point. A video is marked complete after the configured percentage of its duration has actually played; skipping ahead does not count. The local API setting `WATCH_COMPLETE_PERCENT` defaults to `90` and accepts `1`–`100`. Replaying a segment can count again in this simple prototype. Completed videos reopen from the beginning. If another VidCircle tab in the same browser profile starts playing, the first pauses automatically. This does not coordinate separate devices or replace Build 2's approximate daily watch allowance.

## Build 3C: local quality, captions and up next

New uploads make real lower-resolution MP4 copies locally. The watch player lists all available qualities, greys out those above your plan and keeps your position while changing between allowed copies. An optional uploaded UTF-8 `.vtt` file enables the captions button and C shortcut. Moving over the seek bar shows a generated frame and time. When a clip ends, a five-second countdown offers the next watchable library video; choose **Play now** or **Cancel**, or press N to go next immediately. Captions and preview frames require the same signed-in video access but do not consume daily watch minutes. All generation and playback stay local. A short sample, **Build 3 quality and captions demo**, is available in the local library when using this workspace's existing database. Full-screen and PiP remain browser-dependent and should be checked in a normal supporting browser.

### Local receipt inbox

Install [Mailpit](https://mailpit.axllent.org/docs/install/) as a local binary, then run it in another terminal from the project root:

```sh
mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025 --database server/.local-data/mailpit.db --disable-version-check
```

Open `http://127.0.0.1:8025` to view captured test emails. Mailpit does not deliver them to real addresses. If Mailpit is stopped, verified membership changes still succeed: the receipt stays visible in the app, its email status shows as unavailable, and **Retry local email** sends it after Mailpit starts. The API connects only to `127.0.0.1`; its SMTP port can be changed with `MAILPIT_SMTP_PORT`.
