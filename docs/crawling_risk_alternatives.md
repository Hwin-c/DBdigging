# 🛡️ 크롤링 차단 리스크 및 데이터 수급 대안 비교 분석서 (`crawling_risk_alternatives.md`)

> **문서 기준 메타데이터 및 작성 원칙**
> - **기준 데이터셋 (`public/data/firebase_graph_bundle.json`):** `version = 2026-10-28 22:01:37` `[실측]`
> - **현재 수록 규모:** 한글 12개 자음군(`ㄱ, ㄴ, ㄷ, ㄹ, ㅁ, ㅂ, ㅅ, ㅇ, ㅊ, ㅋ, ㅌ, ㅍ`) 기준 곡 $N = 202,394$개 `[실측]`, 인물·그룹 $M = 65,608$개 `[실측]`, 정제 후 통합 엣지 $E = 619,039$개 `[실측]` (곡-인물 엣지 $611,242$개 + 그룹-멤버 엣지 $7,797$개)
> - **엄격 표기 원칙:**
>   1. 번들에서 직접 계측되지 않은 모든 추산 수치에는 **산출 계산식**과 **`[추정]`** 태그를 함께 기재합니다.
>   2. 외부 데이터 소스의 공식 API 문서 URL을 명시하고, 공식 문서에서 확인되지 않은 호출 쿼터나 정책은 **`미검증`**으로 표기합니다.
>   3. 법률 관련 항목은 단정적 결론을 배제하고 **`법적 검토 필요`** 항목으로 분류합니다.

---

## 1. 배경 및 리스크 정의

**<디비디깅(DBDIGGING)>**은 곡($V_{\text{song}}$)과 창작·가창 인물 및 그룹($V_{\text{person}}$)을 양방향 크레딧 역할(`1: 가창`, `2: 피처링`, `3: 작사`, `4: 작곡`, `5: 편곡`, `6: 그룹소속`)로 연결한 2-Mode 이부 네트워크 위에서 작동합니다.

현재 12개 한글 자음군의 수집·정제가 완료되었으나, 향후 **미수집 한글 자음군(`ㅈ`, `ㅎ`) 및 영문 아티스트군(`A~Z`)** 확장을 앞두고 다음과 같은 기술적·운영적 리스크에 대비해야 합니다.

### 1.1 미수집 구간(`ㅈ`, `ㅎ`, `A~Z`) 규모 및 요청량 산출
1. **기수집 12개 자음군 평균 곡 수:**
   $$\text{자음당 평균 곡 수} = \frac{202,394\text{곡}}{12\text{개 자음}} \approx 16,866.17\text{곡/자음} \quad \text{[추정]}$$
2. **미수집 한글 자음 2개(`ㅈ`, `ㅎ`) 단순 비례 물량:**
   $$N_{\text{ㅈ,ㅎ}} = 16,866.17 \times 2 \approx 33,732\text{곡} \quad \text{[추정]}$$
3. **영문 아티스트군(`A~Z`) 포함 잔여 수집 물량 범위:**
   - 영문 활동명 아티스트군의 합산 규모를 한글 자음군 3~6개 분량으로 가정할 경우:
   $$N_{\text{A~Z}} = 16,866.17 \times 3 \sim 16,866.17 \times 6 \approx 50,599 \sim 101,197\text{곡} \quad \text{[추정]}$$
   - 따라서 잔여 수집 대상 전체 곡 수($N_{\text{rem}}$)는 다음과 같이 추산됩니다:
   $$N_{\text{rem}} = N_{\text{ㅈ,ㅎ}} + N_{\text{A~Z}} \approx 84,331 \sim 134,929\text{곡} \quad \text{[추정]}$$
4. **단일 곡 상세 페이지(크레딧 포함) 1건당 HTTP 요청 1회 가정 시 소요 시간:**
   - 요청 간격 $\Delta t = 1.5\text{초/곡}$ (초당 $0.67$회 요청) 적용 시 순수 네트워크 소요 시간:
   $$T_{\text{crawl}} = \frac{84,331 \sim 134,929\text{회} \times 1.5\text{초}}{3,600\text{초/시간}} \approx 35.14 \sim 56.22\text{시간} \quad \text{[추정]}$$

