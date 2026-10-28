"use client";

import React, { useState, useMemo } from "react";
import { ConnectedPerson, ConnectedSong, DeepSeaMission, SongInfo } from "@/lib/graph/types";
import { RoleBadgeList, OptimalHintBadge, TitleTrackBadge } from "@/components/common/Badge";
import { Undo2, ChevronLeft, ChevronRight, Search, Heart, EyeOff, Sparkles, CheckCircle2 } from "lucide-react";

interface DeepSeaTurnViewProps {
  currentSong: SongInfo;
  currentMission: DeepSeaMission | null;
  connectedPersons: ConnectedPerson[];
  connectedSongs: ConnectedSong[];
  selectedPerson: ConnectedPerson | null;
  onSelectPerson: (person: ConnectedPerson) => void;
  onSelectSong: (song: ConnectedSong, viaPerson: ConnectedPerson) => void;
  onCancelPersonSelection: () => void;
  isHintMode: boolean;
  isLoading: boolean;
  visitedSongIds?: string[];
}

const ITEMS_PER_PAGE = 8;

export function DeepSeaTurnView({
  currentSong,
  currentMission,
  connectedPersons,
  connectedSongs,
  selectedPerson,
  onSelectPerson,
  onSelectSong,
  onCancelPersonSelection,
  isHintMode,
  isLoading,
  visitedSongIds = []
}: DeepSeaTurnViewProps) {
  const [filterQuery, setFilterQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const visitedSet = useMemo(() => new Set(visitedSongIds), [visitedSongIds]);

  // 1. 인물/곡 목록 필터링 및 힌트 모드 Hoisting
  const processedItems = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();

    if (!selectedPerson) {
      // Step 1: 인물 목록
      let list = [...connectedPersons];
      if (q) {
        list = list.filter((p) => p.name.toLowerCase().includes(q));
      }

      // 힌트 모드 Hoisting: 정답 징검다리 인물(validBridgePersonIds)을 최상단으로 정렬
      if (isHintMode && currentMission) {
        const bridgeSet = new Set(currentMission.validBridgePersonIds);
        list.sort((a, b) => {
          const aOpt = bridgeSet.has(a.id) ? 1 : 0;
          const bOpt = bridgeSet.has(b.id) ? 1 : 0;
          return bOpt - aOpt;
        });
      }
      return list;
    } else {
      // Step 2: 곡 목록
      let list = [...connectedSongs];
      if (q) {
        list = list.filter(
          (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
        );
      }

      // 힌트 모드 Hoisting: 정답 곡(validTargetSongIds)을 최상단으로 정렬
      if (isHintMode && currentMission) {
        const targetSet = new Set(currentMission.validTargetSongIds);
        list.sort((a, b) => {
          const aOpt = targetSet.has(a.id) ? 1 : 0;
          const bOpt = targetSet.has(b.id) ? 1 : 0;
          return bOpt - aOpt;
        });
      }
      return list;
    }
  }, [filterQuery, selectedPerson, connectedPersons, connectedSongs, isHintMode, currentMission]);

  // 페이지네이션 계산
  const totalPages = Math.max(1, Math.ceil(processedItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const pagedItems = processedItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleCancelPerson = () => {
    setFilterQuery("");
    setCurrentPage(1);
    onCancelPersonSelection();
  };

  const handlePersonClick = (p: ConnectedPerson) => {
    setFilterQuery("");
    setCurrentPage(1);
    onSelectPerson(p);
  };

  return (
    <div className="w-full bg-[#0a1424]/90 border border-cyan-500/30 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-2xl">
      {/* 1. 상단 고정 조작 컨트롤 바 */}
      <div className="sticky top-0 z-20 pb-4 mb-4 border-b border-cyan-900/40 bg-[#0a1424]/95 backdrop-blur-md -mx-4 -mt-4 p-4 rounded-t-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Left: Step indicator & Back to Person button */}
        <div className="flex items-center gap-2">
          {selectedPerson ? (
            <button
              onClick={handleCancelPerson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 active:scale-95 transition-all shadow-sm shrink-0"
              title="인물 다시 선택하기"
            >
              <Undo2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>↩️ 인물 다시 선택</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-xs border border-cyan-500/40">
                1
              </div>
              <span className="text-xs sm:text-sm font-bold text-white">
                Step 1: 징검다리 인물/그룹 선택
              </span>
            </div>
          )}

          {selectedPerson && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-200 bg-cyan-950/60 border border-cyan-500/40 px-2.5 py-1 rounded-lg">
              <span className="text-cyan-400 font-bold">2단계:</span>
              <span className="text-white font-bold">{selectedPerson.name}</span>
              <span className="text-slate-400 text-[11px]">의 곡으로 다이빙</span>
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
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
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

      {/* 2. 카드 그리드 영역 (Fixed Height & No-Scroll Layout) */}
      <div className="min-h-[380px] flex flex-col justify-between">
        {isLoading ? (
          <div className="h-72 flex flex-col items-center justify-center gap-3 text-cyan-400">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-medium">심해 연결고리 탐색 중...</p>
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
              const isOptimal =
                isHintMode &&
                currentMission &&
                currentMission.validBridgePersonIds.includes(person.id);

              return (
                <button
                  key={person.id}
                  onClick={() => handlePersonClick(person)}
                  className={`group relative flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all active:scale-95 ${
                    isOptimal
                      ? "bg-amber-950/30 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:border-amber-300"
                      : "bg-slate-950/60 border-slate-800 hover:border-cyan-500/60 hover:bg-slate-800/50 shadow-sm"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      {isOptimal ? (
                        <OptimalHintBadge />
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {person.isGroup ? "👥 그룹" : "👤 개인"}
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                        {person.name}
                      </h4>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800/80">
                    <RoleBadgeList roles={person.roles ?? []} size="sm" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          // ----------------------------------------------------
          // (B) 다음 곡 카드 그리드 (Step 2 - 스포일러 블라인드 적용)
          // ----------------------------------------------------
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(pagedItems as ConnectedSong[]).map((song) => {
              const isAlreadyVisited = visitedSet.has(song.id);
              const isOptimal =
                isHintMode &&
                currentMission &&
                currentMission.validTargetSongIds.includes(song.id);

              // ========================================================
              // 스포일러 블라인드 마스킹 연출
              // ========================================================
              const isYearCondition = currentMission?.condition === "same_year";
              const isAgencyCondition = currentMission?.condition === "same_agency";

              // 힌트 모드가 꺼져있으면 미션 관련 메타데이터를 블라인드 마스킹
              const displayYear = !isHintMode && isYearCondition ? "????년" : `${song.year}년`;
              const isYearMasked = !isHintMode && isYearCondition;

              const displayAgency =
                !isHintMode && isAgencyCondition
                  ? "[소속사 비공개]"
                  : song.agency || "미분류";
              const isAgencyMasked = !isHintMode && isAgencyCondition;

              return (
                <button
                  key={song.id}
                  onClick={() => !isAlreadyVisited && onSelectSong(song, selectedPerson)}
                  disabled={isAlreadyVisited}
                  className={`group relative flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all active:scale-95 ${
                    isAlreadyVisited
                      ? "opacity-40 bg-slate-950/40 border-slate-900 cursor-not-allowed"
                      : isOptimal
                        ? "bg-amber-950/30 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:border-amber-300"
                        : "bg-slate-950/60 border-slate-800 hover:border-cyan-500/60 hover:bg-slate-800/50 shadow-sm"
                  }`}
                >
                  <div className="space-y-1.5">
                    {/* Top Row: Hint badge / Title / Visited tag */}
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      {isAlreadyVisited ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                          방문 완료
                        </span>
                      ) : isOptimal ? (
                        <OptimalHintBadge />
                      ) : null}
                      {song.isTitle && <TitleTrackBadge />}
                    </div>

                    {/* Song Title & Artist */}
                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                        {song.title}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-1 font-medium">{song.artist}</p>
                    </div>

                    {/* Metadata tags with Spoiler Blind Masking */}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 flex-wrap">
                      <span
                        className={
                          isYearMasked
                            ? "text-amber-400/80 bg-amber-950/40 px-1 rounded border border-amber-500/20 flex items-center gap-0.5"
                            : ""
                        }
                      >
                        {isYearMasked && <EyeOff className="w-2.5 h-2.5" />}
                        {displayYear}
                      </span>
                      <span>•</span>
                      <span
                        className={
                          isAgencyMasked
                            ? "text-emerald-400/80 bg-emerald-950/40 px-1 rounded border border-emerald-500/20 flex items-center gap-0.5"
                            : ""
                        }
                      >
                        {isAgencyMasked && <EyeOff className="w-2.5 h-2.5" />}
                        {displayAgency}
                      </span>
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
