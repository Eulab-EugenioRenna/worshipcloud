import {
  IdSchema,
  NotificationListQuerySchema,
  type AuthPrincipalDto,
  type MessageResponseDto,
  type NotificationDto,
  type NotificationListQueryDto,
  type NotificationPageDto,
  type NotificationUnreadCountDto,
} from '@worship/shared-dto';
import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Query(new ZodValidationPipe(NotificationListQuerySchema))
    query: NotificationListQueryDto,
  ): Promise<NotificationPageDto> {
    return this.notifications.list(principal.userId, query);
  }

  @Get('unread-count')
  unreadCount(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Query('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
  ): Promise<NotificationUnreadCountDto> {
    return this.notifications.unreadCount(principal.userId, organizationId);
  }

  @Patch(':notificationId/read')
  markRead(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('notificationId', new ZodValidationPipe(IdSchema))
    notificationId: string,
  ): Promise<NotificationDto> {
    return this.notifications.markRead(principal.userId, notificationId);
  }

  @Patch('read-all')
  async markAllRead(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Query('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
  ): Promise<MessageResponseDto> {
    await this.notifications.markAllRead(principal.userId, organizationId);
    return { message: 'Notifications marked as read' };
  }
}
