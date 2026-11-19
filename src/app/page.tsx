"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DigApp } from "@/components/dig/DigApp";
import { SwipeApp } from "@/components/swipe/SwipeApp";

/** 기본은 스와이프 디깅, ?view=list 는 기존 목록 화면 (PC에서 전환) */
function Home() {
  const view = useSearchParams().get("view");
  if (view === "list") {
    return (
      <div className="min-h-screen bg-[#0b0f17] text-slate-100">
        <DigApp />
      </div>
    );
  }
  return <SwipeApp />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}
