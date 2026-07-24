'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { StudentTopbar } from '@/components/student-topbar';

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard roles={['student']}>
      {(user) => (
        <div className="min-h-screen bg-background">
          <StudentTopbar user={user} />
          <main className="pt-20 pb-24 px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">{children}</div>
          </main>
        </div>
      )}
    </AuthGuard>
  );
}
