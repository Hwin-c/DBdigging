"use client";

import React from "react";
import { Disc3, Flame, Lightbulb, Compass, Waves, BarChart3, HelpCircle } from "lucide-react";

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
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0b0f17]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={onResetToDaily}
            className="flex items-center gap-2 group text-left transition-transform active:scale-95"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-0.5 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.35)] group-hover:shadow-[0_0_20px_rgba(168,85,247,0.5)] transition-all">
              <div className="w-full h-full bg-[#0b0f17] rounded-[10px] flex items-center justify-center">
                <Disc3 className="w-5 h-5 text-indigo-400 group-hover:rotate-180 transition-transform duration-700" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-indigo-100 to-purple-200 bg-clip-text text-transparent">
                  디비디깅
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  MVP
                </span>
              </div>
              <p className="text-[10px] text-slate-400 tracking-wider">K-POP CREDIT PUZZLE</p>
            </div>
          </button>

          {/* Mode Switch Tabs (Desktop) */}
          <div className="hidden lg:flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-1 ml-4 gap-1">
            <button
              onClick={() => onSelectGameMode("daily")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                gameMode === "daily"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              오늘의 디깅
            </button>
            <button
              onClick={() => onSelectGameMode("practice")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                gameMode === "practice"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              자유 연습
            </button>
            <button
              onClick={() => onSelectGameMode("deepsea")}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                gameMode === "deepsea"
                  ? "bg-cyan-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                  : "text-slate-400 hover:text-cyan-300"
              }`}
            >
              <Waves className="w-3.5 h-3.5" />
              <span>심해 디깅</span>
            </button>
          </div>
        </div>

        {/* Right Controls: Hint, Hardcore, Practice Launcher */}
        <div className="flex items-center gap-2">
          {/* Practice Mode Launcher Button */}
          {gameMode === "practice" && (
            <button
              onClick={onOpenPracticeLauncher}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-950/70 border border-purple-500/40 text-purple-200 hover:bg-purple-900/60 hover:border-purple-400 transition-all shadow-[0_0_10px_rgba(168,85,247,0.2)]"
            >
              <Compass className="w-3.5 h-3.5 text-purple-400" />
              <span>새 미션 선택</span>
            </button>
          )}

          {/* Hint Mode Toggle */}
          <button
            onClick={onToggleHintMode}
            title={isHintMode ? "힌트 모드 끄기" : "힌트 모드 켜기 (정답 루트 강조 및 블라인드 해제)"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isHintMode
                ? "bg-amber-950/70 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                : "bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}
          >
            <Lightbulb
              className={`w-3.5 h-3.5 ${isHintMode ? "text-amber-300 animate-pulse fill-amber-300/30" : "text-slate-500"}`}
            />
            <span className="hidden sm:inline">힌트</span>
          </button>

          {/* Hardcore Mode Toggle (Only in Mode 1) */}
          {gameMode !== "deepsea" && (
            <button
              onClick={onToggleHardcore}
              title={isHardcore ? "일반 모드로 전환" : "하드코어 주관식 모드로 전환"}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isHardcore
                  ? "bg-rose-950/70 border-rose-500 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse"
                  : "bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <Flame
                className={`w-3.5 h-3.5 ${isHardcore ? "text-rose-400 fill-rose-400/40" : "text-slate-500"}`}
              />
              <span className="hidden sm:inline">하드코어</span>
            </button>
          )}

          {/* Stats Button */}
          {onOpenStats && (
            <button
              onClick={onOpenStats}
              title="내 전적 및 백업/복원"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all shadow-sm active:scale-95"
            >
              <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">전적</span>
            </button>
          )}

          {/* Guide / Tutorial Button */}
          {onOpenTutorial && (
            <button
              onClick={onOpenTutorial}
              title="게임 방법 및 가이드"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all shadow-sm active:scale-95"
            >
              <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">가이드</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile/Tablet Mode Switcher Bar */}
      <div className="lg:hidden flex items-center justify-around border-t border-slate-800/80 bg-slate-950/60 px-3 py-2 gap-1 overflow-x-auto">
        <button
          onClick={() => onSelectGameMode("daily")}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 transition-all ${
            gameMode === "daily" ? "bg-indigo-600 text-white" : "text-slate-400"
          }`}
        >
          오늘의 디깅
        </button>
        <button
          onClick={() => onSelectGameMode("practice")}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 transition-all ${
            gameMode === "practice" ? "bg-purple-600 text-white" : "text-slate-400"
          }`}
        >
          자유 연습
        </button>
        <button
          onClick={() => onSelectGameMode("deepsea")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 transition-all ${
            gameMode === "deepsea" ? "bg-cyan-600 text-white" : "text-slate-400"
          }`}
        >
          <Waves className="w-3 h-3" />
          <span>심해 디깅</span>
        </button>
        {gameMode === "practice" && (
          <button
            onClick={onOpenPracticeLauncher}
            className="px-2 py-1 rounded-md text-xs font-semibold bg-purple-900/60 text-purple-200 border border-purple-500/30 shrink-0"
          >
            미션 변경
          </button>
        )}
      </div>
    </header>
  );
}
