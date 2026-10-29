"use client";

import React, { useState, useMemo, useEffect } from "react";
import { ConnectedPerson, ConnectedSong } from "@/lib/graph/types";
import { RoleBadgeList, OptimalHintBadge, TitleTrackBadge } from "@/components/common/Badge";
import { Undo2, ChevronLeft, ChevronRight, Search, User, Users, Disc3 } from "lucide-react";

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

const ITEMS_PER_PAGE = 8;

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

  useEffect(() => {
    setActiveRoleFilter("all");
    setFilterQuery("");
    setCurrentPage(1);
  }, [selectedPerson, currentSongTitle]);

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

  const currentTotal = !selectedPerson ? filteredPersons.length : filteredSongs.length;
  const totalPages = Math.max(1, Math.ceil(currentTotal / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const pagedPersons = filteredPersons.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const pagedSongs = filteredSongs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleRoleTabClick = (filter: RoleFilter, count: number) => {
    if (count === 0 && filter !== "all") return;
    setActiveRoleFilter(filter);
    setCurrentPage(1);
  };

  const handleCancelPerson = () => {
    setActiveRoleFilter("all");
    setFilterQuery("");
    setCurrentPage(1);
    onCancelPersonSelection();
  };

  const handlePersonClick = (p: ConnectedPerson) => {
    setActiveRoleFilter("all");
    setFilterQuery("");
    setCurrentPage(1);
    onSelectPerson(p);
  };

  return (
    <div className="w-full bg-[#0D1117] border border-slate-800 rounded-xl p-3 sm:p-4">
      {/* 1. 상단 조작 컨트롤 바 */}
      <div className="pb-3 mb-3 border-b border-slate-800 flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Left: Step indicator & Back to Person button */}
          <div className="flex items-center gap-2 flex-wrap">
            {selectedPerson ? (
              <button
                onClick={handleCancelPerson}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#161C28] hover:bg-slate-800 text-white text-xs font-bold border border-slate-700 active:scale-95 transition-all shrink-0 whitespace-nowrap break-keep"
                title="인물 다시 선택하기"
              >
                <Undo2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>인물 다시 선택</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-black text-[10px] border border-emerald-500/30">
                  STEP 01
                </span>
                <span className="text-xs sm:text-sm font-black text-white break-keep">
                  크레딧 아티스트 선택
                </span>
              </div>
            )}

            {selectedPerson && (
              <div className="flex items-center gap-1.5 text-xs font-semibold bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                <span className="text-amber-400 font-black text-[10px]">STEP 02</span>
                <span className="text-white font-bold">{selectedPerson.name}</span>
                <span className="text-slate-400 text-[11px] break-keep">참여곡 선택</span>
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
                placeholder={selectedPerson ? "곡명/가수 검색..." : "아티스트 검색..."}
                className="w-full bg-[#090C12] border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1 bg-[#090C12] border border-slate-800 rounded-lg px-2 py-1 shrink-0">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-0.5 rounded text-slate-400 hover:text-white disabled:text-slate-700 disabled:cursor-not-allowed transition-colors"
                title="이전 페이지"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold px-1 text-slate-300">
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-0.5 rounded text-slate-400 hover:text-white disabled:text-slate-700 disabled:cursor-not-allowed transition-colors"
                title="다음 페이지"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 6대 크레딧 역할 필터 탭 바 (유니코드 이모지 완전 제거) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
          <button
            onClick={() => handleRoleTabClick("all", roleCounts.all)}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all shrink-0 whitespace-nowrap break-keep ${
              activeRoleFilter === "all"
                ? "bg-white text-slate-950"
                : "bg-[#121721] text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            전체 ({roleCounts.all})
          </button>
          <button
            onClick={() => handleRoleTabClick(1, roleCounts.artist)}
            disabled={roleCounts.artist === 0}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all shrink-0 whitespace-nowrap break-keep ${
              activeRoleFilter === 1
                ? "bg-emerald-500 text-slate-950"
                : roleCounts.artist === 0
                ? "bg-[#090C12] text-slate-700 border border-slate-900 cursor-not-allowed"
                : "bg-[#121721] text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            가창 ({roleCounts.artist})
          </button>
          <button
            onClick={() => handleRoleTabClick(3, roleCounts.lyricist)}
            disabled={roleCounts.lyricist === 0}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all shrink-0 whitespace-nowrap break-keep ${
              activeRoleFilter === 3
                ? "bg-amber-400 text-slate-950"
                : roleCounts.lyricist === 0
                ? "bg-[#090C12] text-slate-700 border border-slate-900 cursor-not-allowed"
                : "bg-[#121721] text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            작사 ({roleCounts.lyricist})
          </button>
          <button
            onClick={() => handleRoleTabClick(4, roleCounts.composer)}
            disabled={roleCounts.composer === 0}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all shrink-0 whitespace-nowrap break-keep ${
              activeRoleFilter === 4
                ? "bg-cyan-400 text-slate-950"
                : roleCounts.composer === 0
                ? "bg-[#090C12] text-slate-700 border border-slate-900 cursor-not-allowed"
                : "bg-[#121721] text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            작곡 ({roleCounts.composer})
          </button>
          <button
            onClick={() => handleRoleTabClick(5, roleCounts.arranger)}
            disabled={roleCounts.arranger === 0}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all shrink-0 whitespace-nowrap break-keep ${
              activeRoleFilter === 5
                ? "bg-rose-400 text-slate-950"
                : roleCounts.arranger === 0
                ? "bg-[#090C12] text-slate-700 border border-slate-900 cursor-not-allowed"
                : "bg-[#121721] text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            편곡 ({roleCounts.arranger})
          </button>
          <button
            onClick={() => handleRoleTabClick("group", roleCounts.group)}
            disabled={roleCounts.group === 0}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all shrink-0 whitespace-nowrap break-keep ${
              activeRoleFilter === "group"
                ? "bg-sky-400 text-slate-950"
                : roleCounts.group === 0
                ? "bg-[#090C12] text-slate-700 border border-slate-900 cursor-not-allowed"
                : "bg-[#121721] text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            그룹/피처링 ({roleCounts.group})
          </button>
        </div>
      </div>

      {/* 2. 카드 그리드 영역 (모바일 & PC 모두 컴팩트 2열 그리드로 한 화면 8개 표시) */}
      <div className="min-h-[340px] flex flex-col justify-between">
        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-2.5 text-slate-400">
            <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold">크레딧 네트워크 조회 중...</p>
          </div>
        ) : currentTotal === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-xs">
            조건에 일치하는 결과가 없습니다.
          </div>
        ) : !selectedPerson ? (
          // (A) 인물/그룹 카드 그리드 (Step 1 - 모바일/PC 2열 컴팩트 그리드)
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {pagedPersons.map((person) => {
              const isOptimal = (person as any).isOptimalNext === true;

              return (
                <button
                  key={person.id}
                  onClick={() => handlePersonClick(person)}
                  className={`group relative flex flex-col justify-between p-2.5 sm:p-3.5 rounded-xl border text-left transition-all active:scale-95 ${
                    isHintMode && isOptimal
                      ? "bg-[#1C160B] border-amber-400"
                      : "bg-[#121721] border-slate-800 hover:border-emerald-500/60 hover:bg-[#161D2A]"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded border whitespace-nowrap break-keep ${
                          person.isGroup
                            ? "bg-sky-500/10 text-sky-300 border-sky-500/30"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {person.isGroup ? (
                          <Users className="w-2.5 h-2.5 shrink-0" />
                        ) : (
                          <User className="w-2.5 h-2.5 shrink-0" />
                        )}
                        <span>{person.isGroup ? "GROUP" : "ARTIST"}</span>
                      </span>
                      {isHintMode && isOptimal && <OptimalHintBadge />}
                    </div>

                    <div className="text-xs sm:text-sm font-bold text-white group-hover:text-emerald-300 transition-colors break-keep leading-snug line-clamp-2 pt-0.5">
                      {person.name}
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                    <RoleBadgeList roles={person.roles ?? []} size="sm" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          // (B) 다음 곡 카드 그리드 (Step 2 - 모바일/PC 2열 컴팩트 그리드, 좋아요 수 완전 숨김)
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {pagedSongs.map((song) => {
              const isOptimal = (song as any).isOptimalNext === true;
              const isVisited = visitedSet.has(song.id);

              return (
                <button
                  key={song.id}
                  onClick={() => onSelectSong(song, selectedPerson)}
                  className={`group relative flex flex-col justify-between p-2.5 sm:p-3.5 rounded-xl border text-left transition-all active:scale-95 ${
                    isHintMode && isOptimal
                      ? "bg-[#1C160B] border-amber-400"
                      : isVisited
                      ? "bg-[#0B0E14] border-slate-800/70 opacity-75 hover:opacity-100"
                      : "bg-[#121721] border-slate-800 hover:border-emerald-500/60 hover:bg-[#161D2A]"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <div className="flex items-center gap-1 flex-wrap">
                        {isHintMode && isOptimal && <OptimalHintBadge />}
                        {song.isTitle && <TitleTrackBadge />}
                      </div>
                      {isVisited && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 whitespace-nowrap break-keep">
                          방문함
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-emerald-300 transition-colors break-keep leading-snug line-clamp-2">
                        {song.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 break-keep leading-snug line-clamp-1 font-medium mt-0.5">
                        {song.artist}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-slate-400 flex-wrap pt-0.5">
                      <span>{song.year}년</span>
                      <span>·</span>
                      <span>{song.genre || "가요"}</span>
                      {song.isViaGroupHop && (
                        <>
                          <span>·</span>
                          <span className="text-sky-400 font-bold break-keep">그룹 징검다리</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <RoleBadgeList roles={song.roles ?? []} size="sm" />
                    <Disc3 className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400 transition-colors shrink-0" />
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
