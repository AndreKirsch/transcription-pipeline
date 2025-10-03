require("dotenv").config();

const { z } = require("zod");

const logger = require("./logger");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.string().optional(),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  SFTP_HOST: z.string().min(1, "SFTP_HOST is required"),
  SFTP_PORT: z
    .preprocess((value) => {
      if (value === undefined || value === null || `${value}`.trim() === "") {
        return 22;
      }

      const parsed = Number.parseInt(`${value}`, 10);
      return Number.isNaN(parsed) ? 22 : parsed;
    }, z.number().int().positive()),
  SFTP_USER: z.string().min(1, "SFTP_USER is required"),
  SFTP_PASS: z.string().min(1, "SFTP_PASS is required"),
  SFTP_REMOTE_PATH: z.string().min(1, "SFTP_REMOTE_PATH is required"),
  SPACES_KEY: z.string().min(1, "SPACES_KEY is required"),
  SPACES_SECRET: z.string().min(1, "SPACES_SECRET is required"),
  SPACES_REGION: z.string().min(1, "SPACES_REGION is required"),
  SPACES_BUCKET: z.string().min(1, "SPACES_BUCKET is required"),
  SPACES_ENDPOINT: z.string().url().optional(),
  SPACES_PREFIX: z.string().optional(),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  DB_NAME: z.string().default("transcripts"),
  COLLECTION_NAME: z.string().default("calls"),
  PIPELINE_MAX_FILES: z.string().optional(),
  SFTP_MAX_FILES: z.string().optional()
});

const parseResult = schema.safeParse(process.env);

if (!parseResult.success) {
  const fieldErrors = parseResult.error.flatten().fieldErrors;
  logger.fatal({ fieldErrors }, "environment validation failed");
  throw new Error("Invalid environment configuration");
}

const env = parseResult.data;

function resolveLimit(value) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(`${value}`, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

module.exports = {
  env: env.NODE_ENV,
  openaiKey: env.OPENAI_API_KEY,

  sftp: {
    host: env.SFTP_HOST,
    port: env.SFTP_PORT,
    user: env.SFTP_USER,
    pass: env.SFTP_PASS,
    remotePath: env.SFTP_REMOTE_PATH,
    maxFiles: resolveLimit(env.SFTP_MAX_FILES)
  },

  spaces: {
    key: env.SPACES_KEY,
    secret: env.SPACES_SECRET,
    region: env.SPACES_REGION,
    bucket: env.SPACES_BUCKET,
    endpoint: env.SPACES_ENDPOINT,
    prefix: env.SPACES_PREFIX || ""
  },

  mongo: {
    uri: env.MONGO_URI,
    db: env.DB_NAME,
    collection: env.COLLECTION_NAME
  },

  limits: {
    pipelineMaxFiles: resolveLimit(env.PIPELINE_MAX_FILES)
  }
};

