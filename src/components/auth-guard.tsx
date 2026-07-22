'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getStoredUser, clearSession, type ClientUser } from '@/lib/session-client';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: (user: ClientUser) => ReactNode;
  /** 允许的角色；为空表示只需登录 */
  roles?: string[];
  fallback?: ReactNode;
}

/**
 * 客户端认证守卫：检查本地会话 + 服务端验证。
 * 注意：这只是 UI 层守卫，真正的权限校验在所有 API 路由服务端完成。
 */
export function AuthGuard({ children, roles, fallback }: AuthGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<ClientUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const token = getToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      router.replace('/login');
      return;
    }
    // 服务端二次验证（防止本地伪造）
    fetch('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) {
          clearSession();
          router.replace('/login');
          return;
        }
        const json = await res.json();
        const serverUser = json.data as ClientUser;
        if (roles && roles.length > 0) {
          const ok =
            serverUser.roles.some((r) => roles.includes(r)) || serverUser.roles.includes('super_admin');
          if (!ok) {
            setDenied(true);
            setChecking(false);
            return;
          }
        }
        setUser(serverUser);
        setChecking(false);
      })
      .catch(() => {
        router.replace('/login');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      fallback ?? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex items-center gap-3 text-lg text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
            正在加载…
          </div>
        </div>
      )
    );
  }

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-xl font-semibold mb-2">没有权限访问此页面</p>
          <p className="text-muted-foreground mb-6">如果您认为出错了，请联系管理员。</p>
          <button
            onClick={() => router.replace('/login')}
            className="h-12 px-6 rounded-lg bg-primary text-primary-foreground text-lg"
          >
            返回登录
          </button>
        </div>
      </div>
    );
  }

  return <>{user && children(user)}</>;
}
