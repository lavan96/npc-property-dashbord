# pdf-parse-service — Step-by-Step Deployment Guide

> A Docling-powered sidecar called by the `template-import-pdf` Supabase Edge
> Function. This guide assumes **you have never used Docker, gcloud, or Cloud
> Run before**. Follow it top to bottom; every command is copy-pasteable.

**You will end up with:**
1. A Google Cloud Run service URL (something like `https://pdf-parse-service-xxxxx-ts.a.run.app`)
2. A bearer token (a 64-character hex string you generate)
3. Both values pasted into Supabase as edge-function secrets

Allow **45–60 minutes** the first time. Most of it is waiting for installs and the first image build.

---

## 0. What you need before you start

| Item | How to get it |
| ---- | -------------- |
| A Google account | You already have one if you use Gmail. |
| A credit card | Google Cloud requires one even for free-tier. Cloud Run scale-to-zero will cost ~$0 idle. |
| **Operating system** | macOS, Linux, or Windows 10/11 with WSL2 (Ubuntu). On native Windows PowerShell some commands differ — this guide flags them. |
| ~5 GB free disk space | For Docker + the Docling model image. |

You do **not** need to know Python or Docker. You will not edit any of the code in this folder.

---

## 1. Get the code onto your computer

The `pdf-parse-service/` folder lives inside your Lovable project's GitHub repo.

### 1a. Connect Lovable to GitHub (skip if already done)

1. Open your Lovable project: <https://lovable.dev/projects/7976d60b-c277-4851-889b-c170285f4be2>
2. Top-left of the chat input, click the **+** menu → **GitHub** → **Connect project**
3. Authorise the Lovable GitHub App; pick the GitHub account/org you want the repo under.
4. Click **Create Repository**. Lovable will push the current code and give you a repo URL like `https://github.com/<your-org>/npc-property-dashbord`. **Copy that URL** — you will use it below.

### 1b. Install Git (if you don't have it)

```bash
# macOS — installs with Xcode Command Line Tools
xcode-select --install

# Ubuntu / WSL2
sudo apt-get update && sudo apt-get install -y git

# Windows (PowerShell, as Administrator)
winget install --id Git.Git -e
```

Verify:
```bash
git --version
```

### 1c. Clone the repo

Replace `<your-org>` with your GitHub username/org from step 1a.

```bash
cd ~
git clone https://github.com/<your-org>/npc-property-dashbord.git
cd npc-property-dashbord/pdf-parse-service
```

You should now see `Dockerfile`, `app.py`, `requirements.txt`, and this `README.md` when you run `ls`.

---

## 2. Install Docker Desktop

Docker packages our Python code into a single image Cloud Run can run.

- **macOS / Windows:** Download from <https://www.docker.com/products/docker-desktop/> and run the installer. After install, **launch Docker Desktop** and wait until the whale icon in the menu/taskbar is steady (not animating).
- **Ubuntu / WSL2:**
  ```bash
  sudo apt-get update
  sudo apt-get install -y docker.io
  sudo usermod -aG docker $USER
  newgrp docker
  ```

Verify:
```bash
docker --version
docker run --rm hello-world
```
The `hello-world` command should print a "Hello from Docker!" message. If it doesn't, fix Docker before continuing.

---

## 3. Install the Google Cloud CLI (`gcloud`)

- **macOS (with Homebrew):**
  ```bash
  brew install --cask google-cloud-sdk
  ```
- **Linux / WSL2:**
  ```bash
  curl https://sdk.cloud.google.com | bash
  exec -l $SHELL
  ```
- **Windows (PowerShell, as Administrator):**
  ```powershell
  (New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
  & $env:Temp\GoogleCloudSDKInstaller.exe
  ```

Verify:
```bash
gcloud --version
```

Log in (this opens a browser):
```bash
gcloud auth login
gcloud auth configure-docker australia-southeast1-docker.pkg.dev
```
When the second command asks "Are you sure…?", type **Y** and press Enter.

---

