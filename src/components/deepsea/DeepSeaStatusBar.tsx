"use client";

import React from "react";
import { DeepSeaMission, SongInfo } from "@/lib/graph/types";
import { Waves, Heart, Anchor, Calendar, Building2, Music2, Sparkles, AlertTriangle } from "lucide-react";

interface DeepSeaStatusBarProps {
  depth: number;
  lives: number;
  maxLives?: number;
  currentMission: DeepSeaMission | null;
  currentSong: SongInfo;
  onSurface: () => void;
}

export function DeepSeaStatusBar({
  depth,
  lives,
  maxLives = 3,
  currentMission,
  currentSong,
  onSurface
}: DeepSeaStatusBarProps) {
  const isDanger = lives === 1;

  // 미션 아이콘 및 뱃지 설정
  const getMissionMeta = () => {
    if (!currentMission) {
      return {
        icon: <Waves className="w-4 h-4 text-cyan-400" />,
        badgeText: "미션 로딩 중...",
        badgeColor: "bg-cyan-950/60 border-cyan-500/40 text-cyan-300"
      };
    }

    switch (currentMission.condition) {
      case "same_year":
        return {
          icon: <Calendar className="w-4 h-4 text-amber-400" />,
          badgeText: `📅 발매연도 일치 (${currentMission.targetCriteriaText})`,
          badgeColor: "bg-amber-950/60 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
        };
      case "same_agency":
        return {
          icon: <Building2 className="w-4 h-4 text-emerald-400" />,
          badgeText: `🏢 소속사 일치 (${currentMission.targetCriteriaText})`,
          badgeColor: "bg-emerald-950/60 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
        };
      case "same_composer":
        return {
          icon: <Music2 className="w-4 h-4 text-purple-400" />,
          badgeText: `🎼 작곡가 연결 (${currentMission.targetCriteriaText})`,
          badgeColor: "bg-purple-950/60 border-purple-500/40 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
        };
      case "any_song":
      default:
        return {
          icon: <Sparkles className="w-4 h-4 text-cyan-400" />,
          badgeText: "🌊 자유 다이빙 보너스 (아무 곡이나 이동 가능)",
          badgeColor: "bg-cyan-950/60 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)] animate-pulse"
        };
    }
  };

  const missionMeta = getMissionMeta();

  return (
    <div className="w-full bg-gradient-to-r from-[#071322]/90 via-[#0a1b30]/90 to-[#071322]/90 border border-cyan-500/30 rounded-2xl p-4 sm:p-5 shadow-[0_4px_25px_rgba(6,182,212,0.15)] backdrop-blur-md mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: Depth Meter & Hearts HUD */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Depth Counter HUD */}
          <div className="flex items-center gap-2.5 bg-slate-950/70 border border-cyan-500/40 px-3.5 py-2.5 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <Waves className="w-5 h-5 text-cyan-400 animate-bounce" />
            <div>
              <div className="text-[10px] text-cyan-400/80 font-bold uppercase tracking-wider">
                현재 수심
              </div>
              <div className="text-xl font-black text-cyan-200 tracking-tight leading-none">
                {depth}m
              </div>
            </div>
          </div>

          {/* Hearts HUD */}
          <div
            className={`flex items-center gap-2 bg-slate-950/70 border px-3.5 py-2.5 rounded-xl ${
              isDanger
                ? "border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse"
                : "border-slate-800"
            }`}
          >
            <div className="flex items-center gap-1">
              {Array.from({ length: maxLives }).map((_, idx) => {
                const isAlive = idx < lives;
                return (
                  <Heart
                    key={idx}
                    className={`w-5 h-5 transition-transform ${
                      isAlive
                        ? "text-rose-500 fill-rose-500 scale-100 drop-shadow-[0_0_6px_rgba(244,63,94,0.6)]"
                        : "text-slate-700 fill-slate-800 scale-90"
                    }`}
                  />
                );
              })}
            </div>
            {isDanger && (
              <span className="text-[11px] font-black text-rose-400 ml-1 flex items-center gap-0.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                위험!
              </span>
            )}
          </div>
        </div>

        {/* Center: Current Mission Card (Zero Truncation) */}
        <div className="flex-1">
          <div
            className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-bold ${missionMeta.badgeColor}`}
          >
            <div className="flex items-center gap-2 leading-tight">
              {missionMeta.icon}
              <span>{missionMeta.badgeText}</span>
            </div>
            {currentMission && currentMission.validCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-md bg-black/50 text-cyan-200 shrink-0 border border-white/10 font-bold">
                정답 {currentMission.validCount}곡
              </span>
            )}
          </div>
        </div>

        {/* Right: Emergency Surface Button (Zero Truncation) */}
        <div className="flex items-center justify-end shrink-0">
          <button
            onClick={onSurface}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900/80 hover:bg-slate-800 text-amber-300 border border-amber-500/40 hover:border-amber-400 transition-all active:scale-95 shadow-[0_0_10px_rgba(245,158,11,0.15)] whitespace-nowrap shrink-0"
            title="현재 수심에서 다이빙을 마치고 플레이리스트를 수확합니다"
          >
            <Anchor className="w-4 h-4 text-amber-400" />
            <span>⚓ 다이빙 종료 (중도 부상)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
