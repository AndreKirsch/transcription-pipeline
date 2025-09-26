import { Dropbox } from 'dropbox';

import type { DropboxConnection } from '../types';

export interface RemoteAudioFile {
  id: string;
  name: string;
  pathDisplay: string;
  pathLower: string;
  size: number;
  clientModified?: string;
  serverModified?: string;
  contentHash?: string;
  rev?: string;
}

export interface ListAudioFilesOptions {
  extensions: string[];
  excludeFolders?: string[];
}

export class DropboxService {
  private readonly client: Dropbox;

  constructor(private readonly config: DropboxConnection) {
    this.client = new Dropbox({ accessToken: config.access_token });
  }

  async listAudioFiles(options: ListAudioFilesOptions): Promise<RemoteAudioFile[]> {
    const files: RemoteAudioFile[] = [];
    const excludePrefixes = (options.excludeFolders ?? []).map((folder) => normalizePath(folder));
    const allowedExtensions = options.extensions.map((ext) => ext.toLowerCase());

    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = cursor
        ? await this.client.filesListFolderContinue({ cursor })
        : await this.client.filesListFolder({
            path: this.config.root_path,
            recursive: true,
            include_deleted: false,
            include_non_downloadable_files: false,
          });

      cursor = response.result.cursor;
      hasMore = response.result.has_more;

      response.result.entries.forEach((entry) => {
        if (entry['.tag'] !== 'file') {
          return;
        }

        const pathDisplay = entry.path_display ?? entry.path_lower ?? entry.name;
        const normalizedPath = normalizePath(pathDisplay);

        if (excludePrefixes.some((prefix) => normalizedPath.startsWith(prefix))) {
          return;
        }

        const extension = getExtension(entry.name);

        if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
          return;
        }

        files.push({
          id: entry.id,
          name: entry.name,
          pathDisplay,
          pathLower: entry.path_lower ?? pathDisplay.toLowerCase(),
          size: entry.size ?? 0,
          clientModified: entry.client_modified,
          serverModified: entry.server_modified,
          contentHash: (entry as { content_hash?: string }).content_hash,
          rev: (entry as { rev?: string }).rev,
        });
      });
    }

    return files;
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    const response = await this.client.filesDownload({ path: filePath });
    const result = response.result as typeof response.result & {
      fileBinary?: Buffer | ArrayBuffer;
    };

    const binary =
      (result as { fileBinary?: Buffer | ArrayBuffer }).fileBinary ??
      (response as unknown as { fileBinary?: Buffer | ArrayBuffer }).fileBinary;

    if (!binary) {
      throw new Error(`Dropbox download for ${filePath} did not return file contents`);
    }

    return Buffer.isBuffer(binary) ? Buffer.from(binary) : Buffer.from(binary as ArrayBuffer);
  }
}

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot === -1 ? '' : fileName.slice(lastDot).toLowerCase();
}

function normalizePath(pathString: string): string {
  return pathString.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}
