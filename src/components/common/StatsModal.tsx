"use client";

import React, { useState, useEffect } from "react";
import {
  getUserStats,
  exportBackupCode,
  importBackupCode,
  resetUserStats,
  UserStatsPayload
} from "@/lib/storage/stats";
import {
  X,
  Trophy,
  Flame,
  Award,
  Calendar,
  Anchor,
  Waves,
  Copy,
  Check,
  Download,
  AlertTriangle,
  RotateCcw,
  ExternalLink,
  Sparkles,
  BarChart3
} from "lucide-react";

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "daily" | "deepsea" | "backup";
  todayQuestId?: string;
  onShowToast?: (message: string, type?: "success" | "error" | "info") => void;
  currentStats?: UserStatsPayload | null;
}

export function StatsModal({
  isOpen,
  onClose,
  initialTab = "daily",
  todayQuestId,
  onShowToast,
  currentStats
}: StatsModalProps) {
  const [activeTab, setActiveTab] = useState<"daily" | "deepsea" | "backup">(initialTab);
  const [stats, setStats] = useState<UserStatsPayload | null>(null);
  const [backupCode, setBackupCode] = useState<string>("");
  const [importCodeInput, setImportCodeInput] = useState<string>("");
  const [isCopied, setIsCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // 모달 오픈 시 최신 전적 로드 및 백업 코드 갱신
  useEffect(() => {
    if (isOpen) {
      const current = currentStats || getUserStats();
      setStats(current);
      setBackupCode(exportBackupCode(current));
      setImportCodeInput("");
      setImportError(null);
      setIsCopied(false);
      setIsResetConfirmOpen(false);
      if (initialTab) {
        setActiveTab(initialTab);
      }
    }
  }, [isOpen, initialTab, currentStats]);

  if (!isOpen || !stats) return null;

  // 백업 코드 클립보드 복사
  const handleCopyBackupCode = async () => {
    try {
      await navigator.clipboard.writeText(backupCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onShowToast?.("전적 백업 코드가 클립보드에 복사되었습니다! 📋", "success");
    } catch {
      onShowToast?.("클립보드 복사에 실패했습니다.", "error");
    }
  };

  // 백업 코드 복원 실행
  const handleImportBackup = () => {
    if (!importCodeInput.trim()) {
      setImportError("백업 코드를 입력해주세요.");
      return;
    }

    const result = importBackupCode(importCodeInput.trim());
    if (result.success && result.stats) {
      setStats(result.stats);
      setBackupCode(exportBackupCode(result.stats));
      setImportCodeInput("");
      setImportError(null);
      onShowToast?.("전적이 성공적으로 복원되었습니다! 🎉", "success");
    } else {
      setImportError(result.error || "올바르지 않은 백업 코드입니다.");
      onShowToast?.(result.error || "전적 복원에 실패했습니다.", "error");
    }
  };

  // 전적 전체 초기화
  const handleResetStats = () => {
    const defaults = resetUserStats();
    setStats(defaults);
    setBackupCode(exportBackupCode(defaults));
    setIsResetConfirmOpen(false);
    onShowToast?.("모든 전적이 초기화되었습니다.", "info");
  };

  // 턴 수 분포 막대 계산
  const turnDist = stats.daily.turnDistribution;
  const maxTurnCount = Math.max(1, ...Object.values(turnDist));

  const isTodayCleared = Boolean(
    todayQuestId && stats.daily.lastClearedQuestId === todayQuestId
  );
  const isTodayAttempted = Boolean(
    todayQuestId && stats.daily.lastAttemptedQuestId === todayQuestId
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-amber-500/20 to-cyan-500/20 rounded-xl border border-amber-500/30">
              <BarChart3 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">디비디깅 내 전적</h2>
              <p className="text-xs text-slate-400">무로그인 로컬 기록 & 클라우드 백업</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab("daily")}
            className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${
              activeTab === "daily"
                ? "border-amber-400 text-amber-300 bg-amber-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🎵 오늘의 디깅</span>
            {stats.daily.currentStreak > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
                🔥 {stats.daily.currentStreak}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("deepsea")}
            className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${
              activeTab === "deepsea"
                ? "border-cyan-400 text-cyan-300 bg-cyan-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🌊 심해 디깅</span>
            {stats.deepSea.maxDepth > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/30">
                {stats.deepSea.maxDepth}m
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("backup")}
            className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all ${
              activeTab === "backup"
                ? "border-emerald-400 text-emerald-300 bg-emerald-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>⚙️ 백업 및 복원</span>
          </button>
        </div>

        {/* 탭 본문 (스크롤 영역) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ============================================================= */}
          {/* [탭 1] 오늘의 디깅 전적 */}
          {/* ============================================================= */}
          {activeTab === "daily" && (
            <div className="space-y-6">
              {/* 오늘 디깅 달성 상태 배지 */}
              {todayQuestId && (
                <div
                  className={`flex items-center justify-between p-3.5 rounded-xl border ${
                    isTodayCleared
                      ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                      : isTodayAttempted
                      ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
                      : "bg-slate-800/40 border-slate-700/50 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-semibold">
                      오늘의 퀘스트 ({todayQuestId})
                    </span>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-900/60 border border-current">
                    {isTodayCleared
                      ? "✅ 클리어 완료"
                      : isTodayAttempted
                      ? "⏳ 도전 진행 중"
                      : "🎯 도전 대기 중"}
                  </span>
                </div>
              )}

              {/* 4대 주요 지표 그리드 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-800/50 border border-slate-700/60 rounded-xl text-center">
                  <div className="text-2xl font-black text-white">
                    {stats.daily.played}
                  </div>
                  <div className="text-[11px] font-medium text-slate-400 mt-0.5">
                    총 도전 횟수
                  </div>
                </div>
                <div className="p-3.5 bg-slate-800/50 border border-slate-700/60 rounded-xl text-center">
                  <div className="text-2xl font-black text-emerald-400">
                    {stats.daily.winRate}%
                  </div>
                  <div className="text-[11px] font-medium text-slate-400 mt-0.5">
                    승률 ({stats.daily.cleared}회 성공)
                  </div>
                </div>
                <div className="p-3.5 bg-slate-800/50 border border-slate-700/60 rounded-xl text-center">
                  <div className="flex items-center justify-center gap-1 text-2xl font-black text-amber-400">
                    <Flame className="w-5 h-5 fill-amber-400" />
                    <span>{stats.daily.currentStreak}</span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-400 mt-0.5">
                    현재 연속 스트릭
                  </div>
                </div>
                <div className="p-3.5 bg-slate-800/50 border border-slate-700/60 rounded-xl text-center">
                  <div className="flex items-center justify-center gap-1 text-2xl font-black text-amber-300">
                    <Trophy className="w-5 h-5" />
                    <span>{stats.daily.maxStreak}</span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-400 mt-0.5">
                    역대 최대 스트릭
                  </div>
                </div>
              </div>

              {/* 자유 연습 모드 보조 지표 */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-800/30 border border-slate-800 rounded-xl text-xs">
                <span className="text-slate-400">자유/랜덤 연습 모드 클리어 횟수</span>
                <span className="font-bold text-amber-300">
                  {stats.daily.practiceCleared || 0}회 성공
                </span>
              </div>

              {/* 턴 수 분포 수평 막대 차트 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-300 tracking-wider uppercase">
                    클리어 턴 수 분포
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    총 {stats.daily.cleared}회 기록
                  </span>
                </div>

                <div className="space-y-2 bg-slate-950/40 p-4 rounded-xl border border-slate-800/70">
                  {[1, 2, 3, 4, 5].map((turn) => {
                    const count = turnDist[turn as 1 | 2 | 3 | 4 | 5] || 0;
                    const percent =
                      stats.daily.cleared > 0
                        ? Math.max(8, Math.round((count / maxTurnCount) * 100))
                        : 8;

                    return (
                      <div key={turn} className="flex items-center gap-2 text-xs">
                        <span className="w-10 font-bold text-slate-400 text-right">
                          {turn === 5 ? "5+턴" : `${turn}턴`}
                        </span>
                        <div className="flex-1 bg-slate-800/60 h-6 rounded-md overflow-hidden relative">
                          <div
                            className={`h-full transition-all duration-500 rounded-md flex items-center justify-end px-2 ${
                              count > 0
                                ? "bg-gradient-to-r from-amber-500/80 to-amber-400 font-bold text-slate-950"
                                : "bg-transparent text-slate-500"
                            }`}
                            style={{ width: `${count > 0 ? percent : 8}%` }}
                          >
                            <span className="text-[11px]">{count}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* [탭 2] 심해 디깅 전적 */}
          {/* ============================================================= */}
          {activeTab === "deepsea" && (
            <div className="space-y-6">
              {/* 심해 3대 지표 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-800/50 border border-slate-700/60 rounded-xl text-center">
                  <div className="text-2xl font-black text-cyan-400">
                    {stats.deepSea.totalDives}
                  </div>
                  <div className="text-[11px] font-medium text-slate-400 mt-0.5">
                    총 다이빙 횟수
                  </div>
                </div>
                <div className="p-3.5 bg-slate-800/50 border border-slate-700/60 rounded-xl text-center">
                  <div className="text-2xl font-black text-cyan-300">
                    {stats.deepSea.maxDepth}m
                  </div>
                  <div className="text-[11px] font-medium text-slate-400 mt-0.5">
                    최고 도달 수심
                  </div>
                </div>
                <div className="p-3.5 bg-slate-800/50 border border-slate-700/60 rounded-xl text-center">
                  <div className="text-base font-bold text-amber-300 truncate">
                    {stats.deepSea.bestDiverTitle || "🫧 스노클링"}
                  </div>
                  <div className="text-[11px] font-medium text-slate-400 mt-0.5">
                    최고 다이버 칭호
                  </div>
                </div>
              </div>

              {/* 나의 최고 수심 다이빙 기록 */}
              {stats.deepSea.bestRecord ? (
                <div className="p-4 bg-gradient-to-b from-cyan-950/30 to-slate-900 border border-cyan-500/30 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                        역대 최고 다이빙 기록
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {stats.deepSea.bestRecord.date}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 text-xs font-extrabold bg-cyan-500/20 text-cyan-300 rounded-lg border border-cyan-500/30">
                      수심 {stats.deepSea.bestRecord.depth}m
                    </span>
                    <span className="px-2.5 py-1 text-xs font-bold bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/30">
                      {stats.deepSea.bestRecord.diverTitle}
                    </span>
                  </div>

                  {/* 플레이리스트 미리보기 */}
                  {stats.deepSea.bestRecord.playlist && stats.deepSea.bestRecord.playlist.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] font-semibold text-slate-400">
                        발굴 플레이리스트 ({stats.deepSea.bestRecord.playlist.length}곡)
                      </span>
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                        {stats.deepSea.bestRecord.playlist.map((track, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-slate-950/50 rounded-lg border border-slate-800 text-xs"
                          >
                            <span className="truncate pr-2 text-slate-200">
                              <span className="font-bold text-cyan-400 mr-1.5">{idx + 1}.</span>
                              {track.title} - {track.artist}
                            </span>
                            {track.melonUrl && (
                              <a
                                href={track.melonUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 shrink-0 font-medium"
                              >
                                <span>멜론</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800">
                  <Waves className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">
                    아직 심해 디깅 기록이 없습니다.
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    상단 '심해 디깅' 탭에서 조건부 서바이벌에 도전해보세요!
                  </p>
                </div>
              )}

              {/* 최근 다이빙 기록 */}
              {stats.deepSea.recentRecords && stats.deepSea.recentRecords.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400">최근 다이빙 기록</h4>
                  <div className="space-y-1.5">
                    {stats.deepSea.recentRecords.map((rec, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-slate-800/40 border border-slate-800 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-cyan-400">{rec.depth}m</span>
                          <span className="text-slate-300 font-medium">{rec.diverTitle}</span>
                        </div>
                        <span className="text-[11px] text-slate-500">{rec.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================= */}
          {/* [탭 3] 백업 및 복원 */}
          {/* ============================================================= */}
          {activeTab === "backup" && (
            <div className="space-y-6">
              {/* 내보내기 (백업) */}
              <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      전적 백업 (내보내기)
                    </h3>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-medium">
                    UTF-8 & 체크섬 암호화
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  기기 변경이나 브라우저 초기화 전에 아래 백업 코드를 복사해 안전한 곳에 보관하세요.
                </p>

                <div className="relative">
                  <textarea
                    readOnly
                    value={backupCode}
                    rows={3}
                    className="w-full p-2.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-300 select-all focus:outline-none"
                  />
                  <button
                    onClick={handleCopyBackupCode}
                    className="absolute right-2 bottom-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md transition-all shadow-md active:scale-95"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? "복사 완료!" : "코드 복사"}</span>
                  </button>
                </div>
              </div>

              {/* 가져오기 (복원) */}
              <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      전적 복원 (가져오기)
                    </h3>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  기존에 복사해 둔 'DBD-'로 시작하는 백업 코드를 붙여넣으세요.
                </p>

                <div className="space-y-2">
                  <textarea
                    value={importCodeInput}
                    onChange={(e) => {
                      setImportCodeInput(e.target.value);
                      setImportError(null);
                    }}
                    placeholder="DBD-로 시작하는 전적 백업 코드를 여기에 붙여넣으세요..."
                    rows={3}
                    className="w-full p-2.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                  />

                  {importError && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-950/40 p-2 rounded-lg border border-rose-500/30">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{importError}</span>
                    </div>
                  )}

                  <button
                    onClick={handleImportBackup}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg transition-all shadow-md active:scale-95"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>백업 코드로 전적 복원하기</span>
                  </button>
                </div>
              </div>

              {/* 위험 구역: 전적 초기화 */}
              <div className="p-4 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <h3 className="text-xs font-bold text-rose-300">위험 구역</h3>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  로컬에 저장된 모든 데일리 스트릭과 심해 디깅 기록을 영구 삭제합니다.
                </p>

                {isResetConfirmOpen ? (
                  <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-lg space-y-2">
                    <p className="text-xs font-bold text-rose-200">
                      정말로 모든 전적을 초기화하시겠습니까? 복구할 수 없습니다!
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleResetStats}
                        className="flex-1 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-md transition-colors"
                      >
                        네, 초기화합니다
                      </button>
                      <button
                        onClick={() => setIsResetConfirmOpen(false)}
                        className="flex-1 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsResetConfirmOpen(true)}
                    className="text-xs font-semibold text-rose-400 hover:text-rose-300 hover:underline"
                  >
                    모든 전적 초기화하기
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 하단 닫기 바 */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
