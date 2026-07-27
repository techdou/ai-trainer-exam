import { z } from 'zod';
import { requireRole, requireSameOrg } from '@/server/auth';
import { ok, fail, handler, parseBody } from '@/lib/api';
import {
  loadSourceItem, createPaper,
  autoSelectQuestionIds, autoSelectTaskIds,
  countAvailableQuestions, countAvailableTasks,
  type SourceItem,
} from '@/server/paper-compose';

// ---- 请求校验 ----

const theoryPickSchema = z.object({
  questionType: z.enum(['single_choice', 'true_false', 'fill_in_blank', 'prompt_description']),
  count: z.number().int().min(1).max(200),
});

const taskPickSchema = z.object({
  taskType: z.string().min(1).max(48),
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

// ---- 题型/实操类型中文标签 ----

const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: '单选题',
  true_false: '判断题',
  fill_in_blank: '填空题',
  prompt_description: '提示词描述',
};

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

  const questionTypes = ['single_choice', 'true_false', 'fill_in_blank', 'prompt_description'];
  const questionCounts = await Promise.all(
    questionTypes.map(async qt => ({
      questionType: qt,
      label: QUESTION_TYPE_LABELS[qt] ?? qt,
      available: await countAvailableQuestions(organizationId, qt),
    })),
  );

  // 实操类型: 如果前端指定了 taskTypes 参数就用它, 否则查全部已知类型
  const allTaskTypes = requestedTaskTypes.length > 0 ? requestedTaskTypes : [
    'excel_delete_rows', 'file_classify', 'image_clean', 'dataset_quality',
    'image_annotation', 'bounding_box', 'point_annotation', 'polyline_annotation', 'polygon_annotation',
    'text_sentiment', 'data_labeling', 'audio_transcription', 'stats_table',
  ];
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

  // 1. 随机抽取题目 ID
  const itemRequests: { itemType: 'question' | 'task'; itemId: string }[] = [];

  for (const sel of body.theorySelections) {
    const ids = await autoSelectQuestionIds(organizationId, sel.questionType, sel.count);
    if (ids.length < sel.count) {
      const label = QUESTION_TYPE_LABELS[sel.questionType] ?? sel.questionType;
      return fail(400, `${label}题库只有 ${ids.length} 道可用题目, 不足 ${sel.count} 道`);
    }
    for (const id of ids) itemRequests.push({ itemType: 'question', itemId: id });
  }

  for (const sel of body.taskSelections) {
    const ids = await autoSelectTaskIds(organizationId, sel.taskType, sel.count);
    if (ids.length < sel.count) {
      return fail(400, `实操类型「${sel.taskType}」只有 ${ids.length} 道可用任务, 不足 ${sel.count} 道`);
    }
    for (const id of ids) itemRequests.push({ itemType: 'task', itemId: id });
  }

  // 2. 加载快照
  const sources: SourceItem[] = [];
  for (const req of itemRequests) {
    const source = await loadSourceItem(req, organizationId);
    if (!source) return fail(400, `题目或实操任务不可用于正式考试：${req.itemId}`);
    sources.push(source);
  }

  // 3. 创建试卷
  const result = await createPaper({
    organizationId, title: body.title, paperKind: body.paperKind,
    totalScore: body.totalScore, passScore: body.passScore, durationMinutes: body.durationMinutes, sources,
  });

  return ok({ ...result, questionCount: body.theorySelections.reduce((a, s) => a + s.count, 0), taskCount: body.taskSelections.reduce((a, s) => a + s.count, 0) }, { status: 201 });
});
