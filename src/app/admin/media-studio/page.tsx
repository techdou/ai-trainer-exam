'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Image, Wrench } from 'lucide-react';

export default function MediaStudioPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">素材工坊</h1>
      <p className="text-base text-gray-500 mb-6">管理题目用到的图片、音频等素材文件</p>
      <Card>
        <CardContent className="py-12 text-center">
          <Image className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <div className="text-lg text-gray-500">素材工坊开发中</div>
          <p className="text-base text-gray-400 mt-1">将支持图片标注、音频转写等实操题目的素材上传与管理</p>
        </CardContent>
      </Card>
    </div>
  );
}
