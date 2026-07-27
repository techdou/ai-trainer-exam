import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbOne, dbTx } from '@/server/db';
import { ok, fail, catchError } from '@/lib/api';
import { insertAudit } from '@/server/audit';
import { getSupabaseClient, getSupabaseServiceRoleKey, loadEnv } from '@/storage/database/supabase-client';
import { parseRoster, idCardToEmail, idCardToPassword } from '@/server/roster-import';

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
    if (!file.name.match(/\.xlsx$/i)) {
      return fail(400, '仅支持 .xlsx 格式的名册文件');
    }
    // 文件大小上限 5MB, 防 XLSX 炸弹 OOM
    if (file.size > 5 * 1024 * 1024) {
      return fail(413, '名册文件不能超过 5MB');
    }
    // magic number 二次校验: xlsx 实际是 ZIP(PK\x03\x04), 防伪造扩展名
    const fileBuffer = await file.arrayBuffer();
    const header = new Uint8Array(fileBuffer.slice(0, 4));
    const isZip = header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
    if (!isZip) {
      return fail(400, '文件内容不是有效的 .xlsx 文件(缺少 ZIP 文件头), 可能伪造了扩展名');
    }

    // 显式校验 service role key: 缺失时 admin.createUser 必崩, 提前 fail 避免每条学员都静默 skipped
    loadEnv();
    if (!getSupabaseServiceRoleKey()) {
      return fail(500, '服务器未配置 COZE_SUPABASE_SERVICE_ROLE_KEY, 无法创建账号, 请联系平台管理员');
    }

    // 解析 Excel(fileBuffer 已在 magic number 校验时读取)
    const parsed = await parseRoster(fileBuffer);
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
    let resolvedCohortName = cohortName;
    if (cohortId) {
      const selectedCohort = await dbOne<{ id: string; name: string }>(
        'SELECT id,name FROM cohorts WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL',
        cohortId,
        orgId,
      );
      if (!selectedCohort) return fail(404, '所选班级不存在或不属于当前学校');
      resolvedCohortName = selectedCohort.name;
    }
    if (!cohortId) {
      const existing = await dbOne<{ id: string; name: string }>(
        'SELECT id,name FROM cohorts WHERE organization_id=$1 AND name=$2 AND deleted_at IS NULL',
        orgId, cohortName,
      );
      cohortId = existing?.id ?? '';
      resolvedCohortName = existing?.name ?? cohortName;
    }
    if (!cohortId) {
      const created = await dbOne<{ id: string }>(
        'INSERT INTO cohorts(organization_id, name) VALUES($1, $2) RETURNING id',
        orgId, cohortName,
      );
      cohortId = created!.id;
    }

    const supabase = getSupabaseClient();
    const result: ImportResult = {
      cohortId,
      cohortName: resolvedCohortName,
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
        const existingProfile: { id: string; organization_id: string | null; is_student: boolean } | null = await dbOne<{
          id: string;
          organization_id: string | null;
          is_student: boolean;
        }>(
          `SELECT p.id,p.organization_id,
                  EXISTS(
                    SELECT 1 FROM user_roles ur
                    WHERE ur.user_id=p.id AND ur.role='student' AND ur.organization_id=$2
                  ) AS is_student
             FROM profiles p WHERE p.email=$1`,
          email,
          orgId,
        );

        if (existingProfile) {
          if (existingProfile.organization_id !== orgId) {
            const message = '账号已属于其他机构，已拒绝跨机构关联';
            result.errors.push(`${student.name}(${student.idCard}): ${message}`);
            result.students.push({ name: student.name, idCard: student.idCard, email, status: 'error', message });
            continue;
          }
          if (!existingProfile.is_student) {
            const message = '同邮箱账号不是当前机构学员，已拒绝加入班级';
            result.errors.push(`${student.name}(${student.idCard}): ${message}`);
            result.students.push({ name: student.name, idCard: student.idCard, email, status: 'error', message });
            continue;
          }
          // 已存在：确保已注册到当前班级
          await dbTx(async (tx) => {
            await tx.query(
              `INSERT INTO enrollments(user_id, cohort_id, status, created_at, updated_at)
               VALUES($1, $2, 'active', NOW(), NOW())
               ON CONFLICT(user_id, cohort_id) DO UPDATE SET status='active', updated_at=NOW()`,
              [existingProfile.id, cohortId],
            );
          });
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
          const msg = (authError?.message ?? '创建失败').toLowerCase();
          if (msg.includes('already')) {
            // Auth 存在但 profiles 缺失(异常状态): 修复 profile+role+enrollment, 不静默 skipped
            try {
              const { data: existing } = await supabase.auth.admin.listUsers();
              const authUser = existing?.users?.find(u => u.email?.toLowerCase() === email);
              if (authUser) {
                await dbTx(async (tx) => {
                  await tx.query(
                    `INSERT INTO profiles(id, organization_id, display_name, email, must_change_password, status)
                     VALUES($1, $2, $3, $4, true, 'active')
                     ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name, updated_at=NOW()`,
                    [authUser.id, orgId, student.name, email],
                  );
                  await tx.query(
                    'INSERT INTO user_roles(user_id, role, organization_id) VALUES($1, $2, $3) ON CONFLICT DO NOTHING',
                    [authUser.id, 'student', orgId],
                  );
                  await tx.query(
                    `INSERT INTO enrollments(user_id, cohort_id, status, created_at, updated_at)
                     VALUES($1, $2, 'active', NOW(), NOW())
                     ON CONFLICT(user_id, cohort_id) DO UPDATE SET status='active', updated_at=NOW()`,
                    [authUser.id, cohortId],
                  );
                });
                result.created++;
                result.students.push({ name: student.name, idCard: student.idCard, email, status: 'created', message: '账号已存在并已修复业务数据' });
                continue;
              }
            } catch {
              // 修复失败, 落入 error 让管理员看到
            }
            result.errors.push(`${student.name}(${student.idCard}): Auth 账号已存在但无法修复业务数据, 请联系平台管理员`);
            result.students.push({ name: student.name, idCard: student.idCard, email, status: 'error', message: 'Auth 账号已存在但业务数据修复失败' });
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
        } catch (dbErr) {
          // DB 落库失败：补偿删除 Auth 账号，避免孤儿
          await supabase.auth.admin.deleteUser(userId);
          const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
          result.errors.push(`${student.name}(${student.idCard}): ${msg}`);
          result.students.push({ name: student.name, idCard: student.idCard, email, status: 'error', message: msg });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${student.name}(${student.idCard}): ${msg}`);
        result.students.push({ name: student.name, idCard: student.idCard, email, status: 'error', message: msg });
      }
    }

    // 审计日志(密码相关不写详情)
    await insertAudit({
      actorId: user.id,
      actorRole: user.roles[0],
      action: 'cohort.import_roster',
      entityType: 'cohort',
      entityId: cohortId,
      details: `导入名册"${file.name}"到班级"${resolvedCohortName}"：共${result.total}人，新建${result.created}人，跳过${result.skipped}人${result.errors.length ? `，失败${result.errors.length}人` : ''}`,
      organizationId: orgId,
    });

    return ok(result, { status: 201 });
  } catch (error) {
    return catchError(error);
  }
}
