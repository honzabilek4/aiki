export const PROVIDERS = [
  { id: "gemini", name: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com/v1" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  { id: "ollama", name: "Ollama (local)", baseUrl: "http://localhost:11434/v1" },
  { id: "lmstudio", name: "LM Studio (local)", baseUrl: "http://localhost:1234/v1" },
];

const EXCLUDE_PATTERNS = [
  /embed/i, /tts/i, /whisper/i, /dall-e/i, /moderation/i,
  /realtime/i, /audio/i, /image/i, /robotics/i,
  /search/i, /similarity/i, /edit/i, /insert/i,
  /babbage/i, /davinci/i, /curie/i, /ada(?!-)/i,
  /canary/i, /guard/i, /safeguard/i,
  /transcri/i,       // transcription models (Mistral, etc.)
  /deep-research/i,  // o3-deep-research, o4-mini-deep-research
  /-\d{4}-?\d{2}-?\d{2}$/,  // dated snapshots like gpt-4o-2024-08-06
];

export function filterChatModels(models: string[], provider: string): string[] {
  let filtered = models.filter((m) =>
    !EXCLUDE_PATTERNS.some((re) => re.test(m))
  );

  if (provider === "openai") {
    // gpt-5.4, gpt-4.1, gpt-4o, o3, o3-mini, o3-pro, o4-mini, chatgpt-*
    filtered = filtered.filter((m) => /^(gpt-|o[1-9]|chatgpt)/.test(m));
  } else if (provider === "anthropic") {
    // claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5, claude-3.5-*
    filtered = filtered.filter((m) => m.startsWith("claude-"));
  } else if (provider === "gemini") {
    filtered = filtered.filter((m) => m.startsWith("gemini-"));
  } else if (provider === "groq") {
    // Groq hosts many providers — exclude non-chat models, keep llama, qwen, deepseek, gpt-oss, etc.
    filtered = filtered.filter((m) => !/^playai/i.test(m));
  } else if (provider === "mistral") {
    // mistral-large, mistral-small, magistral, codestral, pixtral, ministral
    filtered = filtered.filter((m) =>
      /^(mistral-|magistral|codestral|pixtral|ministral)/i.test(m)
    );
  }

  filtered.sort();
  return filtered;
}
