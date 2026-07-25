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

// ============ 汇总 ============
console.log(`\n===== 验证矩阵结果: ${passed} 通过 / ${failed} 失败 =====`);
if (failures.length) {
  console.log('失败明细:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
