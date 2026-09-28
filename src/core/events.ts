type Handler<T> = (payload: T) => void;

/** Minimal typed event bus: the simulation announces, the UI and audio listen. */
export class Emitter<Events extends object> {
  private handlers: { [K in keyof Events]?: Handler<Events[K]>[] } = {};

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    const list = (this.handlers[type] ??= []);
    list.push(handler);
    return () => list.splice(list.indexOf(handler), 1);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    for (const handler of this.handlers[type] ?? []) handler(payload);
  }
}
