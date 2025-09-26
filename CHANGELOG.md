# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2025-09-26

- Initial transcription pipeline skeleton (Dropbox → GPT → Mongo) with YAML workflow configuration.
- Added services for Dropbox, OpenAI transcription, MongoDB storage, and utilities for logging, templating, and filesystem.
- Implemented pipeline orchestrator with step execution, local fallbacks, and prompt templating.
- Authored comprehensive documentation (Overview, Architecture, Operations, Roadmap, DigitalOcean deployment guide).
- Added host-cron scheduling guidance (11:30 AM & 3:30 PM PT) plus enterprise upgrades: Zod config validation, Mongo-backed processed-file ledger, and Pino structured logging with run IDs.
