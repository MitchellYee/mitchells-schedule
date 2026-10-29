import type { ComponentType } from 'react';

/** 工具通过此清单接入导航和工作区；规划中的工具不触发网络请求。 */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  status: 'ready' | 'planned';
  component?: ComponentType;
}

export const toolRegistry: readonly ToolDefinition[] = [
  { id: 'home', name: '工作台', description: '你的个人工具空间', status: 'ready' },
  { id: 'schedule', name: '日程与任务', description: '计划、安排与完成记录', status: 'ready' },
  { id: 'translate', name: '双向翻译', description: '让长文与想法跨越语言', status: 'ready' },
  { id: 'latex', name: 'LaTeX 写作', description: '公式、论文与排版，专注表达', status: 'planned' },
];

export const findTool = (id: string) => toolRegistry.find((tool) => tool.id === id);
