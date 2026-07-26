import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { fail, catchError } from '@/lib/api';
import { insertAudit } from '@/server/audit';

/**
 * GET /api/admin/reports/export?type=scores|progress&format=csv|xlsx
 *
 * 报表同步导出(数据量小, 不走 export_jobs 异步表)。
 * - type=scores:   成绩明细(每个学员每场考试一行)
 * - type=progress: 学员练习进度(口径与 /api/teacher/progress 一致: 每题只计最近一次作答)
 * 权限对齐菜单: super_admin/school_admin/auditor; school_admin 只看本机构。
 */

const SCORE_STATUS_LABELS: Record<string, string> = {
  pending: '待评分', auto_graded: '已评分', reviewed: '已复核', published: '已发布', void: '作废',
};

type Row = (string | number | null)[];

interface ExportData { headers: string[]; rows: Row[]; sheetName: string; fileBase: string }

async function buildScores(scopedOrg: string | null): Promise<ExportData> {
  const rows = await dbQuery<{
    display_name: string; student_no: string | null; cohort_name: string; exam_title: string;
    total_score: string; max_score: string; passed: boolean; status: string; submitted_at: string | null;
  }>(
    `SELECT p.display_name, p.student_no, c.name AS cohort_name, s.title AS exam_title,
            es.total_score::text, es.max_score::text, es.passed, es.status, a.submitted_at::text
       FROM exam_scores es
       JOIN exam_attempts a ON a.id = es.attempt_id
       JOIN profiles p ON p.id = es.user_id
       JOIN exam_schedules s ON s.id = es.schedule_id AND s.deleted_at IS NULL
       JOIN cohorts c ON c.id = s.cohort_id
      WHERE ($1::varchar IS NULL OR s.organization_id = $1)
      ORDER BY s.exam_start_at DESC, c.name, p.display_name`,
    scopedOrg,
  );
  return {
    sheetName: '成绩明细',
    fileBase: '成绩明细',
    headers: ['姓名', '学号', '班级', '考试', '总分', '满分', '是否通过', '成绩状态', '交卷时间'],
    rows: rows.map(r => [
      r.display_name, r.student_no ?? '', r.cohort_name, r.exam_title,
      Number(r.total_score), Number(r.max_score), r.passed ? '通过' : '未通过',
      SCORE_STATUS_LABELS[r.status] ?? r.status,
      r.submitted_at ? new Date(r.submitted_at).toLocaleString('zh-CN', { hour12: false }) : '',
    ]),
  };
}

async function buildProgress(scopedOrg: string | null): Promise<ExportData> {
  // 与 /api/teacher/progress 同口径: 同一题多次作答只计最近一次; 分母为去重布置题数。
  const rows = await dbQuery<{
    display_name: string; student_no: string | null; cohort_name: string;
    assignment_count: string; attempted_count: string; passed_count: string;
    practice_score_rate: string | null; exam_score_rate: string | null; last_activity_at: string | null;
  }>(
    `WITH assign_items AS (
       SELECT DISTINCT cohort_id, item_type, item_id FROM practice_assignments
     ),
     latest AS (
       SELECT DISTINCT ON (user_id, item_type, item_id)
              user_id, item_type, item_id, score, max_score, passed, updated_at
         FROM practice_attempts
        ORDER BY user_id, item_type, item_id, submitted_at DESC NULLS LAST, updated_at DESC
     ),
     exam_avg AS (
       SELECT sc.user_id, AVG(CASE WHEN sc.max_score > 0 THEN sc.total_score / sc.max_score * 100 END) AS rate
         FROM exam_scores sc
         JOIN exam_schedules es ON es.id = sc.schedule_id
        WHERE ($1::varchar IS NULL OR es.organization_id = $1)
        GROUP BY sc.user_id
     )
     SELECT p.display_name, p.student_no, c.name AS cohort_name,
            COUNT(ai.item_id)::text AS assignment_count,
            COUNT(l.item_id)::text AS attempted_count,
            COUNT(l.item_id) FILTER (WHERE l.passed)::text AS passed_count,
            AVG(CASE WHEN l.max_score > 0 THEN l.score / l.max_score * 100 END)::text AS practice_score_rate,
            ea.rate::text AS exam_score_rate,
            MAX(l.updated_at)::text AS last_activity_at
       FROM profiles p
       JOIN enrollments e ON e.user_id = p.id AND e.status = 'active'
       JOIN cohorts c ON c.id = e.cohort_id AND c.deleted_at IS NULL
       LEFT JOIN assign_items ai ON ai.cohort_id = c.id
       LEFT JOIN latest l ON l.user_id = p.id AND l.item_type = ai.item_type AND l.item_id = ai.item_id
       LEFT JOIN exam_avg ea ON ea.user_id = p.id
      WHERE p.status = 'active' AND ($1::varchar IS NULL OR c.organization_id = $1)
      GROUP BY p.id, c.id, c.name, ea.rate
      ORDER BY c.name, p.display_name`,
    scopedOrg,
  );
  return {
    sheetName: '学员练习进度',
    fileBase: '学员练习进度',
    headers: ['姓名', '学号', '班级', '布置题数', '已作答', '通过数', '覆盖率%', '练习得分率%', '考试得分率%', '最近练习时间'],
    rows: rows.map(r => {
      const assigned = Number(r.assignment_count);
      const attempted = Number(r.attempted_count);
      return [
        r.display_name, r.student_no ?? '', r.cohort_name,
        assigned, attempted, Number(r.passed_count),
        assigned ? Math.round(attempted / assigned * 100) : 0,
        r.practice_score_rate === null ? '' : Math.round(Number(r.practice_score_rate)),
        r.exam_score_rate === null ? '' : Math.round(Number(r.exam_score_rate)),
        r.last_activity_at ? new Date(r.last_activity_at).toLocaleString('zh-CN', { hour12: false }) : '',
      ];
    }),
  };
}

