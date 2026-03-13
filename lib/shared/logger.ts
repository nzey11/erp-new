/**
 * Simple server-side logger.
 * Outputs structured log lines to stdout/stderr so PM2 captures them.
 * Set LOG_LEVEL=silent to suppress all output (useful in tests).
 */

type LogLevel = "info" | "warn" | "error";

const isSilent = process.env.LOG_LEVEL === "silent";

function formatMessage(level: LogLevel, context: string, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const metaPart = meta ? ` | ${JSON.stringify(meta)}` : "";
  return `[${ts}] [${level.toUpperCase()}] [${context}] ${message}${metaPart}`;
}

export const logger = {
  info(context: string, message: string, meta?: unknown) {
    if (!isSilent) console.log(formatMessage("info", context, message, meta));
  },

  warn(context: string, message: string, meta?: unknown) {
    if (!isSilent) console.warn(formatMessage("warn", context, message, meta));
  },

  error(context: string, message: string, error?: unknown) {
    if (!isSilent) {
      const meta =
        error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack }
          : error;
      console.error(formatMessage("error", context, message, meta));
    }
  },
};
