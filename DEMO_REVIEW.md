# YourTube 2.0 migration and demo review

Reviewed 1 October 2026 against VidCircle's `docs/MILESTONES.md` and the current YourTube 2.0 code. This is a local prototype checkpoint. An automated API pass establishes server behaviour; it does not certify the complete browser journey.

## Feature parity

| VidCircle build | YourTube 2.0 route and implementation | Current evidence |
| --- | --- | --- |
| 1 — Accounts, channel, upload | `/sign-in`, `/channel/[id]`, `/`, `/watch/[id]`; session-owned accounts, owner-only channel studio, MP4 upload | Account and video integration tests pass. |
| 2 — Membership and protected video | `/membership`, `/watch/[id]`; signed local checkout, expiry, private media, plan/quality gates, daily watch allowance and local ad placeholder | Checkout, subscription and video integration tests pass. Free and Bronze receive the placeholder flag; Silver hides it; expiry restores it. |
| 3 — Player and progress | `/watch/[id]`; custom player, saved position, completion, quality, captions, previews and next video | Video integration tests pass. Live playback and browser controls still need review here. |
| 4 — Conversation and moderation | `/watch/[id]`, `/moderation`; Unicode comments, replies, reactions, mentions, translation, safety checks, reports and admin review | Comment integration tests pass. A real browser translation and moderation journey remains to be shown. |
| 5 — Downloads and history | `/watch/[id]`, `/downloads`; plan quota, guarded download, interrupted-transfer recovery and private history | Download integration tests pass. The browser download click and saved file remain to be checked. |
| 6 — Login security and themes | `/sign-in`, `/security`; Mailpit OTP, trusted browsers, sessions, test location and saved theme | Account/security integration tests pass. An unfamiliar-browser OTP journey still needs Mailpit and browser review. |
| 7 — Video rooms | `/rooms`, `/rooms/[id]`; signalling, live chat/files, host controls, optional media, screen share and host local recording | Room signalling test passes. Three-browser media, device changes, sharing and recording remain hands-on QA; the user will test Mac camera and microphone. |

Public channel profiles are a later YourTube product enhancement. VidCircle's channel studio is owner-only. Courses and a real ad network are outside the implemented VidCircle local prototype; the plan comparison labels courses as planned and the watch page labels the ad as a local placeholder.

## Six end-to-end demo journeys

| Journey | Browser steps to record a pass | Status |
| --- | --- | --- |
| Account and security | Register, create/edit a channel, sign out, sign in from an unfamiliar browser, read Mailpit OTP, review/revoke a session, and confirm the saved theme. | API passed; browser journey pending. |
| Purchase and expiry | Try a failed payment, then a signed simulated success; verify plan, receipt, renewal/change and expiry fallback without losing order history. | API passed; browser journey pending. |
| Watch and resume | Play a captioned video, switch allowed quality, seek, pause, reopen and resume; show the watch allowance and Free/Bronze demo ad, then compare Silver. | API passed; browser playback pending. |
| Comments and moderation | Post Hindi and Spanish comments, translate one, reply/react, report once, then review it from an admin account. | API passed; browser journey pending. |
| Download and history | Save an allowed MP4, inspect the downloaded file and private history, then confirm quota and same-video guard. | API passed; browser file check pending. |
| Create and moderate a call | Join in three signed-in browser profiles, use media and screen sharing, change host permissions, record locally, play the saved file, and rejoin after refresh. | Signalling passed; live media pending. |

## Current demo setup

- `npm run demo:seed` from `server/` created a clearly labelled creator, viewer and admin; a 16-second Free captioned MP4, a 12-second Silver MP4, and Hindi/Spanish comments. Its second run did not duplicate these records. The local `yourtube2` database then had **7 accounts, 3 videos, 1 admin, 1 captioned video and 1 premium video**. These are a local checkpoint, not fixed project totals.
- The demo credentials and record IDs are in ignored, owner-readable `server/.local-data/demo/manifest.json`. Generated media and uploads are ignored too. The fixture script changes no existing account or video. Use Mailpit OTP when signing in to these accounts from a browser; they are registered with their own normal trusted API contexts.
- The local translation service was listening on `127.0.0.1:5001`. Mailpit's UI was not listening on `127.0.0.1:8025` during this review; start it for the OTP and receipt demonstrations.
- The in-app browser connection was unavailable for this checkpoint. No browser visual or device permission check is claimed. The user will perform Mac camera/microphone testing.

## Verification record

- `npm test` from `server/`: **30/30 pass** on isolated temporary databases.
- Focused video integration test, including Free/Silver/expired ad flag checks: **5/5 pass**.
- Frontend TypeScript check: **pass**.
- Frontend production build: **pass** after the watch-page and membership edits. The local frontend and API both returned HTTP 200 after the preview restarted.
- Demo seed: **pass twice**; API checks confirmed the Free video is captioned and watchable by the viewer, the Silver video is plan-locked, both comments are visible, and the admin moderation queue is accessible. Generated sources are H.264 MP4s at 720p and 1080p. The local API and sign-in page returned HTTP 200 after seeding.

Next, start Mailpit and run the browser journeys with the seeded accounts. Record each journey's result in this table; treat room media as pending until the user's live-device results are available.
