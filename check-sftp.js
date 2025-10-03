const { listRemoteFiles } = require("./sftp");
const logger = require("./logger");

const limit = Number.parseInt(process.argv[2], 10) || 10;

(async () => {
  const files = await listRemoteFiles();

  if (!files.length) {
    logger.warn("no files returned or connection failed");
    return;
  }

  logger.info({ total: files.length }, "remote listing complete");
  logger.info({ limit: Math.min(limit, files.length) }, "showing first items");

  files.slice(0, limit).forEach((file) => {
    const typeLabel = file.type === "d" ? "dir" : "file";
    logger.info({ name: file.name, type: typeLabel }, "remote entry");
  });
})();

