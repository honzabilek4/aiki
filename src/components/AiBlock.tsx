import type { AiBlock as AiBlockType } from "../models/Block";
import { toggleCollapse } from "../stores/blockStore";

interface Props {
  block: AiBlockType;
}

export default function AiBlock({ block }: Props) {
  const isRunning = block.finishedAt === null;

  return (
    <div className={`block block--ai ${isRunning ? "block--running-ai" : ""}`}>
      <div className="block-header" onClick={() => toggleCollapse(block.id)}>
        <span className="block-chevron">{block.collapsed ? "▸" : "▾"}</span>
        <span className="block-prompt">{block.prompt}</span>
        <span className="block-meta">
          {isRunning && <span className="block-spinner">⟳</span>}
        </span>
      </div>
      {!block.collapsed && (
        <div className="block-ai-response">
          {block.response || (isRunning && <span className="block-ai-typing">Thinking...</span>)}
        </div>
      )}
    </div>
  );
}
