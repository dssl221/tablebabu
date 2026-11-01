import type { Prisma } from "@prisma/client";
export async function endLoginActivities(
  tx: Prisma.TransactionClient,
  sessionIds: string[],
  reason: string,
) {
  const now = new Date();
  await tx.loginActivity.updateMany({
    where: {
      authSessionId: { in: sessionIds },
      endedAt: null,
      expiresAt: { gt: now },
    },
    data: { endedAt: now, endReason: reason },
  });
}
export function activityState(
  row: {
    signedInAt: Date;
    endedAt: Date | null;
    expiresAt: Date;
    endReason: string | null;
  },
  now = new Date(),
) {
  const endedAt = row.endedAt || (row.expiresAt <= now ? row.expiresAt : null);
  return {
    endedAt,
    endReason: row.endReason || (endedAt ? "EXPIRED" : null),
    status: endedAt ? "Ended" : "Signed in",
    durationSeconds: Math.max(
      0,
      Math.floor(
        ((endedAt || now).getTime() - row.signedInAt.getTime()) / 1000,
      ),
    ),
  };
}
