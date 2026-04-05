export interface CommandBlock {
  type: "command";
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
  cwd: string;
  startedAt: number;
  finishedAt: number | null;
  collapsed: boolean;
}

export interface AiBlock {
  type: "ai";
  id: string;
  prompt: string;
  response: string;
  thinking: string;
  startedAt: number;
  finishedAt: number | null;
  collapsed: boolean;
}

export interface AgentBlock {
  type: "agent";
  id: string;
  label: string;
  children: Block[];
  startedAt: number;
  finishedAt: number | null;
  collapsed: boolean;
}

export type Block = CommandBlock | AiBlock | AgentBlock;

let counter = 0;
export function blockId(): string {
  return `blk_${Date.now()}_${counter++}`;
}
