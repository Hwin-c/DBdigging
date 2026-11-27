"use client";
import clsx from "clsx";
import { Bookmark, Loader2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Deck, SOUND_MODES, type DeckCard, type DeckSnapshot } from "@/lib/deck";
import { loadNote, saveNote, topPeople, type NoteItem } from "@/lib/note";
import { player, type PlayerState } from "@/lib/preview";
import { SourceFooter } from "../dig/SourceFooter";
import { Cover } from "./Cover";
import { EXAMPLES } from "./examples";
import { DigFlow } from "./DigFlow";
import { StartScreen, type FloatingSong } from "./StartScreen";
import { SwipeCard } from "./SwipeCard";
import type { SwipeDir } from "./useSwipe";

const EMPTY: DeckSnapshot = {
  queue: [],
  people: [],
  path: [],
  focusId: null,
  mode: "similar",
  joined: null,
  progress: { phase: "idle", done: 0, total: 0 },
  error: null,
};

/** "+ 이름 합류" 알림 표시 시간 (ms) */
const JOIN_TOAST_MS = 2600;

function usePlayer(): PlayerState {
  const [s, setS] = useState<PlayerState>(player.state);
  useEffect(() => player.subscribe(setS), []);
  return s;
}

function progressText(s: DeckSnapshot): string {
  const p = s.progress;
  if (p.phase === "origin") return "시작 곡 크레딧 읽는 중";
  if (p.phase === "collect") return `크레딧 뒤지는 중 · ${p.done}/${p.total}`;
  return "";
}

