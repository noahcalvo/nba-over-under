/** A box in viewport (CSS pixel) coordinates, like getBoundingClientRect. */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export function intersectRects(a: Rect, b: Rect): Rect | null {
  const top = Math.max(a.top, b.top);
  const left = Math.max(a.left, b.left);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  const right = Math.min(a.left + a.width, b.left + b.width);
  return bottom > top && right > left ? { top, left, width: right - left, height: bottom - top } : null;
}

/** The part of `rect` inside every clip, or null when none of it is. */
export function clipRect(rect: Rect, clips: readonly Rect[]): Rect | null {
  return clips.reduce<Rect | null>((current, clip) => current && intersectRects(current, clip), rect);
}

export function inflateRect(rect: Rect, by: number): Rect {
  return { top: rect.top - by, left: rect.left - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

export function sameRects(a: readonly Rect[], b: readonly Rect[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (rect, index) =>
        rect.top === b[index].top &&
        rect.left === b[index].left &&
        rect.width === b[index].width &&
        rect.height === b[index].height,
    )
  );
}
