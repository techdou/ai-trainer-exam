import { dbExec } from './db';

export interface AuditLogInput {
  actorId: string;
  actorRole?: string;
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

/**
 * details 归一: 调用方传纯文本则包 {message}; 传已序列化的 JSON 对象则解析后原样存储,
 * 避免"双重包装"成 {message:"{\"key\":...}"} 这种难以查询的形态。
 */
function normalizeDetails(details: string): string {
  try {
    const parsed: unknown = JSON.parse(details);
    if (parsed && typeof parsed === 'object') return JSON.stringify(parsed);
  } catch { /* 纯文本, 走 message 包装 */ }
  return JSON.stringify({ message: details });
}

export async function insertAudit(log: AuditLogInput): Promise<void> {
  try {
    await dbExec(
      `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, detail, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      log.actorId,
      log.actorRole ?? null,
      log.action,
      log.targetType ?? log.entityType,
      log.entityId,
      log.details ? normalizeDetails(log.details) : JSON.stringify({}),
      log.organizationId ?? null,
    );
  } catch (err) {
    // 审计日志失败不应阻断业务流程,但必须留痕,便于事后排查审计缺口。
    console.error('[audit] insert failed:', (err as Error).message, log.action, log.entityType, log.entityId);
  }
}

export async function bulkInsertAuditSingle(log: AuditLogInput): Promise<void> {
  await insertAudit(log);
}
