const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const config = require("./config");
const logger = require("./logger");
const { withRetry } = require("./retry");
const { ensureDir } = require("./utils");

const openai = new OpenAI({ apiKey: config.openaiKey });

const INCOMING_DIR = path.join(__dirname, "incoming");
const PROCESSED_DIR = path.join(__dirname, "processed");

ensureDir(INCOMING_DIR);
ensureDir(PROCESSED_DIR);

function fallbackTwoSpeakers(text) {
  const parts = text
    .replace(/\s+/g, " ")
    .match(/[^.!?\n]+[.!?]*/g) || [text];

  return parts
    .map((segment, index) => {
      const speaker = index % 2 === 0 ? "Speaker 1" : "Speaker 2";
      return `${speaker}: ${segment.trim()}`;
    })
    .join("\n");
}

async function formatDialogue(rawTranscript) {
  try {
    const response = await withRetry(() => openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "Format into a clean two-person dialogue."
        },
        {
          role: "user",
          content: `Format this transcript into exactly two speakers, labeled 'Speaker 1' and 'Speaker 2'.\nTranscript:\n${rawTranscript}`
        }
      ],
      max_tokens: 4096
    }), {
      taskName: "openai.formatDialogue",
      baseDelayMs: 1500
    });

    return response?.choices?.[0]?.message?.content?.trim() || "";
  } catch (err) {
    logger.warn({ err }, "openai formatting failed, falling back");
    return "";
  }
}

async function transcribeFile(filePath) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const outPath = path.join(PROCESSED_DIR, `${baseName}.txt`);

  if (fs.existsSync(outPath)) {
    logger.info({ file: baseName }, "skip transcription - already processed");
    return {
      wav: filePath,
      txt: outPath,
      text: fs.readFileSync(outPath, "utf8"),
      meta: { status: "already-processed" }
    };
  }

  try {
    logger.info({ file: filePath }, "transcribing audio");

    const asr = await withRetry(() => openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "gpt-4o-transcribe"
    }), {
      taskName: "openai.transcription",
      baseDelayMs: 2000
    });

    const rawTranscript = asr?.text?.trim() || "";

    let finalTranscript = await formatDialogue(rawTranscript);

    if (!/^Speaker (1|2):/m.test(finalTranscript)) {
      finalTranscript = finalTranscript || rawTranscript || fallbackTwoSpeakers(rawTranscript);
    }

    fs.writeFileSync(outPath, finalTranscript);
    logger.info({ file: outPath }, "wrote transcript");

    return {
      wav: filePath,
      txt: outPath,
      text: finalTranscript,
      meta: {
        status: "transcribed",
        model: "gpt-4o-transcribe",
        formattedWith: "gpt-4o-mini"
      }
    };
  } catch (err) {
    logger.error({ err, file: filePath }, "transcription failed");
    throw err;
  }
}

async function processFile(filePath) {
  return transcribeFile(filePath);
}

async function run() {
  const files = fs
    .readdirSync(INCOMING_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(wav|mp3|m4a)$/i.test(entry.name))
    .map((entry) => path.join(INCOMING_DIR, entry.name));

  logger.info({ count: files.length }, "found audio files to transcribe");

  for (const filePath of files) {
    try {
      await transcribeFile(filePath);
    } catch (err) {
      // Errors already logged in transcribeFile
    }
  }

  logger.info("transcription run complete");
}

if (require.main === module) {
  run().catch((err) => {
    logger.fatal({ err }, "unhandled error in transcription run");
    process.exitCode = 1;
  });
}

module.exports = { processFile, transcribeFile, run };

