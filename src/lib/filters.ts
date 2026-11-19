/**
 * 추천 후보 제목 규칙.
 * - 반주 버전(inst, instrumental, karaoke, MR, 반주)은 후보에서 뺀다
 * - 언어·리믹스 등 버전 녹음은 같은 작품의 원곡이 있으면 대표로 쓰지 않는다
 */

/** 반주 표기 (영문은 단어 단위). "MR"은 별도 규칙 */
const BACKING_WORDS = /(^|[^\p{L}\p{N}])(inst\.?|instrumental|karaoke|off ?vocal)(?=$|[^\p{L}\p{N}])/iu;
const BACKING_KO = /반주|노래방/;
/**
 * MR 반주 표기.
 * - 대문자 "MR" 단어: "Song (MR)", "Song - MR", "MR ver."
 * - 괄호 안의 mr (대소문자 무관): "(Mr)", "[mr ver.]"
 * - 제외: "Mr. Chu", "Mr.Mr."처럼 점이 붙은 경우, "Mr Brightside"처럼 문장 속 단어
 */
const MR_UPPER = /(^|[^\p{L}\p{N}])MR(?![.\p{L}\p{N}])/u;
const MR_IN_BRACKETS = /[([{][^)\]}]*\bmr\b(?!\.)[^)\]}]*[)\]}]/i;

/** 제목에서 괄호 부분과 " - " 뒤 부분 (버전 표기가 붙는 자리) */
function titleSuffix(title: string): string {
  const brackets = [...title.matchAll(/[([{][^)\]}]*[)\]}]/g)].map((m) => m[0]).join(" ");
  const dashed = title.split(/\s[-–]\s/).slice(1).join(" ");
  return `${brackets} ${dashed}`;
}

export function isBackingTrack(title: string, disambiguation = ""): boolean {
  // 제목 본문 단어("Karaoke Night")는 보지 않고, 괄호·대시 뒤 표기와 disambiguation만 본다
  const text = `${titleSuffix(title)} ${disambiguation}`;
  return (
    BACKING_WORDS.test(text) ||
    BACKING_KO.test(text) ||
    MR_UPPER.test(title) ||
    MR_UPPER.test(disambiguation) ||
    MR_IN_BRACKETS.test(title) ||
    /^mr$/i.test(disambiguation.trim())
  );
}

/** 원곡이 아닌 버전 표기: 언어 버전, 리믹스, 라이브, 어쿠스틱, 편집본 등 */
const VERSION_WORDS =
  /(^|[^\p{L}\p{N}])(ver\.?|version|remix|remixed|mix|edit|live|acoustic|demo|sped ?up|slowed|japanese|english|chinese|korean|spanish|reprise|rearranged|bonus)(?=$|[^\p{L}\p{N}])/iu;
const VERSION_KO = /버전|리믹스|라이브|일본어|영어/;

/** 제목의 괄호·대시 뒤 부분과 disambiguation에서 버전 표기를 찾는다 (제목 본문 단어는 보지 않음) */
export function isVersionRecording(title: string, disambiguation = ""): boolean {
  const text = `${titleSuffix(title)} ${disambiguation}`;
  return VERSION_WORDS.test(text) || VERSION_KO.test(text);
}
