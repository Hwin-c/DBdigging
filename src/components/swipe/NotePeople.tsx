"use client";
import { useEffect, useMemo, useState } from "react";
import { loadSeen } from "@/lib/deck";
import { getIdxPerson, getIdxWork, idxEnabled } from "@/lib/idx";
import { normalizeTitle } from "@/lib/mb/api";
import { topPeople, type NoteItem } from "@/lib/note";

/** 사람마다 최근 작품을 고르려고 색인에서 살펴볼 작품 수 (조각 파일을 받으므로 적게) */
const SAMPLE = 10;
/** 사람마다 보여 줄 곡 수 */
const PER_PERSON = 2;
/** 보여 줄 사람 수 */
const PEOPLE = 3;

interface Pick {
  id: string;
  title: string;
  artist: string;
  isrc?: string;
  year: number;
}
interface Group {
  personId: string;
  name: string;
  picks: Pick[];
}

/** 목록 전체에서 고르게 n개 */
function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const step = list.length / n;
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]);
}

/**
 * 시작 화면 "담은 곡의 사람들": 디깅 노트에 가장 많이 나온 인물 2~3명의 최근 작품을 색인에서 골라 칩으로.
 * 이미 본 곡과 담은 곡(같은 제목 포함)은 뺀다. 색인이 꺼져 있거나 없으면 아무것도 보이지 않는다.
 */
export function NotePeople({
  note,
  onStart,
}: {
  note: NoteItem[];
  onStart: (s: { id: string; title: string; artist: string }) => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const people = useMemo(() => topPeople(note, PEOPLE), [note]);
  const key = people.map((p) => p.id).join(",") + "|" + note.length;

  useEffect(() => {
    let off = false;
    if (!people.length || !idxEnabled()) {
      setGroups([]);
      return;
    }
    const noted = new Set(note.map((n) => n.id));
    const notedTitles = new Set(note.map((n) => normalizeTitle(n.title)));
    const seen = new Set(loadSeen());
    (async () => {
      const out: Group[] = [];
      for (const p of people) {
        const ip = await getIdxPerson(p.id);
        if (!ip) continue;
        const works = ip.w.filter(([, code]) => code !== "O").map(([wid]) => wid);
        const picks: Pick[] = [];
        for (const wid of spread(works, SAMPLE)) {
          const w = await getIdxWork(wid);
          const r = w?.r;
          if (!w || !r?.i || noted.has(r.id) || seen.has(r.id) || notedTitles.has(normalizeTitle(w.t))) continue;
          picks.push({ id: r.id, title: w.t, artist: r.a, isrc: r.i, year: r.y ?? 0 });
        }
        picks.sort((a, b) => b.year - a.year);
        if (picks.length) out.push({ personId: p.id, name: p.name, picks: picks.slice(0, PER_PERSON) });
      }
      if (!off) setGroups(out);
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!groups.length) return null;
  return (
    <section aria-label="담은 곡의 사람들" className="relative mt-8 w-full max-w-[520px] px-4">
      <h2 className="text-center text-[13px] text-[#6E6E73]">담은 곡의 사람들</h2>
      <ul className="mt-3 space-y-3">
        {groups.map((g) => (
          <li key={g.personId} className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-[14px] font-semibold">{g.name}</span>
            {g.picks.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onStart(p)}
                title={`${p.title} · ${p.artist}${p.year ? ` (${p.year})` : ""}`}
                className="min-h-[44px] max-w-[220px] truncate rounded-full border border-[#E5E5E5] bg-white px-4 text-[14px] text-black hover:border-black"
              >
                {p.title}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
