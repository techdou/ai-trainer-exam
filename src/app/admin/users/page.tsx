'use client';

import { useState, useEffect, useCallback, Fragment, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { apiFetch, getStoredUser } from '@/lib/session-client';
import { ROLE_LABELS, ROLES, type Role } from '@/lib/constants';
import { displayAccount } from '@/lib/utils';
import { UserPlus, KeyRound, UserX, UserCheck, ShieldCheck, Copy, ChevronDown, ChevronRight, UsersRound, Search } from 'lucide-react';

interface UserItem {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  status: string;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string;
}

interface OrgOption { id: string; name: string }

/** school_admin 可分配的角色(与 API 端 SCHOOL_ADMIN_ASSIGNABLE_ROLES 一致)。 */
const SCHOOL_ASSIGNABLE: Role[] = ['student', 'teacher', 'invigilator', 'question_editor', 'question_reviewer'];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}); // 机构组折叠态(默认展开)
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20; // 分页 + 页内按机构归纳,不受单次拉取上限约束

  // 搜索防抖 300ms(触发搜索时回到第 1 页)
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const me = getStoredUser();
  const isSuper = me?.roles.includes('super_admin') ?? false;
  const assignableRoles: Role[] = isSuper ? [...ROLES] : SCHOOL_ASSIGNABLE;

  // 新建用户弹窗
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createRoles, setCreateRoles] = useState<Role[]>(['student']);
  const [createOrg, setCreateOrg] = useState('');
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 一次性密码展示弹窗(新建/重置共用)
  const [passwordInfo, setPasswordInfo] = useState<{ email: string; password: string } | null>(null);

  // 改角色弹窗
  const [roleTarget, setRoleTarget] = useState<UserItem | null>(null);
  const [roleSelection, setRoleSelection] = useState<Role[]>([]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (roleFilter) params.set('role', roleFilter);
      if (search) params.set('search', search);
      const res = await apiFetch<{ items: UserItem[]; total: number }>(`/api/admin/users?${params}`);
      if (res.ok && res.data) {
        setUsers(res.data.items);
        setTotal(res.data.total);
      } else {
        toast.error(res.error || '加载用户列表失败');
      }
    } catch {
      toast.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // super_admin 打开新建弹窗时才拉机构列表, 避免无谓请求。
  useEffect(() => {
    if (!createOpen || !isSuper || orgs.length > 0) return;
    void apiFetch<OrgOption[]>('/api/admin/organizations').then(r => {
      if (r.ok && r.data) setOrgs(r.data);
    });
  }, [createOpen, isSuper, orgs.length]);

  const toggleRole = (list: Role[], role: Role): Role[] =>
    list.includes(role) ? list.filter(r => r !== role) : [...list, role];

  const handleCreate = async () => {
    if (!createEmail.trim() || !createName.trim() || createRoles.length === 0) {
      toast.error('请填写邮箱、姓名并至少选择一个角色');
      return;
    }
    setSubmitting(true);
    const res = await apiFetch<{ userId: string; initialPassword: string }>('/api/admin/users', {
      method: 'POST',
      body: {
        email: createEmail.trim(), displayName: createName.trim(), roles: createRoles,
        ...(isSuper && createOrg ? { organizationId: createOrg } : {}),
      },
    });
    setSubmitting(false);
    if (res.ok && res.data) {
      setCreateOpen(false);
      setCreateEmail(''); setCreateName(''); setCreateRoles(['student']); setCreateOrg('');
      setPasswordInfo({ email: createEmail.trim(), password: res.data.initialPassword });
      loadUsers();
    } else {
      toast.error('创建失败', { description: res.error });
    }
  };

  const handleResetPassword = async (u: UserItem) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch<{ newPassword: string }>(`/api/admin/users/${u.id}`, {
        method: 'PATCH', body: { action: 'reset_password' },
      });
      if (res.ok && res.data) {
        setPasswordInfo({ email: displayAccount(u.email), password: res.data.newPassword });
      } else {
        toast.error('重置密码失败', { description: res.error });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (u: UserItem) => {
    if (submitting) return;
    const action = u.status === 'active' ? 'deactivate' : 'activate';
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { action } });
      if (res.ok) {
        toast.success(action === 'deactivate' ? `已停用 ${u.displayName}` : `已启用 ${u.displayName}`);
        loadUsers();
      } else {
        toast.error('操作失败', { description: res.error });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetRoles = async () => {
    if (!roleTarget || submitting) return;
    if (roleSelection.length === 0) {
      toast.error('至少保留一个角色');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/admin/users/${roleTarget.id}`, {
        method: 'PATCH', body: { action: 'set_roles', roles: roleSelection },
      });
      if (res.ok) {
        toast.success('角色已更新');
        setRoleTarget(null);
        loadUsers();
      } else {
        toast.error('修改角色失败', { description: res.error });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 按所属机构归纳展示;无机构归入「未分配机构」。
  const grouped = useMemo(() => {
    const map = new Map<string, UserItem[]>();
    for (const u of users) {
      const key = u.organizationName || '未分配机构';
      const bucket = map.get(key);
      if (bucket) bucket.push(u); else map.set(key, [u]);
    }
    return [...map.entries()];
  }, [users]);

  const copyPassword = async () => {
    if (!passwordInfo) return;
    try {
      await navigator.clipboard.writeText(passwordInfo.password);
      toast.success('已复制到剪贴板');
    } catch {
      toast.error('复制失败，请手动抄录');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">用户管理</h1>
        <div className="flex flex-1 justify-end gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索姓名 / 账号 / 机构"
              className="w-64 pl-8"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">全部角色</option>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1" /> 新建用户
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left p-3 font-medium">姓名</th>
              <th className="text-left p-3 font-medium">账号</th>
              <th className="text-left p-3 font-medium">角色</th>
              <th className="text-left p-3 font-medium">状态</th>
              <th className="text-left p-3 font-medium">所属机构</th>
              <th className="text-left p-3 font-medium">注册时间</th>
              <th className="text-left p-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">加载中...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">暂无用户</td></tr>
            ) : (
              grouped.map(([orgName, list]) => {
                const isCollapsed = collapsed[orgName] ?? false;
                return (
                <Fragment key={orgName}>
                <tr
                  className="cursor-pointer border-b bg-muted/40 hover:bg-muted/60"
                  onClick={() => setCollapsed(s => ({ ...s, [orgName]: !isCollapsed }))}
                >
                  <td colSpan={7} className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <UsersRound className="h-5 w-5 text-primary" />
                      </div>
                      <div className="text-base font-medium">{orgName}</div>
                      <div className="ml-auto flex items-center gap-3">
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">本页 {list.length} 人</span>
                        {isCollapsed
                          ? <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                      </div>
                    </div>
                  </td>
                </tr>
                {!isCollapsed && list.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">{u.displayName || '-'}</td>
                  <td className="p-3 text-muted-foreground">{displayAccount(u.email)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map(r => (
                        <Badge key={r} variant={r === 'student' ? 'secondary' : 'default'}>
                          {ROLE_LABELS[r as Role] || r}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant={u.status === 'active' ? 'outline' : 'destructive'}>
                      {u.status === 'active' ? '正常' : '已停用'}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{u.organizationName || '-'}</td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" title="重置密码" onClick={() => handleResetPassword(u)}>
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title="修改角色"
                        onClick={() => { setRoleTarget(u); setRoleSelection(u.roles.filter((r): r is Role => (ROLES as readonly string[]).includes(r))); }}>
                        <ShieldCheck className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title={u.status === 'active' ? '停用' : '启用'}
                        onClick={() => handleToggleStatus(u)}>
                        {u.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </Button>
                    </div>
                  </td>
                </tr>
                ))}
                </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {total > limit && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            上一页
          </Button>
          <span className="py-1.5 text-sm text-muted-foreground">第 {page} 页</span>
          <Button variant="outline" size="sm" disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}>
            下一页
          </Button>
        </div>
      )}

      {/* 新建用户 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建用户</DialogTitle>
            <DialogDescription>创建后系统生成初始密码，仅显示一次，请转交给用户并提醒首次登录修改。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="create-email">邮箱</Label>
              <Input id="create-email" type="email" placeholder="user@example.com"
                value={createEmail} onChange={e => setCreateEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">姓名</Label>
              <Input id="create-name" placeholder="张三"
                value={createName} onChange={e => setCreateName(e.target.value)} />
            </div>
            {isSuper && (
              <div className="space-y-2">
                <Label htmlFor="create-org">所属机构</Label>
                <select id="create-org" value={createOrg} onChange={e => setCreateOrg(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background">
                  <option value="">（不绑定机构）</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label>角色（可多选）</Label>
              <div className="grid grid-cols-2 gap-2">
                {assignableRoles.map(r => (
                  <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={createRoles.includes(r)}
                      onCheckedChange={() => setCreateRoles(toggleRole(createRoles, r))}
                    />
                    {ROLE_LABELS[r]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? '创建中…' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 一次性密码展示 */}
      <Dialog open={passwordInfo !== null} onOpenChange={(open) => { if (!open) setPasswordInfo(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>初始密码（仅显示一次）</DialogTitle>
            <DialogDescription>
              账号 {passwordInfo?.email} 的密码已重置。请立即抄录并转交用户，关闭后将无法再次查看。
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-3 py-4">
            <code className="text-2xl font-mono font-bold tracking-widest bg-muted px-4 py-2 rounded">
              {passwordInfo?.password}
            </code>
            <Button variant="outline" size="icon" onClick={copyPassword} title="复制">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setPasswordInfo(null)}>我已妥善保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 修改角色 */}
      <Dialog open={roleTarget !== null} onOpenChange={(open) => { if (!open) setRoleTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改角色 — {roleTarget?.displayName}</DialogTitle>
            <DialogDescription>{roleTarget?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {assignableRoles.map(r => (
              <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={roleSelection.includes(r)}
                  onCheckedChange={() => setRoleSelection(toggleRole(roleSelection, r))}
                />
                {ROLE_LABELS[r]}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>取消</Button>
            <Button onClick={handleSetRoles}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
