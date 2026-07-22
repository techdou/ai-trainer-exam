/**
 * 实操任务模板种子数据
 * 创建 6 类实操任务模板 + 对应的素材版本
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const root = path.resolve(process.cwd());

async function loadModule<T>(rel: string): Promise<T> {
  return (await import(pathToFileURL(path.join(root, rel)).href)) as T;
}

const { getDbUrl } = await loadModule<typeof import("coze-coding-dev-sdk")>('node_modules/coze-coding-dev-sdk/dist/esm/index.mjs');

const ORG_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  const dbUrl = getDbUrl();
  if (!dbUrl) { console.error('No DB URL'); process.exit(1); }
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  // 实操任务模板数据
  const templates = [
    {
      id: 'tpl-excel-delete',
      task_type: 'excel_delete_rows',
      title: 'Excel 数据清洗——删除不合格行',
      instructions: '请检查表格中的每一行数据，删除不符合要求的数据行。点击行号选中后，点击"删除选中行"按钮。',
      difficulty: 1,
      config: JSON.stringify({
        columns: ['序号', '姓名', '年龄', '成绩', '备注'],
        dataRows: [
          ['1', '张三', '25', '85', '正常'],
          ['2', '李四', '-5', '92', '年龄异常'],
          ['3', '王五', '22', '-10', '成绩异常'],
          ['4', '赵六', '28', '78', '正常'],
          ['5', '', '30', '90', '姓名缺失'],
          ['6', '钱七', '19', '88', '正常'],
          ['7', '孙八', '35', '200', '成绩异常'],
          ['8', '周九', '24', '76', '正常'],
        ],
        instructions: '删除以下数据行：年龄为负数、成绩为负数或超过100、姓名为空的行。',
      }),
      answer_key: JSON.stringify({
        correctRetainedRowIndexes: [0, 3, 5, 7],
      }),
    },
    {
      id: 'tpl-stats-table',
      task_type: 'stats_table',
      title: '运维统计表填写',
      instructions: '请根据给定的原始数据，在统计表的空白单元格中填入正确的计算结果。',
      difficulty: 2,
      config: JSON.stringify({
        columns: ['指标', '1月', '2月', '3月', '合计', '月均'],
        rows: [
          ['服务器在线率', '99.5%', '99.8%', '99.2%', '', ''],
          ['故障次数', '3', '1', '5', '', ''],
          ['平均响应时间(ms)', '120', '105', '135', '', ''],
        ],
        editableCells: ['E2', 'F2', 'E3', 'F3', 'E4', 'F4'],
        instructions: '合计=1月+2月+3月；月均=合计÷3（保留1位小数）',
      }),
      answer_key: JSON.stringify({
        correctCells: { E2: '99.50%', F2: '99.50%', E3: 9, F3: 3, E4: 360, F4: 120 },
        numericTolerance: 0.1,
      }),
    },
    {
      id: 'tpl-file-classify',
      task_type: 'file_classify',
      title: '文件分类整理',
      instructions: '请将以下文件按照类型分类到对应的文件夹中。',
      difficulty: 1,
      config: JSON.stringify({
        categories: ['图片文件', '文本文件', '表格文件', '音频文件'],
        files: [
          { name: '产品照片.jpg', size: '2.3MB' },
          { name: '销售数据.xlsx', size: '156KB' },
          { name: '会议记录.docx', size: '45KB' },
          { name: '背景音乐.mp3', size: '5.1MB' },
          { name: '流程图.png', size: '890KB' },
          { name: '客户名单.csv', size: '23KB' },
          { name: '培训讲义.pdf', size: '3.2MB' },
          { name: '产品演示.wav', size: '12MB' },
        ],
        instructions: '将每个文件拖放到正确的分类中。',
      }),
      answer_key: JSON.stringify({
        correctClassifications: {
          '产品照片.jpg': '图片文件',
          '销售数据.xlsx': '表格文件',
          '会议记录.docx': '文本文件',
          '背景音乐.mp3': '音频文件',
          '流程图.png': '图片文件',
          '客户名单.csv': '表格文件',
          '培训讲义.pdf': '文本文件',
          '产品演示.wav': '音频文件',
        },
      }),
    },
    {
      id: 'tpl-image-clean',
      task_type: 'image_clean',
      title: '图片数据清洗',
      instructions: '请检查每张图片，判断其是否可用于AI训练数据集。',
      difficulty: 2,
      config: JSON.stringify({
        images: [
          { id: 'img-1', description: '清晰的产品正面照片', issues: [] },
          { id: 'img-2', description: '严重模糊无法辨认的照片', issues: ['模糊'] },
          { id: 'img-3', description: '正常街景照片', issues: [] },
          { id: 'img-4', description: '完全过曝的白色图片', issues: ['过曝'] },
          { id: 'img-5', description: '清晰的食物照片', issues: [] },
          { id: 'img-6', description: '被水印覆盖大半的图片', issues: ['水印'] },
        ],
        instructions: '保留可用的清晰图片，丢弃有质量问题的图片（模糊、过曝、大水印等）。',
      }),
      answer_key: JSON.stringify({
        correctDecisions: {
          'img-1': 'keep',
          'img-2': 'discard',
          'img-3': 'keep',
          'img-4': 'discard',
          'img-5': 'keep',
          'img-6': 'discard',
        },
      }),
    },
    {
      id: 'tpl-image-annotate',
      task_type: 'image_annotation',
      title: '图片目标标注',
      instructions: '请在图片中用矩形框标注出指定的目标对象。',
      difficulty: 3,
      config: JSON.stringify({
        imageUrl: '/sample-street.jpg',
        targetLabels: ['行人', '汽车', '自行车'],
        instructions: '为图片中每个可见的目标画一个矩形框，并选择正确的标签。',
      }),
      answer_key: JSON.stringify({
        boxes: [
          { x: 100, y: 200, width: 80, height: 160, label: '行人' },
          { x: 300, y: 250, width: 150, height: 100, label: '汽车' },
        ],
        iouThreshold: 0.4,
      }),
    },
    {
      id: 'tpl-text-sentiment',
      task_type: 'text_sentiment',
      title: '文本情感标注',
      instructions: '请阅读每段文本，判断其情感倾向。',
      difficulty: 2,
      config: JSON.stringify({
        texts: [
          { id: 't1', content: '今天天气真好，心情特别愉快！' },
          { id: 't2', content: '服务质量太差了，非常不满意。' },
          { id: 't3', content: '会议定在下午3点，请准时参加。' },
          { id: 't4', content: '这部电影太精彩了，强烈推荐！' },
          { id: 't5', content: '快递又延迟了，等了好几天都没到。' },
        ],
        labels: ['正面', '负面', '中性'],
        instructions: '为每段文本选择正确的情感标签。',
      }),
      answer_key: JSON.stringify({
        correctSentiments: { t1: '正面', t2: '负面', t3: '中性', t4: '正面', t5: '负面' },
      }),
    },
  ];

  for (const tpl of templates) {
    await client.query(`
      INSERT INTO practice_task_templates (id, organization_id, task_type, title, instructions, difficulty, config, answer_key, practice_only, review_status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'published', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        instructions = EXCLUDED.instructions,
        config = EXCLUDED.config,
        answer_key = EXCLUDED.answer_key,
        updated_at = NOW()
    `, [tpl.id, ORG_ID, tpl.task_type, tpl.title, tpl.instructions, tpl.difficulty, tpl.config, tpl.answer_key]);
    console.log(`  ✓ 模板: ${tpl.title}`);
  }

  // 为每个模板创建素材版本
  for (const tpl of templates) {
    const assetId = `asset-${tpl.id}-v1`;
    await client.query(`
      INSERT INTO practice_asset_versions (id, asset_kind, object_key, checksum, version, status, meta, created_at, updated_at)
      VALUES ($1, 'practice_task_config', $2, $3, 1, 'active', $4, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET meta = EXCLUDED.meta, updated_at = NOW()
    `, [assetId, `${tpl.id}/config.json`, `seed-${tpl.id}`, tpl.config]);
    console.log(`  ✓ 素材版本: ${assetId}`);
  }

  // 为每个模板创建一个练习作业（分配给默认班级）
  const cohortId = '00000000-0000-0000-0000-000000000002'; // 默认班级
  for (const tpl of templates) {
    const assignId = `assign-${tpl.id}`;
    await client.query(`
      INSERT INTO practice_assignments (id, cohort_id, item_type, item_id, title, assigned_by, created_at)
      VALUES ($1, $2, 'task_template', $3, $4, 'system', NOW())
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
    `, [assignId, cohortId, tpl.id, tpl.title]);
    console.log(`  ✓ 作业: ${tpl.title}`);
  }

  await client.end();
  console.log('\n实操任务模板种子数据完成！');
}

main().catch(e => { console.error(e); process.exit(1); });
