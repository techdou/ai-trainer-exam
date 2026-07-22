'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

interface Student {
  id: string;
  display_name: string;
  email: string;
  totalAttempts: number;
  correctRate: number | null;
}

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const _t = toast;

  const fetchStudents = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/teacher/students', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setStudents(data.data.items || []);
    } catch {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">学员管理</h1>

      {students.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg text-gray-500">暂无学员</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-4 font-semibold">姓名</th>
                <th className="text-left p-4 font-semibold">邮箱</th>
                <th className="text-center p-4 font-semibold">练习次数</th>
                <th className="text-center p-4 font-semibold">正确率</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 font-medium">{s.display_name || '未设置'}</td>
                  <td className="p-4 text-gray-600">{s.email}</td>
                  <td className="p-4 text-center">{s.totalAttempts}</td>
                  <td className="p-4 text-center">
                    {s.correctRate !== null ? (
                      <span className={s.correctRate >= 60 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                        {s.correctRate}%
                      </span>
                    ) : (
                      <span className="text-gray-400">未练习</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
