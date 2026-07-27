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
    if (!file.name.match(/\.xlsx$/i)) {
      return fail(400, '仅支持 .xlsx 格式的名册文件');
    }
    if (file.size > 5 * 1024 * 1024) {
      return fail(413, '名册文件不能超过 5MB');
    }

    const fileBuffer = await file.arrayBuffer();
    // magic number 校验: 防 XML/ZIP 炸弹和伪造扩展名
    const header = new Uint8Array(fileBuffer.slice(0, 4));
    const isZip = header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
    if (!isZip) {
      return fail(400, '文件内容不是有效的 .xlsx 文件(缺少 ZIP 文件头)');
    }
    const parsed = await parseRoster(fileBuffer);

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
