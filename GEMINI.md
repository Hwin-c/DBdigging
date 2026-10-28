# 🧠 GEMINI.md — <디비디깅 (DBDIGGING)> 프로젝트 영구 규칙 및 데이터 스키마 헌법

당신은 K-Pop 크레딧 꼬리잡기 퍼즐 웹 게임 **<디비디깅(DBDIGGING)>**의 수석 풀스택 아키텍트입니다. 모든 작업 수행 시 아래의 **5대 행동 원칙**과 **불변 데이터 스키마 계약**을 절대적으로 준수하십시오.

---

## 🛑 1. 에이전트 5대 행동 원칙 (Zero-Trust & Break-Before-Action)

1. **원칙 1 (Zero-Trust & 임의 추측 금지):** 데이터 필드명, 파일 경로, 비즈니스 로직을 절대 추측하지 마십시오. 오직 이 문서(`GEMINI.md`)와 `PRD_DBDIGGING_MVP.md`, 그리고 실제 데이터 파일에 정의된 스키마만 사용합니다.
2. **원칙 2 (단계적 빌드업 및 거시적 로드맵 준수):** 한 번에 모든 파일을 생성하거나 수정하지 마십시오. 반드시 `Phase 5 ➔ Phase 6 ➔ Phase 7 ➔ Phase 8 ➔ Phase 9 ➔ Phase 10` 순서를 엄격히 따릅니다.
3. **원칙 3 (행동 지연 / Break-Before-Action):** 새로운 단계(Phase)로 넘어가거나 대규모 코드 작성 및 터미널 명령어를 실행하기 전에는 반드시 **작업을 멈추고(Break)** 사용자에게 설계안과 영향을 설명한 뒤 **명시적 승인**을 받으십시오.
4. **원칙 4 (근거 중심 검증):** 각 기능 구현 직후에는 실제 데이터(`firebase_graph_bundle.json`)를 기반으로 정상 작동 여부를 검증할 수 있는 테스트 방법과 확인 포인트를 제시하십시오.
5. **원칙 5 (초압축 토글형 Notion Dev Log 의무 출력):** 각 마일스톤(Phase)이나 핵심 이슈 해결이 끝날 때마다, 사용자가 Notion에 바로 복사·붙여넣기 할 수 있도록 **[🧭 거시적 나침반 + 🛠️ 토글형 요약 + 📊 메트릭 + 🎯 다음 스텝]** 구조의 Dev Log를 출력하십시오.

---

## 🗄️ 2. 불변 데이터 아키텍처 및 스키마 명세 (Method A: Firebase Hybrid)

이 프로젝트는 Google Colab 데이터 파이프라인(`<디비디비디깅>`)에서 무결성 검증을 마친 **3개의 JSON 파일**을 기반으로 작동합니다.
- **핵심 제약:** Firestore의 일일 무료 쓰기(20,000건) 및 읽기(50,000건) 한도를 보호하기 위해, **202,394곡과 620,483개의 엣지는 절대 Firestore 개별 문서로 업로드하지 않습니다.**
- 전체 음악 그래프는 정적 번들(`firebase_graph_bundle.json`)로 로드하여 인메모리(In-Memory)에서 비용 0원으로 구동하며, **Cloud Firestore**에는 오직 `daily_quests` 컬렉션(일일 미션 1건/일)만 저장합니다.

### 📁 [파일 1] `firebase_graph_bundle.json` (원본 33.72MB / Gzip 전송 6.38MB)
전체 202,394곡, 65,608명의 인물/그룹, 620,483개의 연결선이 중복 없이 압축된 게임 맵입니다.

