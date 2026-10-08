import { ImageResponse } from "next/og";

// Link-preview card for every page. Colors are the ink-950, accent, fog-50 and fog-300 tokens from globals.css (ImageResponse
// cannot read CSS variables).
export const alt = "Courtline: draft Overs and Unders on every NBA win total";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        background: "#060d19",
        color: "#86f53c",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <svg
          width="150"
          height="150"
          viewBox="0 0 32 32"
          fill="none"
          stroke="#86f53c"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <circle cx="16" cy="16" r="13" />
          <path d="M3 16h26M16 3v26M7 6.5c4 3 6 6 6 9.5s-2 6.5-6 9.5M25 6.5c-4 3-6 6-6 9.5s2 6.5 6 9.5" />
        </svg>
        <div
          style={{
            fontSize: 150,
            fontWeight: 700,
            letterSpacing: 6,
            color: "#f2f6fc",
          }}
        >
          COURTLINE
        </div>
      </div>
      <div style={{ fontSize: 44, color: "#b4c2d8" }}>Draft Overs and Unders on every NBA win total</div>
    </div>,
    size,
  );
}
