'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getStoredUser } from '@/lib/session-client';
import {
  GraduationCap,
  BookOpen,
  MousePointerClick,
  FileText,
  Award,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface HomeData {
  displayName: string;
  onboardingCompleted: boolean;
  practiceStats: { totalAttempts: number; correctRate: number | null };
  upcomingExam: { id: string; title: string; examOpenAt: string; status: string } | null;
  lockedPractice: boolean;
}

export default function StudentHomePage() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<HomeData>('/api/student/home').then((r) => {
      if (r.ok && r.data) setData(r.data);
      else setError(r.error ?? '加载失败');
    });
  }, []);

  const name = data?.displayName ?? getStoredUser()?.displayName ?? '同学';

  return (
    <div>
      {/* 欢迎语 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">你好，{name}</h1>
        <p className="text-lg text-muted-foreground">今天想练点什么？选一个开始吧。</p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl bg-destructive/10 text-destructive px-5 py-4 text-lg">{error}</div>
      )}

      {/* 即将开始的考试提醒 */}
      {data?.upcomingExam && (
        <button
          onClick={() => router.push(`/student/exams`)}
          className="w-full mb-6 rounded-2xl bg-primary text-primary-foreground p-6 text-left focus:outline-none focus:ring-4 focus:ring-ring"
        >
          <div className="flex items-center gap-3 mb-2">
            <Award className="w-8 h-8" aria-hidden />
            <span className="text-xl font-bold">你有一场考试安排</span>
          </div>
          <p className="text-lg opacity-95">{data.upcomingExam.title}</p>
          <p className="text-base opacity-80 mt-1">点这里查看考试时间和入口</p>
        </button>
      )}

      {/* 新手引导卡片 */}
      {!data?.onboardingCompleted && (
        <button
          onClick={() => router.push('/student/onboarding')}
          className="w-full mb-6 rounded-2xl border-2 border-accent bg-accent/30 p-6 text-left focus:outline-none focus:ring-4 focus:ring-ring"
        >
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-8 h-8 text-primary" aria-hidden />
            <span className="text-xl font-bold">第一次用电脑上课？</span>
          </div>
          <p className="text-lg text-muted-foreground">
            先花 5 分钟学学鼠标、键盘的基本用法，后面会更轻松。
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-primary font-semibold text-lg">
            开始新手引导 <ChevronRight className="w-5 h-5" aria-hidden />
          </div>
        </button>
      )}

      {/* 学习入口 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EntryCard
          icon={MousePointerClick}
          title="电脑基础入门"
          desc="鼠标、键盘、文件、表格的基本操作"
          onClick={() => router.push('/student/onboarding')}
        />
        <EntryCard
          icon={BookOpen}
          title="理论练习"
          desc="单选题、判断题，做完马上看答案"
          onClick={() => router.push('/student/practice')}
        />
        <EntryCard
          icon={GraduationCap}
          title="专项实操"
          desc="数据清洗、标注、统计填表动手练"
          onClick={() => router.push('/student/task')}
        />
        <EntryCard
          icon={FileText}
          title="我的考试"
          desc="查看模拟考试和正式考试安排"
          onClick={() => router.push('/student/exams')}
        />
      </div>

      {/* 练习统计 */}
      {data && data.practiceStats.totalAttempts > 0 && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-bold mb-3">我的练习情况</h2>
          <div className="flex gap-8">
            <div>
              <div className="text-3xl font-bold text-primary">{data.practiceStats.totalAttempts}</div>
              <div className="text-base text-muted-foreground mt-1">已练题数</div>
            </div>
            {data.practiceStats.correctRate !== null && (
              <div>
                <div className="text-3xl font-bold text-primary">
                  {Math.round(data.practiceStats.correctRate * 100)}%
                </div>
                <div className="text-base text-muted-foreground mt-1">答对率</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EntryCard({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof BookOpen;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-4 rounded-2xl border border-border bg-card p-6 text-left hover:border-primary hover:shadow-sm focus:outline-none focus:ring-4 focus:ring-ring transition-all"
    >
      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 text-primary shrink-0">
        <Icon className="w-8 h-8" aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold">{title}</div>
        <div className="text-base text-muted-foreground mt-1.5 leading-relaxed">{desc}</div>
      </div>
    </button>
  );
}
