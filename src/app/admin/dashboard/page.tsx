'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/session-client';
import { Users, ClipboardCheck, Award, FileUp, AlertCircle } from 'lucide-react';

interface DashboardStats {
  cohorts: number;
  students: number;
  teachers: number;
  practiceQuestions: number;
  examQuestions: number;
  recentImports: { id: string; created_at: string; status: string; total_rows: number }[];
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<DashboardStats>('/api/admin/stats').then((r) => {
      if (r.ok && r.data) setStats(r.data);
      else setError(r.error ?? '加载失败');
    });
  }, []);

  const cards = [
    { label: '培训班级', value: stats?.cohorts, icon: Users, href: '/admin/users' },
    { label: '学员账号', value: stats?.students, icon: Users, href: '/admin/users' },
    { label: '教师账号', value: stats?.teachers, icon: ClipboardCheck, href: '/admin/users' },
    { label: '练习题数', value: stats?.practiceQuestions, icon: FileUp, href: '/admin/practice-bank' },
    { label: '考试题数', value: stats?.examQuestions, icon: Award, href: '/admin/exam-bank' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">工作台</h1>
      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-base">{error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              onClick={() => router.push(c.href)}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 text-left hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary shrink-0">
                <Icon className="w-6 h-6" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="text-3xl font-bold leading-none">
                  {c.value === undefined ? '—' : c.value}
                </div>
                <div className="text-base text-muted-foreground mt-1.5">{c.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-3">常用操作</h2>
        <div className="flex flex-wrap gap-3">
          <QuickLink href="/admin/import" label="导入理论题库" />
          <QuickLink href="/admin/review" label="审核题目" />
          <QuickLink href="/admin/exam-schedules" label="创建考试安排" />
          <QuickLink href="/admin/media-studio" label="生成练习素材" />
          <QuickLink href="/admin/users" label="添加学员账号" />
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className="rounded-lg bg-secondary text-secondary-foreground px-5 py-3 text-base font-medium hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {label}
    </button>
  );
}
