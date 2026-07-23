/**
 * Pluggable LLM providers (OpenRouter + any OpenAI-compatible endpoint).
 * Keys never go in the knowledge pack or mission log.
 */

export const BUILTIN_PROVIDERS = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter (many models, one key)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    authHeader: "bearer",
    extraHeaders: (cfg) => ({
      "HTTP-Referer": cfg.referer || "https://github.com/dynamicoscilator369/6ears-spotify-ads-agent",
      "X-Title": cfg.appTitle || "6EARS Spotify Ads Copilot",
    }),
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    authHeader: "bearer",
  },
  xai: {
    id: "xai",
    label: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    authHeader: "bearer",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Messages API)",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    authHeader: "anthropic",
    apiStyle: "anthropic",
  },
  custom: {
    id: "custom",
    label: "Custom OpenAI-compatible (base URL + key)",
    baseUrl: null, // required in config
    defaultModel: "gpt-4o-mini",
    authHeader: "bearer",
    apiStyle: "openai",
  },
};

export function listProviders() {
  return Object.values(BUILTIN_PROVIDERS);
}

export function getProviderDef(id) {
  return BUILTIN_PROVIDERS[id] || null;
}

/**
 * @param {object} opts
 * @param {string} opts.providerId
 * @param {string} opts.apiKey
 * @param {string} [opts.model]
 * @param {string} [opts.baseUrl]
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 */
export async function chatCompletion(opts) {
  const def = getProviderDef(opts.providerId);
  if (!def) throw new Error(`Unknown LLM provider: ${opts.providerId}`);
  if (!opts.apiKey) throw new Error("LLM API key not set. Run: 6ears-spotify-ads llm set-key");

  const baseUrl = (opts.baseUrl || def.baseUrl || "").replace(/\/$/, "");
  if (!baseUrl) throw new Error("baseUrl required (custom provider or llm config)");

  const model = opts.model || def.defaultModel;
  const style = def.apiStyle || "openai";

  if (style === "anthropic") {
    return anthropicChat({ ...opts, baseUrl, model, def });
  }
  return openaiCompatibleChat({ ...opts, baseUrl, model, def });
}

async function openaiCompatibleChat({ apiKey, baseUrl, model, messages, temperature = 0.4, maxTokens = 2048, def }) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (typeof def.extraHeaders === "function") {
    Object.assign(headers, def.extraHeaders({}));
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || text.slice(0, 200);
    throw new Error(`LLM error (${res.status}): ${msg}`);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty content");
  return {
    content: String(content).trim(),
    model: data.model || model,
    provider: def.id,
    usage: data.usage || null,
  };
}

async function anthropicChat({ apiKey, baseUrl, model, messages, temperature = 0.4, maxTokens = 2048 }) {
  // Split system messages
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const res = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: system || undefined,
      messages: rest.length ? rest : [{ role: "user", content: "Hello" }],
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = data?.error?.message || text.slice(0, 200);
    throw new Error(`Anthropic error (${res.status}): ${msg}`);
  }
  const content = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!content) throw new Error("Anthropic returned empty content");
  return {
    content,
    model: data.model || model,
    provider: "anthropic",
    usage: data.usage || null,
  };
}
