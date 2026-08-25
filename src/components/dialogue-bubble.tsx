'use client';

/**
 * 对话情绪判读题的对话素材渲染:客服/坐席靠左、客户靠右(按 speaker 文本启发式),
 * target 行高亮并标注"要判读这一句"。零基础学员可读性优先:说话人名一定显示。
 */

export interface DialogueTurn { speaker: string; text: string }

function isTurn(v: unknown): v is DialogueTurn {
  return !!v && typeof v === 'object' && typeof (v as DialogueTurn).speaker === 'string' && typeof (v as DialogueTurn).text === 'string';
}

export function DialogueView({ dialogue, target }: { dialogue: unknown; target: unknown }) {
  const turns = Array.isArray(dialogue) ? dialogue.filter(isTurn) : [];
  const targetIndex = Number.isInteger(target) ? Number(target) : -1;
  if (!turns.length) return null;
  return (
    <div className="space-y-2 rounded-lg border bg-secondary/30 p-3">
      {turns.map((turn, i) => {
        const isCustomer = /客户|用户|买家/.test(turn.speaker);
        const isTarget = i === targetIndex;
        return (
          <div key={i} className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}>
            <div
              className={[
                'max-w-[80%] rounded-2xl px-4 py-2 text-base leading-relaxed',
                isCustomer ? 'bg-primary/10' : 'bg-background border',
                isTarget ? 'ring-2 ring-warning' : '',
              ].join(' ')}
            >
              <span className="mr-1 text-xs font-medium text-muted-foreground">{turn.speaker}：</span>
              <span>{turn.text}</span>
              {isTarget && (
                <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning-foreground">
                  ↑ 判读这一句
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 从题目 options 中取对话素材与判读行的便捷收窄。 */
export function dialogueFromOptions(options: Record<string, unknown> | null | undefined): { dialogue: unknown; target: unknown } {
  return { dialogue: options?.dialogue, target: options?.target };
}
