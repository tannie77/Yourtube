# VidCircle build milestones

## Working agreement

- One Next.js frontend, one Express API and one local MongoDB database.
- Every requirement gets a visible local user flow and stored state before optional cloud integrations are considered.
- External-world boundaries use named test doubles: a simulated payment, Mailpit inbox, local translation model, and local WebRTC room. The UI must identify simulated payments and location data.
- A build is complete when its main flow and specified failure cases pass locally. Review each build locally first; do not commit or push to GitHub without agreeing that handoff with the user.
- Preserve existing work and never commit local database files, uploaded media, credentials or downloaded binaries.

## Build 1 — Local foundation and accounts

Replace Firebase-only sign-in with local email/password registration, sign-in, sign-out and persisted sessions. Keep the existing frontend and API. Provide a one-command local MongoDB launcher, setup instructions and an integration test for account lifecycle and profile ownership. Add a polished dashboard and channel studio, local MP4 upload, real video cards and a basic browser-controlled watch page. Keep custom player controls and protected-media rules for later builds.

**Done when:** two users can create accounts in separate browsers, refresh without losing their sessions, sign out independently, and cannot edit one another's profiles. A user can create and edit a channel profile. An MP4 uploaded by a channel owner appears in the dashboard and channel library after refresh, and another signed-in user can watch it but cannot upload under that owner's identity. The API tests and frontend build pass.

## Build 2 — Plans, simulated checkout and video access

Define Free, Bronze, Silver and Gold in one plan configuration with sample prices, monthly/quarterly/yearly terms, feature comparison and renewal rules. Add the dashboard, simulated payment order and signed test result, payment/invoice history, upgrade/downgrade/renew/cancel, receipt email to Mailpit and effective Free plan after expiry. Add server-side entitlement checks for premium videos, quality, watch time, early access, ad display and daily usage limits. Serve protected video through an authorised endpoint instead of the public uploads path.

**Status: locally complete for the agreed prototype scope.** The catalogue, comparison page, server-priced signed test checkout, account-only order history, renewal/upgrade/prepaid downgrade/cancellation, expiry fallback and Mailpit test receipts work. Interrupted and duplicate verification can resume without a second activation. The protected media endpoint checks each request; old public upload URLs do not serve files. Uploaders choose a minimum plan and may enable a seven-day Gold early-access window. New uploads receive local lower-quality renditions, and the API limits each rendition to Free/480p, Bronze/720p, Silver/1080p or Gold/4K. Older uploads without renditions retain their source-resolution gate; existing uploads are classified on first read. Free/Bronze see a labelled local ad placeholder; Silver/Gold do not. The server reserves a clip's full duration once per user/video/IST day before streaming, enforcing a daily allowance and recording owner-only watch history that survives expiry. This is an approximate allowance, not actual played-second quota tracking: replaying the same clip is free that day, and a clip longer than the remaining allowance cannot start. The payment and ad are simulations; the receipt is not a tax invoice. Phase 3B saves viewing progress separately. Download quotas and exclusive courses remain later-scope benefits.

**Done when:** a failed or interrupted payment cannot activate a plan; a verified simulated payment can; refresh/duplicate payment is idempotent; an expired plan becomes Free without deleting watch history; direct protected-media requests are denied without access.

## Build 3 — Custom video player and watch progress

Add play/pause, volume/mute, speed, 10-second and larger skips, theatre/full-screen, PiP, captions, current/total/remaining time, buffering and progress displays, loading state, quality display and selection, next-video countdown/cancel, auto-hiding controls and all requested desktop shortcuts. Generate local preview frames for timeline hover. Save per-user playback position periodically, resume, mark completion at a configured percentage and coordinate playback across open app tabs.

