import { requireRole } from '@/server/auth';
import { dbTx } from '@/server/db';
import { insertAudit } from '@/server/audit';
import { handler, ok, fail } from '@/lib/api';

/**
 * POST /api/admin/seed-prompt-questions
 * 管理员一键导入"提示词描述题"(prompt_description) 到当前环境数据库。
 * 同时写入 practice_question_items 和 exam_question_items。
 * 跳过已存在（同题干）的题目，不会清除已有题目。
 */
export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin']);

  const orgRow = await requireOrg();
  if (!orgRow) return fail(500, '没有可用机构，请先初始化系统');
  const organizationId = orgRow;

  const result = await dbTx(async (client) => {
    let practiceInserted = 0;
    let examInserted = 0;
    let skipped = 0;

    for (const q of PROMPT_QUESTIONS) {
      const options = { image: q.image };
      const answerKey = JSON.stringify({
        keywords: q.keywords,
        referencePrompt: q.referencePrompt,
        passThreshold: q.passThreshold,
      });
      const contentHash = q.stem.replace(/\s+/g, '').toLowerCase();

      // 跳过已存在（practice 侧判重）
      const pExisting = await client.query(
        `SELECT 1 FROM practice_question_items WHERE organization_id=$1 AND regexp_replace(lower(stem),'\\s+','','g')=$2 LIMIT 1`,
        [organizationId, contentHash],
      );
      if (pExisting.rowCount) {
        skipped++;
        continue;
      }

      await client.query(
        `INSERT INTO practice_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,legal_review_required,created_at,updated_at)
         VALUES($1,'prompt_description',$2,$3,$4,NULL,$5,$6,'prompt_desc_seed','published',1,true,false,NOW(),NOW())`,
        [organizationId, q.stem, options, answerKey, q.kp, q.difficulty],
      );
      practiceInserted++;

      await client.query(
        `INSERT INTO exam_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,eligible_for_formal_exam,legal_review_required,created_at,updated_at)
         VALUES($1,'prompt_description',$2,$3,$4,NULL,$5,$6,'prompt_desc_seed','published',1,false,true,false,NOW(),NOW())`,
        [organizationId, q.stem, options, answerKey, q.kp, q.difficulty],
      );
      examInserted++;
    }

    return { total: PROMPT_QUESTIONS.length, practiceInserted, examInserted, skipped };
  });

  await insertAudit({
    actorId: user.id,
    action: 'question.import',
    entityType: 'prompt_description_questions',
    entityId: 'batch',
    details: JSON.stringify({ organizationId, ...result, source: 'prompt_desc_seed' }),
  });

  return ok(result);
});

async function requireOrg(): Promise<string | null> {
  const { dbOne } = await import('@/server/db');
  const row = await dbOne<{ id: string }>(
    "SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1",
  );
  return row?.id ?? null;
}

type PromptSeed = {
  stem: string;
  image: string;
  keywords: string[];
  referencePrompt: string;
  passThreshold: number;
  kp: string;
  difficulty: number;
};

const PROMPT_QUESTIONS: PromptSeed[] = [
  {
    stem: '请仔细观察下图，用自然语言撰写一段提示词（Prompt），描述图片中能够看到的内容。描述应包含画面中的主体、颜色、场景、动作等关键信息。',
    image: '/training/gen/cat-solo-1.png',
    keywords: ['猫|猫咪|小猫', '橘色|橘黄|橙色', '坐|趴|蹲', '窗台|窗户|窗', '阳光|日光'],
    referencePrompt: '一只橘色的猫咪安静地坐在窗台上，温暖的阳光透过玻璃洒在它身上，毛发呈现金黄色光泽。',
    passThreshold: 0.6,
    kp: '提示词撰写',
    difficulty: 2,
  },
  {
    stem: '请仔细观察下图，用自然语言撰写一段提示词（Prompt），描述图片中能够看到的内容。描述应包含画面中的主体、场景、颜色等关键信息。',
    image: '/training/gen/basketball-1.png',
    keywords: ['篮球', '人|球员|运动员|人物', '运动|打|投|拍', '球场|场地|室内', '橙色|橘色'],
    referencePrompt: '一个穿着运动服的人在室内篮球场上正在打篮球，手中持有一个橙色的篮球。',
    passThreshold: 0.6,
    kp: '提示词撰写',
    difficulty: 2,
  },
  {
    stem: '请仔细观察下图，用自然语言撰写一段提示词（Prompt），描述图片中能够看到的场景和内容。描述应包含画面中的主要元素、颜色、环境等关键信息。',
    image: '/training/traffic-scene.png',
    keywords: ['车|汽车|车辆', '路|道路|街道|马路', '交通', '红绿灯|信号灯', '建筑|楼房|大楼'],
    referencePrompt: '一条城市街道上的交通场景，路上有多辆汽车在行驶，路边有建筑物，前方有红绿灯。',
    passThreshold: 0.6,
    kp: '提示词撰写',
    difficulty: 3,
  },
  {
    stem: '请仔细观察下图，用自然语言撰写一段提示词（Prompt），描述图片中能够看到的内容。描述应包含画面中的主体、颜色、材质等关键信息。',
    image: '/training/gen/mug-1.webp',
    keywords: ['杯子|马克杯|水杯|茶杯', '白色|白', '陶瓷|瓷', '把手|手柄', '桌子|桌面|桌'],
    referencePrompt: '一个白色的陶瓷马克杯放在桌面上，杯子带有把手，表面光滑整洁。',
    passThreshold: 0.5,
    kp: '提示词撰写',
    difficulty: 1,
  },
  {
    stem: '请仔细观察下图，用自然语言撰写一段提示词（Prompt），描述图片中能够看到的内容。描述应包含画面中的主体、颜色、环境等关键信息。',
    image: '/training/gen/plant-1.webp',
    keywords: ['植物|绿植|盆栽', '绿色|绿', '叶|叶子', '花盆|盆|花瓶', '室内|屋内|房间'],
    referencePrompt: '一盆绿色的室内植物放在花盆中，叶片茂盛翠绿，摆放在室内环境中。',
    passThreshold: 0.5,
    kp: '提示词撰写',
    difficulty: 2,
  },
];