## 4. Create a Google Cloud project + enable billing

You only do this once.

1. Go to <https://console.cloud.google.com/projectcreate>
2. **Project name:** `npc-sidecars` (or anything you like)
3. After creation, copy the **Project ID** shown at the top — it usually looks like `npc-sidecars-123456`. **Write it down.** From here on, wherever you see `PROJECT_ID` below, paste this value.
4. Set up billing: <https://console.cloud.google.com/billing> → **Link a billing account** → enter your credit card. (Cloud Run gives you 2M free requests/month; this service will cost ~$0–$5/month at low volume.)

Now tell your terminal which project to use, and enable the APIs Cloud Run needs:

```bash
# Replace npc-sidecars-123456 with YOUR project ID from step 3 above
export PROJECT_ID="npc-sidecars-123456"
export REGION="australia-southeast1"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

The `services enable` command takes ~1 minute. When it finishes you'll see `Operation "operations/..." finished successfully`.

---

## 5. Create a place to store the Docker image (Artifact Registry)

One-time setup:

```bash
gcloud artifacts repositories create lovable-sidecars \
  --repository-format=docker \
  --location="$REGION" \
  --description="Lovable sidecar containers"
```

If it says the repo already exists, that's fine — continue.

---

## 6. Generate the service token

This is the secret password the Supabase edge function will use to call your sidecar. Generate it now and **save it somewhere safe** (a password manager). You'll paste it into Supabase later.

```bash
# macOS / Linux / WSL2
openssl rand -hex 32
```

```powershell
# Windows PowerShell (if not using WSL)
-join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

Copy the 64-character hex string it prints. Then in your terminal:

```bash
export SERVICE_TOKEN="paste-the-64-char-string-here"
```

---

## 7. Build the Docker image and push it to Google

Make sure you're in the `pdf-parse-service/` folder (run `pwd` — it should end in `/pdf-parse-service`).

```bash
# Tag the image with today's date/time so each build is uniquely identifiable
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/lovable-sidecars/pdf-parse-service:$(date +%Y%m%d-%H%M)"

# Build (this takes 5–15 min the first time — it downloads the Docling AI models)
docker build --platform=linux/amd64 -t "$IMAGE" .

# Push to Google
docker push "$IMAGE"
```

The `--platform=linux/amd64` flag is **required on Apple Silicon Macs (M1/M2/M3/M4)** so the image runs on Cloud Run's x86 servers. It's harmless on Intel/Linux/Windows.

When the push finishes you'll see lines ending in `digest: sha256:...`.

---

## 8. Deploy to Cloud Run

```bash
gcloud run deploy pdf-parse-service \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --cpu=2 \
  --memory=4Gi \
  --concurrency=2 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --port=8080 \
  --set-env-vars="PDF_PARSE_SERVICE_TOKEN=${SERVICE_TOKEN}"
```

> **"Allow unauthenticated" sounds scary — is it safe?** Yes. The container
> rejects any request that doesn't include the bearer token from step 6. Only
> Supabase knows the token, so only Supabase can call it.

Deployment takes 2–4 minutes. When it finishes it prints:

```
Service URL: https://pdf-parse-service-xxxxxxxxxx-ts.a.run.app
```

**Copy that URL.** You'll need it in step 10.

If you missed it, run:
```bash
gcloud run services describe pdf-parse-service --region="$REGION" --format='value(status.url)'
```

---

## 9. Smoke-test the deployed service

```bash
export SERVICE_URL="https://pdf-parse-service-xxxxxxxxxx-ts.a.run.app"   # from step 8

# Health check — no auth needed
curl "$SERVICE_URL/healthz"
# Expect: {"status":"ok",...}

# Auth check — should return 401 without token
curl -X POST "$SERVICE_URL/parse" -H "Content-Type: application/json" -d '{}'
# Expect: {"detail":"..."} with HTTP 401

# Auth check — should return a validation error (not 401) with token
curl -X POST "$SERVICE_URL/parse" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expect: 422 unprocessable entity (missing url/pdf_base64) — this means auth works
```

