const logger = require("./logger");

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withRetry(action, options = {}) {
  const {
    attempts = 3,
    baseDelayMs = 500,
    factor = 2,
    taskName = "operation"
  } = options;

  let attempt = 0;
  let lastError;

  while (attempt < attempts) {
    try {
      return await action({ attempt: attempt + 1 });
    } catch (err) {
      lastError = err;
      attempt += 1;

      if (attempt >= attempts) {
        break;
      }

      const delay = baseDelayMs * factor ** (attempt - 1);
      logger.warn({ err, attempt, taskName, delay }, "retrying task");
      await wait(delay);
    }
  }

  logger.error({ err: lastError, taskName, attempts }, "all retries failed");
  throw lastError;
}

module.exports = {
  withRetry
};

