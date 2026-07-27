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
import * as XLSX from 'xlsx';

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
export function parseRoster(fileBuffer: ArrayBuffer): ParsedRoster {
  const wb = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Excel 文件中没有工作表');
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false });

  if (rows.length < 3) throw new Error('名册文件内容不足，至少需要标题行、表头行和 1 条学员数据');

  // 第 1 行是标题
  const title = String(rows[0]?.[0] ?? '').trim();
  const cohortName = extractCohortName(title);

  // 查找表头行（含"姓名"和"公民身份号码"）
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map(c => String(c ?? '').trim());
    if (cells.some(c => c.includes('姓名')) && cells.some(c => c.includes('身份') || c.includes('身份证'))) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) throw new Error('无法识别表头行，请确保名册包含"姓名"和"公民身份号码"列');

  const headers = rows[headerRowIndex] as unknown[];

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
    const row = rows[i] as unknown[];
    if (!Array.isArray(row)) continue;
    const idCard = String(row[colIdCard] ?? '').trim();
    const name = String(row[colName] ?? '').trim();

    // 跳过空行和注脚行
    if (!idCard || !name) continue;
    // 身份证号至少 15 位
    if (idCard.length < 15) continue;
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
 * 身份证号 + 机构后缀 → 初始密码。
 *
 * 安全设计(2026-07-27 修正): 单纯"身份证后六位"等于把名册当密码本,
 * 任何拿到名册的人(老师/同学/打印件/拍照)都能登录任意学员账号。
 * 改为"身份证后六位 + 机构级随机后缀": 学员需要同时知道身份证号和机构后缀才能登录,
 * 后缀由管理员通过 system_settings(roster_password_suffix) 配置并安全渠道告知学员。
 *
 * @param idCard 学员身份证号
 * @param orgSuffix 机构级随机后缀(8 位字母数字), 调用方从 system_settings 读取
 */
export function idCardToPassword(idCard: string, orgSuffix: string): string {
  return `${idCard.slice(-6)}${orgSuffix}`;
}
