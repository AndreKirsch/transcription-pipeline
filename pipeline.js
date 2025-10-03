const fs = require("fs");
const path = require("path");

const config = require("./config");
const { fetchNewFiles } = require("./sftp");
const { processFile } = require("./transcribe");
const { uploadFiles } = require("./storage");
const { insertRecord } = require("./mongo");
const logger = require("./logger");
const { ensureDir, cleanup } = require("./utils");

const INCOMING_DIR = path.join(__dirname, "incoming");
const PROCESSED_DIR = path.join(__dirname, "processed");
const MAX_FILES = config.limits.pipelineMaxFiles;

ensureDir(INCOMING_DIR);
ensureDir(PROCESSED_DIR);

function resolveRelativeIncoming(filePath) {
  const absolute = path.resolve(filePath);
  const relative = path.relative(INCOMING_DIR, absolute);

  return {
    absolute,
    relative: relative.startsWith("..") ? path.basename(absolute) : relative
  };
}

function ensureProcessedAudio(absoluteIncoming, relativeIncoming) {
  const targetPath = path.join(PROCESSED_DIR, relativeIncoming);
  const targetDir = path.dirname(targetPath);

  ensureDir(targetDir);

  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(absoluteIncoming, targetPath);
  }

  return targetPath;
}

function ensureProcessedTranscript(transcriptPath, relativeIncoming) {
  const targetRelative = relativeIncoming.replace(path.extname(relativeIncoming), ".txt");
  const targetPath = path.join(PROCESSED_DIR, targetRelative);
  const targetDir = path.dirname(targetPath);

  ensureDir(targetDir);

  const currentPath = path.resolve(transcriptPath);

  if (currentPath !== targetPath) {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.renameSync(currentPath, targetPath);
  }

  return targetPath;
}

async function handleFile(filePath) {
  const { absolute, relative } = resolveRelativeIncoming(filePath);

  logger.info({ file: relative }, "processing started");

  try {
    const transcription = await processFile(absolute);
    const processedAudioPath = ensureProcessedAudio(absolute, relative);
    const processedTranscriptPath = ensureProcessedTranscript(transcription.txt, relative);

    const uploadResult = await uploadFiles(processedAudioPath, processedTranscriptPath, {
      audioMetadata: {
        source_file: relative,
        processed_at: transcription.meta?.processedAt
      },
      textMetadata: {
        source_file: relative,
        processed_at: transcription.meta?.processedAt
      }
    });

    await insertRecord({
      source: relative,
      audioUrl: uploadResult.audioUrl,
      textUrl: uploadResult.textUrl,
      transcript: transcription.text,
      meta: transcription.meta,
      storageKeys: uploadResult.keys
    });

    await cleanup(absolute);

    logger.info({ file: relative }, "processing completed");
  } catch (err) {
    logger.error({ err, file: relative }, "processing failed");
  }
}

async function runPipeline() {
  logger.info("pipeline run started");

  let files;

  try {
    files = await fetchNewFiles();
  } catch (err) {
    logger.error({ err }, "failed to fetch files from SFTP");
    return;
  }

  if (!files.length) {
    logger.info("no new files found");
    return;
  }

  if (MAX_FILES && files.length > MAX_FILES) {
    logger.warn({ max: MAX_FILES, total: files.length }, "limiting pipeline run");
    files = files.slice(0, MAX_FILES);
  }

  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    await handleFile(file);
  }

  logger.info("pipeline run complete");
}

if (require.main === module) {
  runPipeline().catch((err) => {
    logger.fatal({ err }, "unhandled pipeline error");
    process.exitCode = 1;
  });
}

module.exports = { runPipeline };

