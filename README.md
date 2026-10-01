<h1 align="center">▶ YourTube 2.0</h1>

<p align="center">
  A YouTube-inspired video app with VidCircle's creator, community, membership, and security features.
</p>

<p align="center">
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15.3.3-000000?logo=nextdotjs&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white">
  <img alt="Express 5" src="https://img.shields.io/badge/Express-5-303030?logo=express&logoColor=white">
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-local-47A248?logo=mongodb&logoColor=white">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#local-demo">Local demo</a> ·
  <a href="#project-status">Project status</a> ·
  <a href="outputs/01a0e3e8-d9b4-7433-af76-646a3e6c8cf2/YourTube_2.0_Requirements_Tracker.xlsx">Requirements tracker</a>
</p>

> [!NOTE]
> This branch is a **local review build**. Checkout is simulated, the ad is a demo placeholder, and live room media still needs hands-on QA.

## Features

| Area | What is included |
| --- | --- |
| **Accounts & security** | Registration, password sign-in, session cookies, Mailpit one-time codes, trusted browsers, session controls, and owner-checked channel edits. |
| **Videos & player** | Signed-in feed and search, MP4 uploads, optional WebVTT captions, private previews, quality variants, protected streaming, watch progress, and playback controls. |
| **Membership & downloads** | Free-to-Gold plans, simulated checkout, receipts, renewal and plan changes, viewing limits, protected downloads, and private download history. |
| **Community** | Likes, Watch later, threaded comments, mentions, reactions, translation, reports, and admin moderation. |
| **Video rooms** | Private rooms for up to four people, live chat and small files, host controls, optional camera and mic, screen sharing, and local recording. |
| **Interface** | Responsive YouTube-style pages with consistent spacing and light, dark, or automatic appearance. |

## Quick start

You need **Node.js 22** and npm. Install `ffmpeg` and `ffprobe` if you want to upload videos or generate demo media. The local MongoDB runner downloads its binary on first use; a separate MongoDB installation is not required.

```sh
git clone --branch codex/yourtube-2.0-migration-20261002 https://github.com/tannie77/Yourtube.git yourtube-2.0
cd yourtube-2.0
npm --prefix server ci
npm --prefix yourtube ci
cp server/.env.example server/.env
```

Start these commands in **three separate terminals**, from the repository root:

| Terminal | Command | Service |
| --- | --- | --- |
| 1 | `npm --prefix server run db` | Local MongoDB on `127.0.0.1:27017` |
| 2 | `npm --prefix server start` | API on `127.0.0.1:5000` |
| 3 | `npm --prefix yourtube run dev -- --hostname 127.0.0.1` | App on `127.0.0.1:3000` |

Open **[http://127.0.0.1:3000](http://127.0.0.1:3000)**. The sign-in page offers **Continue with local preview** in development, which creates a local demo account. Use `127.0.0.1` for both the app and API so session cookies behave consistently.

The server's local defaults are in [`server/.env.example`](server/.env.example). The frontend uses `http://127.0.0.1:5000` by default; set `NEXT_PUBLIC_BACKEND_URL` if your API runs elsewhere. The app uses the separate `yourtube2` database and does not import accounts or videos from the original clone.

## Local demo

With MongoDB and the API running, create sample accounts, videos, captions, and comments:

```sh
npm --prefix server run demo:seed
```

The seed creates a **creator, viewer, and admin**, plus a Free captioned video, a Silver video, and Hindi and Spanish comments. It only accepts the loopback `yourtube2` database and local API. Generated credentials and record IDs are saved to the ignored, owner-readable `server/.local-data/demo/manifest.json`. Run it again without duplicating the fixtures.

<details>
<summary><strong>Mailpit for sign-in codes and receipts</strong></summary>

An unfamiliar browser needs a one-time code. Install Mailpit, then start its local SMTP server and inbox from the repository root:

```sh
mkdir -p server/.local-data
mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025 --database server/.local-data/mailpit.db --disable-version-check
```

Read messages at **[http://127.0.0.1:8025](http://127.0.0.1:8025)**. The development preview sign-in does not need Mailpit.

</details>

<details>
<summary><strong>Optional comment translation</strong></summary>

Translation runs in a separate LibreTranslate process. With Python 3.11 installed, run:

```sh
python3.11 -m venv server/.local-data/translate-venv
server/.local-data/translate-venv/bin/python -m pip install libretranslate==1.9.6
npm --prefix server run translation
```

The first start downloads English, Hindi, and Spanish models. If this service is stopped, comments remain visible and translation requests show an error.

</details>

## Repository layout

| Path | Purpose |
| --- | --- |
| [`yourtube/`](yourtube/) | Next.js Pages Router frontend |
| [`server/`](server/) | Express API, MongoDB models, media processing, and room signalling |
| [`DEMO_REVIEW.md`](DEMO_REVIEW.md) | VidCircle feature parity and browser demo journeys |
| [`YourTube 2.0 requirements tracker`](outputs/01a0e3e8-d9b4-7433-af76-646a3e6c8cf2/YourTube_2.0_Requirements_Tracker.xlsx) | Feature status and review notes |

## Checks

Run these from the repository root:

```sh
npm --prefix server test
npm --prefix yourtube run build
```

## Project status

The latest local checkpoint passed **30 server integration tests** and the **frontend production build**. See [`DEMO_REVIEW.md`](DEMO_REVIEW.md) and the [requirements tracker](outputs/01a0e3e8-d9b4-7433-af76-646a3e6c8cf2/YourTube_2.0_Requirements_Tracker.xlsx) for the feature-by-feature review.

- Browser walkthroughs for sign-in, playback, purchases, translation, and downloads remain to be recorded.
- Three-browser room media, device changes, screen sharing, and recording need live QA. Rooms use a local WebRTC mesh without a TURN relay, so connections outside a local network are not guaranteed.
- Public channel profiles, a real ad network, real payments, and migration of old clone database records are not included in this branch.
- Keep `.env` files, generated dependencies, uploads, and `server/.local-data/` out of Git. Review dependency advisories before any production deployment.

---

Built from [BitHeadmr's YourTube clone](https://github.com/BitHeadmr/you_tube2.0) with VidCircle features migrated into its interface.
