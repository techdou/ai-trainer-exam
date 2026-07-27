/**
 * 学员端 E2E 验证 — 2026-07-26 第二轮测试。
 *
 * 覆盖: 练习闭环(做题→错题→解决)、考试入口、越权负向、信息泄露检查。
 * 共享库纪律: 不产生不可逆的业务数据 —— 交卷"写入"路径不测,
 * 只测防重放(已交卷 attempt + 不同内容 → 409)和参数校验(零副作用,事务回滚)。
 * practice/check 产生的练习记录属学员正常业务数据,不清理。
 *
 * 用法: pnpm tsx scripts/db/verify-student.mts  (需要 dev server 运行在 5000 端口)
 */
import { loadEnv } from 'coze-coding-dev-sdk';
import { getAccounts } from './_accounts.mjs';

loadEnv();

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:5000';

const ACCOUNTS: Record<string, { email: string; password: string }> = getAccounts(
  'student',
  'student2',
  'admin',
);

const tokens: Record<string, string> = {};
let passed = 0;
let failed = 0;
let skipped = 0;
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
  role?: string;
  method?: string;
  path: string;
  body?: unknown;
  expect: number;
  noAuth?: boolean;
  check?: (json: Record<string, unknown>) => string | null;
}

async function run(c: Case): Promise<{ json: Record<string, unknown>; status: number }> {
  const headers: Record<string, string> = {};
  if (!c.noAuth) headers.Authorization = `Bearer ${await login(c.role ?? 'student')}`;
  if (c.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${c.path}`, {
    method: c.method || 'GET',
    headers,
    body: c.body ? JSON.stringify(c.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  const tag = `[${c.name}] ${c.role ?? 'student'} ${c.method || 'GET'} ${c.path} -> ${res.status}`;
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

/**
 * 递归检查对象里是否出现答案类字段(信息泄露探针)。
 * strict 模式(考试取卷场景)额外拦截 explanation/knowledgePoint ——
 * 考试进行中解析与知识点会直接揭示答案; 练习场景下发 knowledge_point 属正常设计, 不拦。
 */
function findAnswerField(value: unknown, path = '', strict = false): string | null {
  const CORE = /answer_?key|correct_?answer|correctOption|answerKey|grading_?config/i;
  const STRICT_EXTRA = /explanation|knowledgePoint/;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findAnswerField(value[i], `${path}[${i}]`, strict);
      if (hit) return hit;
    }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (CORE.test(k) || (strict && STRICT_EXTRA.test(k))) return `${path}.${k}`;
      const hit = findAnswerField(v, `${path}.${k}`, strict);
      if (hit) return hit;
    }
  }
  return null;
}

// ============ 1. 基础端点 ============
await run({ name: 'S1-学员首页', path: '/api/student/home', expect: 200, check: hasData });
await run({ name: 'S2-成绩列表', path: '/api/student/results', expect: 200, check: (j) => {
  if (!j.success) return 'success=false';
  const rows = j.data as Array<{ status: string }>;
  if (!Array.isArray(rows)) return 'data 不是数组';
  const bad = rows.find(r => r.status !== 'published');
  return bad ? `成绩列表出现非 published 记录: ${JSON.stringify(bad)}` : null;
}});

// ============ 2. 练习闭环 ============
const questionsRes = await run({
  name: 'S3-练习题列表', path: '/api/student/practice/questions?limit=5', expect: 200, check: (j) => {
    if (!j.success) return 'success=false';
    const rows = j.data as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || !rows.length) return '练习题为空';
    const leak = findAnswerField(rows);
    return leak ? `练习题响应泄露答案字段: ${leak}` : null;
  },
});
const questions = (questionsRes.json.data ?? []) as Array<{ id: string; question_type: string; options?: Record<string, string> }>;

if (questions.length) {
  const q = questions.find(x => x.question_type === 'single_choice') ?? questions[0];
  // 故意答错: 单选传一个不存在的选项;判断题布尔取反无法预知,统一用明显错误值
  const wrongAnswer = q.question_type === 'true_false' ? 'not_a_bool' : 'ZZ';
  const wrongRes = await run({
    name: 'S4-练习答错', method: 'POST', path: '/api/student/practice/check',
    body: { questionId: q.id, answer: wrongAnswer }, expect: 200, check: (j) => {
      if (!j.success) return `success=false ${JSON.stringify(j).slice(0, 150)}`;
      const d = j.data as { correct: boolean; correctAnswer?: string };
      if (d.correct !== false) return '明显错误答案被判对,评分器有问题';
      if (d.correctAnswer === undefined) return '答错后未返回正确答案';
      return null;
    },
  });
  const correctAnswer = (wrongRes.json.data as { correctAnswer?: string })?.correctAnswer;

  await run({ name: 'S5-错题本含该题', path: '/api/student/practice/wrong', expect: 200, check: (j) => {
    if (!j.success) return 'success=false';
    const text = JSON.stringify(j.data);
    return text.includes(q.id) ? null : '错题本里找不到刚答错的题';
  }});

  if (correctAnswer !== undefined) {
    await run({
      name: 'S6-练习答对', method: 'POST', path: '/api/student/practice/check',
      body: { questionId: q.id, answer: correctAnswer }, expect: 200, check: (j) => {
        if (!j.success) return 'success=false';
        const d = j.data as { correct: boolean };
        return d.correct === true ? null : '用返回的正确答案作答竟判错';
      },
    });
    await run({ name: 'S7-错题已解决', path: '/api/student/practice/wrong', expect: 200, check: (j) => {
      if (!j.success) return 'success=false';
      const payload = j.data as { items?: Array<{ item_id: string; resolved: boolean }> };
      const item = payload.items?.find(r => r.item_id === q.id);
      if (!item) return '错题本里找不到该题(答对后不应消失,应标记 resolved)';
      return item.resolved === false ? '答对后错题仍未标记解决' : null;
    }});
  }
} else {
  skipped += 4;
  console.log('SKIP S4-S7: 无练习题可用');
}

await run({ name: 'S8-实操任务列表', path: '/api/student/practice/task', expect: 200, check: hasData });

// ============ 3. 考试入口 ============
const examsRes = await run({ name: 'S9-考试列表', path: '/api/student/exams', expect: 200, check: hasData });
const exams = (examsRes.json.data ?? []) as Array<{
  id: string; title: string; timeStatus: string; canEnter: boolean;
  attempt: { id: string; status: string } | null;
}>;
console.log(`     (考试列表: ${exams.map(e => `${e.title}[${e.timeStatus}/${e.attempt?.status ?? '无记录'}]`).join(', ') || '空'})`);

// 已交卷的 attempt: 防重放测试(零副作用)
const graded = exams.find(e => e.attempt && ['graded', 'submitted', 'released'].includes(e.attempt.status));
if (graded?.attempt) {
  await run({
    name: 'S10-已交卷重复start', method: 'POST', path: '/api/student/exams/start',
    body: { scheduleId: graded.id }, expect: 409,
  });
  await run({
    name: 'S11-已交卷防刷分', method: 'POST', path: '/api/student/exams/submit',
    body: { scheduleId: graded.id, attemptId: graded.attempt.id, responses: [{ itemId: '00000000-0000-0000-0000-000000000000', response: { hack: true } }] },
    expect: 409, // 已提交状态,应在“重复交卷”处拦截(409),而不是走到题目校验
  });
} else {
  skipped += 2;
  console.log('SKIP S10-S11: 无已交卷的考试记录');
}

// 进行中或可进入的考试: start 幂等 + 取题泄露检查(不交卷)
const openExam = exams.find(e => e.attempt?.status === 'in_progress') ?? exams.find(e => e.canEnter && !e.attempt);
if (openExam) {
  const startRes = await run({
    name: 'S12-开始/恢复考试', method: 'POST', path: '/api/student/exams/start',
    body: { scheduleId: openExam.id }, expect: 200, check: (j) => {
      const d = j.data as { attemptId?: string } | undefined;
      return d?.attemptId ? null : '未返回 attemptId';
    },
  });
  const attemptId = (startRes.json.data as { attemptId?: string })?.attemptId;
  if (attemptId) {
    await run({
      name: 'S13-取卷不泄露答案', path: `/api/student/exams/questions?scheduleId=${openExam.id}`, expect: 200, check: (j) => {
        if (!j.success) return 'success=false';
        const d = j.data as { items?: Array<Record<string, unknown>> };
        if (!d?.items?.length) return '试卷 items 为空';
        const leak = findAnswerField(d.items, '', true);
        return leak ? `试卷内容泄露答案字段: ${leak}` : null;
      },
    });
    await run({
      name: 'S14-start幂等恢复', method: 'POST', path: '/api/student/exams/start',
      body: { scheduleId: openExam.id }, expect: 200, check: (j) => {
        const d = j.data as { attemptId?: string; resumed?: boolean } | undefined;
        if (d?.attemptId !== attemptId) return '重复 start 返回了不同的 attemptId(可能刷出了新记录)';
        return d.resumed === true ? null : '重复 start 未标记 resumed';
      },
    });
  }
} else {
  skipped += 3;
  console.log('SKIP S12-S14: 当前无可进入的考试(交卷写入路径不测,避免污染成绩库)');
}

// ============ 4. 越权与参数负向 ============
await run({ name: 'N1-未认证', path: '/api/student/home', expect: 401, noAuth: true });
await run({ name: 'N2-学员访教师端', path: '/api/teacher/dashboard', expect: 403 });
await run({ name: 'N3-取卷缺参数', path: '/api/student/exams/questions', expect: 400 });
await run({
  name: 'N4-伪造他人attempt', method: 'POST', path: '/api/student/exams/submit',
  body: { scheduleId: '00000000-0000-0000-0000-000000000000', attemptId: '00000000-0000-0000-0000-000000000000', responses: [] },
  expect: 404,
});
await run({
  name: 'N5-练习不存在题', method: 'POST', path: '/api/student/practice/check',
  body: { questionId: '00000000-0000-0000-0000-000000000000', answer: 'A' }, expect: 404,
});

// 用一道考试题库(exam)的题去刷练习接口 —— 应 404,防止借练习接口提前刷出考试答案
const examQ = await run({
  name: 'N6前置-查一道考试题', role: 'admin', path: '/api/admin/questions?bank_type=exam&limit=1', expect: 200, check: hasData,
});
const examQRows = (examQ.json.data as { items?: Array<{ id: string }> } | Array<{ id: string }>) ?? [];
const examQId = Array.isArray(examQRows) ? examQRows[0]?.id : examQRows.items?.[0]?.id;
if (examQId) {
  await run({
    name: 'N6-考试题刷练习接口', method: 'POST', path: '/api/student/practice/check',
    body: { questionId: examQId, answer: 'A' }, expect: 404,
  });
} else {
  skipped++;
  console.log('SKIP N6: 题库无考试题');
}

// stu002 的考试安排对 stu001 不可见: 拿 stu002 的 scheduleId 替 stu001 start(若两人同班则跳过)
const e2 = await run({ name: 'N7前置-stu002考试列表', role: 'student2', path: '/api/student/exams', expect: 200, check: hasData });
const exams2 = (e2.json.data ?? []) as Array<{ id: string }>;
const onlyIn2 = exams2.find(x => !exams.some(y => y.id === x.id));
if (onlyIn2) {
  await run({
    name: 'N7-跨学员开考', method: 'POST', path: '/api/student/exams/start',
    body: { scheduleId: onlyIn2.id }, expect: 404,
  });
} else {
  skipped++;
  console.log('SKIP N7: 两名学员考试安排一致(同班),无法构造跨学员场景');
}

console.log(`\n===== 学员端验证结果: ${passed} 通过 / ${failed} 失败 / ${skipped} 跳过 =====`);
if (failures.length) {
  console.log('\n失败明细:');
  failures.forEach(f => console.log(` - ${f}`));
  process.exit(1);
}
