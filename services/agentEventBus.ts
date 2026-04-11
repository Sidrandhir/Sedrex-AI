// services/agentEventBus.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Agent Event Bus v1.0
//
// Singleton pub/sub channel. Agents emit events here; App.tsx
// subscribes and pipes them into the message's agentActivity[].
//
// Rules:
//   - emit() is fire-and-forget — never throws
//   - subscribe() returns an unsubscribe fn — always call it on cleanup
//   - clear() removes ALL listeners — call before each new message starts
//   - Events with status 'running' open a new activity item
//   - Events with status 'done' close the item matching the same id
// ══════════════════════════════════════════════════════════════════

export interface AgentEvent {
  id:        string;              // match running→done pairs by this id
  type:      'route' | 'agent' | 'search' | 'verify' | 'done';
  status:    'running' | 'done';
  icon:      string;              // single emoji
  label:     string;              // action label shown to user
  detail:    string;              // expandable content / sub-detail
  badge?:    string;              // pill tag e.g. "Search" | "Verify"
  timestamp: number;              // Date.now() at emit time
}

type Listener = (event: AgentEvent) => void;

class AgentEventBus {
  private listeners: Set<Listener> = new Set();

  emit(event: AgentEvent): void {
    // Never throw — event bus failures must be silent
    try {
      this.listeners.forEach(fn => fn(event));
    } catch { /* noop */ }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Remove all listeners. Call at the start of every new message. */
  clear(): void {
    this.listeners.clear();
  }
}

export const agentEventBus = new AgentEventBus();
