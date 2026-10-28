"use client";

import React, { useRef, useEffect } from "react";
import { DiveHistoryStep } from "@/components/deepsea/DeepSeaResultModal";
import { Waves, Heart, CheckCircle2, XCircle, Anchor } from "lucide-react";

interface DeepSeaSonarMapProps {
  diveHistory: DiveHistoryStep[];
  currentDepth: number;
  lives: number;
  className?: string;
}

export function DeepSeaSonarMap({
  diveHistory,
  currentDepth,
  lives,
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
  }, [diveHistory.length, currentDepth]);

  return (
    <div
      className={`relative w-full bg-[#071220]/90 border border-cyan-500/30 rounded-2xl p-3.5 backdrop-blur-md overflow-hidden flex flex-col shadow-inner ${className}`}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between px-2 pb-2.5 border-b border-cyan-950/60 mb-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-cyan-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            수직 잠수 소나 맵
          </span>
          <span className="text-[10px] text-cyan-500/80 hidden sm:inline">
            • 수심 100m 단위 수직 하강 궤적
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-cyan-300">수심 {currentDepth}m</span>
          <div className="flex items-center gap-0.5">
            {[...Array(3)].map((_, i) => (
              <Heart
                key={i}
                className={`w-3 h-3 ${
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
        className="w-full overflow-y-auto no-scrollbar relative min-h-[180px] max-h-[260px] pr-2"
      >
        <div className="relative flex flex-col gap-3 py-2">
          {/* Central Vertical Descent Line */}
          <div className="absolute left-[26px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-cyan-400 via-sky-600 to-indigo-900 opacity-60" />

          {diveHistory.map((step, idx) => {
            const isStart = idx === 0;
            const isCurrent = idx === diveHistory.length - 1;
            const isValid = step.isValid;

            return (
              <div
                key={`sonar_step_${idx}`}
                className={`relative flex items-center gap-3 group transition-all duration-300 ${
                  isCurrent ? "scale-[1.02]" : "opacity-80 hover:opacity-100"
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
                  className={`flex-1 rounded-xl p-2.5 border transition-all ${
                    isCurrent
                      ? "bg-cyan-950/40 border-cyan-500/50 shadow-md"
                      : "bg-[#091526]/60 border-cyan-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-bold text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/50">
                      {isStart ? "수면 (0m)" : `수심 ${step.depthAtStep}m`}
                    </span>
                    {step.viaPerson && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        경유: <strong className="text-white">{step.viaPerson.name}</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline justify-between gap-2">
                    <h5 className="text-xs font-bold text-white line-clamp-1">
                      {step.song.title}
                    </h5>
                    <span className="text-[10px] text-slate-400 shrink-0 line-clamp-1">
                      {step.song.artist}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
