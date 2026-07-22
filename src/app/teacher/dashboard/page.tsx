'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/session-client';
import { UsersRound, ClipboardList, TrendingUp, AlertCircle } from 'lucide-react';

interface TeacherStats {
  cohortCount: number;
  studentCount: number;
  activeAssignments: number;
  avgPracticeScore: number | null;
}

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<TeacherStats>('/api/teacher/dashboard').then((r) => {
      if (r.ok && r.data) setStats(r.data);
      else setError(r.error ?? '加载失败');
    });
  }, []);

  const cards = [
    { label: '我的班级', value: stats?.cohortCount, icon: UsersRound, href: '/teacher/cohorts' },
    { label: '学员人数', value: stats?.studentCount, icon: UsersRound, href: '/teacher/progress' },
    { label: '进行中的作业', value: stats?.activeAssignments, icon: ClipboardList, href: '/teacher/assignments' },
    {
      label: '练习平均分',
      value: stats?.avgPracticeScore === null ? '暂无' : stats?.avgPracticeScore,
      icon: TrendingUp,
      href: '/teacher/progress',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">工作台</h1>
      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-base">{error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      <div className="mt-8 rounded-xl border border-border bg-accent/50 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-primary shrink-0 mt-0.5" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold mb-1">教学提示</h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              建议先让学员完成「电脑基础入门」，再按「理论练习 → 专项实操 → 模拟考试」的顺序学习。
              学员练习记录和错题分布可在「学习进度」与「错题分析」中查看。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
