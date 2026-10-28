"use client";

import React from "react";
import { HistoryStep, SongInfo } from "@/lib/graph/types";
import { TitleTrackBadge, RoleBadgeList } from "@/components/common/Badge";
import { MapPin, Disc, Heart, Calendar, Building2, Music2, ExternalLink } from "lucide-react";

interface CurrentSongCardProps {
  currentSong: SongInfo;
  historyStack: HistoryStep[];
}

export function CurrentSongCard({ currentSong, historyStack }: CurrentSongCardProps) {
  const melonUrl = `https://www.melon.com/song/detail.htm?songId=${currentSong.id}`;

  return (
    <div className="w-full bg-gradient-to-br from-slate-900/90 via-[#0d1424]/90 to-slate-900/90 border border-indigo-500/30 rounded-2xl p-5 shadow-[0_4px_25px_rgba(99,102,241,0.1)] backdrop-blur-md">
      {/* 1. Real-time Path Breadcrumb Trail */}
      <div className="mb-4">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-indigo-400" />
          <span>실시간 디깅 경로 ({historyStack.length - 1}회 이동)</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
          {historyStack.map((step, idx) => {
            const isStart = idx === 0;
            const isCurrent = idx === historyStack.length - 1;

            return (
              <React.Fragment key={`${step.song.id}_${idx}`}>
                {/* Stepping-stone Person (if not first step) */}
                {step.viaPerson && (
                  <>
                    <span className="text-slate-600 text-xs shrink-0 font-bold">➔</span>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-200 text-xs shrink-0 shadow-sm">
                      <span className="text-[11px]">👤</span>
                      <span className="font-semibold">{step.viaPerson.name}</span>
                      <RoleBadgeList roles={step.viaPerson.roles ?? []} size="sm" />
                    </div>
                    <span className="text-slate-600 text-xs shrink-0 font-bold">➔</span>
                  </>
                )}

                {/* Song Chip */}
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs shrink-0 font-medium transition-all ${
                    isCurrent
                      ? "bg-indigo-600/30 border border-indigo-400 text-indigo-100 shadow-[0_0_10px_rgba(99,102,241,0.25)] font-bold"
                      : isStart
                        ? "bg-emerald-950/50 border border-emerald-500/40 text-emerald-200"
                        : "bg-slate-800/70 border border-slate-700/80 text-slate-300"
                  }`}
                >
                  <span>{isStart ? "🚩" : isCurrent ? "📍" : "🎵"}</span>
                  <span className="max-w-[120px] truncate">{step.song.title}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* 2. Current Song Main Metadata Card */}
      <div className="pt-3 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Left: Song Title, Artist, Title Badge */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              📍 현재 위치 곡
            </span>
            {currentSong.isTitle && <TitleTrackBadge />}
            {!currentSong.inGiant && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                🏝️ 독립 섬 곡
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {currentSong.title}
            </h2>
            <span className="text-sm sm:text-base font-semibold text-indigo-300">
              {currentSong.artist}
            </span>
          </div>
        </div>

        {/* Right: Meta Details & Melon Link */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-xs text-slate-400">
          {/* Agency */}
          <div className="flex items-center gap-1 bg-slate-950/50 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentSong.agency || "미분류"}</span>
          </div>

          {/* Year */}
          <div className="flex items-center gap-1 bg-slate-950/50 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentSong.year}년</span>
          </div>

          {/* Genre */}
          <div className="flex items-center gap-1 bg-slate-950/50 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <Music2 className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentSong.genre || "가요"}</span>
          </div>

          {/* Likes */}
          <div className="flex items-center gap-1 bg-slate-950/50 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400/20" />
            <span>{currentSong.likes.toLocaleString()}</span>
          </div>

          {/* Melon Deep Link */}
          <a
            href={melonUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="멜론 곡 상세정보 열기"
            className="flex items-center gap-1 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <span className="font-semibold">Melon</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
