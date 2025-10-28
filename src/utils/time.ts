export enum TimeUnit {
  Milliseconds = 1,
  Seconds = 1000,
  Minutes = 60 * 1000,
  Hours = 60 * 60 * 1000,
  Days = 24 * 60 * 60 * 1000,
}

export function fromMills(
  value: number,
  timeUnit: TimeUnit = TimeUnit.Milliseconds
): number {
  return value * timeUnit;
}

export function toMills(
  value: number,
  timeUnit: TimeUnit = TimeUnit.Milliseconds
): number {
  return value / timeUnit;
}

export function sleep(
  value: number,
  timeUnit: TimeUnit = TimeUnit.Milliseconds,
  abortSignal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, value * timeUnit);
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        reject(new Error("Sleep aborted"));
      });
    }
  });
}

export function nowWall(): number {
  return Date.now();
}

export function nowMono(): number {
  return performance.now();
}
