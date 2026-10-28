"use client";

import React, { useState, useMemo, useEffect } from "react";
import { ConnectedPerson, ConnectedSong, RoleCode } from "@/lib/graph/types";
import { RoleBadgeList, OptimalHintBadge, TitleTrackBadge } from "@/components/common/Badge";
import { Undo2, ChevronLeft, ChevronRight, Search, Heart } from "lucide-react";

export type RoleFilter = "all" | 1 | 3 | 4 | 5 | "group";

interface TurnCardViewProps {
  currentSongTitle: string;
  currentSongId?: string;
  connectedPersons: ConnectedPerson[];
  connectedSongs: ConnectedSong[];
  selectedPerson: ConnectedPerson | null;
  onSelectPerson: (person: ConnectedPerson) => void;
  onSelectSong: (song: ConnectedSong, viaPerson: ConnectedPerson) => void;
  onCancelPersonSelection: () => void;
  isLoading: boolean;
  isHintMode: boolean;
  visitedSongIds?: string[];
}

const ITEMS_PER_PAGE = 8; // 4x2 on desktop, 2x4 on mobile to prevent scrolling

export function TurnCardView({
  currentSongTitle,
  currentSongId,
  connectedPersons,
  connectedSongs,
  selectedPerson,
  onSelectPerson,
  onSelectSong,
  onCancelPersonSelection,
  isLoading,
  isHintMode,
  visitedSongIds = []
}: TurnCardViewProps) {
  const [filterQuery, setFilterQuery] = useState("");
  const [activeRoleFilter, setActiveRoleFilter] = useState<RoleFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const visitedSet = useMemo(() => new Set(visitedSongIds), [visitedSongIds]);

  // 턴 전환 또는 Step 전환(인물 선택/취소) 시 활성 탭을 [전체]로 자동 리셋 (Index 0 힌트 가림 방지)
  useEffect(() => {
    setActiveRoleFilter("all");
    setFilterQuery("");
    setCurrentPage(1);
  }, [selectedPerson, currentSongTitle]);

  // 현재 Step의 후보군 전체 기준 각 역할별 카운트 계산
  const roleCounts = useMemo(() => {
    const rawItems = !selectedPerson
      ? connectedPersons
      : currentSongId
      ? connectedSongs.filter((s) => s.id !== currentSongId)
      : connectedSongs;

    const counts = {
      all: rawItems.length,
      artist: 0,
      lyricist: 0,
      composer: 0,
      arranger: 0,
      group: 0
    };

    for (const item of rawItems) {
      const roles = (item as any).roles || [];
      if (roles.includes(1)) counts.artist++;
      if (roles.includes(3)) counts.lyricist++;
      if (roles.includes(4)) counts.composer++;
      if (roles.includes(5)) counts.arranger++;
      if (roles.includes(2) || roles.includes(6)) counts.group++;
    }

    return counts;
  }, [selectedPerson, connectedPersons, connectedSongs, currentSongId]);

  // 인물 및 곡 목록 필터링 (완전 타입 안전 분리)
  const filteredPersons = useMemo(() => {
    if (selectedPerson) return [];
    let list = connectedPersons;
    if (activeRoleFilter !== "all") {
      if (activeRoleFilter === "group") {
        list = list.filter((p) => p.roles?.includes(2) || p.roles?.includes(6));
      } else {
        list = list.filter((p) => p.roles?.includes(activeRoleFilter));
      }
    }
    const q = filterQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [selectedPerson, connectedPersons, activeRoleFilter, filterQuery]);

  const filteredSongs = useMemo(() => {
    if (!selectedPerson) return [];
    let list = currentSongId
      ? connectedSongs.filter((s) => s.id !== currentSongId)
      : connectedSongs;
    if (activeRoleFilter !== "all") {
      if (activeRoleFilter === "group") {
        list = list.filter((s) => s.roles?.includes(2) || s.roles?.includes(6));
      } else {
        list = list.filter((s) => s.roles?.includes(activeRoleFilter));
      }
    }
    const q = filterQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
      );
    }
    return list;
  }, [selectedPerson, connectedSongs, currentSongId, activeRoleFilter, filterQuery]);

  // 페이지네이션 계산
  const currentTotal = !selectedPerson ? filteredPersons.length : filteredSongs.length;
  const totalPages = Math.max(1, Math.ceil(currentTotal / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const pagedPersons = filteredPersons.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const pagedSongs = filteredSongs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // 검색창 입력 핸들러
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterQuery(e.target.value);
    setCurrentPage(1);
  };

  // 역할 탭 클릭 핸들러
  const handleRoleTabClick = (filter: RoleFilter, count: number) => {
    if (count === 0 && filter !== "all") return;
    setActiveRoleFilter(filter);
    setCurrentPage(1);
  };

  // 인물 선택 취소 시
  const handleCancelPerson = () => {
    setActiveRoleFilter("all");
    setFilterQuery("");
    setCurrentPage(1);
    onCancelPersonSelection();
  };

  // 인물 선택 시
  const handlePersonClick = (p: ConnectedPerson) => {
    setActiveRoleFilter("all");
    setFilterQuery("");
    setCurrentPage(1);
    onSelectPerson(p);
  };

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-xl">
      {/* ======================================================== */}
      {/* 1. 상단 고정 조작 컨트롤 바                              */}
      {/* ======================================================== */}
      <div className="sticky top-0 z-20 pb-3 mb-3 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md -mx-4 -mt-4 p-4 rounded-t-2xl flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
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
                  Step 1: 크레딧 인물 선택
                </span>
              </div>
            )}

            {selectedPerson && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-200 bg-indigo-950/60 border border-indigo-500/40 px-2.5 py-1 rounded-lg">
                <span className="text-indigo-400 font-bold">Step 2:</span>
                <span className="text-white font-bold">{selectedPerson.name}</span>
                <span className="text-slate-400 text-[11px]">의 참여곡 선택</span>
              </div>
            )}
          </div>

          {/* Right: Inline Search Filter & Pagination */}
          <div className="flex items-center gap-2 justify-between sm:justify-end">
            <div className="relative flex-1 sm:w-44 md:w-52">
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
        {/* 6대 크레딧 역할 필터 탭 바 (Horizontal Tabs)             */}
        {/* ======================================================== */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
          <button
            onClick={() => handleRoleTabClick("all", roleCounts.all)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              activeRoleFilter === "all"
                ? "bg-indigo-600 text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]"
                : "bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            전체 ({roleCounts.all})
          </button>
          <button
            onClick={() => handleRoleTabClick(1, roleCounts.artist)}
            disabled={roleCounts.artist === 0}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              activeRoleFilter === 1
                ? "bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                : roleCounts.artist === 0
                ? "bg-slate-950/40 text-slate-600 border border-slate-900 cursor-not-allowed"
                : "bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            🎤 가창 ({roleCounts.artist})
          </button>
          <button
            onClick={() => handleRoleTabClick(3, roleCounts.lyricist)}
            disabled={roleCounts.lyricist === 0}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              activeRoleFilter === 3
                ? "bg-emerald-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                : roleCounts.lyricist === 0
                ? "bg-slate-950/40 text-slate-600 border border-slate-900 cursor-not-allowed"
                : "bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            ✍️ 작사 ({roleCounts.lyricist})
          </button>
          <button
            onClick={() => handleRoleTabClick(4, roleCounts.composer)}
            disabled={roleCounts.composer === 0}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              activeRoleFilter === 4
                ? "bg-sky-600 text-white shadow-[0_0_10px_rgba(14,165,233,0.4)]"
                : roleCounts.composer === 0
                ? "bg-slate-950/40 text-slate-600 border border-slate-900 cursor-not-allowed"
                : "bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            🎼 작곡 ({roleCounts.composer})
          </button>
          <button
            onClick={() => handleRoleTabClick(5, roleCounts.arranger)}
            disabled={roleCounts.arranger === 0}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              activeRoleFilter === 5
                ? "bg-amber-600 text-white shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                : roleCounts.arranger === 0
                ? "bg-slate-950/40 text-slate-600 border border-slate-900 cursor-not-allowed"
                : "bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            🎹 편곡 ({roleCounts.arranger})
          </button>
          <button
            onClick={() => handleRoleTabClick("group", roleCounts.group)}
            disabled={roleCounts.group === 0}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              activeRoleFilter === "group"
                ? "bg-pink-600 text-white shadow-[0_0_10px_rgba(236,72,153,0.4)]"
                : roleCounts.group === 0
                ? "bg-slate-950/40 text-slate-600 border border-slate-900 cursor-not-allowed"
                : "bg-slate-950/70 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            👥 그룹/피처링 ({roleCounts.group})
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. 카드 그리드 영역 (Fixed Height & No-Scroll Layout)      */}
      {/* ======================================================== */}
      <div className="min-h-[380px] flex flex-col justify-between">
        {isLoading ? (
          <div className="h-72 flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-medium">크레딧 네트워크 탐색 중...</p>
          </div>
        ) : currentTotal === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center gap-2 text-slate-500">
            <p className="text-sm font-semibold">선택한 역할이나 검색어와 일치하는 항목이 없습니다.</p>
            <p className="text-xs text-slate-600">[전체] 탭을 누르거나 검색어를 지워보세요.</p>
          </div>
        ) : !selectedPerson ? (
          // ----------------------------------------------------
          // (A) 인물/그룹 카드 그리드 (Step 1 - 2열 와이드 콘솔)
          // ----------------------------------------------------
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {pagedPersons.map((person) => {
              const isOptimal = (person as any).isOptimalNext === true;

              return (
                <button
                  key={person.id}
                  onClick={() => handlePersonClick(person)}
                  className={`group relative flex flex-col justify-between p-4 rounded-xl border text-left transition-all active:scale-95 ${
                    isHintMode && isOptimal
                      ? "bg-amber-950/30 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)] hover:border-amber-300"
                      : "bg-slate-950/60 border-slate-800 hover:border-indigo-500/60 hover:bg-slate-800/50 shadow-sm"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      {isHintMode && isOptimal ? (
                        <OptimalHintBadge />
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          {person.isGroup ? "👥 그룹" : "👤 개인"}
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-white group-hover:text-indigo-300 transition-colors break-words leading-snug line-clamp-2">
                        {person.name}
                      </h4>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800/80">
                    <RoleBadgeList roles={person.roles ?? []} size="sm" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          // ----------------------------------------------------
          // (B) 다음 곡 카드 그리드 (Step 2 - 2열 와이드 콘솔)
          // ----------------------------------------------------
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {pagedSongs.map((song) => {
              const isOptimal = (song as any).isOptimalNext === true;
              const isVisited = visitedSet.has(song.id);

              return (
                <button
                  key={song.id}
                  onClick={() => onSelectSong(song, selectedPerson)}
                  className={`group relative flex flex-col justify-between p-4 rounded-xl border text-left transition-all active:scale-95 ${
                    isHintMode && isOptimal
                      ? "bg-amber-950/30 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)] hover:border-amber-300"
                      : isVisited
                      ? "bg-slate-950/40 border-slate-800/70 opacity-80 hover:opacity-100 hover:border-slate-700"
                      : "bg-slate-950/60 border-slate-800 hover:border-purple-500/60 hover:bg-slate-800/50 shadow-sm"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      {isHintMode && isOptimal && <OptimalHintBadge />}
                      {song.isTitle && <TitleTrackBadge />}
                      {isVisited && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          방문함
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-white group-hover:text-purple-300 transition-colors break-words leading-snug line-clamp-2">
                        {song.title}
                      </h4>
                      <p className="text-xs text-slate-400 break-words leading-snug line-clamp-2 font-medium mt-0.5">
                        {song.artist}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 flex-wrap pt-1">
                      <span>{song.year}년</span>
                      <span>•</span>
                      <span>{song.genre || "가요"}</span>
                      {song.isViaGroupHop && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-400 font-semibold">그룹 징검다리</span>
                        </>
                      )}
                    </div>
                  </div>

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
