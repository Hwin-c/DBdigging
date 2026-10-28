"use client";

import React from "react";
import { SongInfo } from "@/lib/graph/types";
import { Undo2, Target, Flag } from "lucide-react";

interface QuestStatusBarProps {
  startSong: SongInfo;
  targetSong: SongInfo;
  turnCount: number;
  optimalTurns: number;
  canBacktrack: boolean;
  onBacktrack: () => void;
  onGiveUp?: () => void;
  gameMode?: "daily" | "practice";
}

export function QuestStatusBar({
  startSong,
  targetSong,
  turnCount,
  optimalTurns,
  canBacktrack,
  onBacktrack,
  onGiveUp,
  gameMode = "daily"
}: QuestStatusBarProps) {
  // 턴 평가 상태 계산
  const turnDiff = turnCount - optimalTurns;
  const isOptimal = turnDiff <= 0;
  const isGood = turnDiff > 0 && turnDiff <= 2;

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-lg backdrop-blur-md mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Mission Goal: Start Song -> Target Song (Zero Truncation) */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          {/* Start Song Card */}
          <div className="flex items-center gap-3 bg-slate-950/70 border border-slate-800 px-3.5 py-2.5 rounded-xl shadow-sm">
            <Flag className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                출발 곡
              </div>
              <div className="text-sm font-bold text-white leading-tight">
                {startSong.title}
              </div>
              <div className="text-xs text-slate-400 leading-tight">{startSong.artist}</div>
            </div>
          </div>

          <div className="text-slate-600 font-bold text-xl hidden sm:block shrink-0">➔</div>

          {/* Target Song Card */}
          <div className="flex items-center gap-3 bg-slate-950/70 border border-purple-500/40 px-3.5 py-2.5 rounded-xl shadow-[0_0_15px_rgba(168,85,247,0.15)]">
            <Target className="w-4 h-4 text-purple-400 shrink-0 animate-pulse" />
            <div>
              <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">
                목표 도착 곡
              </div>
              <div className="text-sm font-bold text-purple-100 leading-tight">
                {targetSong.title}
              </div>
              <div className="text-xs text-purple-300/80 leading-tight">{targetSong.artist}</div>
            </div>
          </div>
        </div>

        {/* Right side: Turns & Action Buttons */}
        <div className="flex items-center justify-between lg:justify-end gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800/80">
          {/* Turns Badge */}
          <div className="flex flex-col items-start lg:items-end shrink-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-slate-400">진행 턴:</span>
              <span
                className={`text-xl font-black ${
                  isOptimal
                    ? "text-emerald-400"
                    : isGood
                    ? "text-amber-400"
                    : "text-slate-200"
                }`}
              >
                {turnCount}턴
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              (최적 경로: <strong className="text-indigo-300 font-bold">{optimalTurns}턴</strong>)
            </span>
          </div>

          {/* Action buttons: Backtrack & Give Up (Zero Truncation) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onBacktrack}
              disabled={!canBacktrack}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all active:scale-95 whitespace-nowrap shrink-0 ${
                canBacktrack
                  ? "bg-slate-800/90 text-slate-200 border-slate-700 hover:bg-slate-700/80 hover:text-white hover:border-slate-600 shadow-sm"
                  : "bg-slate-900/40 text-slate-600 border-slate-800/60 cursor-not-allowed"
              }`}
              title={canBacktrack ? "직전 곡으로 되돌아가기" : "출발 곡에서는 되돌아갈 수 없습니다"}
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>↩️ 이전 곡 되돌아가기</span>
            </button>

            {onGiveUp && (
              <button
                onClick={onGiveUp}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 hover:border-rose-500/60 transition-all shadow-sm active:scale-95 whitespace-nowrap shrink-0"
                title="포기하고 최단 정답 경로 확인하기"
              >
                <span>🏳️ 포기 / 정답</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
