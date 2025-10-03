const path = require("path");
const fs = require("fs");
const SftpClient = require("ssh2-sftp-client");

const config = require("./config");
const logger = require("./logger");
const { ensureDir } = require("./utils");
const { withRetry } = require("./retry");

const INCOMING_DIR = path.join(__dirname, "incoming");
const MAX_DOWNLOADS = config.sftp.maxFiles;

ensureDir(INCOMING_DIR);

function validateConfig() {
  const { host, port, user, pass, remotePath } = config.sftp || {};

  if (!host || !user || !pass || !remotePath) {
    throw new Error("Missing SFTP configuration. Check host/user/pass/remotePath in config.");
  }

  return { host, port, username: user, password: pass, remotePath };
}

async function collectAudioFiles(client, remoteDir) {
  const entries = await withRetry(() => client.list(remoteDir), {
    taskName: "sftp.list",
    baseDelayMs: 750
  });
  const audioFiles = [];

  for (const entry of entries) {
    if (entry.name === "." || entry.name === "..") {
      continue;
    }

    const entryPath = path.posix.join(remoteDir, entry.name);

    if (entry.type === "d") {
      const nested = await collectAudioFiles(client, entryPath);
      audioFiles.push(...nested);
    } else if (entry.type === "-" && /\.(wav|mp3|m4a)$/i.test(entry.name)) {
      audioFiles.push(entryPath);
    }
  }

  return audioFiles;
}

async function fetchNewFiles() {
  const client = new SftpClient();
  const downloadedFiles = [];
  let connectionConfig;

  try {
    connectionConfig = validateConfig();
    logger.info({ host: connectionConfig.host, port: connectionConfig.port }, "connecting to SFTP");

    await withRetry(() => client.connect({
      host: connectionConfig.host,
      port: connectionConfig.port,
      username: connectionConfig.username,
      password: connectionConfig.password
    }), {
      taskName: "sftp.connect",
      baseDelayMs: 1000
    });

    logger.info("connected to SFTP");

    let audioFiles = await collectAudioFiles(client, connectionConfig.remotePath);
    logger.info({ total: audioFiles.length }, "discovered audio files");

    if (MAX_DOWNLOADS && audioFiles.length > MAX_DOWNLOADS) {
      logger.warn({ limit: MAX_DOWNLOADS, total: audioFiles.length }, "limiting SFTP downloads");
      audioFiles = audioFiles.slice(0, MAX_DOWNLOADS);
    }

    for (const remoteFile of audioFiles) {
      const relativePath = path.posix.relative(connectionConfig.remotePath, remoteFile);
      const localFile = path.join(INCOMING_DIR, ...relativePath.split("/"));
      const localDir = path.dirname(localFile);

      ensureDir(localDir);

      if (fs.existsSync(localFile)) {
        logger.info({ file: relativePath }, "skipping existing local file");
        continue;
      }

      try {
        logger.info({ file: relativePath }, "downloading from SFTP");
        await withRetry(({ attempt }) => {
          if (attempt > 1 && fs.existsSync(localFile)) {
            fs.unlinkSync(localFile);
          }

          return client.fastGet(remoteFile, localFile);
        }, {
          taskName: "sftp.download",
          baseDelayMs: 1000
        });
        logger.info({ file: relativePath }, "downloaded from SFTP");
        downloadedFiles.push(localFile);
      } catch (downloadErr) {
        logger.error({ err: downloadErr, file: relativePath }, "failed to download file from SFTP");
      }
    }
  } catch (err) {
    logger.error({ err }, "sftp error");
  } finally {
    try {
      await client.end();
      logger.info("disconnected from SFTP");
    } catch (endErr) {
      logger.warn({ err: endErr }, "failed to close SFTP connection cleanly");
    }
  }

  return downloadedFiles;
}

async function listRemoteFiles() {
  const client = new SftpClient();
  let connectionConfig;

  try {
    connectionConfig = validateConfig();
    logger.info({ host: connectionConfig.host, port: connectionConfig.port }, "connecting to SFTP");

    await withRetry(() => client.connect({
      host: connectionConfig.host,
      port: connectionConfig.port,
      username: connectionConfig.username,
      password: connectionConfig.password
    }), {
      taskName: "sftp.connect",
      baseDelayMs: 1000
    });

    logger.info("connected to SFTP");
    const fileList = await withRetry(() => client.list(connectionConfig.remotePath), {
      taskName: "sftp.list"
    });
    logger.info({ total: fileList.length }, "retrieved remote items");
    return fileList;
  } catch (err) {
    logger.error({ err }, "sftp error");
    return [];
  } finally {
    try {
      await client.end();
      logger.info("disconnected from SFTP");
    } catch (endErr) {
      logger.warn({ err: endErr }, "failed to close SFTP connection cleanly");
    }
  }
}

module.exports = { fetchNewFiles, listRemoteFiles };

