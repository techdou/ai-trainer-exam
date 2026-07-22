'use client';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollText } from 'lucide-react';

export default function AuditPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">审计日志</h1>
      <p className="text-base text-gray-500 mb-6">查看系统操作记录</p>
      <Card>
        <CardContent className="py-12 text-center">
          <ScrollText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <div className="text-lg text-gray-500">审计日志开发中</div>
          <p className="text-base text-gray-400 mt-1">将记录所有关键操作，包括登录、题目修改、考试安排等</p>
        </CardContent>
      </Card>
    </div>
  );
}