If all three behave as described, the sidecar is live. 🎉

---

## 10. Wire it into Supabase

Tell me in chat:

```
SERVICE_URL = https://pdf-parse-service-xxxxxxxxxx-ts.a.run.app
SERVICE_TOKEN = <the 64-char hex from step 6>
```

I will add them as edge-function secrets named `PDF_PARSE_SERVICE_URL` and
`PDF_PARSE_SERVICE_TOKEN` in your Supabase project
(`dduzbchuswwbefdunfct`) — **do not paste the token publicly.** Once
secrets are in, I'll start Phase 2 (edge function + realtime job-poller UI).

---

## 11. Don't forget the diagnostics bucket

Independent of Cloud Run, the Phase 0 plan needs a storage bucket. In a browser:

1. Open <https://supabase.com/dashboard/project/dduzbchuswwbefdunfct/storage/buckets>
2. Click **New bucket**
3. Name: `pdf-import-diagnostics`
4. **Public bucket:** OFF (leave private)
5. **File size limit:** `50` MB
6. **Allowed MIME types:** leave blank (any)
7. Click **Create bucket**

That's it — no policies needed; the edge function uses the service role.

---

## Troubleshooting

**`docker push` → "denied: permission denied"**
You skipped `gcloud auth configure-docker australia-southeast1-docker.pkg.dev` in step 3, or you're logged into a different Google account than the one that owns the project. Re-run it.

**`gcloud run deploy` → "PERMISSION_DENIED: Cloud Run Admin API has not been used"**
You missed the `gcloud services enable` line in step 4. Run it and retry.

**Cloud Run logs show `exec format error` or container crashes immediately on M1/M2 Mac**
You forgot `--platform=linux/amd64` in the `docker build` command. Rebuild and redeploy.

**First request takes 30+ seconds, subsequent ones are fast**
That's a "cold start" — Cloud Run spinning up a new container. If it bothers users, change `--min-instances=0` to `--min-instances=1` in step 8 (costs ~$15/month to keep one warm).

**Out-of-memory errors in Cloud Run logs for big PDFs**
Bump `--memory=4Gi` to `--memory=8Gi` and `--cpu=2` to `--cpu=4`, then redeploy with the same `gcloud run deploy …` command.

---

## Updating the service later

When you change `app.py` or `requirements.txt`:

```bash
cd ~/npc-property-dashbord/pdf-parse-service
git pull

export PROJECT_ID="npc-sidecars-123456"        # same as before
export REGION="australia-southeast1"
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/lovable-sidecars/pdf-parse-service:$(date +%Y%m%d-%H%M)"

docker build --platform=linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"

gcloud run deploy pdf-parse-service \
  --image="$IMAGE" \
  --region="$REGION"
```

Cloud Run does zero-downtime rollout — the old version keeps serving until the new one is healthy.

---

## Endpoints reference

| Method | Path        | Purpose |
| ------ | ----------- | ------- |
| GET    | `/healthz`  | Liveness probe (no auth). |
| POST   | `/parse`    | Returns `{ engine_version, page_count, pages[], docling_document }`. Input: `url` (signed Storage URL) **or** `pdf_base64`. |
| POST   | `/raster`   | Returns base64 PNG/JPEG page rasters. Input: same as `/parse` plus `dpi` (72–300), optional `pages`, `format`. |

All endpoints other than `/healthz` require `Authorization: Bearer $PDF_PARSE_SERVICE_TOKEN`. Max input: 50 MB.

---

## Cost expectation

| Scenario               | Per import | Per 1k imports |
| ---------------------- | ---------- | -------------- |
| Warm, 6-page PDF, ~40s | ~$0.003    | ~$3            |
| Cold start (+15s)      | ~$0.004    | (only first)   |
| Idle                   | $0         | $0             |

Cloud Run's free tier covers 2 million requests, 360k GB-seconds of memory, and 180k vCPU-seconds per month — you'll almost certainly stay inside it.
