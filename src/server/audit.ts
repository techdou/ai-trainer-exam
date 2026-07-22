import { dbExec } from './db';

export interface AuditLogInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details?: string;
  organizationId?: string | null;
  /** @deprecated use entityType */
  targetType?: string;
}

/**
 * 批量写入审计日志，失败不阻断主流程。
 */
export async function bulkInsertAudit(logs: AuditLogInput[]): Promise<void> {
  for (const log of logs) {
    await insertAudit(log);
  }
}

export async function insertAudit(log: AuditLogInput): Promise<void> {
  try {
    await dbExec(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      log.actorId,
      log.action,
      log.targetType ?? log.entityType,
      log.entityId,
      log.details ?? null,
      log.organizationId ?? null,
    );
  } catch {
    // 审计日志失败不应阻断业务流程
  }
}

export async function bulkInsertAuditSingle(log: AuditLogInput): Promise<void> {
  await insertAudit(log);
}
