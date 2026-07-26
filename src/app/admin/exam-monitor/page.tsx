'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent } from '@/components/ui/card';
import { MonitorCheck, Users, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { EXAM_STATUS_LABELS, type ExamStatus } from '@/lib/constants';

interface Schedule {
  id: string;
  title: string;
  cohortName: string;
  examStartAt: string;
  examEndAt: string;
  durationMinutes: number | null;
  lateEntryMinutes: number;
  status: string;
  attemptCount: number;
  submittedCount?: number;
  resultsReleased: boolean;
}

export default function ExamMonitorPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  // 初始值直接取当前时间(纯客户端组件), 避免首帧全部显示"加载中"。
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    apiFetch<Schedule[]>('/api/admin/exam-schedules').then(r => {
      if (r.ok && r.data) {
        // 只显示即将开始或进行中的考试。历史上过滤条件用了状态机里不存在的
        // in_progress, 真正的进行中状态 exam_open 反被滤掉, 监控页永远空白。
        setSchedules(r.data.filter(s =>
          ['published', 'waiting', 'practice_locked', 'exam_open'].includes(s.status)
        ));
      }
      setLoading(false);
    });
  }, []);

  const getTimeStatus = (s: Schedule) => {
    if (!now) return { label: '加载中', color: 'text-muted-foreground', icon: Clock };
    const start = new Date(s.examStartAt).getTime();
    const end = new Date(s.examEndAt).getTime();
    if (now < start) return { label: '未开始', color: 'text-warning', icon: Clock };
    if (now >= start && now <= end) return { label: '进行中', color: 'text-success', icon: MonitorCheck };
    return { label: '已结束', color: 'text-muted-foreground', icon: CheckCircle2 };
  };

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">考试监控</h1>

      {schedules.length === 0 ? (
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <div className="text-lg text-gray-500">当前没有正在进行的考试</div>
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map(s => {
            const ts = getTimeStatus(s);
            const TimeIcon = ts.icon;
            return (
              <Card key={s.id}>
                <CardContent className="py-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <TimeIcon className={`w-6 h-6 ${ts.color}`} />
                      </div>
                      <div>
                        <div className="text-lg font-medium">{s.title}</div>
                        <div className="text-base text-gray-500 mt-1">
                          {s.cohortName} · {new Date(s.examStartAt).toLocaleString('zh-CN')} ~ {new Date(s.examEndAt).toLocaleString('zh-CN')}
                        </div>
                        <div className="text-base mt-2">
                          {s.durationMinutes ?? 90} 分钟 · 迟到入场 {s.lateEntryMinutes ?? 15} 分钟
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${ts.color}`}>{ts.label}</div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 text-gray-500">
                        <Users className="w-4 h-4" /> 已交卷
                      </div>
                      <div className="text-2xl font-bold mt-1">{s.submittedCount ?? 0}<span className="text-base font-normal text-gray-400">/{s.attemptCount}</span></div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 text-gray-500">
                        <CheckCircle2 className="w-4 h-4" /> 成绩释放
                      </div>
                      <div className="text-2xl font-bold mt-1">{s.resultsReleased ? '是' : '否'}</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 text-gray-500">
                        <Clock className="w-4 h-4" /> 状态
                      </div>
                      <div className="text-lg font-medium mt-1">{EXAM_STATUS_LABELS[s.status as ExamStatus] ?? s.status}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
