"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ConnectedPerson,
  ConnectedSong,
  DeepSeaMission,
  getMelonSongUrl,
  HistoryStep,
  QuestPayload,
  SongInfo,
} from "@/lib/graph/types";
import { Header } from "@/components/common/Header";
import { Toast, ToastMessage } from "@/components/common/Toast";
import { QuestStatusBar } from "@/components/game/QuestStatusBar";
import { CurrentSongCard } from "@/components/game/CurrentSongCard";
import { TurnCardView } from "@/components/game/TurnCardView";
import { HardcoreInput } from "@/components/game/HardcoreInput";
import { ClearModal } from "@/components/game/ClearModal";
import { PracticeLauncherModal } from "@/components/game/PracticeLauncherModal";
import { DeepSeaStatusBar } from "@/components/deepsea/DeepSeaStatusBar";
import { DeepSeaTurnView } from "@/components/deepsea/DeepSeaTurnView";
import { DeepSeaResultModal, DiveHistoryStep } from "@/components/deepsea/DeepSeaResultModal";
import { StatsModal } from "@/components/common/StatsModal";
import {
  recordDailyAttempt,
  recordDailyClear,
  recordPracticeClear,
  recordDeepSeaDive,
  UserStatsPayload
} from "@/lib/storage/stats";
import { clientApi, ensureGraphLoaded } from "@/lib/game/clientApi";
import { Disc3, Waves } from "lucide-react";

function getDiverTitle(depth: number): string {
  if (depth >= 1300) return "🔱 마리아나 마스터";
  if (depth >= 800) return "🌊 심해 탐험가";
  if (depth >= 400) return "🤿 스쿠버 다이버";
  return "🫧 스노클링";
}

