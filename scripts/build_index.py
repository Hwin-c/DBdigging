"""
MusicBrainz 덤프(CC0)에서 뽑은 TSV로 정적 크레딧 색인을 만든다.

입력(--in, gz TSV, 머리글 없음):
  works.tsv.gz                 작품ID, 제목, 구분설명
  work_credits.tsv.gz          작품ID, 인물ID, 역할
  work_recordings.tsv.gz       작품ID, 녹음ID, 관계종류(performance)
  artists_from_works.tsv.gz    인물ID, 이름, 구분설명
  recording_occurrences.tsv.gz 녹음ID, 제목, 가수표기, 가수ID들(;), 길이, ISRC들(;), 날짜, 발매상태  (발매마다 한 줄)
  DUMP_VERSION                 덤프 이름

출력(--out, 기본 public/idx/v1):
  meta.json
  p/{인물ID 앞 2글자}.json  { 인물ID: { n, d?, w: [[작품ID, 역할코드]] } }
  w/{작품ID 앞 3글자}.json  { 작품ID: { t, c: [[인물ID, 역할코드]], r: { id, t, a, i, y } } }

규칙
  1) 녹음 합치기: 녹음ID별 가장 이른 날짜, Official 여부, 대표 ISRC(가장 많은 발매에 붙은 것).
     제목·가수는 Official이고 이른 발매 기준
  2) 대표 녹음: 작품의 녹음 중 반주·버전 녹음 제외(src/lib/filters.ts와 같은 규칙) → ISRC 있음 → Official → 이른 날짜
     (같으면 발매 수가 많은 쪽, 그다음 녹음ID)
  3) 범위: 대표 녹음에 ISRC가 있는 작품만, 그런 작품이 하나라도 있는 인물만
     ISRC 있는 녹음이 항상 먼저이므로 ISRC 없는 발매 행은 처음부터 읽지 않는다
  4) 역할 코드: 작곡 C, 작사 L, 작사·작곡 W, 편곡 A, 그 밖 O. 한 사람이 한 작품에 여러 역할이면 이어 붙인다
     (작곡+작사 → W, 예: "CA", "WA")

DuckDB(pip로만 설치, 프로젝트 의존성 아님)로 gz TSV를 직접 읽고, 메모리가 모자라면 --db 옆 임시 폴더로 넘긴다.
MusicBrainz API는 호출하지 않는다.

사용: python scripts/build_index.py [--in DIR] [--out DIR] [--db FILE] [--reuse] [--memory 3GB]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone

import duckdb
from duckdb.sqltypes import BOOLEAN, VARCHAR

# 상한: 넘으면 출력을 확정하지 않고 멈춘다
MAX_TOTAL_BYTES = 1_000_000_000  # 1GB
MAX_SHARD_BYTES = 2_000_000  # 2MB
P_SHARD = 2  # 인물ID 앞 글자 수
W_SHARD = 3  # 작품ID 앞 글자 수

# 날짜 비교용: 정밀도가 낮은 날짜는 그 기간의 마지막 날로 본다
# ("2013"을 그대로 비교하면 "2013-04-19"보다 앞서서, 연도만 있는 커버가 원곡보다 이른 것으로 잡힌다)
DATE_KEY_SQL = """CASE length(date) WHEN 4 THEN date || '-12-31' WHEN 7 THEN date || '-31'
  ELSE coalesce(date, '9999') END"""

ROLE_CODE_SQL = """CASE role WHEN '작곡' THEN 'C' WHEN '작사' THEN 'L' WHEN '작사·작곡' THEN 'W'
  WHEN '편곡' THEN 'A' ELSE 'O' END"""

# ───────── src/lib/filters.ts 규칙 (Python re: [\W_] = 글자·숫자가 아닌 문자) ─────────

BACKING_WORDS = re.compile(r"(?:^|[\W_])(inst\.?|instrumental|karaoke|off ?vocal)(?=$|[\W_])", re.I)
BACKING_KO = re.compile(r"반주|노래방")
MR_UPPER = re.compile(r"(?:^|[\W_])MR(?![.]|[^\W_])")
MR_IN_BRACKETS = re.compile(r"[(\[{][^)\]}]*\bmr\b(?!\.)[^)\]}]*[)\]}]", re.I)
VERSION_WORDS = re.compile(
    r"(?:^|[\W_])(ver\.?|version|remix|remixed|mix|edit|live|acoustic|demo|sped ?up|slowed|japanese|english"
    r"|chinese|korean|spanish|reprise|rearranged|bonus)(?=$|[\W_])",
    re.I,
)
VERSION_KO = re.compile(r"버전|리믹스|라이브|일본어|영어")
BRACKETS = re.compile(r"[(\[{][^)\]}]*[)\]}]")
DASH = re.compile(r"\s[-–]\s")


def title_suffix(title: str) -> str:
    """제목에서 괄호 부분과 " - " 뒤 부분 (버전 표기가 붙는 자리)"""
    brackets = " ".join(BRACKETS.findall(title))
    dashed = " ".join(DASH.split(title)[1:])
    return f"{brackets} {dashed}"


def is_backing_track(title: str, dis: str = "") -> bool:
    text = f"{title_suffix(title)} {dis}"
    return bool(
        BACKING_WORDS.search(text)
        or BACKING_KO.search(text)
        or MR_UPPER.search(title)
        or MR_UPPER.search(dis)
        or MR_IN_BRACKETS.search(title)
        or re.fullmatch(r"mr", dis.strip(), re.I)
    )


def is_version_recording(title: str, dis: str = "") -> bool:
    text = f"{title_suffix(title)} {dis}"
    return bool(VERSION_WORDS.search(text) or VERSION_KO.search(text))


def excluded(title: str | None) -> bool:
    if not title:
        return False
    return is_backing_track(title) or is_version_recording(title)


def selftest() -> None:
    """filters.ts와 같은 결과인지 확인 (2026-11-19 TS 검사와 같은 사례)"""
    backing = {
        "Supernova (Inst.)": True,
        "Supernova (Instrumental)": True,
        "Supernova (MR)": True,
        "Supernova - MR": True,
        "Supernova (mr ver.)": True,
        "Mr. Chu": False,
        "Mr.Mr.": False,
        "Mr. Chu (On Stage)": False,
        "Mr Brightside": False,
        "Mr.Mr. (Inst.)": True,
        "Instinct": False,
        "Karaoke Night": False,
        "밤편지 (반주)": True,
        "Flutter": False,
        "MR. SIMPLE": False,
    }
    version = {
        "Supernova (Japanese ver.)": True,
        "Hot Mess (English Ver.)": True,
        "Get Lucky (radio edit)": True,
        "Remix": False,
        "Mix Tape": False,
        "Flutter": False,
        "Love Shot - Remix": True,
    }
    bad = [t for t, want in backing.items() if is_backing_track(t) != want]
    bad += [t for t, want in version.items() if is_version_recording(t) != want]
    if bad:
        sys.exit(f"filters 규칙이 filters.ts와 다릅니다: {bad}")


# ───────── 실행 ─────────


def log(msg: str, t0: float) -> None:
    print(f"[{time.time() - t0:7.1f}s] {msg}", flush=True)


def src(path: str, cols: dict[str, str]) -> str:
    spec = "{" + ", ".join(f"'{k}': '{v}'" for k, v in cols.items()) + "}"
    p = path.replace("\\", "/").replace("'", "''")
    return (
        f"read_csv('{p}', delim='\\t', header=false, quote='', escape='', columns={spec}, "
        f"compression='gzip', null_padding=true)"
    )


def table_exists(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    return bool(
        con.execute("select count(*) from information_schema.tables where table_name = ?", [name]).fetchone()[0]
    )


def build_tables(con: duckdb.DuckDBPyConnection, inp: str, reuse: bool, t0: float) -> None:
    f = lambda name: os.path.join(inp, name)  # noqa: E731

    def step(name: str, sql: str) -> None:
        if reuse and table_exists(con, name):
            log(f"{name}: 기존 표 사용", t0)
            return
        con.execute(f"DROP TABLE IF EXISTS {name}")
        con.execute(f"CREATE TABLE {name} AS {sql}")
        n = con.execute(f"select count(*) from {name}").fetchone()[0]
        log(f"{name}: {n:,}행", t0)

    step(
        "credits",
        f"""SELECT TRY_CAST(w AS UUID) w, TRY_CAST(p AS UUID) p, {ROLE_CODE_SQL} code
            FROM {src(f('work_credits.tsv.gz'), {'w': 'VARCHAR', 'p': 'VARCHAR', 'role': 'VARCHAR'})}
            WHERE TRY_CAST(w AS UUID) IS NOT NULL AND TRY_CAST(p AS UUID) IS NOT NULL""",
    )
    step(
        "wr",
        f"""SELECT DISTINCT TRY_CAST(w AS UUID) w, TRY_CAST(r AS UUID) r
            FROM {src(f('work_recordings.tsv.gz'), {'w': 'VARCHAR', 'r': 'VARCHAR', 't': 'VARCHAR'})}
            WHERE t = 'performance' AND TRY_CAST(r AS UUID) IS NOT NULL
              AND TRY_CAST(w AS UUID) IN (SELECT DISTINCT w FROM credits)""",
    )
    step("need", "SELECT DISTINCT r FROM wr")
    # 3GB gz를 한 번만 읽는다: 필요한 녹음 + ISRC 있는 발매 행만
    step(
        "occ",
        f"""SELECT TRY_CAST(o.r AS UUID) r, o.title, o.artist, o.ids, o.isrc,
                   NULLIF(o.date, '') date, o.status
            FROM {src(f('recording_occurrences.tsv.gz'), {'r': 'VARCHAR', 'title': 'VARCHAR', 'artist': 'VARCHAR', 'ids': 'VARCHAR', 'len': 'VARCHAR', 'isrc': 'VARCHAR', 'date': 'VARCHAR', 'status': 'VARCHAR'})} o
            WHERE coalesce(o.isrc, '') <> '' AND TRY_CAST(o.r AS UUID) IN (SELECT r FROM need)""",
    )
    # 녹음 합치기: 제목·가수는 Official이고 이른 발매 기준
    step(
        "rec",
        f"""SELECT r,
              arg_min(title, {{'o': status IS DISTINCT FROM 'Official', 'd': {DATE_KEY_SQL}}}) title,
              arg_min(artist, {{'o': status IS DISTINCT FROM 'Official', 'd': {DATE_KEY_SQL}}}) artist,
              min({DATE_KEY_SQL}) first_date,
              bool_or(status = 'Official') official,
              count(*) occ_n
            FROM occ GROUP BY r""",
    )
    # 대표 ISRC: ISRC 합집합 중 가장 많은 발매에 붙은 것
    step(
        "rec_isrc",
        """SELECT r, arg_max(i, {'n': n, 'i': i}) isrc, count(*) isrc_n FROM (
              SELECT r, i, count(*) n FROM (SELECT r, trim(unnest(string_split(isrc, ';'))) i FROM occ)
              WHERE i <> '' GROUP BY r, i)
            GROUP BY r""",
    )
    step(
        "rep",
        """SELECT wr.w, rec.r, rec.title, rec.artist, rec.first_date, ri.isrc
            FROM wr JOIN rec USING (r) JOIN rec_isrc ri USING (r)
            WHERE NOT excluded(rec.title)
            QUALIFY row_number() OVER (
              PARTITION BY wr.w ORDER BY rec.official DESC, rec.first_date, rec.occ_n DESC, rec.r) = 1""",
    )
    step(
        "wc",
        """SELECT w, p,
              concat(
                CASE WHEN bool_or(code = 'W') OR (bool_or(code = 'C') AND bool_or(code = 'L')) THEN 'W'
                     ELSE concat(CASE WHEN bool_or(code = 'C') THEN 'C' ELSE '' END,
                                 CASE WHEN bool_or(code = 'L') THEN 'L' ELSE '' END) END,
                CASE WHEN bool_or(code = 'A') THEN 'A' ELSE '' END,
                CASE WHEN bool_or(code = 'O') THEN 'O' ELSE '' END) code
            FROM credits WHERE w IN (SELECT w FROM rep) GROUP BY w, p""",
    )
    step(
        "works",
        f"""SELECT TRY_CAST(w AS UUID) w, any_value(t) t FROM {src(f('works.tsv.gz'), {'w': 'VARCHAR', 't': 'VARCHAR', 'd': 'VARCHAR'})}
            WHERE TRY_CAST(w AS UUID) IN (SELECT w FROM rep) GROUP BY 1""",
    )
    step(
        "artists",
        f"""SELECT TRY_CAST(p AS UUID) p, any_value(n) n, any_value(d) d FROM {src(f('artists_from_works.tsv.gz'), {'p': 'VARCHAR', 'n': 'VARCHAR', 'd': 'VARCHAR'})}
            WHERE TRY_CAST(p AS UUID) IN (SELECT DISTINCT p FROM wc) GROUP BY 1""",
    )


def year(d: str | None) -> int | None:
    if not d or d == "9999" or not d[:4].isdigit():
        return None
    return int(d[:4])


def dump(obj: dict) -> bytes:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def write_shards(con: duckdb.DuckDBPyConnection, sql: str, folder: str, make, sizes: dict[str, int]) -> int:
    """sql은 (shard, key, ...) 순으로 shard 정렬. 조각마다 파일 하나"""
    os.makedirs(folder, exist_ok=True)
    cur = con.execute(sql)
    shard, buf, n = None, {}, 0

    def flush():
        if shard is None:
            return
        data = dump(buf)
        path = os.path.join(folder, f"{shard}.json")
        with open(path, "wb") as fh:
            fh.write(data)
        sizes[path] = len(data)

    while True:
        rows = cur.fetchmany(20000)
        if not rows:
            break
        for row in rows:
            if row[0] != shard:
                flush()
                shard, buf = row[0], {}
            buf[row[1]] = make(row)
            n += 1
    flush()
    return n


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("--in", dest="inp", default=r"C:\Users\USER\Desktop\mb_index_out")
    ap.add_argument("--out", default=os.path.join(root, "public", "idx", "v1"))
    ap.add_argument("--db", default=os.path.join(tempfile.gettempdir(), "dbdig_index.duckdb"))
    ap.add_argument("--memory", default="3GB")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--reuse", action="store_true", help="이미 만든 중간 표를 다시 쓰기 (덤프 재읽기 생략)")
    ap.add_argument("--rebuild", default="", help="--reuse일 때도 다시 만들 표 (쉼표 구분, 예: rec,rep,wc,works,artists)")
    args = ap.parse_args()

    selftest()
    t0 = time.time()
    with open(os.path.join(args.inp, "DUMP_VERSION"), encoding="utf-8") as fh:
        dump_version = fh.read().strip()

    tmpdir = args.db + ".tmp"
    os.makedirs(tmpdir, exist_ok=True)
    con = duckdb.connect(args.db)
    con.execute(f"SET temp_directory='{tmpdir.replace(chr(92), '/')}'")
    con.execute(f"SET memory_limit='{args.memory}'")
    con.execute(f"SET threads={args.threads}")
    con.execute("SET preserve_insertion_order=false")
    con.create_function("excluded", excluded, [VARCHAR], BOOLEAN)
    log(f"덤프 {dump_version}, DB {args.db}, 메모리 {args.memory}", t0)

    for name in filter(None, args.rebuild.split(",")):
        con.execute(f"DROP TABLE IF EXISTS {name.strip()}")
    build_tables(con, args.inp, args.reuse, t0)

    staging = args.out.rstrip("\\/") + ".tmp"
    shutil.rmtree(staging, ignore_errors=True)
    sizes: dict[str, int] = {}

    works_sql = f"""
        SELECT substr(rep.w::VARCHAR, 1, {W_SHARD}) sh, rep.w::VARCHAR w, coalesce(works.t, rep.title) t,
               (SELECT list([wc.p::VARCHAR, wc.code] ORDER BY wc.code, wc.p) FROM wc WHERE wc.w = rep.w) c,
               rep.r::VARCHAR r, rep.title rt, rep.artist ra, rep.isrc, rep.first_date
        FROM rep LEFT JOIN works ON works.w = rep.w
        ORDER BY sh"""
    n_works = write_shards(
        con,
        works_sql,
        os.path.join(staging, "w"),
        lambda row: {
            "t": row[2],
            "c": row[3] or [],
            "r": {"id": row[4], "t": row[5], "a": row[6], "i": row[7], "y": year(row[8])},
        },
        sizes,
    )
    log(f"작품 조각 완료: {n_works:,}개", t0)

    people_sql = f"""
        SELECT substr(wc.p::VARCHAR, 1, {P_SHARD}) sh, wc.p::VARCHAR p, any_value(a.n) n, any_value(a.d) d,
               list([wc.w::VARCHAR, wc.code] ORDER BY rep.first_date DESC, wc.w) ws
        FROM wc JOIN rep ON rep.w = wc.w LEFT JOIN artists a ON a.p = wc.p
        GROUP BY wc.p ORDER BY sh"""

    def person(row):
        o = {"n": row[2] or row[1]}
        if row[3]:
            o["d"] = row[3]
        o["w"] = row[4]
        return o

    n_people = write_shards(con, people_sql, os.path.join(staging, "p"), person, sizes)
    log(f"인물 조각 완료: {n_people:,}명", t0)

    vals = sorted(sizes.values())
    total = sum(vals)
    biggest = max(sizes.items(), key=lambda kv: kv[1])
    by_kind = {
        k: [v for p, v in sizes.items() if os.sep + k + os.sep in p or f"/{k}/" in p.replace(os.sep, "/")]
        for k in ("p", "w")
    }
    meta = {
        "version": 1,
        "dump": dump_version,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "counts": {"people": n_people, "works": n_works, "files": len(sizes) + 1},
        "shards": {
            "p": f"p/{{인물ID 앞 {P_SHARD}글자}}.json → {{인물ID: {{n, d?, w: [[작품ID, 역할코드]]}}}}",
            "w": f"w/{{작품ID 앞 {W_SHARD}글자}}.json → {{작품ID: {{t, c: [[인물ID, 역할코드]], r: {{id, t, a, i, y}}}}}}",
        },
        "roles": {"C": "작곡", "L": "작사", "W": "작사·작곡", "A": "편곡", "O": "그 밖"},
        "license": "Data: MusicBrainz (CC0)",
    }
    with open(os.path.join(staging, "meta.json"), "wb") as fh:
        fh.write(json.dumps(meta, ensure_ascii=False, indent=1).encode("utf-8"))

    def stat(name, xs):
        return f"{name}: {len(xs)}개, 평균 {sum(xs) / len(xs) / 1024:.0f}KB, 최대 {max(xs) / 1024:.0f}KB"

    print(json.dumps(meta["counts"], ensure_ascii=False))
    print(f"전체 {total / 1024 / 1024:.1f}MB · {stat('인물 조각', by_kind['p'])} · {stat('작품 조각', by_kind['w'])}")
    print(f"가장 큰 조각 {os.path.relpath(biggest[0], staging)} {biggest[1] / 1024:.0f}KB")

    over = total > MAX_TOTAL_BYTES or vals[-1] > MAX_SHARD_BYTES
    if over:
        big = sorted(((v, os.path.relpath(p, staging)) for p, v in sizes.items() if v > MAX_SHARD_BYTES), reverse=True)
        print(f"상한 초과: 전체 {total / 1e6:.0f}MB(상한 1GB), 2MB 넘는 조각 {len(big)}개 {big[:10]}")
        print(f"출력을 확정하지 않았습니다. 확인용 결과: {staging}")
        sys.exit(2)
    shutil.rmtree(args.out, ignore_errors=True)
    os.replace(staging, args.out)
    log(f"완료: {args.out}", t0)


if __name__ == "__main__":
    main()
