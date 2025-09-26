import path from 'path';

export const PROJECT_ROOT = process.cwd();
export const WORKFLOW_FILE = path.resolve(PROJECT_ROOT, 'transcription_workflow.yaml');

export const TMP_AUDIO_DIR = path.resolve(PROJECT_ROOT, 'tmp_audio');
export const TMP_TRANSCRIPTS_DIR = path.resolve(PROJECT_ROOT, 'tmp_transcripts');
export const LOGS_DIR = path.resolve(PROJECT_ROOT, 'logs');

export const DEFAULT_AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a'];
export const DEFAULT_TRANSCRIPT_EXTENSION = '.json';
