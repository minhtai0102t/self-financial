import { ImageResponse } from "next/og";

export const size = {
  width: 192,
  height: 192,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #047857 0%, #065f46 100%)",
          borderRadius: "42px",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: "-1px",
            lineHeight: 1,
          }}
        >
          VND
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "1px",
            opacity: 0.92,
          }}
        >
          SF AI
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
