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
  onSurface
}: DeepSeaStatusBarProps) {
  const isDanger = lives === 1;

  const getMissionMeta = () => {
    if (!currentMission) {
      return {
        icon: <Waves className="w-4 h-4 text-cyan-400 shrink-0" />,
        badgeText: "미션 로딩 중...",
        badgeColor: "bg-cyan-950/60 border-cyan-500/40 text-cyan-300"
      };
    }

    switch (currentMission.condition) {
      case "same_year":
        return {
          icon: <Calendar className="w-4 h-4 text-amber-400 shrink-0" />,
          badgeText: `발매연도 일치 (${currentMission.targetCriteriaText})`,
          badgeColor: "bg-amber-500/15 border-amber-500/40 text-amber-300"
        };
      case "same_agency":
        return {
          icon: <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />,
          badgeText: `소속사 일치 (${currentMission.targetCriteriaText})`,
          badgeColor: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
        };
      case "same_composer":
        return {
          icon: <Music2 className="w-4 h-4 text-cyan-400 shrink-0" />,
          badgeText: `작곡가 연결 (${currentMission.targetCriteriaText})`,
          badgeColor: "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
        };
      case "any_song":
      default:
        return {
          icon: <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />,
          badgeText: "자유 다이빙 보너스 (타 가수 모든 곡 가능)",
          badgeColor: "bg-cyan-500/20 border-cyan-400 text-cyan-300"
        };
    }
  };

  const missionMeta = getMissionMeta();

  return (
    <div className="w-full bg-[#0A1018] border border-cyan-500/30 rounded-xl p-3 sm:p-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {/* Left: Depth Meter & Hearts HUD */}
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          {/* Depth Counter HUD */}
          <div className="flex items-center gap-2 bg-[#0E1622] border border-cyan-500/40 px-3 py-2 rounded-lg">
            <Waves className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <div className="text-[9px] text-cyan-400 font-black uppercase tracking-widest whitespace-nowrap break-keep">
                DEPTH
              </div>
              <div className="text-base sm:text-lg font-black text-cyan-200 tracking-tight leading-none">
                {depth}m
              </div>
            </div>
          </div>

          {/* Hearts HUD */}
          <div
            className={`flex items-center gap-2 bg-[#0E1622] border px-3 py-2 rounded-lg ${
              isDanger ? "border-rose-500/80" : "border-slate-800"
            }`}
          >
            <div className="flex items-center gap-1">
              {Array.from({ length: maxLives }).map((_, idx) => {
                const isAlive = idx < lives;
                return (
                  <Heart
                    key={idx}
                    className={`w-4 h-4 transition-transform ${
                      isAlive ? "text-rose-500 fill-rose-500" : "text-slate-700"
                    }`}
                  />
                );
              })}
            </div>
            <div className="text-xs font-bold text-slate-300 pl-1 border-l border-slate-800 whitespace-nowrap break-keep">
              산소 {lives}/{maxLives}
            </div>
          </div>

          {/* Fallback Bonus Alert */}
          {currentMission?.condition === "any_song" && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-2.5 py-1.5 rounded-lg break-keep">
              <AlertTriangle className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>막다른 골목 구제 보너스 발동</span>
            </div>
          )}
        </div>

        {/* Center/Right: Current Mission Card & Surface Action */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-2.5 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-slate-800/80">
          {/* Active Mission Pill */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold break-keep ${missionMeta.badgeColor}`}
          >
            {missionMeta.icon}
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-wider opacity-80">
                현재 잠항 조건 (+100m)
              </span>
              <span className="text-xs sm:text-sm font-extrabold leading-snug break-keep">
                {missionMeta.badgeText}
              </span>
            </div>
          </div>

          {/* Surface Button */}
          <button
            onClick={onSurface}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[#141E2E] hover:bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 transition-all active:scale-95 whitespace-nowrap break-keep shrink-0 ml-auto sm:ml-0"
            title="현재 수심 기록을 저장하고 수면으로 안전하게 부상합니다"
          >
            <Anchor className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>수면 부상</span>
          </button>
        </div>
      </div>
    </div>
  );
}
