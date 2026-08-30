'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent } from '@/components/ui/card';
import { Star, Trophy, Flame, Wrench, Award } from 'lucide-react';

interface BadgeView {
  key: string;
  name: string;
  emoji: string;
  description: string;
  category: 'study' | 'streak' | 'task' | 'exam';
  earnedAt: string | null;
}

interface GamificationData {
  points: number;
  badges: BadgeView[];
  stats: { correctTotal: number; taskPassTotal: number; streak: number };
  rank: {
    myRank: number | null;
    totalStudents: number;
    top: Array<{ rank: number; userId: string; displayName: string; points: number; isMe: boolean }>;
  };
}

const CATEGORY_LABEL: Record<BadgeView['category'], string> = {
  study: '学习成长',
  streak: '连续挑战',
  task: '实操技能',
  exam: '考试荣誉',
};

// 各勋章的进度目标值;考试类勋章无量化进度,不入表
const PROGRESS_TARGET: Record<string, number> = {
  first_practice: 1,
  correct_50: 50,
  correct_200: 200,
  streak_10: 10,
  task_first: 1,
  task_pass_10: 10,
};

function progressPctOf(badge: BadgeView, stats: GamificationData['stats']): number | null {
  const target = PROGRESS_TARGET[badge.key];
  if (target === undefined) return null;
  const current = badge.key === 'streak_10'
    ? stats.streak
    : badge.key.startsWith('task_')
      ? stats.taskPassTotal
      : stats.correctTotal;
  return Math.min(100, Math.round((current / target) * 100));
}

function progressTextOf(badge: BadgeView, stats: GamificationData['stats']): string {
  switch (badge.key) {
    case 'first_practice': return `${Math.min(stats.correctTotal, 1)}/1`;
    case 'correct_50': return `${Math.min(stats.correctTotal, 50)}/50`;
    case 'correct_200': return `${Math.min(stats.correctTotal, 200)}/200`;
    case 'streak_10': return `连对 ${stats.streak}/10`;
    case 'task_first': return `${Math.min(stats.taskPassTotal, 1)}/1`;
    case 'task_pass_10': return `${Math.min(stats.taskPassTotal, 10)}/10`;
    default: return '参加考试,争取解锁';
  }
}

function BadgeCard({ badge, stats }: { badge: BadgeView; stats: GamificationData['stats'] }) {
  const earned = Boolean(badge.earnedAt);
  const pct = earned ? 100 : progressPctOf(badge, stats);
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${earned ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
      <span
        aria-hidden
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${earned ? 'bg-primary/10' : 'border border-dashed border-primary/60 bg-muted'}`}
      >
        {earned ? badge.emoji : <span className="grayscale opacity-50">{badge.emoji}</span>}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-semibold leading-snug">{badge.name}</div>
        <p className="text-base leading-snug text-muted-foreground">{badge.description}</p>
        {earned ? (
          <p className="mt-1.5 text-sm font-medium text-success">
            ✓ 已获得{badge.earnedAt ? ` · ${new Date(badge.earnedAt).toLocaleDateString('zh-CN')}` : ''}
          </p>
        ) : pct !== null ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-sm text-muted-foreground">{progressTextOf(badge, stats)}</span>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">{progressTextOf(badge, stats)}</p>
        )}
      </div>
    </div>
  );
}

export default function BadgesPage() {
  const [data, setData] = useState<GamificationData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<GamificationData>('/api/student/gamification').then(r => {
      if (r.ok && r.data) setData(r.data);
      else setError(r.error ?? '加载失败，请稍后重试');
    });
  }, []);

  if (error) return <div className="py-16 text-center text-lg text-destructive">{error}</div>;
  if (!data) return <div className="py-16 text-center text-lg text-muted-foreground">加载中…</div>;

  const earnedCount = data.badges.filter(b => b.earnedAt).length;
  const categories: BadgeView['category'][] = ['study', 'streak', 'task', 'exam'];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-1 text-3xl font-bold">我的勋章</h1>
      <p className="mb-6 text-base text-muted-foreground">坚持练习、提高正确率，收集全部 {data.badges.length} 枚勋章</p>

      {/* 积分与进度总览:已获勋章为主卡,其余为次卡 */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Trophy className="h-4 w-4" aria-hidden /> 已获勋章
          </div>
          <div className="mt-2 leading-none">
            <span className="text-3xl font-bold">{earnedCount}</span>
            <span className="text-xl font-semibold"> / {data.badges.length}</span>
          </div>
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {data.badges.map((_, i) => (
              <span key={i} className={`h-2 flex-1 rounded-full ${i < earnedCount ? 'bg-primary-foreground' : 'bg-primary-foreground/40'}`} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Star className="h-4 w-4 text-warning" aria-hidden /> 我的积分
          </div>
          <div className="mt-2 text-2xl font-bold leading-none">{data.points}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Flame className="h-4 w-4 text-accent" aria-hidden /> 当前连对
          </div>
          <div className="mt-2 text-2xl font-bold leading-none">{data.stats.streak}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wrench className="h-4 w-4 text-success" aria-hidden /> 实操通过
          </div>
          <div className="mt-2 text-2xl font-bold leading-none">{data.stats.taskPassTotal}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 勋章墙 */}
        <div className="space-y-6">
          {categories.map(category => (
            <div key={category}>
              <h2 className="mb-3 text-xl font-semibold">{CATEGORY_LABEL[category]}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.badges.filter(b => b.category === category).map(badge => (
                  <BadgeCard key={badge.key} badge={badge} stats={data.stats} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 班级排行榜 */}
        <Card className="h-fit">
          <CardContent className="py-5">
            <h2 className="mb-1 flex items-center gap-2 text-xl font-semibold">
              <Award className="h-5 w-5 text-primary" aria-hidden /> 班级排行
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              按积分排名，共 {data.rank.totalStudents} 人
              {data.rank.myRank ? ` · 我第 ${data.rank.myRank} 名` : ''}
            </p>
            {data.rank.totalStudents === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">暂无班级排名数据</p>
            ) : (
              <ol className="space-y-1">
                {data.rank.top.map(row => (
                  <li
                    key={row.userId}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${row.isMe ? 'bg-primary/10 font-medium' : ''}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${row.rank <= 3 ? 'bg-warning/15 text-warning-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {row.rank}
                      </span>
                      {row.displayName}{row.isMe ? '（我）' : ''}
                    </span>
                    <span className="text-sm">{row.points} 分</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
