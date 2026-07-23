import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR_NAME = "6ears-spotify-ads";

export function configDir() {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, DIR_NAME);
}

export function configPath() {
  return path.join(configDir(), "config.json");
}

export function profilesDir() {
  return path.join(configDir(), "profiles");
}

export function ensureConfigDirs() {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  fs.mkdirSync(profilesDir(), { recursive: true, mode: 0o700 });
}

export function loadConfig() {
  ensureConfigDirs();
  const p = configPath();
  if (!fs.existsSync(p)) {
    return {
      baseUrl: "http://localhost:8787",
      operatorActor: null,
      defaultArtist: null,
      // operatorApiKey is never logged; stored only if user opts in
      operatorApiKeySet: false,
    };
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return raw;
}

export function saveConfig(cfg) {
  ensureConfigDirs();
  const p = configPath();
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

export function loadApiKey() {
  const keyFile = path.join(configDir(), "operator.key");
  if (!fs.existsSync(keyFile)) return null;
  return fs.readFileSync(keyFile, "utf8").trim() || null;
}

export function saveApiKey(key) {
  ensureConfigDirs();
  const keyFile = path.join(configDir(), "operator.key");
  fs.writeFileSync(keyFile, key.trim() + "\n", { mode: 0o600 });
}
