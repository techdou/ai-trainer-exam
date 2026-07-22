/**
 * 核心种子数据：机构、项目、班级、初始账号。
 * 幂等：可重复运行。
 * 用法：npx tsx scripts/db/seed-core.mts
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.cwd());

async function loadModule<T>(rel: string): Promise<T> {
  return (await import(pathToFileURL(path.join(root, rel)).href)) as T;
}

const { dbQuery, dbOne } = await loadModule<typeof import("../../src/server/db")>('src/server/db.ts');
const { createUserWithRoles, setUserRoles } = await loadModule<typeof import('@/server/users')>('src/server/users.ts');

async function main() {
  console.log('== seed core ==');

  // 1. 机构
  let org = await dbOne<{ id: string }>(`SELECT id FROM organizations WHERE name = '示例职业培训学校' LIMIT 1`);
  if (!org) {
    const res = await dbQuery<{ id: string }>(
      `INSERT INTO organizations (name, code) VALUES ('示例职业培训学校', 'DEMO001') RETURNING id`,
    );
    org = res.rows[0];
    console.log('created org', org.id);
  } else {
    console.log('org exists', org.id);
  }
  const orgId = org.id;

  // 2. 培训项目
  let project = await dbOne<{ id: string }>(
    `SELECT id FROM training_projects WHERE organization_id = $1 AND name LIKE '人工智能训练师五级%' LIMIT 1`,
    [orgId],
  );
  if (!project) {
    const res = await dbQuery<{ id: string }>(
      `INSERT INTO training_projects (organization_id, name, description) VALUES ($1, '人工智能训练师五级培训班（2026 第一期）', '面向零基础学员的人工智能训练师五级职业技能培训') RETURNING id`,
      [orgId],
    );
    project = res.rows[0];
    console.log('created project', project.id);
  } else {
    console.log('project exists', project.id);
  }

  // 3. 班级
  let cohort = await dbOne<{ id: string }>(
    `SELECT id FROM cohorts WHERE project_id = $1 AND name = '五级一班' LIMIT 1`,
    [project.id],
  );
  if (!cohort) {
    const res = await dbQuery<{ id: string }>(
      `INSERT INTO cohorts (project_id, organization_id, name) VALUES ($1, $2, '五级一班') RETURNING id`,
      [project.id, orgId],
    );
    cohort = res.rows[0];
    console.log('created cohort', cohort.id);
  } else {
    console.log('cohort exists', cohort.id);
  }

  // 4. 初始账号
  type RoleName = import('@/lib/constants').Role;
  const accounts: Array<{ email: string; password: string; name: string; roles: RoleName[] }> = [
    { email: 'admin@exam.local', password: 'SEEDED', name: '系统管理员', roles: ['super_admin'] },
    { email: 'school@exam.local', password: 'SEEDED', name: '学校管理员', roles: ['school_admin'] },
    { email: 'teacher01@exam.local', password: 'SEEDED', name: '王老师', roles: ['teacher'] },
    { email: 'editor01@exam.local', password: 'SEEDED', name: '题库编辑员', roles: ['question_editor'] },
    { email: 'reviewer01@exam.local', password: 'SEEDED', name: '题库审核员', roles: ['question_reviewer'] },
    { email: 'stu001@student.exam.local', password: 'SEEDED', name: '学员小明', roles: ['student'] },
    { email: 'stu002@student.exam.local', password: 'SEEDED', name: '学员小红', roles: ['student'] },
  ];

  for (const acc of accounts) {
    const existing = await dbOne<{ id: string }>('SELECT id FROM profiles WHERE email = $1', [acc.email]);
    if (existing) {
      await setUserRoles(existing.id, [...acc.roles], acc.roles.includes('super_admin') ? null : orgId);
      console.log('account exists, roles synced:', acc.email);
      continue;
    }
    const { userId } = await createUserWithRoles({
      email: acc.email,
      password: acc.password,
      displayName: acc.name,
      roles: [...acc.roles],
      organizationId: acc.roles.includes('super_admin') ? null : orgId,
    });
    console.log('created account:', acc.email, userId);
  }

  // 5. 学员编入班级
  const stu1 = await dbOne<{ id: string }>(`SELECT id FROM profiles WHERE email = 'stu001@student.exam.local'`);
  const stu2 = await dbOne<{ id: string }>(`SELECT id FROM profiles WHERE email = 'stu002@student.exam.local'`);
  const teacher = await dbOne<{ id: string }>(`SELECT id FROM profiles WHERE email = 'teacher01@exam.local'`);
  for (const s of [stu1, stu2]) {
    if (s) {
      await dbQuery(
        'INSERT INTO enrollments (user_id, cohort_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [s.id, cohort.id],
      );
    }
  }
  if (teacher) {
    await dbQuery(
      `INSERT INTO teacher_cohort_grants (teacher_id, cohort_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [teacher.id, cohort.id],
    );
  }

  // 6. 默认评分引擎版本记录
  const graders = await loadModule<typeof import('@/lib/constants')>('src/lib/constants.ts');
  const admin = await dbOne<{ id: string }>(`SELECT id FROM profiles WHERE email = 'admin@exam.local'`);
  const existingGev = await dbOne<{ id: string }>('SELECT id FROM grading_engine_versions LIMIT 1');
  if (!existingGev && admin) {
    const versions = graders.GRADER_VERSIONS as Record<string, string>;
    for (const [graderName, version] of Object.entries(versions)) {
      await dbQuery(
        `INSERT INTO grading_engine_versions (grader_name, version) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [graderName, version],
      );
    }
    console.log('created grading engine versions:', Object.keys(versions).length);
  }

  console.log('== seed core done ==');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
