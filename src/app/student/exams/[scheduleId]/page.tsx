'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

interface ExamQuestion {
  id: string;
  question_type: string;
  stem: string;
  options: Record<string, string>;
  score: number;
  section: string;
}

export default function ExamTakePage() {
  const params = useParams();
  const router = useRouter();
  const scheduleId = params.scheduleId as string;

  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [results, setResults] = useState<{
    total: number;
    correct: number;
    score: number;
    passed: boolean;
  } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(90);

  // Fetch exam questions
  const fetchQuestions = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      // 先尝试开始考试
      const startRes = await fetch('/api/student/exams/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scheduleId }),
      });
      const startData = await startRes.json();
      if (startData.success) {
        setAttemptId(startData.data.attemptId);
      } else if (startRes.status !== 400 || !startData.error?.includes('已提交')) {
        // 非已提交错误才提示
        toast.error('开始考试失败', { description: startData.error });
      }

      // 获取题目
      const res = await fetch(`/api/student/exams/questions?scheduleId=${scheduleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setQuestions(data.data.questions);
        setDurationMinutes(data.data.durationMinutes ?? 90);
        setTimeLeft((data.data.durationMinutes ?? 90) * 60);
      } else {
        toast.error('加载失败', { description: data.error });
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || submitted) return;
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(t => (t ?? 0) - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, submitted]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAnswer = (questionId: string, answer: string) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/student/exams/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scheduleId,
          answers: Object.entries(answers).map(([questionId, answer]) => ({
            questionId,
            answer,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResults(data.data);
        setSubmitted(true);
        toast.success('交卷成功', { description: `得分: ${data.data.score}分${data.data.passed ? ' - 通过' : ' - 未通过'}` });
      } else {
        toast.error('交卷失败', { description: data.error });
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-lg text-gray-500">加载试卷中...</div>;
  }

  // Results view
  if (submitted && results) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-6">
        <div className="text-7xl font-bold text-primary">{results.score}</div>
        <div className="text-xl text-gray-600">分</div>
        <div className="flex justify-center gap-8 text-base">
          <div>总题数: {results.total}</div>
          <div>答对: {results.correct}</div>
          <div>正确率: {results.total > 0 ? Math.round(results.correct / results.total * 100) : 0}%</div>
        </div>
        <div className={`inline-block px-6 py-2 rounded-full text-lg font-medium ${
          results.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {results.passed ? '✓ 通过' : '✗ 未通过'}
        </div>
        <div>
          <Button size="lg" onClick={() => router.push('/student/exams')} className="text-lg px-8 py-3">
            返回考试列表
          </Button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  if (!currentQ) return <div className="text-center py-12">试卷暂无题目</div>;

  const answeredCount = Object.keys(answers).length;
  const isTrueFalse = currentQ.question_type === 'true_false';
  const tfOptions: Record<string, string> = { A: '正确', B: '错误' };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between bg-white border rounded-lg px-6 py-3">
        <div className="text-base font-medium">
          第 {currentIndex + 1} / {questions.length} 题
        </div>
        <div className="text-base">
          已答: {answeredCount} / {questions.length}
        </div>
        {timeLeft !== null && (
          <div className={`text-lg font-mono font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-primary'}`}>
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {/* Question */}
      <Card>
        <CardContent className="py-8 px-6 space-y-6">
          <div className="flex items-start justify-between">
            <p className="text-xl font-medium leading-relaxed flex-1">{currentQ.stem}</p>
            <span className="text-sm text-gray-400 ml-4 shrink-0">{currentQ.score}分</span>
          </div>

          <div className="space-y-3">
            {Object.entries(isTrueFalse ? tfOptions : currentQ.options).map(([key, text]) => {
              const isSelected = answers[currentQ.id] === key;
              return (
                <button
                  key={key}
                  onClick={() => handleAnswer(currentQ.id, key)}
                  disabled={submitted}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 text-lg transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5 font-medium'
                      : 'border-gray-200 hover:border-primary/40 hover:bg-gray-50'
                  }`}
                >
                  <span className="inline-block w-8 font-bold text-primary">{key}.</span>
                  {text}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="lg"
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="text-base px-6"
        >
          上一题
        </Button>

        <div className="flex gap-2 flex-wrap justify-center max-w-md">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                i === currentIndex
                  ? 'bg-primary text-white'
                  : answers[questions[i].id]
                    ? 'bg-primary/20 text-primary'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {currentIndex < questions.length - 1 ? (
          <Button
            size="lg"
            onClick={() => setCurrentIndex(i => i + 1)}
            className="text-base px-6"
          >
            下一题
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
            className="text-base px-6 bg-accent hover:bg-accent/90"
          >
            {submitting ? '交卷中...' : '交卷'}
          </Button>
        )}
      </div>

      {/* Bottom submit bar */}
      {answeredCount > 0 && !submitted && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-6 py-3 flex items-center justify-center z-50">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
            className="text-lg px-12 py-4 bg-accent hover:bg-accent/90"
          >
            {submitting ? '交卷中...' : `交卷（已答 ${answeredCount}/${questions.length}）`}
          </Button>
        </div>
      )}
    </div>
  );
}
