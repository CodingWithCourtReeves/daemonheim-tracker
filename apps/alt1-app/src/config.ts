/**
 * Runtime config for the Alt1 app. In Alt1, an app is just a web page, so these
 * are read from localStorage (set them once via the in-app settings form) with
 * sensible dev defaults. Nothing secret should ship hard-coded.
 */
export interface AppConfig {
  apiBase: string;
  ingestKey: string;
  player: string;
  /** How often (ms) to capture + run the screen readers. */
  pollMs: number;
}

const DEFAULTS: AppConfig = {
  apiBase: "https://api-production-34b9.up.railway.app",
  ingestKey: "", // never hard-code — this app is public; enter it in the settings form
  player: "CourtMaxxing",
  pollMs: 600,
};

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem("daemonheim:config");
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveConfig(cfg: Partial<AppConfig>) {
  const merged = { ...loadConfig(), ...cfg };
  localStorage.setItem("daemonheim:config", JSON.stringify(merged));
  return merged;
}
