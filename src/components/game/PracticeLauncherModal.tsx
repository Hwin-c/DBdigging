"use client";

import React, { useState } from "react";
import { QuestPayload, SearchResultItem } from "@/lib/graph/types";
import { clientApi } from "@/lib/game/clientApi";
import { Search, Dices, Music, Sparkles, X, Heart } from "lucide-react";

interface PracticeLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuest: (quest: QuestPayload) => void;
  onShowToast: (text: string, type?: "success" | "error" | "info") => void;
}

export function PracticeLauncherModal({
  isOpen,
  onClose,
  onSelectQuest,
  onShowToast
}: PracticeLauncherModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  // 곡/가수 실시간 검색
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    try {
      const data = await clientApi.search(q, { targetType: "song", limit: 15 });
      setSearchResults(data.matches || []);
      if ((data.matches || []).length === 0) {
        onShowToast("검색 결과가 없습니다.", "info");
      }
    } catch (err) {
      console.error("[PracticeLauncher] Search error:", err);
      onShowToast("검색 중 오류가 발생했습니다.", "error");
    } finally {
      setIsSearching(false);
    }
  };

  // 선택된 곡으로 시작하는 퀘스트 생성
  const handleSelectStartSong = async (songId: string) => {
    setIsGenerating(true);
    try {
      const quest = await clientApi.getRandomQuest({ startSongId: songId });
      onSelectQuest(quest);
      onClose();
      onShowToast(`'${quest.startSong.title}' ➔ '${quest.targetSong.title}' 미션 시작!`, "success");
    } catch (err) {
      console.error("[PracticeLauncher] Start error:", err);
      onShowToast("미션 생성에 실패했습니다.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // 완전 무작위 퀘스트 시작
  const handleRandomQuest = async () => {
    setIsGenerating(true);
    try {
      const quest = await clientApi.getRandomQuest();
      onSelectQuest(quest);
      onClose();
      onShowToast(`🎲 무작위 미션 시작: ${quest.startSong.title} ➔ ${quest.targetSong.title}`, "success");
    } catch (err) {
      console.error("[PracticeLauncher] Random quest error:", err);
      onShowToast("랜덤 미션 생성에 실패했습니다.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-slate-900 via-[#0d1424] to-slate-900 border border-purple-500/40 rounded-3xl max-w-lg w-full p-6 shadow-[0_0_50px_rgba(168,85,247,0.25)] relative animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1 mb-5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>자유 연습 모드 런처</span>
          </div>
          <h3 className="text-xl font-black text-white">원하는 곡으로 디깅 시작하기</h3>
          <p className="text-xs text-slate-400">
            좋아하는 곡을 직접 검색해 출발하거나, 무작위 미션을 뽑아보세요.
          </p>
        </div>

        {/* Action 1: Quick Random Quest Button */}
        <div className="mb-5">
          <button
            onClick={handleRandomQuest}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-sm shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all active:scale-95 disabled:opacity-50"
          >
            {isGenerating ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Dices className="w-5 h-5" />
                <span>🎲 무작위 퀘스트 즉시 시작</span>
              </>
            )}
          </button>
        </div>

        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-[11px] text-slate-500 font-semibold absolute">
            또는 출발 곡 검색
          </span>
        </div>

        {/* Action 2: Search for Starting Song */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="곡명 또는 가수명 입력 (예: 아이유, 밤편지)..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs sm:text-sm disabled:opacity-50 transition-all shrink-0"
          >
            {isSearching ? "검색중..." : "검색"}
          </button>
        </form>

        {/* Search Results List */}
        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
          {searchResults.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelectStartSong(item.id)}
              disabled={isGenerating}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/60 hover:bg-purple-950/20 text-left transition-all group"
            >
              <div>
                <div className="text-xs sm:text-sm font-bold text-white group-hover:text-purple-300">
                  {item.name}
                </div>
                <div className="text-[11px] text-slate-400">
                  {item.details?.artist} • {item.details?.year}년 • {item.details?.genre || "가요"}
                </div>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-rose-400/80 shrink-0">
                <Heart className="w-3 h-3 fill-rose-400/20" />
                <span>{item.details?.likes?.toLocaleString()}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
