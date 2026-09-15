export const SONG_SECTION_TYPES = [
  'Verse',
  'Pre-Chorus',
  'Chorus',
  'Bridge',
  'Tag',
  'Ending',
] as const;

export type SongSectionType = (typeof SONG_SECTION_TYPES)[number];

export interface SongSectionDto {
  readonly id: string;
  readonly type: SongSectionType;
  readonly label: string;
  readonly content: string;
  readonly position: number;
}

export interface SongArrangementDto {
  readonly id: string;
  readonly name: string;
  readonly sectionIds: readonly string[];
}

export interface SongDto {
  readonly id: string;
  readonly title: string;
  readonly author?: string;
  readonly copyright?: string;
  readonly ccli?: string;
  readonly key?: string;
  readonly bpm?: number;
  readonly sections: readonly SongSectionDto[];
  readonly arrangements: readonly SongArrangementDto[];
}
