import { MongoService } from '../services/mongodb';
import { applyTemplateRecord } from '../utils/templates';
import type { Logger } from '../utils/logger';
import type { TranscriptRecord } from './transcribe';

export interface StoreTranscriptsOptions {
  transcripts: TranscriptRecord[];
  mongoService: MongoService;
  documentTemplate?: Record<string, string>;
  logger: Logger;
}

export async function storeTranscripts(options: StoreTranscriptsOptions): Promise<void> {
  const { transcripts, mongoService, documentTemplate, logger } = options;

  if (transcripts.length === 0) {
    logger.info({ step: 'store' }, 'No transcripts to store');
    return;
  }

  const now = new Date().toISOString();

  const documents = transcripts.map((transcript) => {
    if (!documentTemplate) {
      return {
        ...transcript,
        storedAt: now,
      };
    }

    return applyTemplateRecord(documentTemplate, {
      file: transcript.file,
      metadata: transcript.metadata,
      transcript: transcript.file.transcript,
      now,
    });
  });

  await mongoService.insertDocuments(documents);
  logger.info({ step: 'store', count: documents.length }, 'Inserted transcripts into MongoDB');

  await mongoService.markDropboxFilesProcessed(
    transcripts
      .filter((transcript) => transcript.file.source === 'dropbox')
      .map((transcript) => ({
        dropboxId: transcript.metadata.dropboxId,
        contentHash: transcript.metadata.contentHash ?? transcript.metadata.rev,
        pathLower: transcript.file.path.toLowerCase(),
        processedAt: new Date(now),
      }))
      .filter((entry) => entry.dropboxId && entry.contentHash),
  );
}
