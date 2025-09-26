import fs from 'fs';
import path from 'path';

import dotenv from 'dotenv';
import yaml from 'js-yaml';
import { z } from 'zod';

import { WORKFLOW_FILE } from '../constants';
import type { WorkflowDefinition } from '../types';

const ENV_VAR_PATTERN = /^\$\{([A-Z0-9_]+)\}$/i;

const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['download_files', 'gpt_transcribe', 'insert_documents']),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  input: z.string().min(1).optional(),
  output: z.string().min(1).optional(),
  save_to: z.string().min(1).optional(),
  document_template: z.record(z.string()).optional(),
  prompt: z.string().min(1).optional(),
});

const WorkflowDefinitionSchema = z.object({
  workflow: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    schedule: z
      .object({
        interval: z.string().min(1).optional(),
        cron: z.string().min(1).optional(),
        timezone: z.string().min(1).optional(),
      })
      .refine((value) => Boolean(value.interval) || Boolean(value.cron), {
        message: 'schedule must provide either interval or cron',
      }),
    connections: z.object({
      dropbox: z.object({
        access_token: z.string().min(1),
        root_path: z.string().min(1),
        file_extensions: z.array(z.string().min(1)).nonempty(),
        exclude_folders: z.array(z.string().min(1)).optional(),
        only_new_files: z.boolean().optional(),
      }),
      openai: z.object({
        api_key: z.string().min(1),
        model: z.string().min(1),
        language: z.string().min(1).optional(),
        prompt: z.string().min(1).optional(),
      }),
      mongodb: z.object({
        uri: z.string().min(1),
        database: z.string().min(1),
        collection: z.string().min(1),
        processed_collection: z.string().min(1).optional().default('processed_files'),
      }),
    }),
    steps: z.array(WorkflowStepSchema).nonempty(),
  }),
});

let cachedConfig: WorkflowDefinition | null = null;

export function loadWorkflowConfig(configPath: string = WORKFLOW_FILE): WorkflowDefinition {
  if (cachedConfig) {
    return cachedConfig;
  }

  const envPath = path.resolve(process.cwd(), '.env');
  dotenv.config({ path: envPath });

  const resolvedPath = path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Workflow configuration file not found at ${resolvedPath}`);
  }

  const fileContents = fs.readFileSync(resolvedPath, 'utf8');
  const parsed = yaml.load(fileContents);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid workflow configuration file: expected an object definition');
  }

  const withPlaceholdersResolved = resolvePlaceholders(parsed as Record<string, unknown>);
  const validated = WorkflowDefinitionSchema.parse(withPlaceholdersResolved) as WorkflowDefinition;

  if (!validated.workflow.connections.mongodb.processed_collection) {
    validated.workflow.connections.mongodb.processed_collection = 'processed_files';
  }

  cachedConfig = validated;
  return cachedConfig;
}

export function getWorkflow(configPath?: string): WorkflowDefinition['workflow'] {
  return loadWorkflowConfig(configPath).workflow;
}

function resolvePlaceholders<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => resolvePlaceholders(item)) as unknown as T;
  }

  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>).map(([key, value]) => [
      key,
      resolvePlaceholders(value),
    ]);

    return Object.fromEntries(entries) as T;
  }

  if (typeof input === 'string') {
    const envMatch = input.match(ENV_VAR_PATTERN);

    if (envMatch) {
      const [, envKey] = envMatch;
      const envValue = process.env[envKey];

      if (envValue === undefined) {
        throw new Error(`Missing required environment variable: ${envKey}`);
      }

      return envValue as unknown as T;
    }

    return input as unknown as T;
  }

  return input;
}
