'use client';
import { Card, CardContent } from '@/components/ui/card';
import { SlidersHorizontal } from 'lucide-react';

export default function GradingCalibrationPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">评分校准</h1>
      <p className="text-base text-gray-500 mb-6">校准各题型评分引擎的参数与阈值</p>
      <Card>
        <CardContent className="py-12 text-center">
          <SlidersHorizontal className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <div className="text-lg text-gray-500">评分校准开发中</div>
          <p className="text-base text-gray-400 mt-1">将支持配置各实操题型的评分规则与容错阈值</p>
        </CardContent>
      </Card>
    </div>
  );
}
