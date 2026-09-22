import { ImageResponse } from "next/og";

/** Iconos PNG de la PWA generados al vuelo (192/512, versión "maskable" con margen). */
export async function GET(req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params;
  const size = [180, 192, 512].includes(Number(raw)) ? Number(raw) : 192;
  const maskable = new URL(req.url).searchParams.has("maskable");
  const inner = maskable ? size * 0.62 : size * 0.8;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#4f46e5",
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: inner * 0.22,
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#4f46e5",
          fontSize: inner * 0.42,
          fontWeight: 800,
          letterSpacing: -2,
        }}
      >
        BOS
      </div>
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
