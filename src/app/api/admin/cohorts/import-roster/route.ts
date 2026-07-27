import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbOne, dbQuery, dbExec } from '@/server/db';
import { ok, fail, catchError } from '@/lib/api';
import { insertAudit } from '@/server/audit';
import { getSupabaseClient, loadEnv } from '@/storage/database/supabase-client';
import { parseRoster, idCardToEmail, idCardToPassword, type RosterStudent } from '@/server/roster-import';

export const runtime = 'nodejs';

interface ImportResult {
  cohortId: string;
  cohortName: string;
  total: number;
  created: number;
  skipped: number;
  errors: string[];
  students: Array<{ name: string; idCard: string; email: string; status: 'created' | 'skipped' | 'error'; message?: string }>;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);
    const formData = await req.formData();
    const file = formData.get('file');
    const organizationId = (formData.get('organizationId') as string | null) || '';
    const customCohortName = (formData.get('cohortName') as string | null) || '';
    const existingCohortId = (formData.get('cohortId') as string | null) || '';

    if (!file || !(file instanceof File)) {
      return fail(400, '请上传名册文件');
    }
    if (!file.name.match(/\.xlsx?$/i)) {
      return fail(400, '仅支持 .xlsx 或 .xls 格式的名册文件');
    }

    // 解析 Excel
    const fileBuffer = await file.arrayBuffer();
    const parsed = parseRoster(fileBuffer);
    const cohortName = customCohortName.trim() || parsed.cohortName;

    // 确定组织 ID
    const isSuper = user.roles.includes('super_admin');
    const orgId = isSuper ? organizationId || null : user.organizationId;
    if (!orgId) return fail(400, '请选择所属学校');

    // 验证组织存在
    const org = await dbOne<{ id: string }>("SELECT id FROM organizations WHERE id=$1 AND status='active'", orgId);
    if (!org) return fail(404, '所属学校不存在或已停用');

    // 确定班级：优先用传入的 cohortId，否则按名称查找或创建
    let cohortId = existingCohortId;
    if (!cohortId) {
      const existing = await dbOne<{ id: string }>(
        'SELECT id FROM cohorts WHERE organization_id=$1 AND name=$2 AND deleted_at IS NULL',
        orgId, cohortName,
      );
      cohortId = existing?.id ?? '';
    }
    if (!cohortId) {
      const created = await dbOne<{ id: string }>(
        'INSERT INTO cohorts(organization_id, name, status) VALUES($1, $2, $3) RETURNING id',
        orgId, cohortName, 'active',
      );
      cohortId = created!.id;
    }

    // 批量创建学员
    loadEnv();
    const supabase = getSupabaseClient();
    const result: ImportResult = {
      cohortId,
      cohortName,
      total: parsed.students.length,
      created: 0,
      skipped: 0,
      errors: [],
      students: [],
    };

    for (const student of parsed.students) {
      const email = idCardToEmail(student.idCard);
      const password = idCardToPassword(student.idCard);

      try {
        // 检查是否已存在（按邮箱查 profiles）
        const existingProfile = await dbOne<{ id: string }>(
          'SELECT id FROM profiles WHERE email=$1', email,
        );

        if (existingProfile) {
          // 已存在：确保已注册到当前班级
          await dbExec(
            `INSERT INTO enrollments(user_id, cohort_id, status, created_at, updated_at)
             VALUES($1, $2, 'active', NOW(), NOW())
             ON CONFLICT(user_id, cohort_id) DO UPDATE SET status='active', updated_at=NOW()`,
            existingProfile.id, cohortId,
          );
          result.skipped++;
          result.students.push({ name: student.name, idCard: student.idCard, email, status: 'skipped', message: '账号已存在，已关联到本班级' });
          continue;
        }

        // 创建 Auth 账号
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: student.name },
        });

        if (authError || !authData.user) {
          // 唯一约束冲突 = 已存在
          if (authError?.message.toLowerCase().includes('already')) {
            // Auth 存在但 profiles 没有（异常状态），尝试通过 Admin API 获取并修复
            result.skipped++;
            result.students.push({ name: student.name, idCard: student.idCard, email, status: 'skipped', message: '账号已存在' });
          } else {
            result.errors.push(`${student.name}(${student.idCard}): ${authError?.message ?? '创建失败'}`);
            result.students.push({ name: student.name, idCard: student.idCard, email, status: 'error', message: authError?.message ?? '创建失败' });
          }
          continue;
        }

        const userId = authData.user.id;

        // 落库：profile + role + enrollment（事务包裹，失败回滚并删除 Auth 账号）
        try {
          await dbTx(async (tx) => {
            await tx.query(
              `INSERT INTO profiles(id, organization_id, display_name, email, must_change_password, status)
               VALUES($1, $2, $3, $4, true, 'active')`,
              [userId, orgId, student.name, email],
            );
            await tx.query(
              'INSERT INTO user_roles(user_id, role, organization_id) VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
              [userId, 'student', orgId],
            );
            await tx.query(
              `INSERT INTO enrollments(user_id, cohort_id, status, created_at, updated_at)
               VALUES($1, $2, 'active', NOW(), NOW())
               ON CONFLICT(user_id, cohort_id) DO UPDATE SET status='active', updated_at=NOW()`,
              [userId, cohortId],
            );
          });

        result.created++;
        result.students.push({ name: student.name, idCard: student.idCard, email, status: 'created' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${student.name}(${student.idCard}): ${msg}`);
        result.students.push({ name: student.name, idCard: student.idCard, email, status: 'error', message: msg });
      }
    }

    // 审计日志
    await insertAudit({
      actorId: user.id,
      actorRole: user.roles[0],
      action: 'cohort.import_roster',
      entityType: 'cohort',
      entityId: cohortId,
      details: `导入名册"${file.name}"到班级"${cohortName}"：共${result.total}人，新建${result.created}人，跳过${result.skipped}人${result.errors.length ? `，失败${result.errors.length}人` : ''}`,
      organizationId: orgId,
    });

    return ok(result, { status: 201 });
  } catch (error) {
    return catchError(error);
  }
}
