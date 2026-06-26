/**
 * Minimal async code runner for the Develop → Code tool.
 *
 * Runs the user's own script (local, their machine) with a tiny injected API:
 *   pose(name)        send a named pose
 *   move([6])         send six finger positions (0..1000)
 *   sleep(ms)         await a delay (cancellable)
 *   log(...args)      print to the output console
 *   state()           snapshot of the latest device frame
 * Not a security sandbox — it's a convenience harness for first-party scripting.
 */
export interface RunnerApi {
  pose: (name: string) => void;
  move: (positions: number[]) => void;
  state: () => unknown;
  onLog: (line: string) => void;
}

export interface RunHandle {
  cancel: () => void;
  promise: Promise<void>;
}

class Cancelled extends Error {}

export function runUserCode(code: string, api: RunnerApi): RunHandle {
  let cancelled = false;
  const timers = new Set<number>();

  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (cancelled) return reject(new Cancelled());
      const id = window.setTimeout(() => {
        timers.delete(id);
        cancelled ? reject(new Cancelled()) : resolve();
      }, Math.max(0, ms));
      timers.add(id);
    });

  const guard = <T extends unknown[]>(fn: (...a: T) => void) =>
    (...a: T) => {
      if (cancelled) throw new Cancelled();
      fn(...a);
    };

  const log = (...args: unknown[]) =>
    api.onLog(
      args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" "),
    );

  const fn = new Function(
    "pose", "move", "sleep", "log", "state",
    `return (async () => { ${code}\n })();`,
  );

  const promise = (async () => {
    try {
      await fn(guard(api.pose), guard(api.move), sleep, log, api.state);
      if (!cancelled) api.onLog("✓ finished");
    } catch (e) {
      if (e instanceof Cancelled) api.onLog("■ stopped");
      else api.onLog(`✗ ${(e as Error).message}`);
    }
  })();

  return {
    cancel: () => {
      cancelled = true;
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    },
    promise,
  };
}
