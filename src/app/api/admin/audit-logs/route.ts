import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import {ok, fail, catchError} from '@/lib/api';

/**
 * GET /api/admin/audit-logs
 *
 * 查询审计日志，支持分页和过滤
 * 参数:
 *   page: 页码 (默认1)
 *   pageSize: 每页大小 (默认20)
 *   action: 操作类型过滤
 *   actorId: 操作人ID过滤
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request as unknown as Request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));
    const action = searchParams.get('action') || '';
    const actorId = searchParams.get('actorId') || '';

    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIdx = 1;

    if (action) {
      whereClause += ` AND al.action = $${paramIdx++}`;
      params.push(action);
    }
    if (actorId) {
      whereClause += ` AND al.actor_id = $${paramIdx++}`;
      params.push(actorId);
    }

    // 获取总数
    const countResult = await dbQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_logs al ${whereClause}`,
      ...params,
    );
    const total = parseInt(countResult[0]?.count || '0');

    // 获取分页数据
    const logs = await dbQuery<{
      id: string;
      actor_id: string;
      actor_role: string | null;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      detail: unknown;
      created_at: string;
      actor_name: string | null;
    }>(
      `SELECT al.id, al.actor_id, al.actor_role, al.action,
              al.entity_type, al.entity_id, al.detail,
              al.created_at::text,
              p.display_name AS actor_name
       FROM audit_logs al
       LEFT JOIN profiles p ON p.id = al.actor_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      ...params,
      pageSize,
      offset,
    );

    return ok({
      logs: logs.map(l => ({
        id: l.id,
        actorId: l.actor_id,
        actorName: l.actor_name || l.actor_id,
        actorRole: l.actor_role,
        action: l.action,
        entityType: l.entity_type,
        entityId: l.entity_id,
        detail: l.detail,
        createdAt: l.created_at,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (e: unknown) {
    return catchError(e);
  }
}
