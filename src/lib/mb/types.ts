/**
 * MusicBrainz ws/2 JSON 응답 타입.
 * 2026-11-19 실제 응답(Flutter / Hearts2Hearts, Kenzie, Get Lucky)을 확인해 필요한 필드만 정의.
 */

export interface MbArtistRef {
  id: string;
  name: string;
  "sort-name": string;
  disambiguation: string;
  type?: string | null;
  country?: string | null;
}

export interface MbArtistCredit {
  name: string;
  joinphrase: string;
  artist: MbArtistRef;
}

export interface MbReleaseRef {
  id: string;
  title: string;
  date?: string;
  status?: string | null;
}

export interface MbRecordingRef {
  id: string;
  title: string;
  disambiguation: string;
  length: number | null;
  video: boolean;
}

export interface MbWorkRef {
  id: string;
  title: string;
  disambiguation: string;
  type?: string | null;
  relations?: MbRelation[];
}

export interface MbUrlRef {
  id: string;
  resource: string;
}

export interface MbRelation {
  type: string;
  "type-id": string;
  direction: "forward" | "backward";
  "target-type": "artist" | "work" | "recording" | "url" | "release" | string;
  attributes: string[];
  "attribute-values": Record<string, string>;
  "target-credit"?: string;
  artist?: MbArtistRef;
  work?: MbWorkRef;
  recording?: MbRecordingRef;
  url?: MbUrlRef;
}

export interface MbSearchRecording {
  id: string;
  score: number;
  title: string;
  length?: number | null;
  video?: boolean | null;
  disambiguation?: string;
  "first-release-date"?: string;
  "artist-credit"?: MbArtistCredit[];
  isrcs?: string[];
  releases?: MbReleaseRef[];
}

export interface MbSearchResponse {
  count: number;
  offset: number;
  recordings: MbSearchRecording[];
}

export interface MbRecordingLookup {
  id: string;
  title: string;
  length: number | null;
  video: boolean;
  disambiguation: string;
  "first-release-date"?: string;
  "artist-credit": MbArtistCredit[];
  isrcs: string[];
  releases: MbReleaseRef[];
  relations: MbRelation[];
}

export interface MbArtistLookup {
  id: string;
  name: string;
  "sort-name": string;
  disambiguation: string;
  type: string | null;
  country: string | null;
  relations: MbRelation[];
}

/** GET /recording?work=<mbid>&inc=artist-credits+isrcs (browse) */
export interface MbRecordingBrowse {
  "recording-count": number;
  "recording-offset": number;
  recordings: Array<{
    id: string;
    title: string;
    length: number | null;
    video: boolean;
    disambiguation: string;
    "first-release-date"?: string;
    "artist-credit": MbArtistCredit[];
    isrcs?: string[];
  }>;
}
