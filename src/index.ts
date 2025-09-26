import { promises as fsp } from 'fs';
import path from 'path';

import { v4 as uuidv4 } from 'uuid';

import { getWorkflow } from './config';
import {
  PROJECT_ROOT,
  TMP_AUDIO_DIR,
  TMP_TRANSCRIPTS_DIR,
  DEFAULT_AUDIO_EXTENSIONS,
  DEFAULT_TRANSCRIPT_EXTENSION,
} from './constants';
import { fetchAudioFromDropbox, FetchedAudioFile } from './pipeline/fetchAudio';
import { storeTranscripts } from './pipeline/store';
import { TranscriptRecord, transcribeAudioFiles } from './pipeline/transcribe';
import { DropboxService } from './services/dropbox';
import { MongoService } from './services/mongodb';
import { OpenAIService } from './services/openai';
import { computeFileHash, ensureDirExists, listFiles, readJsonFile } from './utils/file';
import { createChildLogger, getRootLogger } from './utils/logger';
import type { Logger } from './utils/logger';
import type { WorkflowDefinition, WorkflowStep } from './types';

interface WorkflowContext {
  fetchedFiles: FetchedAudioFile[];
  transcripts: TranscriptRecord[];
}

async function main(): Promise<void> {
  const workflow = getWorkflow();
  const runId = uuidv4();
  const rootLogger = createChildLogger(getRootLogger(), { run_id: runId });

  rootLogger.info({ workflow: workflow.name }, 'Starting transcription workflow');

  const dropboxService = new DropboxService(workflow.connections.dropbox);
  const openaiService = new OpenAIService(workflow.connections.openai);
  const mongoService = new MongoService(workflow.connections.mongodb);

  const context: WorkflowContext = {
    fetchedFiles: [],
    transcripts: [],
  };

  try {
    await mongoService.connect();

    for (const step of workflow.steps) {
      const stepLogger = createChildLogger(rootLogger, {
        step: step.id,
        action: step.action,
      });
      const stepStart = Date.now();
      stepLogger.info('Workflow step started');
      await executeStep(step, workflow, {
        context,
        dropboxService,
        openaiService,
        mongoService,
        logger: stepLogger,
      });
      stepLogger.info({ elapsed_ms: Date.now() - stepStart }, 'Workflow step completed');
    }

    rootLogger.info({ transcripts: context.transcripts.length }, 'Workflow completed successfully');
  } finally {
    await mongoService.close();
  }
}

interface ExecuteStepDependencies {
  context: WorkflowContext;
  dropboxService: DropboxService;
  openaiService: OpenAIService;
  mongoService: MongoService;
  logger: Logger;
}

async function executeStep(
  step: WorkflowStep,
  workflow: WorkflowDefinition['workflow'],
  deps: ExecuteStepDependencies,
): Promise<void> {
  switch (step.action) {
    case 'download_files':
      await executeDownloadStep(step, workflow, deps);
      break;
    case 'gpt_transcribe':
      await executeTranscribeStep(step, workflow, deps);
      break;
    case 'insert_documents':
      await executeStoreStep(step, workflow, deps);
      break;
    default:
      throw new Error(`Unsupported workflow action: ${step.action}`);
  }
}

async function executeDownloadStep(
  step: WorkflowStep,
  workflow: WorkflowDefinition['workflow'],
  { context, dropboxService, mongoService, logger }: ExecuteStepDependencies,
): Promise<void> {
  if (step.from !== 'dropbox') {
    throw new Error(`download_files step must specify from: dropbox (got ${step.from})`);
  }

  const downloadDir = resolvePath(step.save_to ?? TMP_AUDIO_DIR);
  await ensureDirExists(downloadDir);

  const fetchedFiles = await fetchAudioFromDropbox({
    dropboxService,
    dropboxConfig: workflow.connections.dropbox,
    downloadDir,
    extensions: workflow.connections.dropbox.file_extensions ?? DEFAULT_AUDIO_EXTENSIONS,
    excludeFolders: workflow.connections.dropbox.exclude_folders,
    onlyNewFiles: workflow.connections.dropbox.only_new_files,
    mongoService,
    logger,
  });

  context.fetchedFiles = fetchedFiles;

  if (fetchedFiles.length === 0) {
    logger.info('No new audio files downloaded; remaining steps will be skipped');
  }
}

