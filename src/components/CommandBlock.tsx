import Ansi from "ansi-to-react";
import type { CommandBlock as CommandBlockType } from "../models/Block";
import { toggleCollapse } from "../stores/blockStore";
import { cleanOutput } from "../utils/ansi";

interface Props {
  block: CommandBlockType;
}

export default function CommandBlock({ block }: Props) {
  const isRunning = block.finishedAt === null;
  const duration =
    block.finishedAt !== null
      ? ((block.finishedAt - block.startedAt) / 1000).toFixed(1)
      : null;

  const exitBadge =
    block.exitCode !== null ? (
      <span
        className={`block-exit ${block.exitCode === 0 ? "block-exit--ok" : "block-exit--fail"}`}
      >
        {block.exitCode === 0 ? "ok" : `exit ${block.exitCode}`}
      </span>
    ) : null;

  const cleaned = cleanOutput(block.output);

  return (
    <div className={`block block--command ${isRunning ? "block--running" : ""}`}>
      <div className="block-header" onClick={() => toggleCollapse(block.id)}>
        <span className="block-chevron">{block.collapsed ? "▸" : "▾"}</span>
        <span className="block-cmd">$ {block.command}</span>
        <span className="block-meta">
          {exitBadge}
          {duration && <span className="block-duration">{duration}s</span>}
          {isRunning && <span className="block-spinner">⟳</span>}
        </span>
      </div>
      {!block.collapsed && cleaned && (
        <pre className="block-output">
          <Ansi>{cleaned}</Ansi>
        </pre>
      )}
    </div>
  );
}
