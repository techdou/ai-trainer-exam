import { requireRole } from '@/server/auth';
import { dbTx } from '@/server/db';
import { insertAudit } from '@/server/audit';
import { handler, ok, fail } from '@/lib/api';

/**
 * POST /api/admin/seed-dialogue-questions
 * 管理员一键导入"对话情绪判读题"(dialogue_sentiment) 到当前环境数据库。
 * 同时写入 practice_question_items 和 exam_question_items(practice+exam 双写)。
 * 跳过已存在（同题干）的题目，不会清除已有题目。
 * 判分复用 single_choice 评分器: answer_key 存 { letter }, options 存对话素材。
 */

interface DialogueTurn { speaker: string; text: string }
export type DialogueSeed = {
  stem: string;
  dialogue: DialogueTurn[];
  target: number;
  options: Record<'A' | 'B' | 'C' | 'D', string>;
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  kp: string;
  difficulty: number;
};

/** 种子数据单一来源: scripts/db/seed-dialogue-sentiment.mts 与本 API 共用,避免两份漂移。 */
export const DIALOGUE_QUESTIONS: DialogueSeed[] = [
  {
    stem: '阅读下面这段客服对话，判断第 3 句（高亮句）中客户的主要情绪或意图。',
    dialogue: [
      { speaker: '客服', text: '您好，请问有什么可以帮您？' },
      { speaker: '客户', text: '我在你们店买的电饭煲，用了一周就坏了。' },
      { speaker: '客户', text: '这质量也太差了吧！我要求马上退货退款！' },
      { speaker: '客服', text: '非常抱歉给您带来不便，您别着急，我马上为您核实订单。' },
    ],
    target: 2,
    options: { A: '不满·要求退货退款', B: '满意·表达感谢', C: '咨询·了解用法', D: '闲聊·无关话题' },
    answer: 'A',
    explanation: '客户说"质量太差""马上退货退款"，属于对商品质量不满并明确提出退货要求。',
    kp: '对话情绪判读',
    difficulty: 1,
  },
  {
    stem: '阅读下面这段客服对话，判断第 5 句（高亮句）中客户的主要情绪或意图。',
    dialogue: [
      { speaker: '客服', text: '亲，您的包裹已发货，预计明天到达。' },
      { speaker: '客户', text: '好的，谢谢。' },
      { speaker: '客服', text: '还有其他需要帮忙的吗？' },
      { speaker: '客户', text: '对了，包裹能放代收点吗？我白天不在家。' },
      { speaker: '客户', text: '麻烦帮我备注一下，谢谢您！' },
    ],
    target: 4,
    options: { A: '投诉·服务态度差', B: '咨询·请求代收备注', C: '催促·尽快发货', D: '退货·取消订单' },
    answer: 'B',
    explanation: '客户请求把包裹放代收点并请客服备注，属于提出具体服务请求，语气礼貌。',
    kp: '对话意图识别',
    difficulty: 1,
  },
  {
    stem: '阅读下面这段外卖平台客服对话，判断第 3 句（高亮句）中用户的主要情绪或意图。',
    dialogue: [
      { speaker: '用户', text: '我的订单显示配送中，但是骑手已经四十分钟没动了。' },
      { speaker: '客服', text: '请您稍等，我帮您联系骑手。' },
      { speaker: '用户', text: '不用联系了！饭都凉了，取消订单，把餐费退给我！' },
      { speaker: '客服', text: '好的，为您提交退款申请，预计 1-3 个工作日到账。' },
    ],
    target: 2,
    options: { A: '耐心·愿意等待', B: '咨询·询问进度', C: '愤怒·要求取消退款', D: '满意·好评点赞' },
    answer: 'C',
    explanation: '"不用联系了""取消订单""退给我"表明用户已失去耐心、情绪愤怒并要求取消退款。',
    kp: '对话情绪判读',
    difficulty: 2,
  },
  {
    stem: '阅读下面这段银行客服对话，判断第 3 句（高亮句）中客户的主要情绪或意图。',
    dialogue: [
      { speaker: '客户', text: '你好，我想问一下你们那个新出的定期存款产品。' },
      { speaker: '客服', text: '好的，您想了解利率还是存期呢？' },
      { speaker: '客户', text: '三年的年利率是多少？起存金额要多少？' },
      { speaker: '客服', text: '三年期年利率 2.6%，起存 5 万元。' },
    ],
    target: 2,
    options: { A: '投诉·账户被盗', B: '咨询·了解产品信息', C: '紧急·挂失银行卡', D: '不满·利率太低' },
    answer: 'B',
    explanation: '客户在询问利率和起存金额，属于典型的产品信息咨询，无负面情绪。',
    kp: '对话意图识别',
    difficulty: 1,
  },
  {
    stem: '阅读下面这段物流客服对话，判断第 5 句（高亮句）中客户的主要情绪或意图。',
    dialogue: [
      { speaker: '客服', text: '您的快递今天上午已到本市网点。' },
      { speaker: '客户', text: '那什么时候能送到？' },
      { speaker: '客服', text: '预计今天下午 6 点前送达。' },
      { speaker: '客户', text: '怎么每次都这么慢……上次也是拖到晚上。' },
      { speaker: '客户', text: '能不能优先给我送？我真的急着用。' },
    ],
    target: 4,
    options: { A: '感谢·认可服务', B: '咨询·查询运费', C: '催促·希望优先配送', D: '退货·拒收包裹' },
    answer: 'C',
    explanation: '客户表达了对速度的不满并请求优先配送，核心意图是催促，并非拒收或退款。',
    kp: '对话意图识别',
    difficulty: 2,
  },
  {
    stem: '阅读下面这段酒店客服对话，判断第 4 句（高亮句）中客户的主要情绪或意图。',
    dialogue: [
      { speaker: '客户', text: '你好，我下周六订的房间，能帮我加一张婴儿床吗？' },
      { speaker: '客服', text: '可以的，请问您的订单号是多少？' },
      { speaker: '客户', text: '订单号 B20260912。' },
      { speaker: '客户', text: '对了，再问一下酒店有停车位吧？我是自驾过去。' },
      { speaker: '客服', text: '有的，地下停车场住客免费。' },
    ],
    target: 3,
    options: { A: '投诉·房间有问题', B: '要求·办理退房', C: '咨询·停车与设施', D: '改期·调整入住时间' },
    answer: 'C',
    explanation: '高亮句询问酒店是否有停车位，属于配套设施咨询，语气平和。',
    kp: '对话意图识别',
    difficulty: 2,
  },
  {
    stem: '阅读下面这段宽带客服对话，判断第 3 句（高亮句）中客户的主要情绪或意图。',
    dialogue: [
      { speaker: '客户', text: '我家宽带从昨天晚上开始就一直断线。' },
      { speaker: '客服', text: '抱歉给您带来不便，请问光猫的指示灯是什么颜色？' },
      { speaker: '客户', text: '红灯一直闪！我打了三次电话了，到现在都没人处理，你们到底管不管？' },
      { speaker: '客服', text: '实在抱歉，我马上为您加急报修，两小时内安排师傅上门。' },
    ],
    target: 2,
    options: { A: '咨询·了解套餐资费', B: '耐心·配合排查', C: '不满·投诉处理太慢', D: '续费·升级带宽' },
    answer: 'C',
    explanation: '"打了三次电话""到底管不管"表明客户对故障长时间未解决强烈不满，属于投诉。',
    kp: '对话情绪判读',
    difficulty: 3,
  },
  {
    stem: '阅读下面这段电商售后对话，判断第 5 句（高亮句）中客户的主要情绪或意图。',
    dialogue: [
      { speaker: '客服', text: '您申请的换货已通过，新商品今天发出。' },
      { speaker: '客户', text: '好的，这次检查过了再发吗？' },
      { speaker: '客服', text: '放心，出库前会做二次质检。' },
      { speaker: '客户', text: '那就好，上次收到就是屏幕有划痕。' },
      { speaker: '客户', text: '这次没问题的话我会给你们好评的，谢谢。' },
    ],
    target: 4,
    options: { A: '威胁·给差评', B: '认可·愿意好评', C: '投诉·要求赔偿', D: '拒收·再次退货' },
    answer: 'B',
    explanation: '客户说"没问题的话我会给你们好评"，是在有条件认可服务，整体态度缓和、愿意给出好评。',
    kp: '对话情绪判读',
    difficulty: 3,
  },
];

