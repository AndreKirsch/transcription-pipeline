import path from 'path';

import type { DropboxConnection } from '../types';
import { ensureDirExists, fileExists, saveBufferToFile } from '../utils/file';
import type { Logger } from '../utils/logger';
import type { DropboxService, RemoteAudioFile } from '../services/dropbox';
import type { DropboxFileKey, MongoService } from '../services/mongodb';

export interface FetchedAudioFile {
  id: string;
  name: string;
  dropboxPath: string;
  localPath: string;
  size: number;
  clientModified?: string;
  serverModified?: string;
  contentHash?: string;
  rev?: string;
  source: 'dropbox' | 'local';
}

export interface FetchAudioOptions {
  dropboxService: DropboxService;
  dropboxConfig: DropboxConnection;
  downloadDir: string;
  extensions: string[];
  excludeFolders?: string[];
  onlyNewFiles?: boolean;
  mongoService: MongoService;
  logger: Logger;
}

export async function fetchAudioFromDropbox(
  options: FetchAudioOptions,
): Promise<FetchedAudioFile[]> {
  const {
    dropboxService,
    dropboxConfig,
    downloadDir,
    extensions,
    excludeFolders = [],
    onlyNewFiles = false,
    mongoService,
    logger,
  } = options;

  await ensureDirExists(downloadDir);

  const remoteFiles = await dropboxService.listAudioFiles({
    extensions,
    excludeFolders,
  });

  if (remoteFiles.length === 0) {
    logger.info({ step: 'fetch_audio' }, 'No audio files found in Dropbox selection');
    return [];
  }

  const processedKeys = await mongoService.getProcessedDropboxKeys(
    remoteFiles.map(normalizeDropboxFileKey).filter((key): key is DropboxFileKey => key !== null),
  );

  const filesToDownload = remoteFiles.filter((file) => {
    const key = normalizeDropboxFileKey(file);
    if (!key) {
      return true;
    }

    return !processedKeys.has(composeKey(key.dropboxId, key.contentHash));
  });

  const skipped = remoteFiles.length - filesToDownload.length;

  if (skipped > 0) {
    logger.info(
      { step: 'fetch_audio', skipped, total: remoteFiles.length },
      'Skipping already processed Dropbox files based on ledger',
    );
  }

  const fetched: FetchedAudioFile[] = [];

  for (const file of filesToDownload) {
    const localPath = getLocalPathForFile(downloadDir, dropboxConfig.root_path, file);

    if (onlyNewFiles && (await fileExists(localPath))) {
      logger.debug({ step: 'fetch_audio', file: file.pathDisplay }, 'Skipping existing file');
      continue;
    }

    const binary = await dropboxService.downloadFile(file.pathDisplay ?? file.pathLower);
    await ensureDirExists(path.dirname(localPath));
    await saveBufferToFile(localPath, binary);

    fetched.push({
      id: file.id,
      name: file.name,
      dropboxPath: file.pathDisplay,
      localPath,
      size: file.size,
      clientModified: file.clientModified,
      serverModified: file.serverModified,
      contentHash: file.contentHash ?? file.rev,
      rev: file.rev,
      source: 'dropbox' as const,
    });

    logger.info(
      { step: 'fetch_audio', dropboxPath: file.pathDisplay, localPath },
      'Downloaded audio file',
    );
  }

  return fetched;
}

function getLocalPathForFile(downloadDir: string, rootPath: string, file: RemoteAudioFile): string {
  const cleanRoot = rootPath.replace(/\/+$/, '') || '/';
  const relativePosix = path.posix.relative(cleanRoot, file.pathDisplay);
  const sanitized = relativePosix && !relativePosix.startsWith('..') ? relativePosix : file.name;
  const fileSystemPath = sanitized.split('/').join(path.sep);

  return path.resolve(downloadDir, fileSystemPath || file.name);
}

function normalizeDropboxFileKey(file: RemoteAudioFile): DropboxFileKey | null {
  const contentHash = file.contentHash ?? file.rev;

  if (!contentHash) {
    return null;
  }

  return {
    dropboxId: file.id,
    contentHash,
  };
}

function composeKey(dropboxId: string, contentHash: string): string {
  return `${dropboxId}:${contentHash}`;
}
