# LLM connectors (plugin-style)

The Copilot can call an **external model** using a key you provide. 6EARS does not host your subscription; you bring:

- **OpenRouter** (one key → many models), or  
- **OpenAI / xAI / Anthropic** direct keys, or  
- **Custom** OpenAI-compatible base URL (Azure, local gateways, etc.)

Keys are stored only under `~/.config/6ears-spotify-ads/llm-<provider>.key` (mode `0600`). They are **never** printed in the mission log or shipped in the package.

## Headless CLI

```bash
# see connectors
6ears-spotify-ads llm providers
6ears-spotify-ads llm status

# OpenRouter (recommended multi-model)
6ears-spotify-ads llm provider openrouter
6ears-spotify-ads llm model openai/gpt-4o-mini
6ears-spotify-ads llm set-key          # paste sk-or-…

# or OpenAI / Grok / Anthropic
6ears-spotify-ads llm provider openai
6ears-spotify-ads llm set-key sk-…

6ears-spotify-ads llm provider xai
6ears-spotify-ads llm model grok-2-latest
6ears-spotify-ads llm set-key xai-…

# custom OpenAI-compatible endpoint
6ears-spotify-ads llm provider custom
6ears-spotify-ads llm base-url https://your-gateway.example/v1
6ears-spotify-ads llm set-key …

# one-shot (grounds on local knowledge pack)
6ears-spotify-ads ask "How should I structure a 30s audio ad with CTA?"
```

## Inside Copilot Cockpit

```text
/llm
/llm provider openrouter
/llm model openai/gpt-4o-mini
/llm key sk-or-v1-…
/ask How do I avoid music-only ad rejection?
/chat on          # free text → LLM
/chat off         # free text → knowledge search only
/search frequency # pack-only anytime
```

## Subscriptions vs API keys

| Path | How |
|------|-----|
| **API key** | `llm set-key` / `/llm key` (works today) |
| **OpenRouter** | Sign up at openrouter.ai → create key → multi-model routing |
| **Vendor subscription** | Use that vendor’s API key (OpenAI, xAI, Anthropic) |
| **Future OAuth / in-app billing** | Not in v0.2 — would be a separate product surface |

This is intentionally a **connector/plugin** model: the cockpit stays open-source; model access is your account.

## Safety

- LLM answers are **not** proof of Ads Manager state.  
- COPILOT rules still apply: no inventing IDs/budgets; no promising delivery.  
- Knowledge snippets are attached as context; live Spotify may differ.
