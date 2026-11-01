// Keep historical database statuses compatible with the three-stage workflow.
export function orderStage(status: string): string {
  if (["NEW", "ACCEPTED"].includes(status)) return "RECEIVED";
  if (["PREPARING", "READY", "SERVED"].includes(status)) return "PREPARING";
  return status;
}
