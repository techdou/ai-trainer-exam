/**
 * API 回归验证矩阵 — 针对 2026-07-25 全面审核修复的接口逐一实测。
 *
 * 覆盖: 修复前 500/403/400 的端点 + 关键负向用例(越权/职责分离)。
 * 写操作仅一条: editor 建题 → reviewer 审核通过 → editor 下架, 结束后题目为 retired 状态。
 *
 * 用法: pnpm tsx scripts/db/verify-api.mts  (需要 dev server 运行在 5000 端口)
 */
import { loadEnv } from 'coze-coding-dev-sdk';

loadEnv();

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:5000';

const ACCOUNTS: Record<string, { email: string; password: string }> = {
  admin: { email: 'admin@exam.local', password: 'SEEDED' },
  school: { email: 'school@exam.local', password: 'SEEDED' },
  teacher: { email: 'teacher01@exam.local', password: 'SEEDED' },
  editor: { email: 'editor01@exam.local', password: 'SEEDED' },
  reviewer: { email: 'reviewer01@exam.local', password: 'SEEDED' },
  invigilator: { email: 'invig01@exam.local', password: 'Invig@2026' },
  auditor: { email: 'auditor01@exam.local', password: 'Audit@2026' },
  student: { email: 'stu001@student.exam.local', password: 'SEEDED' },
};

const tokens: Record<string, string> = {};
let passed = 0;
let failed = 0;
const failures: string[] = [];

