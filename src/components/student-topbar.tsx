'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpenCheck, LogOut } from 'lucide-react';
import { clearSession, type ClientUser } from '@/lib/session-client';
import { cn } from '@/lib/utils';

const links = [
  { href: '/student/home', label: '首页' },
  { href: '/student/practice', label: '理论练习' },
  { href: '/student/task', label: '实操练习' },
  { href: '/student/wrong', label: '错题本' },
  { href: '/student/exams', label: '考试' },
  { href: '/student/results', label: '成绩' },
  { href: '/student/help', label: '帮助' },
];

/** 学员端顶部导航：大字号、大点击区域 */
export function StudentTopbar({ user }: { user: ClientUser }) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <header className="fixed top-0 inset-x-0 z-40 bg-card border-b border-border">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/student/home" className="flex items-center gap-2 shrink-0">
            <BookOpenCheck className="w-7 h-7 text-primary" aria-hidden />
            <span className="font-bold text-lg hidden sm:inline">人工智能训练师五级</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1" aria-label="主导航">
            {links.map((l) => {
              const active = pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    'px-4 py-2 rounded-lg text-lg font-medium transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-ring',
                    active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-base font-medium hidden sm:inline">{user.displayName}</span>
            <button
              onClick={handleLogout}
              aria-label="退出登录"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-base text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <LogOut className="w-5 h-5" aria-hidden />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>
        {/* 移动端二级导航 */}
        <nav className="md:hidden flex gap-1 overflow-x-auto pb-2 -mx-1 px-1" aria-label="主导航">
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'px-3.5 py-2 rounded-lg text-base font-medium whitespace-nowrap',
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
