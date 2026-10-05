<h1 align="center">▶ YourTube 2.0</h1>

<p align="center">
  A YouTube-inspired video app with creator, community, membership, and security features.
</p>

<p align="center">
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15.3.3-000000?logo=nextdotjs&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white">
  <img alt="Express 5" src="https://img.shields.io/badge/Express-5-303030?logo=express&logoColor=white">
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#optional-atlas-demo-data">Local demo</a> ·
  <a href="#project-status">Project status</a>
</p>

> [!NOTE]
> This branch runs the API against MongoDB Atlas. Razorpay Test subscriptions need provider approval and plan IDs. External email, city-level login locations, and reliable calls across restrictive networks need optional services. The ad is a demo placeholder.

## Features

| Area | What is included |
| --- | --- |
| **Accounts & security** | Registration, password sign-in, session cookies, Mailpit or external SMTP one-time codes, trusted browsers, session controls, optional GeoIP city lookup, and owner-checked channel edits. |
| **Videos & player** | Signed-in feed and search, MP4 uploads, optional WebVTT captions, private previews, quality variants, protected streaming, watch progress, and playback controls. |
| **Membership & downloads** | Free-to-Gold plans, local and credential-ready Razorpay Test checkout, recurring billing webhooks, test invoices and receipts, daily and monthly download limits, trusted-browser restriction, and a browser offline library for paid plans. |
| **Community** | Likes, Watch later, threaded comments, mentions, reactions, English/Hindi/Spanish/French/Urdu translation, spam checks, optional Turnstile verification, reports, and admin moderation. |
| **Video rooms** | Private rooms for up to four people, live chat and small files, host controls, optional camera and mic, screen sharing, local recording, adaptive camera quality, and invitation-key media encryption in supported browsers. |
| **Interface** | Responsive YouTube-style pages with consistent spacing and light, dark, or automatic appearance. |

## Quick start

