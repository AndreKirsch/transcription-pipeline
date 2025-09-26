import pino from 'pino';

export type Logger = pino.Logger;

const level = process.env.LOG_LEVEL ?? 'info';

const rootLogger = pino({
  level,
  base: { service: 'transcription-pipeline' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function getRootLogger(): Logger {
  return rootLogger;
}

export function createChildLogger(logger: Logger, bindings: pino.Bindings): Logger {
  return logger.child(bindings);
}
