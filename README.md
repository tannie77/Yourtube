# VidCircle local prototype

VidCircle is one local video-platform application built from the existing YourTube codebase. The six internship requirements are delivered as reviewable builds in [the milestone plan](docs/MILESTONES.md). Cloud integrations are replaced by clearly labelled local equivalents until the corresponding application flows work end to end.

## Run locally

Use Node.js 22 or newer. From `server/`, install dependencies and start the local database in one terminal:

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
2. Open your channel, choose an MP4 up to 100 MB, add a title and upload it.
3. Watch it from your channel or the dashboard. The watch page uses the browser's basic video controls; advanced controls and watch progress are later milestones.
4. Refresh the page or sign in with another account to check that the video remains in the library. A user cannot upload under another channel's identity.

Video files stay in `server/uploads/` and metadata stays in local MongoDB. The current `/uploads/` media URL is public to anyone who knows it; subscription protection arrives in Build 2. Do not use this prototype for private videos yet. Uploaded files, database data and credentials must not be committed.

## Check the first build

```sh
cd server && npm test
cd ../yourtube && npm run build
```

Build 1 covers local registration, sign-in, sign-out, session restoration, channel creation/editing, a dashboard, MP4 upload and basic playback. Later builds add subscriptions, protected media, custom player controls, comments, downloads, OTP and calls. Existing prototype pages outside Build 1 still contain unfinished behaviour and lint errors; see the milestone plan for their sequence.

## Build 2 in progress: local membership checkout

From the signed-in dashboard, open **Membership** to compare Free, Bronze, Silver and Gold across monthly, quarterly and yearly sample prices. New accounts start on Free; an expired paid record also reads as Free. Select a paid plan, create a local test order, then simulate success, failure or cancellation. Only a signed, server-verified success activates the chosen term. Failed and cancelled orders leave the membership unchanged. Orders and test-payment references appear in the account's local history, and retrying the same checkout request or result is safe.

This is a simulation: no card details, payment provider or real money are involved. The displayed benefits are still planned, not enforced video entitlements. Receipts, plan changes and renewals, and protected video access are later Build 2 slices. The order reference is not a tax invoice.
