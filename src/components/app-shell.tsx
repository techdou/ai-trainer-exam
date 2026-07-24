'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpenCheck,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { clearSession, type ClientUser } from '@/lib/session-client';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 需要任一角色才显示；空 = 所有人 */
  roles?: string[];
}

interface AppShellProps {
  user: ClientUser;
  navItems: NavItem[];
  title: string;
  children: ReactNode;
}

/** 通用应用外壳：左侧导航 + 顶栏 + 内容区。管理端/教师端用。学员端用更简洁的顶栏。 */
export function AppShell({ user, navItems, title, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visible = navItems.filter(
    (item) =>
      !item.roles ||
      item.roles.length === 0 ||
      item.roles.some((r) => user.roles.includes(r)) ||
      user.roles.includes('super_admin'),
  );

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label="主导航">
      {visible.map((item) => {
        const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href + '/'));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="w-5 h-5 shrink-0" aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* 桌面侧边栏 */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card fixed inset-y-0 z-30">
        <div className="flex items-center gap-2 px-5 h-16 border-b border-border">
          <BookOpenCheck className="w-7 h-7 text-primary" aria-hidden />
          <span className="font-bold text-lg truncate">{title}</span>
        </div>
        <div className="flex-1 overflow-y-auto py-2">{nav}</div>
        <div className="border-t border-border p-4">
          <div className="text-base font-medium truncate mb-1">{user.displayName}</div>
          <div className="text-sm text-muted-foreground truncate mb-3">{user.email}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full rounded-lg px-4 py-2.5 text-base text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <LogOut className="w-5 h-5" aria-hidden />
            退出登录
          </button>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-card border-b border-border">
        <div className="flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2">
            <BookOpenCheck className="w-7 h-7 text-primary" aria-hidden />
            <span className="font-bold text-lg">{title}</span>
          </div>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
            className="p-2 rounded-lg hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {mobileOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="border-t border-border bg-card max-h-[70vh] overflow-y-auto">
            {nav}
            <div className="border-t border-border p-4">
              <div className="text-base font-medium mb-2">{user.displayName}</div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-base text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-5 h-5" aria-hidden />
                退出登录
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 主内容 */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 min-w-0">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
