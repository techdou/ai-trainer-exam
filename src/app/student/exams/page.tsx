'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/session-client';
import { Clock, PlayCircle, CheckCircle2, RotateCcw, AlertCircle } from 'lucide-react';

interface ExamInfo {
  id: string;
  title: string;
  examStartAt: string;
  examEndAt: string;
  durationMinutes: number;
  timeStatus: 'upcoming' | 'open' | 'closed';
  canEnter: boolean;
  attempt: { id: string; status: string; startedAt: string; submittedAt: string | null } | null;
}

export default function ExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadExams = () => {
    setLoading(true);
    setError(null);
    apiFetch<ExamInfo[]>('/api/student/exams').then(r => {
      if (r.ok && r.data) {
        setExams(r.data);
      } else {
        setError(r.error || '加载考试失败，请稍后重试');
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    loadExams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const statusBadge = (exam: ExamInfo) => {
    // 超宽限未交卷的 attempt 由服务端落为 expired(按 0 分缺考),需要独立于"已交卷"展示。
    if (exam.attempt?.status === 'expired') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-muted text-muted-foreground font-medium text-base">
          <AlertCircle className="w-4 h-4" aria-hidden /> 已结束（超时未交，按缺考计）
        </span>
      );
    }
    // 交卷后服务端状态机为 submitted/grading/graded/released,都按“已交卷”展示。
    if (exam.attempt && ['submitted', 'grading', 'graded', 'released'].includes(exam.attempt.status)) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-muted text-muted-foreground font-medium text-base">
          <CheckCircle2 className="w-4 h-4" aria-hidden /> 已交卷
        </span>
      );
    }
    if (exam.timeStatus === 'upcoming') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-muted text-muted-foreground font-medium text-base">
          <Clock className="w-4 h-4" aria-hidden /> 未开始
        </span>
      );
    }
    if (exam.timeStatus === 'open') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-success/10 text-success font-medium text-base">
          <PlayCircle className="w-4 h-4" aria-hidden /> 进行中
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-muted text-muted-foreground font-medium text-base">
        <CheckCircle2 className="w-4 h-4" aria-hidden /> 已结束
      </span>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/student/home')}
          className="text-primary hover:underline text-lg"
        >
          ← 返回
        </button>
        <h1 className="text-2xl font-bold">我的考试</h1>
      </div>

      {loading ? (
        <div className="text-center py-12 text-lg text-muted-foreground">加载中…</div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-lg text-destructive mb-3">{error}</p>
          <button
            onClick={loadExams}
            className="inline-flex items-center gap-1 px-5 py-2.5 rounded-lg border-2 border-primary text-primary font-medium hover:bg-secondary transition-colors"
          >
            <RotateCcw className="w-4 h-4" aria-hidden /> 重试
          </button>
        </div>
      ) : exams.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground">暂无考试安排</p>
          <p className="text-base text-muted-foreground mt-2">请等待老师安排考试</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {exams.map(exam => (
            <div
              key={exam.id}
              className="p-5 rounded-xl border-2 border-border bg-white"
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold">{exam.title}</h2>
                {statusBadge(exam)}
              </div>
              <div className="text-base text-gray-600 space-y-1">
                <p>开考时间：{formatTime(exam.examStartAt)}</p>
                <p>截止时间：{formatTime(exam.examEndAt)}</p>
                <p>考试时长：{exam.durationMinutes} 分钟</p>
              </div>
              {/* canEnter 由后端按迟到窗口(late_entry_minutes)算好,别在前端重算一遍造成规则漂移 */}
              {exam.canEnter && !exam.attempt && (
                <button
                  onClick={() => router.push(`/student/exams/${exam.id}`)}
                  className="mt-4 px-6 py-3 rounded-lg bg-primary text-white font-bold text-lg hover:opacity-90 transition-opacity"
                >
                  进入考试
                </button>
              )}
              {exam.timeStatus === 'open' && !exam.attempt && !exam.canEnter && (
                <p className="mt-4 px-6 py-3 rounded-lg bg-muted text-muted-foreground font-medium text-base">
                  已超过本场考试的迟到入场时间，无法进入。如有疑问请联系监考老师。
                </p>
              )}
              {/* 已开考未交卷: 刷新/断线后必须能回到考试(start 接口对 in_progress 幂等恢复) */}
              {exam.attempt?.status === 'in_progress' && (
                <button
                  onClick={() => router.push(`/student/exams/${exam.id}`)}
                  className="mt-4 px-6 py-3 rounded-lg bg-primary text-white font-bold text-lg hover:opacity-90 transition-opacity"
                >
                  继续考试
                </button>
              )}
              {exam.attempt && ['submitted', 'grading', 'graded', 'released'].includes(exam.attempt.status) && (
                <button
                  onClick={() => router.push(`/student/results?examId=${exam.id}`)}
                  className="mt-4 px-6 py-3 rounded-lg border-2 border-primary text-primary font-bold text-lg hover:bg-secondary transition-colors"
                >
                  查看成绩
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
