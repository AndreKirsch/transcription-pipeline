# Running on DigitalOcean with Node

This guide explains how to run and schedule the transcription pipeline directly on an Ubuntu Droplet.

## Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Embedded Scheduler (node-cron)](#embedded-scheduler-node-cron)
- [Keeping It Alive with PM2](#keeping-it-alive-with-pm2)
- [Alternative: Use Host Cron + Node](#alternative-use-host-cron--node)
- [Summary](#summary)

---

## Prerequisites

- Ubuntu server with Node.js ≥ 18 installed
- Git and npm installed
- Access to your environment variables (`.env` file)

---

## Setup

```bash
# SSH into your Droplet
ssh root@your-server-ip

# Install Node and Git
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm git

# Clone your repo
cd /var/www
git clone https://github.com/you/transcription-pipeline.git
cd transcription-pipeline
npm install
npm run build
```

Place your secrets in `.env`:

```env
DROPBOX_ACCESS_TOKEN=...
OPENAI_API_KEY=...
MONGO_URI=...
```

---

## Embedded Scheduler (node-cron)

The project can self-schedule once you expose your orchestrator as a reusable function. For example:

```ts
// src/index.ts
export async function runPipeline(): Promise<void> {
  await main(); // call the existing workflow runner
}

if (require.main === module) {
  runPipeline().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

Then create a scheduler entry point (e.g., `src/scheduler.ts`):

```ts
import cron from 'node-cron';
import { runPipeline } from './index';

async function execute(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Running pipeline...`);
  await runPipeline();
  console.log('Pipeline succeeded');
}

execute().catch(console.error); // run immediately once

cron.schedule('0 */4 * * *', () => {
  execute().catch(console.error);
});
```

Update the cron expression to match your desired timing. For example, to run at **11:30 AM and 3:30 PM daily** use `cron.schedule('30 11,15 * * *', ...)`.

Run locally:

```bash
npm start # or ts-node src/scheduler.ts
```

---

## Keeping It Alive with PM2

Install PM2 globally:

```bash
sudo npm install -g pm2
```

Start your app:

```bash
pm2 start dist/index.js --name transcription-pipeline
```

Enable restart on boot:

```bash
pm2 startup systemd
pm2 save
```

Check logs:

```bash
pm2 logs transcription-pipeline
```

---

## Alternative: Use Host Cron + Node

If you prefer host-level cron:

```bash
30 11,15 * * * /usr/bin/node /var/www/transcription-pipeline/dist/index.js >> /var/log/transcription.log 2>&1
```

---

## Summary

- **Production recommendation:** use host cron on the droplet (or another platform-managed scheduler) to trigger `node dist/index.js` at 11:30 AM and 3:30 PM PT (`30 11,15 * * *`).
- Node-cron inside your app = convenience for local/dev scenarios.
- PM2 pairs well with cron to keep the process alive across reboots/crashes.
