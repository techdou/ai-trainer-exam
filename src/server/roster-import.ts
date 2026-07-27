/**
 * 学员名册导入服务。
 * 解析标准格式 Excel 名册（吉林省职业技能培训学员名册），批量创建学员账号并关联班级。
 *
 * 名册格式约定：
 * - 第 1 行：标题行（含期数/工种信息，用于自动提取班级名）
 * - 第 2 行：培训单位/时间信息
 * - 第 3 行：表头（序号|姓名|性别|年龄|民族|公民身份号码|...）
 * - 第 4 行起：学员数据
 * - 最后一行：备注说明（自动跳过）
 */
import ExcelJS from 'exceljs';

export interface RosterStudent {
  name: string;
  gender: string;
  age: string;
  ethnicity: string;
  idCard: string;
  specialty: string;
  level: string;
  category: string;
  address: string;
  phone: string;
  remark: string;
}

export interface ParsedRoster {
  cohortName: string;
  students: RosterStudent[];
}

/** 从标题行提取班级名称，如"长春市南关区2026年第（021）期（人工智能训练师）..." → "2026年第021期" */
function extractCohortName(title: string): string {
  // 尝试匹配"20XX年第（NNN）期"
  const fullMatch = title.match(/(\d{4})\D*?第[（(]?(\d+)[)）]\s*期/);
  if (fullMatch) {
    return `${fullMatch[1]}年第${fullMatch[2]}期`;
  }
  // 回退：匹配"第（NNN）期"
  const periodMatch = title.match(/第[（(]?(\d+)[)）]\s*期/);
  if (periodMatch) {
    return `第${periodMatch[1]}期`;
  }
  // 最终回退：截取标题前 20 字符
  return title.slice(0, 20);
}

/** 在行数组中查找包含指定关键词的列索引 */
function findColumnIndex(headers: unknown[], keywords: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const cell = String(headers[i] ?? '').trim();
    if (keywords.some(kw => cell.includes(kw))) return i;
  }
  return -1;
}

/**
 * 解析 Excel 名册文件 Buffer。
 * 自动识别表头行并提取学员数据，容错处理合并单元格/空行。
 */
export async function parseRoster(fileBuffer: ArrayBuffer): Promise<ParsedRoster> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Excel 文件中没有工作表');
  if (worksheet.rowCount > 5000 || worksheet.columnCount > 100) {
    throw new Error('名册规模超过限制（最多 5000 行、100 列）');
  }

  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, row => {
    const values: string[] = [];
    for (let column = 1; column <= worksheet.columnCount; column++) {
      values[column - 1] = row.getCell(column).text.trim();
    }
    rows.push(values);
  });

  if (rows.length < 3) throw new Error('名册文件内容不足，至少需要标题行、表头行和 1 条学员数据');

  // 第 1 行是标题
  const title = String(rows[0]?.[0] ?? '').trim();
  const cohortName = extractCohortName(title);

  // 查找表头行（含"姓名"和"公民身份号码"）
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    const cells = row.map(c => String(c ?? '').trim());
    if (cells.some(c => c.includes('姓名')) && cells.some(c => c.includes('身份') || c.includes('身份证'))) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) throw new Error('无法识别表头行，请确保名册包含"姓名"和"公民身份号码"列');

  const headers = rows[headerRowIndex];

  const colName = findColumnIndex(headers, ['姓名']);
  const colGender = findColumnIndex(headers, ['性别']);
  const colAge = findColumnIndex(headers, ['年龄']);
  const colEthnicity = findColumnIndex(headers, ['民族']);
  const colIdCard = findColumnIndex(headers, ['身份', '身份证']);
  const colSpecialty = findColumnIndex(headers, ['工种', '专业']);
  const colLevel = findColumnIndex(headers, ['等级']);
  const colCategory = findColumnIndex(headers, ['人员类别']);
  const colAddress = findColumnIndex(headers, ['地址', '住址']);
  const colPhone = findColumnIndex(headers, ['电话', '联系']);
  const colRemark = findColumnIndex(headers, ['备注']);

  if (colName === -1) throw new Error('名册中未找到"姓名"列');
  if (colIdCard === -1) throw new Error('名册中未找到"公民身份号码"列');

  const students: RosterStudent[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const idCard = String(row[colIdCard] ?? '').trim();
    const name = String(row[colName] ?? '').trim();

    // 跳过空行和注脚行
    if (!idCard || !name) continue;
    // 身份证号格式校验: 18 位(老 15 位也接受), 末位为数字或 X
    if (!/^\d{17}[\dX]$/.test(idCard) && !/^\d{15}$/.test(idCard)) continue;
    // 18 位身份证校验位算法(GB 11643-1999), 拦截拼凑/手误的号码
    if (idCard.length === 18) {
      const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
      const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
      let sum = 0;
      for (let i = 0; i < 17; i++) sum += parseInt(idCard[i], 10) * weights[i];
      if (checkCodes[sum % 11] !== idCard[17].toUpperCase()) continue;
    }
    // 跳过"注："开头的注脚
    if (idCard.startsWith('注') || name.startsWith('注')) continue;

    students.push({
      name,
      gender: colGender >= 0 ? String(row[colGender] ?? '').trim() : '',
      age: colAge >= 0 ? String(row[colAge] ?? '').trim() : '',
      ethnicity: colEthnicity >= 0 ? String(row[colEthnicity] ?? '').trim() : '',
      idCard: idCard.toUpperCase(),
      specialty: colSpecialty >= 0 ? String(row[colSpecialty] ?? '').trim() : '',
      level: colLevel >= 0 ? String(row[colLevel] ?? '').trim() : '',
      category: colCategory >= 0 ? String(row[colCategory] ?? '').trim() : '',
      address: colAddress >= 0 ? String(row[colAddress] ?? '').trim() : '',
      phone: colPhone >= 0 ? String(row[colPhone] ?? '').trim() : '',
      remark: colRemark >= 0 ? String(row[colRemark] ?? '').trim() : '',
    });
  }

  if (students.length === 0) throw new Error('名册中未找到有效的学员数据');

  return { cohortName, students };
}

/** 身份证号 → 登录邮箱（全小写，兼容 Supabase Auth 大小写归一化）。 */
export function idCardToEmail(idCard: string): string {
  return `${idCard.toLowerCase()}@student.exam.local`;
}

/**
 * 身份证号 → 初始密码 = 身份证号后六位。
 *
 * 注意: 末位若为 X, 取后六位即含 X(如 ...238X49 → "38X49" 不足六位时取全部数字位)。
 * 身份证号最后 6 位本身包含出生日期序列, 作为初始密码 + 首次登录强制改密。
 */
export function idCardToPassword(idCard: string): string {
  return idCard.slice(-6);
}
