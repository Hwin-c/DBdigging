"use client";

import React from "react";
import { SongInfo } from "@/lib/graph/types";
import { Undo2, Target, Flag, HelpCircle, ArrowRight } from "lucide-react";

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
  onGiveUp
}: QuestStatusBarProps) {
  const turnDiff = turnCount - optimalTurns;
  const isOptimal = turnDiff <= 0;
  const isGood = turnDiff > 0 && turnDiff <= 2;

  return (
    <div className="w-full bg-[#0D1117] border border-slate-800 rounded-xl p-3 sm:p-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {/* Mission Goal: Start Song -> Target Song */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 flex-1 min-w-0">
          {/* Start Song Card */}
          <div className="flex items-center gap-2.5 bg-[#121721] border border-emerald-500/30 px-3 py-2 rounded-lg min-w-0">
            <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <Flag className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black tracking-widest text-emerald-400 uppercase whitespace-nowrap break-keep">
                  START
                </span>
                <span className="text-[10px] text-slate-400 whitespace-nowrap break-keep">
                  출발 곡
                </span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-white leading-tight truncate">
                {startSong.title}
              </div>
              <div className="text-[11px] text-slate-400 leading-tight truncate">
                {startSong.artist}
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center justify-center text-slate-600 shrink-0">
            <ArrowRight className="w-4 h-4" />
          </div>

          {/* Target Song Card */}
          <div className="flex items-center gap-2.5 bg-[#121721] border border-amber-500/40 px-3 py-2 rounded-lg min-w-0">
            <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
              <Target className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black tracking-widest text-amber-400 uppercase whitespace-nowrap break-keep">
                  TARGET
                </span>
                <span className="text-[10px] text-slate-400 whitespace-nowrap break-keep">
                  목표 도착 곡
                </span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-amber-100 leading-tight truncate">
                {targetSong.title}
              </div>
              <div className="text-[11px] text-amber-300/80 leading-tight truncate">
                {targetSong.artist}
              </div>
            </div>
          </div>
        </div>

        {/* Right side: Turns & Action Buttons (모바일 잘림 0% 방어) */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-2.5 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-slate-800/80 shrink-0">
          {/* Turns Badge */}
          <div className="flex items-center gap-2 bg-[#121721] border border-slate-800 px-3 py-1.5 rounded-lg shrink-0">
            <div className="flex items-baseline gap-1 whitespace-nowrap break-keep">
              <span className="text-[11px] text-slate-400 font-semibold">진행</span>
              <span
                className={`text-base sm:text-lg font-black ${
                  isOptimal
                    ? "text-emerald-400"
                    : isGood
                    ? "text-amber-400"
                    : "text-white"
                }`}
              >
                {turnCount}턴
              </span>
            </div>
            <span className="text-slate-700">|</span>
            <span className="text-[11px] text-slate-400 whitespace-nowrap break-keep">
              최단 <strong className="text-amber-400 font-bold">{optimalTurns}턴</strong>
            </span>
          </div>

          {/* Action buttons: Backtrack & Give Up */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto sm:ml-0">
            <button
              onClick={onBacktrack}
              disabled={!canBacktrack}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-lg text-xs font-bold border transition-all active:scale-95 whitespace-nowrap break-keep shrink-0 ${
                canBacktrack
                  ? "bg-[#161C28] text-slate-200 border-slate-700 hover:bg-slate-800 hover:text-white"
                  : "bg-[#0E121A] text-slate-600 border-slate-800/60 cursor-not-allowed"
              }`}
              title={canBacktrack ? "이전 단계로 되돌아가기" : "출발 곡에서는 되돌아갈 수 없습니다"}
            >
              <Undo2 className="w-3.5 h-3.5 shrink-0" />
              <span>이전 단계</span>
            </button>

            {onGiveUp && (
              <button
                onClick={onGiveUp}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-lg text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-all active:scale-95 whitespace-nowrap break-keep shrink-0"
                title="포기하고 최단 정답 경로 확인하기"
              >
                <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                <span>정답 확인</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
