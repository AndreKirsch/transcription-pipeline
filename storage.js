const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const config = require("./config");
const logger = require("./logger");
const { withRetry } = require("./retry");
const { ensureDir } = require("./utils");

const PROCESSED_DIR = path.join(__dirname, "processed");

ensureDir(PROCESSED_DIR);

function resolveEndpoint(region, explicitEndpoint) {
  if (explicitEndpoint) {
    return explicitEndpoint;
  }

  if (!region) {
    throw new Error("DigitalOcean Spaces region not configured. Set SPACES_REGION.");
  }

  return `https://${region}.digitaloceanspaces.com`;
}

function createS3Client() {
  const { key, secret, region, endpoint } = config.spaces;

  if (!key || !secret || !region || !config.spaces.bucket) {
    throw new Error("DigitalOcean Spaces configuration is incomplete. Check SPACES_KEY/SECRET/REGION/BUCKET.");
  }

  return new S3Client({
    region,
    credentials: {
      accessKeyId: key,
      secretAccessKey: secret
    },
    endpoint: resolveEndpoint(region, endpoint)
  });
}

function buildObjectKey(localPath, prefix = "") {
  const relative = path.relative(PROCESSED_DIR, path.resolve(localPath));
  const normalized = relative.split(path.sep).join("/");
  const trimmedPrefix = prefix.replace(/^\/+|\/+$/g, "");

  if (!normalized || normalized.startsWith("..")) {
    return trimmedPrefix ? `${trimmedPrefix}/${path.basename(localPath)}` : path.basename(localPath);
  }

  return trimmedPrefix ? `${trimmedPrefix}/${normalized}` : normalized;
}

function detectContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

async function putObject(client, bucket, filePath, key, options = {}) {
  await withRetry(
    () => {
      const body = fs.createReadStream(filePath);

      return client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ACL: options.acl || "private",
          ContentType: options.contentType || detectContentType(filePath),
          Metadata: options.metadata
        })
      );
    },
    {
      taskName: "spaces.putObject",
      baseDelayMs: 1500
    }
  );

  return key;
}

function buildFileUrl(endpoint, bucket, key) {
  const base = endpoint.replace(/\/$/, "");
  return `${base}/${bucket}/${key}`;
}

async function uploadFiles(wavPath, transcriptPath, meta = {}) {
  if (!wavPath || !transcriptPath) {
    throw new Error("Both wavPath and transcriptPath are required for upload.");
  }

  const client = createS3Client();
  const { bucket, prefix } = config.spaces;
  const endpoint = resolveEndpoint(config.spaces.region, config.spaces.endpoint);

  const wavKey = buildObjectKey(wavPath, prefix);
  const txtKey = buildObjectKey(transcriptPath, prefix);

  logger.info({ key: wavKey }, "uploading audio to spaces");
  await putObject(client, bucket, wavPath, wavKey, {
    metadata: {
      type: "audio",
      ...meta.audioMetadata
    }
  });

  logger.info({ key: txtKey }, "uploading transcript to spaces");
  await putObject(client, bucket, transcriptPath, txtKey, {
    metadata: {
      type: "transcript",
      ...meta.textMetadata
    }
  });

  return {
    audioUrl: buildFileUrl(endpoint, bucket, wavKey),
    textUrl: buildFileUrl(endpoint, bucket, txtKey),
    keys: {
      audio: wavKey,
      text: txtKey
    }
  };
}

module.exports = {
  uploadFiles
};

