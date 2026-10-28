"use client";

import React, { useRef, useEffect } from "react";
import { DiveHistoryStep } from "@/components/deepsea/DeepSeaResultModal";
import { ConnectedPerson } from "@/lib/graph/types";
import { Waves, Heart, CheckCircle2, XCircle, Anchor, Disc, User } from "lucide-react";

interface DeepSeaSonarMapProps {
  diveHistory: DiveHistoryStep[];
  currentDepth: number;
  lives: number;
  selectedPerson?: ConnectedPerson | null;
  className?: string;
}

export function DeepSeaSonarMap({
  diveHistory,
  currentDepth,
  lives,
  selectedPerson,
  className = ""
}: DeepSeaSonarMapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 다이빙할 때마다 최신 수심 노드로 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [diveHistory.length, currentDepth, selectedPerson]);

  return (
    <div
      className={`relative w-full bg-[#071220]/90 border border-cyan-500/30 rounded-2xl p-4 backdrop-blur-md overflow-hidden flex flex-col shadow-inner ${className}`}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between px-1 pb-3 border-b border-cyan-950/60 mb-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-cyan-200 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            2-Mode 수직 잠수 소나 맵
          </span>
          <span className="text-[11px] text-cyan-500/80 hidden sm:inline">
            • 100m 단위 수직 하강 궤적
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-cyan-300">수심 {currentDepth}m</span>
          <div className="flex items-center gap-1">
            {[...Array(3)].map((_, i) => (
              <Heart
                key={i}
                className={`w-3.5 h-3.5 ${
                  i < lives
                    ? "text-rose-500 fill-rose-500"
                    : "text-slate-700 fill-slate-800"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Vertical Descent Scroll Viewport */}
      <div
        ref={scrollRef}
        className="w-full overflow-y-auto no-scrollbar relative min-h-[220px] max-h-[380px] pr-2"
      >
        <div className="relative flex flex-col gap-3 py-2">
          {/* Central Vertical Descent Line */}
          <div className="absolute left-[26px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-cyan-400 via-sky-600 to-indigo-900 opacity-60" />

          {diveHistory.map((step, idx) => {
            const isStart = idx === 0;
            const isCurrent = idx === diveHistory.length - 1 && !selectedPerson;
            const isValid = step.isValid;

            return (
              <React.Fragment key={`sonar_step_${idx}`}>
                {/* 1. 중간 경유 인물 노드 (2-Mode 시각화) */}
                {step.viaPerson && (
                  <div className="relative flex items-center gap-3 pl-2 py-0.5 opacity-90">
                    <div className="relative flex items-center justify-center shrink-0 w-[44px]">
                      <div className="w-5 h-5 rounded-md bg-amber-950/80 border border-amber-500/60 flex items-center justify-center text-[10px] text-amber-300 shadow-sm">
                        👤
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-500/30 text-xs">
                      <span className="font-bold text-amber-200">{step.viaPerson.name}</span>
                      <span className="text-[10px] text-amber-400/80 font-medium">
                        ({step.viaPerson.roleLabels?.slice(0, 2).join("·") || "경유"})
                      </span>
                    </div>
                  </div>
                )}

                {/* 2. 노래 노드 (수심 단위) */}
                <div
                  className={`relative flex items-center gap-3 group transition-all duration-300 ${
                    isCurrent ? "scale-[1.02]" : "opacity-85 hover:opacity-100"
                  }`}
                >
                  {/* Left Depth Node Icon */}
                  <div className="relative flex items-center justify-center shrink-0 w-[52px]">
                    {/* Sonar Pulse Ring for Current Active Node */}
                    {isCurrent && (
                      <div className="absolute w-8 h-8 rounded-full border border-cyan-400/80 animate-ping" />
                    )}

                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs font-bold z-10 transition-all ${
                        isStart
                          ? "bg-emerald-950 border-emerald-400 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                          : isCurrent
                          ? "bg-cyan-950 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.6)]"
                          : isValid
                          ? "bg-slate-900 border-cyan-800 text-cyan-400"
                          : "bg-rose-950/80 border-rose-500 text-rose-400"
                      }`}
                    >
                      {isStart ? (
                        <Anchor className="w-3.5 h-3.5 text-emerald-400" />
                      ) : isValid ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      )}
                    </div>
                  </div>

                  {/* Right Info Box */}
                  <div
                    className={`flex-1 rounded-xl p-3 border transition-all ${
                      isCurrent
                        ? "bg-cyan-950/50 border-cyan-500/60 shadow-lg"
                        : "bg-[#091526]/70 border-cyan-900/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-cyan-300 px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800/60">
                        {isStart ? "수면 (0m)" : `수심 ${step.depthAtStep}m`}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <h5 className="text-xs font-bold text-white line-clamp-1">
                        {step.song.title}
                      </h5>
                      <span className="text-[11px] text-cyan-300/80 shrink-0 line-clamp-1">
                        {step.song.artist}
                      </span>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {/* 3. Step 1에서 선택된 실시간 점등 아티스트 캡슐 노드 */}
          {selectedPerson && (
            <div className="relative flex items-center gap-3 pl-2 py-1 animate-pulse">
              <div className="relative flex items-center justify-center shrink-0 w-[44px]">
                <div className="absolute w-7 h-7 rounded-full border border-amber-400 animate-ping opacity-60" />
                <div className="w-6 h-6 rounded-md bg-amber-950 border border-amber-400 flex items-center justify-center text-xs text-amber-200 z-10 shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                  {selectedPerson.isGroup ? "👥" : "👤"}
                </div>
              </div>
              <div className="flex-1 rounded-xl p-2.5 bg-amber-950/50 border border-amber-400/60 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-200">
                    {selectedPerson.name}
                  </span>
                  <span className="text-[10px] font-bold text-amber-400 px-2 py-0.5 rounded bg-black/40 border border-amber-500/30">
                    다음 곡 선택 중 ➔
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
