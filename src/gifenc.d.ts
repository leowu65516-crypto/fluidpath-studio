declare module "gifenc" {
  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: number[][];
        delay?: number;
        transparent?: boolean;
        dispose?: number;
        repeat?: number;
        first?: boolean;
      }
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function GIFEncoder(): GIFEncoderInstance;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: object): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
}
