export const LIVE_ACTIONS = [
  'Previous',
  'Next',
  'Take',
  'Clear',
  'Blackout',
  'Logo',
  'Pause',
] as const;

export type LiveAction = (typeof LIVE_ACTIONS)[number];

export const OUTPUT_TYPES = [
  'Main Screen',
  'Stage Screen',
  'Streaming',
  'Lobby',
  'Confidence Monitor',
] as const;

export type OutputType = (typeof OUTPUT_TYPES)[number];

export interface LiveCueDto {
  readonly id: string;
  readonly lineupItemId: string;
  readonly title: string;
  readonly content: string;
}

export interface LiveStateDto {
  readonly sessionId: string;
  readonly serviceId: string;
  readonly preview: LiveCueDto | null;
  readonly program: LiveCueDto | null;
  readonly programOwnerId: string | null;
}
