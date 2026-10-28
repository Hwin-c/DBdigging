"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { ExplorationTreeMap, ExplorationNode } from "@/components/game/ExplorationTreeMap";
import { DeepSeaStatusBar } from "@/components/deepsea/DeepSeaStatusBar";
import { DeepSeaSonarMap } from "@/components/deepsea/DeepSeaSonarMap";
import { DeepSeaTurnView } from "@/components/deepsea/DeepSeaTurnView";
import { DeepSeaResultModal, DiveHistoryStep } from "@/components/deepsea/DeepSeaResultModal";
import { GiveUpModal } from "@/components/game/GiveUpModal";
import { TutorialModal } from "@/components/common/TutorialModal";
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
  // [모드 1-A: 오늘의 디깅 세션 상태 (완전 격리)]
  // ====================================================
  const [dailyQuest, setDailyQuest] = useState<QuestPayload | null>(null);
  const [dailyCurrentSong, setDailyCurrentSong] = useState<SongInfo | null>(null);
  const [dailyHistoryStack, setDailyHistoryStack] = useState<HistoryStep[]>([]);
  const [dailyTree, setDailyTree] = useState<ExplorationNode[]>([]);
  const [dailyCurrentNodeId, setDailyCurrentNodeId] = useState<string>("");
  const [dailySelectedPerson, setDailySelectedPerson] = useState<ConnectedPerson | null>(null);
  const [dailyConnectedPersons, setDailyConnectedPersons] = useState<ConnectedPerson[]>([]);
  const [dailyConnectedSongs, setDailyConnectedSongs] = useState<ConnectedSong[]>([]);

  // ====================================================
  // [모드 1-B: 자유 연습 세션 상태 (완전 격리)]
  // ====================================================
  const [practiceQuest, setPracticeQuest] = useState<QuestPayload | null>(null);
  const [practiceCurrentSong, setPracticeCurrentSong] = useState<SongInfo | null>(null);
  const [practiceHistoryStack, setPracticeHistoryStack] = useState<HistoryStep[]>([]);
  const [practiceTree, setPracticeTree] = useState<ExplorationNode[]>([]);
  const [practiceCurrentNodeId, setPracticeCurrentNodeId] = useState<string>("");
  const [practiceSelectedPerson, setPracticeSelectedPerson] = useState<ConnectedPerson | null>(null);
  const [practiceConnectedPersons, setPracticeConnectedPersons] = useState<ConnectedPerson[]>([]);
  const [practiceConnectedSongs, setPracticeConnectedSongs] = useState<ConnectedSong[]>([]);

  // ====================================================
  // [활성 세션 매핑 파생 변수]
  // ====================================================
  const isPractice = gameMode === "practice";
  const quest = isPractice ? practiceQuest : dailyQuest;
  const currentSong = isPractice ? practiceCurrentSong : dailyCurrentSong;
  const historyStack = isPractice ? practiceHistoryStack : dailyHistoryStack;
  const explorationTree = isPractice ? practiceTree : dailyTree;
  const currentNodeId = isPractice ? practiceCurrentNodeId : dailyCurrentNodeId;
  const selectedPerson = isPractice ? practiceSelectedPerson : dailySelectedPerson;
  const connectedPersons = isPractice ? practiceConnectedPersons : dailyConnectedPersons;
  const connectedSongs = isPractice ? practiceConnectedSongs : dailyConnectedSongs;

  const visitedSongIds = useMemo(() => {
    return historyStack.map((h) => h.song.id);
  }, [historyStack]);

  // 모드 1 UI 토글
  const [isHintMode, setIsHintMode] = useState<boolean>(false);
  const [isHardcore, setIsHardcore] = useState<boolean>(false);
  const [isQuestLoading, setIsQuestLoading] = useState<boolean>(true);
  const [isGraphLoading, setIsGraphLoading] = useState<boolean>(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState<boolean>(false);
  const [isPracticeModalOpen, setIsPracticeModalOpen] = useState<boolean>(false);
  const [isGiveUpModalOpen, setIsGiveUpModalOpen] = useState<boolean>(false);
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState<boolean>(false);

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

  // 모드별 전적 모달 오픈 핸들러
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
  // [모드 1] 데일리 퀘스트 로드 & 초기 탐험 트리 생성
  // ----------------------------------------------------
  const loadDailyQuest = useCallback(async () => {
    setIsQuestLoading(true);
    try {
      const data: QuestPayload = await clientApi.getDailyQuest();
      const rootNodeId = `node_${data.startSong.id}_0_${Date.now()}`;
      const rootNode: ExplorationNode = {
        nodeId: rootNodeId,
        songId: data.startSong.id,
        song: data.startSong,
        depth: 0,
        childrenNodeIds: [],
        isCurrent: true,
        isStart: true
      };

      setDailyQuest(data);
      setDailyCurrentSong(data.startSong);
      setDailyHistoryStack([{ song: data.startSong }]);
      setDailyTree([rootNode]);
      setDailyCurrentNodeId(rootNodeId);
      setDailySelectedPerson(null);
      setDailyConnectedSongs([]);
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
  // [초기화] 인메모리 그래프 번들 로드 & 튜토리얼 1회 팝업
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

          // 최초 방문자 튜토리얼 자동 노출 검사
          if (typeof window !== "undefined") {
            const tutorialSeen = localStorage.getItem("dbdigging_tutorial_seen");
            if (!tutorialSeen) {
              setIsTutorialModalOpen(true);
            }
          }
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
        if (isPractice) {
          setPracticeConnectedPersons(data.connectedPersons || []);
        } else {
          setDailyConnectedPersons(data.connectedPersons || []);
        }
      } catch (err) {
        console.error("[fetchConnectedPersons] Error:", err);
        showToast("인물 목록을 불러오지 못했습니다.", "error");
      } finally {
        setIsGraphLoading(false);
      }
    },
    [isHintMode, quest, isPractice, showToast]
  );

  useEffect(() => {
    if (isEngineReady && gameMode !== "deepsea" && currentSong && !selectedPerson && !isHardcore) {
      fetchConnectedPersons(currentSong.id);
    }
  }, [isEngineReady, gameMode, currentSong, selectedPerson, isHintMode, isHardcore, fetchConnectedPersons]);

  // [모드 1] 인물 선택 -> 곡 조회 (currentSongId 제외 및 역방향 BFS 힌트 결합)
  const handleSelectPerson = async (person: ConnectedPerson) => {
    if (isPractice) {
      setPracticeSelectedPerson(person);
    } else {
      setDailySelectedPerson(person);
    }

    setIsGraphLoading(true);
    try {
      const data = await clientApi.inspectGraph({
        personId: person.id,
        currentSongId: currentSong?.id,
        targetSongId: isHintMode && quest ? quest.targetSong.id : undefined
      });

      if (isPractice) {
        setPracticeConnectedSongs(data.connectedSongs || []);
      } else {
        setDailyConnectedSongs(data.connectedSongs || []);
      }
    } catch (err) {
      console.error("[handleSelectPerson] Error:", err);
      showToast("참여 곡 목록을 불러오지 못했습니다.", "error");
    } finally {
      setIsGraphLoading(false);
    }
  };

  const handleCancelPersonSelection = () => {
    if (isPractice) {
      setPracticeSelectedPerson(null);
      setPracticeConnectedSongs([]);
    } else {
      setDailySelectedPerson(null);
      setDailyConnectedSongs([]);
    }
  };

  // [모드 1] 곡 선택 -> 트리 맵 분기(Branching) & 턴 전이
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
    const nextDepth = nextHistory.length - 1;
    const nextNodeId = `node_${nextSong.id}_${nextDepth}_${Date.now()}`;

    // 실시간 탐험 트리 업데이트 (기존 가지는 보존하고 새 노드 추가)
    const nextNode: ExplorationNode = {
      nodeId: nextNodeId,
      songId: nextSong.id,
      song: nextSong,
      depth: nextDepth,
      parentNodeId: currentNodeId,
      viaPerson: {
        id: viaPerson.id,
        name: viaPerson.name,
        roles: viaPerson.roles ?? [],
        roleLabels: viaPerson.roleLabels ?? []
      },
      childrenNodeIds: [],
      isCurrent: true,
      isStart: false,
      isTarget: nextSong.id === quest.targetSong.id
    };

    const updatedTree = explorationTree.map((n) =>
      n.nodeId === currentNodeId
        ? { ...n, isCurrent: false, childrenNodeIds: [...n.childrenNodeIds, nextNodeId] }
        : { ...n, isCurrent: false }
    );
    updatedTree.push(nextNode);

    if (isPractice) {
      setPracticeHistoryStack(nextHistory);
      setPracticeCurrentSong(nextSong);
      setPracticeTree(updatedTree);
      setPracticeCurrentNodeId(nextNodeId);
      setPracticeSelectedPerson(null);
      setPracticeConnectedSongs([]);
    } else {
      setDailyHistoryStack(nextHistory);
      setDailyCurrentSong(nextSong);
      setDailyTree(updatedTree);
      setDailyCurrentNodeId(nextNodeId);
      setDailySelectedPerson(null);
      setDailyConnectedSongs([]);
    }

    // [전적] 데일리 모드 첫 턴 이동 시 도전 횟수 1회 기록
    if (gameMode === "daily" && quest && historyStack.length === 1) {
      const updated = recordDailyAttempt(quest.questId);
      setLatestStats(updated);
    }

    // 도착 목표 곡 도달 판정
    if (nextSong.id === quest.targetSong.id) {
      setIsClearModalOpen(true);
      showToast("🎉 축하합니다! 목적지 곡에 도달했습니다!", "success");

      if (gameMode === "daily") {
        const updated = recordDailyClear(quest.questId, nextHistory.length - 1);
        setLatestStats(updated);
      } else if (gameMode === "practice") {
        const updated = recordPracticeClear();
        setLatestStats(updated);
      }
    }
  };

  // [모드 1] 탐험 트리 맵 상의 과거 노드 클릭 -> 부모 체인 역추적 백트래킹
  const handleSelectTreeNode = (targetNode: ExplorationNode) => {
    if (!quest) return;
    if (targetNode.nodeId === currentNodeId) return;

    // targetNode에서 root까지 parentNodeId 체인 역추적
    const nodeMap = new Map<string, ExplorationNode>();
    explorationTree.forEach((n) => nodeMap.set(n.nodeId, n));

    const chain: ExplorationNode[] = [];
    let curr: ExplorationNode | undefined = targetNode;
    while (curr) {
      chain.push(curr);
      curr = curr.parentNodeId ? nodeMap.get(curr.parentNodeId) : undefined;
    }
    chain.reverse(); // root -> targetNode

    const reconstructedHistory: HistoryStep[] = chain.map((n) => ({
      song: n.song,
      viaPerson: n.viaPerson
    }));

    const updatedTree = explorationTree.map((n) => ({
      ...n,
      isCurrent: n.nodeId === targetNode.nodeId
    }));

    if (isPractice) {
      setPracticeHistoryStack(reconstructedHistory);
      setPracticeCurrentSong(targetNode.song);
      setPracticeTree(updatedTree);
      setPracticeCurrentNodeId(targetNode.nodeId);
      setPracticeSelectedPerson(null);
      setPracticeConnectedSongs([]);
    } else {
      setDailyHistoryStack(reconstructedHistory);
      setDailyCurrentSong(targetNode.song);
      setDailyTree(updatedTree);
      setDailyCurrentNodeId(targetNode.nodeId);
      setDailySelectedPerson(null);
      setDailyConnectedSongs([]);
    }

    showToast(`'${targetNode.song.title}'(으)로 되돌아갔습니다. (턴 조정)`, "info");
  };

  // [모드 1] 버튼 백트래킹 (1턴 직전 곡으로)
  const handleBacktrack = () => {
    if (historyStack.length <= 1) return;

    const newStack = historyStack.slice(0, -1);
    const prevStep = newStack[newStack.length - 1];

    // 트리 상에서 부모 노드 활성화
    const currentNode = explorationTree.find((n) => n.nodeId === currentNodeId);
    const parentNodeId = currentNode?.parentNodeId;

    const updatedTree = explorationTree.map((n) => ({
      ...n,
      isCurrent: parentNodeId ? n.nodeId === parentNodeId : n.depth === newStack.length - 1
    }));

    const nextCurrentNodeId = parentNodeId || (updatedTree.find((n) => n.isCurrent)?.nodeId ?? "");

    if (isPractice) {
      setPracticeHistoryStack(newStack);
      setPracticeCurrentSong(prevStep.song);
      setPracticeTree(updatedTree);
      setPracticeCurrentNodeId(nextCurrentNodeId);
      setPracticeSelectedPerson(null);
      setPracticeConnectedSongs([]);
    } else {
      setDailyHistoryStack(newStack);
      setDailyCurrentSong(prevStep.song);
      setDailyTree(updatedTree);
      setDailyCurrentNodeId(nextCurrentNodeId);
      setDailySelectedPerson(null);
      setDailyConnectedSongs([]);
    }

    showToast(`'${prevStep.song.title}'(으)로 되돌아갔습니다. (턴 차감)`, "info");
  };

  // [모드 1] 연습 모드 런처 (실제 새 퀘스트 시작 시에만 practice 전환)
  const handleLaunchPracticeQuest = (newQuest: QuestPayload) => {
    const rootNodeId = `node_${newQuest.startSong.id}_0_${Date.now()}`;
    const rootNode: ExplorationNode = {
      nodeId: rootNodeId,
      songId: newQuest.startSong.id,
      song: newQuest.startSong,
      depth: 0,
      childrenNodeIds: [],
      isCurrent: true,
      isStart: true
    };

    setPracticeQuest(newQuest);
    setPracticeCurrentSong(newQuest.startSong);
    setPracticeHistoryStack([{ song: newQuest.startSong }]);
    setPracticeTree([rootNode]);
    setPracticeCurrentNodeId(rootNodeId);
    setPracticeSelectedPerson(null);
    setPracticeConnectedSongs([]);
    setIsClearModalOpen(false);
    setIsPracticeModalOpen(false);
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

        // 1. 초기 미션 발급
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

  // [모드 2] 인물 선택
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

  // [모드 2] 곡 선택 -> 수심 전이
  const handleDeepSeaSelectSong = async (song: ConnectedSong, viaPerson: ConnectedPerson) => {
    if (!deepSeaCurrentSong || !deepSeaMission) return;

    setIsDeepSeaLoading(true);
    try {
      const nextExclude = [...deepSeaVisitedSongIds, song.id];

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

      if (nextLives <= 0) {
        setIsDeepSeaResultOpen(true);
        showToast("산소 고갈! 다이빙이 종료되었습니다.", "info");

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

  // 모드 전환 핸들러 (연습 모드 클릭 시 세션 오염 없이 모달만 오픈)
  const handleSelectGameMode = (mode: "daily" | "practice" | "deepsea") => {
    if (mode === "daily") {
      setGameMode("daily");
      if (!dailyQuest) {
        loadDailyQuest();
      }
    } else if (mode === "practice") {
      setIsPracticeModalOpen(true);
    } else if (mode === "deepsea") {
      setGameMode("deepsea");
      initDeepSea();
    }
  };

  const turnCount = Math.max(0, historyStack.length - 1);
  const canBacktrack = historyStack.length > 1;

  // 엔진 로딩 스크린
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
        onOpenTutorial={() => setIsTutorialModalOpen(true)}
      />

      {/* 2. 메인 컨텐츠 영역 (PC 2-Column & 모바일 반응형 뷰포트) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5">
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
            <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start">
              {/* 좌측 패널 (lg: 5컬럼) - 상태바 + 수직 잠수 소나 맵 + 현재 곡 */}
              <div className="lg:col-span-5 space-y-4">
                <DeepSeaStatusBar
                  depth={deepSeaDepth}
                  lives={deepSeaLives}
                  currentMission={deepSeaMission}
                  currentSong={deepSeaCurrentSong}
                  onSurface={handleDeepSeaSurface}
                />

                <DeepSeaSonarMap
                  diveHistory={deepSeaDiveHistory}
                  currentDepth={deepSeaDepth}
                  lives={deepSeaLives}
                />

                <CurrentSongCard
                  currentSong={deepSeaCurrentSong}
                  historyStack={deepSeaDiveHistory.map((d) => ({
                    song: d.song,
                    viaPerson: d.viaPerson
                  }))}
                />
              </div>

              {/* 우측 패널 (lg: 7컬럼) - 심해 턴 콘솔 (역할 탭 + 8카드) */}
              <div className="lg:col-span-7 mt-4 lg:mt-0">
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
              </div>
            </div>
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
            <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start">
              {/* 좌측 패널 (lg: 5컬럼) - 상태바 + 미지 탐험 트리 맵 + 현재 곡 */}
              <div className="lg:col-span-5 space-y-4">
                <QuestStatusBar
                  startSong={quest.startSong}
                  targetSong={quest.targetSong}
                  turnCount={turnCount}
                  optimalTurns={quest.optimalTurns}
                  canBacktrack={canBacktrack}
                  onBacktrack={handleBacktrack}
                  onGiveUp={() => setIsGiveUpModalOpen(true)}
                  gameMode={gameMode}
                />

                <ExplorationTreeMap
                  tree={explorationTree}
                  currentNodeId={currentNodeId}
                  targetSong={quest.targetSong}
                  onSelectNode={handleSelectTreeNode}
                />

                <CurrentSongCard currentSong={currentSong} historyStack={historyStack} />
              </div>

              {/* 우측 패널 (lg: 7컬럼) - 턴 조작 콘솔 */}
              <div className="lg:col-span-7 mt-4 lg:mt-0">
                {isHardcore ? (
                  <HardcoreInput currentSong={currentSong} onSelectSong={handleSelectSong} />
                ) : (
                  <TurnCardView
                    currentSongTitle={currentSong.title}
                    currentSongId={currentSong.id}
                    connectedPersons={connectedPersons}
                    connectedSongs={connectedSongs}
                    selectedPerson={selectedPerson}
                    onSelectPerson={handleSelectPerson}
                    onSelectSong={handleSelectSong}
                    onCancelPersonSelection={handleCancelPersonSelection}
                    isLoading={isGraphLoading}
                    isHintMode={isHintMode}
                    visitedSongIds={visitedSongIds}
                  />
                )}
              </div>
            </div>
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
            setIsPracticeModalOpen(true);
          }}
          onShowToast={showToast}
          onOpenStats={() => handleOpenStats("daily")}
        />
      )}

      {/* 모드 1 포기 및 정답 보기 모달 */}
      {quest && (
        <GiveUpModal
          isOpen={isGiveUpModalOpen}
          onClose={() => setIsGiveUpModalOpen(false)}
          startSong={quest.startSong}
          targetSong={quest.targetSong}
          onRestart={loadDailyQuest}
          onSwitchToPractice={() => {
            setIsGiveUpModalOpen(false);
            setIsPracticeModalOpen(true);
          }}
        />
      )}

      {/* 4단계 탭형 게임 가이드 모달 */}
      <TutorialModal
        isOpen={isTutorialModalOpen}
        onClose={() => setIsTutorialModalOpen(false)}
      />

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
