import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { ok, fail, catchError } from '@/lib/api';
import { parseRoster } from '@/server/roster-import';

export const runtime = 'nodejs';

/** 预览解析名册：返回识别到的班级名和学员列表，不执行任何写操作 */
export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ['super_admin', 'school_admin']);
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return fail(400, '请上传名册文件');
    }
    if (!file.name.match(/\.xlsx?$/i)) {
      return fail(400, '仅支持 .xlsx 或 .xls 格式的名册文件');
    }

    const fileBuffer = await file.arrayBuffer();
    const parsed = parseRoster(fileBuffer);

    return ok({
      cohortName: parsed.cohortName,
      studentCount: parsed.students.length,
      students: parsed.students.map(s => ({
        name: s.name,
        idCard: s.idCard,
        gender: s.gender,
        phone: s.phone,
      })),
    });
  } catch (error) {
    return catchError(error);
  }
}
