import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, catchError } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin','school_admin']);
    const p = new URL(request.url).searchParams;
    const page = Math.max(1, Number(p.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(p.get('limit') || 20)));
    const role = p.get('role');
    const offset = (page - 1) * limit;
    const clauses = ['p.deleted_at IS NULL']; const args: unknown[] = [];
    if (!user.roles.includes('super_admin')) { args.push(user.organizationId); clauses.push(`p.organization_id=$${args.length}`); }
    if (role) { args.push(role); clauses.push(`EXISTS(SELECT 1 FROM user_roles x WHERE x.user_id=p.id AND x.role=$${args.length})`); }
    const where = clauses.join(' AND ');
    const users = await dbQuery<{ id:string;email:string;display_name:string;created_at:string;organization_id:string|null;organization_name:string|null;roles:string[] }>(
      `SELECT p.id,p.email,p.display_name,p.created_at,p.organization_id,o.name organization_name,
              COALESCE(array_agg(DISTINCT ur.role) FILTER(WHERE ur.role IS NOT NULL),'{}') roles
         FROM profiles p LEFT JOIN organizations o ON o.id=p.organization_id LEFT JOIN user_roles ur ON ur.user_id=p.id
        WHERE ${where} GROUP BY p.id,o.name ORDER BY p.created_at DESC LIMIT $${args.length+1} OFFSET $${args.length+2}`,
      ...args,limit,offset);
    const count = await dbQuery<{count:string}>(`SELECT count(*)::text count FROM profiles p WHERE ${where}`, ...args);
    return ok({ items: users.map(u=>({ id:u.id,email:u.email,displayName:u.display_name,role:u.roles[0]??null,roles:u.roles,organizationId:u.organization_id,organizationName:u.organization_name,createdAt:u.created_at })), total:Number(count[0]?.count||0),page,pageSize:limit });
  } catch (error) { return catchError(error); }
}
