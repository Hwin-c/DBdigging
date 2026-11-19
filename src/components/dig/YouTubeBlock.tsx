"use client";
import { ExternalLink, Play } from "lucide-react";
import { useEffect, useState } from "react";

/** youtube.com/watch?v=, youtu.be/, /embed/, /shorts/, music.youtube.com 링크에서 영상 ID 추출 */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com") {
      id = u.searchParams.get("v");
      const m = u.pathname.match(/^\/(embed|shorts|v|live)\/([^/?#]+)/);
      if (!id && m) id = m[2];
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * YouTube: MusicBrainz url 관계에 영상 링크가 있으면 youtube-nocookie 공식 임베드로 재생만.
 * 없으면 YouTube 검색 링크.
 * 미리듣기와 겹쳐 재생되지 않도록, 플레이어는 사용자가 누를 때 불러온다.
 */
export function YouTubeBlock({
  urls,
  title,
  artist,
  onPlay,
}: {
  urls: string[];
  title: string;
  artist: string;
  onPlay?: () => void;
}) {
  const id = urls.map(youtubeId).find(Boolean) ?? null;
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [id]);
  const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${artist}`)}`;

  return (
    <div className="mt-5">
      <h2 className="mb-2 text-sm font-semibold text-slate-200">영상</h2>
      {id ? (
        open ? (
          <div className="aspect-video w-full overflow-hidden rounded-lg border border-slate-800 bg-black">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
              title={`${title} - YouTube`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              onPlay?.();
              setOpen(true);
            }}
            className="group relative block aspect-video w-full overflow-hidden rounded-lg border border-slate-800 bg-black"
            aria-label={`${title} 영상 재생`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt=""
              className="h-full w-full object-cover opacity-80 group-hover:opacity-100"
              loading="lazy"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-4 py-2 text-sm text-white">
                <Play className="h-4 w-4" /> 영상 재생
              </span>
            </span>
          </button>
        )
      ) : (
        <a
          href={search}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-600 px-3.5 py-1.5 text-sm text-slate-200 hover:border-slate-400"
        >
          YouTube에서 찾기 <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
