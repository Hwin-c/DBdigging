"use client";

import React, { useState } from "react";
import { QuestPayload, PracticeFilterOptions, SearchResultItem, RoleCode } from "@/lib/graph/types";
import { clientApi } from "@/lib/game/clientApi";
import {
  Sparkles,
  X,
  Search,
  Dices,
  SlidersHorizontal,
  Compass,
  CheckSquare,
  Square,
  Layers,
  Disc3,
  User,
  Flag,
  Target,
  Play,
  RefreshCw,
  ArrowRight
} from "lucide-react";

interface PracticeLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuest: (quest: QuestPayload) => void;
  onShowToast: (text: string, type?: "success" | "error" | "info") => void;
}

const GENRES = [
  { id: "all", label: "모든 장르" },
  { id: "발라드", label: "발라드" },
  { id: "댄스", label: "댄스" },
  { id: "랩/힙합", label: "랩/힙합" },
  { id: "R&B/Soul", label: "R&B/Soul" },
  { id: "록/메탈", label: "록/메탈" },
  { id: "인디음악", label: "인디음악" },
  { id: "성인가요/트로트", label: "트로트" },
  { id: "포크/블루스", label: "포크/블루스" },
  { id: "국내드라마", label: "드라마OST" },
  { id: "POP", label: "POP" }
];

const DECADES = [
  { id: "all", label: "모든 시대" },
  { id: "2020s", label: "2020년대" },
  { id: "2010s", label: "2010년대" },
  { id: "2000s", label: "2000년대" },
  { id: "1990s", label: "1990년대" },
  { id: "1980s_before", label: "1980년대 이전" }
];

const AGENCIES = ["all", "SM", "JYP", "YG", "빅히트", "스타쉽"];

const ROLES_LIST: { id: string; label: string; roles: RoleCode[] }[] = [
  { id: "singer", label: "가창", roles: [1] },
  { id: "lyricist", label: "작사", roles: [3] },
  { id: "composer", label: "작곡", roles: [4] },
  { id: "arranger", label: "편곡", roles: [5] },
  { id: "group_feat", label: "그룹/피처링", roles: [2, 6] }
];

