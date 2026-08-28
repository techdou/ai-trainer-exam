/**
 * 标注任务判分闭环验证: 学员身份提交「标准答案本身」→ 应全部满分。
 * 覆盖 20 套(方框/点/折线/轮廓)。用法: tsx scripts/db/tmp-grade-annot.mts (dev server 5000)
 */
import { loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
import pg from 'pg';

loadEnv();
loadEnvLocal();
const BASE = 'http://localhost:5000';

const login = await fetch(`${BASE}/api/auth/session`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'stu001@student.exam.local', password: process.env.VERIFY_STUDENT_PASSWORD }),
});
const lj = await login.json();
if (!lj.success) throw new Error('login failed');
const token = lj.data.accessToken as string;

const db = new pg.Client({ connectionString: process.env.PGDATABASE_URL });
await db.connect();
const { rows } = await db.query(
  `SELECT id, task_type, title, answer_key FROM practice_task_templates WHERE config->>'imageUrl' LIKE '/training/annot2/%'`,
);
const keyOf = (t: string, ak: Record<string, unknown>): unknown => {
  if (t === 'image_annotation') return { boxes: ak.boxes };
  if (t === 'point_annotation') return { points: ak.points };
  if (t === 'polyline_annotation') return { lines: ak.lines };
  return { polygons: ak.polygons };
};
let full = 0, bad = 0;
for (const r of rows) {
  const submission = keyOf(r.task_type, r.answer_key);
  const res = await fetch(`${BASE}/api/student/practice/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ taskId: r.id, submission }),
  });
  const j = await res.json();
  const score = j?.data?.score ?? -1;
  const ok = j.success && score === 100;
  ok ? full++ : bad++;
  console.log(`${ok ? 'FULL' : 'BAD '} ${score.toFixed(0).padStart(3)}  ${r.title}`);
}
console.log(`\n判分闭环: 满分 ${full} / 异常 ${bad} / 共 ${rows.length}`);
await db.end();
if (bad > 0) process.exit(1);
