import { config } from "./config.js";

/**
 * Minimal leveled logger. Level is configurable via LOG_LEVEL (error|warn|info|debug),
 * defaulting to "info". DEBUG=true is a shorthand that forces the "debug" level.
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof LEVELS;

const activeLevel: Level = config.logLevel;

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] > LEVELS[activeLevel]) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { ...meta } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
};
