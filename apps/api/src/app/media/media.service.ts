import {
  MediaAssetSchema,
  type AuthPrincipalDto,
  type CreateMediaAssetRequestDto,
  type DomainEventPayloadDto,
  type MediaAssetDto,
  type MediaAssetKind,
  type MediaAssetListQueryDto,
  type UpdateMediaAssetRequestDto,
} from '@worship/shared-dto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from '../common/request-context.service';
import { PrismaService } from '../database/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { MediaAssetKind as DbMediaAssetKind } from '../../generated/prisma/client';

const KIND_TO_DB: Record<MediaAssetKind, DbMediaAssetKind> = {
  Image: 'IMAGE', Video: 'VIDEO', Audio: 'AUDIO', MotionBackground: 'MOTION_BACKGROUND', Logo: 'LOGO', CountdownVideo: 'COUNTDOWN_VIDEO',
};
const KIND_FROM_DB: Record<string, MediaAssetKind> = {
  IMAGE: 'Image', VIDEO: 'Video', AUDIO: 'Audio', MOTION_BACKGROUND: 'MotionBackground', LOGO: 'Logo', COUNTDOWN_VIDEO: 'CountdownVideo',
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly requestContext: RequestContextService,
  ) {}

  async list(userId: string, organizationId: string, query: MediaAssetListQueryDto): Promise<MediaAssetDto[]> {
    await this.requireMembership(userId, organizationId);
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        organizationId,
        ...(query.kind ? { kind: KIND_TO_DB[query.kind] } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return assets.map((asset) => this.toDto(asset));
  }

  async get(userId: string, organizationId: string, assetId: string): Promise<MediaAssetDto> {
    await this.requireMembership(userId, organizationId);
    return this.getRecord(organizationId, assetId);
  }

  async create(principal: AuthPrincipalDto, organizationId: string, input: CreateMediaAssetRequestDto): Promise<MediaAssetDto> {
    await this.requireEditor(principal.userId, organizationId);
    const { kind, ...data } = input;
    const asset = await this.prisma.mediaAsset.create({ data: { organizationId, ...data, kind: KIND_TO_DB[kind] } });
    await this.publish('media.asset.created', principal.userId, organizationId, asset.id, { title: asset.name });
    return this.toDto(asset);
  }

  async update(principal: AuthPrincipalDto, organizationId: string, assetId: string, input: UpdateMediaAssetRequestDto): Promise<MediaAssetDto> {
    await this.requireEditor(principal.userId, organizationId);
    await this.getRecord(organizationId, assetId);
    const { kind, ...data } = input;
    const asset = await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: { ...data, ...(kind ? { kind: KIND_TO_DB[kind] } : {}) },
    });
    await this.publish('media.asset.updated', principal.userId, organizationId, asset.id, { title: asset.name });
    return this.toDto(asset);
  }

  async remove(principal: AuthPrincipalDto, organizationId: string, assetId: string): Promise<void> {
    await this.requireEditor(principal.userId, organizationId);
    const asset = await this.getRecord(organizationId, assetId);
    const usage = await this.prisma.lineupItem.count({ where: { sourceId: assetId } });
    if (usage) {
      throw new BadRequestException('A media asset assigned to a service lineup cannot be deleted');
    }
    await this.prisma.mediaAsset.delete({ where: { id: assetId } });
    await this.publish('media.asset.deleted', principal.userId, organizationId, assetId, { title: asset.name });
  }

  private async getRecord(organizationId: string, assetId: string): Promise<MediaAssetDto> {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id: assetId, organizationId } });
    if (!asset) throw new NotFoundException('Media asset not found');
    return this.toDto(asset);
  }

  private async requireMembership(userId: string, organizationId: string): Promise<string[]> {
    const membership = await this.prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } }, select: { roles: true } });
    if (!membership) throw new ForbiddenException('Organization access denied');
    return membership.roles;
  }

  private async requireEditor(userId: string, organizationId: string): Promise<void> {
    const roles = await this.requireMembership(userId, organizationId);
    if (!roles.some((role) => role === 'OWNER' || role === 'ADMIN' || role === 'LEADER')) throw new ForbiddenException('Media editing requires Owner, Admin, or Leader role');
  }

  private publish(type: 'media.asset.created' | 'media.asset.updated' | 'media.asset.deleted', actorUserId: string, organizationId: string, subjectId: string, payload: DomainEventPayloadDto) {
    return this.events.publish({ type, actorUserId, organizationId, subjectId, payload, correlationId: this.requestContext.requestId ?? 'system' });
  }

  private toDto(record: { id: string; organizationId: string; name: string; kind: string; url: string; thumbnailUrl: string | null; durationMs: number | null; width: number | null; height: number | null; category: string | null; tags: string[]; createdAt: Date; updatedAt: Date }): MediaAssetDto {
    return MediaAssetSchema.parse({
      id: record.id, organizationId: record.organizationId, name: record.name, kind: KIND_FROM_DB[record.kind], url: record.url,
      ...(record.thumbnailUrl ? { thumbnailUrl: record.thumbnailUrl } : {}), ...(record.durationMs !== null ? { durationMs: record.durationMs } : {}), ...(record.width !== null ? { width: record.width } : {}), ...(record.height !== null ? { height: record.height } : {}), ...(record.category ? { category: record.category } : {}), tags: record.tags,
      createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    });
  }
}