async function login(role: string): Promise<string> {
  if (tokens[role]) return tokens[role];
  const acc = ACCOUNTS[role];
  const res = await fetch(`${BASE}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: acc.email, password: acc.password }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`登录失败 ${role}: ${JSON.stringify(json)}`);
  tokens[role] = json.data.accessToken;
  return tokens[role];
}

interface Case {
  name: string;
  role: string;
  method?: string;
  path: string;
  body?: unknown;
  expect: number;
  check?: (json: Record<string, unknown>) => string | null;
}

async function run(c: Case): Promise<{ json: Record<string, unknown>; status: number }> {
  const token = await login(c.role);
  const res = await fetch(`${BASE}${c.path}`, {
    method: c.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(c.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: c.body ? JSON.stringify(c.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  const tag = `[${c.name}] ${c.role} ${c.method || 'GET'} ${c.path} -> ${res.status}`;
  if (res.status !== c.expect) {
    failed++;
    failures.push(`${tag} (期望 ${c.expect}) ${JSON.stringify(json).slice(0, 200)}`);
    console.log(`FAIL ${tag} (期望 ${c.expect})`);
  } else if (c.check) {
    const err = c.check(json as Record<string, unknown>);
    if (err) {
      failed++;
      failures.push(`${tag} 内容校验: ${err}`);
      console.log(`FAIL ${tag} 内容校验: ${err}`);
    } else {
      passed++;
      console.log(`OK   ${tag}`);
    }
  } else {
    passed++;
    console.log(`OK   ${tag}`);
  }
  return { json: json as Record<string, unknown>, status: res.status };
}

const hasData = (json: Record<string, unknown>) => (json.success ? null : `success=false: ${JSON.stringify(json).slice(0, 150)}`);

// ============ 1. 修复前 500 的端点 ============
await run({ name: 'C1-用户列表', role: 'admin', path: '/api/admin/users', expect: 200, check: hasData });
await run({ name: 'H1-统计', role: 'admin', path: '/api/admin/stats', expect: 200, check: hasData });
await run({ name: 'C1-成绩列表', role: 'admin', path: '/api/admin/results', expect: 200, check: (j) => {
  if (!j.success) return 'success=false';
  const items = (j.data as { items?: { userEmail?: string }[] }).items;
  if (!items || items.length === 0) return null; // 无成绩也算通过
  return items[0].userEmail !== undefined ? null : '缺 userEmail 字段';
} });
await run({ name: 'C1-媒体资产', role: 'editor', path: '/api/admin/media/assets', expect: 200, check: hasData });
await run({ name: '审计日志-审计员', role: 'auditor', path: '/api/admin/audit-logs', expect: 200, check: hasData });
await run({ name: '报表-学校管理员', role: 'school', path: '/api/admin/reports/overview', expect: 200, check: (j) => {
  if (!j.success) return 'success=false';
  const d = j.data as { passRate?: { rate?: number } };
  if (d?.passRate?.rate !== undefined && (d.passRate.rate < 0 || d.passRate.rate > 100)) return `通过率越界: ${d.passRate.rate}`;
  return null;
} });
await run({ name: '报表-审计员', role: 'auditor', path: '/api/admin/reports/overview', expect: 200, check: hasData });
await run({ name: '教师仪表盘', role: 'teacher', path: '/api/teacher/dashboard', expect: 200, check: hasData });
await run({ name: '教师错题分析', role: 'teacher', path: '/api/teacher/error-analysis', expect: 200, check: hasData });
await run({ name: '系统设置', role: 'admin', path: '/api/admin/settings', expect: 200, check: (j) => {
  if (!j.success) return 'success=false';
  const items = (j.data as { settings?: { key: string; value: string }[] }).settings;
  if (!items?.length) return '设置项为空';
  const grace = items.find(i => i.key === 'exam_submit_grace_seconds');
  return grace ? null : '缺 exam_submit_grace_seconds';
} });
await run({ name: '考试安排-监考员', role: 'invigilator', path: '/api/admin/exam-schedules', expect: 200, check: (j) => {
  if (!j.success) return 'success=false';
  const items = j.data as { submittedCount?: number }[];
  if (Array.isArray(items) && items.length > 0) return items[0].submittedCount !== undefined ? null : '缺 submittedCount';
  return null;
} });

// ============ 2. 负向用例(越权拦截) ============
await run({ name: '学员访问用户管理', role: 'student', path: '/api/admin/users', expect: 403 });
await run({ name: '学员访问审计日志', role: 'student', path: '/api/admin/audit-logs', expect: 403 });
await run({ name: '教师访问系统设置', role: 'teacher', path: '/api/admin/settings', expect: 403 });
await run({ name: '编辑访问审计日志', role: 'editor', path: '/api/admin/audit-logs', expect: 403 });

// ============ 3. 题库全流程(建题→审核→SoD→下架) ============
const create = await run({
  name: '编辑建题', role: 'editor', method: 'POST', path: '/api/admin/questions', expect: 201,
  body: {
    bankType: 'practice', questionType: 'true_false',
    stem: '【回归验证】人工智能训练师需要理解数据标注规范。(验证后可下架)',
    answerKey: true, difficulty: 1, knowledgePoint: '回归验证',
  },
});
const questionId = create.json.success ? (create.json.data as { id: string }).id : null;

if (questionId) {
  // 职责分离: 编辑不能审核自己建的题
  await run({
    name: 'SoD-编辑审自己', role: 'editor', method: 'PATCH', path: `/api/admin/questions/${questionId}`,
    body: { action: 'approve', bankType: 'practice' }, expect: 403,
  });
  // 审核员通过
  await run({
    name: '审核员通过', role: 'reviewer', method: 'PATCH', path: `/api/admin/questions/${questionId}`,
    body: { action: 'approve', bankType: 'practice', note: '回归验证通过' }, expect: 200,
  });
  // 状态过滤: imported_unreviewed 参数真实生效
  await run({
    name: '状态过滤', role: 'reviewer', path: '/api/admin/questions?bank_type=practice&review_status=imported_unreviewed&limit=5',
    expect: 200, check: (j) => {
      if (!j.success) return 'success=false';
      const items = (j.data as { items?: { reviewStatus?: string; review_status?: string }[] }).items;
      if (!items) return null;
      const bad = items.find(i => (i.reviewStatus ?? i.review_status) !== 'imported_unreviewed');
      return bad ? '过滤后混入了其他状态的题目' : null;
    },
  });
  // 下架清理
  await run({
    name: '下架清理', role: 'editor', method: 'PATCH', path: `/api/admin/questions/${questionId}`,
    body: { action: 'retire', bankType: 'practice' }, expect: 200,
  });
} else {
  console.log('SKIP 建题失败, 跳过审核链路用例');
}

// ============ 4. 成绩复核状态机 ============
// 先从成绩列表拿一个真实 scoreId, 再查复核详情(必须含 answerKey 快照, 修复前复核页看不到标准答案)。
const resultsRes = await run({ name: '成绩列表取scoreId', role: 'admin', path: '/api/admin/results', expect: 200, check: hasData });
const firstScoreId = resultsRes.json.success
  ? ((resultsRes.json.data as { items?: { id: string }[] }).items?.[0]?.id ?? null)
  : null;
if (firstScoreId) {
  await run({
    name: '复核详情含答题快照', role: 'admin', path: `/api/admin/scores/review?scoreId=${firstScoreId}`, expect: 200, check: (j) => {
      if (!j.success) return 'success=false';
      const responses = (j.data as { responses?: { answerKey?: unknown }[] }).responses;
      if (!responses || responses.length === 0) return null; // 无作答记录不强制
      return 'answerKey' in responses[0] ? null : 'responses 缺 answerKey 字段';
    },
  });
} else {
  console.log('SKIP 无成绩记录, 跳过复核详情用例');
}

// ============ 5. 用户管理写操作(建号→登录→改角色→重置→停用→启用→清理) ============
const testEmail = `verify-${Date.now()}@exam.local`;
// 越权: 学员不能建号
await run({
  name: '学员建号-拒绝', role: 'student', method: 'POST', path: '/api/admin/users',
  body: { email: testEmail, displayName: '回归验证', roles: ['student'] }, expect: 403,
});
// 越权: school_admin 不能分配 school_admin 角色(防提权)
await run({
  name: 'school建同级-拒绝', role: 'school', method: 'POST', path: '/api/admin/users',
  body: { email: testEmail, displayName: '回归验证', roles: ['school_admin'] }, expect: 403,
});
// 正常建号
const created = await run({
  name: 'school建学员', role: 'school', method: 'POST', path: '/api/admin/users',
  body: { email: testEmail, displayName: '回归验证账号', roles: ['student'] }, expect: 201, check: (j) => {
    if (!j.success) return 'success=false';
    const d = j.data as { userId?: string; initialPassword?: string };
    return d.userId && d.initialPassword ? null : '响应缺 userId/initialPassword';
  },
});
const newUserId = created.json.success ? (created.json.data as { userId: string }).userId : null;
const initialPw = created.json.success ? (created.json.data as { initialPassword: string }).initialPassword : null;

if (newUserId && initialPw) {
  // 初始密码能登录(证明 Auth 侧账号真实创建)
  const loginRes = await fetch(`${BASE}/api/auth/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: initialPw }),
  });
  const loginJson = await loginRes.json();
  if (loginRes.status === 200 && loginJson.success) { passed++; console.log('OK   [新号初始密码登录]'); }
  else { failed++; failures.push(`[新号初始密码登录] -> ${loginRes.status} ${JSON.stringify(loginJson).slice(0, 150)}`); console.log('FAIL [新号初始密码登录]'); }

  // 改角色
  await run({
    name: '改角色', role: 'school', method: 'PATCH', path: `/api/admin/users/${newUserId}`,
    body: { action: 'set_roles', roles: ['student', 'invigilator'] }, expect: 200,
  });
  // 越权: 改成超纲角色被拒
  await run({
    name: '改角色超纲-拒绝', role: 'school', method: 'PATCH', path: `/api/admin/users/${newUserId}`,
    body: { action: 'set_roles', roles: ['auditor'] }, expect: 403,
  });
  // 重置密码
  await run({
    name: '重置密码', role: 'school', method: 'PATCH', path: `/api/admin/users/${newUserId}`,
    body: { action: 'reset_password' }, expect: 200, check: (j) =>
      (j.data as { newPassword?: string })?.newPassword ? null : '响应缺 newPassword',
  });
  // 停用/启用
  await run({ name: '停用', role: 'school', method: 'PATCH', path: `/api/admin/users/${newUserId}`, body: { action: 'deactivate' }, expect: 200 });
  await run({ name: '启用', role: 'school', method: 'PATCH', path: `/api/admin/users/${newUserId}`, body: { action: 'activate' }, expect: 200 });
  // 用户列表带 status 字段
  await run({
    name: '列表含status', role: 'school', path: '/api/admin/users?limit=5', expect: 200, check: (j) => {
      const items = (j.data as { items?: { status?: string }[] })?.items;
      if (!items?.length) return '列表为空';
      return items[0].status !== undefined ? null : '缺 status 字段';
    },
  });
} else {
  console.log('SKIP 建号失败, 跳过用户管理链路用例');
}

