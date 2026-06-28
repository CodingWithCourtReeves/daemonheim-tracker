import ChatBoxReader from "@alt1/chatbox";
import type { EventSender } from "../events.js";

/**
 * Reads the game chatbox and turns notable lines into events. The chatbox is the
 * most reliable signal source because boss kills, drops, and deaths all announce
 * there as text — far steadier than reading 3D models or health bars.
 *
 * CALIBRATION NEEDED (do this with the live client + Alt1 dev console):
 *  1. Confirm `reader.find()` locks onto your chatbox. If you use a custom chat
 *     color or transparent background, set `reader.readargs.colors` accordingly.
 *  2. Tune the regexes below against the exact wording RS3 uses for Dungeoneering
 *     kills/drops. The patterns here are sensible guesses, not verified strings.
 */
export class ChatReader {
  private reader = new ChatBoxReader();
  private located = false;
  private seen = new Set<string>(); // de-dupe identical lines within a session

  // ---- debug surface (shown in the app so we can calibrate without a console) ----
  /** Whether find() has locked onto the chatbox. */
  get isLocated() { return this.located; }
  /** Last raw chat lines read, newest last (for tuning the patterns). */
  readonly recentLines: string[] = [];

  constructor(private sender: EventSender) {}

  read(img: ImageData) {
    // @alt1/chatbox works against an ImgRef; the base lib augments ImageData,
    // but to keep types simple we pass through Alt1's reader which accepts it.
    if (!this.located) {
      const pos = this.reader.find(img as any);
      this.located = !!pos;
      if (!this.located) return;
    }
    const lines = this.reader.read(img as any);
    if (!lines) return;

    for (const line of lines) {
      const text = line.text?.trim();
      if (!text) continue;
      const key = `${line.basey}:${text}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.recentLines.push(text);
      if (this.recentLines.length > 14) this.recentLines.shift();
      this.classify(text);
    }
    // keep the de-dupe set from growing unbounded over a long stream
    if (this.seen.size > 400) this.seen.clear();
  }

  private classify(text: string) {
    // --- death ---
    if (/oh dear, you are dead/i.test(text)) {
      this.sender.emit({ type: "death" });
      return;
    }

    // --- boss kill --- e.g. "You have defeated the Gluttonous behemoth"
    const kill = text.match(/you(?:'ve| have) (?:defeated|killed|slain) (?:the )?(.+?)[.!]?$/i);
    if (kill && KNOWN_BOSSES.some((b) => kill[1].toLowerCase().includes(b))) {
      this.sender.emit({ type: "boss_killed", boss: titleCase(kill[1]) });
      return;
    }

    // --- drop --- e.g. "You find: Chaotic remnant" / "You receive: Gravite 2h sword"
    const drop = text.match(/you (?:find|receive|found)\s*:?\s*(.+?)[.!]?$/i);
    if (drop) {
      const item = titleCase(drop[1]);
      this.sender.emit({ type: "drop", item, rarity: guessRarity(item) });
      return;
    }
  }
}

/** Lowercase fragments used to confirm a chat line really names a Dung boss. */
const KNOWN_BOSSES = [
  "behemoth", "astea frostweb", "icy bones", "lakhrahnaz", "to'kash",
  "bal'lak", "har'lakk", "yk'lagor", "kal'ger", "khighorahk", "ihlakhizan",
  "rammernaut", "lexicus", "sagittare", "geomancer", "necrolord", "gravecreeper",
  "haasghenahk", "gulega", "hope devourer", "unholy cursebearer",
];

function guessRarity(item: string): "common" | "uncommon" | "rare" | "chaotic" {
  const l = item.toLowerCase();
  if (l.includes("chaotic")) return "chaotic";
  if (l.includes("gravite") || l.includes("remnant") || l.includes("hexhunter")) return "rare";
  return "uncommon";
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1)).trim();
}
