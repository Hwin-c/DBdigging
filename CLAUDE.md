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
- 작업 브랜치: feat/credit-dig. 커밋은 단계별로 나눈다
- 단계마다 npx tsc --noEmit, npm run build 확인 후 firebase hosting:channel:deploy mvp
- 확인을 받아야 하는 작업: main 병합, 운영 배포(firebase deploy), force push, Hosting 설정 변경
- 보고는 한국어로 짧게. 단계마다 빌드 결과와 미리보기 주소를 포함한다
