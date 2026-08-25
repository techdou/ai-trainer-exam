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

function progressOf(badge: BadgeView, stats: GamificationData['stats']): string {
  if (badge.earnedAt) return '已获得';
  switch (badge.key) {
    case 'first_practice': return `进度 ${Math.min(stats.correctTotal, 1)}/1`;
    case 'correct_50': return `进度 ${Math.min(stats.correctTotal, 50)}/50`;
    case 'correct_200': return `进度 ${Math.min(stats.correctTotal, 200)}/200`;
    case 'streak_10': return `当前连对 ${stats.streak}/10`;
    case 'task_first': return `进度 ${Math.min(stats.taskPassTotal, 1)}/1`;
    case 'task_pass_10': return `进度 ${Math.min(stats.taskPassTotal, 10)}/10`;
    default: return '参加考试争取吧';
  }
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
      <h1 className="mb-1 text-2xl font-bold">我的勋章</h1>
      <p className="mb-6 text-base text-muted-foreground">坚持练习、提高正确率，收集全部 {data.badges.length} 枚勋章</p>

      {/* 积分与进度总览 */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 py-4">
          <Star className="h-8 w-8 text-warning" aria-hidden />
          <div><div className="text-2xl font-bold">{data.points}</div><div className="text-sm text-muted-foreground">我的积分</div></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 py-4">
          <Trophy className="h-8 w-8 text-primary" aria-hidden />
          <div><div className="text-2xl font-bold">{earnedCount}/{data.badges.length}</div><div className="text-sm text-muted-foreground">已获勋章</div></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 py-4">
          <Flame className="h-8 w-8 text-destructive" aria-hidden />
          <div><div className="text-2xl font-bold">{data.stats.streak}</div><div className="text-sm text-muted-foreground">当前连对</div></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 py-4">
          <Wrench className="h-8 w-8 text-success" aria-hidden />
          <div><div className="text-2xl font-bold">{data.stats.taskPassTotal}</div><div className="text-sm text-muted-foreground">实操通过</div></div>
        </CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 勋章墙 */}
        <div className="space-y-6">
          {categories.map(category => (
            <div key={category}>
              <h2 className="mb-3 text-lg font-semibold">{CATEGORY_LABEL[category]}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.badges.filter(b => b.category === category).map(badge => {
                  const earned = Boolean(badge.earnedAt);
                  return (
                    <div
                      key={badge.key}
                      className={`flex items-center gap-3 rounded-xl border p-4 ${earned ? 'border-primary/40 bg-primary/5' : 'border-border opacity-70'}`}
                    >
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${earned ? 'bg-primary/10' : 'bg-muted grayscale'}`} aria-hidden>
                        {badge.emoji}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{badge.name}</span>
                          {earned && <span className="text-xs text-success">✓ 已获得</span>}
                        </div>
                        <p className="text-sm text-muted-foreground">{badge.description}</p>
                        {!earned && <p className="mt-0.5 text-xs text-muted-foreground">{progressOf(badge, data.stats)}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 班级排行榜 */}
        <Card className="h-fit">
          <CardContent className="py-5">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
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
