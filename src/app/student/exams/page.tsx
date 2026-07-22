'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/session-client';

interface ExamInfo {
  id: string;
  title: string;
  examOpenAt: string;
  examCloseAt: string;
  durationMinutes: number;
  timeStatus: 'upcoming' | 'open' | 'closed';
  attempt: { id: string; status: string; startedAt: string; submittedAt: string | null } | null;
}

export default function ExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ExamInfo[]>('/api/student/exams').then(r => {
      if (r.ok && r.data) setExams(r.data);
      setLoading(false);
    });
  }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const statusBadge = (exam: ExamInfo) => {
    if (exam.attempt?.status === 'submitted') {
      return <span className="px-3 py-1 rounded-lg bg-gray-200 text-gray-700 font-medium text-base">已交卷</span>;
    }
    if (exam.timeStatus === 'upcoming') {
      return <span className="px-3 py-1 rounded-lg bg-blue-100 text-blue-700 font-medium text-base">未开始</span>;
    }
    if (exam.timeStatus === 'open') {
      return <span className="px-3 py-1 rounded-lg bg-green-100 text-green-700 font-medium text-base">进行中</span>;
    }
    return <span className="px-3 py-1 rounded-lg bg-gray-200 text-gray-700 font-medium text-base">已结束</span>;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/student/home')}
          className="text-[oklch(0.45_0.09_175)] hover:underline text-lg"
        >
          ← 返回
        </button>
        <h1 className="text-2xl font-bold">我的考试</h1>
      </div>

      {loading ? (
        <div className="text-center py-12 text-lg text-gray-500">加载中…</div>
      ) : exams.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg text-gray-500">暂无考试安排</p>
          <p className="text-sm text-gray-400 mt-2">请等待老师安排考试</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {exams.map(exam => (
            <div
              key={exam.id}
              className="p-5 rounded-xl border-2 border-[oklch(0.90_0.02_95)] bg-white"
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold">{exam.title}</h2>
                {statusBadge(exam)}
              </div>
              <div className="text-base text-gray-600 space-y-1">
                <p>开考时间：{formatTime(exam.examOpenAt)}</p>
                <p>截止时间：{formatTime(exam.examCloseAt)}</p>
                <p>考试时长：{exam.durationMinutes} 分钟</p>
              </div>
              {exam.timeStatus === 'open' && !exam.attempt && (
                <button
                  onClick={() => router.push(`/student/exams/${exam.id}`)}
                  className="mt-4 px-6 py-3 rounded-lg bg-[oklch(0.45_0.09_175)] text-white font-bold text-lg hover:opacity-90 transition-opacity"
                >
                  进入考试
                </button>
              )}
              {exam.attempt?.status === 'submitted' && (
                <button
                  onClick={() => router.push(`/student/results?examId=${exam.id}`)}
                  className="mt-4 px-6 py-3 rounded-lg border-2 border-[oklch(0.45_0.09_175)] text-[oklch(0.45_0.09_175)] font-bold text-lg hover:bg-[oklch(0.96_0.02_155)] transition-colors"
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