export function PracticeLauncherModal({
  isOpen,
  onClose,
  onSelectQuest,
  onShowToast
}: PracticeLauncherModalProps) {
  // 활성 탭 (Layer 1 ~ Layer 4)
  const [activeTab, setActiveTab] = useState<1 | 2 | 3 | 4>(1);

  // Layer 1: 출발 & 도착
  const [startType, setStartType] = useState<"random" | "song" | "artist">("random");
  const [selectedStart, setSelectedStart] = useState<{ id: string; name: string; display: string } | null>(null);

  const [targetType, setTargetType] = useState<"random" | "song" | "artist">("random");
  const [selectedTarget, setSelectedTarget] = useState<{ id: string; name: string; display: string } | null>(null);

  // 검색 상태
  const [searchTargetSlot, setSearchTargetSlot] = useState<"start" | "target" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Layer 2: 속성 필터
  const [selectedGenre, setSelectedGenre] = useState("all");
  const [selectedDecade, setSelectedDecade] = useState("all");
  const [selectedAgency, setSelectedAgency] = useState("all");
  const [customAgency, setCustomAgency] = useState("");
  const [titleOnly, setTitleOnly] = useState(false);

  // Layer 3: 허용 크레딧 역할 (기본값: 전체 허용)
  const [selectedRoleKeys, setSelectedRoleKeys] = useState<string[]>([
    "singer",
    "lyricist",
    "composer",
    "arranger",
    "group_feat"
  ]);

  // Layer 4: 목표 턴 거리
  const [turnDistance, setTurnDistance] = useState<"short" | "standard" | "long" | "any">("standard");

  // Re-roll 미리보기 퀘스트 상태
  const [previewQuest, setPreviewQuest] = useState<QuestPayload | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  // 검색 모달 열기
  const openSearchModal = (slot: "start" | "target") => {
    setSearchTargetSlot(slot);
    setSearchQuery("");
    setSearchResults([]);
  };

  // 실시간 검색 실행
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    try {
      const mode = searchTargetSlot === "start" ? startType : targetType;
      const targetTypeParam = mode === "artist" ? "person" : "song";
      const data = await clientApi.search(q, { targetType: targetTypeParam, limit: 12 });
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

  // 검색 결과 선택
  const handlePickSearchResult = (item: SearchResultItem) => {
    if (searchTargetSlot === "start") {
      setSelectedStart({ id: item.id, name: item.name, display: item.display });
    } else if (searchTargetSlot === "target") {
      setSelectedTarget({ id: item.id, name: item.name, display: item.display });
    }
    setPreviewQuest(null);
    setSearchTargetSlot(null);
  };

  // 역할 체크박스 토글
  const toggleRole = (key: string) => {
    if (selectedRoleKeys.includes(key)) {
      if (selectedRoleKeys.length === 1) {
        onShowToast("최소 1개 이상의 크레딧 역할을 선택해야 합니다.", "info");
        return;
      }
      setSelectedRoleKeys(selectedRoleKeys.filter((k) => k !== key));
    } else {
      setSelectedRoleKeys([...selectedRoleKeys, key]);
    }
    setPreviewQuest(null);
  };

  // 4-Layer 맞춤 퀘스트 생성 (Re-roll 미리보기)
  const handleGeneratePreviewQuest = async () => {
    setIsGenerating(true);
    try {
      const allowedRoles: RoleCode[] = [];
      selectedRoleKeys.forEach((key) => {
        const item = ROLES_LIST.find((r) => r.id === key);
        if (item) allowedRoles.push(...item.roles);
      });

      const agencyVal =
        customAgency.trim() || (selectedAgency !== "all" ? selectedAgency : undefined);

      const filterOptions: PracticeFilterOptions = {
        startMode: startType,
        startId: startType !== "random" ? selectedStart?.id : undefined,
        startName: selectedStart?.name,
        targetMode: targetType,
        targetId: targetType !== "random" ? selectedTarget?.id : undefined,
        targetName: selectedTarget?.name,
        genre: selectedGenre !== "all" ? selectedGenre : undefined,
        decade: selectedDecade !== "all" ? selectedDecade : undefined,
        agency: agencyVal,
        titleOnly,
        allowedRoles: allowedRoles.length < 6 ? allowedRoles : undefined,
        turnDistance
      };

      const quest = await clientApi.getRandomQuest(filterOptions);
      setPreviewQuest(quest);
    } catch (err: any) {
      console.error("[PracticeLauncher] Generate error:", err);
      onShowToast("맞춤 퀘스트 생성에 실패했습니다. 조건을 완화해 보세요.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // 미리보기된 퀘스트로 실제 게임 시작
  const handleConfirmStartQuest = () => {
    if (!previewQuest) return;
    onSelectQuest(previewQuest);
    onClose();
    onShowToast(
      `맞춤 퀘스트 시작: '${previewQuest.startSong.title}' ➔ '${previewQuest.targetSong.title}' (${previewQuest.optimalTurns}턴 목표)`,
      "success"
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 break-keep">
      <div className="bg-[#0D1117] border border-slate-800 rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative max-h-[92vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors z-10"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1 mb-3.5 shrink-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>CUSTOM DIGGING BUILDER</span>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-white">맞춤 디깅 퀘스트 빌더</h3>
          <p className="text-xs text-slate-400">
            출발·목적지, 속성 필터, 허용 역할을 조합해 원하는 매치업을 미리 뽑아보고 시작하세요.
          </p>
        </div>

        {/* 4-Layer Tab Navigation */}
        <div className="flex border-b border-slate-800 mb-3.5 shrink-0 overflow-x-auto no-scrollbar gap-1">
          <button
            onClick={() => setActiveTab(1)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 1
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>1. 출발/도착</span>
          </button>
          <button
            onClick={() => setActiveTab(2)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 2
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>2. 속성 필터</span>
          </button>
          <button
            onClick={() => setActiveTab(3)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 3
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3. 허용 역할 ({selectedRoleKeys.length}/5)</span>
          </button>
          <button
            onClick={() => setActiveTab(4)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 4
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>4. 목표 거리</span>
          </button>
        </div>

        {/* Tab Contents Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 text-xs min-h-[180px]">
          {/* Layer 1: 출발 & 목적지 지정 */}
          {activeTab === 1 && (
            <div className="space-y-3">
              {/* 1. 출발지 지정 */}
              <div className="p-3.5 rounded-2xl bg-[#090A0F] border border-slate-800 space-y-2.5">
                <div className="font-bold text-slate-200 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Flag className="w-3.5 h-3.5 text-emerald-400" />
                    <span>1. 출발 노드 지정</span>
                  </span>
                  {selectedStart && startType !== "random" && (
                    <span className="text-[11px] font-bold text-emerald-400 truncate max-w-[180px]">
                      선택됨: {selectedStart.name}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setStartType("random");
                      setSelectedStart(null);
                      setPreviewQuest(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-center transition-all ${
                      startType === "random"
                        ? "bg-emerald-950/50 border-emerald-400 text-emerald-200 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    <Dices className="w-3.5 h-3.5 shrink-0" />
                    <span>조건 랜덤</span>
                  </button>
                  <button
                    onClick={() => {
                      setStartType("song");
                      openSearchModal("start");
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-center transition-all ${
                      startType === "song"
                        ? "bg-emerald-950/50 border-emerald-400 text-emerald-200 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    <Disc3 className="w-3.5 h-3.5 shrink-0" />
                    <span>특정 곡 검색</span>
                  </button>
                  <button
                    onClick={() => {
                      setStartType("artist");
                      openSearchModal("start");
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-center transition-all ${
                      startType === "artist"
                        ? "bg-emerald-950/50 border-emerald-400 text-emerald-200 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span>아티스트 검색</span>
                  </button>
                </div>
              </div>

              {/* 2. 목적지 지정 */}
              <div className="p-3.5 rounded-2xl bg-[#090A0F] border border-slate-800 space-y-2.5">
                <div className="font-bold text-slate-200 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-amber-400" />
                    <span>2. 도착 노드 지정</span>
                  </span>
                  {selectedTarget && targetType !== "random" && (
                    <span className="text-[11px] font-bold text-amber-300 truncate max-w-[180px]">
                      선택됨: {selectedTarget.name}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setTargetType("random");
                      setSelectedTarget(null);
                      setPreviewQuest(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-center transition-all ${
                      targetType === "random"
                        ? "bg-amber-950/50 border-amber-400 text-amber-200 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    <Dices className="w-3.5 h-3.5 shrink-0" />
                    <span>조건 랜덤</span>
                  </button>
                  <button
                    onClick={() => {
                      setTargetType("song");
                      openSearchModal("target");
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-center transition-all ${
                      targetType === "song"
                        ? "bg-amber-950/50 border-amber-400 text-amber-200 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    <Disc3 className="w-3.5 h-3.5 shrink-0" />
                    <span>특정 곡 검색</span>
                  </button>
                  <button
                    onClick={() => {
                      setTargetType("artist");
                      openSearchModal("target");
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-center transition-all ${
                      targetType === "artist"
                        ? "bg-amber-950/50 border-amber-400 text-amber-200 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span>아티스트 검색</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Layer 2: 노드 속성 필터 */}
          {activeTab === 2 && (
            <div className="space-y-3.5">
              {/* 장르 선택 */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-200 block">장르 필터</label>
                <div className="flex flex-wrap gap-1.5">
                  {GENRES.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        setSelectedGenre(g.id);
                        setPreviewQuest(null);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        selectedGenre === g.id
                          ? "bg-emerald-600 border-emerald-400 text-slate-950 font-black"
                          : "bg-[#090A0F] border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 발매 시대 */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-200 block">발매연도 / 시대</label>
                <div className="flex flex-wrap gap-1.5">
                  {DECADES.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        setSelectedDecade(d.id);
                        setPreviewQuest(null);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        selectedDecade === d.id
                          ? "bg-emerald-600 border-emerald-400 text-slate-950 font-black"
                          : "bg-[#090A0F] border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 소속사 필터 */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-200 block">소속사 필터</label>
                <div className="flex flex-wrap gap-1.5">
                  {AGENCIES.map((ag) => (
                    <button
                      key={ag}
                      onClick={() => {
                        setSelectedAgency(ag);
                        setCustomAgency("");
                        setPreviewQuest(null);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        selectedAgency === ag && !customAgency
                          ? "bg-emerald-600 border-emerald-400 text-slate-950 font-black"
                          : "bg-[#090A0F] border-slate-800 text-slate-400"
                      }`}
                    >
                      {ag === "all" ? "전체" : ag}
                    </button>
                  ))}
                  <input
                    type="text"
                    value={customAgency}
                    onChange={(e) => {
                      setCustomAgency(e.target.value);
                      setPreviewQuest(null);
                    }}
                    placeholder="소속사 직접 입력..."
                    className="px-3 py-1.5 rounded-lg bg-[#090A0F] border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* 타이틀곡 우선 선별 */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={titleOnly}
                    onChange={(e) => {
                      setTitleOnly(e.target.checked);
                      setPreviewQuest(null);
                    }}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-[#090A0F] border-slate-700"
                  />
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Disc3 className="w-3.5 h-3.5 text-amber-400" />
                    <span>TITLE (타이틀곡)만 우선 선별</span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Layer 3: 허용 크레딧 징검다리 역할 */}
          {activeTab === 3 && (
            <div className="space-y-3">
              <p className="text-slate-400 leading-relaxed">
                퍼즐 이동 중 허용할 크레딧 연결고리를 제한하여 게임 난이도를 조절할 수 있습니다.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {ROLES_LIST.map((roleItem) => {
                  const isChecked = selectedRoleKeys.includes(roleItem.id);

                  return (
                    <button
                      key={roleItem.id}
                      onClick={() => toggleRole(roleItem.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                        isChecked
                          ? "bg-emerald-950/35 border-emerald-500/60 text-white font-bold"
                          : "bg-[#090A0F] border-slate-800 text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      <span className="text-xs sm:text-sm">{roleItem.label}</span>
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Layer 4: 목표 최단 턴 거리 */}
          {activeTab === 4 && (
            <div className="space-y-3">
              <p className="text-slate-400 leading-relaxed">
                출발지에서 도착지까지의 최적 최단 경로 길이를 설정합니다.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {[
                  { id: "short", label: "단거리", desc: "1~2턴" },
                  { id: "standard", label: "표준 거리", desc: "3~4턴" },
                  { id: "long", label: "장거리", desc: "5~6턴" },
                  { id: "any", label: "거리 무관", desc: "모든 거리" }
                ].map((dist) => (
                  <button
                    key={dist.id}
                    onClick={() => {
                      setTurnDistance(dist.id as any);
                      setPreviewQuest(null);
                    }}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all ${
                      turnDistance === dist.id
                        ? "bg-emerald-950/40 border-emerald-400 text-emerald-100 font-bold"
                        : "bg-[#090A0F] border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-xs font-bold mb-1">{dist.label}</span>
                    <span className="text-[11px] text-emerald-300/80">{dist.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* Re-roll 미리보기 카드 (QuestPreviewCard)                  */}
        {/* ======================================================== */}
        <div className="pt-3.5 border-t border-slate-800 mt-3.5 shrink-0 space-y-3">
          {previewQuest ? (
            <div className="p-3.5 rounded-2xl bg-[#090A0F] border border-emerald-500/40 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  PREVIEW MATCHUP
                </span>
                <span className="text-[11px] font-extrabold text-amber-300">
                  최단 {previewQuest.optimalTurns}턴 경로 검증됨
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
                {/* 출발 곡 */}
                <div className="p-2.5 rounded-xl bg-[#0D1117] border border-slate-800 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      START
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">
                      {previewQuest.startSong.year}년 • {previewQuest.startSong.genre}
                    </span>
                  </div>
                  <div className="text-xs font-extrabold text-white truncate">
                    {previewQuest.startSong.title}
                  </div>
                  <div className="text-[11px] text-emerald-300 font-semibold truncate">
                    {previewQuest.startSong.artist}
                  </div>
                </div>

                {/* 화살표 */}
                <div className="hidden sm:flex flex-col items-center justify-center px-1 text-slate-500">
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                </div>

                {/* 도착 곡 */}
                <div className="p-2.5 rounded-xl bg-[#0D1117] border border-slate-800 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      TARGET
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">
                      {previewQuest.targetSong.year}년 • {previewQuest.targetSong.genre}
                    </span>
                  </div>
                  <div className="text-xs font-extrabold text-white truncate">
                    {previewQuest.targetSong.title}
                  </div>
                  <div className="text-[11px] text-amber-300 font-semibold truncate">
                    {previewQuest.targetSong.artist}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Re-roll vs Start */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleGeneratePreviewQuest}
                  disabled={isGenerating}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                  <span>다른 조합 다시 생성</span>
                </button>
                <button
                  onClick={handleConfirmStartQuest}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all active:scale-95 shadow-md"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>이 퀘스트로 시작하기</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleGeneratePreviewQuest}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition-all active:scale-95 disabled:opacity-50 shadow-md"
            >
              {isGenerating ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Dices className="w-5 h-5" />
                  <span>조건으로 퀘스트 생성 (미리보기)</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Inner Search Overlay Modal */}
        {searchTargetSlot && (
          <div className="absolute inset-0 bg-[#090A0F]/95 backdrop-blur-md rounded-3xl p-5 sm:p-6 flex flex-col z-20 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-400" />
                <span>
                  {searchTargetSlot === "start" ? "출발지" : "목적지"}{" "}
                  {(searchTargetSlot === "start" ? startType : targetType) === "artist"
                    ? "아티스트 검색"
                    : "곡 검색"}
                </span>
              </h4>
              <button
                onClick={() => setSearchTargetSlot(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2 mb-4 shrink-0">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색어 입력 (예: 아이유, NewJeans, 밤편지)..."
                autoFocus
                className="flex-1 bg-[#0D1117] border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shrink-0 disabled:opacity-50"
              >
                {isSearching ? "검색중..." : "검색"}
              </button>
            </form>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handlePickSearchResult(item)}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-[#0D1117] border border-slate-800 hover:border-emerald-500/60 text-left transition-all group"
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-white group-hover:text-emerald-300 truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {item.display}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
