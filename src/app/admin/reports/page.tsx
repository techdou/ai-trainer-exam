'use client';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export default function ReportsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">报表导出</h1>
      <p className="text-base text-gray-500 mb-6">导出成绩、考勤、题库统计等报表</p>
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <div className="text-lg text-gray-500">报表导出开发中</div>
          <p className="text-base text-gray-400 mt-1">将支持导出学员成绩、考试统计、题目分析等Excel报表</p>
        </CardContent>
      </Card>
    </div>
  );
}
