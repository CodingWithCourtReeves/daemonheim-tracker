import * as a1lib from "@alt1/base";
import * as OCR from "@alt1/ocr";
import type { EventSender } from "../events.js";
import type { Complexity, DungeonSize } from "@daemonheim/shared";

/**
 * Reads the Dungeoneering interfaces to detect floor completions.
 *
 * This is the reader that needs the most calibration, because it reads a fixed
 * on-screen panel rather than scrolling text. The approach:
 *  - The floor-complete panel shows the floor number, complexity, size, % explored
 *    and a clear time. We detect the panel, then OCR each field from known offsets.
 *
 * CALIBRATION NEEDED (live client + Alt1 dev console — right-click the spanner):
 *  1. Capture the complete screen once and note the panel's anchor. The cleanest
 *     lock is `a1lib.ImageDetect.findSubimage` against a small static glyph from
 *     the panel (e.g. the "Floor" label). Save that crop into ./assets and load it.
 *  2. From the anchor, measure pixel offsets to each number field and fill REGIONS.
 *  3. Load the right font for the panel text (see @alt1/ocr font definitions).
 *
 * Until calibrated, read() is a no-op guarded by `this.calibrated = false`, so the
 * app runs safely and the chat reader still produces boss/drop/death events.
 */
export class FloorReader {
  private calibrated = false; // flip to true once REGIONS + font are set below
  private lastFloorKey = "";

  // Pixel regions relative to the detected panel anchor. TODO: measure these.
  private static REGIONS = {
    floor: { dx: 0, dy: 0, w: 60, h: 18 },
    complexity: { dx: 0, dy: 0, w: 40, h: 18 },
    timer: { dx: 0, dy: 0, w: 80, h: 18 },
    explored: { dx: 0, dy: 0, w: 50, h: 18 },
  };

  constructor(private sender: EventSender) {}

  read(img: any) {
    if (!this.calibrated) return;

    const anchor = this.findPanel(img);
    if (!anchor) return;

    const floor = this.readNumber(img, anchor, FloorReader.REGIONS.floor);
    if (floor == null) return;

    // Only emit once per distinct completion (panel persists for several frames).
    const key = `${floor}:${this.readNumber(img, anchor, FloorReader.REGIONS.timer) ?? "?"}`;
    if (key === this.lastFloorKey) return;
    this.lastFloorKey = key;

    this.sender.emit({
      type: "floor_completed",
      floor,
      complexity: (this.readNumber(img, anchor, FloorReader.REGIONS.complexity) ?? 1) as Complexity,
      size: this.readSize(img, anchor),
      durationSec: this.readNumber(img, anchor, FloorReader.REGIONS.timer) ?? undefined,
      explored: this.readNumber(img, anchor, FloorReader.REGIONS.explored) ?? undefined,
    });
  }

  /** TODO: replace with ImageDetect.findSubimage against a saved panel glyph. */
  private findPanel(_img: ImageData): { x: number; y: number } | null {
    return null;
  }

  /** OCR a numeric field. Uses @alt1/ocr.readLine once a font is supplied. */
  private readNumber(
    _img: ImageData,
    _anchor: { x: number; y: number },
    _region: { dx: number; dy: number; w: number; h: number },
  ): number | null {
    // const sub = a1lib.capture(anchor.x + region.dx, anchor.y + region.dy, region.w, region.h);
    // const line = OCR.readLine(sub, FONT, [[255, 255, 255]], 0, region.h / 2, true);
    // return parseInt(line.text.replace(/\D/g, ""), 10) || null;
    void a1lib; void OCR; // referenced so the calibration snippet above type-checks
    return null;
  }

  private readSize(_img: ImageData, _anchor: { x: number; y: number }): DungeonSize {
    return "small"; // TODO: read small/medium/large from the panel
  }
}
