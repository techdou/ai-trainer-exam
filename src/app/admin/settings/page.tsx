'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">系统设置</h1>
      <p className="text-base text-gray-500 mb-6">管理系统全局配置</p>
      <Card>
        <CardContent className="py-12 text-center">
          <Settings className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <div className="text-lg text-gray-500">系统设置开发中</div>
          <p className="text-base text-gray-400 mt-1">将支持考试时间规则、密码策略、系统参数等配置</p>
        </CardContent>
      </Card>
    </div>
  );
}
