import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbOne } from '@/server/db';
import { ok, fail, catchError, parseBody, genInitialPassword } from '@/lib/api';
import { activateUser, deactivateUser, markMustChangePassword, resetUserPassword, setUserRoles } from '@/server/users';
import { insertAudit } from '@/server/audit';
import { ROLES, type Role } from '@/lib/constants';
import { SCHOOL_ADMIN_ASSIGNABLE_ROLES } from '../route';

const patchSchema = z.object({
  action: z.enum(['reset_password', 'deactivate', 'activate', 'set_roles']),
  roles: z.array(z.enum(ROLES)).min(1).optional(),
});

interface TargetUser {
  id: string;
  email: string;
  organization_id: string | null;
  status: string;
  roles: string[];
}

async function loadTarget(id: string): Promise<TargetUser | null> {
  return dbOne<TargetUser>(
    `SELECT p.id, p.email, p.organization_id, p.status,
            COALESCE(array_agg(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') roles
       FROM profiles p LEFT JOIN user_roles ur ON ur.user_id = p.id
      WHERE p.id = $1 GROUP BY p.id`,
    id,
  );
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(request, ['super_admin', 'school_admin']);
    const { id } = await params;
    const body = await parseBody(request, patchSchema);
    const isSuper = user.roles.includes('super_admin');

    const target = await loadTarget(id);
    if (!target) return fail(404, '用户不存在');

    // 守卫: 不能操作自己(防止把自己停用/降权后系统无人能管)。
    if (target.id === user.id && body.action !== 'reset_password') return fail(409, '不能对自己执行该操作');
    // 守卫: 非 super_admin 不能操作 super_admin 账号。
    if (!isSuper && target.roles.includes('super_admin')) return fail(403, '无权操作超级管理员账号');
    // 守卫: school_admin 只能操作本机构用户; 目标未挂机构(organization_id 为 null)时一律拒绝,
    // 避免"无机构账号"(如初始超管种子)被学校管理员误操作。
    if (!isSuper) {
      if (!user.organizationId || !target.organization_id || target.organization_id !== user.organizationId) {
        return fail(403, '不能操作其他机构的用户');
      }
    }

    switch (body.action) {
      case 'reset_password': {
        // 新密码只在本次响应返回一次, 不落审计详情; 重置后强制下次登录改密。
        const newPassword = genInitialPassword();
        await resetUserPassword(target.id, newPassword);
        try {
          await markMustChangePassword(target.id);
        } catch (e) {
          throw new Error(`密码已重置成功, 但强制改密标记失败, 请再次执行重置操作(${(e as Error).message})`);
        }
        await insertAudit({
          actorId: user.id, actorRole: user.roles[0], action: 'user.reset_password',
          entityType: 'user', entityId: target.id, details: `重置 ${target.email} 的密码`,
          organizationId: target.organization_id,
        });
        // no-store: 响应体含一次性明文密码, 禁止任何中间层/浏览器缓存。
        return ok({ userId: target.id, newPassword }, { headers: { 'Cache-Control': 'no-store' } });
      }
      case 'deactivate': {
        if (target.status === 'disabled') return ok({ userId: target.id, status: 'disabled', changed: false });
        await deactivateUser(target.id);
        await insertAudit({
          actorId: user.id, actorRole: user.roles[0], action: 'user.deactivate',
          entityType: 'user', entityId: target.id, details: `停用账号 ${target.email}`,
          organizationId: target.organization_id,
        });
        return ok({ userId: target.id, status: 'disabled', changed: true });
      }
      case 'activate': {
        if (target.status === 'active') return ok({ userId: target.id, status: 'active', changed: false });
        await activateUser(target.id);
        await insertAudit({
          actorId: user.id, actorRole: user.roles[0], action: 'user.activate',
          entityType: 'user', entityId: target.id, details: `启用账号 ${target.email}`,
          organizationId: target.organization_id,
        });
        return ok({ userId: target.id, status: 'active', changed: true });
      }
      case 'set_roles': {
        if (!body.roles) return fail(400, '缺少 roles');
        if (!isSuper) {
          const bad = body.roles.filter(r => !(SCHOOL_ADMIN_ASSIGNABLE_ROLES as readonly string[]).includes(r));
          if (bad.length > 0) return fail(403, `学校管理员不能分配这些角色：${bad.join('、')}`);
        }
        // requireNonSuperAdmin: 事务内重查目标当前角色, 防止基于陈旧快照的越权在并发窗口内命中。
        await setUserRoles(target.id, body.roles as Role[], target.organization_id, { requireNonSuperAdmin: !isSuper });
        await insertAudit({
          actorId: user.id, actorRole: user.roles[0], action: 'user.set_roles',
          entityType: 'user', entityId: target.id,
          details: `将 ${target.email} 的角色设为: ${body.roles.join(',')}`,
          organizationId: target.organization_id,
        });
        return ok({ userId: target.id, roles: body.roles });
      }
    }
  } catch (error) { return catchError(error); }
}
