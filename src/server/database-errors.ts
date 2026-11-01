import { Prisma } from "@prisma/client";

// Never log the message: Prisma messages can contain SQL arguments. Extract
// only PostgreSQL's structured SQLSTATE when the engine wraps it as Unknown.
export function databaseFailure(error: unknown) {
  const known =
    error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
  const unknown =
    error instanceof Prisma.PrismaClientUnknownRequestError ? error : null;
  const embedded = unknown?.message.match(
    /PostgresError\s*\{\s*code:\s*"([A-Z0-9]{5})"/,
  );
  const postgresCode =
    typeof known?.meta?.code === "string"
      ? known.meta.code
      : (embedded?.[1] ?? null);
  return {
    errorType: error instanceof Error ? error.name : "Unknown",
    prismaCode: known?.code ?? null,
    postgresCode,
    retryable:
      known?.code === "P2034" ||
      ["40001", "40P01"].includes(postgresCode || ""),
    unavailable:
      ["P2024", "P2028"].includes(known?.code || "") ||
      ["55P03", "57014", "53300"].includes(postgresCode || ""),
  };
}
