// Strip OSC sequences (title setting, etc.): \x1b]...\x07 or \x1b]...\x1b\\
// Keep CSI sequences (colors, formatting) for ansi-to-react to render
export function stripOsc(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}

// Strip carriage returns and normalize line endings
export function normalizeOutput(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "");
}

// Clean command output for display
export function cleanOutput(text: string): string {
  let cleaned = stripOsc(text);
  cleaned = normalizeOutput(cleaned);
  cleaned = cleaned.replace(/^\n+/, "").replace(/\n+$/, "");
  return cleaned;
}