export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin']);

  const orgRow = await requireOrg();
  if (!orgRow) return fail(500, '没有可用机构，请先初始化系统');
  const organizationId = orgRow;

  const result = await dbTx(async (client) => {
    let practiceInserted = 0;
    let examInserted = 0;
    let skipped = 0;

    for (const q of DIALOGUE_QUESTIONS) {
      const options = { dialogue: q.dialogue, target: q.target, ...q.options };
      const answerKey = JSON.stringify({ letter: q.answer });
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
         VALUES($1,'dialogue_sentiment',$2,$3,$4,$5,$6,$7,'dialogue_seed','published',1,true,false,NOW(),NOW())`,
        [organizationId, q.stem, options, answerKey, q.explanation, q.kp, q.difficulty],
      );
      practiceInserted++;

      await client.query(
        `INSERT INTO exam_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,eligible_for_formal_exam,legal_review_required,created_at,updated_at)
         VALUES($1,'dialogue_sentiment',$2,$3,$4,$5,$6,$7,'dialogue_seed','published',1,false,true,false,NOW(),NOW())`,
        [organizationId, q.stem, options, answerKey, q.explanation, q.kp, q.difficulty],
      );
      examInserted++;
    }

    return { total: DIALOGUE_QUESTIONS.length, practiceInserted, examInserted, skipped };
  });

  await insertAudit({
    actorId: user.id,
    action: 'question.import',
    entityType: 'dialogue_sentiment_questions',
    entityId: 'batch',
    details: JSON.stringify({ organizationId, ...result, source: 'dialogue_seed' }),
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
