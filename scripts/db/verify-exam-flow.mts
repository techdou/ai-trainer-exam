/**
 * 交卷写入路径 E2E 实测 — 2026-07-26 第三轮。
 *
 * 之前两轮刻意不碰交卷写入(怕污染真实成绩库)。本轮在共享库上造一个**隔离闭环**:
 * 临时班级(只挂 stu001, stu002 不受影响) + 临时试卷 + 临时考试,
 * 完整实测 start → 取卷(泄露探针) → 交卷(评分写入) → 幂等重放 → DB 层核验,
 * 结束后按外键顺序硬删全部测试数据(外键均 NO ACTION, 无级联)。
 *
 * 保留的痕迹: audit_logs 中的操作记录(正常审计, 刻意保留)。
 *
 * 用法: pnpm tsx scripts/db/verify-exam-flow.mts  (需要 dev server 运行在 5000 端口)
 */
import { loadEnv } from 'coze-coding-dev-sdk';
import { readFileSync } from 'node:fs';

loadEnv();

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:5000';
const STUDENT = { email: 'stu001@student.exam.local', password: 'SEEDED' };
const ADMIN = { email: 'admin@exam.local', password: 'SEEDED' };
const TAG = `【交卷实测${Date.now() % 100000}】`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function login(acc: { email: string; password: string }): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(acc),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`登录失败 ${acc.email}: ${JSON.stringify(json)}`);
  return json.data.accessToken;
}

async function api(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as Record<string, unknown> };
}

function check(name: string, cond: boolean, detail: string) {
  if (cond) { passed++; console.log(`OK   ${name}`); }
  else { failed++; failures.push(`${name}: ${detail}`); console.log(`FAIL ${name}: ${detail}`); }
}

