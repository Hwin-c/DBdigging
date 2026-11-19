import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "디비디깅 — 크레딧과 소리로 음악 디깅";
const DESCRIPTION =
  "곡을 고르면 그 곡을 만든 작곡·작사·편곡·프로듀서와 소리 특성을 보여 주고, 그 사람들이 만든 다른 곡을 소리가 비슷한 순으로 추천합니다.";

export const metadata: Metadata = {
  metadataBase: new URL("https://db-digging.web.app"),
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["음악 디깅", "크레딧", "작곡가", "프로듀서", "MusicBrainz", "디비디깅"],
  openGraph: {
    title: "디비디깅 (DBDIGGING)",
    description: "크레딧과 소리로 이어지는 음악 디깅 도구",
    url: "https://db-digging.web.app",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0f17",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased bg-[#0b0f17] text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
