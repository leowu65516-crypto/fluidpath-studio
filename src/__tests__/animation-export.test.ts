import { describe, expect, it } from "vitest";
import { animationDimensions, gifChangedPixels } from "../export";

describe("animation export", () => {
  it("limits long diagrams and keeps MP4 dimensions even", () => {
    expect(animationDimensions(5000, 2000, 1000)).toEqual({ width: 1000, height: 400 });
    expect(animationDimensions(999, 555, 1920, true)).toEqual({ width: 1000, height: 556 });
    expect(animationDimensions(0, 0, 960, true)).toEqual({ width: 2, height: 2 });
  });
  it("keeps changed colours and makes only unchanged pixels transparent", () => {
    const current = new Uint8Array([3, 4, 2, 0]);
    expect([...gifChangedPixels(current, new Uint8Array([3, 0, 2, 1]), 255)]).toEqual([255, 4, 255, 0]);
    expect([...current]).toEqual([3, 4, 2, 0]);
  });
});