export default function DBDiggingPage() {
  // ----------------------------------------------------
  // 전역 게임 모드 ("daily" | "practice" | "deepsea")
  // ----------------------------------------------------
  const [gameMode, setGameMode] = useState<"daily" | "practice" | "deepsea">("daily");

  // ====================================================
  // [인메모리 그래프 엔진 준비 상태]
  // ====================================================
  const [isEngineReady, setIsEngineReady] = useState<boolean>(false);
  const [engineLoadText, setEngineLoadText] = useState<string>("K-Pop 크레딧 네트워크 연결 중...");

  // ====================================================
  // [모드 1 상태 머신: 오늘의 디깅 & 자유 연습]
  // ====================================================
  const [quest, setQuest] = useState<QuestPayload | null>(null);
  const [currentSong, setCurrentSong] = useState<SongInfo | null>(null);
  const [historyStack, setHistoryStack] = useState<HistoryStep[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<ConnectedPerson | null>(null);
  const [connectedPersons, setConnectedPersons] = useState<ConnectedPerson[]>([]);
  const [connectedSongs, setConnectedSongs] = useState<ConnectedSong[]>([]);

  // 모드 1 UI 토글
  const [isHintMode, setIsHintMode] = useState<boolean>(false);
  const [isHardcore, setIsHardcore] = useState<boolean>(false);
  const [isQuestLoading, setIsQuestLoading] = useState<boolean>(true);
  const [isGraphLoading, setIsGraphLoading] = useState<boolean>(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState<boolean>(false);
  const [isPracticeModalOpen, setIsPracticeModalOpen] = useState<boolean>(false);

  // ====================================================
  // [모드 2 상태 머신: 심해 디깅 서바이벌]
  // ====================================================
  const [deepSeaCurrentSong, setDeepSeaCurrentSong] = useState<SongInfo | null>(null);
  const [deepSeaDepth, setDeepSeaDepth] = useState<number>(0);
  const [deepSeaLives, setDeepSeaLives] = useState<number>(3);
  const [deepSeaMission, setDeepSeaMission] = useState<DeepSeaMission | null>(null);
  const [deepSeaDiveHistory, setDeepSeaDiveHistory] = useState<DiveHistoryStep[]>([]);
  const [deepSeaVisitedSongIds, setDeepSeaVisitedSongIds] = useState<string[]>([]);
  const [deepSeaSelectedPerson, setDeepSeaSelectedPerson] = useState<ConnectedPerson | null>(null);
  const [deepSeaConnectedPersons, setDeepSeaConnectedPersons] = useState<ConnectedPerson[]>([]);
  const [deepSeaConnectedSongs, setDeepSeaConnectedSongs] = useState<ConnectedSong[]>([]);
  const [isDeepSeaLoading, setIsDeepSeaLoading] = useState<boolean>(false);
  const [isDeepSeaResultOpen, setIsDeepSeaResultOpen] = useState<boolean>(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState<boolean>(false);
  const [statsModalInitialTab, setStatsModalInitialTab] = useState<"daily" | "deepsea" | "backup">("daily");
  const [latestStats, setLatestStats] = useState<UserStatsPayload | null>(null);

  // 모드별 전적 모달 오픈 핸들러 (최신 전적 갱신 및 탭 포커싱)
  const handleOpenStats = useCallback((tab?: "daily" | "deepsea" | "backup") => {
    setStatsModalInitialTab(tab || (gameMode === "deepsea" ? "deepsea" : "daily"));
    setIsStatsModalOpen(true);
  }, [gameMode]);

  // 글로벌 토스트 알림 피드백
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, type: "success" | "error" | "info" = "success") => {
    setToast({ id: `${Date.now()}_${Math.random()}`, text, type });
  }, []);

  // ----------------------------------------------------
  // [모드 1] 데일리 퀘스트 로드
  // ----------------------------------------------------
  const loadDailyQuest = useCallback(async () => {
    setIsQuestLoading(true);
    try {
      const data: QuestPayload = await clientApi.getDailyQuest();
      setQuest(data);
      setCurrentSong(data.startSong);
      setHistoryStack([{ song: data.startSong }]);
      setSelectedPerson(null);
      setConnectedSongs([]);
      setIsClearModalOpen(false);
      setGameMode("daily");
    } catch (err: any) {
      console.error("[loadDailyQuest] Error:", err);
      showToast("데일리 퀘스트 로드 실패. 다시 시도해 주세요.", "error");
    } finally {
      setIsQuestLoading(false);
    }
  }, [showToast]);

  // ----------------------------------------------------
  // [초기화] 인메모리 그래프 번들 & 시드 비동기 다운로드 및 인덱싱
  // ----------------------------------------------------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setEngineLoadText("202,394곡 K-Pop 크레딧 네트워크 인메모리 로딩 중...");
        await ensureGraphLoaded();
        if (mounted) {
          setIsEngineReady(true);
          loadDailyQuest();
        }
      } catch (err) {
        console.error("[initEngine] Error:", err);
        if (mounted) {
          showToast("데이터 번들 로딩에 실패했습니다. 새로고침 해주세요.", "error");
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadDailyQuest, showToast]);

  // [모드 1] 인물 목록 조회
  const fetchConnectedPersons = useCallback(
    async (songId: string) => {
      setIsGraphLoading(true);
      try {
        const data = await clientApi.inspectGraph({
          songId,
          targetSongId: isHintMode && quest ? quest.targetSong.id : undefined
        });
        setConnectedPersons(data.connectedPersons || []);
      } catch (err) {
        console.error("[fetchConnectedPersons] Error:", err);
        showToast("인물 목록을 불러오지 못했습니다.", "error");
      } finally {
        setIsGraphLoading(false);
      }
    },
    [isHintMode, quest, showToast]
  );

  useEffect(() => {
    if (isEngineReady && gameMode !== "deepsea" && currentSong && !selectedPerson && !isHardcore) {
      fetchConnectedPersons(currentSong.id);
    }
  }, [isEngineReady, gameMode, currentSong, selectedPerson, isHintMode, isHardcore, fetchConnectedPersons]);

  // [모드 1] 인물 선택 -> 곡 조회
  const handleSelectPerson = async (person: ConnectedPerson) => {
    setSelectedPerson(person);
    setIsGraphLoading(true);
    try {
      const data = await clientApi.inspectGraph({
        personId: person.id,
        targetSongId: isHintMode && quest ? quest.targetSong.id : undefined
      });
      setConnectedSongs(data.connectedSongs || []);
    } catch (err) {
      console.error("[handleSelectPerson] Error:", err);
      showToast("참여 곡 목록을 불러오지 못했습니다.", "error");
    } finally {
      setIsGraphLoading(false);
    }
  };

  const handleCancelPersonSelection = () => {
    setSelectedPerson(null);
    setConnectedSongs([]);
  };

  // [모드 1] 곡 선택
  const handleSelectSong = (nextSong: ConnectedSong | SongInfo, viaPerson: ConnectedPerson) => {
    if (!quest) return;

    const newStep: HistoryStep = {
      song: nextSong,
      viaPerson: {
        id: viaPerson.id,
        name: viaPerson.name,
        roles: viaPerson.roles ?? [],
        roleLabels: viaPerson.roleLabels ?? []
      }
    };

    const nextHistory = [...historyStack, newStep];
    setHistoryStack(nextHistory);
    setCurrentSong(nextSong);
    setSelectedPerson(null);
    setConnectedSongs([]);

    // [전적] 데일리 모드 첫 턴 이동 시 도전 횟수 1회 기록
    if (gameMode === "daily" && quest && historyStack.length === 1) {
      const updated = recordDailyAttempt(quest.questId);
      setLatestStats(updated);
    }

    if (nextSong.id === quest.targetSong.id) {
      setIsClearModalOpen(true);
      showToast("🎉 축하합니다! 목적지 곡에 도달했습니다!", "success");

      // [전적] 클리어 성공 기록 (데일리 vs 자유 연습 격리)
      if (gameMode === "daily") {
        const updated = recordDailyClear(quest.questId, nextHistory.length - 1);
        setLatestStats(updated);
      } else if (gameMode === "practice") {
        const updated = recordPracticeClear();
        setLatestStats(updated);
      }
    }
  };

  // [모드 1] 백트래킹
  const handleBacktrack = () => {
    if (historyStack.length <= 1) return;

    const newStack = historyStack.slice(0, -1);
    const prevStep = newStack[newStack.length - 1];

    setHistoryStack(newStack);
    setCurrentSong(prevStep.song);
    setSelectedPerson(null);
    setConnectedSongs([]);
    showToast(`'${prevStep.song.title}'(으)로 되돌아갔습니다. (턴 차감)`, "info");
  };

  // [모드 1] 연습 모드 런처
  const handleLaunchPracticeQuest = (newQuest: QuestPayload) => {
    setQuest(newQuest);
    setCurrentSong(newQuest.startSong);
    setHistoryStack([{ song: newQuest.startSong }]);
    setSelectedPerson(null);
    setConnectedSongs([]);
    setIsClearModalOpen(false);
    setGameMode("practice");
  };

  // ====================================================
  // [모드 2: 심해 디깅 핸들러]
  // ====================================================
  const initDeepSea = useCallback(
    async (startSongOverride?: SongInfo) => {
      setIsDeepSeaLoading(true);
      try {
        let baseSong = startSongOverride || currentSong;
        if (!baseSong) {
          const qData = await clientApi.getDailyQuest();
          baseSong = qData.startSong;
        }

        if (!baseSong) throw new Error("시작 곡을 찾을 수 없습니다.");

        setDeepSeaCurrentSong(baseSong);
        setDeepSeaDepth(0);
        setDeepSeaLives(3);
        setDeepSeaVisitedSongIds([baseSong.id]);
        setDeepSeaDiveHistory([
          {
            song: baseSong,
            isValid: true,
            depthAtStep: 0,
            melonUrl: getMelonSongUrl(baseSong.id)
          }
        ]);
        setDeepSeaSelectedPerson(null);
        setDeepSeaConnectedSongs([]);
        setIsDeepSeaResultOpen(false);

        // 1. 초기 미션 발급 (클라이언트 인메모리 엔진 직통)
        const missionData = await clientApi.getDeepSeaMission(baseSong.id, [baseSong.id]);
        setDeepSeaMission(missionData.mission);

        // 2. 현재 곡 기준 연결된 인물 목록 조회
        const inspectData = await clientApi.inspectGraph({ songId: baseSong.id });
        setDeepSeaConnectedPersons(inspectData.connectedPersons || []);

        showToast(`🌊 심해 디깅 시작! 출발: ${baseSong.title}`, "info");
      } catch (err: any) {
        console.error("[initDeepSea] Error:", err);
        showToast("심해 디깅 초기화에 실패했습니다.", "error");
      } finally {
        setIsDeepSeaLoading(false);
      }
    },
    [currentSong, showToast]
  );

  // [모드 2] 인물 선택 -> 연결 곡 조회
  const handleDeepSeaSelectPerson = async (person: ConnectedPerson) => {
    setDeepSeaSelectedPerson(person);
    setIsDeepSeaLoading(true);
    try {
      const data = await clientApi.inspectGraph({ personId: person.id });
      setDeepSeaConnectedSongs(data.connectedSongs || []);
    } catch (err) {
      console.error("[handleDeepSeaSelectPerson] Error:", err);
      showToast("참여 곡 목록을 불러오지 못했습니다.", "error");
    } finally {
      setIsDeepSeaLoading(false);
    }
  };

  const handleDeepSeaCancelPerson = () => {
    setDeepSeaSelectedPerson(null);
    setDeepSeaConnectedSongs([]);
  };

  // [모드 2] 곡 선택 -> 클라이언트 엔진 검증 및 턴 전이
  const handleDeepSeaSelectSong = async (song: ConnectedSong, viaPerson: ConnectedPerson) => {
    if (!deepSeaCurrentSong || !deepSeaMission) return;

    setIsDeepSeaLoading(true);
    try {
      const nextExclude = [...deepSeaVisitedSongIds, song.id];

      // 1. 클라이언트 엔진 직통 호출 (판정 + nextMission 동시 수신)
      const data = await clientApi.validateDeepSeaStep(
        deepSeaCurrentSong.id,
        song.id,
        deepSeaMission.condition,
        nextExclude
      );

      let nextDepth = deepSeaDepth;
      let nextLives = deepSeaLives;

      if (data.isValid) {
        nextDepth = deepSeaDepth + 100;
        setDeepSeaDepth(nextDepth);
        showToast(`조건 통과! 수심 ${nextDepth}m 도달 🌊`, "success");
      } else {
        nextLives = deepSeaLives - 1;
        setDeepSeaLives(nextLives);
        showToast("조건 불일치! 하트 1개 소모 💔", "error");
      }

      // 2. 다이빙 히스토리 누적
      const historyEntry: DiveHistoryStep = {
        song,
        viaPerson: {
          id: viaPerson.id,
          name: viaPerson.name,
          roles: viaPerson.roles ?? [],
          roleLabels: viaPerson.roleLabels ?? []
        },
        isValid: data.isValid,
        depthAtStep: nextDepth,
        melonUrl: data.melonUrl || getMelonSongUrl(song.id),
        reason: data.fallbackReason
      };

      setDeepSeaDiveHistory((prev) => [...prev, historyEntry]);
      setDeepSeaVisitedSongIds(nextExclude);
      setDeepSeaCurrentSong(song);
      setDeepSeaMission(data.nextMission);
      setDeepSeaSelectedPerson(null);
      setDeepSeaConnectedSongs([]);

      // 3. 하트 0개 도달 시 게임 오버 결과 모달
      if (nextLives <= 0) {
        setIsDeepSeaResultOpen(true);
        showToast("산소 고갈! 다이빙이 종료되었습니다.", "info");

        // [전적] 심해 디깅 탐사 기록 누적
        const finalHistory = [...deepSeaDiveHistory, historyEntry];
        const playlist = finalHistory.map((h) => ({
          id: h.song.id,
          title: h.song.title,
          artist: h.song.artist,
          year: h.song.year,
          melonUrl: h.melonUrl
        }));
        const updated = recordDeepSeaDive(nextDepth, getDiverTitle(nextDepth), playlist);
        setLatestStats(updated);
      } else {
        // 다음 곡의 연결 인물 목록 로드
        const inspectData = await clientApi.inspectGraph({ songId: song.id });
        setDeepSeaConnectedPersons(inspectData.connectedPersons || []);
      }
    } catch (err: any) {
      console.error("[handleDeepSeaSelectSong] Error:", err);
      showToast("턴 이동 중 오류가 발생했습니다.", "error");
    } finally {
      setIsDeepSeaLoading(false);
    }
  };

  // [모드 2] 중도 부상
  const handleDeepSeaSurface = () => {
    setIsDeepSeaResultOpen(true);
    showToast("안전하게 수면으로 부상했습니다. ⚓", "info");

    // [전적] 심해 디깅 탐사 기록 누적
    const playlist = deepSeaDiveHistory.map((h) => ({
      id: h.song.id,
      title: h.song.title,
      artist: h.song.artist,
      year: h.song.year,
      melonUrl: h.melonUrl
    }));
    const updated = recordDeepSeaDive(deepSeaDepth, getDiverTitle(deepSeaDepth), playlist);
    setLatestStats(updated);
  };

  // 모드 전환 핸들러
  const handleSelectGameMode = (mode: "daily" | "practice" | "deepsea") => {
    if (mode === "daily") {
      setGameMode("daily");
      loadDailyQuest();
    } else if (mode === "practice") {
      setGameMode("practice");
      setIsPracticeModalOpen(true);
    } else if (mode === "deepsea") {
      setGameMode("deepsea");
      initDeepSea();
    }
  };

  const turnCount = Math.max(0, historyStack.length - 1);
  const canBacktrack = historyStack.length > 1;

  if (!isEngineReady) {
    return (
      <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center text-center max-w-md w-full space-y-6">
          <div className="relative flex items-center justify-center">
            <div className="w-24 h-24 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 border-r-cyan-400 animate-spin" />
            <Disc3 className="w-12 h-12 text-indigo-400 absolute animate-pulse" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-400">
              디비디깅 (DBDIGGING)
            </h1>
            <p className="text-sm font-medium text-slate-300 animate-pulse">
              {engineLoadText}
            </p>
          </div>

          <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 h-full w-full animate-pulse" />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 px-4 py-2 rounded-full border border-slate-800">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Cold Start 0초 • 초고속 브라우저 인메모리 엔진</span>
          </div>
        </div>
        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col">
      {/* 1. 글로벌 네비게이션 헤더 */}
      <Header
        gameMode={gameMode}
        onSelectGameMode={handleSelectGameMode}
        isHintMode={isHintMode}
        onToggleHintMode={() => setIsHintMode((prev) => !prev)}
        isHardcore={isHardcore}
        onToggleHardcore={() => setIsHardcore((prev) => !prev)}
        onOpenPracticeLauncher={() => setIsPracticeModalOpen(true)}
        onResetToDaily={loadDailyQuest}
        onOpenStats={() => handleOpenStats()}
      />

      {/* 2. 메인 컨텐츠 영역 */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 space-y-5">
        {/* ======================================================== */}
        {/* [모드 2: 심해 디깅 화면]                                 */}
        {/* ======================================================== */}
        {gameMode === "deepsea" ? (
          isDeepSeaLoading && !deepSeaCurrentSong ? (
            <div className="h-96 flex flex-col items-center justify-center gap-3 text-cyan-400">
              <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold">심해 잠항 준비 중...</p>
            </div>
          ) : deepSeaCurrentSong ? (
            <>
              {/* 심해 수심 및 하트 HUD 상태 바 */}
              <DeepSeaStatusBar
                depth={deepSeaDepth}
                lives={deepSeaLives}
                currentMission={deepSeaMission}
                currentSong={deepSeaCurrentSong}
                onSurface={handleDeepSeaSurface}
              />

              {/* 현재 위치 곡 정보 카드 */}
              <CurrentSongCard
                currentSong={deepSeaCurrentSong}
                historyStack={deepSeaDiveHistory.map((d) => ({
                  song: d.song,
                  viaPerson: d.viaPerson
                }))}
              />

              {/* 심해 스포일러 블라인드 & 턴 뷰 */}
              <DeepSeaTurnView
                currentSong={deepSeaCurrentSong}
                currentMission={deepSeaMission}
                connectedPersons={deepSeaConnectedPersons}
                connectedSongs={deepSeaConnectedSongs}
                selectedPerson={deepSeaSelectedPerson}
                onSelectPerson={handleDeepSeaSelectPerson}
                onSelectSong={handleDeepSeaSelectSong}
                onCancelPersonSelection={handleDeepSeaCancelPerson}
                isHintMode={isHintMode}
                isLoading={isDeepSeaLoading}
                visitedSongIds={deepSeaVisitedSongIds}
              />
            </>
          ) : null
        ) : (
          /* ======================================================== */
          /* [모드 1: 오늘의 디깅 & 자유 연습 모드 화면]               */
          /* ======================================================== */
          isQuestLoading || !quest || !currentSong ? (
            <div className="h-96 flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold">음악 그래프 로딩 중...</p>
            </div>
          ) : (
            <>
              <QuestStatusBar
                startSong={quest.startSong}
                targetSong={quest.targetSong}
                turnCount={turnCount}
                optimalTurns={quest.optimalTurns}
                canBacktrack={canBacktrack}
                onBacktrack={handleBacktrack}
                gameMode={gameMode}
              />

              <CurrentSongCard currentSong={currentSong} historyStack={historyStack} />

              {isHardcore ? (
                <HardcoreInput currentSong={currentSong} onSelectSong={handleSelectSong} />
              ) : (
                <TurnCardView
                  currentSongTitle={currentSong.title}
                  connectedPersons={connectedPersons}
                  connectedSongs={connectedSongs}
                  selectedPerson={selectedPerson}
                  onSelectPerson={handleSelectPerson}
                  onSelectSong={handleSelectSong}
                  onCancelPersonSelection={handleCancelPersonSelection}
                  isLoading={isGraphLoading}
                  isHintMode={isHintMode}
                />
              )}
            </>
          )
        )}
      </main>

      {/* 모드 1 클리어 모달 */}
      {quest && currentSong && (
        <ClearModal
          isOpen={isClearModalOpen}
          onClose={() => setIsClearModalOpen(false)}
          questId={quest.questId}
          startSong={quest.startSong}
          targetSong={quest.targetSong}
          turnCount={turnCount}
          optimalTurns={quest.optimalTurns}
          historyStack={historyStack}
          onSwitchToPractice={() => {
            setIsClearModalOpen(false);
            setGameMode("practice");
            setIsPracticeModalOpen(true);
          }}
          onShowToast={showToast}
          onOpenStats={() => handleOpenStats("daily")}
        />
      )}

      {/* 모드 1 자유 연습 모드 런처 모달 */}
      <PracticeLauncherModal
        isOpen={isPracticeModalOpen}
        onClose={() => setIsPracticeModalOpen(false)}
        onSelectQuest={handleLaunchPracticeQuest}
        onShowToast={showToast}
      />

      {/* 모드 2 심해 디깅 결과 및 멜론 플레이리스트 모달 */}
      <DeepSeaResultModal
        isOpen={isDeepSeaResultOpen}
        onClose={() => setIsDeepSeaResultOpen(false)}
        finalDepth={deepSeaDepth}
        diveHistory={deepSeaDiveHistory}
        onRestartDive={() => {
          setIsDeepSeaResultOpen(false);
          initDeepSea();
        }}
        onShowToast={showToast}
        onOpenStats={() => handleOpenStats("deepsea")}
      />

      {/* 전적 및 백업/복원 대시보드 모달 */}
      <StatsModal
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        initialTab={statsModalInitialTab}
        todayQuestId={quest?.questId}
        currentStats={latestStats}
        onShowToast={showToast}
      />

      {/* 전역 토스트 알림 */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