/** 与 verify-student.mts 同款的泄露探针(strict 模式拦 explanation/knowledgePoint) */
function findAnswerField(value: unknown, path = ''): string | null {
  const CORE = /answer_?key|correct_?answer|correctOption|answerKey|grading_?config/i;
  const STRICT_EXTRA = /explanation|knowledgePoint/;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { const hit = findAnswerField(value[i], `${path}[${i}]`); if (hit) return hit; }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (CORE.test(k) || STRICT_EXTRA.test(k)) return `${path}.${k}`;
      const hit = findAnswerField(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

// .env.local 手动注入(loadEnv 只读 .env, pg/服务密钥在 .env.local)
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const pg = (await import('pg')).default;
const db = new pg.Client({ connectionString: process.env.PGDATABASE_URL });
await db.connect();

// 测试数据句柄(清理用)
let cohortId: string | null = null;
let paperId: string | null = null;
let scheduleId: string | null = null;
let attemptId: string | null = null;

try {
  // ============ 0. 数据摸底 ============
  const stu = (await db.query<{ id: string; organization_id: string }>(
    `SELECT id, organization_id FROM profiles WHERE email = $1`, [STUDENT.email])).rows[0];
  if (!stu) throw new Error('找不到 stu001');
  const orgId = stu.organization_id;

  const questions = (await db.query<{ id: string; answer_key: unknown }>(
    `SELECT id, answer_key FROM exam_question_items
      WHERE organization_id = $1 AND review_status = 'published'
        AND eligible_for_formal_exam = true AND practice_only = false
        AND deleted_at IS NULL AND question_type = 'single_choice'
      ORDER BY created_at ASC LIMIT 2`, [orgId])).rows;
  if (questions.length < 2) throw new Error(`本机构合格考试题不足 2 道(仅 ${questions.length})`);

  // 实操题: 取一道情感标注(最容易程序化构造作答), 验证"实操进考试"链路
  const task = (await db.query<{ id: string; answer_key: { correctSentiments: Record<string, string> } }>(
    `SELECT id, answer_key FROM exam_task_templates
      WHERE organization_id = $1 AND task_type = 'text_sentiment' AND review_status = 'published'
        AND eligible_for_formal_exam = true AND practice_only = false AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1`, [orgId])).rows[0];
  if (!task) throw new Error('考试库没有可用的 text_sentiment 实操题(请先跑 seed-tasks.mts)');

  // answer_key 可能是 {letter:'A'} 或裸字符串/json 字符串
  const correctOption = (ak: unknown): string => {
    let v = ak;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* 裸字符串 */ } }
    const letter = (v as { letter?: unknown })?.letter ?? v;
    return String(letter).trim().toUpperCase();
  };
  const right1 = correctOption(questions[0].answer_key);
  const wrong2 = correctOption(questions[1].answer_key) === 'A' ? 'B' : 'A';
  console.log(`     (用题: ${questions[0].id.slice(0, 8)}…=${right1}, ${questions[1].id.slice(0, 8)}… 答错填 ${wrong2})`);

  const adminToken = await login(ADMIN);
  const stuToken = await login(STUDENT);

  // ============ 1. 搭建隔离环境 ============
  const cohortRes = await api(adminToken, 'POST', '/api/admin/cohorts', { name: `${TAG}班`, organizationId: orgId });
  check('F1-建测试班级', cohortRes.status === 201, `status=${cohortRes.status} ${JSON.stringify(cohortRes.json).slice(0, 150)}`);
  cohortId = (cohortRes.json.data as { id: string })?.id;
  if (!cohortId) throw new Error('建班级失败, 中止');

  await db.query(`INSERT INTO enrollments (user_id, cohort_id, status) VALUES ($1, $2, 'active')`, [stu.id, cohortId]);
  console.log('OK   F2-stu001 挂入测试班级(pg 直插)');

  const paperRes = await api(adminToken, 'POST', '/api/admin/papers', {
    title: `${TAG}卷`, organizationId: orgId, paperKind: 'formal',
    durationMinutes: 30, totalScore: 100, passScore: 60,
    items: [
      ...questions.map(q => ({ itemType: 'question', itemId: q.id })),
      { itemType: 'task', itemId: task.id },
    ],
  });
  check('F3-建试卷(2理论+1实操)', paperRes.status === 200 || paperRes.status === 201, `status=${paperRes.status} ${JSON.stringify(paperRes.json).slice(0, 150)}`);
  paperId = (paperRes.json.data as { id: string })?.id;
  if (!paperId) throw new Error('建试卷失败, 中止');

  const pubPaper = await api(adminToken, 'PATCH', '/api/admin/papers', { paperId, action: 'publish' });
  check('F4-发布试卷', pubPaper.status === 200, `status=${pubPaper.status} ${JSON.stringify(pubPaper.json).slice(0, 120)}`);

  const now = Date.now();
  const schedRes = await api(adminToken, 'POST', '/api/admin/exam-schedules', {
    title: `${TAG}试`, cohortId, paperId,
    examStartAt: new Date(now - 5 * 60_000).toISOString(),
    examEndAt: new Date(now + 2 * 3600_000).toISOString(),
  });
  check('F5-建考试安排', schedRes.status === 200 || schedRes.status === 201, `status=${schedRes.status} ${JSON.stringify(schedRes.json).slice(0, 150)}`);
  scheduleId = (schedRes.json.data as { id: string })?.id;
  if (!scheduleId) throw new Error('建考试失败, 中止');

  const pubSched = await api(adminToken, 'PATCH', '/api/admin/exam-schedules', { scheduleId, status: 'published' });
  check('F6-发布考试', pubSched.status === 200, `status=${pubSched.status} ${JSON.stringify(pubSched.json).slice(0, 120)}`);

  // ============ 2. 学员考试流程 ============
  const listRes = await api(stuToken, 'GET', '/api/student/exams');
  const mine = ((listRes.json.data ?? []) as Array<{ id: string; timeStatus: string; canEnter: boolean }>).find(e => e.id === scheduleId);
  check('F7-学员看到考试且可进入', !!mine && mine.canEnter, `列表=${JSON.stringify(mine ?? '未出现')}`);

  const startRes = await api(stuToken, 'POST', '/api/student/exams/start', { scheduleId });
  attemptId = (startRes.json.data as { attemptId?: string })?.attemptId ?? null;
  check('F8-开始考试', startRes.status === 200 && !!attemptId, `status=${startRes.status} ${JSON.stringify(startRes.json).slice(0, 150)}`);
  if (!attemptId) throw new Error('开考失败, 中止');

  const qRes = await api(stuToken, 'GET', `/api/student/exams/questions?scheduleId=${scheduleId}`);
  const items = (qRes.json.data as { items?: Array<{ id: string; sourceItemId: string; itemType: string }> })?.items ?? [];
  check('F9-取卷3题', qRes.status === 200 && items.length === 3, `status=${qRes.status} items=${items.length}`);
  const leak = findAnswerField(items);
  check('F10-取卷无答案/解析泄露', leak === null, `泄露字段: ${leak}`);

  // 构造作答: 理论题1答对、理论题2答错、实操题(情感标注)全对
  const findPaperItem = (sourceItemId: string) => items.find(i => i.sourceItemId === sourceItemId)?.id;
  const responses = [
    { itemId: findPaperItem(questions[0].id), response: right1 },
    { itemId: findPaperItem(questions[1].id), response: wrong2 },
    { itemId: findPaperItem(task.id), response: { sentiments: task.answer_key.correctSentiments } },
  ];
  check('F11-作答映射到试卷题目', responses.every(r => !!r.itemId), `responses=${JSON.stringify(responses)}`);

  const submitBody = { scheduleId, attemptId, responses };
  const submitRes = await api(stuToken, 'POST', '/api/student/exams/submit', submitBody);
  const submitData = submitRes.json.data as { receipt?: string; duplicate?: boolean; submitted?: boolean } | undefined;
  check('F12-交卷成功', submitRes.status === 200 && submitData?.submitted === true && !!submitData.receipt,
    `status=${submitRes.status} ${JSON.stringify(submitRes.json).slice(0, 200)}`);

  const replayRes = await api(stuToken, 'POST', '/api/student/exams/submit', submitBody);
  const replayData = replayRes.json.data as { duplicate?: boolean; receipt?: string } | undefined;
  check('F13-相同内容重放幂等', replayRes.status === 200 && replayData?.duplicate === true && replayData.receipt === submitData?.receipt,
    `status=${replayRes.status} ${JSON.stringify(replayRes.json).slice(0, 200)}`);

  const hackRes = await api(stuToken, 'POST', '/api/student/exams/submit', {
    scheduleId, attemptId, responses: [{ itemId: responses[0].itemId, response: wrong2 }],
  });
  check('F14-不同内容重交拒绝', hackRes.status === 409, `status=${hackRes.status}`);

  // ============ 3. DB 层核验(评分真的写对了吗) ============
  const attemptRow = (await db.query<{ status: string; submission_hash: string | null }>(
    'SELECT status, submission_hash FROM exam_attempts WHERE id = $1', [attemptId])).rows[0];
  check('F15-attempt状态graded', attemptRow?.status === 'graded', `status=${attemptRow?.status}`);
  check('F16-提交哈希已记录', !!attemptRow?.submission_hash, 'submission_hash 为空');

  // 期望分值从试卷实际分配读取(不猜 allocateScores 的分配逻辑):
  // 理论题1满分、理论题2零分、实操题满分。
  const paperItems = (await db.query<{ item_id: string; score: string }>(
    'SELECT item_id, score FROM exam_paper_items WHERE paper_id = $1', [paperId])).rows;
  const scoreOf = (sourceId: string) => Number(paperItems.find(p => p.item_id === sourceId)?.score ?? 0);
  const expectedTotal = Math.round((scoreOf(questions[0].id) + scoreOf(task.id)) * 100) / 100;

  const scoreRow = (await db.query<{ total_score: string; max_score: string; passed: boolean; status: string }>(
    'SELECT total_score, max_score, passed, status FROM exam_scores WHERE attempt_id = $1', [attemptId])).rows[0];
  check('F17-总分=理论对+实操对', !!scoreRow && Number(scoreRow.total_score) === expectedTotal && Number(scoreRow.max_score) === 100,
    `score=${JSON.stringify(scoreRow)} 期望 total=${expectedTotal}`);
  check('F18-成绩状态auto_graded', scoreRow?.status === 'auto_graded', `status=${scoreRow?.status}`);

  const respRows = (await db.query<{ item_id: string; score: string; max_score: string; item_type: string }>(
    'SELECT item_id, score, max_score, item_type FROM exam_responses WHERE attempt_id = $1 ORDER BY item_id', [attemptId])).rows;
  const r1 = respRows.find(r => r.item_id === responses[0].itemId);
  const r2 = respRows.find(r => r.item_id === responses[1].itemId);
  const r3 = respRows.find(r => r.item_id === responses[2].itemId);
  check('F19-理论题得分(对满错0)', respRows.length === 3 && Number(r1?.score) === Number(r1?.max_score) && Number(r2?.score) === 0,
    `responses=${JSON.stringify(respRows)}`);
  check('F20-实操题满分判分', r3?.item_type === 'task' && Number(r3?.score) === Number(r3?.max_score) && Number(r3?.max_score) > 0,
    `实操题行=${JSON.stringify(r3)}`);

  // ============ 4. 发布门禁 ============
  const resultsRes = await api(stuToken, 'GET', '/api/student/results');
  const inResults = ((resultsRes.json.data ?? []) as Array<{ scheduleId: string }>).some(r => r.scheduleId === scheduleId);
  check('F21-未发布成绩学员不可见', !inResults, '学员成绩列表出现了未发布的成绩');

  const adminResults = await api(adminToken, 'GET', '/api/admin/results');
  const adminSeen = JSON.stringify(adminResults.json).includes(scheduleId);
  check('F22-管理端可见待发布成绩', adminSeen, '管理端成绩列表找不到该成绩');
} finally {
  // ============ 5. 清理(外键全 NO ACTION, 按依赖顺序硬删) ============
  console.log('\n----- 清理测试数据 -----');
  try {
    if (attemptId) {
      await db.query('DELETE FROM exam_heartbeats WHERE attempt_id = $1', [attemptId]);
      await db.query('DELETE FROM exam_responses WHERE attempt_id = $1', [attemptId]);
      await db.query('DELETE FROM exam_grade_reviews WHERE score_id IN (SELECT id FROM exam_scores WHERE attempt_id = $1)', [attemptId]);
      await db.query('DELETE FROM exam_scores WHERE attempt_id = $1', [attemptId]);
      await db.query('DELETE FROM exam_attempts WHERE id = $1', [attemptId]);
      console.log('OK   [清理] attempt/responses/scores');
    }
    if (scheduleId) {
      await db.query('DELETE FROM exam_schedules WHERE id = $1', [scheduleId]);
      console.log('OK   [清理] schedule');
    }
    if (paperId) {
      await db.query('DELETE FROM exam_paper_items WHERE paper_id = $1', [paperId]);
      await db.query('DELETE FROM exam_papers WHERE id = $1', [paperId]);
      console.log('OK   [清理] paper/items');
    }
    if (cohortId) {
      await db.query('DELETE FROM enrollments WHERE cohort_id = $1', [cohortId]);
      await db.query('DELETE FROM cohorts WHERE id = $1', [cohortId]);
      console.log('OK   [清理] enrollment/cohort');
    }
  } catch (e) {
    console.log(`WARN [清理] 部分失败, 需手工核查 cohort=${cohortId} paper=${paperId} schedule=${scheduleId}: ${(e as Error).message}`);
  }
  await db.end();
}

console.log(`\n===== 交卷路径实测结果: ${passed} 通过 / ${failed} 失败 =====`);
if (failures.length) {
  console.log('失败明细:');
  failures.forEach(f => console.log(` - ${f}`));
  process.exit(1);
}
