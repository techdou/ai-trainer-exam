import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbOne } from '@/server/db';
import { ok, fail, catchError } from '@/lib/api';
import { insertAudit } from '@/server/audit';
import { getSupabaseClient, getSupabaseServiceRoleKey, loadEnv } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';

/**
 * 批量重置班级内所有学员的密码为身份证号后六位。
 * 适用于修复旧数据（导入时密码规则变更、密码丢失等场景）。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);
    const { id: cohortId } = await params;

    // 校验班级存在 + 组织范围
    const cohort = await dbOne<{ id: string; name: string; organization_id: string }>(
      'SELECT id, name, organization_id FROM cohorts WHERE id=$1 AND deleted_at IS NULL',
      cohortId,
    );
    if (!cohort) return fail(404, '班级不存在');

    if (!user.roles.includes('super_admin') && user.organizationId !== cohort.organization_id) {
      return fail(403, '不能操作其他学校的班级');
    }

    // 显式校验 service role key
    loadEnv();
    if (!getSupabaseServiceRoleKey()) {
      return fail(500, '服务器未配置 COZE_SUPABASE_SERVICE_ROLE_KEY, 无法重置密码');
    }

    // 查出该班级所有学员的 email 和 idCard
    const students = await dbQuery<{ id: string; email: string; display_name: string }>(
      `SELECT p.id, p.email, p.display_name
       FROM enrollments e
       JOIN profiles p ON p.id = e.user_id
       WHERE e.cohort_id = $1 AND e.status = 'active'
       ORDER BY p.display_name`,
      cohortId,
    );

    if (students.length === 0) {
      return fail(400, '该班级暂无学员，无需重置');
    }

    const supabase = getSupabaseClient();
    const results: Array<{ name: string; idCard: string; success: boolean; message?: string }> = [];
    let successCount = 0;
    let failCount = 0;

    for (const s of students) {
      // 从 email 中提取身份证号
      const idCard = s.email.includes('@student.exam.local')
        ? s.email.replace('@student.exam.local', '').toUpperCase()
        : null;

      if (!idCard || idCard.length < 6) {
        results.push({ name: s.display_name, idCard: s.email, success: false, message: '无法从账号解析出有效身份证号' });
        failCount++;
        continue;
      }

      const password = idCard.slice(-6);

      const { error } = await supabase.auth.admin.updateUserById(s.id, {
        password,
      });

      if (error) {
        results.push({ name: s.display_name, idCard, success: false, message: error.message });
        failCount++;
      } else {
        results.push({ name: s.display_name, idCard, success: true });
        successCount++;
      }
    }

    // 重置密码后强制下次登录改密
    await dbQuery(
      `UPDATE profiles SET must_change_password = true
       WHERE id IN (
         SELECT e.user_id FROM enrollments e WHERE e.cohort_id = $1 AND e.status = 'active'
       )`,
      cohortId,
    );

    // 审计日志
    await insertAudit({
      actorId: user.id,
      actorRole: user.roles[0],
      action: 'cohort.reset_passwords',
      entityType: 'cohort',
      entityId: cohortId,
      details: `批量重置班级"${cohort.name}"学员密码为身份证号后六位：成功 ${successCount} 人，失败 ${failCount} 人`,
      organizationId: cohort.organization_id,
    });

    return ok({
      total: students.length,
      success: successCount,
      failed: failCount,
      details: results,
    });
  } catch (error) {
    return catchError(error);
  }
}
