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

Open `http://127.0.0.1:3000/sign-in` and create a local account. Use `127.0.0.1` consistently for the frontend and API so the browser sends the local session cookie. The API defaults to `http://127.0.0.1:5000`, and the database defaults to `mongodb://127.0.0.1:27017/vidcircle`. Optional settings are listed in `server/.env.example`.

## Check the first build

```sh
cd server && npm test
cd ../yourtube && npm run build
```

Build 1 covers local registration, sign-in, sign-out, session restoration, and creating and editing your own channel profile. The later builds add subscription checks, protected media, the player, comments, downloads, OTP and calls. Existing prototype pages outside Build 1 still contain unfinished behaviour and lint errors; see the milestone plan for their sequence.