**Phase 3A — custom controls: locally implemented, awaiting user review.** The native controls are replaced with play/pause, draggable seek and volume sliders, mute, five speeds, 10-second buttons, 30-second Shift+arrow skips, theatre mode, full-screen and PiP controls, current/total/remaining time, buffered/progress tracks, loading state, source-quality label, auto-hide and a shortcut-help panel. Space/K, arrows, M, comma/period, T, F, P and ?/H work when focus is not in an input. The browser check covered playback, seek, volume, speed, theatre and auto-hide. The in-app browser did not complete full-screen or PiP transitions; the code shows a browser-support notice, and those two controls still need a manual check in a normal browser.

**Phase 3B — locally implemented, awaiting user review.** A private per-user progress record saves position every five seconds, on pause/seek/end and when leaving the player. Reopening an unfinished video loads its saved position before playback; completed videos replay from the start. Completion uses accumulated playback time rather than the playhead position, so skipping to the end does not complete a video. `WATCH_COMPLETE_PERCENT` defaults to 90 and can be set from 1 to 100. Repeated playback can count again in this prototype. BroadcastChannel with a storage-event fallback pauses an older player when another VidCircle tab starts; this coordinates tabs in one browser profile, not separate devices. The existing daily plan allowance remains a separate approximate reservation meter. Local API and browser checks covered persistence, ownership, plan gates, resume, skip-versus-completion and two-tab pause behaviour.

**Phase 3C — locally implemented, awaiting user review.** New MP4 uploads generate local lower-resolution copies and up to eight timeline JPEGs. The player shows the source/available qualities, disables qualities above the viewer's active plan, and preserves position when switching. The API independently enforces the quality cap on direct and ranged media requests. Uploaders may attach one UTF-8 WebVTT file; captions and preview frames are served only to viewers entitled to the video. The player exposes a caption toggle and C shortcut, timeline hover frames, N for the next watchable video, and a five-second next-video countdown with Play now and Cancel. Local API tests covered rendition access, expired plans, caption/preview privacy and output; the browser check covered Free's disabled 720p option, 480p playback, caption toggle, timeline preview, automatic next navigation and cancellation. Full-screen and PiP still need a manual check in a supporting browser. Existing MP4s without renditions keep their original source-resolution gate until re-uploaded.

**Done when:** a user can pause midway, reopen the video on another browser session and resume; Free and paid quality choices differ; captions, shortcuts, previews and the next-video countdown work with prepared local sample clips.

## Build 4 — Multilingual comments and moderation

Allow Unicode comments, replies, @mentions, reactions, edit/delete within a time window, all four sort orders and on-demand translation with local LibreTranslate. Display user name, image, profile location, timestamps and edited status. Add basic abusive-word, link, duplicate, emoji/special-character and flood checks, rate limits and a local challenge after repeated attempts. Add report reasons, an administrator review queue, revision history and moderation log. Keep replies visible beneath a deleted-parent placeholder and reject conflicting edits by revision number.

**Phase 4A — locally implemented, awaiting user review.** Signed-in viewers can write Unicode comments and replies on the current watch page. The API derives the author from the session, validates the video and reply target, and limits comments to 2,000 Unicode characters. Authors can edit or soft-delete for 15 minutes by default (`COMMENT_EDIT_WINDOW_MINUTES` can set 1–1,440); the server enforces the window and ownership. The page shows the available author name/image, IST timestamp and edited state. A deleted parent becomes a placeholder while its replies remain visible. Integration tests cover forged identities, cross-account changes, invalid inputs, expiry and deleted-parent replies. Profile location, reactions, mentions, sorting, translation and moderation remain later Build 4 work.

**Phase 4B — locally implemented, awaiting user review.** Every account receives a stable generated `@username`, including existing local accounts when the API starts. A signed-in user can add a self-reported location and upload or remove a PNG/JPEG/WebP profile picture of up to 256 KB; the picture is stored in local MongoDB. The watch page suggests users after `@`, resolves real handles when comments are saved, and displays each author's handle, picture and location (or a not-shared label). One like or dislike per account can be added, switched or cleared. Comments can be sorted newest, oldest, most liked, or most relevant; relevance is a simple local score combining likes, dislikes, direct replies and recency. Edits and deletes require the current revision number, so simultaneous stale changes are rejected. Each new comment keeps an atomic create/edit/delete history visible only to its author; older 4A comments begin with a snapshot of their current text because earlier revisions cannot be reconstructed. Translation, abuse/spam controls, reports and administrator review remain Phase 4C.

