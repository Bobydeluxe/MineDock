import { EventEmitter } from 'node:events';
import type { AppEvent } from '../domain/types';
export class EventBus {
  private readonly emitter = new EventEmitter();
  emit(event: AppEvent): void {
    this.emitter.emit('event', event);
  }
  subscribe(listener: (event: AppEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
