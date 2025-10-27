import { nowMono, nowWall } from './time';

export interface TimelineSegment {
  nodeId: string;
  kind: string;
  waiting: boolean;
  startedWall: number;
  endedWall: number;
  durationMs: number;
  activeMs: number;
  waitingMs: number;
  attempt: number;
}

interface StackEntry {
  nodeId: string;
  kind: string;
  waiting: boolean;
  startedMono: number;
  startedWall: number;
  attempt: number;
}

export class Timeline {
  private readonly startedWall = nowWall();
  private readonly startedMono = nowMono();
  private activeMs = 0;
  private waitingMs = 0;
  private segments: TimelineSegment[] = [];
  private stack: StackEntry[] = [];
  private attempts = new Map<string, number>();

  enter(nodeId: string, kind: string, waiting: boolean): void {
    const attempt = (this.attempts.get(nodeId) ?? 0) + 1;
    this.attempts.set(nodeId, attempt);
    this.stack.push({
      nodeId,
      kind,
      waiting,
      startedMono: nowMono(),
      startedWall: nowWall(),
      attempt
    });
  }

  leave(): TimelineSegment {
    const entry = this.stack.pop();
    if (!entry) {
      throw new Error('Timeline.leave called with empty stack');
    }
    const endedMono = nowMono();
    const endedWall = nowWall();
    const durationMs = endedMono - entry.startedMono;
    const activeMs = entry.waiting ? 0 : durationMs;
    const waitingMs = entry.waiting ? durationMs : 0;

    this.activeMs += activeMs;
    this.waitingMs += waitingMs;

    const segment: TimelineSegment = {
      nodeId: entry.nodeId,
      kind: entry.kind,
      waiting: entry.waiting,
      startedWall: entry.startedWall,
      endedWall,
      durationMs,
      activeMs,
      waitingMs,
      attempt: entry.attempt
    };
    this.segments.push(segment);
    return segment;
  }

  getSegments(): TimelineSegment[] {
    return [...this.segments];
  }

  getTotals(nowOverride?: number): { wall: number; active: number; waiting: number } {
    const wall = (nowOverride ?? nowMono()) - this.startedMono;
    return { wall, active: this.activeMs, waiting: this.waitingMs };
  }
}
