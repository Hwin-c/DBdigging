"use client";

import React, { useState, useMemo } from "react";
import { ConnectedPerson, ConnectedSong } from "@/lib/graph/types";
import { RoleBadgeList, OptimalHintBadge, TitleTrackBadge } from "@/components/common/Badge";
import { Users, Music, Undo2, ChevronLeft, ChevronRight, Search, Heart, Sparkles } from "lucide-react";

interface TurnCardViewProps {
  currentSongTitle: string;
  connectedPersons: ConnectedPerson[];
  connectedSongs: ConnectedSong[];
  selectedPerson: ConnectedPerson | null;
  onSelectPerson: (person: ConnectedPerson) => void;
  onSelectSong: (song: ConnectedSong, viaPerson: ConnectedPerson) => void;
  onCancelPersonSelection: () => void;
  isLoading: boolean;
  isHintMode: boolean;
}

const ITEMS_PER_PAGE = 8; // 4x2 on desktop, 2x4 on mobile to prevent scrolling

export function TurnCardView({
  currentSongTitle,
  connectedPersons,
  connectedSongs,
  selectedPerson,
  onSelectPerson,
  onSelectSong,
  onCancelPersonSelection,
  isLoading,
  isHintMode
}: TurnCardViewProps) {
  const [filterQuery, setFilterQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // 인물 또는 곡 목록 필터링
  const filteredItems = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!selectedPerson) {
      // 1. 인물 목록 필터링
      if (!q) return connectedPersons;
      return connectedPersons.filter((p) => p.name.toLowerCase().includes(q));
    } else {
      // 2. 곡 목록 필터링
      if (!q) return connectedSongs;
      return connectedSongs.filter(
        (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
      );
    }
  }, [filterQuery, selectedPerson, connectedPersons, connectedSongs]);

  // 페이지네이션 계산
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const pagedItems = filteredItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // 검색창 입력 핸들러 (입력 시 1페이지로 리셋)
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterQuery(e.target.value);
    setCurrentPage(1);
  };

  // 인물 선택 취소 시 필터 및 페이지 초기화
  const handleCancelPerson = () => {
    setFilterQuery("");
    setCurrentPage(1);
    onCancelPersonSelection();
  };

  // 인물 선택 시 상태 초기화
  const handlePersonClick = (p: ConnectedPerson) => {
    setFilterQuery("");
    setCurrentPage(1);
    onSelectPerson(p);
  };

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-xl">
      {/* ======================================================== */}
      {/* 1. 상단 고정 조작 컨트롤 바 (Sticky & No-Scroll Guarantee) */}
      {/* ======================================================== */}
      <div className="sticky top-0 z-20 pb-4 mb-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md -mx-4 -mt-4 p-4 rounded-t-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Left: Step indicator & Back to Person button */}
        <div className="flex items-center gap-2">
          {selectedPerson ? (
            <button
              onClick={handleCancelPerson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 active:scale-95 transition-all shadow-sm shrink-0"
              title="인물 다시 선택하기"
            >
              <Undo2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>↩️ 인물 다시 선택</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30">
                1
              </div>
              <span className="text-xs sm:text-sm font-bold text-white">
                Step 1: 연결된 크레딧 인물 선택
              </span>
            </div>
          )}

          {selectedPerson && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-200 bg-indigo-950/60 border border-indigo-500/40 px-2.5 py-1 rounded-lg">
              <span className="text-indigo-400 font-bold">2단계:</span>
              <span className="text-white font-bold">{selectedPerson.name}</span>
              <span className="text-slate-400 text-[11px]">의 참여곡 선택</span>
            </div>
          )}
        </div>

        {/* Right: Inline Search Filter & Pagination */}
        <div className="flex items-center gap-2 justify-between sm:justify-end">
          {/* Inline Filter Input */}
          <div className="relative flex-1 sm:w-48 md:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={handleFilterChange}
              placeholder={selectedPerson ? "곡명/가수 검색..." : "인물명 검색..."}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded-xl px-2 py-1 shrink-0">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="p-1 rounded text-slate-400 hover:text-white disabled:text-slate-700 disabled:cursor-not-allowed transition-colors"
              title="이전 페이지"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold px-1 text-slate-300">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="p-1 rounded text-slate-400 hover:text-white disabled:text-slate-700 disabled:cursor-not-allowed transition-colors"
              title="다음 페이지"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. 카드 그리드 영역 (Fixed Height & No-Scroll Layout)      */}
      {/* ======================================================== */}
      <div className="min-h-[380px] flex flex-col justify-between">
        {isLoading ? (
          <div className="h-72 flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-medium">그래프 연결고리 탐색 중...</p>
          </div>
        ) : pagedItems.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center gap-2 text-slate-500">
            <p className="text-sm font-semibold">검색 조건과 일치하는 항목이 없습니다.</p>
            <p className="text-xs text-slate-600">검색어를 지우거나 변경해 보세요.</p>
          </div>
        ) : !selectedPerson ? (
          // ----------------------------------------------------
          // (A) 인물/그룹 카드 그리드 (Step 1)
          // ----------------------------------------------------
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(pagedItems as ConnectedPerson[]).map((person) => {
              const isOptimal = (person as any).isOptimalNext === true;

              return (
                <button
                  key={person.id}
                  onClick={() => handlePersonClick(person)}
                  className={`group relative flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all active:scale-95 ${
                    isHintMode && isOptimal
                      ? "bg-amber-950/30 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)] hover:border-amber-300"
                      : "bg-slate-950/60 border-slate-800 hover:border-indigo-500/60 hover:bg-slate-800/50 shadow-sm"
                  }`}
                >
                  <div className="space-y-2">
                    {/* Top Row: Hint badge or Person Type */}
                    <div className="flex items-center justify-between gap-1">
                      {isHintMode && isOptimal ? (
                        <OptimalHintBadge />
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {person.isGroup ? "👥 그룹" : "👤 개인"}
                        </span>
                      )}
                    </div>

                    {/* Person Name */}
                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                        {person.name}
                      </h4>
                    </div>
                  </div>

                  {/* Bottom: Roles badges */}
                  <div className="mt-3 pt-2 border-t border-slate-800/80">
                    <RoleBadgeList roles={person.roles ?? []} size="sm" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          // ----------------------------------------------------
          // (B) 다음 곡 카드 그리드 (Step 2)
          // ----------------------------------------------------
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(pagedItems as ConnectedSong[]).map((song) => {
              const isOptimal = (song as any).isOptimalNext === true;

              return (
                <button
                  key={song.id}
                  onClick={() => onSelectSong(song, selectedPerson)}
                  className={`group relative flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all active:scale-95 ${
                    isHintMode && isOptimal
                      ? "bg-amber-950/30 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)] hover:border-amber-300"
                      : "bg-slate-950/60 border-slate-800 hover:border-purple-500/60 hover:bg-slate-800/50 shadow-sm"
                  }`}
                >
                  <div className="space-y-1.5">
                    {/* Top Row: Hint badge & Title track badge */}
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      {isHintMode && isOptimal && <OptimalHintBadge />}
                      {song.isTitle && <TitleTrackBadge />}
                    </div>

                    {/* Song Title & Artist */}
                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors line-clamp-1">
                        {song.title}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-1 font-medium">{song.artist}</p>
                    </div>

                    {/* Metadata tags */}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 flex-wrap">
                      <span>{song.year}년</span>
                      <span>•</span>
                      <span>{song.genre || "가요"}</span>
                      {song.isViaGroupHop && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-400">그룹 1-hop</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bottom: Likes & Roles */}
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <RoleBadgeList roles={song.roles ?? []} size="sm" />
                    <span className="text-[10px] text-rose-400/80 flex items-center gap-0.5">
                      <Heart className="w-2.5 h-2.5 fill-rose-400/30" />
                      {song.likes.toLocaleString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
