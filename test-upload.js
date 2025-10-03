const path = require("path");
const fs = require("fs");

const { uploadFiles } = require("./storage");
const logger = require("./logger");

const [audioArg, transcriptArg] = process.argv.slice(2);

if (!audioArg) {
  logger.error("usage: node test-upload.js <processed-audio-file> [transcript-file]");
  process.exit(1);
}

const audioPath = path.resolve(audioArg);

if (!fs.existsSync(audioPath)) {
  logger.error({ audioPath }, "audio file not found");
  process.exit(1);
}

let transcriptPath = transcriptArg ? path.resolve(transcriptArg) : null;

if (!transcriptPath) {
  const base = audioPath.replace(path.extname(audioPath), ".txt");
  if (fs.existsSync(base)) {
    transcriptPath = base;
  }
}

if (!transcriptPath || !fs.existsSync(transcriptPath)) {
  logger.error("transcript file not found. provide it explicitly or ensure a matching .txt exists.");
  process.exit(1);
}

(async () => {
  try {
    const result = await uploadFiles(audioPath, transcriptPath, {
      audioMetadata: {
        uploaded_by: "test-upload"
      },
      textMetadata: {
        uploaded_by: "test-upload"
      }
    });

    logger.info({ result }, "upload complete");
  } catch (err) {
    logger.error({ err }, "upload failed");
    process.exitCode = 1;
  }
})();