### 1.2 기술적 크롤링 차단 리스크 유형
- **IP 기반 속도 제한(Rate-Limiting) 및 영구/일시 차단(403 / 429 응답):** 클라우드(Colab/GCP/AWS) 대역 IP에 대한 WAF(Web Application Firewall) 차단 및 CAPTCHA 강제 전환 위험.
- **DOM 구조 및 내부 엔드포인트 변경:** 원본 플랫폼의 프론트엔드 개편 시 HTML 셀렉터 파손으로 인한 크레딧(작사·작곡·편곡) 누락 위험.
- **단일 장애점(SPOF) 의존성:** 단일 음원 플랫폼의 크레딧 표기 오류나 누락이 게임 그래프의 고립 섬($202,394 - 194,988 = 7,406$곡 `[실측]`)으로 직결되는 구조적 한계.

---

## 2. 대안 데이터 소스 비교 (KOMCA / MusicBrainz / Discogs)

멜론 단일 크롤링이 차단되거나 데이터를 교차 보강해야 할 경우 활용 가능한 3대 외부 음악 메타데이터 소스의 기술적·운영상 특성을 비교합니다.

### 2.1 3대 대안 소스 핵심 스펙 및 공식 API 문서 비교표

| 비교 항목 | ① KOMCA (한국음악저작권협회) | ② MusicBrainz (MetaBrainz) | ③ Discogs |
| :--- | :--- | :--- | :--- |
| **공식 웹사이트 / API 문서 URL** | - 저작물 검색: `https://www.komca.or.kr/srch2/srch_01.jsp`<br>- 공공데이터포털: `https://www.data.go.kr/` | - API 문서: `https://musicbrainz.org/doc/MusicBrainz_API`<br>- Rate Limit: `https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting`<br>- DB 덤프: `https://musicbrainz.org/doc/MusicBrainz_Database/Download` | - 개발자 포털: `https://www.discogs.com/developers`<br>- Rate Limit: `https://www.discogs.com/developers#page:home,header:home-rate-limiting`<br>- 월간 덤프: `https://data.discogs.com/` |
| **공식 공개 REST API 유무** | 외부 개발자용 공개 크레딧 원장 REST API 별도 문서 미제공 (**`미검증`**) | **제공** (`Web Service v2`, JSON/XML 지원) | **제공** (`Discogs API v2.0`, JSON 지원) |
| **공식 호출 쿼터 (Rate Limit)** | **`미검증`** (공개 API 쿼터 정책 미고시) | - 기본 **초당 1회 (`1 req/sec`)** (유효 `User-Agent` 헤더 필수, 공식 문서 명시)<br>- 일일 총량 하드 캡 및 상용 별도 쿼터: **`미검증`** | - 인증 시 **분당 60회 (`60 req/min`)**<br>- 비인증 시 **분당 25회 (`25 req/min`)**<br>- 일일 총량 상한(Daily Cap): **`미검증`** |
| **벌크 데이터 덤프 (Bulk Dump)** | 미제공 (**`미검증`**) | **제공** (PostgreSQL 전체 덤프 월 2회/주간 스냅샷, 핵심 데이터 **CC0 퍼블릭 도메인**) | **제공** (월간 XML 덤프 `releases`, `artists`, `masters`, **CC0 퍼블릭 도메인**) |
| **K-Pop 크레딧 커버리지** | 국내 공표 음원의 **작사·작곡·편곡(`Role 3, 4, 5`)** 원장 기준 가장 방대하나, 가창/그룹 계보(`Role 6`) 및 멜론 곡 ID 매핑이 부재함 | 글로벌 팬덤이 있는 아이돌 타이틀곡 및 최신 K-Pop 커버리지는 양호하나, 국내 인디·트로트·구보 수록곡의 작사/작곡/편곡 관계(`Work-Recording Relationship`) 누락 존재 | 실물 음반(CD/LP) 중심 크레딧이 상세하나, 디지털 싱글 위주 국내 음원 및 한글/영문 로마자 표기 불일치(`Romanization`) 해소가 필요함 |
| **엔티티 식별자 체계** | 저작물코드 + 저작자명 (외부 공개 화면에서 동명이인 고유 번호 일부 마스킹/비노출) | **MBID (UUID v4)** — 동명이인 아티스트와 그룹(`Group` vs `Person`)이 스키마 차원에서 완벽히 분리됨 | **Discogs Artist ID (정수형)** — 동명이인 아티스트에 번호 접미사(`Artist (2)`) 및 별도 숫자 ID 부여, `members`/`groups` 배열 기본 제공 |

---

### 2.2 각 대안별 잔여 물량($100,000$곡 가정) 조회 시 소요 시간 추산

