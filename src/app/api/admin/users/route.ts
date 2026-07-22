import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, fail } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request as unknown as Request, ['super_admin', 'school_admin']);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const role = searchParams.get('role');
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.id, p.email, p.display_name, p.created_at,
             ur.role, p.organization_id,
             o.name as organization_name
      FROM profiles p
      LEFT JOIN user_roles ur ON ur.user_id = p.id
      LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (role) {
      params.push(role);
      query += ` AND ur.role = $${params.length}`;
    }
    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const users = await dbQuery<{
      id: string; email: string; display_name: string; created_at: string;
      role: string | null; organization_id: string | null; organization_name: string | null;
    }>(query, ...params);

    let countQuery = `SELECT COUNT(*) as count FROM profiles p LEFT JOIN user_roles ur ON ur.user_id = p.id WHERE 1=1`;
    const countParams: unknown[] = [];
    if (role) {
      countParams.push(role);
      countQuery += ` AND ur.role = $${countParams.length}`;
    }
    const countResult = await dbQuery<{ count: string }>(countQuery, ...countParams);

    return ok({
      items: users.map(u => ({
        id: u.id,
        email: u.email,
        displayName: u.display_name,
        role: u.role,
        organizationId: u.organization_id,
        organizationName: u.organization_name,
        createdAt: u.created_at,
      })),
      total: parseInt(countResult[0]?.count || '0'),
      page,
      pageSize: limit,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('401')) return fail(401, '未登录');
    if (err instanceof Error && err.message.includes('403')) return fail(403, '无权限');
    return fail(500, '服务器开小差了，请稍后再试');
  }
}
