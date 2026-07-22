'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { AppShell, type NavItem } from '@/components/app-shell';

interface RoleLayoutProps {
  roles: string[];
  navItems: NavItem[];
  title: string;
  children: ReactNode;
}

/** 角色布局：AuthGuard + AppShell 组合 */
export function RoleLayout({ roles, navItems, title, children }: RoleLayoutProps) {
  return (
    <AuthGuard roles={roles}>
      {(user) => (
        <AppShell user={user} navItems={navItems} title={title}>
          {children}
        </AppShell>
      )}
    </AuthGuard>
  );
}
