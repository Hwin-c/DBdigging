"use client";

import React from "react";
import { SongInfo } from "@/lib/graph/types";
import { TitleTrackBadge } from "@/components/common/Badge";
import { Calendar, Building2, Music2, ExternalLink, Disc3, Compass } from "lucide-react";

interface CurrentSongCardProps {
  currentSong: SongInfo;
}

export function CurrentSongCard({ currentSong }: CurrentSongCardProps) {
  const melonUrl = `https://www.melon.com/song/detail.htm?songId=${currentSong.id}`;

  return (
    <div className="w-full bg-[#0D1117] border border-slate-800 rounded-xl p-3.5 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left: Song Title, Artist, Title Badge */}
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap break-keep">
              <Disc3 className="w-3 h-3 animate-[spin_6s_linear_infinite]" />
              <span>CURRENT TRACK</span>
            </span>
            {currentSong.isTitle && <TitleTrackBadge />}
            {!currentSong.inGiant && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 whitespace-nowrap break-keep">
                <Compass className="w-2.5 h-2.5" />
                <span>독립 섬 구간</span>
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-2 flex-wrap pt-0.5">
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug break-keep">
              {currentSong.title}
            </h2>
            <span className="text-xs sm:text-sm font-bold text-emerald-400 break-keep">
              {currentSong.artist}
            </span>
          </div>
        </div>

        {/* Right: Meta Details & Melon Link (좋아요 수 완전 숨김) */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap text-[11px] text-slate-300 shrink-0">
          {/* Agency */}
          <div className="flex items-center gap-1 bg-[#141923] px-2 py-1 rounded-md border border-slate-800 whitespace-nowrap break-keep">
            <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
            <span>{currentSong.agency || "미분류"}</span>
          </div>

          {/* Year */}
          <div className="flex items-center gap-1 bg-[#141923] px-2 py-1 rounded-md border border-slate-800 whitespace-nowrap break-keep">
            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
            <span>{currentSong.year}년</span>
          </div>

          {/* Genre */}
          <div className="flex items-center gap-1 bg-[#141923] px-2 py-1 rounded-md border border-slate-800 whitespace-nowrap break-keep">
            <Music2 className="w-3 h-3 text-slate-400 shrink-0" />
            <span>{currentSong.genre || "가요"}</span>
          </div>

          {/* Melon Deep Link */}
          <a
            href={melonUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="멜론 곡 상세정보 열기"
            className="flex items-center gap-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap break-keep"
          >
            <span className="font-bold">Melon</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        </div>
      </div>
    </div>
  );
}
