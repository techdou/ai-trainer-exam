'use client';

/**
 * 非标注题作答对比渲染(成绩复核页): 把学员作答与标准答案映射为
 * (项目, 学员, 标准, 是否一致) 行列表, 差异行高亮——复核员不用读 JSON。
 * 未识别的题型退化为紧凑 JSON 双栏对比。
 */

interface Row { name: string; mine: string; expected: string }

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});
const fmt = (v: unknown): string => (v === undefined || v === null || v === '' ? '—' : String(v));

function compareSets(mineList: string[] | undefined, expectedList: string[] | undefined, nameOf: (id: string) => string): Row[] {
  const mine = new Set(mineList ?? []);
  const expected = new Set(expectedList ?? []);
  const ids = [...new Set([...(mineList ?? []), ...(expectedList ?? [])])];
  return ids.map(id => ({
    name: nameOf(id),
    mine: mine.has(id) ? (expected.has(id) ? '✓ 保留' : '✗ 多保留') : '已删除',
    expected: expected.has(id) ? '应保留' : '应删除',
  }));
}

function compareRecords(mineR: Record<string, unknown> | undefined, expectedR: Record<string, unknown> | undefined): Row[] {
  const mine = mineR ?? {}; const expected = expectedR ?? {};
  return [...new Set([...Object.keys(mine), ...Object.keys(expected)])].map(k => ({
    name: k, mine: fmt(mine[k]), expected: fmt(expected[k]),
  }));
}

export function AnswerCompare({ taskType, submission, answerKey }: {
  taskType: string;
  submission: unknown;
  answerKey: unknown;
}) {
  const sub = rec(submission); const key = rec(answerKey);
  let rows: Row[] = [];
  let mineLabel = '学员作答'; let expectedLabel = '标准答案';

  switch (taskType) {
    case 'excel_delete_rows':
      rows = compareSets(
        (Array.isArray(sub.retainedRowIds) ? sub.retainedRowIds : []) as string[],
        (Array.isArray(key.correctRetainedRowIds) ? key.correctRetainedRowIds : []) as string[],
        id => `行 ${id}`,
      );
      break;
    case 'stats_table':
      rows = compareRecords(rec(sub.cells), rec(key.correctCells));
      break;
    case 'file_classify':
      rows = compareRecords(rec(sub.classifications), rec(key.correctClassifications)); break;
    case 'image_clean':
      rows = compareRecords(rec(sub.decisions), rec(key.correctDecisions)); break;
    case 'data_labeling':
      rows = compareRecords(rec(sub.labels), rec(key.correctLabels)); break;
    case 'text_sentiment':
      rows = compareRecords(rec(sub.sentiments), rec(key.correctSentiments)); break;
    case 'dataset_quality': {
      const mk = (flagged: unknown) => (v: unknown) => (Array.isArray(flagged) && flagged.includes(v) ? '勾选有问题' : '未勾选');
      const ids = [...new Set([...(Array.isArray(sub.flaggedItems) ? sub.flaggedItems as string[] : []), ...(Array.isArray(key.correctFlaggedItems) ? key.correctFlaggedItems as string[] : [])])];
      rows = ids.map(id => ({ name: `条目 ${id}`, mine: mk(sub.flaggedItems)(id), expected: mk(key.correctFlaggedItems)(id) }));
      break;
    }
    case 'audio_transcription':
      rows = [{ name: '转写内容', mine: fmt(sub.transcript), expected: fmt(key.correctTranscript) }];
      mineLabel = '学员转写'; expectedLabel = '标准文案';
      break;
    case 'excel_comprehensive': {
      const fr = rec(key.formulaResults);
      rows = [...Object.keys(fr).map(id => ({ name: `班级(${id})`, mine: fmt(rec(sub.rows && Array.isArray(sub.rows) ? {} : {})[id] ?? findRowClass(sub.rows, id)), expected: fmt(fr[id]) }))];
      rows.push({ name: '排序顺序', mine: fmt(sub.rowOrder), expected: fmt(key.sortedRowOrder) });
      rows.push({ name: '标题行填色', mine: fmt(sub.headerColor), expected: fmt(key.headerColor) });
      rows.push({ name: '表格边框', mine: sub.borderApplied === true ? '已设置' : '未设置', expected: '已设置' });
      if (key.decimalPlaces !== undefined) rows.push({ name: '小数位数', mine: fmt(sub.decimalPlaces), expected: fmt(key.decimalPlaces) });
      break;
    }
    default:
      rows = [{ name: '作答内容', mine: JSON.stringify(submission), expected: JSON.stringify(answerKey) }];
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-1.5 text-left font-medium">项目</th>
            <th className="px-3 py-1.5 text-left font-medium">{mineLabel}</th>
            <th className="px-3 py-1.5 text-left font-medium">{expectedLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const same = r.mine === r.expected;
            return (
              <tr key={i} className={`border-b last:border-b-0 ${same ? '' : 'bg-destructive/5'}`}>
                <td className="px-3 py-1.5 text-muted-foreground">{r.name}</td>
                <td className={`px-3 py-1.5 break-all ${same ? '' : 'font-medium text-destructive'}`}>{r.mine}</td>
                <td className="px-3 py-1.5 break-all text-muted-foreground">{r.expected}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 从 excel_comprehensive 作答的 rows 里取某行的班级列(第 3 列)。 */
function findRowClass(rows: unknown, rowId: string): string {
  if (!Array.isArray(rows)) return '';
  const row = (rows as Array<{ id?: string; cells?: unknown[] }>).find(r => r?.id === rowId);
  return String(row?.cells?.[2] ?? '');
}
