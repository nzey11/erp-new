// =============================================
// USER AUDIT: Lifecycle Change Logging
// =============================================

import { logger } from "@/lib/shared/logger";

export type UserLifecycleAction = "activate" | "deactivate" | "soft_delete";
export type UserLifecycleResult = "success" | "forbidden" | "failed";

export interface UserLifecycleAuditEvent {
  action: UserLifecycleAction;
  actorUserId: string;
  targetUserId: string;
  targetUsername: string;
  route: string;
  ip?: string;
  userAgent?: string;
  timestamp: Date;
  result: UserLifecycleResult;
  reason?: string; // For forbidden/failed results
}

/**
 * Log a user lifecycle change for audit purposes.
 * Structured logging enables forensic trace and incident investigation.
 */
export function logUserLifecycleChange(event: UserLifecycleAuditEvent): void {
  const logData = {
    type: "user_lifecycle_change",
    ...event,
    timestamp: event.timestamp.toISOString(),
  };

  if (event.result === "success") {
    logger.info("user:audit", `User ${event.action} by ${event.actorUserId}`, logData);
  } else if (event.result === "forbidden") {
    logger.warn("user:audit", `Forbidden ${event.action} attempt by ${event.actorUserId}`, logData);
  } else {
    logger.error("user:audit", `Failed ${event.action} by ${event.actorUserId}`, logData);
  }
}

/**
 * Build audit event from request context.
 * Extracts metadata from NextRequest for consistent logging.
 */
export function buildAuditEvent(
  action: UserLifecycleAction,
  actorUserId: string,
  targetUser: { id: string; username: string },
  request: Request,
  result: UserLifecycleResult,
  reason?: string
): UserLifecycleAuditEvent {
  return {
    action,
    actorUserId,
    targetUserId: targetUser.id,
    targetUsername: targetUser.username,
    route: request.url,
    ip: request.headers.get("x-forwarded-for") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    timestamp: new Date(),
    result,
    reason,
  };
}