export function SwipeApp() {
  const router = useRouter();
  const params = useSearchParams();
  const dig = params.get("dig");

  const deckRef = useRef<Deck | null>(null);
  const [snap, setSnap] = useState<DeckSnapshot>(EMPTY);
  const [note, setNote] = useState<NoteItem[]>([]);
  const [leaving, setLeaving] = useState<{ card: DeckCard; dir: SwipeDir; n: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  /** 한 번이라도 재생했으면 넘길 때 다음 곡을 이어서 재생 */
  const soundOn = useRef(false);
  const ps = usePlayer();

  useEffect(() => setNote(loadNote()), []);

  // 덱은 브라우저에서 한 번만 만든다
  useEffect(() => {
    const d = new Deck();
    deckRef.current = d;
    const off = d.subscribe(setSnap);
    return () => {
      off();
      d.dispose();
      deckRef.current = null;
    };
  }, []);

  // ?dig=<녹음 MBID> 로 시작
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    const d = deckRef.current;
    if (!d || !dig) return;
    if (startedFor.current === dig) return;
    startedFor.current = dig;
    player.stop();
    void d.start(dig);
  }, [dig]);

  // 담은 곡에서 새 사람이 합류하면 잠깐 알림
  const joinedN = snap.joined?.n ?? 0;
  useEffect(() => {
    if (!snap.joined) return;
    const names = snap.joined.names;
    const shown = names.slice(0, 2).join(", ") + (names.length > 2 ? ` 외 ${names.length - 2}명` : "");
    setToast({ text: `+ ${shown} 합류`, n: snap.joined.n });
    const t = setTimeout(() => setToast(null), JOIN_TOAST_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedN]);

  const start = useCallback(
    (s: { id: string }) => {
      startedFor.current = null;
      router.push(`/?dig=${s.id}`, { scroll: false });
      window.scrollTo({ top: 0 });
    },
    [router],
  );

  const card = snap.queue[0];
  const origin = snap.origin;

  /**
   * 이 카드를 재생한다. 어느 경우든 이전 곡은 여기서 동기적으로 멈춘다.
   * - 미리듣기 주소가 있으면 바로 재생 (제스처 안에서 호출되면 휴대폰 자동재생 제한을 피함)
   * - 아직 없으면 받는 동안 "불러오는 중", 받은 뒤 재생 시도, 막히면 "탭해서 재생"
   * - 미리듣기가 없는 곡이면 멈춘 채로 "미리듣기 없음"
   */
  const playCard = useCallback((c: DeckCard | undefined) => {
    if (!c) return;
    if (c.preview) player.playNow(c.id, c.preview);
    else if (c.preview === null) player.markNone(c.id);
    else void player.play(c.id, () => deckRef.current?.ensurePreview(c) ?? Promise.resolve(null));
  }, []);

  /** 탭·Space: 재생/정지 (이벤트 처리 안에서 바로 play) */
  const toggle = useCallback(() => {
    if (!card) return;
    soundOn.current = true;
    const ps = player.state;
    if (ps.key === card.id && ps.status === "loading") return; // 받는 중에는 기다린다
    if (ps.key === card.id && (ps.status === "playing" || ps.status === "paused")) player.toggle(card.id);
    else playCard(card); // idle·blocked(탭해서 재생)·다른 카드
  }, [card, playCard]);

  // 대기열이 비어 있다가 다음 카드가 늦게 도착한 경우: 소리를 켜 둔 상태면 이어서 재생을 시도한다.
  // 사용자 동작 밖이라 휴대폰이 막을 수 있고, 그러면 "탭해서 재생"으로 남는다
  const frontId = card?.id;
  useEffect(() => {
    if (!soundOn.current || !card || player.state.key === card.id) return;
    playCard(card);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontId]);

  /** 왼쪽 넘기기 · 오른쪽 담기(저장 + 방향) */
  const act = useCallback(
    (dir: SwipeDir) => {
      const d = deckRef.current;
      const c = d?.snapshot().queue[0];
      if (!d || !c) return;
      // 이전 곡을 미리듣기 유무와 관계없이 즉시(동기적으로) 멈춘다
      player.stop();
      setLeaving((l) => ({ card: c, dir, n: (l?.n ?? 0) + 1 }));
      if (dir === "right") {
        setNote((prev) => {
          if (prev.some((x) => x.id === c.id)) return prev;
          const next: NoteItem[] = [
            {
              id: c.id,
              title: c.title,
              artist: c.artist,
              releaseGroupId: c.releaseGroupId,
              isrc: c.isrc,
              people: c.via.map((v) => ({ id: v.personId, name: v.name, role: v.role })),
              addedAt: Date.now(),
            },
            ...prev,
          ];
          saveNote(next);
          return next;
        });
        d.keep();
      } else d.skip();
      // 다음 카드를 같은 이벤트 처리 안에서 재생 (모바일 자동재생 제한)
      const next = d.snapshot().queue[0];
      if (soundOn.current && next) playCard(next);
    },
    [playCard],
  );

  // 키보드: ← 넘기기, → 담기, Space 재생/정지
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!deckRef.current?.snapshot().queue[0]) return;
      if (e.key === "ArrowLeft") act("left");
      else if (e.key === "ArrowRight") act("right");
      else if (e.key === " " && !(t && (t.tagName === "BUTTON" || t.tagName === "A"))) toggle();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, toggle]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), 260);
    return () => clearTimeout(t);
  }, [leaving]);

  const floating: FloatingSong[] = useMemo(() => {
    const fromNote = note.slice(0, 6).map((n) => ({ ...n }));
    const list = [...EXAMPLES, ...fromNote];
    const seen = new Set<string>();
    return list.filter((s) => !seen.has(s.id) && seen.add(s.id));
  }, [note]);

  const removeNote = (id: string) =>
    setNote((prev) => {
      const next = prev.filter((x) => x.id !== id);
      saveNote(next);
      return next;
    });

  const focus = useCallback((id: string | null) => deckRef.current?.focus(id), []);
  const listHref = `/?view=list${origin ? `&rec=${origin.id}` : ""}`;

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="mx-auto flex h-14 w-full max-w-[960px] items-center justify-between px-4">
        <button
          type="button"
          onClick={() => {
            player.stop();
            router.push("/");
          }}
          className="text-[17px] font-bold tracking-[-0.03em]"
        >
          디비디깅
        </button>
        <div className="flex items-center gap-1">
          <a
            href="#note"
            className="flex min-h-[44px] items-center rounded-full px-3 text-[14px] text-[#6E6E73] hover:text-black"
          >
            디깅 노트 {note.length > 0 && <span className="ml-1 text-black">{note.length}</span>}
          </a>
          <button
            type="button"
            onClick={() => {
              player.stop();
              router.push(listHref);
            }}
            className="hidden min-h-[44px] items-center rounded-full border border-[#E5E5E5] px-4 text-[14px] hover:border-black md:inline-flex"
          >
            목록 보기
          </button>
        </div>
      </header>

      {!dig && <StartScreen floating={floating} onStart={start} />}

      {dig && (
        <main className="mx-auto w-full max-w-[520px] px-4 pb-6">
          <DigFlow snap={snap} onFocus={focus} />

          {/* 소리 방향: 대기열 정렬 기준만 바꾼다 */}
          {origin && (
            <div role="radiogroup" aria-label="소리 방향" className="mt-3 flex gap-1 rounded-full bg-[#F2F2F2] p-1">
              {SOUND_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={snap.mode === m.id}
                  onClick={() => deckRef.current?.setMode(m.id)}
                  className={clsx(
                    "min-h-[36px] flex-1 rounded-full px-2 text-[13px]",
                    snap.mode === m.id ? "bg-white font-semibold text-black shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-[#6E6E73] hover:text-black",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          <div className="relative mt-5 min-h-[380px] md:min-h-[480px]">
            {leaving && (
              <div
                key={leaving.n}
                aria-hidden
                className={clsx("pointer-events-none absolute inset-x-0 top-0 z-10", `card-exit-${leaving.dir}`)}
              >
                <div className="relative mx-auto aspect-square w-[62%] max-w-[340px] md:w-[78%]">
                  <Cover
                    releaseGroupId={leaving.card.releaseGroupId}
                    isrc={leaving.card.isrc}
                    fallback={leaving.card.cover ?? leaving.card.preview?.cover}
                    title={leaving.card.title}
                    artist={leaving.card.artist}
                    size={500}
                    className="sleeve absolute inset-0 rounded-[3px]"
                  />
                </div>
              </div>
            )}

            {toast && (
              <div
                key={toast.n}
                role="status"
                className="toast-in pointer-events-none absolute inset-x-0 top-2 z-20 mx-auto w-max max-w-[92%] truncate whitespace-nowrap rounded-full bg-black px-4 py-2 text-center text-[13px] font-semibold text-white md:text-[14px]"
              >
                {toast.text}
              </div>
            )}

            {card && (
              <SwipeCard
                key={card.id}
                card={card}
                base={origin?.features}
                status={ps.key === card.id ? ps.status : "idle"}
                onSwipe={act}
                onTap={toggle}
                focusId={snap.focusId}
                onFocus={(id) => focus(id)}
                onDig={(p) => deckRef.current?.digPerson(p, card.title)}
                onSinger={() => void deckRef.current?.digSinger(card)}
              />
            )}

            {!card && !snap.error && snap.progress.phase !== "exhausted" && (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
                <div className="aspect-square w-[60%] max-w-[260px] animate-pulse rounded-[3px] bg-[#F2F2F2]" />
                <p className="flex items-center gap-2 text-[14px] text-[#6E6E73]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {progressText(snap) || "준비 중"}
                </p>
              </div>
            )}

            {!card && snap.progress.phase === "exhausted" && !snap.error && (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-[18px] font-semibold tracking-[-0.02em]">이 사람들의 곡을 다 봤어요</p>
                <p className="text-[14px] text-[#6E6E73]">
                  {snap.focusId ? "집중을 풀면 다른 사람 곡이 이어서 나와요." : "다른 곡으로 새로 시작해 보세요."}
                </p>
                {snap.focusId ? (
                  <button
                    type="button"
                    onClick={() => focus(null)}
                    className="mt-2 min-h-[44px] rounded-full bg-black px-5 text-[15px] font-semibold text-white"
                  >
                    집중 풀기
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="mt-2 min-h-[44px] rounded-full bg-black px-5 text-[15px] font-semibold text-white"
                  >
                    새 곡으로 시작
                  </button>
                )}
              </div>
            )}

            {snap.error && !card && (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-[16px] font-semibold">{snap.error}</p>
                <button
                  type="button"
                  onClick={() => (origin ? deckRef.current?.retry() : dig && deckRef.current?.start(dig))}
                  className="min-h-[44px] rounded-full bg-black px-5 text-[15px] font-semibold text-white"
                >
                  다시 시도
                </button>
              </div>
            )}
          </div>

          {/* 조작 버튼: 항상 표시 */}
          <div className="mt-4 flex items-start justify-center gap-10">
            {(
              [
                { dir: "left", label: "넘기기", key: "←", icon: X, primary: false },
                { dir: "right", label: "담기", key: "→", icon: Bookmark, primary: true },
              ] as const
            ).map((b) => (
              <button
                key={b.dir}
                type="button"
                disabled={!card}
                onClick={() => act(b.dir)}
                className="group flex w-20 flex-col items-center gap-1.5 disabled:opacity-30"
              >
                <span
                  className={clsx(
                    "flex h-14 w-14 items-center justify-center rounded-full",
                    b.primary ? "bg-black text-white" : "border border-[#D4D4D4] text-black group-hover:border-black",
                  )}
                >
                  <b.icon className="h-5 w-5" />
                </span>
                <span className="text-[13px] text-[#6E6E73]">{b.label}</span>
                <span className="hidden text-[11px] text-[#B4B4B8] md:block">{b.key}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-[12px] leading-relaxed text-[#9A9A9E]">
            담으면 그 곡을 만든 사람들이 합류해 다음 카드가 그쪽으로 기울어요.
          </p>
          {card && snap.progress.phase === "collect" && (
            <p className="mt-1 text-center text-[12px] text-[#9A9A9E]">{progressText(snap)}</p>
          )}
        </main>
      )}

      <NoteSection items={note} onRemove={removeNote} onStart={start} />

      <div className="mx-auto max-w-[960px] px-4">
        <SourceFooter light />
      </div>
    </div>
  );
}

function NoteSection({
  items,
  onRemove,
  onStart,
}: {
  items: NoteItem[];
  onRemove: (id: string) => void;
  onStart: (s: { id: string }) => void;
}) {
  const top = topPeople(items, 3);
  return (
    <section id="note" className="mx-auto mt-16 w-full max-w-[520px] scroll-mt-16 px-4">
      <h2 className="text-[22px] font-bold tracking-[-0.03em]">디깅 노트</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-[14px] text-[#6E6E73]">
          마음에 드는 카드를 오른쪽으로 넘기면 여기에 담겨요. 이 브라우저에만 저장돼요.
        </p>
      ) : (
        <>
          {top.length > 0 && (
            <p className="mt-2 text-[14px] leading-relaxed text-[#6E6E73]">
              담은 곡에 자주 나온 사람{" "}
              {top.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <span className="font-semibold text-black">{p.name}</span> {p.count}곡
                </span>
              ))}
            </p>
          )}
          <ul className="mt-4 divide-y divide-[#EFEFEF]">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-2.5">
                <Cover
                  releaseGroupId={it.releaseGroupId}
                  isrc={it.isrc}
                  title={it.title}
                  artist={it.artist}
                  className="h-12 w-12 shrink-0 rounded-[2px]"
                />
                <button type="button" onClick={() => onStart(it)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[15px] font-semibold">{it.title}</span>
                  <span className="block truncate text-[13px] text-[#6E6E73]">
                    {it.artist}
                    {it.people.length ? `, ${it.people.map((p) => `${p.name} ${p.role}`).join(", ")}` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(it.id)}
                  aria-label={`${it.title} 노트에서 지우기`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#9A9A9E] hover:bg-[#F2F2F2] hover:text-black"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
