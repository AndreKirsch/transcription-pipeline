const { fetchNewFiles } = require("./sftp");
const logger = require("./logger");

(async () => {
  try {
    const files = await fetchNewFiles();
    logger.info({ count: files.length }, "sftp fetch finished");
    logger.debug({ files }, "downloaded files");
  } catch (err) {
    logger.error({ err }, "sftp test run failed");
    process.exitCode = 1;
  }
})();

