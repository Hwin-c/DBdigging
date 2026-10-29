"use client";

import React from "react";
import { Disc3, Flame, Lightbulb, Compass, Waves, BarChart3, HelpCircle, SlidersHorizontal } from "lucide-react";

interface HeaderProps {
  gameMode: "daily" | "practice" | "deepsea";
  onSelectGameMode: (mode: "daily" | "practice" | "deepsea") => void;
  isHintMode: boolean;
  onToggleHintMode: () => void;
  isHardcore: boolean;
  onToggleHardcore: () => void;
  onOpenPracticeLauncher: () => void;
  onResetToDaily: () => void;
  onOpenStats?: () => void;
  onOpenTutorial?: () => void;
}

export function Header({
  gameMode,
  onSelectGameMode,
  isHintMode,
  onToggleHintMode,
  isHardcore,
  onToggleHardcore,
  onOpenPracticeLauncher,
  onResetToDaily,
  onOpenStats,
  onOpenTutorial
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/90 bg-[#090A0F]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onResetToDaily}
            className="flex items-center gap-2.5 group text-left transition-transform active:scale-95 shrink-0"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#121620] border border-emerald-500/50 flex items-center justify-center group-hover:border-emerald-400 transition-colors">
              <Disc3 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 group-hover:rotate-180 transition-transform duration-700" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm sm:text-base tracking-tight text-white">
                  디비디깅
                </span>
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  DBDIGGING
                </span>
              </div>
              <p className="text-[9px] text-slate-400 tracking-widest hidden sm:block">
                K-POP CREDIT NETWORK PUZZLE
              </p>
            </div>
          </button>

          {/* Mode Switch Tabs (Desktop) */}
          <div className="hidden lg:flex items-center bg-[#0F131C] border border-slate-800 rounded-lg p-1 ml-3 gap-1">
            <button
              onClick={() => onSelectGameMode("daily")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap break-keep ${
                gameMode === "daily"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Disc3 className="w-3.5 h-3.5" />
              <span>오늘의 디깅</span>
            </button>
            <button
              onClick={() => onSelectGameMode("practice")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap break-keep ${
                gameMode === "practice"
                  ? "bg-amber-400 text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>맞춤 디깅</span>
            </button>
            <button
              onClick={() => onSelectGameMode("deepsea")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap break-keep ${
                gameMode === "deepsea"
                  ? "bg-cyan-400 text-slate-950"
                  : "text-slate-400 hover:text-cyan-300"
              }`}
            >
              <Waves className="w-3.5 h-3.5" />
              <span>심해 디깅</span>
            </button>
          </div>
        </div>

        {/* Right Controls: Hint, Hardcore, Practice Launcher, Stats, Guide */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Practice Mode Launcher Button */}
          {gameMode === "practice" && (
            <button
              onClick={onOpenPracticeLauncher}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-all whitespace-nowrap break-keep"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
              <span>조건 재설정</span>
            </button>
          )}

          {/* Hint Mode Toggle */}
          <button
            onClick={onToggleHintMode}
            title={isHintMode ? "힌트 모드 끄기" : "힌트 모드 켜기"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap break-keep ${
              isHintMode
                ? "bg-amber-500/20 border-amber-400 text-amber-300"
                : "bg-[#121620] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            <Lightbulb
              className={`w-3.5 h-3.5 ${isHintMode ? "text-amber-300" : "text-slate-500"}`}
            />
            <span className="hidden sm:inline">힌트</span>
          </button>

          {/* Hardcore Mode Toggle (Only in Mode 1) */}
          {gameMode !== "deepsea" && (
            <button
              onClick={onToggleHardcore}
              title={isHardcore ? "일반 모드로 전환" : "하드코어 주관식 모드로 전환"}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap break-keep ${
                isHardcore
                  ? "bg-rose-500/20 border-rose-500 text-rose-300"
                  : "bg-[#121620] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <Flame
                className={`w-3.5 h-3.5 ${isHardcore ? "text-rose-400" : "text-slate-500"}`}
              />
              <span className="hidden sm:inline">하드코어</span>
            </button>
          )}

          {/* Stats Button */}
          {onOpenStats && (
            <button
              onClick={onOpenStats}
              title="내 전적 및 백업/복원"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#121620] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all active:scale-95 whitespace-nowrap break-keep"
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">전적</span>
            </button>
          )}

          {/* Guide / Tutorial Button */}
          {onOpenTutorial && (
            <button
              onClick={onOpenTutorial}
              title="게임 방법 및 가이드"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#121620] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all active:scale-95 whitespace-nowrap break-keep"
            >
              <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">가이드</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile/Tablet Mode Switcher Bar */}
      <div className="lg:hidden flex items-center justify-between border-t border-slate-800/80 bg-[#0B0E14] px-3 py-1.5 gap-1.5">
        <div className="flex items-center gap-1 flex-1">
          <button
            onClick={() => onSelectGameMode("daily")}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-bold transition-all whitespace-nowrap break-keep ${
              gameMode === "daily" ? "bg-emerald-500 text-slate-950" : "text-slate-400 bg-[#121620]"
            }`}
          >
            <Disc3 className="w-3 h-3 shrink-0" />
            <span>오늘의 디깅</span>
          </button>
          <button
            onClick={() => onSelectGameMode("practice")}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-bold transition-all whitespace-nowrap break-keep ${
              gameMode === "practice" ? "bg-amber-400 text-slate-950" : "text-slate-400 bg-[#121620]"
            }`}
          >
            <Compass className="w-3 h-3 shrink-0" />
            <span>맞춤 디깅</span>
          </button>
          <button
            onClick={() => onSelectGameMode("deepsea")}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-bold transition-all whitespace-nowrap break-keep ${
              gameMode === "deepsea" ? "bg-cyan-400 text-slate-950" : "text-slate-400 bg-[#121620]"
            }`}
          >
            <Waves className="w-3 h-3 shrink-0" />
            <span>심해 디깅</span>
          </button>
        </div>
        {gameMode === "practice" && (
          <button
            onClick={onOpenPracticeLauncher}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40 shrink-0 whitespace-nowrap break-keep"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>조건</span>
          </button>
        )}
      </div>
    </header>
  );
}
