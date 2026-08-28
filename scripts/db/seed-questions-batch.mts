/**
 * 批量理论题种子：单选题 + 判断题。
 * 覆盖人工智能训练师五级核心知识点。
 * 运行：pnpm tsx scripts/db/seed-questions-batch.mts
 * 所有题目同时写入 practice_question_items 和 exam_question_items。
 */
import pg from 'pg';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
loadEnv(); loadEnvLocal();

type SingleChoice = {
  type: 'single_choice';
  stem: string;
  options: [string, string, string, string];
  answer: string; // A/B/C/D
  kp: string;
  difficulty: number;
};
type TrueFalse = {
  type: 'true_false';
  stem: string;
  answer: boolean;
  kp: string;
  difficulty: number;
};
type Q = SingleChoice | TrueFalse;

const questions: Q[] = [
  // ─── 数据标注基础概念 ───
  { type: 'single_choice', stem: '以下哪项不属于数据标注的基本类型？', options: ['图像标注', '文本标注', '音频标注', '代码编译'], answer: 'D', kp: '标注基础', difficulty: 1 },
  { type: 'single_choice', stem: '在矩形框标注（Bounding Box）中，框的坐标通常使用什么方式表示？', options: ['绝对像素坐标', '相对于原图的归一化坐标', '百分比角度', '十六进制颜色值'], answer: 'B', kp: '标注基础', difficulty: 1 },
  { type: 'single_choice', stem: 'IoU（Intersection over Union）在标注质量评估中用于衡量什么？', options: ['标注速度', '预测框与真实框的重叠程度', '标注工具的版本号', '图片的分辨率'], answer: 'B', kp: '标注质量', difficulty: 2 },
  { type: 'single_choice', stem: 'IoU 的取值范围是？', options: ['-1 到 1', '0 到 1', '0 到 100', '1 到 10'], answer: 'B', kp: '标注质量', difficulty: 1 },
  { type: 'single_choice', stem: '当 IoU 阈值设为 0.45 时，以下哪个 IoU 值会被判定为标注合格？', options: ['0.30', '0.40', '0.45', '0.50'], answer: 'D', kp: '标注质量', difficulty: 2 },
  { type: 'true_false', stem: 'IoU 值越接近 1，表示标注框与标准答案的重叠程度越高。', answer: true, kp: '标注质量', difficulty: 1 },
  { type: 'true_false', stem: '多边形标注（Polygon）适用于标注不规则形状的物体轮廓。', answer: true, kp: '标注基础', difficulty: 1 },
  { type: 'true_false', stem: '点标注（Point Annotation）适用于标注物体的精确中心位置。', answer: true, kp: '标注基础', difficulty: 1 },

  // ─── 数据清洗与质量 ───
  { type: 'single_choice', stem: '数据清洗的主要目的是什么？', options: ['增加数据量', '去除错误、重复和不完整数据，提高数据质量', '压缩数据存储空间', '加密敏感数据'], answer: 'B', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: '以下哪种情况属于"图文不符"的数据质量问题？', options: ['图片标签为"猫"，但图中是一只狗', '图片分辨率较低', '图片文件较大', '图片格式为 PNG'], answer: 'A', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: '在数据集质量检验中，以下哪项应被标记为问题数据？', options: ['内容完整的正常标注', '空值或缺失标注', '格式正确的文本', '类别清晰的图片'], answer: 'B', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: '重复数据对训练模型有什么影响？', options: ['提高模型准确率', '导致模型对重复样本过拟合', '减少训练时间', '没有影响'], answer: 'B', kp: '数据清洗', difficulty: 2 },
  { type: 'true_false', stem: '数据集中的乱码文本应该被识别为问题数据并清除。', answer: true, kp: '数据清洗', difficulty: 1 },
  { type: 'true_false', stem: '数据清洗时，只要数据量大，就不需要检查数据质量。', answer: false, kp: '数据清洗', difficulty: 1 },

  // ─── 文本情感标注 ───
  { type: 'single_choice', stem: '文本情感标注通常将文本分为哪几类？', options: ['正面、负面、中性', '长文本、短文本', '中文、英文', '正式、非正式'], answer: 'A', kp: '文本标注', difficulty: 1 },
  { type: 'single_choice', stem: '"物流太慢了，等了一周才到，东西还行。" 这条评论最合适的情感标签是？', options: ['好评', '中评', '差评', '无法判断'], answer: 'B', kp: '文本标注', difficulty: 2 },
  { type: 'true_false', stem: '"这个产品非常好用，已经推荐给朋友了。" 应标注为好评。', answer: true, kp: '文本标注', difficulty: 1 },

  // ─── 音频转写 ───
  { type: 'single_choice', stem: '音频转写任务中，"语气助词"（如嗯、啊、哦）应该如何处理？', options: ['必须删除', '必须保留', '根据个人喜好决定', '用标点替代'], answer: 'B', kp: '音频标注', difficulty: 1 },
  { type: 'single_choice', stem: '衡量音频转写质量的 CER（Character Error Rate）是指什么？', options: ['字符错误率', '语音识别速度', '音频采样率', '音频时长'], answer: 'A', kp: '音频标注', difficulty: 2 },
  { type: 'true_false', stem: '音频转写时，文字准确率达标但漏写了语气助词，仍然算作完全正确。', answer: false, kp: '音频标注', difficulty: 2 },

  // ─── 折线与轮廓标注 ───
  { type: 'single_choice', stem: '折线标注（Polyline）中，双向 Chamfer 距离用于衡量什么？', options: ['两条折线之间的平均距离', '折线的总长度', '折线的点数', '折线的颜色'], answer: 'A', kp: '标注质量', difficulty: 2 },
  { type: 'single_choice', stem: '在折线标注评分中，为什么要进行"等距重采样"？', options: ['减少折线的点数以加快计算', '消除因点密度差异导致的评分偏差', '使折线更美观', '压缩存储空间'], answer: 'B', kp: '标注质量', difficulty: 3 },
  { type: 'single_choice', stem: '轮廓标注评分使用"网格栅格化多边形 IoU"（80×80 采样），其核心原理是？', options: ['将多边形栅格化为像素网格，计算重叠像素比例', '测量多边形顶点数量', '比较多边形颜色', '计算多边形周长'], answer: 'A', kp: '标注质量', difficulty: 3 },
  { type: 'true_false', stem: '当折线的 Chamfer 距离超过图片尺寸的 8% 时，该标注会被判定为不合格。', answer: true, kp: '标注质量', difficulty: 2 },

  // ─── 文件分类与数据处理 ───
  { type: 'single_choice', stem: '在文件分类任务中，以下哪种文件应归入"图片素材"文件夹？', options: ['report.pdf', 'photo.jpg', 'audio.mp3', 'notes.txt'], answer: 'B', kp: '数据管理', difficulty: 1 },
  { type: 'single_choice', stem: 'Excel 数据清洗中，"删除含空格的人名行"属于什么操作？', options: ['数据加密', '数据清洗', '数据分析', '数据可视化'], answer: 'B', kp: '数据清洗', difficulty: 1 },

  // ─── 职业素养与安全 ───
  { type: 'single_choice', stem: '人工智能训练师在处理数据时，以下哪种行为是正确的？', options: ['将客户数据上传到个人网盘', '严格遵守数据保密协议', '在社交媒体分享工作内容', '将数据发送给朋友帮忙'], answer: 'B', kp: '职业素养', difficulty: 1 },
  { type: 'single_choice', stem: '标注含有个人隐私信息的数据时，应当怎么做？', options: ['直接公开发布', '进行脱敏处理后使用', '随意修改原始数据', '忽略隐私问题'], answer: 'B', kp: '数据安全', difficulty: 1 },
  { type: 'true_false', stem: '人工智能训练师有义务保护数据安全和用户隐私。', answer: true, kp: '数据安全', difficulty: 1 },
  { type: 'true_false', stem: '标注任务的标注规范可以由标注员自行随意修改。', answer: false, kp: '职业素养', difficulty: 1 },
  { type: 'true_false', stem: '在团队协作中，标注员应严格按照标注规范执行，遇到疑问及时沟通。', answer: true, kp: '职业素养', difficulty: 1 },

  // ─── 综合理解 ───
  { type: 'single_choice', stem: '以下哪个指标用于评估分类标注的精确率和召回率的综合表现？', options: ['F1 Score', 'CPU 使用率', '磁盘空间', '网络延迟'], answer: 'A', kp: '标注质量', difficulty: 3 },
  { type: 'single_choice', stem: '在数据标注项目中，"标准答案"（Answer Key）通常存储在哪里？', options: ['标注员的电脑本地', '数据库的 answer_key 字段', '标注工具的界面标题', '图片的文件名'], answer: 'B', kp: '系统认知', difficulty: 2 },
  { type: 'true_false', stem: '换图片或换标注坐标时，只需要更新数据库中的 answer_key 字段，评分逻辑无需修改。', answer: true, kp: '系统认知', difficulty: 2 },
  { type: 'true_false', stem: '所有评分器只接收 submission（学员提交）和 answerKey（标准答案）两个参数。', answer: true, kp: '系统认知', difficulty: 2 },
];

