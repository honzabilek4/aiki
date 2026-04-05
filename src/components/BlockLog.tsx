import { useEffect, useRef } from "react";
import { useBlocks } from "../stores/blockStore";
import CommandBlock from "./CommandBlock";
import AiBlock from "./AiBlock";

export default function BlockLog() {
  const blocks = useBlocks();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [blocks]);

  return (
    <div className="block-log">
      {blocks.length === 0 && (
        <div className="block-log-empty">Type a command or ask AI below</div>
      )}
      {blocks.map((block) => {
        switch (block.type) {
          case "command":
            return <CommandBlock key={block.id} block={block} />;
          case "ai":
            return <AiBlock key={block.id} block={block} />;
          default:
            return null;
        }
      })}
      <div ref={bottomRef} />
    </div>
  );
}
