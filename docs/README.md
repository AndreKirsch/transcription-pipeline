# Transcription Pipeline

## Overview

The Transcription Pipeline automates the ingestion of sales call recordings from Dropbox, transcribes them via OpenAI, and persists transcripts and metadata to MongoDB. The workflow is fully configurable via YAML and environment variables, enabling different teams to tailor schedules, prompts, and storage templates without touching code.

Core goals:

- Provide a reliable ETL loop for audio → text conversion.
- Keep the pipeline modular so steps can be swapped or extended.
- Capture enough metadata to drive analytics while preserving auditability.

### Highlights

- YAML-driven workflow with Zod runtime validation and environment substitution.
- Dropbox → GPT → Mongo pipeline with prompt templating and Mongo-backed idempotency ledger.
- Structured Pino logging with run/session IDs plus comprehensive documentation (architecture, operations, roadmap, deployment).
- Ready for cron-based scheduling (11:30 AM & 3:30 PM PT) with DigitalOcean deployment notes.

## Contents

- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Scheduled Execution](#scheduled-execution)
- [Testing & Quality (current status)](#testing--quality-current-status)
- [Next Steps](#next-steps)

## Repository Layout

- `transcription_workflow.yaml` – Source of truth describing connections, steps, and templates.
- `src/` – TypeScript implementation (config loader, services, pipeline steps, utilities).
- `tmp_audio/` – Staging area for downloaded audio (ignored by Git).
- `tmp_transcripts/` – Staging area for transcript JSON output (ignored by Git).
- `docs/` – Project documentation (architecture, operations, roadmap).

## Prerequisites

- Node.js 20+
- npm 10+
- Dropbox app with file access token
- OpenAI API key with access to transcription models
- MongoDB database/collection for transcripts

## Setup Instructions

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Create `.env`**

   ```env
   DROPBOX_ACCESS_TOKEN=...
   OPENAI_API_KEY=...
   MONGO_URI=...
   LOG_LEVEL=info
   ```

3. **Review `transcription_workflow.yaml`**
   - Adjust the Dropbox root path, file filters, and excluded folders.
   - Update the OpenAI model/prompt for your transcription needs.
   - Set the MongoDB database + collection and document template.

4. **Run the pipeline locally**

   ```sh
   npm start
   ```

   By default the script downloads audio into `tmp_audio/`, writes transcripts to `tmp_transcripts/`, and inserts records into MongoDB.

5. **Build TypeScript output** (optional)

   ```sh
   npm run build
   ```

## Scheduled Execution

- The YAML `schedule` section **documents intended timing** (e.g., `cron: "30 11,15 * * *"` for runs at 11:30 and 15:30) but **does not automatically schedule execution**.
- Teams must configure a scheduler to run `npm start` or the container entrypoint. **Production standard:** host-level cron (or platform-managed cron such as Kubernetes CronJob/EventBridge) triggers the Node process at the desired times (e.g., 11:30 AM and 3:30 PM PT). Additional options remain for development or specialized deployments:
  - **Embedded scheduler (dev only):** Add `node-cron` to `index.ts` for local self-scheduling.
  - **Process manager:** Use PM2 in combination with host cron to keep the Node process alive across reboots.
  - **Other orchestrators:** GitHub Actions, Jenkins, or other automation tools can invoke the container entrypoint as needed.

### Examples

**Embedded Scheduler with node-cron** (inside `index.ts`):

```ts
cron.schedule('30 11,15 * * *', () => {
  runPipeline();
});
```

**Host Cron on Ubuntu:**

```bash
30 11,15 * * * /usr/bin/node /var/www/transcription-pipeline/dist/index.js >> /var/log/transcription.log 2>&1
```

**PM2 on Ubuntu:**

```bash
sudo npm install -g pm2
pm2 start dist/index.js --name transcription-pipeline
pm2 startup systemd
pm2 save
```

See [`docs/RUNNING_ON_DIGITALOCEAN.md`](docs/RUNNING_ON_DIGITALOCEAN.md) for full instructions.

## Testing & Quality (current status)

- Unit tests: planned (see Roadmap M1). Mocked services will cover pipeline steps.
- Integration tests: planned (Roadmap M3). Will run via Docker Compose.
- Manual verification: run `npm start` against staging Dropbox/Mongo credentials and inspect logs + data.

## Next Steps

- See `docs/ARCHITECTURE.md` for data flow and design decisions.
- See `docs/OPERATIONS.md` for deployment, monitoring, and runbook guidance.
- See `docs/ROADMAP.md` for upcoming milestones and definition of done.
- See `CHANGELOG.md` for release history.
