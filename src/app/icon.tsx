import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#4f46e5",
        borderRadius: 14,
        color: "white",
        fontSize: 26,
        fontWeight: 800,
      }}
    >
      B
    </div>,
    size,
  );
}