/**
 * 公式注入防护: 以 = + - @ Tab CR 开头的单元格, Excel/WPS 打开时会按公式执行
 * (=HYPERLINK 外发数据、DDE 命令执行等)。姓名/学号/班级均为用户可控字符串, 必须清洗。
 * XLSX 同样需要: exceljs 会把以 = 开头的字符串自动识别为公式单元格。
 */
function sanitizeFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csvCell(value: string | number | null): string {
  const s = value === null ? '' : sanitizeFormula(String(value));
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(data: ExportData): string {
  const lines = [data.headers, ...data.rows].map(cols => cols.map(csvCell).join(','));
  // BOM 保证 Excel/WPS 打开 UTF-8 中文不乱码。
  return '﻿' + lines.join('\r\n');
}

async function toXlsx(data: ExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(data.sheetName);
  sheet.columns = data.headers.map(h => ({ header: h, width: Math.max(12, h.length * 2 + 6) }));
  sheet.getRow(1).font = { bold: true };
  for (const row of data.rows) {
    sheet.addRow(row.map(v => (typeof v === 'string' ? sanitizeFormula(v) : v ?? '')));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin', 'school_admin', 'auditor']);
    const p = new URL(request.url).searchParams;
    const type = p.get('type');
    const format = p.get('format');
    if (type !== 'scores' && type !== 'progress') return fail(400, 'type 必须是 scores 或 progress');
    if (format !== 'csv' && format !== 'xlsx') return fail(400, 'format 必须是 csv 或 xlsx');

    const scopedOrg = user.roles.includes('school_admin') && !user.roles.includes('super_admin') ? user.organizationId : null;
    const data = type === 'scores' ? await buildScores(scopedOrg) : await buildProgress(scopedOrg);

    // 同步导出全量进内存, 设软上限防止数据增长后 OOM; 超限时引导走筛选/异步导出。
    const MAX_EXPORT_ROWS = 50000;
    if (data.rows.length > MAX_EXPORT_ROWS) {
      return fail(413, `导出数据量(${data.rows.length} 行)超过上限 ${MAX_EXPORT_ROWS} 行, 请联系管理员分批导出`);
    }

    await insertAudit({
      actorId: user.id, actorRole: user.roles[0], action: 'report.export',
      entityType: 'report', entityId: null,
      details: `导出${data.sheetName}(${format}), 共 ${data.rows.length} 行`,
      organizationId: scopedOrg,
    });

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${data.fileBase}-${date}.${format}`;
    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
    if (format === 'csv') {
      return new Response(toCsv(data), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': disposition },
      });
    }
    const buffer = await toXlsx(data);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': disposition,
      },
    });
  } catch (error) {
    return catchError(error);
  }
}
