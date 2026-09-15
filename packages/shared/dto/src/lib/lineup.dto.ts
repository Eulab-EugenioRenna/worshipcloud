export const LINEUP_ITEM_TYPES = [
  'Song',
  'Bible',
  'Slide',
  'Image',
  'Video',
  'Audio',
  'Countdown',
  'Clock',
  'Sermon',
  'Text',
  'Blank',
] as const;

export type LineupItemType = (typeof LINEUP_ITEM_TYPES)[number];

export interface LineupItemDto {
  readonly id: string;
  readonly serviceId: string;
  readonly type: LineupItemType;
  readonly title: string;
  readonly position: number;
  readonly sourceId?: string;
  readonly notes?: string;
}

export interface CreateLineupItemDto {
  readonly type: LineupItemType;
  readonly title: string;
  readonly sourceId?: string;
  readonly notes?: string;
}

export interface ReorderLineupDto {
  readonly itemIds: readonly string[];
}
