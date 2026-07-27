import { NextRequest } from 'next/server';
import { z } from 'zod';
import { organizationScope, requireRole } from '@/server/auth';
import { dbOne, dbQuery } from '@/server/db';
import { ok, fail, catchError, parseBody, genInitialPassword } from '@/lib/api';
import { createUserWithRoles } from '@/server/users';
import { insertAudit } from '@/server/audit';
import { ROLES } from '@/lib/constants';

/** school_admin 可分配的角色(防提权: 不能创建同级 school_admin / super_admin / auditor)。 */
export const SCHOOL_ADMIN_ASSIGNABLE_ROLES = ['student', 'teacher', 'invigilator', 'question_editor', 'question_reviewer'] as const;

const createSchema = z.object({
  email: z.string().trim().email().max(200),
  displayName: z.string().trim().min(1).max(100),
  roles: z.array(z.enum(ROLES)).min(1),
  organizationId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin','school_admin']);
    const p = new URL(request.url).searchParams;
    const page = Math.max(1, Number(p.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(p.get('limit') || 20)));
    const role = p.get('role');
    const offset = (page - 1) * limit;
    // profiles 表没有 deleted_at 列(软停用走 status='disabled'), 曾经照抄 cohorts 的
    // 软删条件导致整接口 500。停用账号仍列出, 由前端按 status 标识。
    const clauses: string[] = []; const args: unknown[] = [];
    const scopedOrg = organizationScope(user);
    if (scopedOrg) { args.push(scopedOrg); clauses.push(`p.organization_id=$${args.length}`); }
    if (role) { args.push(role); clauses.push(`EXISTS(SELECT 1 FROM user_roles x WHERE x.user_id=p.id AND x.role=$${args.length})`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const users = await dbQuery<{ id:string;email:string;display_name:string;created_at:string;status:string;organization_id:string|null;organization_name:string|null;roles:string[] }>(
      `SELECT p.id,p.email,p.display_name,p.created_at,p.status,p.organization_id,o.name organization_name,
              COALESCE(array_agg(DISTINCT ur.role) FILTER(WHERE ur.role IS NOT NULL),'{}') roles
         FROM profiles p LEFT JOIN organizations o ON o.id=p.organization_id LEFT JOIN user_roles ur ON ur.user_id=p.id
        ${where} GROUP BY p.id,o.name ORDER BY p.created_at DESC LIMIT $${args.length+1} OFFSET $${args.length+2}`,
      ...args,limit,offset);
    const count = await dbQuery<{count:string}>(`SELECT count(*)::text count FROM profiles p ${where}`, ...args);
    return ok({ items: users.map(u=>({ id:u.id,email:u.email,displayName:u.display_name,role:u.roles[0]??null,roles:u.roles,status:u.status,organizationId:u.organization_id,organizationName:u.organization_name,createdAt:u.created_at })), total:Number(count[0]?.count||0),page,pageSize:limit });
  } catch (error) { return catchError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin', 'school_admin']);
    const body = await parseBody(request, createSchema);
    const isSuper = user.roles.includes('super_admin');
    if (!isSuper) {
      const bad = body.roles.filter(r => !(SCHOOL_ADMIN_ASSIGNABLE_ROLES as readonly string[]).includes(r));
      if (bad.length > 0) return fail(403, `学校管理员不能分配这些角色：${bad.join('、')}`);
      if (!user.organizationId) return fail(403, '账号未绑定机构');
    }
    const organizationId = isSuper ? (body.organizationId ?? null) : organizationScope(user);
    const tenantRoles = body.roles.filter(role => role !== 'super_admin' && role !== 'auditor');
    const globalRoles = body.roles.filter(role => role === 'super_admin' || role === 'auditor');
    if (tenantRoles.length > 0 && globalRoles.length > 0) {
      return fail(400, '全局角色与机构角色不能分配给同一账号');
    }
    if (globalRoles.length > 0 && organizationId) {
      return fail(400, '全局角色账号不能绑定所属学校');
    }
    if (tenantRoles.length > 0 && !organizationId) {
      return fail(400, '机构级角色必须选择所属学校');
    }
    if (organizationId) {
      const organization = await dbOne<{ id: string }>(
        "SELECT id FROM organizations WHERE id=$1 AND status='active' AND deleted_at IS NULL",
        organizationId,
      );
      if (!organization) return fail(404, '所属学校不存在或已停用');
    }
    // 初始密码只在本次响应中返回一次, 不落日志; 用户首次登录强制改密。
    const initialPassword = genInitialPassword();
    const { userId } = await createUserWithRoles({
      email: body.email, password: initialPassword, displayName: body.displayName,
      roles: body.roles, organizationId,
    });
    await insertAudit({
      actorId: user.id, actorRole: user.roles[0], action: 'user.create',
      entityType: 'user', entityId: userId,
      details: `创建用户 ${body.email}(${body.displayName}), 角色: ${body.roles.join(',')}`,
      organizationId,
    });
    // no-store: 响应体含一次性初始密码, 禁止任何中间层/浏览器缓存。
    return ok({ userId, initialPassword }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return catchError(error); }
}
