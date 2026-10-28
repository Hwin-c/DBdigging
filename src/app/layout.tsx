import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://db-digging.web.app"),
  title: "디비디깅 (DBDIGGING) — K-Pop 크레딧 꼬리잡기 퍼즐 게임",
  description: "매일 자정, 당신의 음악 지식을 시험하는 K-Pop 크레딧 꼬리잡기 퍼즐 게임. 6단계의 연결고리로 음악을 디깅하세요.",
  keywords: ["K-Pop", "음악 퀴즈", "크레딧", "작곡가", "프로듀서", "꼬리잡기", "디비디깅"],
  openGraph: {
    title: "디비디깅 (DBDIGGING)",
    description: "K-Pop 크레딧 꼬리잡기 퍼즐 게임",
    url: "https://db-digging.web.app",
    type: "website",
  },
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
