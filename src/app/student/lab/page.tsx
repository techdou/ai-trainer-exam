'use client';

/**
 * AI 实训课堂: 五步分步教学,核心是"标注 → 训练 → 观察结果 → 改标注 → 再训练"的反馈闭环,
 * 让零基础学员亲手体会"训练数据质量决定模型效果"(AI 训练师职业的核心)。
 * 模型为纯前端朴素贝叶斯(字符 bigram 词袋 + 拉普拉斯平滑),不依赖后端。
 * 进度存 localStorage,关掉页面不丢。
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, Pencil, Rocket, LineChart, Lightbulb, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';

const STORAGE_KEY = 'examsys.lab.v1';

/** 训练样本: 商品评论二分类。第 6、14 条故意选"易标错"样本,全标对时测试集可达 8/8。 */
const TRAINING_SAMPLES: Array<{ id: number; text: string; hint: string }> = [
  { id: 1, text: '这个保温杯质量很好，保温一整天都没问题。', hint: '注意"质量很好""没问题"这类直接评价' },
  { id: 2, text: '快递三天才到，包装还破了个角，太失望了。', hint: '到货慢 + 包装破损，是购买体验的负面评价' },
  { id: 3, text: '客服态度特别好，问了好几个问题都耐心解答。', hint: '关键词"态度好""耐心"' },
  { id: 4, text: '用了两天就坏了，找售后还推三阻四。', hint: '"两天就坏""推三阻四"都是负面信号' },
  { id: 5, text: '性价比超高，同事看了也想买一个。', hint: '"性价比高""想买"是典型的正面评价' },
  { id: 6, text: '不得不说，这个手机确实很难用，卡顿严重。', hint: '小心！"不得不说"是加强语气，重点看后面"很难用"' },
  { id: 7, text: '颜色和图片一模一样，做工也很精细。', hint: '"一模一样""精细"都是满意的表达' },
  { id: 8, text: '味道还行，但是分量太少了，不值这个价。', hint: '"还行"只是勉强，"不值"才是重点' },
  { id: 9, text: '第二次回购了，家里人都说好用。', hint: '"回购""好用"是最强的正面信号' },
  { id: 10, text: '屏幕有坏点，申请换货等了一个星期。', hint: '商品瑕疵 + 售后慢' },
  { id: 11, text: '物流很快，当天下单当天到，点赞！', hint: '"很快""点赞"' },
  { id: 12, text: '说明书写得乱七八糟，看半天没搞明白怎么装。', hint: '"乱七八糟"是对产品的负面评价' },
  { id: 13, text: '给孩子买的，孩子非常喜欢，天天抱着不撒手。', hint: '使用者的真实反应是最可靠的判断依据' },
  { id: 14, text: '不是我说，这做工也太粗糙了，缝线都歪的。', hint: '小心！"不是我说"是口头语，重点看"粗糙""歪"' },
  { id: 15, text: '静音效果出乎意料的好，晚上睡觉完全听不到噪音。', hint: '"出乎意料的好"是惊喜' },
  { id: 16, text: '充电十分钟就没电了，电池明显是翻新的。', hint: '质量问题 + 疑似假货' },
  { id: 17, text: '包装很用心，还送了小礼物，好评！', hint: '"用心""好评"直接给了答案' },
  { id: 18, text: '和描述严重不符，图上是纯棉，收到是化纤的。', hint: '"严重不符"是虚假宣传的控诉' },
  { id: 19, text: '老人一学就会，字体大、声音清楚，很贴心。', hint: '"一学就会""贴心"' },
  { id: 20, text: '刚用就掉漆，客服还说是我自己摔的，气死了。', hint: '质量 + 售后双差评' },
];

/** 测试集: 学员看不到答案,步骤 4 用于检验模型效果。 */
const TEST_SAMPLES: Array<{ id: number; text: string; truth: Label }> = [
  { id: 101, text: '音质非常好，低音震撼，这个价格无敌了。', truth: 'good' },
  { id: 102, text: '鞋底开胶了，才穿一个星期，质量太差。', truth: 'bad' },
  { id: 103, text: '不得不说，这个背包是真的能装，出差神器。', truth: 'good' },
  { id: 104, text: '客服爱答不理，问了半天就回一句"看说明书"。', truth: 'bad' },
  { id: 105, text: '分辨率很清晰，孩子上网课看久了眼睛也不累。', truth: 'good' },
  { id: 106, text: '不是我说，这耳机续航太拉垮了，半天就没电。', truth: 'bad' },
  { id: 107, text: '已经推荐给三个朋友了，都说买得值。', truth: 'good' },
  { id: 108, text: '尺寸严重偏小，穿不上，退货还要自己付运费。', truth: 'bad' },
];

