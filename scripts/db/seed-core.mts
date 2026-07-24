/**
 * 核心种子数据：机构、项目、班级和初始账号。
 *
 * 安全约束：
 * - 生产环境必须显式设置 SEED_ADMIN_PASSWORD；脚本不含固定密码。
 * - 新建账号默认 must_change_password=true。
 * - 脚本幂等，可重复运行。
 *
 * 用法：pnpm tsx scripts/db/seed-core.mts
 */
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';

loadEnv();
const generatedPassword = () => `Ai!${randomBytes(9).toString('base64url')}`;
const isProd = (process.env.COZE_PROJECT_ENV ?? process.env.NODE_ENV) === 'PROD' || process.env.NODE_ENV === 'production';
const adminPassword = process.env.SEED_ADMIN_PASSWORD || (!isProd ? generatedPassword() : '');
if (!adminPassword) throw new Error('生产环境必须设置 SEED_ADMIN_PASSWORD，禁止使用固定默认密码');

const url = process.env.COZE_SUPABASE_URL;
const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('缺少 COZE_SUPABASE_URL / COZE_SUPABASE_SERVICE_ROLE_KEY');
const auth = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin;

const db = new pg.Client({ connectionString: await getDbUrl() });
await db.connect();

async function one<T>(text: string, values: unknown[] = []): Promise<T | null> {
  const result = await db.query(text, values); return (result.rows[0] as T | undefined) ?? null;
}
async function ensureUser(email: string, displayName: string, roles: string[], organizationId: string | null, password = generatedPassword()) {
  let profile = await one<{ id: string }>('SELECT id FROM profiles WHERE email=$1', [email]);
  let createdPassword: string | null = null;
  if (!profile) {
    const created = await auth.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
    if (created.error || !created.data.user) throw new Error(`创建 ${email} 失败：${created.error?.message ?? '未知错误'}`);
    profile = { id: created.data.user.id }; createdPassword = password;
  }
  await db.query(`INSERT INTO profiles(id,organization_id,display_name,email,must_change_password,status,created_at,updated_at)
                  VALUES($1,$2,$3,$4,true,'active',NOW(),NOW())
                  ON CONFLICT(id) DO UPDATE SET organization_id=EXCLUDED.organization_id,display_name=EXCLUDED.display_name,
                    email=EXCLUDED.email,status='active',updated_at=NOW()`, [profile.id, organizationId, displayName, email]);
  await db.query('DELETE FROM user_roles WHERE user_id=$1', [profile.id]);
  for (const role of roles) await db.query(`INSERT INTO user_roles(user_id,organization_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [profile.id, organizationId, role]);
  return { id: profile.id, createdPassword };
}

try {
  await db.query('BEGIN');
  const org = await one<{ id: string }>(`INSERT INTO organizations(name,code,status,created_at,updated_at)
    VALUES('示例职业培训学校','DEMO001','active',NOW(),NOW())
    ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,status='active',updated_at=NOW() RETURNING id`);
  if (!org) throw new Error('无法创建示例机构');
  const project = await one<{ id: string }>(`INSERT INTO training_projects(organization_id,name,description,funding_source,status,created_at,updated_at)
    SELECT $1,'人工智能训练师五级培训班（示例）','面向零基础学员的人工智能训练师五级职业技能培训','财政支持示例','active',NOW(),NOW()
    WHERE NOT EXISTS(SELECT 1 FROM training_projects WHERE organization_id=$1 AND name='人工智能训练师五级培训班（示例）')
    RETURNING id`, [org.id]) ?? await one<{ id: string }>(`SELECT id FROM training_projects WHERE organization_id=$1 AND name='人工智能训练师五级培训班（示例）'`, [org.id]);
  if (!project) throw new Error('无法创建示例培训项目');
  const cohort = await one<{ id: string }>(`INSERT INTO cohorts(organization_id,project_id,name,status,created_at,updated_at)
    SELECT $1,$2,'五级示例班','active',NOW(),NOW()
    WHERE NOT EXISTS(SELECT 1 FROM cohorts WHERE organization_id=$1 AND project_id=$2 AND name='五级示例班') RETURNING id`, [org.id, project.id])
    ?? await one<{ id: string }>(`SELECT id FROM cohorts WHERE organization_id=$1 AND project_id=$2 AND name='五级示例班'`, [org.id, project.id]);
  if (!cohort) throw new Error('无法创建示例班级');
  await db.query('COMMIT');

  const credentials: Array<{ email: string; password?: string; name: string; roles: string[]; org: string | null }> = [
    { email: 'admin@exam.local', password: adminPassword, name: '系统管理员', roles: ['super_admin'], org: null },
    { email: 'school@exam.local', name: '学校管理员', roles: ['school_admin'], org: org.id },
    { email: 'teacher01@exam.local', name: '培训教师', roles: ['teacher'], org: org.id },
    { email: 'editor01@exam.local', name: '题库编辑员', roles: ['question_editor'], org: org.id },
    { email: 'reviewer01@exam.local', name: '题库审核员', roles: ['question_reviewer'], org: org.id },
    { email: 'student001@student.exam.local', name: '示例学员', roles: ['student'], org: org.id },
  ];
  const newlyCreated: Array<{ email: string; password: string }> = [];
  for (const account of credentials) {
    const result = await ensureUser(account.email, account.name, account.roles, account.org, account.password ?? generatedPassword());
    if (result.createdPassword) newlyCreated.push({ email: account.email, password: result.createdPassword });
  }
  const teacher = await one<{ id: string }>('SELECT id FROM profiles WHERE email=$1', ['teacher01@exam.local']);
  const student = await one<{ id: string }>('SELECT id FROM profiles WHERE email=$1', ['student001@student.exam.local']);
  if (teacher) await db.query(`INSERT INTO teacher_cohort_grants(teacher_id,cohort_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [teacher.id, cohort.id]);
  if (student) await db.query(`INSERT INTO enrollments(user_id,cohort_id,status,created_at,updated_at) VALUES($1,$2,'active',NOW(),NOW()) ON CONFLICT(user_id,cohort_id) DO UPDATE SET status='active',updated_at=NOW()`, [student.id, cohort.id]);

  console.log(`机构: ${org.id}\n项目: ${project.id}\n班级: ${cohort.id}`);
  if (newlyCreated.length) {
    console.log('\n以下密码仅在首次创建时显示，请立即安全保存，并要求用户首次登录修改：');
    for (const item of newlyCreated) console.log(`${item.email}\t${item.password}`);
  } else console.log('账号均已存在，本次未生成新密码。');
} catch (error) {
  try { await db.query('ROLLBACK'); } catch {}
  throw error;
} finally { await db.end(); }
