import type { LineupItemDto } from './lineup.dto';

export const SERVICE_STATUSES = [
  'Draft',
  'Planning',
  'Ready',
  'Live',
  'Completed',
] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export interface ServiceReadinessDto {
  readonly team: boolean;
  readonly media: boolean;
  readonly presentation: boolean;
  readonly outputs: boolean;
}

export interface CreateServiceDto {
  readonly title: string;
  readonly date: string;
  readonly time: string;
  readonly locationId: string;
  readonly responsibleUserId: string;
  readonly notes?: string;
}

export interface ServiceDto extends CreateServiceDto {
  readonly id: string;
  readonly organizationId: string;
  readonly status: ServiceStatus;
  readonly readiness: ServiceReadinessDto;
  readonly lineup: readonly LineupItemDto[];
}
