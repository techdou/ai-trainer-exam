'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [bankType, setBankType] = useState<'practice' | 'exam'>('practice');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    duplicates: number;
    errors: string[];
    totalParsed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) {
      setError('请先选择文件');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('bankType', bankType);

    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || '导入失败');
      } else {
        setResult(data.data);
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">DOCX 题库导入</h1>
        <p className="mt-1 text-base text-gray-600">
          导入后题目进入「待清洗」状态，需经审核后才能发布。
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <label className="mb-2 block text-base font-medium text-gray-700">
            题库类型
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="bankType"
                value="practice"
                checked={bankType === 'practice'}
                onChange={(e) => setBankType(e.target.value as 'practice')}
                className="h-5 w-5"
              />
              <span className="text-base">练习库</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="bankType"
                value="exam"
                checked={bankType === 'exam'}
                onChange={(e) => setBankType(e.target.value as 'exam')}
                className="h-5 w-5"
              />
              <span className="text-base">考试库</span>
            </label>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-base font-medium text-gray-700">
            选择 DOCX 文件
          </label>
          <input
            type="file"
            accept=".docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-base text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-white file:cursor-pointer"
          />
          <p className="mt-1 text-sm text-gray-500">
            支持 .docx 格式，自动识别单选题和判断题
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-base text-red-800">✗ {error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="rounded-md bg-primary px-6 py-3 text-base font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition"
          >
            {loading ? '正在导入...' : '开始导入'}
          </button>
          <button
            onClick={() => router.push('/admin/practice-bank')}
            className="rounded-md border border-gray-300 px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            查看题库
          </button>
        </div>
      </div>

      {result && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">导入结果</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-md bg-blue-50 p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{result.totalParsed}</div>
              <div className="text-sm text-gray-600">解析总数</div>
            </div>
            <div className="rounded-md bg-green-50 p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{result.inserted}</div>
              <div className="text-sm text-gray-600">✓ 成功导入</div>
            </div>
            <div className="rounded-md bg-orange-50 p-3 text-center">
              <div className="text-2xl font-bold text-orange-700">{result.skipped}</div>
              <div className="text-sm text-gray-600">跳过</div>
            </div>
            <div className="rounded-md bg-yellow-50 p-3 text-center">
              <div className="text-2xl font-bold text-yellow-700">{result.duplicates}</div>
              <div className="text-sm text-gray-600">重复题</div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <p className="text-sm font-medium text-red-800 mb-1">错误详情：</p>
              <ul className="text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
