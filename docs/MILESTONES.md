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

**Progress:** The first slice provides the server-owned plan catalogue, sample INR prices, a signed-in comparison page and an effective Free-plan read model (including expiry fallback). The next slice adds server-priced local test orders, signed success/failure/cancel results, verification before activation, retry-safe order creation/result handling, and account-only order history with a test reference. No money moves, and the reference is not a tax invoice. Receipt email, plan changes/renewal/cancellation, and media entitlement enforcement remain pending. The displayed benefits are labelled as planned until their access rules are implemented.

**Done when:** a failed or interrupted payment cannot activate a plan; a verified simulated payment can; refresh/duplicate payment is idempotent; an expired plan becomes Free without deleting watch history; direct protected-media requests are denied without access.

## Build 3 — Custom video player and watch progress

Add play/pause, volume/mute, speed, 10-second and larger skips, theatre/full-screen, PiP, captions, current/total/remaining time, buffering and progress displays, loading state, quality display and selection, next-video countdown/cancel, auto-hiding controls and all requested desktop shortcuts. Generate local preview frames for timeline hover. Save per-user playback position periodically, resume, mark completion at a configured percentage and coordinate playback across open app tabs.

**Done when:** a user can pause midway, reopen the video on another browser session and resume; Free and paid quality choices differ; captions, shortcuts, previews and the next-video countdown work with prepared local sample clips.

## Build 4 — Multilingual comments and moderation

Allow Unicode comments, replies, @mentions, reactions, edit/delete within a time window, all four sort orders and on-demand translation with local LibreTranslate. Display user name, image, profile location, timestamps and edited status. Add basic abusive-word, link, duplicate, emoji/special-character and flood checks, rate limits and a local challenge after repeated attempts. Add report reasons, an administrator review queue, revision history and moderation log. Keep replies visible beneath a deleted-parent placeholder and reject conflicting edits by revision number.

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
