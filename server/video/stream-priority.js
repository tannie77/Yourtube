export function createStreamScheduler({ maxActive = 6, standardLimit = 3 } = {}) {
  let active = 0;
  let standardActive = 0;
  const priorityQueue = [];
  const standardQueue = [];

  function drain() {
    while (active < maxActive) {
      const entry = priorityQueue.shift() || (standardActive < standardLimit ? standardQueue.shift() : null);
      if (!entry) break;
      entry.signal?.removeEventListener("abort", entry.onAbort);
      active += 1;
      if (!entry.priority) standardActive += 1;
      let released = false;
      entry.resolve(() => {
        if (released) return;
        released = true;
        active -= 1;
        if (!entry.priority) standardActive -= 1;
        drain();
      });
    }
  }

  return {
    acquire(priority, signal) {
      if (priorityQueue.length + standardQueue.length >= 100) return Promise.reject(new Error("Stream queue is full."));
      if (signal?.aborted) return Promise.reject(new Error("Stream request was closed."));
      return new Promise((resolve, reject) => {
        const queue = priority ? priorityQueue : standardQueue;
        const entry = { resolve, priority, signal, onAbort: null };
        entry.onAbort = () => { const index = queue.indexOf(entry); if (index >= 0) queue.splice(index, 1); reject(new Error("Stream request was closed.")); };
        signal?.addEventListener("abort", entry.onAbort, { once: true });
        queue.push(entry);
        drain();
      });
    },
    snapshot() { return { active, standardActive, priorityWaiting: priorityQueue.length, standardWaiting: standardQueue.length }; },
  };
}

export const streamScheduler = createStreamScheduler();