**Phase 4C — locally implemented, awaiting user review.** A separately launched LibreTranslate process serves English, Hindi and Spanish translation through downloaded local Argos models. Each user chooses a preferred language, and comments are translated on demand and cached by revision; failures leave the original visible. The API applies basic abuse, link, repetition and duplicate checks on new posts (and content checks on edits), plus a per-account minute window with a local arithmetic challenge and hard attempt cap. Users may report another user's comment once for spam, harassment or offensive content. A locally designated administrator sees an access-controlled review queue, can dismiss a report or soft-remove a comment, and can inspect retained review logs. Dislikes do not remove comments. API regression tests and the frontend production build pass; a final signed-in browser check and user review remain. These safeguards and translations are intentionally small-prototype versions, not production-grade spam detection or human-language moderation.

**Done when:** two users can discuss one video in different languages, translate a comment, report it once, and an admin can review it. Invalid and duplicate submissions are blocked; translation failure leaves the original visible.

## Build 5 — Quota-controlled downloads

Enforce plan-specific daily/monthly limits, video access and subscription expiry on each download. Store records with user/video, time, IP, device/browser details, plan, status and file size. Show a Downloads profile page with remaining quota. Handle duplicate requests within a documented window, failed/interrupted streams, simultaneous requests and IST day-boundary resets through server-side reservations and atomic counters. Optional registered-device restriction uses the trusted-device data from Build 6.

**Done when:** Free cannot exceed one download per IST day, higher plans receive their configured limits, failed requests do not consume quota, and concurrent requests cannot exceed it.

## Build 6 — Login security, OTP and themes

Record login attempts, browser/version, OS, device type/model when available, IP and local test location. Apply the 5:00 AM–12:00 PM IST light-theme default unless the user has manually chosen a theme; persist the choice across sessions. For a new browser, device, IP or test city/state, send an OTP to the local Mailpit inbox before issuing a session. Store verification/failure history, trusted-device expiry and active sessions. Add an account-security page for review and revocation.

**Done when:** an unfamiliar browser requires the locally delivered OTP, a trusted browser can return within its configured period, a changed test location triggers verification, and the user can revoke a session and keep a manual theme choice.

## Build 7 — Local video rooms

Create authenticated room IDs and links. Use a local Socket.IO signalling server and browser WebRTC for one-to-one and small group rooms. Implement mute/camera/device switch, screen share, leave/end, participant list, speaking/connection indicators, call timer, raise hand, chat and small file sharing. Give hosts mute/remove/lock/co-host and sharing/chat permissions. Handle refresh/rejoin, device switching, permission denial, noise-suppression controls, low-bandwidth fallback and a small enforced participant limit. Offer browser-supported host-only local recording. Peer media uses WebRTC's encrypted transport.

**Done when:** three browser sessions can join the same room, use the essential controls, recover after refresh, and a host can enforce room permissions. Recording and browser-specific controls show an honest unsupported state when unavailable.

## Build 8 — Complete local demonstration

Prepare short sample videos, captions, translation languages and separate viewer/admin accounts. Test the six complete journeys: account/security; purchase/expiry; watch/resume; comments/moderation; quota/download history; and create/join/moderate a call. Record a pass/fail result for each original requirement and label local simulations in the demonstration.

**Done when:** the original specification has no untracked item, all local flows pass, and the README can reproduce the demo on another development machine after dependencies are installed.

## Limits of a local prototype

Local checkout does not move money; Mailpit does not deliver to real addresses; localhost does not reveal a meaningful public IP or geographic location. A saved video file cannot be revoked after it leaves the app, and small local WebRTC rooms do not represent internet-scale conferencing. These are documented boundaries, not hidden omissions.
