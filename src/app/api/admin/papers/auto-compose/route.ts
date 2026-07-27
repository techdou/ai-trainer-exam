import { z } from 'zod';
import { requireRole, requireSameOrg } from '@/server/auth';
import { ok, fail, handler, parseBody } from '@/lib/api';
import {
  createPaper, loadAutoComposeSources,
  countAvailableQuestions, countAvailableTasks,
  KNOWN_QUESTION_TYPES, KNOWN_TASK_TYPES,
  QUESTION_TYPE_LABELS, TASK_TYPE_LABELS,
} from '@/server/paper-compose';

// ---- 请求校验 ----

const theoryPickSchema = z.object({
  questionType: z.enum(KNOWN_QUESTION_TYPES as unknown as [string, ...string[]]),
  count: z.number().int().min(1).max(200),
});

// taskType 用已知实操类型枚举约束, 防止任意字符串穿透到 SQL(M1)。
const taskPickSchema = z.object({
  taskType: z.enum(KNOWN_TASK_TYPES as unknown as [string, ...string[]]),
  count: z.number().int().min(1).max(10),
});

const autoComposeSchema = z.object({
  title: z.string().trim().min(2).max(300),
  organizationId: z.string().uuid().optional(),
  paperKind: z.string().max(20).default('formal'),
  durationMinutes: z.number().int().min(5).max(300).default(90),
  totalScore: z.number().positive().max(1000).default(100),
  passScore: z.number().min(0).max(1000).default(60),
  theorySelections: z.array(theoryPickSchema).max(10).default([]),
  taskSelections: z.array(taskPickSchema).max(20).default([]),
});

// ---- 题型/实操类型中文标签(从 paper-compose 共用, 单一来源) ----

// 见 paper-compose.ts 的 QUESTION_TYPE_LABELS / TASK_TYPE_LABELS

/**
 * GET /api/admin/papers/auto-compose
 * 返回当前机构考试库各题型/实操类型的可用数量, 供前端展示。
 */
export const GET = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin']);
  const url = new URL(request.url);
  const requestedTaskTypes = (url.searchParams.get('taskTypes') ?? '').split(',').map(s => s.trim()).filter(Boolean);

  const organizationId = user.roles.includes('super_admin')
    ? (url.searchParams.get('organizationId') ?? '')
    : user.organizationId;
  if (!organizationId) return fail(400, '账号未绑定机构');

  const questionTypes = KNOWN_QUESTION_TYPES;
  const questionCounts = await Promise.all(
    questionTypes.map(async qt => ({
      questionType: qt,
      label: QUESTION_TYPE_LABELS[qt] ?? qt,
      available: await countAvailableQuestions(organizationId, qt),
    })),
  );

  // 实操类型: 如果前端指定了 taskTypes 参数就用它, 否则查全部已知类型
  const allTaskTypes = requestedTaskTypes.length > 0 ? requestedTaskTypes : KNOWN_TASK_TYPES;
  const taskCounts = await Promise.all(
    allTaskTypes.map(async tt => ({
      taskType: tt,
      available: await countAvailableTasks(organizationId, tt),
    })),
  );

  return ok({ questions: questionCounts, tasks: taskCounts });
});

/**
 * POST /api/admin/papers/auto-compose
 * 一键智能组卷: 按题型/实操类型随机抽题, 自动均分分值, 创建草稿试卷。
 */
export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin']);
  const body = await parseBody(request, autoComposeSchema);
  if (body.passScore > body.totalScore) return fail(400, '及格分不能高于总分');
  if (body.theorySelections.length === 0 && body.taskSelections.length === 0) {
    return fail(400, '请至少选择一种题型或实操类型');
  }

  const organizationId = user.roles.includes('super_admin') ? body.organizationId : user.organizationId;
  if (!organizationId) return fail(400, '必须选择所属机构');
  requireSameOrg(user, organizationId);

  // 1+2. 批量抽取 + 构造快照(单次查询完成, 无 RANDOM→loadSource 窗口期, 无串行往返)
  const selections = [
    ...body.theorySelections.map(s => ({ kind: 'question' as const, type: s.questionType, count: s.count })),
    ...body.taskSelections.map(s => ({ kind: 'task' as const, type: s.taskType, count: s.count })),
  ];
  const { sources, error } = await loadAutoComposeSources(organizationId, selections);
  if (error) return fail(400, error.message);

  // 3. 创建试卷
  const result = await createPaper({
    organizationId, title: body.title, paperKind: body.paperKind,
    totalScore: body.totalScore, passScore: body.passScore, durationMinutes: body.durationMinutes, sources,
  });

  return ok({ ...result, questionCount: body.theorySelections.reduce((a, s) => a + s.count, 0), taskCount: body.taskSelections.reduce((a, s) => a + s.count, 0) }, { status: 201 });
});