type Label = 'good' | 'bad';
type LabState = { step: number; labels: Record<number, Label>; completed: boolean };

const STEPS = [
  { title: '认识任务', icon: BookOpen },
  { title: '动手标注', icon: Pencil },
  { title: '训练模型', icon: Rocket },
  { title: '看结果', icon: LineChart },
  { title: '总结', icon: Lightbulb },
];

/* ---------- 朴素贝叶斯(字符 bigram 词袋 + 拉普拉斯平滑) ---------- */

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[\s，。！？、,.!?]/g, '');
  const tokens: string[] = [];
  for (let i = 0; i < normalized.length - 1; i++) tokens.push(normalized.slice(i, i + 2));
  return tokens;
}

function trainNaiveBayes(samples: Array<{ text: string; label: Label }>) {
  const counts: Record<Label, Record<string, number>> = { good: {}, bad: {} };
  const totals: Record<Label, number> = { good: 0, bad: 0 };
  const docCount: Record<Label, number> = { good: 0, bad: 0 };
  for (const s of samples) {
    docCount[s.label]++;
    for (const token of tokenize(s.text)) {
      counts[s.label][token] = (counts[s.label][token] ?? 0) + 1;
      totals[s.label]++;
    }
  }
  const vocabulary = new Set([...Object.keys(counts.good), ...Object.keys(counts.bad)]);
  return { counts, totals, docCount, vocabSize: vocabulary.size };
}

function predict(model: ReturnType<typeof trainNaiveBayes>, text: string): Label {
  const tokens = tokenize(text);
  const total = model.docCount.good + model.docCount.bad;
  if (total === 0) return 'good';
  const logScore = (label: Label) => {
    // 先验 + 拉普拉斯平滑的条件概率,取对数避免连乘下溢。
    let score = Math.log((model.docCount[label] + 1) / (total + 2));
    for (const token of tokens) {
      score += Math.log(((model.counts[label][token] ?? 0) + 1) / (model.totals[label] + model.vocabSize + 1));
    }
    return score;
  };
  return logScore('good') >= logScore('bad') ? 'good' : 'bad';
}

/* ---------- 页面 ---------- */

