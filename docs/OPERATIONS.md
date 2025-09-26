# Operations & Runbook

## Contents

- [Environments](#environments)
- [Prerequisites](#prerequisites)
- [Deployment Process (Target)](#deployment-process-target)
- [Runtime Configuration](#runtime-configuration)
- [Scheduled Execution](#scheduled-execution)
- [Monitoring & Alerts](#monitoring--alerts)
- [Runbook](#runbook)
- [Security & Compliance](#security--compliance)
- [Observability Enhancements (Planned)](#observability-enhancements-planned)
- [Incident Response Checklist](#incident-response-checklist)
- [Documentation Links](#documentation-links)

## Environments

| Env     | Purpose                   | Notes                                 |
| ------- | ------------------------- | ------------------------------------- |
| Local   | Developer testing         | Uses `.env`, local Mongo/Dropbox data |
| Staging | Pre-production validation | Uses isolated credentials and dataset |
| Prod    | Live pipeline             | Strict guardrails + monitoring        |

## Prerequisites

- Access to required secrets (Dropbox token, OpenAI API key, Mongo URI).
- Network access to Dropbox/OpenAI endpoints and MongoDB cluster.
- Storage for temporary audio/transcripts with retention policies.

## Deployment Process (Target)

1. Build Docker image via CI pipeline (`npm ci`, `npm run build`).
2. Run automated tests/linting.
3. Push image to registry with version tag.
4. Deploy via orchestrator (e.g., Kubernetes, ECS) with configuration from secrets manager.
5. Monitor logs and metrics during rollout.

## Runtime Configuration

- `LOG_LEVEL`, `LOG_FORMAT` (future) – control verbosity and structured logging.
- `TMP_AUDIO_DIR`, `TMP_TRANSCRIPTS_DIR` (optional env overrides) – change staging directories.
- `WORKFLOW_FILE` (optional) – point to an alternative YAML.

## Scheduled Execution

- The YAML `schedule.interval` field documents intended frequency (e.g., every 4 hours or `cron: "30 11,15 * * *"`).
- **Production standard:** use host-level cron (or platform-managed cron such as Kubernetes CronJob/EventBridge) to invoke `npm start`/`node dist/index.js` at the desired times. For a DigitalOcean droplet in Pacific Time, schedule `30 11,15 * * *` to run at 11:30 AM and 3:30 PM PT.
- Ensure jobs do not overlap; use locking or idempotency guards if pipeline runtime may exceed the interval.
- Optional: pair cron with PM2/systemd to keep the process alive and capture logs.

## Monitoring & Alerts

- **Logs**
  - Stream Pino JSON logs (stdout) to centralized logging (CloudWatch, Stackdriver, Datadog).
  - Filter on `level:error` or custom fields such as `step=insert_documents`, `run_id`.

- **Metrics** (future work)
  - Track counts: files downloaded, transcripts created, Mongo inserts.
  - Measure durations per step, queue backlogs, failure rates.

- **Alerts**
  - Trigger when pipeline fails consecutively, or no transcripts stored within expected window.
  - Alert on missing credentials or connectivity failures (Dropbox/OpenAI/Mongo).

## Runbook

### Manual Execution

```sh
npm start
```

Monitor logs to ensure each step reports success. Verify transcripts exist in MongoDB with expected schema.

### Retrying Failed Runs

1. Inspect logs for the failing step (e.g., `gpt_transcribe`).
2. Confirm temporary files (`tmp_audio/`, `tmp_transcripts/`) are intact.
3. Fix root cause (e.g., credential, network, quota) and re-run the pipeline.
4. The Mongo ledger prevents reprocessing files with the same Dropbox ID/content hash; delete ledger entries only if a full reprocess is required.

### Cleaning Temporary Storage

- Configure a retention policy (default recommendation: delete files older than 7 days unless Legal/Compliance dictates otherwise).
- Provide script to prune temp directories:

  ```sh
  find tmp_audio -type f -mtime +7 -delete
  find tmp_transcripts -type f -mtime +7 -delete
  ```

- If transcripts must be retained, archive to encrypted storage (S3, Azure Blob) before deletion and document retention period.

### Supporting Hotfixes

- For urgent patches, branch from main, apply fix, run tests, and deploy via CI.
- Communicate to ops team; ensure rollback plan (prior image tag) is ready.

## Security & Compliance

- Do not store access tokens in logs or artifacts; use secret manager or encrypted env vars.
- Ensure MongoDB uses TLS and proper authentication/authorization.
- If transcripts contain PII, implement data retention, masking, and audit logging policies.

## Observability Enhancements (Planned)

- Additional log enrichment/forwarding (Pino structured logging with run/step metadata already in place).
- OpenTelemetry integration for traces/metrics.
- Dashboards showing job status, throughput, and error trends.

## Incident Response Checklist

1. Identify failing step from logs/alerts.
2. Determine scope (single file vs. pipeline outage).
3. Escalate to responsible team if external dependency (Dropbox, OpenAI) is impacted.
4. Apply fix or rollback.
5. Document incident details, timeline, root cause, and follow-up actions.

## Documentation Links

- `docs/ARCHITECTURE.md` – System design and component responsibilities.
- `docs/ROADMAP.md` – Planned work, milestones, and definition of done.
- `docs/README.md` – Getting started guide.
