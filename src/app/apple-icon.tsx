import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
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
          background: "linear-gradient(135deg, #047857 0%, #064e3b 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 50,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          VND
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "0.5px",
            opacity: 0.95,
          }}
        >
          FINANCE
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
