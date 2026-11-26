/**
 * Serialises git commands on one cache repository.
 *
 * Two shallow fetches into the same cache race on its `shallow` file, and the
 * loser dies with "shallow file has changed since we read it": a sync answered
 * 500. Commands on different repositories still run side by side.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const repoQueues = new Map<string, Promise<unknown>>();
/** The repositories the current call chain already holds: nesting is free. */
const heldRepos = new AsyncLocalStorage<Set<string>>();

// ponytail: in-process lock; several backend processes on one cache directory
// would need a lock file, the retry below only softens that case.
export function runInRepo<T>(repoPath: string, task: () => Promise<T>): Promise<T> {
  const held = heldRepos.getStore();
  if (held?.has(repoPath)) {
    return task();
  }

  const holding = new Set(held).add(repoPath);
  const previous = repoQueues.get(repoPath) ?? Promise.resolve();
  const current = previous.then(() =>
    heldRepos.run(holding, () => retryOnShallowRace(task)),
  );
  const settled = current.catch(() => {});
  repoQueues.set(repoPath, settled);
  void settled.then(() => {
    if (repoQueues.get(repoPath) === settled) {
      repoQueues.delete(repoPath);
    }
  });
  return current;
}

async function retryOnShallowRace<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    const stderr = String((error as { stderr?: unknown })?.stderr ?? "");
    if (!stderr.includes("shallow file has changed since we read it")) {
      throw error;
    }
    return task();
  }
}
