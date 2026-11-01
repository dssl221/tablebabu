// Diagnostic gauges, never used for ordering, authorization, or numbering.
export const transactionLoad = {
  pendingStarts: 0,
  active: 0,
  peakPendingStarts: 0,
};
export function trackTransactionStart() {
  transactionLoad.pendingStarts++;
  transactionLoad.peakPendingStarts = Math.max(
    transactionLoad.peakPendingStarts,
    transactionLoad.pendingStarts,
  );
  let acquired = false,
    finished = false;
  return {
    acquired() {
      if (acquired || finished) return;
      acquired = true;
      transactionLoad.pendingStarts--;
      transactionLoad.active++;
    },
    finish() {
      if (finished) return;
      finished = true;
      if (acquired) transactionLoad.active--;
      else transactionLoad.pendingStarts--;
    },
  };
}