// 自己不能停用自己
const schoolSession = await fetch(`${BASE}/api/auth/session`, { headers: { Authorization: `Bearer ${await login('school')}` } }).then(r => r.json());
const schoolId = schoolSession?.data?.user?.id ?? schoolSession?.data?.id;
if (schoolId) {
  await run({
    name: '停用自己-拒绝', role: 'school', method: 'PATCH', path: `/api/admin/users/${schoolId}`,
    body: { action: 'deactivate' }, expect: 409,
  });
}

// ============ 6. 教师 progress 新口径 ============
await run({
  name: 'progress含考试得分率', role: 'teacher', path: '/api/teacher/progress', expect: 200, check: (j) => {
    if (!j.success) return 'success=false';
    const items = (j.data as { items?: { practiceScoreRate?: unknown; examScoreRate?: unknown }[] })?.items;
    if (!items?.length) return null;
    const first = items[0];
    return ('practiceScoreRate' in first && 'examScoreRate' in first) ? null : '缺 practiceScoreRate/examScoreRate 字段';
  },
});

// ============ 7. 报表导出 ============
for (const [type, format, mime] of [
  ['scores', 'csv', 'text/csv'],
  ['scores', 'xlsx', 'spreadsheetml'],
  ['progress', 'csv', 'text/csv'],
  ['progress', 'xlsx', 'spreadsheetml'],
] as const) {
  const token = await login('school');
  const res = await fetch(`${BASE}/api/admin/reports/export?type=${type}&format=${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ct = res.headers.get('Content-Type') ?? '';
  const tag = `[导出${type}.${format}] -> ${res.status} ${ct.split(';')[0]}`;
  if (res.status === 200 && ct.includes(mime)) { passed++; console.log(`OK   ${tag}`); }
  else { failed++; failures.push(`${tag} 期望 200 + ${mime}`); console.log(`FAIL ${tag}`); }
}
await run({ name: '教师导出-拒绝', role: 'teacher', path: '/api/admin/reports/export?type=scores&format=csv', expect: 403 });
await run({ name: '导出参数错误', role: 'school', path: '/api/admin/reports/export?type=bogus&format=csv', expect: 400 });

// ============ 8. 清理共享库测试数据 ============
if (newUserId) {
  try {
    const { readFileSync } = await import('node:fs');
    for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    const { createClient } = await import('@supabase/supabase-js');
    const pg = (await import('pg')).default;
    const admin = createClient(process.env.COZE_SUPABASE_URL!, process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).auth.admin;
    await admin.deleteUser(newUserId);
    const db = new pg.Client({ connectionString: process.env.PGDATABASE_URL });
    await db.connect();
    await db.query('DELETE FROM user_roles WHERE user_id = $1', [newUserId]);
    await db.query('DELETE FROM profiles WHERE id = $1', [newUserId]);
    await db.end();
    console.log(`OK   [清理] 测试账号 ${testEmail} 已从 Auth+DB 删除`);
  } catch (e) {
    console.log(`WARN [清理] 测试账号删除失败, 需手工清理 ${newUserId}: ${(e as Error).message}`);
  }
}

// ============ 汇总 ============
console.log(`\n===== 验证矩阵结果: ${passed} 通过 / ${failed} 失败 =====`);
if (failures.length) {
  console.log('失败明细:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