async function executeTranscribeStep(
  step: WorkflowStep,
  workflow: WorkflowDefinition['workflow'],
  { context, openaiService, logger }: ExecuteStepDependencies,
): Promise<void> {
  if (context.fetchedFiles.length === 0) {
    const inputDir = resolvePath(step.input ?? TMP_AUDIO_DIR);
    await ensureDirExists(inputDir);
    const localFiles = await loadLocalAudioFiles(
      inputDir,
      workflow.connections.dropbox.file_extensions ?? DEFAULT_AUDIO_EXTENSIONS,
    );

    if (localFiles.length > 0) {
      logger.info(
        { count: localFiles.length, inputDir },
        'Loaded audio files from local input directory',
      );
      context.fetchedFiles = localFiles;
    } else {
      logger.info('Skipping transcription step because there are no fetched or local audio files');
      context.transcripts = [];
      return;
    }
  }

  const outputDir = resolvePath(step.output ?? TMP_TRANSCRIPTS_DIR);
  await ensureDirExists(outputDir);

  const transcripts = await transcribeAudioFiles({
    files: context.fetchedFiles,
    openaiService,
    outputDir,
    model: workflow.connections.openai.model,
    language: workflow.connections.openai.language,
    prompt: step.prompt ?? workflow.connections.openai.prompt,
    logger,
  });

  context.transcripts = transcripts;

  if (transcripts.length === 0) {
    logger.info('Transcription step produced no transcripts; remaining steps may be skipped');
  }
}

async function executeStoreStep(
  step: WorkflowStep,
  workflow: WorkflowDefinition['workflow'],
  { context, mongoService, logger }: ExecuteStepDependencies,
): Promise<void> {
  if (step.to !== 'mongodb') {
    throw new Error(`insert_documents step must specify to: mongodb (got ${step.to})`);
  }

  if (context.transcripts.length === 0) {
    const sourceDir = resolvePath(step.from ?? TMP_TRANSCRIPTS_DIR);
    await ensureDirExists(sourceDir);
    const files = await listFiles(sourceDir, [DEFAULT_TRANSCRIPT_EXTENSION]);
    const loaded = await Promise.all(
      files.map((filePath) => readJsonFile<TranscriptRecord>(filePath)),
    );
    context.transcripts = loaded.filter((item): item is TranscriptRecord => Boolean(item));

    if (context.transcripts.length === 0) {
      logger.info('Skipping MongoDB insertion because there are no transcripts');
      return;
    }
  }

  await storeTranscripts({
    transcripts: context.transcripts,
    mongoService,
    documentTemplate: step.document_template,
    logger,
  });
}

function resolvePath(providedPath: string): string {
  if (path.isAbsolute(providedPath)) {
    return providedPath;
  }

  return path.resolve(PROJECT_ROOT, providedPath);
}

async function loadLocalAudioFiles(
  directory: string,
  extensions: string[],
): Promise<FetchedAudioFile[]> {
  const files = await listFiles(directory, extensions);

  const audioFiles = await Promise.all(
    files.map(async (filePath) => {
      const stats = await fsp.stat(filePath);
      const relativeToProject = path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/');
      const contentHash = await computeFileHash(filePath);

      return {
        id: filePath,
        name: path.basename(filePath),
        dropboxPath: `local:${relativeToProject}`,
        localPath: filePath,
        size: stats.size,
        clientModified: stats.mtime.toISOString(),
        serverModified: stats.ctime.toISOString(),
        contentHash,
        source: 'local' as const,
      };
    }),
  );

  return audioFiles;
}

main().catch((error) => {
  const rootLogger = getRootLogger();
  rootLogger.error({ err: error }, 'Unhandled error in transcription pipeline');
  process.exitCode = 1;
});
