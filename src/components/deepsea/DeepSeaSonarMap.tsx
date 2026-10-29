"use client";

import React, { useRef, useState, useEffect } from "react";
import { DiveHistoryStep } from "@/components/deepsea/DeepSeaResultModal";
import { ConnectedPerson } from "@/lib/graph/types";
import { Waves, Heart, CheckCircle2, XCircle, Anchor, Disc3, User, Users, ChevronDown } from "lucide-react";

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
  const [mobileHeightMode, setMobileHeightMode] = useState<"fold" | "default" | "expand">("default");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [diveHistory.length, currentDepth, selectedPerson]);

  const mobileViewportClass =
    mobileHeightMode === "fold"
      ? "h-0 overflow-hidden py-0"
      : mobileHeightMode === "expand"
      ? "h-[380px]"
      : "h-[220px]";

  return (
    <div
      className={`relative w-full bg-[#090A0F] border border-cyan-500/30 rounded-xl overflow-hidden flex flex-col ${className}`}
    >
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-[#0D1117] gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Waves className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="font-black text-white tracking-tight whitespace-nowrap break-keep">
            수직 잠수 소나 트랙
          </span>
        </div>

        {/* 모바일 전용 맵 높이 3단계 토글 */}
        <div className="flex lg:hidden items-center bg-[#141923] border border-slate-800 rounded-md p-0.5 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setMobileHeightMode("fold")}
            className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap break-keep ${
              mobileHeightMode === "fold" ? "bg-cyan-400 text-slate-950" : "text-slate-400"
            }`}
          >
            접기
          </button>
          <button
            type="button"
            onClick={() => setMobileHeightMode("default")}
            className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap break-keep ${
              mobileHeightMode === "default" ? "bg-cyan-400 text-slate-950" : "text-slate-400"
            }`}
          >
            기본
          </button>
          <button
            type="button"
            onClick={() => setMobileHeightMode("expand")}
            className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap break-keep ${
              mobileHeightMode === "expand" ? "bg-cyan-400 text-slate-950" : "text-slate-400"
            }`}
          >
            크게
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-3">
          <span className="text-xs font-black text-cyan-400">수심 {currentDepth}m</span>
          <div className="flex items-center gap-1">
            {[...Array(3)].map((_, i) => (
              <Heart
                key={i}
                className={`w-3.5 h-3.5 ${
                  i < lives ? "text-rose-500 fill-rose-500" : "text-slate-700"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Vertical Descent Scroll Viewport */}
      <div
        ref={scrollRef}
        className={`w-full overflow-y-auto relative px-3.5 transition-all duration-200 ${mobileViewportClass} lg:h-[620px]`}
        style={{
          backgroundImage: "radial-gradient(#1e293b 1px, transparent 1px)",
          backgroundSize: "20px 20px"
        }}
      >
        <div className="relative flex flex-col gap-3 py-4">
          {/* Central Vertical Descent Line */}
          <div className="absolute left-[25px] top-6 bottom-6 w-0.5 bg-slate-800" />

          {diveHistory.map((step, idx) => {
            const isStart = idx === 0;
            const isCurrent = idx === diveHistory.length - 1 && !selectedPerson;
            const isValid = step.isValid;

            return (
              <React.Fragment key={`sonar_step_${idx}`}>
                {/* 1. 중간 경유 인물 캡슐 노드 */}
                {step.viaPerson && (
                  <div className="relative flex items-center gap-3 pl-1 py-0.5">
                    <div className="relative flex items-center justify-center shrink-0 w-[44px]">
                      <div className="w-6 h-6 rounded-md bg-[#1C160B] border border-amber-500/60 flex items-center justify-center text-amber-400 z-10">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1C160B] border border-amber-500/40 text-xs">
                      <span className="font-bold text-amber-200">{step.viaPerson.name}</span>
                      <span className="text-[10px] text-amber-400 font-semibold">
                        [{step.viaPerson.roleLabels?.slice(0, 2).join("·") || "경유"}]
                      </span>
                    </div>
                  </div>
                )}

                {/* 2. 노래 LP 노드 (수심 단위) */}
                <div
                  className={`relative flex items-center gap-3 transition-all ${
                    isCurrent ? "opacity-100" : "opacity-85 hover:opacity-100"
                  }`}
                >
                  {/* Left Circular LP Disc Icon */}
                  <div className="relative flex items-center justify-center shrink-0 w-[52px]">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 bg-[#0B0E14] ${
                        isStart
                          ? "border-emerald-400 text-emerald-400"
                          : isCurrent
                          ? "border-cyan-400 text-cyan-400 animate-[spin_8s_linear_infinite]"
                          : isValid
                          ? "border-cyan-800 text-cyan-500"
                          : "border-rose-500 text-rose-400"
                      }`}
                    >
                      {isStart ? (
                        <Anchor className="w-4 h-4" />
                      ) : isCurrent ? (
                        <Disc3 className="w-5 h-5" />
                      ) : isValid ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                    </div>
                  </div>

                  {/* Right Info Box */}
                  <div
                    className={`flex-1 rounded-xl p-3 border transition-all min-w-0 ${
                      isCurrent
                        ? "bg-[#0F1B29] border-cyan-400/70"
                        : "bg-[#0D1117] border-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-black text-cyan-300 px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30">
                        {isStart ? "START (0m)" : `DEPTH ${step.depthAtStep}m`}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-2 min-w-0">
                      <h5 className="text-xs font-bold text-white truncate">{step.song.title}</h5>
                      <span className="text-[11px] text-cyan-300/80 shrink-0 truncate">
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
            <div className="relative flex items-center gap-3 pl-1 py-1">
              <div className="relative flex items-center justify-center shrink-0 w-[44px]">
                <div className="w-7 h-7 rounded-md bg-[#1C160B] border-2 border-amber-400 flex items-center justify-center text-amber-300 z-10">
                  {selectedPerson.isGroup ? (
                    <Users className="w-3.5 h-3.5" />
                  ) : (
                    <User className="w-3.5 h-3.5" />
                  )}
                </div>
              </div>
              <div className="flex-1 rounded-xl p-2.5 bg-[#1C160B] border border-amber-400/60">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-200 truncate">
                    {selectedPerson.name}
                  </span>
                  <span className="text-[10px] font-black text-amber-400 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 whitespace-nowrap break-keep">
                    다음 곡 선택 중
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {mobileHeightMode === "fold" && (
        <button
          type="button"
          onClick={() => setMobileHeightMode("default")}
          className="lg:hidden w-full py-2 px-3 bg-[#0D1117] text-[11px] font-bold text-slate-400 hover:text-white flex items-center justify-center gap-1.5 border-t border-slate-800"
        >
          <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
          <span>소나 트랙 펼치기 (현재 수심 {currentDepth}m)</span>
        </button>
      )}
    </div>
  );
}
