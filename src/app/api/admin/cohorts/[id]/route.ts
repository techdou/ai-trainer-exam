import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbOne, dbExec } from '@/server/db';
import { ok, fail, catchError } from '@/lib/api';
import { insertAudit } from '@/server/audit';

export const runtime = 'nodejs';

/**
 * 删除班级（软删除）。
 * - 检查是否有进行中/未完成的考试安排，有则拒绝
 * - 软删除 cohort 记录（deleted_at = NOW()）
 * - 不删除学员账号和 enrollment 记录，学员仍在其他班级可用
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);
    const { id: cohortId } = await params;

    // 校验班级存在
    const cohort = await dbOne<{ id: string; name: string; organization_id: string }>(
      'SELECT id, name, organization_id FROM cohorts WHERE id=$1 AND deleted_at IS NULL',
      cohortId,
    );
    if (!cohort) return fail(404, '班级不存在');

    // 组织范围校验
    if (!user.roles.includes('super_admin') && user.organizationId !== cohort.organization_id) {
      return fail(403, '不能删除其他学校的班级');
    }

    // 检查是否有关联的进行中考试
    const activeExams = await dbOne<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM exam_schedules es
       WHERE es.cohort_id = $1 AND es.deleted_at IS NULL
         AND es.status IN ('scheduled', 'in_progress')`,
      cohortId,
    );
    if (activeExams && Number(activeExams.count) > 0) {
      return fail(400, `该班级有 ${activeExams.count} 场进行中或待开始的考试，请先处理考试安排后再删除`);
    }

    // 软删除班级
    const affected = await dbExec(
      'UPDATE cohorts SET deleted_at = NOW() WHERE id=$1 AND deleted_at IS NULL',
      cohortId,
    );

    if (affected === 0) {
      return fail(404, '班级不存在或已删除');
    }

    // 软删除该班级的 enrollments（学员账号保留，仅解除班级关联）
    await dbExec(
      "UPDATE enrollments SET status = 'withdrawn', updated_at = NOW() WHERE cohort_id = $1 AND status = 'active'",
      cohortId,
    );

    // 审计日志
    await insertAudit({
      actorId: user.id,
      actorRole: user.roles[0],
      action: 'cohort.delete',
      entityType: 'cohort',
      entityId: cohortId,
      details: `删除班级"${cohort.name}"（软删除，学员账号保留）`,
      organizationId: cohort.organization_id,
    });

    return ok({ message: '班级已删除' });
  } catch (error) {
    return catchError(error);
  }
}