You need **Node.js 22**, npm, and a MongoDB Atlas cluster. Install `ffmpeg` and `ffprobe` if you want to upload videos. In Atlas, create a database user with read/write access to the database and add this computer's public IP to the project's [IP Access List](https://www.mongodb.com/docs/atlas/security/ip-access-list/). Copy the [Drivers connection string](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/) and put it in the ignored `server/.env` as `MONGODB_URI`. Replace the username and password placeholders, percent-encoding special characters in the password. Set `MONGODB_DB_NAME` to the database you want this app to use (default `yourtube2`). Do not commit the URI.

```sh
git clone --branch yourtube2.0 https://github.com/tannie77/Yourtube.git yourtube-2.0
cd yourtube-2.0
npm --prefix server ci
npm --prefix yourtube ci
cp server/.env.example server/.env
# Edit server/.env and set MONGODB_URI to your Atlas driver URI.
npm --prefix server run db:check
```

Start these commands in **two separate terminals**, from the repository root:

| Terminal | Command | Service |
| --- | --- | --- |
| 1 | `npm --prefix server start` | API on `127.0.0.1:5000`, backed by Atlas |
| 2 | `npm --prefix yourtube run dev -- --hostname 127.0.0.1` | App on `127.0.0.1:3000` |

Open **[http://127.0.0.1:3000](http://127.0.0.1:3000)**. The sign-in page offers **Continue with local preview** in development, which creates a local demo account. Use `127.0.0.1` for both the app and API so session cookies behave consistently.

The server configuration template is [`server/.env.example`](server/.env.example). Startup fails clearly if the Atlas URI is absent or a local MongoDB URL is supplied. The frontend uses `http://127.0.0.1:5000` by default; set `NEXT_PUBLIC_BACKEND_URL` if your API runs elsewhere. Atlas starts with its own data; existing local MongoDB accounts and records are **not automatically migrated**. Uploaded MP4s, captions and previews remain in `server/uploads/` on this computer, so moving the API to another machine also requires moving those files or adding shared media storage.

If Node reports refused Atlas SRV lookups even though the hostname resolves in Windows, set `MONGODB_DNS_SERVERS` in `server/.env` to DNS resolver IPs such as `1.1.1.1,8.8.8.8` and retry `db:check`.

### Copy existing local data to Atlas

The migration tool copies every `yourtube2` collection, preserving document IDs and indexes. It refuses an Atlas destination that already contains records and never deletes the local database. Keep the old local MongoDB process running for the copy, but stop the old API first so records do not change mid-copy. With `MONGODB_URI` and `MONGODB_DB_NAME` set in `server/.env`, run:

```powershell
npm --prefix server run db:migrate -- --source-only
npm --prefix server run db:migrate -- --preflight
npm --prefix server run db:migrate -- --apply
npm --prefix server run db:check
```

The source-only step also checks every referenced video, rendition, caption and preview file in `server/uploads/`. The migration copies database records, **not the media files**; those files stay in this project folder. Start the Atlas-backed API only after the copy verifies. If the destination is not empty, inspect its records before deciding on a merge; the tool will not overwrite them.

### Optional Razorpay Test and email

To enable Razorpay Test checkout, fill in `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and all nine plan IDs in `server/.env`. Create one matching [Razorpay Test plan](https://razorpay.com/docs/api/payments/subscriptions/create-plan/) for each Bronze, Silver, and Gold billing period. Register the `/subscriptions/razorpay/webhook` endpoint for `subscription.charged`, `subscription.cancelled`, `subscription.completed`, and `subscription.halted`. The webhook must be reachable by Razorpay; a local-only URL cannot receive provider callbacks. The app verifies checkout and webhook signatures before membership activation. A Razorpay Test checkout activates access only after a captured charge webhook, and recurring charges update the expiry and billing history.

Receipts and sign-in codes use Mailpit by default. Receipts include a printable HTML test invoice attachment. For external delivery, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `server/.env`. External SMTP requires TLS. Set `SUPPORT_EMAIL` and the `INVOICE_SELLER_*` fields for invoice details. All payments here are tests, so the printable invoice remains clearly marked as a **test document**, not a legally valid tax invoice.

Email delivery is currently paused with `EMAIL_DELIVERY_DISABLED=true` in the ignored `server/.env`. This blocks both OTP and receipt messages before any SMTP connection. Existing trusted sessions still work, but signing in from a new browser or device cannot complete until delivery is explicitly resumed. Set the value to `false` and restart the API only when you want email delivery again.

Rooms created from the app generate a secret in the invitation URL fragment. Share the complete link. The API stores only a digest of the secret; the browser uses it to encrypt encoded audio and video frames. Browsers without WebRTC encoded transforms cannot join encrypted rooms. Legacy rooms still use WebRTC transport encryption. Chat, small files, and local recordings are outside the media encryption layer.

Calls use `stun:stun.cloudflare.com:3478` by default. Set `ROOM_TURN_URLS`, `ROOM_TURN_USERNAME`, and `ROOM_TURN_CREDENTIAL` in `server/.env` for a TURN relay when calls must work across restrictive networks. Multiple STUN or TURN URLs are comma separated. The call page reduces camera resolution automatically when WebRTC reports sustained poor outbound quality. Test microphone, camera, switching, screen sharing, and reconnection with the actual browsers and networks you will use.

The security page records browser, OS, device, IP, and login attempts. For automatic city, state, country, and approximate coordinates, obtain a GeoLite2 City/GeoIP2 City `.mmdb` file and set its absolute path as `GEOIP_CITY_DB_PATH` in `server/.env`. Local and private IP addresses do not have a public GeoIP location. If the API runs behind a reverse proxy, list only its exact IP address in `TRUSTED_PROXY_IPS` so forwarded IP headers cannot be supplied directly by clients. Without a city database, the location fields remain empty while login and OTP checks continue to work.

For real CAPTCHA after repeated comment posts, configure both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in `server/.env`. The backend verifies tokens with Turnstile before accepting the post. Without both keys, the local arithmetic challenge remains active. The comment filter also blocks links, repeated symbols and emoji, abusive terms, excessive mentions, and near-identical repeat posts.

## Optional Atlas demo data

To try the Atlas-backed app without sample data, register an account and upload a video through the UI. If you want fixture accounts and videos, first set `MONGODB_DB_NAME=yourtube2_demo` in `server/.env` and start the API with that same setting. Then run:

```powershell
$env:ALLOW_ATLAS_DEMO_SEED = "true"
npm --prefix server run demo:seed
Remove-Item Env:ALLOW_ATLAS_DEMO_SEED
```

The seed refuses the main `yourtube2` database. It creates a **creator, viewer, and admin**, plus a Free captioned video, a Silver video, and Hindi and Spanish comments in the separate Atlas demo database. Generated credentials and record IDs are saved to the ignored, owner-readable `server/.local-data/demo/manifest-yourtube2_demo.json`. Run it again without duplicating the fixtures.

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

Translation runs in a separate LibreTranslate process. With Python 3.11 installed, run on Windows PowerShell:

```powershell
py -3.11 -m venv server/.local-data/translate-venv
server/.local-data/translate-venv/Scripts/python.exe -m pip install libretranslate==1.9.6
server/.local-data/translate-venv/Scripts/python.exe server/scripts/install-translation-models.py
npm --prefix server run translation
```

On macOS or Linux, use:

```sh
python3.11 -m venv server/.local-data/translate-venv
server/.local-data/translate-venv/bin/python -m pip install libretranslate==1.9.6
server/.local-data/translate-venv/bin/python server/scripts/install-translation-models.py
npm --prefix server run translation
```

The model installer downloads English pairs for Hindi, Spanish, French, and Urdu into ignored local data. If this service is stopped, comments remain visible and translation requests show an error.

</details>

## Repository layout

| Path | Purpose |
| --- | --- |
| [`yourtube/`](yourtube/) | Next.js Pages Router frontend |
| [`server/`](server/) | Express API, MongoDB models, media processing, and room signalling |

## Checks

Run these from the repository root:

```sh
npm --prefix server test
npm --prefix yourtube run build
```

## Project status

Run the server integration tests and frontend production build after configuration changes. Browser and device checks remain important for media playback, downloads, and video calls.

- MongoDB Atlas needs a valid database user, URI and IP Access List entry. Razorpay Test plans are pending provider approval; external SMTP, GeoIP City data, and a TURN relay each need their own configuration. Calls outside a local network are not guaranteed without a relay.
- The offline library stores copies in the current browser profile. Clearing browser site data removes them. The app still needs a network connection to load and check membership after a fresh browser launch; offline playback works while an authenticated app session remains open.
- Public channel profiles, a real ad network, live payments, and migration of old clone database records are not included in this branch.
- Keep `.env` files, generated dependencies, uploads, and `server/.local-data/` out of Git. Review dependency advisories before any production deployment.

---

Built from [BitHeadmr's YourTube clone](https://github.com/BitHeadmr/you_tube2.0) and extended with creator, community, membership, and security features.
