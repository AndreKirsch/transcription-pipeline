import fs from 'fs';
import path from 'path';

import OpenAI from 'openai';

import type { OpenAIConnection } from '../types';

export interface TranscriptionResult {
  text: string;
  fullResponse: unknown;
}

export class OpenAIService {
  private readonly client: OpenAI;

  constructor(private readonly config: OpenAIConnection) {
    this.client = new OpenAI({ apiKey: config.api_key });
  }

  async transcribeFile(
    filePath: string,
    options?: { prompt?: string },
  ): Promise<TranscriptionResult> {
    const stream = fs.createReadStream(filePath);
    const fileName = path.basename(filePath);

    const response = await this.client.audio.transcriptions.create({
      file: stream,
      model: this.config.model,
      language: this.config.language,
      response_format: 'verbose_json',
      fileName,
      prompt: options?.prompt ?? this.config.prompt,
    } as any);

    const text = (response as { text?: string }).text ?? '';

    return {
      text,
      fullResponse: response,
    };
  }
}
