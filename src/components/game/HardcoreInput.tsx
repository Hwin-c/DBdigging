"use client";

import React, { useState } from "react";
import { ConnectedPerson, ConnectedSong, SongInfo } from "@/lib/graph/types";
import { clientApi } from "@/lib/game/clientApi";
import { RoleBadgeList } from "@/components/common/Badge";
import { Flame, Undo2, Send, AlertCircle, HelpCircle, CheckCircle2 } from "lucide-react";

interface HardcoreInputProps {
  currentSong: SongInfo;
  onSelectSong: (song: ConnectedSong, viaPerson: ConnectedPerson) => void;
}

export function HardcoreInput({ currentSong, onSelectSong }: HardcoreInputProps) {
  const [step, setStep] = useState<"PERSON" | "SONG">("PERSON");
  const [selectedPerson, setSelectedPerson] = useState<ConnectedPerson | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "error" | "info" | "success"; message: string } | null>(null);

  // Ambiguity Modal State
  const [ambiguousCandidates, setAmbiguousCandidates] = useState<(ConnectedPerson | ConnectedSong)[]>([]);
  const [isAmbiguityModalOpen, setIsAmbiguityModalOpen] = useState(false);

  // Step 1 -> Step 2 or Step 2 -> Next Song Submission
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputValue.trim();
    if (!query) return;

    setIsLoading(true);
    setFeedback(null);

    try {
      if (step === "PERSON") {
        // ----------------------------------------------------
        // Step 1: 인물/그룹 판정
        // ----------------------------------------------------
        const data = await clientApi.search(query, {
          currentNodeId: currentSong.id,
          targetType: "person"
        });

        if (data.hardcoreMatch && data.hardcoreMatch.isMatched) {
          if (data.hardcoreMatch.isAmbiguous && data.hardcoreMatch.matchedNodes?.length > 1) {
            // 동일 그룹 복수 멤버 등 복수 후보 감지 -> 팝업 모달
            setAmbiguousCandidates(data.hardcoreMatch.matchedNodes);
            setIsAmbiguityModalOpen(true);
          } else {
            // 단일 후보 매칭 성공
            const person = data.hardcoreMatch.matchedNode as ConnectedPerson;
            setSelectedPerson(person);
            setStep("SONG");
            setInputValue("");
            setFeedback({
              type: "success",
              message: `✓ '${person.name}' 확인! 이제 다음 참여곡을 입력하세요.`
            });
          }
        } else {
          setFeedback({
            type: "error",
            message: `❌ 현재 곡에 '${query}'(으)로 등록된 인물/그룹을 찾을 수 없습니다.`
          });
        }
      } else if (step === "SONG" && selectedPerson) {
        // ----------------------------------------------------
        // Step 2: 다음 곡 판정
        // ----------------------------------------------------
        const data = await clientApi.search(query, {
          currentNodeId: selectedPerson.id,
          targetType: "song"
        });

        if (data.hardcoreMatch && data.hardcoreMatch.isMatched) {
          if (data.hardcoreMatch.isAmbiguous && data.hardcoreMatch.matchedNodes?.length > 1) {
            // 동명이곡 등 복수 후보 감지 -> 팝업 모달
            setAmbiguousCandidates(data.hardcoreMatch.matchedNodes);
            setIsAmbiguityModalOpen(true);
          } else {
            // 단일 곡 매칭 성공 -> 다음 턴으로 전이
            const nextSong = data.hardcoreMatch.matchedNode as ConnectedSong;
            onSelectSong(nextSong, selectedPerson);
            // 상태 리셋
            setStep("PERSON");
            setSelectedPerson(null);
            setInputValue("");
            setFeedback(null);
          }
        } else {
          setFeedback({
            type: "error",
            message: `❌ '${selectedPerson.name}'의 참여곡 중 '${query}'을(를) 찾을 수 없습니다.`
          });
        }
      }
    } catch (err: any) {
      console.error("[HardcoreInput] Error:", err);
      setFeedback({ type: "error", message: "네트워크 오류가 발생했습니다. 다시 시도해 주세요." });
    } finally {
      setIsLoading(false);
    }
  };

  // Ambiguity Modal 후보 선택
  const handleSelectAmbiguousCandidate = (candidate: ConnectedPerson | ConnectedSong) => {
    setIsAmbiguityModalOpen(false);
    setAmbiguousCandidates([]);

    if (step === "PERSON") {
      const person = candidate as ConnectedPerson;
      setSelectedPerson(person);
      setStep("SONG");
      setInputValue("");
      setFeedback({
        type: "success",
        message: `✓ '${person.name}' 선택 완료! 이제 다음 참여곡을 입력하세요.`
      });
    } else if (step === "SONG" && selectedPerson) {
      const nextSong = candidate as ConnectedSong;
      onSelectSong(nextSong, selectedPerson);
      // 상태 리셋
      setStep("PERSON");
      setSelectedPerson(null);
      setInputValue("");
      setFeedback(null);
    }
  };

  // 인물 다시 입력 (Step 2 -> Step 1)
  const handleCancelPerson = () => {
    setStep("PERSON");
    setSelectedPerson(null);
    setInputValue("");
    setFeedback(null);
  };

  return (
    <div className="w-full bg-gradient-to-b from-rose-950/20 via-slate-900/90 to-slate-900/90 border border-rose-500/40 rounded-2xl p-5 shadow-[0_4px_25px_rgba(244,63,94,0.15)] backdrop-blur-md relative">
      {/* Header Banner */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-rose-900/40">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-400">
            <Flame className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-black text-rose-200 uppercase tracking-wide">
              하드코어 주관식 디깅 모드
            </h3>
            <p className="text-[11px] text-rose-300/70">
              선택지 없이 오직 당신의 K-Pop 뇌지컬로 직접 타이핑하여 연결하세요
            </p>
          </div>
        </div>

        {/* Step 2 상태일 때 상단 고정 인물 다시 입력 버튼 */}
        {step === "SONG" && selectedPerson && (
          <button
            onClick={handleCancelPerson}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-200 border border-rose-500/30 text-xs font-bold active:scale-95 transition-all shadow-sm"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>↩️ 인물 다시 입력</span>
          </button>
        )}
      </div>

      {/* Step Info & Input Form */}
      <div className="space-y-4">
        {/* Step Guide Banner */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 font-black text-sm flex items-center justify-center shrink-0">
            {step === "PERSON" ? "1" : "2"}
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold text-white">
              {step === "PERSON" ? (
                <span>Step 1: 현재 곡에 참여한 인물 / 작사가 / 작곡가 / 그룹명 입력</span>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span>Step 2:</span>
                  <span className="text-rose-300 font-extrabold underline underline-offset-2">
                    {selectedPerson?.name}
                  </span>
                  <span>이(가) 참여한 다음 곡명 입력</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {step === "PERSON"
                ? "예: 본명, 활동명, 또는 소속 그룹명을 타이핑하세요 (자동 별칭 판정 지원)"
                : "예: 순수 곡 제목 또는 '제목 가수' 형태로 타이핑하세요"}
            </p>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                step === "PERSON"
                  ? "참여 인물 또는 그룹명 타이핑 후 Enter..."
                  : `${selectedPerson?.name}의 다음 곡명 타이핑 후 Enter...`
              }
              disabled={isLoading}
              autoFocus
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 text-white font-bold text-xs sm:text-sm flex items-center gap-2 hover:from-rose-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>제출</span>
                <Send className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Feedback Message */}
        {feedback && (
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${
              feedback.type === "error"
                ? "bg-rose-950/60 border border-rose-500/40 text-rose-300"
                : "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300"
            }`}
          >
            {feedback.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. 복수 후보 Ambiguity 모달 (동일 그룹 멤버 / 동명이곡)     */}
      {/* ======================================================== */}
      {isAmbiguityModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/50 rounded-2xl p-5 max-w-md w-full shadow-[0_0_30px_rgba(244,63,94,0.3)] space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 text-rose-400">
              <HelpCircle className="w-5 h-5 shrink-0" />
              <h4 className="font-bold text-sm text-white">복수 후보 감지 (선택 필요)</h4>
            </div>

            <p className="text-xs text-slate-300">
              입력하신 <strong>'{inputValue}'</strong>에 해당하는 대상이 여러 개 있습니다. 이동하고자
              하는 대상을 선택해 주세요:
            </p>

            <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
              {ambiguousCandidates.map((cand: any) => {
                const isPerson = step === "PERSON";
                const title = isPerson ? cand.name : cand.title;
                const subtitle = isPerson
                  ? cand.isGroup
                    ? "그룹 노드"
                    : "개인 창작자/가창자"
                  : `${cand.artist} • ${cand.year}년`;

                return (
                  <button
                    key={cand.id}
                    onClick={() => handleSelectAmbiguousCandidate(cand)}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-rose-400 hover:bg-rose-950/30 text-left transition-all group"
                  >
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-rose-300">
                        {title}
                      </div>
                      <div className="text-[11px] text-slate-400">{subtitle}</div>
                    </div>

                    <div className="shrink-0">
                      <RoleBadgeList roles={cand.roles ?? []} size="sm" />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setIsAmbiguityModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
