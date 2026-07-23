/**
 * LLM connector config + secret key storage (local only, mode 0600).
 */
import fs from "node:fs";
import path from "node:path";
import { configDir, ensureConfigDirs, loadConfig, saveConfig } from "../config.js";
import { BUILTIN_PROVIDERS, getProviderDef, listProviders } from "./providers.js";

function llmKeyPath(providerId) {
  return path.join(configDir(), `llm-${providerId}.key`);
}

export function defaultLlmConfig() {
  return {
    enabled: false,
    provider: "openrouter",
    model: null, // use provider default
    baseUrl: null, // override / custom
    chatModeDefault: false, // free text → search unless true or /ask
  };
}

export function getLlmSettings() {
  const cfg = loadConfig();
  return { ...defaultLlmConfig(), ...(cfg.llm || {}) };
}

export function saveLlmSettings(partial) {
  const cfg = loadConfig();
  cfg.llm = { ...defaultLlmConfig(), ...(cfg.llm || {}), ...partial };
  saveConfig(cfg);
  return cfg.llm;
}

export function loadLlmKey(providerId = getLlmSettings().provider) {
  const p = llmKeyPath(providerId);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8").trim() || null;
}

export function saveLlmKey(providerId, key) {
  ensureConfigDirs();
  if (!getProviderDef(providerId) && providerId !== "custom") {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  const p = llmKeyPath(providerId);
  fs.writeFileSync(p, key.trim() + "\n", { mode: 0o600 });
  // mark enabled when a key is set
  saveLlmSettings({ enabled: true, provider: providerId });
  return p;
}

export function clearLlmKey(providerId = getLlmSettings().provider) {
  const p = llmKeyPath(providerId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function llmStatus() {
  const settings = getLlmSettings();
  const def = getProviderDef(settings.provider);
  const key = loadLlmKey(settings.provider);
  return {
    enabled: settings.enabled && Boolean(key),
    provider: settings.provider,
    providerLabel: def?.label || settings.provider,
    model: settings.model || def?.defaultModel || null,
    baseUrl: settings.baseUrl || def?.baseUrl || null,
    keySet: Boolean(key),
    chatModeDefault: Boolean(settings.chatModeDefault),
    providers: listProviders().map((p) => p.id),
  };
}

export { listProviders, getProviderDef, BUILTIN_PROVIDERS };
