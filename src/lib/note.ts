/**
 * 디깅 노트: 담은 곡 목록. 이 브라우저 localStorage에만 저장하고 서버로 보내지 않는다.
 */

export interface NotePerson {
  id: string;
  name: string;
  role: string;
}

export interface NoteItem {
  id: string;
  title: string;
  artist: string;
  releaseGroupId?: string;
  isrc?: string;
  /** 이 곡을 찾게 해 준 크레딧 인물 */
  people: NotePerson[];
  addedAt: number;
}

const KEY = "dig:note";
const MAX = 500;

export function loadNote(): NoteItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as NoteItem[]).filter((x) => x && typeof x.id === "string") : [];
  } catch {
    return [];
  }
}

export function saveNote(items: NoteItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* 저장 실패는 무시 */
  }
}

/** 담은 곡 크레딧에 가장 많이 나온 인물 상위 n명 */
export function topPeople(items: NoteItem[], n = 3): Array<{ id: string; name: string; count: number }> {
  const m = new Map<string, { id: string; name: string; count: number }>();
  for (const it of items) {
    for (const p of new Map(it.people.map((x) => [x.id, x])).values()) {
      const cur = m.get(p.id) ?? { id: p.id, name: p.name, count: 0 };
      cur.count++;
      m.set(p.id, cur);
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, n);
}
