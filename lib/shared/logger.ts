/**
 * Simple server-side logger.
 * Outputs structured log lines to stdout/stderr so PM2 captures them.
 */

type LogLevel = "info" | "warn" | "error";

function formatMessage(level: LogLevel, context: string, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const metaPart = meta ? ` | ${JSON.stringify(meta)}` : "";
  return `[${ts}] [${level.toUpperCase()}] [${context}] ${message}${metaPart}`;
}

export const logger = {
  info(context: string, message: string, meta?: unknown) {
    console.log(formatMessage("info", context, message, meta));
  },

  warn(context: string, message: string, meta?: unknown) {
    console.warn(formatMessage("warn", context, message, meta));
  },

  error(context: string, message: string, error?: unknown) {
    const meta =
      error instanceof Error
        ? { message: error.message, name: error.name, stack: error.stack }
        : error;
    console.error(formatMessage("error", context, message, meta));
  },
};
