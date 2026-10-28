"use client";

import React from "react";
import { SongInfo } from "@/lib/graph/types";
import { Undo2, Target, Flag, Sparkles } from "lucide-react";

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
    <div className="w-full bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 shadow-lg backdrop-blur-md">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Mission Goal: Start Song -> Target Song */}
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          {/* Start Song */}
          <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 px-3 py-2 rounded-xl">
            <Flag className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-[10px] text-emerald-400/80 font-bold uppercase tracking-wider">
                출발 곡
              </div>
              <div className="text-xs sm:text-sm font-bold text-white line-clamp-1">
                {startSong.title}
              </div>
              <div className="text-[11px] text-slate-400 line-clamp-1">{startSong.artist}</div>
            </div>
          </div>

          <div className="text-slate-600 font-bold text-lg hidden sm:block">➔</div>

          {/* Target Song */}
          <div className="flex items-center gap-2 bg-slate-950/60 border border-purple-500/30 px-3 py-2 rounded-xl shadow-[0_0_12px_rgba(168,85,247,0.15)]">
            <Target className="w-4 h-4 text-purple-400 shrink-0 animate-pulse" />
            <div>
              <div className="text-[10px] text-purple-400/80 font-bold uppercase tracking-wider">
                목표 도착 곡
              </div>
              <div className="text-xs sm:text-sm font-bold text-purple-100 line-clamp-1">
                {targetSong.title}
              </div>
              <div className="text-[11px] text-purple-300/80 line-clamp-1">{targetSong.artist}</div>
            </div>
          </div>
        </div>

        {/* Right side: Turns & Backtrack Button */}
        <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/60">
          {/* Turns Badge */}
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-slate-400">진행 턴:</span>
                <span
                  className={`text-lg font-black ${
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
                (최적 최단 경로: <span className="text-indigo-300 font-semibold">{optimalTurns}턴</span>)
              </span>
            </div>
          </div>

          {/* Action buttons: Backtrack & Give Up */}
          <div className="flex items-center gap-2">
            <button
              onClick={onBacktrack}
              disabled={!canBacktrack}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
                canBacktrack
                  ? "bg-slate-800/90 text-slate-200 border-slate-700 hover:bg-slate-700/80 hover:text-white hover:border-slate-600 shadow-sm"
                  : "bg-slate-900/40 text-slate-600 border-slate-800/60 cursor-not-allowed"
              }`}
              title={canBacktrack ? "직전 곡으로 되돌아가기" : "출발 곡에서는 되돌아갈 수 없습니다"}
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>되돌아가기</span>
            </button>

            {onGiveUp && (
              <button
                onClick={onGiveUp}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 hover:border-rose-500/60 transition-all shadow-sm active:scale-95 shrink-0"
                title="포기하고 정답 경로 확인하기"
              >
                <span>🏳️ 정답</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
