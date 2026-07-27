import { requireRole } from '@/server/auth';
import { dbTx, dbOne } from '@/server/db';
import { insertAudit } from '@/server/audit';
import { handler, ok, fail } from '@/lib/api';

/**
 * POST /api/admin/seed-excel-comprehensive
 * 管理员一键导入"Excel 综合操作题"(excel_comprehensive) 到当前环境数据库。
 * 同时写入 practice_task_templates 和 exam_task_templates。
 * 跳过已存在（同标题）的任务模板，不会清除已有数据。
 */
export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin']);

  const orgRow = await dbOne<{ id: string }>(
    "SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1",
  );
  if (!orgRow) return fail(500, '没有可用机构，请先初始化系统');
  const organizationId = orgRow.id;

  const result = await dbTx(async (client) => {
    let practiceInserted = 0;
    let examInserted = 0;
    let skipped = 0;

    for (const t of EXCEL_COMP_TASKS) {
      // 跳过已存在（practice 侧按标题判重）
      const pExisting = await client.query(
        `SELECT 1 FROM practice_task_templates WHERE organization_id=$1 AND title=$2 AND deleted_at IS NULL LIMIT 1`,
        [organizationId, t.title],
      );
      if (pExisting.rowCount) {
        skipped++;
        continue;
      }

      await client.query(
        `INSERT INTO practice_task_templates
          (organization_id,task_type,title,instructions,difficulty,config,answer_key,grading_config,practice_only,review_status,published_version,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,'published',1,NOW(),NOW())`,
        [
          organizationId,
          t.taskType,
          t.title,
          t.instructions,
          t.difficulty,
          t.config,
          t.answerKey,
          {},
        ],
      );
      practiceInserted++;

      await client.query(
        `INSERT INTO exam_task_templates
          (organization_id,task_type,title,instructions,difficulty,config,answer_key,grading_config,practice_only,eligible_for_formal_exam,review_status,published_version,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,true,'published',1,NOW(),NOW())`,
        [
          organizationId,
          t.taskType,
          t.title,
          t.instructions,
          t.difficulty,
          t.config,
          t.answerKey,
          {},
        ],
      );
      examInserted++;
    }

    return { total: EXCEL_COMP_TASKS.length, practiceInserted, examInserted, skipped };
  });

  await insertAudit({
    actorId: user.id,
    action: 'task.import',
    entityType: 'excel_comprehensive_tasks',
    entityId: 'batch',
    details: JSON.stringify({ organizationId, ...result, source: 'excel_comp_seed' }),
  });

  return ok(result);
});

type ExcelCompTask = {
  taskType: string;
  title: string;
  instructions: string;
  difficulty: number;
  config: Record<string, unknown>;
  answerKey: Record<string, unknown>;
};

const EXCEL_COMP_TASKS: ExcelCompTask[] = [
  {
    taskType: 'excel_comprehensive',
    title: 'Excel 综合操作：学生成绩统计表',
    instructions:
      '请使用表格工具栏完成以下操作：1) 设置表格边框；2) 点击"求班级"用公式从学号提取班级；3) 点击"排序"按班级降序、总分降序排列；4) 点击"分类汇总"按班级求各科平均值；5) 标题行填充蓝色；6) 成绩保留两位小数。',
    difficulty: 2,
    config: {
      columns: ['学号', '姓名', '班级', '语文', '数学', '英语', '生物', '地理', '历史', '政治', '总分'],
      rowIds: ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08'],
      dataRows: [
        ['120305', '李北大', '', '85', '92', '78', '88', '90', '82', '76', ''],
        ['120203', '陈万地', '', '91', '88', '95', '93', '87', '90', '85', ''],
        ['120104', '王大力', '', '76', '82', '70', '72', '85', '78', '80', ''],
        ['120205', '赵小华', '', '88', '95', '92', '90', '93', '86', '89', ''],
        ['120301', '孙明明', '', '95', '91', '88', '94', '86', '92', '90', ''],
        ['120102', '周红梅', '', '70', '75', '68', '72', '80', '74', '77', ''],
        ['120302', '吴志强', '', '82', '89', '85', '87', '91', '83', '79', ''],
        ['120201', '郑秀丽', '', '93', '96', '90', '95', '88', '91', '94', ''],
      ],
      classColumnIndex: 2,
      scoreColumnIndices: [3, 4, 5, 6, 7, 8, 9],
      totalColumnIndex: 10,
      colorOptions: ['蓝色', '红色', '绿色', '黄色'],
    },
    answerKey: {
      classColumnIndex: 2,
      formulaResults: {
        s01: '3班',
        s02: '2班',
        s03: '1班',
        s04: '2班',
        s05: '3班',
        s06: '1班',
        s07: '3班',
        s08: '2班',
      },
      sortedRowOrder: ['s05', 's07', 's01', 's04', 's08', 's02', 's03', 's06'],
      headerColor: '蓝色',
      decimalPlaces: 2,
      summaryAverages: [
        {
          key: '3班',
          averages: {
            3: String((95 + 82 + 85) / 3),
            4: String((91 + 89 + 92) / 3),
            5: String((88 + 85 + 78) / 3),
            6: String((94 + 87 + 88) / 3),
            7: String((86 + 91 + 90) / 3),
            8: String((92 + 83 + 82) / 3),
            9: String((90 + 79 + 76) / 3),
          },
        },
        {
          key: '2班',
          averages: {
            3: String((88 + 93 + 91) / 3),
            4: String((95 + 96 + 88) / 3),
            5: String((92 + 90 + 95) / 3),
            6: String((90 + 95 + 93) / 3),
            7: String((93 + 88 + 87) / 3),
            8: String((86 + 91 + 90) / 3),
            9: String((89 + 94 + 85) / 3),
          },
        },
        {
          key: '1班',
          averages: {
            3: String((76 + 70) / 2),
            4: String((82 + 75) / 2),
            5: String((70 + 68) / 2),
            6: String((72 + 72) / 2),
            7: String((85 + 80) / 2),
            8: String((78 + 74) / 2),
            9: String((80 + 77) / 2),
          },
        },
      ],
      numericTolerance: 0.5,
    },
  },
];
