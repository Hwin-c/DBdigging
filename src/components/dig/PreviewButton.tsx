"use client";
import clsx from "clsx";
import { ExternalLink, Loader2, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { findPreview, player, type PlayerState, type PreviewResult } from "@/lib/preview";

export function usePlayerState(): PlayerState {
  const [s, setS] = useState<PlayerState>(player.state);
  useEffect(() => player.subscribe(setS), []);
  return s;
}

/**
 * 미리듣기 버튼. 누를 때마다 미리듣기 URL을 새로 받아 재생한다 (Deezer URL은 만료되므로 저장하지 않음).
 */
export function PreviewButton({
  pkey,
  isrc,
  title,
  artist,
  size = "md",
}: {
  pkey: string;
  isrc?: string;
  title: string;
  artist: string;
  size?: "sm" | "md";
}) {
  const s = usePlayerState();
  const mine = s.key === pkey;
  const [result, setResult] = useState<PreviewResult | null | undefined>(undefined);

  // 다른 곡으로 바뀌면 안내 초기화
  useEffect(() => setResult(undefined), [pkey]);

  const onClick = async () => {
    if (mine && (s.status === "playing" || s.status === "paused")) {
      player.toggle(pkey);
      return;
    }
    const r = await player.play(pkey, () => findPreview({ isrc, title, artist }));
    setResult(r);
  };

  const loading = mine && s.status === "loading";
  const playing = mine && s.status === "playing";
  const none = result === null && !loading;

  return (
    <div className={clsx("flex flex-wrap items-center gap-2", size === "sm" && "gap-1.5")}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-label={playing ? `${title} 미리듣기 일시정지` : `${title} 미리듣기`}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full border font-medium",
          size === "md" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-xs",
          playing
            ? "border-emerald-600 bg-emerald-950/60 text-emerald-200"
            : "border-slate-600 text-slate-200 hover:border-slate-400",
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        {loading ? "불러오는 중" : playing ? "일시정지" : "미리듣기"}
      </button>
      {none && <span className="text-xs text-slate-500">미리듣기 없음</span>}
      {result && result.link && (
        <a
          href={result.link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
        >
          {result.source === "deezer" ? "Deezer" : "Apple Music"}에서 열기
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