const client = new pg.Client({ connectionString: await getDbUrl() });
await client.connect();
try {
  const orgResult = await client.query<{ id: string }>("SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1");
  const organizationId = orgResult.rows[0]?.id;
  if (!organizationId) throw new Error('没有可用机构，请先运行 seed-core.mts');

  let practiceInserted = 0, examInserted = 0, skipped = 0;
  await client.query('BEGIN');
  for (const q of questions) {
    const options: Record<string, string> = {};
    let answerKey: unknown;
    if (q.type === 'single_choice') {
      q.options.forEach((text, i) => { options[String.fromCharCode(65 + i)] = text; });
      answerKey = q.answer;
    } else {
      answerKey = q.answer;
    }
    const contentHash = q.stem.replace(/\s+/g, '').toLowerCase();

    // practice/exam 各自查重、各自插入:两库一旦漂移(单侧被删/经导入器先入库)仍能对账补齐。
    const pExisting = await client.query("SELECT 1 FROM practice_question_items WHERE organization_id=$1 AND regexp_replace(lower(stem),'\\s+','','g')=$2 LIMIT 1",
      [organizationId, contentHash]);
    const eExisting = await client.query("SELECT 1 FROM exam_question_items WHERE organization_id=$1 AND regexp_replace(lower(stem),'\\s+','','g')=$2 LIMIT 1",
      [organizationId, contentHash]);
    if (pExisting.rowCount && eExisting.rowCount) { skipped++; continue; }
    if (!pExisting.rowCount) {
    await client.query(
      `INSERT INTO practice_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,legal_review_required,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,NULL,$6,$7,'batch_seed','published',1,true,false,NOW(),NOW())`,
      [organizationId, q.type, q.stem, options, JSON.stringify(answerKey), q.kp, q.difficulty],
    );
    practiceInserted++;
    }

    // exam (same content, eligible_for_formal_exam=true)
    if (!eExisting.rowCount) {
    await client.query(
      `INSERT INTO exam_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,eligible_for_formal_exam,legal_review_required,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,NULL,$6,$7,'batch_seed','published',1,false,true,false,NOW(),NOW())`,
      [organizationId, q.type, q.stem, options, JSON.stringify(answerKey), q.kp, q.difficulty],
    );
    examInserted++;
    }
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ total: questions.length, practiceInserted, examInserted, skipped }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