잔여 수집 또는 교차 검증 대상 곡 수를 $N_{\text{target}} = 100,000\text{곡}$ `[추정]`으로 가정할 때, API 호출 방식과 벌크 덤프(Bulk Dump) 방식의 처리 시간 차이는 다음과 같습니다.

1. **MusicBrainz REST API (`1 req/sec`) 직접 호출 시:**
   - 곡 검색(`recording`) 1회 + 작사·작곡 관계(`work` relation) 상세 조회 1회 = 곡당 $2\text{회}$ 요청 가정 `[추정]`:
   $$T_{\text{MB\_API}} = \frac{100,000\text{곡} \times 2\text{회/곡}}{1\text{회/초} \times 3,600\text{초/시간}} = \frac{200,000\text{초}}{3,600} \approx 55.56\text{시간 (약 2.31일)} \quad \text{[추정]}$$
2. **Discogs REST API (인증 `60 req/min` = `1 req/sec`) 직접 호출 시:**
   - 곡/릴리즈 검색 1회 + 릴리즈 상세 크레딧 조회 1회 = 곡당 $2\text{회}$ 요청 가정 `[추정]`:
   $$T_{\text{Discogs\_API}} = \frac{100,000\text{곡} \times 2\text{회/곡}}{60\text{회/분} \times 60\text{분/시간}} = \frac{200,000\text{분}}{3,600} \approx 55.56\text{시간 (약 2.31일)} \quad \text{[추정]}$$
3. **MusicBrainz / Discogs 공식 CC0 벌크 덤프(Bulk Dump) 로컬 파싱 시:**
   - 네트워크 API 쿼터 제한(Rate-Limit) 영향을 받지 않으며, 로컬 스트리밍 파서(Node.js/Python)로 초당 $5,000\text{건}$ 처리 가정 시:
   $$T_{\text{Bulk\_Parse}} = \frac{100,000\text{곡}}{5,000\text{곡/초}} = 20\text{초 (덤프 다운로드 및 인덱싱 별도)} \quad \text{[추정]}$$

---

## 3. 스키마 호환성 및 하이브리드 어댑터(ETL) 설계 전략

GEMINI.md의 **지속적 데이터 업데이트(Incremental DB Update) 보장 원칙**에 따라, 데이터 소스가 다변화되더라도 프론트엔드 웹앱이 읽는 최종 정적 번들(`public/data/firebase_graph_bundle.json`)의 스키마는 불변으로 유지합니다.

### 3.1 외부 소스 ➔ `firebase_graph_bundle.json` 스키마 매핑 규약

| 번들 타겟 필드 (`GEMINI.md` 규약) | MusicBrainz 매핑 필드 | Discogs 매핑 필드 | KOMCA 매핑 필드 |
| :--- | :--- | :--- | :--- |
| `songs[id][0]` (`title`) | `recording.title` | `track.title` | 저작물명 (`cleanSongTitle` 적용) |
| `songs[id][1]` (`artist`) | `artist-credit` 결합 문자열 | `artists[].name` 결합 문자열 | 가창자명 |
| `songs[id][3]` (`year`) | `first-release-date` 앞 4자리 | `release.year` 문자열 | 공표연도 앞 4자리 |
| `role_codes: 1` (`가창`) | `recording-artist` (`vocal` / main) | `Release.artists` | 가창자 |
| `role_codes: 2` (`피처링`) | `artist-credit` (`feat.` joinphrase) | `extraartists` (`Featuring`) | - |
| `role_codes: 3` (`작사`) | `work-artist` (`lyricist` relation) | `extraartists` (`Lyrics By`, `Written-By`) | `A` (작사) |
| `role_codes: 4` (`작곡`) | `work-artist` (`composer` relation) | `extraartists` (`Composed By`, `Music By`) | `C` (작곡) |
| `role_codes: 5` (`편곡`) | `recording/work` (`arranger` relation) | `extraartists` (`Arranged By`) | `AR` (편곡) |
| `role_codes: 6` (`그룹소속`) | `artist-artist` (`member of band`) | `artist.members` / `artist.groups` | - |

### 3.2 단계적 수집·폴백(Fallback) 아키텍처 권장안
1. **1차 (정적 스냅샷 버전 보존 및 체크포인트 분할):**
   - 이미 확보된 202,394곡 `[실측]` 번들을 불변 베이스라인으로 보존하고, 추가 수집(`ㅈ`, `ㅎ`, `A~Z`)은 아티스트 청크(Chunk) 단위 체크포인트와 지수 백오프(Exponential Backoff)를 적용하여 차단 위험을 낮춥니다.
