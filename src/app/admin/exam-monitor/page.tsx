'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent } from '@/components/ui/card';
import { MonitorCheck, Users, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

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
  resultsReleased: boolean;
}

interface HeartbeatInfo {
  scheduleId: string;
  onlineCount: number;
  submittedCount: number;
}

export default function ExamMonitorPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    apiFetch<Schedule[]>('/api/admin/exam-schedules').then(r => {
      if (r.ok && r.data) {
        // 只显示正在进行或即将开始的考试
        setSchedules(r.data.filter(s =>
          s.status === 'published' || s.status === 'in_progress' || s.status === 'draft'
        ));
      }
      setLoading(false);
    });
  }, []);

  const getTimeStatus = (s: Schedule) => {
    if (!now) return { label: '加载中', color: 'text-gray-400', icon: Clock };
    const start = new Date(s.examStartAt).getTime();
    const end = new Date(s.examEndAt).getTime();
    if (now < start) return { label: '未开始', color: 'text-yellow-600', icon: Clock };
    if (now >= start && now <= end) return { label: '进行中', color: 'text-green-600', icon: MonitorCheck };
    return { label: '已结束', color: 'text-gray-400', icon: CheckCircle2 };
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
                      <div className="text-2xl font-bold mt-1">{s.attemptCount}</div>
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
                      <div className="text-lg font-medium mt-1">{s.status}</div>
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
