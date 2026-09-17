import type { DomainEventDto } from '@worship/shared-dto';
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EventBusService {
  private readonly subject = new Subject<DomainEventDto>();
  private readonly seenEventIds = new Set<string>();
  readonly events$ = this.subject.asObservable();

  publish(event: DomainEventDto): void {
    if (this.seenEventIds.has(event.id)) return;
    this.seenEventIds.add(event.id);
    if (this.seenEventIds.size > 10_000) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest) this.seenEventIds.delete(oldest);
    }
    this.subject.next(event);
  }
}
