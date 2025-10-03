const fs = require("fs");

const logger = require("./logger");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.debug({ dirPath }, "created directory");
  }
}

function cleanup(...files) {
  files.forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug({ filePath }, "deleted file");
    }
  });
}

module.exports = {
  ensureDir,
  cleanup
};