2. **2차 (CC0 벌크 덤프 기반 오프라인 보강):**
   - 실시간 API 쿼터 소모 없이 **MusicBrainz 및 Discogs의 공식 CC0 데이터 덤프**를 오프라인 파이프라인(Colab)에서 파싱하여 그룹-멤버 계보(`group_edges`)와 글로벌 K-Pop 크레딧을 교차 보강합니다.
3. **3차 (유저 제보 기반 크라우드소싱 패치 레이어):**
   - 인게임에서 누락된 크레딧이나 동명이인 분리 오류를 발견한 유저가 출처 URL과 함께 패치를 제안하면, 검수 후 다음 번들 빌드 시 병합하는 방식을 병행할 수 있습니다.

---

## 4. 법률적 리스크 점검 항목 (`법적 검토 필요`)

> **주의 (Disclaimer):** 아래 내용은 엔지니어링 아키텍처 설계 시 고려해야 할 관련 법령 조항을 정리한 것으로 법률 자문을 대체하지 않으며, 상용 서비스 전환 또는 배포 범위 확대 전 반드시 지식재산권 전문 변호사를 통한 **법적 검토 필요** 대상입니다.

### 4.1 저작권법 제93조 (데이터베이스제작자의 권리) — `법적 검토 필요`
- **관련 조문:** 대한민국 저작권법 제93조 제1항은 *"데이터베이스제작자는 그의 데이터베이스의 전부 또는 상당한 부분을 복제·배포·방송 또는 전송할 권리를 가진다"*고 규정하며, 제2항에서 *"데이터베이스의 개별 소재는 제1항의 규정에 의한 보호대상이 되지 아니한다"*고 명시하고 있습니다.
- **검토 쟁점 (`법적 검토 필요`):**
  1. 곡 제목, 아티스트명, 발매연도, 작사·작곡·편곡자 성명 등 **개별 사실 정보(Fact) 자체는 저작권법상 창작성이 있는 저작물에 해당하지 않을 가능성**이 있으나,
  2. 특정 음원 플랫폼이 인적·물적 투자를 통해 수집·검증·체계화한 수십만 곡 규모의 메타데이터를 자동화 스크립트로 반복 추출하여 인메모리 번들로 배포하는 행위가 **'데이터베이스의 상당한 부분의 복제·전송'**에 해당하는지 여부는 **법적 검토 필요** 항목입니다.
  3. 반면 **MusicBrainz Core Data 및 Discogs Monthly Dump**는 공식적으로 **CC0(Public Domain Dedication)** 라이선스로 배포되므로, 해당 오픈 데이터 덤프를 활용하는 영역은 데이터베이스권 침해 리스크를 구조적으로 낮출 수 있는지 **법적 검토 필요** 대상입니다.

### 4.2 부정경쟁방지 및 영업비밀보호에 관한 법률 제2조 제1호 (파)목 — `법적 검토 필요`
- **관련 조문:** 부정경쟁방지법 제2조 제1호 (파)목은 *"그 밖에 타인의 상당한 투자나 노력으로 만들어진 성과 등을 공정한 상거래 관행이나 경쟁질서에 반하는 방법으로 자신의 영업을 위하여 무단으로 사용함으로써 타인의 경제적 이익을 침해하는 행위"*를 부정경쟁행위로 규정합니다.
- **검토 쟁점 (`법적 검토 필요`):**
  1. **영리성 및 시장 대체 여부:** <디비디깅>은 음원을 스트리밍하거나 가사 전문을 제공하지 않으며, 오히려 결과 화면 및 카드에서 `getMelonSongUrl(songId)`를 통해 원본 플랫폼의 곡 상세 페이지로 트래픽을 보내는 아웃링크(Out-link) 구조를 취하고 있습니다. 이러한 보완적 구조가 '타인의 경제적 이익 침해' 여부를 판단할 때 어떻게 참작되는지 **법적 검토 필요**합니다.
  2. **자동화 크롤링과 약관(ToS) 관계:** 원본 웹사이트의 이용약관 및 `robots.txt` 정책 위반 여부가 '공정한 상거래 관행이나 경쟁질서에 반하는 방법' 판단에 미치는 영향, 그리고 비상업적 포트폴리오/연구 목적 운영과 향후 광고·후원 등 수익화 모델 도입 시의 법적 책임 차이에 대해 사전 **법적 검토 필요**합니다.
