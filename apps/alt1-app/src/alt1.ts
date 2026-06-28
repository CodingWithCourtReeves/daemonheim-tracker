import * as a1lib from "@alt1/base";

/**
 * Thin wrapper over the Alt1 runtime. Everything here uses Alt1's documented,
 * long-stable surface so it survives alpha churn in the helper libs.
 *
 * IMPORTANT: Alt1 only ever READS the screen here. There is no input simulation
 * anywhere in this project — that's the line that keeps it on the safe side of
 * Jagex's Macroing & Third-Party Software rule. Don't add mouse/key automation.
 */

export function isAlt1(): boolean {
  return typeof window !== "undefined" && !!window.alt1;
}

/**
 * Register the app with Alt1 and surface the permission prompts. `appUrl` is the
 * hosted appconfig.json location (your GitHub Pages URL once deployed).
 */
export function bootstrap(appUrl: string) {
  if (!isAlt1()) return;
  // Tells Alt1 which app this page is, so it can manage permissions/identity.
  a1lib.identifyApp(appUrl);
  // These flags live on the global alt1 object; true = the user granted them.
  // The user grants them via Alt1's UI; we just check + nudge.
}

export interface Permissions {
  pixel: boolean; // read the screen
  gamestate: boolean; // read xp counters etc.
}

export function permissions(): Permissions {
  const a = window.alt1;
  return {
    pixel: !!a?.permissionPixel,
    gamestate: !!a?.permissionGameState,
  };
}

/**
 * Capture the full RuneScape client and return Alt1's capture handle (ImgRef).
 * The @alt1 readers (chatbox, ocr) expect this handle, NOT raw ImageData — pass
 * the same handle to find()/read() so detection is consistent within a frame.
 * Returns null if Alt1 isn't present or pixel permission hasn't been granted.
 */
export function captureClient(): a1lib.ImgRef | null {
  if (!isAlt1() || !permissions().pixel) return null;
  try {
    return a1lib.captureHoldFullRs();
  } catch {
    return null;
  }
}