export default function LabPage() {
  const [state, setState] = useState<LabState>({ step: 1, labels: {}, completed: false });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw) as LabState);
    } catch { /* 损坏的本地数据直接重置 */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, loaded]);

  const labeledCount = Object.keys(state.labels).length;
  const trainingData = useMemo(
    () => TRAINING_SAMPLES.filter(s => state.labels[s.id]).map(s => ({ text: s.text, label: state.labels[s.id] })),
    [state.labels],
  );
  const results = useMemo(() => {
    if (!trainingData.length) return [];
    const model = trainNaiveBayes(trainingData);
    return TEST_SAMPLES.map(t => ({ ...t, prediction: predict(model, t.text) }));
  }, [trainingData]);
  const accuracy = results.length ? results.filter(r => r.prediction === r.truth).length / results.length : 0;

  const goto = (step: number) => setState(prev => ({ ...prev, step }));

  if (!loaded) return <div className="py-16 text-center text-lg text-muted-foreground">加载中…</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold">AI 实训课堂</h1>
      <p className="mb-6 text-base text-muted-foreground">亲手训练一个 AI 模型，体会「训练数据的质量决定模型的好坏」</p>

      {/* 步骤进度条: 完成打勾,当前高亮 */}
      <div className="mb-6 flex items-center justify-between gap-1">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < state.step || (n === 5 && state.completed);
          const active = n === state.step;
          const Icon = s.icon;
          return (
            <button
              key={n}
              onClick={() => n <= state.step && goto(n)}
              disabled={n > state.step}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-sm transition-colors ${
                active ? 'bg-primary/10 font-semibold text-primary' : done ? 'text-muted-foreground' : 'text-muted-foreground/50'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="flex items-center gap-1">
                {done && <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />}
                {n}. {s.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* 步骤 1: 认识任务 */}
      {state.step === 1 && (
        <Card><CardContent className="space-y-4 py-6">
          <h2 className="text-xl font-bold">AI 是怎么「学会」判断好坏的？</h2>
          <p className="text-lg leading-relaxed">
            人工智能模型本身什么都不会。它靠<strong>大量人工标注的示例</strong>来学习——
            这就是人工智能训练师最重要的工作：给数据打上正确的标签。
          </p>
          <div className="rounded-lg border bg-secondary/30 p-4">
            <p className="mb-2 font-medium">接下来的任务</p>
            <p className="text-lg leading-relaxed">
              有 <strong>20 条商品评价</strong>需要你标注：每条判断是
              <span className="mx-1 rounded bg-success/15 px-2 py-0.5 text-success">好评</span>还是
              <span className="mx-1 rounded bg-destructive/15 px-2 py-0.5 text-destructive">差评</span>。
              你标完，我们就用这些标注去训练一个真实的 AI 模型，看它能不能自己判断新的评价。
            </p>
          </div>
          <p className="text-base text-muted-foreground">💡 标得越准，模型的判断就越准。标错了，模型也会跟着学错——这就是本课堂要你体会的核心。</p>
          <Button size="lg" className="w-full text-base" onClick={() => goto(2)}>开始标注 →</Button>
        </CardContent></Card>
      )}

      {/* 步骤 2: 动手标注 */}
      {state.step === 2 && (
        <div className="space-y-3">
          <div className="sticky top-20 z-10 flex items-center justify-between rounded-lg border bg-background/95 px-4 py-2 backdrop-blur">
            <span className="text-base">已标注 <strong className="text-primary">{labeledCount}</strong> / {TRAINING_SAMPLES.length} 条</span>
            {labeledCount < TRAINING_SAMPLES.length && (
              <span className="text-sm text-muted-foreground">全部标完才能开始训练</span>
            )}
          </div>
          {TRAINING_SAMPLES.map(sample => {
            const chosen = state.labels[sample.id];
            return (
              <Card key={sample.id}><CardContent className="space-y-2 py-4">
                <p className="text-lg leading-relaxed">{sample.text}</p>
                <p className="text-sm text-muted-foreground">💡 {sample.hint}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setState(prev => ({ ...prev, labels: { ...prev.labels, [sample.id]: 'good' } }))}
                    className={`flex-1 rounded-lg border-2 py-3 text-base font-medium transition-colors ${
                      chosen === 'good' ? 'border-success bg-success/10 text-success' : 'hover:border-success/40'
                    }`}
                  >
                    {chosen === 'good' ? '✓ ' : ''}好评
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, labels: { ...prev.labels, [sample.id]: 'bad' } }))}
                    className={`flex-1 rounded-lg border-2 py-3 text-base font-medium transition-colors ${
                      chosen === 'bad' ? 'border-destructive bg-destructive/10 text-destructive' : 'hover:border-destructive/40'
                    }`}
                  >
                    {chosen === 'bad' ? '✓ ' : ''}差评
                  </button>
                </div>
              </CardContent></Card>
            );
          })}
          <Button
            size="lg" className="w-full text-base"
            disabled={labeledCount < TRAINING_SAMPLES.length}
            onClick={() => goto(3)}
          >
            {labeledCount < TRAINING_SAMPLES.length ? `还差 ${TRAINING_SAMPLES.length - labeledCount} 条没标` : '标完了，去训练 →'}
          </Button>
        </div>
      )}

      {/* 步骤 3: 训练模型 */}
      {state.step === 3 && (
        <Card><CardContent className="space-y-4 py-6 text-center">
          <Rocket className="mx-auto h-14 w-14 text-primary" aria-hidden />
          <h2 className="text-xl font-bold">训练完成！</h2>
          <p className="text-lg leading-relaxed">
            模型从你的 {trainingData.length} 条标注里，统计出了每类评价的用词规律。
          </p>
          <div className="rounded-lg border bg-secondary/30 p-4 text-left">
            <p className="mb-2 font-medium">模型是怎么学的（朴素贝叶斯）</p>
            <p className="text-base leading-relaxed text-muted-foreground">
              它把每条评价切成两字一组（比如「质量很好」切成「质量/量很/很好」），
              统计每个词组在「好评」和「差评」里出现的次数。遇到新评价时，
              哪一类的词组出现得更多，就判成哪一类。这是最经典的文本分类方法之一。
            </p>
          </div>
          <p className="text-base text-muted-foreground">现在看看它学得怎么样——用 8 条它没见过的评价考考它。</p>
          <Button size="lg" className="w-full text-base" onClick={() => goto(4)}>开始测试 →</Button>
        </CardContent></Card>
      )}

      {/* 步骤 4: 看结果(反馈闭环的关键) */}
      {state.step === 4 && (
        <div className="space-y-4">
          <Card><CardContent className="py-6 text-center">
            <div className="text-5xl font-bold text-primary">{Math.round(accuracy * 100)}%</div>
            <p className="mt-2 text-base text-muted-foreground">
              测试准确率：{results.filter(r => r.prediction === r.truth).length} / {results.length} 条判断正确
            </p>
            {accuracy === 1 ? (
              <p className="mt-2 font-medium text-success">✓ 满分！你的标注质量非常高，模型学到了准确的规律。</p>
            ) : (
              <p className="mt-2 font-medium text-warning">⚠ 有判断错的——很可能是某几条训练数据标反了，模型跟着学错了。</p>
            )}
          </CardContent></Card>

          {results.map(r => {
            const correct = r.prediction === r.truth;
            return (
              <div key={r.id} className={`rounded-lg border-l-4 bg-card border p-4 ${correct ? 'border-l-success' : 'border-l-destructive'}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base leading-relaxed">{r.text}</p>
                  <span className={`shrink-0 rounded px-2 py-1 text-sm font-medium ${correct ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                    {correct ? '✓ 判对了' : '✗ 判错了'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  模型判断：<strong>{r.prediction === 'good' ? '好评' : '差评'}</strong>
                  {!correct && <> · 正确答案：<strong>{r.truth === 'good' ? '好评' : '差评'}</strong></>}
                </p>
              </div>
            );
          })}

          {accuracy < 1 && (
            <div className="rounded-xl border-2 border-dashed border-warning/50 bg-warning/5 p-4">
              <p className="mb-1 font-medium text-warning-foreground">🔁 试试这个：改进你的数据</p>
              <p className="text-base leading-relaxed">
                回到第 2 步，检查有没有把「不是我说，这个真难用」这类<strong>带反转口头语</strong>的评价标反了。
                改正后回来重新训练，看准确率会不会提高。
              </p>
              <Button variant="outline" className="mt-3" onClick={() => goto(2)}>
                <RotateCcw className="mr-1 h-4 w-4" aria-hidden /> 回去改标注
              </Button>
            </div>
          )}
          <Button size="lg" className="w-full text-base" onClick={() => { setState(prev => ({ ...prev, step: 5, completed: true })); }}>
            我体会到了，去总结 →
          </Button>
        </div>
      )}

      {/* 步骤 5: 总结 */}
      {state.step === 5 && (
        <Card><CardContent className="space-y-4 py-6">
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden />
            <h2 className="mt-2 text-xl font-bold">课堂完成！</h2>
          </div>
          <div className="space-y-3">
            {[
              'AI 模型不会自己变聪明，它学的是人工标注的数据。',
              '标注错一条，模型就可能学错一片——数据质量是 AI 的生命线。',
              '发现模型出错时，正确的做法是回头检查和修正训练数据，再重新训练。',
              '这个"标注 → 训练 → 观察 → 修正"的循环，就是人工智能训练师的日常工作。',
            ].map((line, i) => (
              <p key={i} className="flex items-start gap-2 text-lg leading-relaxed">
                <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-success" aria-hidden />{line}
              </p>
            ))}
          </div>
          <p className="text-base text-muted-foreground">把这些体会带到日常练习里：每一道标注题，你都在扮演 AI 的老师。</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 text-base" onClick={() => goto(4)}>再看一次结果</Button>
            <Button
              className="flex-1 text-base"
              onClick={() => setState({ step: 1, labels: {}, completed: false })}
            >
              重新上一遍课
            </Button>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
