'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface UserItem {
  id: string;
  email: string;
  displayName: string;
  role: string | null;
  organizationName: string | null;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (roleFilter) params.set('role', roleFilter);
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.data.items);
        setTotal(data.data.total);
      }
    } catch {
      toast.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const roleLabels: Record<string, string> = {
    super_admin: '超级管理员',
    admin: '管理员',
    teacher: '教师',
    student: '学员',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">用户管理</h1>
        <div className="flex gap-2">
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">全部角色</option>
            <option value="student">学员</option>
            <option value="teacher">教师</option>
            <option value="admin">管理员</option>
            <option value="super_admin">超级管理员</option>
          </select>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left p-3 font-medium">姓名</th>
              <th className="text-left p-3 font-medium">邮箱</th>
              <th className="text-left p-3 font-medium">角色</th>
              <th className="text-left p-3 font-medium">所属机构</th>
              <th className="text-left p-3 font-medium">注册时间</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">加载中...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">暂无用户</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">{u.displayName || '-'}</td>
                  <td className="p-3 text-muted-foreground">{u.email}</td>
                  <td className="p-3">
                    {u.role && (
                      <Badge variant={u.role === 'student' ? 'secondary' : 'default'}>
                        {roleLabels[u.role] || u.role}
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{u.organizationName || '-'}</td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                </tr>
              ))
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
    </div>
  );
}
