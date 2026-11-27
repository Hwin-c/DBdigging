/**
 * 시작 화면 예시 곡. 크레딧 후보가 5곡 이상 나오는지 직접 확인한 곡만 둔다.
 * (2026-11-19 MusicBrainz rid 검색으로 MBID·ISRC·앨범 묶음 확인)
 * 커버는 Cover Art Archive release-group 이미지, 없으면 Deezer(ISRC) 앨범 이미지.
 */
export interface ExampleSong {
  id: string;
  title: string;
  artist: string;
  isrc?: string;
  releaseGroupId?: string;
}

/** public/examples.json (scripts/build_examples.mjs가 만든다) */
export interface ExamplesFile {
  title: string;
  source: string;
  /** 기준 날짜 (YYYY-MM-DD) */
  date: string;
  songs: ExampleSong[];
}

export const EXAMPLES: ExampleSong[] = [
  {
    id: "eb18c447-5fbc-452d-8b87-d054ec52d723",
    title: "Flutter",
    artist: "Hearts2Hearts",
    isrc: "KRA302500478",
    releaseGroupId: "158311ee-7ed5-46a3-89e5-0e2ed6416a5c",
  },
  {
    id: "4d037b0c-bd99-4352-8fb7-43993597f109",
    title: "Supernova",
    artist: "aespa",
    isrc: "KRA302400090",
    releaseGroupId: "fa2db201-4629-464d-a1a3-86c9cbfc2564",
  },
  {
    id: "cf3b2fd9-e6cc-49bf-abf3-63a3af75a6dc",
    title: "밤편지",
    artist: "IU",
    isrc: "KRA381700611",
    releaseGroupId: "eb99a577-be58-4eb4-a0a2-f1860c3e5158",
  },
  {
    id: "097fffc7-3c8b-4496-ac0b-da999bdaa541",
    title: "Hype Boy",
    artist: "NewJeans",
    isrc: "USA2P2230222",
    releaseGroupId: "cad0949d-e2cc-4794-b4f0-1439907c1cbe",
  },
  {
    id: "833f00e1-781f-4edd-90e4-e52712618862",
    title: "Get Lucky",
    artist: "Daft Punk",
    isrc: "USQX91300108",
    releaseGroupId: "aa997ea0-2936-40bd-884d-3af8a0e064dc",
  },
  {
    id: "38e06968-af06-44ea-9eba-a1a275832767",
    title: "Uptown Funk",
    artist: "Mark Ronson, Bruno Mars",
    isrc: "GBARL1401524",
  },
];
