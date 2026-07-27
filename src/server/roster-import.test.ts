import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseRoster } from './roster-import';

describe('名册 XLSX 解析', () => {
  it('使用 ExcelJS 读取标准名册并提取班级和学员', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('名册');
    worksheet.addRow(['长春市南关区2026年第（021）期人工智能训练师']);
    worksheet.addRow(['培训单位']);
    worksheet.addRow(['序号', '姓名', '性别', '公民身份号码', '联系电话']);
    worksheet.addRow([1, '测试学员', '女', '11010519491231002X', '13800000000']);
    const arrayBuffer = await workbook.xlsx.writeBuffer();

    const parsed = await parseRoster(arrayBuffer);

    expect(parsed.cohortName).toBe('2026年第021期');
    expect(parsed.students).toHaveLength(1);
    expect(parsed.students[0]).toMatchObject({
      name: '测试学员',
      idCard: '11010519491231002X',
      phone: '13800000000',
    });
  });
});
