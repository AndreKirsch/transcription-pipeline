import { MongoClient } from 'mongodb';

import type { MongoConnection } from '../types';

export class MongoService {
  private readonly client: MongoClient;
  private isConnected = false;
  private processedIndexEnsured = false;

  constructor(private readonly config: MongoConnection) {
    this.client = new MongoClient(config.uri);
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
      this.isConnected = true;
    }
  }

  async insertDocuments(documents: Record<string, unknown>[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    await this.ensureConnected();

    const collection = this.client.db(this.config.database).collection(this.config.collection);
    await collection.insertMany(documents, { ordered: false });
  }

  async close(): Promise<void> {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
      this.processedIndexEnsured = false;
    }
  }

  async getProcessedDropboxKeys(keys: DropboxFileKey[]): Promise<Set<string>> {
    const validKeys = keys.filter((key) => key.dropboxId && key.contentHash);

    if (validKeys.length === 0) {
      return new Set();
    }

    await this.ensureConnected();
    await this.ensureProcessedIndex();

    const collection = this.getProcessedCollection();
    const cursor = collection.find(
      {
        $or: validKeys.map((key) => ({
          dropbox_id: key.dropboxId,
          content_hash: key.contentHash,
        })),
      },
      { projection: { dropbox_id: 1, content_hash: 1 } },
    );

    const existing = await cursor.toArray();
    return new Set(existing.map((doc) => composeKey(doc.dropbox_id, doc.content_hash)));
  }

  async markDropboxFilesProcessed(entries: ProcessedDropboxFile[]): Promise<void> {
    const validEntries = entries.filter(
      (entry) => entry.dropboxId && entry.contentHash,
    ) as ProcessedDropboxFileWithHash[];

    if (validEntries.length === 0) {
      return;
    }

    await this.ensureConnected();
    await this.ensureProcessedIndex();

    const collection = this.getProcessedCollection();
    const operations = validEntries.map((entry) => ({
      updateOne: {
        filter: {
          dropbox_id: entry.dropboxId,
          content_hash: entry.contentHash,
        },
        update: {
          $setOnInsert: {
            dropbox_id: entry.dropboxId,
            content_hash: entry.contentHash,
            path_lower: entry.pathLower,
            processed_at: entry.processedAt ?? new Date(),
            transcript_id: entry.transcriptId,
          },
        },
        upsert: true,
      },
    }));

    if (operations.length > 0) {
      await collection.bulkWrite(operations, { ordered: false });
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  private async ensureProcessedIndex(): Promise<void> {
    if (this.processedIndexEnsured) {
      return;
    }

    const collection = this.getProcessedCollection();
    await collection.createIndex({ dropbox_id: 1, content_hash: 1 }, { unique: true });
    this.processedIndexEnsured = true;
  }

  private getProcessedCollection() {
    const collectionName = this.config.processed_collection ?? 'processed_files';
    return this.client.db(this.config.database).collection<ProcessedFileDocument>(collectionName);
  }
}

interface ProcessedFileDocument {
  dropbox_id: string;
  content_hash: string;
  path_lower: string;
  processed_at: Date;
  transcript_id?: string;
}

export interface DropboxFileKey {
  dropboxId: string;
  contentHash: string;
}

export interface ProcessedDropboxFile {
  dropboxId?: string;
  contentHash?: string;
  pathLower: string;
  transcriptId?: string;
  processedAt?: Date;
}

interface ProcessedDropboxFileWithHash extends ProcessedDropboxFile {
  dropboxId: string;
  contentHash: string;
}

function composeKey(dropboxId: string, contentHash: string): string {
  return `${dropboxId}:${contentHash}`;
}
