import crypto from 'crypto';
import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';

export async function ensureDirExists(dirPath: string): Promise<void> {
  await fsp.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(dirPath: string, extensions?: string[]): Promise<string[]> {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name))
    .filter((filePath) => {
      if (!extensions || extensions.length === 0) {
        return true;
      }

      const ext = path.extname(filePath).toLowerCase();
      return extensions.map((item) => item.toLowerCase()).includes(ext);
    });
}

export async function saveBufferToFile(destinationPath: string, data: Buffer): Promise<void> {
  await ensureDirExists(path.dirname(destinationPath));
  await fsp.writeFile(destinationPath, data);
}

export async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDirExists(path.dirname(filePath));
  const serialized = JSON.stringify(data, null, 2);
  await fsp.writeFile(filePath, `${serialized}\n`, 'utf8');
}

export async function removeFile(filePath: string): Promise<void> {
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function computeFileHash(
  filePath: string,
  algorithm: string = 'sha256',
): Promise<string> {
  const hash = crypto.createHash(algorithm);
  const stream = fs.createReadStream(filePath);

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', (error) => reject(error));
    stream.on('end', () => resolve());
  });

  return hash.digest('hex');
}
