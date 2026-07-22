import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, fail } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['teacher', 'super_admin']);

    // 教师通过 organization_id 关联学员
    // 获取该组织下所有学员
    const students = await dbQuery<{
      id: string; display_name: string; email: string; created_at: string;
    }>(
      `SELECT p.id, p.display_name, p.email, p.created_at
       FROM profiles p
       JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'student'
       WHERE ur.organization_id = $1
       ORDER BY p.display_name`,
      user.organizationId ?? '00000000-0000-0000-0000-000000000001'
    );

    // 批量获取学员练习统计
    const studentIds = students.map(s => s.id);
    let stats: Array<{ user_id: string; total: string; passed_count: string }> = [];
    if (studentIds.length > 0) {
      stats = await dbQuery<{ user_id: string; total: string; passed_count: string }>(
        `SELECT user_id, COUNT(*)::text as total, COUNT(*) FILTER (WHERE passed)::text as passed_count
         FROM practice_attempts
         WHERE user_id = ANY($1::text[])
         GROUP BY user_id`,
        studentIds
      );
    }

    const statsMap = new Map(stats.map(s => [s.user_id, s]));

    const items = students.map(s => {
      const st = statsMap.get(s.id);
      return {
        id: s.id,
        displayName: s.display_name || s.email,
        email: s.email,
        createdAt: s.created_at,
        totalAttempts: st ? parseInt(st.total, 10) : 0,
        passedAttempts: st ? parseInt(st.passed_count, 10) : 0,
      };
    });

    return ok({ items, total: items.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return fail(500, msg);
  }
}
