/**
 * 考试专属题库扩充(2026-09-01): 只写 exam_task_templates, 练习库不可见, 消除"练过=见过"的考题泄露。
 *
 * 内容:
 *   - Excel 综合 ×3(答案由代码从 dataRows 计算, 杜绝手写错; 排序逻辑与作答按钮
 *     applySort 完全一致: 班级字符串降序 localeCompare('zh-CN') + 数值列总和降序)
 *   - 音频转写 ×3(MiMo TTS 生成, 文案即判分答案, 语气词自动抽取)
 *   - 标注 ×10(新素材图, 粗估坐标仅作校准起点; review_status='needs_revision'
 *     不入卷, 待管理后台校准答案后发布)
 *
 * 幂等: 按固定 id 插入, 已存在则跳过。用法: npx tsx scripts/db/seed-exam-only.mts
 */
import { loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
import pg from 'pg';

loadEnv();
loadEnvLocal();

const db = new pg.Client({ connectionString: process.env.PGDATABASE_URL });
await db.connect();

// ─────────────── 公共: 班级推导与答案计算(与组件 deriveClassOf/applySort/applySummary 同构) ───────────────
const derive = (sid: string) => { const m = /^\d{2}(\d{1,2})/.exec(sid); return m ? `${parseInt(m[1], 10)}班` : ''; };
const totalOf = (row: string[], scoreCols: number[]) => scoreCols.reduce((s, ci) => s + (parseFloat(String(row[ci] ?? '')) || 0), 0);

interface ExcelSpec {
  key: string; title: string; instructions: string;
  columns: string[]; rowIds: string[]; dataRows: string[][]; scoreCols: number[];
}
function buildExcelAnswer(spec: ExcelSpec) {
  const { dataRows, rowIds, scoreCols } = spec;
  const formulaResults: Record<string, string> = {};
  dataRows.forEach((r, i) => { formulaResults[rowIds[i]] = derive(String(r[0])); });
  const sortedRowOrder = dataRows
    .map((r, i) => ({ rid: rowIds[i], cls: derive(String(r[0])), total: totalOf(r, scoreCols) }))
    .sort((a, b) => (a.cls !== b.cls ? b.cls.localeCompare(a.cls, 'zh-CN') : b.total - a.total))
    .map(x => x.rid);
  const classes = [...new Set(dataRows.map(r => derive(String(r[0]))) )].sort();
  const summaryAverages = classes.map(cn => {
    const group = dataRows.filter(r => derive(String(r[0])) === cn);
    const averages: Record<string, number> = {};
    for (const ci of scoreCols) averages[String(ci)] = Math.round(group.reduce((s, r) => s + (parseFloat(String(r[ci] ?? '')) || 0), 0) / group.length * 100) / 100;
    return { key: cn, averages };
  });
  return { formulaResults, sortedRowOrder, summaryAverages, headerColor: '蓝色', decimalPlaces: 2, numericTolerance: 0.5 };
}

// ─────────────── Excel 综合 ×3 ───────────────
const excelSpecs: ExcelSpec[] = [
  {
    key: 'excel-exam-pe', title: 'Excel 综合操作：学生体测成绩统计表',
    instructions: '请完成以下操作：1) 框选整个表格后点击「加边框」；2) 点击「求班级」从学号自动提取班级；3) 点击「排序」按班级降序、总分降序排列；4) 点击「分类汇总」按班级求各项目平均值；5) 框选标题行，颜色选「蓝色」后点击「填充颜色」；6) 点击「两位小数」将各项目成绩保留两位小数。',
    columns: ['学号', '姓名', '班级', '体重分', '肺活量分', '跑步分', '跳远分', '总分'],
    rowIds: ['t01', 't02', 't03', 't04', 't05', 't06', 't07', 't08', 't09'],
    scoreCols: [3, 4, 5, 6],
    dataRows: [
      ['230102', '刘一诺', '', '82', '78', '85', '80', ''],
      ['230204', '陈子涵', '', '90', '88', '76', '92', ''],
      ['230301', '王浩然', '', '75', '82', '90', '78', ''],
      ['230103', '李思远', '', '88', '75', '82', '86', ''],
      ['230302', '赵雨桐', '', '79', '91', '88', '84', ''],
      ['230201', '孙嘉懿', '', '93', '86', '79', '90', ''],
      ['230303', '周子墨', '', '81', '89', '92', '77', ''],
      ['230202', '吴亦可', '', '86', '84', '81', '88', ''],
      ['230101', '郑清妍', '', '77', '80', '86', '83', ''],
    ],
  },
  {
    key: 'excel-exam-training', title: 'Excel 综合操作：员工培训考核统计表',
    instructions: '请完成以下操作：1) 框选整个表格后点击「加边框」；2) 点击「求班级」从工号自动提取培训班级；3) 点击「排序」按班级降序、总分降序排列；4) 点击「分类汇总」按班级求各科目平均值；5) 框选标题行，颜色选「蓝色」后点击「填充颜色」；6) 点击「两位小数」将各科目成绩保留两位小数。',
    columns: ['工号', '姓名', '班级', '出勤', '理论', '实操', '协作', '总分'],
    rowIds: ['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08', 'p09'],
    scoreCols: [3, 4, 5, 6],
    dataRows: [
      ['240101', '何静怡', '', '85', '90', '78', '82', ''],
      ['240203', '罗志伟', '', '78', '85', '92', '80', ''],
      ['240302', '高梦洁', '', '90', '76', '85', '88', ''],
      ['240102', '林嘉树', '', '83', '88', '80', '85', ''],
      ['240301', '黄子韬', '', '76', '82', '90', '79', ''],
      ['240201', '徐若琳', '', '92', '79', '84', '91', ''],
      ['240103', '马浩宇', '', '80', '86', '88', '77', ''],
      ['240202', '宋雨薇', '', '87', '91', '75', '89', ''],
      ['240303', '唐子昂', '', '84', '80', '83', '86', ''],
    ],
  },
  {
    key: 'excel-exam-club', title: 'Excel 综合操作：社团活动评分统计表',
    instructions: '请完成以下操作：1) 框选整个表格后点击「加边框」；2) 点击「求班级」从编号自动提取班级；3) 点击「排序」按班级降序、总分降序排列；4) 点击「分类汇总」按班级求各项目平均值；5) 框选标题行，颜色选「蓝色」后点击「填充颜色」；6) 点击「两位小数」将各项目评分保留两位小数。',
    columns: ['编号', '姓名', '班级', '纪律', '参与', '作品', '展示', '总分'],
    rowIds: ['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09'],
    scoreCols: [3, 4, 5, 6],
    dataRows: [
      ['250101', '冯芷晴', '', '88', '82', '90', '79', ''],
      ['250203', '杜宇轩', '', '81', '90', '77', '86', ''],
      ['250302', '蒋依依', '', '79', '85', '88', '91', ''],
      ['250102', '沈子琪', '', '90', '78', '84', '82', ''],
      ['250201', '曹俊杰', '', '85', '88', '91', '77', ''],
      ['250301', '袁梦琪', '', '77', '84', '79', '89', ''],
      ['250103', '邓紫萱', '', '86', '91', '83', '80', ''],
      ['250202', '许墨白', '', '82', '80', '87', '92', ''],
      ['250303', '傅思颖', '', '89', '86', '78', '85', ''],
    ],
  },
];

// ─────────────── 音频转写 ×3 ───────────────
const FILLERS = ['嗯', '啊', '哦', '呀', '呢', '啦', '咦', '哇', '哎'];
const audioSpecs = [
  { key: 'audio-exam-01', title: '听写转写：素材去重讨论', audioUrl: '/training/audio/exam-trans-01.wav',
    text: '嗯，这批发来的图片素材里，有好几张都是重复的呀，得先做一遍去重才行呢。' },
  { key: 'audio-exam-02', title: '听写转写：数据清洗感慨', audioUrl: '/training/audio/exam-trans-02.wav',
    text: '哇，原来训练模型之前，数据还要清洗这么多步骤啊，我今天算是长见识了哦。' },
  { key: 'audio-exam-03', title: '听写转写：标注框讨论', audioUrl: '/training/audio/exam-trans-03.wav',
    text: '哎，你说这个标注框是不是画大了一点啊，看着好像把旁边的椅子也框进去了呢。' },
];

// ─────────────── 标注 ×10(needs_revision 待校准, 坐标为粗估起点) ───────────────
// 素材粗估位置(2026-09-01 视觉验收): cone x.15-.40/y.25-.60; drone x.20-.80/y.30-.70;
// hydrant x.30-.70/y.02-.60; scooter x.20-.80/y.10-.90; park 行人(.198,.404,.305,.862)
// 自行车(.478,.638,.755,.942) 指示牌(.726,.047,.838,.231)
function rectPolygon(x: number, y: number, w: number, h: number) {
  return [ { x, y }, { x: x + w / 2, y }, { x: x + w, y }, { x: x + w, y: y + h / 2 }, { x: x + w, y: y + h }, { x: x + w / 2, y: y + h }, { x, y: y + h }, { x, y: y + h / 2 } ];
}
const annotationSpecs = [
  { key: 'pgon-cone', type: 'polygon_annotation', title: '轮廓标注：交通锥桶外轮廓', img: '/training/gen/exam-cone-1.webp', labels: ['交通锥桶'], difficulty: 2,
    instructions: '用多边形沿交通锥桶的整体外轮廓进行标注，包含方形底座和锥形桶身。',
    answer: { iouThreshold: 0.4, polygons: [{ label: '交通锥桶', points: rectPolygon(0.16, 0.26, 0.23, 0.33) }] } },
  { key: 'poly-cone', type: 'polyline_annotation', title: '折线标注：锥桶左侧轮廓线', img: '/training/gen/exam-cone-1.webp', labels: ['锥桶轮廓线'], difficulty: 2,
    instructions: '从锥桶顶部沿左侧边缘画一条折线到底座左角。',
    answer: { distanceTolerance: 0.08, lines: [{ label: '锥桶轮廓线', points: [{ x: 0.275, y: 0.27 }, { x: 0.24, y: 0.38 }, { x: 0.21, y: 0.48 }, { x: 0.17, y: 0.57 }] }] } },
  { key: 'bbox-drone', type: 'image_annotation', title: '方框标注：悬停无人机', img: '/training/gen/exam-drone-1.webp', labels: ['无人机'], difficulty: 2,
    instructions: '用方框框出整架无人机，包含全部旋翼。',
    answer: { iouThreshold: 0.45, boxes: [{ x: 0.20, y: 0.30, width: 0.60, height: 0.40, label: '无人机' }] } },
  { key: 'pgon-drone', type: 'polygon_annotation', title: '轮廓标注：无人机机身轮廓', img: '/training/gen/exam-drone-1.webp', labels: ['无人机机身'], difficulty: 3,
    instructions: '用多边形沿无人机机身（不含旋翼桨叶）外轮廓进行标注。',
    answer: { iouThreshold: 0.4, polygons: [{ label: '无人机机身', points: rectPolygon(0.34, 0.42, 0.32, 0.16) }] } },
  { key: 'point-hydrant', type: 'point_annotation', title: '点标注：消防栓中心点', img: '/training/gen/exam-hydrant-1.webp', labels: ['消防栓'], difficulty: 1,
    instructions: '在消防栓主体的中心位置点击一个点，类别选择"消防栓"。',
    answer: { distanceTolerance: 0.05, points: [{ x: 0.50, y: 0.32, label: '消防栓' }] } },
  { key: 'pgon-hydrant', type: 'polygon_annotation', title: '轮廓标注：消防栓外轮廓', img: '/training/gen/exam-hydrant-1.webp', labels: ['消防栓'], difficulty: 3,
    instructions: '用多边形沿消防栓的整体外轮廓进行标注，包含顶部帽盖和两侧出水口。',
    answer: { iouThreshold: 0.4, polygons: [{ label: '消防栓', points: rectPolygon(0.31, 0.04, 0.38, 0.54) }] } },
  { key: 'poly-scooter', type: 'polyline_annotation', title: '折线标注：滑板车主干线', img: '/training/gen/exam-scooter-1.webp', labels: ['滑板车主干'], difficulty: 2,
    instructions: '从把手顶点开始，沿滑板车主干（立管+踏板）画一条折线到后轮后缘。',
    answer: { distanceTolerance: 0.08, lines: [{ label: '滑板车主干', points: [{ x: 0.56, y: 0.11 }, { x: 0.52, y: 0.35 }, { x: 0.48, y: 0.62 }, { x: 0.60, y: 0.70 }, { x: 0.76, y: 0.72 }] }] } },
  { key: 'pgon-scooter', type: 'polygon_annotation', title: '轮廓标注：滑板车外轮廓', img: '/training/gen/exam-scooter-1.webp', labels: ['滑板车'], difficulty: 3,
    instructions: '用多边形沿滑板车的整体外轮廓进行标注，包含前后轮。',
    answer: { iouThreshold: 0.4, polygons: [{ label: '滑板车', points: rectPolygon(0.21, 0.11, 0.58, 0.78) }] } },
  { key: 'bbox-park', type: 'image_annotation', title: '方框标注：街道多目标', img: '/training/gen/exam-park-1.webp', labels: ['行人', '自行车', '交通指示牌'], difficulty: 2,
    instructions: '用方框分别框出行人、自行车和交通指示牌，每个方框选择正确类别。',
    answer: { iouThreshold: 0.45, boxes: [
      { x: 0.198, y: 0.404, width: 0.107, height: 0.458, label: '行人' },
      { x: 0.478, y: 0.638, width: 0.277, height: 0.304, label: '自行车' },
      { x: 0.726, y: 0.047, width: 0.112, height: 0.184, label: '交通指示牌' },
    ] } },
  { key: 'point-park', type: 'point_annotation', title: '点标注：指示牌中心点', img: '/training/gen/exam-park-1.webp', labels: ['交通指示牌'], difficulty: 1,
    instructions: '在交通指示牌（蓝色圆形牌面）的中心位置点击一个点，类别选择"交通指示牌"。',
    answer: { distanceTolerance: 0.05, points: [{ x: 0.782, y: 0.139, label: '交通指示牌' }] } },
];

// ─────────────── 入库(仅 exam 表) ───────────────
let seq = 35;
const inserted: string[] = [];
const skipped: string[] = [];

async function insertTask(id: string, taskType: string, title: string, instructions: string, difficulty: number,
  config: Record<string, unknown>, answerKey: Record<string, unknown>, reviewStatus: 'published' | 'needs_revision') {
  const exists = await db.query('SELECT 1 FROM exam_task_templates WHERE id=$1', [id]);
  if (exists.rowCount) { skipped.push(title); return; }
  await db.query(
    `INSERT INTO exam_task_templates(id,organization_id,task_type,title,instructions,difficulty,config,answer_key,grading_config,practice_only,eligible_for_formal_exam,review_status,published_version,created_at,updated_at)
     VALUES($1,NULL,$2,$3,$4,$5,$6,$7,'{}'::jsonb,false,true,$8,1,NOW(),NOW())`,
    [id, taskType, title, instructions, difficulty, JSON.stringify(config), JSON.stringify(answerKey), reviewStatus],
  );
  inserted.push(title);
}

for (const spec of excelSpecs) {
  const id = `20000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;
  await insertTask(id, 'excel_comprehensive', spec.title, spec.instructions, 2,
    { columns: spec.columns, rowIds: spec.rowIds, dataRows: spec.dataRows, classColumnIndex: 2,
      scoreColumnIndices: spec.scoreCols, totalColumnIndex: spec.columns.length - 1,
      colorOptions: ['蓝色', '红色', '绿色', '黄色'] },
    buildExcelAnswer(spec), 'published');
}
for (const spec of audioSpecs) {
  const id = `20000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;
  const fillers = FILLERS.filter(f => spec.text.includes(f));
  await insertTask(id, 'audio_transcription', spec.title,
    '播放音频，把听到的全部内容写下来。"嗯、啊、哦"等语气助词也要写上。', 1,
    { audioUrl: spec.audioUrl },
    { correctTranscript: spec.text, requiredFillers: fillers, similarityThreshold: 0.8 }, 'published');
}
for (const spec of annotationSpecs) {
  const id = `20000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;
  const tool = spec.type === 'polygon_annotation' ? 'polygon' : spec.type === 'polyline_annotation' ? 'polyline' : spec.type === 'point_annotation' ? 'point' : 'bbox';
  await insertTask(id, spec.type, spec.title, spec.instructions, spec.difficulty,
    { imageUrl: spec.img, targetLabels: spec.labels, annotationTool: tool },
    spec.answer, 'needs_revision');
}

console.log(JSON.stringify({ inserted: inserted.length, skipped: skipped.length, titles: inserted }, null, 1));
await db.end();
