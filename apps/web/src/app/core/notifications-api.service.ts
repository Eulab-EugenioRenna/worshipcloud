import {
  NotificationPageSchema,
  NotificationSchema,
  NotificationUnreadCountSchema,
  MessageResponseSchema,
  type NotificationDto,
  type NotificationListQueryDto,
  type NotificationPageDto,
  type NotificationUnreadCountDto,
  type MessageResponseDto,
} from '@worship/shared-dto';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly http = inject(HttpClient);

  list(query: NotificationListQueryDto): Observable<NotificationPageDto> {
    let params = new HttpParams()
      .set('organizationId', query.organizationId)
      .set('limit', query.limit)
      .set('unreadOnly', query.unreadOnly);
    if (query.cursor) params = params.set('cursor', query.cursor);
    return this.http
      .get<unknown>('/api/v1/notifications', { params })
      .pipe(map((value) => NotificationPageSchema.parse(value)));
  }

  unreadCount(organizationId: string): Observable<NotificationUnreadCountDto> {
    return this.http
      .get<unknown>('/api/v1/notifications/unread-count', {
        params: { organizationId },
      })
      .pipe(map((value) => NotificationUnreadCountSchema.parse(value)));
  }

  markRead(notificationId: string): Observable<NotificationDto> {
    return this.http
      .patch<unknown>(`/api/v1/notifications/${notificationId}/read`, {})
      .pipe(map((value) => NotificationSchema.parse(value)));
  }

  markAllRead(organizationId: string): Observable<MessageResponseDto> {
    return this.http
      .patch<unknown>(
        '/api/v1/notifications/read-all',
        {},
        { params: { organizationId } },
      )
      .pipe(map((value) => MessageResponseSchema.parse(value)));
  }
}
