# DBdigging 작업 규칙 (Phase 16~)

## 서비스
- 공개 API 기반 크레딧 + 소리 디깅 웹 도구. Next.js 정적 export, Firebase Hosting(프로젝트 db-digging)
- 기획 문서: Notion "HEXA - 정기 세미나(디비디깅)" > 개발 일지 > Phase 16 MVP 기획안

## 데이터 규칙
- 멜론 크롤링 데이터와 그 데이터에 의존하는 코드는 사용하지 않는다 (legacy-melon-game 태그에만 보존)
- 서버, 데이터베이스, 비밀 키를 추가하지 않는다. 모든 외부 호출은 브라우저에서 한다
- MusicBrainz: 요청 간격 1100ms 이상, fmt=json, 캐시 사용 (초당 1회 초과 시 IP 차단 위험)
- ReccoBeats: 요청 간격 300ms 이상, /v1/track?ids=<ISRC>로 조회
- Deezer: JSONP만 가능, 미리듣기 URL은 만료되므로 저장 금지
- iTunes Search: CORS 가능, 분당 약 20회 제한(비공식)
- YouTube: 공식 임베드 재생만, 음원 추출 금지
- 외부 API 응답 구조는 추측하지 말고 실제 응답을 확인한 뒤 타입을 작성한다

## 화면 규칙
- 이모지 금지, 보라 그라데이션 금지, 모바일 우선 1열
- 하단에 출처 표시: Data: MusicBrainz (CC0) · Audio features: ReccoBeats · Preview: Deezer / Apple Music · 비상업 프로젝트

## 작업 규칙
- 작업 브랜치: feat/swipe-dig. 커밋은 단계별로 나눈다
- 단계마다 npx tsc --noEmit, npm run build 확인 후 firebase hosting:channel:deploy mvp
- 확인을 받아야 하는 작업: main 병합, 운영 배포(firebase deploy), force push, Hosting 설정 변경
- 보고는 한국어로 짧게. 단계마다 빌드 결과와 미리보기 주소를 포함한다

## Phase 18 구조 (스와이프 디깅)
- 화면 `/?dig=<녹음 MBID>`: 대기열·후보 수집은 `src/lib/deck.ts`(Deck), 화면은 `src/components/swipe/`. 기존 목록 화면은 `?view=list`(DigApp)
- 조작은 넘기기(왼쪽)·담기(오른쪽)뿐. 담기 = 노트 저장 + 방향: 사람별 비중 `WEIGHT`(시작 곡 인물 1.0, 담으면 그 곡 크레딧 인물 +1.0, 넘기면 −0.3, 최소 0.2)에 비례해 다음 후보 인물을 뽑는다
- 소리 방향(비슷하게·더 신나게·더 잔잔하게·새롭게)은 대기열 정렬만 바꾸고, 카드의 인물 이름을 누르면 그 사람에게 집중(비중 ×8). 다양성 규칙(같은 가수 5장에 1곡, 3장마다 다른 분위기)은 `DECK` 상수
- 오디오는 audio 요소 하나(`src/lib/preview.ts`의 player). 넘기기·담기는 먼저 `player.stop()`, 재생 요청은 번호(seq)로 늦게 온 이전 요청을 버린다. 미리듣기 URL은 메모리에만 둔다
- 디자인은 흰 배경·흑백·LP 슬리브 컨셉이고 `.claude/skills/frontend-design` 스킬을 따른다. 승인된 출처 추가: 하단에 "Cover: Cover Art Archive"
