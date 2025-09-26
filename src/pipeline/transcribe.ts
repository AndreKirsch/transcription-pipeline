import path from 'path';

import type { OpenAIService } from '../services/openai';
import { writeJsonFile, ensureDirExists } from '../utils/file';
import { applyTemplate } from '../utils/templates';
import type { Logger } from '../utils/logger';
import type { FetchedAudioFile } from './fetchAudio';

export interface TranscriptRecord {
  file: {
    name: string;
    path: string;
    localPath: string;
    size: number;
    transcript: string;
    contentHash?: string;
    rev?: string;
    source: FetchedAudioFile['source'];
  };
  metadata: {
    dropboxId: string;
    clientModified?: string;
    serverModified?: string;
    model: string;
    language?: string;
    prompt?: string;
    contentHash?: string;
    rev?: string;
  };
  createdAt: string;
  rawResponse: unknown;
  outputPath: string;
}

export interface TranscribeOptions {
  files: FetchedAudioFile[];
  openaiService: OpenAIService;
  outputDir: string;
  model: string;
  language?: string;
  prompt?: string;
  logger: Logger;
}

export async function transcribeAudioFiles(
  options: TranscribeOptions,
): Promise<TranscriptRecord[]> {
  const { files, openaiService, outputDir, model, language, prompt, logger } = options;

  if (files.length === 0) {
    logger.info({ step: 'transcribe' }, 'No audio files to transcribe');
    return [];
  }

  await ensureDirExists(outputDir);

  const transcripts: TranscriptRecord[] = [];

  for (const file of files) {
    try {
      const resolvedPrompt = resolvePrompt(prompt, file);
      logger.info({ step: 'transcribe', file: file.localPath }, 'Transcribing audio');
      const result = await openaiService.transcribeFile(file.localPath, { prompt: resolvedPrompt });
      const createdAt = new Date().toISOString();
      const record: TranscriptRecord = {
        file: {
          name: file.name,
          path: file.dropboxPath,
          localPath: file.localPath,
          size: file.size,
          transcript: result.text,
          contentHash: file.contentHash,
          rev: file.rev,
          source: file.source,
        },
        metadata: {
          dropboxId: file.source === 'dropbox' ? file.id : '',
          clientModified: file.clientModified,
          serverModified: file.serverModified,
          model,
          language,
          prompt: resolvedPrompt,
          contentHash: file.contentHash,
          rev: file.rev,
        },
        createdAt,
        rawResponse: result.fullResponse,
        outputPath: getTranscriptPath(outputDir, file.localPath),
      };

      await writeJsonFile(record.outputPath, record);
      transcripts.push(record);
      logger.info(
        { step: 'transcribe', file: file.localPath, output: record.outputPath },
        'Transcription completed',
      );
    } catch (error) {
      logger.error(
        { step: 'transcribe', file: file.localPath, err: error },
        'Failed to transcribe audio file',
      );
      throw error;
    }
  }

  return transcripts;
}

function getTranscriptPath(outputDir: string, audioFilePath: string): string {
  const { name } = path.parse(audioFilePath);
  return path.resolve(outputDir, `${name}.json`);
}

function resolvePrompt(prompt: string | undefined, file: FetchedAudioFile): string | undefined {
  if (!prompt) {
    return undefined;
  }

  return applyTemplate(prompt, {
    file,
    now: new Date().toISOString(),
  });
}
