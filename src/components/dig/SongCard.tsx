"use client";
import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { isCoreRole, roleOrder, type RecordingDetail } from "@/lib/mb/api";
import { PreviewButton } from "./PreviewButton";
import { Card, RoleChip, SectionTitle, Skeleton } from "./ui";

function fmtLength(ms: number | null): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 역할별 요약: "작곡 A · B · C" (동명이인은 artist.id 기준으로 분리하고 disambiguation으로 구분) */
function roleSummary(d: RecordingDetail): Array<[string, string[]]> {
  const nameCounts = new Map<string, number>();
  for (const c of d.credits) {
    nameCounts.set(c.artist.name, (nameCounts.get(c.artist.name) ?? 0) + 1);
  }
  const labelOf = (c: RecordingDetail["credits"][number]) =>
    (nameCounts.get(c.artist.name) ?? 0) > 1 && c.artist.disambiguation
      ? `${c.artist.name} (${c.artist.disambiguation})`
      : c.artist.name;

  const m = new Map<string, Map<string, string>>();
  for (const c of d.credits) {
    for (const r of c.roles) {
      if (!isCoreRole(r)) continue;
      // 작사·작곡(writer)은 작곡과 작사 양쪽에 모두 보인다
      const targets = r === "작사·작곡" ? ["작곡", "작사"] : [r];
      for (const t of targets) {
        const byId = m.get(t) ?? new Map<string, string>();
        byId.set(c.artist.id, labelOf(c));
        m.set(t, byId);
      }
    }
  }
  return [...m.entries()]
    .map(([k, byId]) => [k, [...byId.values()].sort((a, b) => a.localeCompare(b))] as [string, string[]])
    .sort((a, b) => roleOrder(a[0]) - roleOrder(b[0]));
}

export function SongCardSkeleton() {
  return (
    <Card>
      <Skeleton className="h-6 w-3/5" />
      <Skeleton className="mt-2 h-4 w-2/5" />
      <Skeleton className="mt-4 h-8 w-28 rounded-full" />
      <div className="mt-6 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </Card>
  );
}

export function SongCard({
  detail: d,
  isrc,
  isrcNote,
  activePerson,
  onPerson,
  audioSlot,
  videoSlot,
}: {
  detail: RecordingDetail;
  /** 미리듣기·소리 특성에 쓸 ISRC (없으면 다른 녹음에서 빌린 값) */
  isrc?: string;
  isrcNote?: string;
  activePerson?: string | null;
  onPerson: (id: string, name: string) => void;
  audioSlot?: ReactNode;
  videoSlot?: ReactNode;
}) {
  const summary = roleSummary(d);
  const meta = [
    d.firstReleaseDate,
    d.releaseTitle,
    fmtLength(d.length),
  ].filter(Boolean);

  return (
    <Card>
      <h1 className="text-xl font-bold leading-snug text-white">
        {d.title}
        {d.disambiguation && (
          <span className="ml-2 align-middle text-sm font-normal text-slate-500">({d.disambiguation})</span>
        )}
      </h1>
      <p className="mt-1 text-sm text-slate-300">{d.artist}</p>
      {meta.length > 0 && <p className="mt-0.5 text-xs text-slate-500">{meta.join(" · ")}</p>}

      <div className="mt-3">
        <PreviewButton pkey={`song:${d.id}`} isrc={isrc} title={d.title} artist={d.artists[0]?.name ?? d.artist} />
      </div>

      {audioSlot}

      <div className="mt-5">
        <SectionTitle aside={d.credits.length ? `${d.credits.length}명` : undefined}>만든 사람</SectionTitle>
        {d.credits.length === 0 ? (
          <div>
            <p className="text-sm text-slate-400">
              MusicBrainz에 세부 제작 크레딧 정보가 아직 없어 가수를 기준으로 탐색합니다.{" "}
              <a
                className="underline hover:text-slate-200"
                href={`https://musicbrainz.org/recording/${d.id}`}
                target="_blank"
                rel="noreferrer"
              >
                MusicBrainz에서 보기
              </a>
            </p>
            {d.artists.length > 0 && (
              <ul className="-mx-2 mt-2 divide-y divide-slate-800/70">
                {d.artists.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onPerson(a.id, a.name)}
                      aria-pressed={activePerson === a.id}
                      className={clsx(
                        "flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-800/50",
                        activePerson === a.id && "bg-slate-800/60",
                      )}
                    >
                      <span className="min-w-0 flex-1 break-words">
                        <span className="text-[15px] text-slate-100">{a.name}</span>
                        {a.disambiguation && (
                          <span className="ml-1.5 text-xs text-slate-500">{a.disambiguation}</span>
                        )}
                      </span>
                      <span className="flex max-w-[60%] flex-wrap justify-end gap-1 pt-0.5">
                        <RoleChip label="노래" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            {summary.length > 0 && (
              <dl className="mb-3 space-y-1 text-[13px]">
                {summary.map(([role, names]) => (
                  <div key={role} className="flex gap-2">
                    <dt className="w-14 shrink-0 text-slate-500">{role}</dt>
                    <dd className="text-slate-200">{names.join(" · ")}</dd>
                  </div>
                ))}
              </dl>
            )}
            <ul className="-mx-2 divide-y divide-slate-800/70">
              {d.credits.map((c) => (
                <li key={c.artist.id}>
                  <button
                    type="button"
                    onClick={() => onPerson(c.artist.id, c.artist.name)}
                    aria-pressed={activePerson === c.artist.id}
                    className={clsx(
                      "flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-800/50",
                      activePerson === c.artist.id && "bg-slate-800/60",
                    )}
                  >
                    <span className="min-w-0 flex-1 break-words">
                      <span className="text-[15px] text-slate-100">{c.artist.name}</span>
                      {c.artist.disambiguation && (
                        <span className="ml-1.5 text-xs text-slate-500">{c.artist.disambiguation}</span>
                      )}
                    </span>
                    <span className="flex max-w-[60%] flex-wrap justify-end gap-1 pt-0.5">
                      {c.roles.map((r) => (
                        <RoleChip key={r} label={r} />
                      ))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {videoSlot}

      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {isrc && (
          <span>
            ISRC {isrc}
            {isrcNote && ` (${isrcNote})`}
          </span>
        )}
        <a
          className="inline-flex items-center gap-1 hover:text-slate-300"
          href={`https://musicbrainz.org/recording/${d.id}`}
          target="_blank"
          rel="noreferrer"
        >
          MusicBrainz <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </Card>
  );
}
