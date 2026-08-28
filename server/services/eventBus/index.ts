import { EventEmitter } from 'events';
import { ProkrayaEvent, EventHandler, AllEvents } from './events';

class EventBus {
  private emitter: EventEmitter;
  private handlers: Map<string, EventHandler<any>[]>;

  constructor() {
    this.emitter = new EventEmitter();
    this.handlers = new Map();
    this.emitter.setMaxListeners(200);
  }

  subscribe<T extends ProkrayaEvent>(eventType: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
      
      this.emitter.on(eventType, async (event: T) => {
        const eventHandlers = this.handlers.get(eventType) || [];
        for (const h of eventHandlers) {
          try {
            await h.onEvent(event);
          } catch (error) {
            console.error(`[EventBus] Error in handler for ${eventType}:`, error);
          }
        }
      });
    }
    
    this.handlers.get(eventType)!.push(handler);
    console.log(`[EventBus] Handler registered for: ${eventType}`);
  }

  publish(event: AllEvents): void {
    console.log(`[EventBus] Publishing event: ${event.eventType}`);
    this.emitter.emit(event.eventType, event);
  }

  async publishAsync(event: AllEvents): Promise<void> {
    console.log(`[EventBus] Publishing event (async): ${event.eventType}`);
    const handlers = this.handlers.get(event.eventType) || [];
    
    for (const handler of handlers) {
      try {
        await handler.onEvent(event);
      } catch (error) {
        console.error(`[EventBus] Error in async handler for ${event.eventType}:`, error);
      }
    }
  }

  getRegisteredEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export const eventBus = new EventBus();
export { EventBus };
