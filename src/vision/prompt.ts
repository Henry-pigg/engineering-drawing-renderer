import systemPromptRaw from '../../prompt/system-prompt.md?raw';

/**
 * 提示词只有一份真源：`prompt/system-prompt.md`。
 * 前端用 ?raw 内联进来（便于调试时展示/对比版本），后端直接读同一个文件即可，
 * 不会出现"代码里一份、文档里一份、两边改不同步"的问题。
 */
export const SYSTEM_PROMPT = systemPromptRaw;

export const PROMPT_VERSION = 'v1.2';
export const CONTRACT_VERSION = '1.0';

export interface UserMessageInput {
  width?: number;
  height?: number;
  /** 学生年级/水平，影响讲解详细程度 */
  level?: 'beginner' | 'intermediate';
  /** 教师附加要求，如"只识别主视图" */
  hint?: string;
}

/** 用户消息文本。注意：图片单独作为 content 的一个 part 传入，不在这里拼 */
export function buildUserMessage(input: UserMessageInput = {}): string {
  const width = input.width ?? 920;
  const height = input.height ?? 660;
  const lines = [
    '请识别这张图纸，并转换为可分步演示的绘图指令 JSON。',
    '',
    `- 画布：${width} × ${height}（输出坐标必须落在此范围内）`,
    `- 学生水平：${input.level === 'intermediate' ? '已学过三视图，可略过高频提示' : '初学，讲解请更细'}`,
  ];
  if (input.hint) lines.push(`- 附加要求：${input.hint}`);
  lines.push('', '直接输出 JSON，不要任何其他内容。');
  return lines.join('\n');
}

export type VisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface VisionMessage {
  role: 'system' | 'user';
  content: string | VisionContentPart[];
}

/**
 * OpenAI / 智谱 GLM-4V / Qwen-VL 等 OpenAI 兼容协议的消息结构。
 * 图片放前面、文字放后面：多数视觉模型对"先看到的图"注意力更集中。
 */
export function buildMessages(input: UserMessageInput & { imageUrl: string }): VisionMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: input.imageUrl } },
        { type: 'text', text: buildUserMessage(input) },
      ],
    },
  ];
}