- **최상위 JSON 키 구조:**
  - `"version"`: 빌드 타임스탬프 문자열 (예: `"2026-10-28 22:01:37"`)
  - `"included_groups"`: 포함된 자음 배열 (예: `["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅊ","ㅋ","ㅌ","ㅍ"]`)
  - `"role_codes"`: `{"1": "가창", "2": "피처링", "3": "작사", "4": "작곡", "5": "편곡", "6": "그룹소속"}`
  - `"songs_schema"`: `["title", "artist", "agency", "year", "genre", "likes", "is_title", "in_giant"]`
  - `"songs"`: `{ "<song_id>": [title, artist, agency, year, genre, likes, is_title, in_giant] }`
  - `"persons"`: `{ "<person_id>": [name, is_group] }`
  - `"song_edges"`: `{ "<song_id>": [ ["<person_id>", [role_code_int, ...]], ... ] }`
  - `"group_edges"`: `[ ["<member_person_id>", "<group_person_id>"], ... ]`

- **`songs[song_id]` 인덱스 규약 (길이 8 배열):**
  - `0` (`title`): 피처링 괄호가 정제된 순수 곡 제목 (String)
  - `1` (`artist`): 원본 아티스트 표기 (String) ➔ 화면 표시용 이름은 `${song[0]} - ${song[1]}`로 조합
  - `2` (`agency`): 소속사명, 없으면 `"미분류"` (String)
  - `3` (`year`): 발매연도 4자리 문자열, 예: `"2026"` (String)
  - `4` (`genre`): 장르 문자열, 예: `"발라드"` (String)
  - `5` (`likes`): 멜론 좋아요 수 (Number)
  - `6` (`is_title`): 타이틀곡 여부 (`1`: 타이틀곡, `0`: 수록곡)
  - `7` (`in_giant`): 메인 대륙 포함 여부 (`1`: 96.77% 메인 대륙 포함 곡, `0`: 소규모 독립 섬 곡)

- **`persons[person_id]` 인덱스 규약 (길이 2 배열):**
  - `0` (`name`): 인물 또는 그룹 표시명 (String)
  - `1` (`is_group`): 그룹 여부 (`1`: 그룹 노드, `0`: 개인 창작자/가창자 노드)
  - *참고:* `person_id`는 멜론 고유 숫자 ID(`"4676"`), 미등록 창작자 구제 ID(`"name_장경수"`), 가창자 가상 ID(`"singer_..."`), 그룹 가상 ID(`"group_..."`) 형태가 모두 존재합니다.

- **양방향 인메모리 그래프 복원 규칙:**
  - 로더(Loader) 초기화 시 `song_edges`를 1회 순회하여 `song ➔ person` 맵과 역방향 `person ➔ song` 맵을 동시에 구축하고, `group_edges`를 순회하여 `member ⟷ group` 양방향 엣지(역할 코드 `6`: `"그룹소속"`)를 연결해야 합니다.

### 📁 [파일 2] `firebase_daily_quests_seed.json` (40.0 KB, 100일 치 시드)
Firestore `daily_quests` 컬렉션에 적재할 사전 검증된 데일리 퀘스트 배열입니다.
- **각 원소 객체의 키 구조:**
  - `"quest_id"`: 날짜 문자열 (`"YYYY-MM-DD"`)
  - `"start_song_id"`: 출발 곡 ID (String)
  - `"start_display"`: 출발 곡 표시명 (String)
  - `"target_song_id"`: 도착 곡 ID (String)
  - `"target_display"`: 도착 곡 표시명 (String)
  - `"optimal_turns"`: 최단 도달 턴 수 (`2` ~ `4` 사이의 Number)
  - `"optimal_path"`: 최단 경로 노드 ID 배열 (`["<start_song_id>", "<person_id_1>", "<song_id_2>", ..., "<target_song_id>"]`)

### 🔄 지속적 데이터 업데이트(Incremental DB Update) 보장 원칙
향후 데이터 파이프라인에서 나머지 자음(`ㅈ`, `ㅎ`, `A~Z`) 수집/패치가 완료되면 사용자는 오직 **`firebase_graph_bundle.json` 파일 1개만 새 버전으로 덮어쓰기** 할 것입니다. 따라서 웹 애플리케이션 코드는 특정 `song_id`나 곡 수를 하드코딩하지 말고, 언제나 `firebase_graph_bundle.json`을 동적으로 읽어 작동하도록 설계해야 합니다.