import { useSyncExternalStore } from "react";
import type { Block, CommandBlock, AiBlock } from "../models/Block";
import { blockId } from "../models/Block";

let blocks: Block[] = [];
let listeners: Set<() => void> = new Set();

function emit() {
  listeners.forEach((l) => l());
}

export function addCommandBlock(command: string, cwd: string): string {
  const id = blockId();
  const block: CommandBlock = {
    type: "command",
    id,
    command,
    output: "",
    exitCode: null,
    cwd,
    startedAt: Date.now(),
    finishedAt: null,
    collapsed: false,
  };
  blocks = [...blocks, block];
  emit();
  return id;
}

export function addAiBlock(prompt: string): string {
  const id = blockId();
  const block: AiBlock = {
    type: "ai",
    id,
    prompt,
    response: "",
    thinking: "",
    startedAt: Date.now(),
    finishedAt: null,
    collapsed: false,
  };
  blocks = [...blocks, block];
  emit();
  return id;
}

export function appendOutput(id: string, data: string) {
  blocks = blocks.map((b) =>
    b.id === id && b.type === "command" ? { ...b, output: b.output + data } : b
  );
  emit();
}

export function setCommandOutput(id: string, output: string) {
  blocks = blocks.map((b) =>
    b.id === id && b.type === "command" ? { ...b, output } : b
  );
  emit();
}

export function finishBlock(id: string, exitCode: number) {
  blocks = blocks.map((b) =>
    b.id === id && b.type === "command"
      ? { ...b, exitCode, finishedAt: Date.now() }
      : b
  );
  emit();
}

export function updateAiBlock(id: string, updates: Partial<Pick<AiBlock, "response" | "thinking">>) {
  blocks = blocks.map((b) =>
    b.id === id && b.type === "ai" ? { ...b, ...updates } : b
  );
  emit();
}

export function appendAiResponse(id: string, content: string) {
  blocks = blocks.map((b) =>
    b.id === id && b.type === "ai" ? { ...b, response: b.response + content } : b
  );
  emit();
}

export function finishAiBlock(id: string) {
  blocks = blocks.map((b) =>
    b.id === id && b.type === "ai" ? { ...b, finishedAt: Date.now() } : b
  );
  emit();
}

export function toggleCollapse(id: string) {
  blocks = blocks.map((b) =>
    b.id === id ? { ...b, collapsed: !b.collapsed } : b
  );
  emit();
}

export function getBlocks(): Block[] {
  return blocks;
}

export function useBlocks(): Block[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => blocks
  );
}
