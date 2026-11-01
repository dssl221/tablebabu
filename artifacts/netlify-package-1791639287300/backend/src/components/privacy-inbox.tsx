"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, patch } from "@/lib/client";
type RequestRow = {
  id: string;
  email: string;
  type: string;
  details: string;
  status: string;
  resolution: string;
  version: number;
  createdAt: string;
};
export default function PrivacyInbox() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await api<{ requests: RequestRow[]; total: number }>(
        `/platform/privacy-requests?page=${page}`,
      );
      setRows(data.requests);
      setTotal(data.total);
      setLoaded(true);
      setError("");
    } catch (e) {
      setRows([]);
      setLoaded(false);
      setError((e as Error).message);
    }
  }, [page]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <main style={{ maxWidth: 950, margin: "40px auto", padding: 24 }}>
      <Link href="/control-room">← Control room</Link>
      <h1 style={{ fontSize: 32, margin: "24px 0" }}>
        Privacy requests & grievances
      </h1>
      <p>
        Verify the requester before disclosure or erasure. Acknowledge within 48
        hours and target resolution within 30 days. Respond using the monitored
        grievance mailbox; changing status here does not send email or delete
        customer records.
      </p>
      <p role="alert">{error}</p>
      {!loaded && (
        <Link href="/login">Sign in with a platform administrator account</Link>
      )}
      {rows.map((row) => (
        <form
          key={`${row.id}-${row.version}`}
          style={{
            padding: 24,
            margin: "24px 0",
            border: "1px solid #ccd5c9",
            borderRadius: 12,
            display: "grid",
            gap: 12,
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const data = Object.fromEntries(new FormData(e.currentTarget));
            setBusy(true);
            try {
              await patch(`/platform/privacy-requests/${row.id}`, {
                ...data,
                version: row.version,
              });
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>
            {row.type} · {row.id}
          </h2>
          <a href={`mailto:${row.email}`}>{row.email}</a>
          <time>
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            }).format(new Date(row.createdAt))}{" "}
            IST
          </time>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {row.details}
          </p>
          <label>
            Status{" "}
            <select name="status" defaultValue={row.status}>
              <option>RECEIVED</option>
              <option>IN_REVIEW</option>
              <option>RESOLVED</option>
            </select>
          </label>
          <label>
            Internal resolution notes
            <textarea
              name="resolution"
              defaultValue={row.resolution}
              maxLength={2000}
              style={{
                display: "block",
                width: "100%",
                minHeight: 100,
                border: "1px solid #ccc",
              }}
            />
          </label>
          <button disabled={busy} className="button primary">
            Save request
          </button>
        </form>
      ))}
      {loaded && (
        <div style={{ display: "flex", gap: 20 }}>
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} · {total} requests
          </span>
          <button
            disabled={page * 25 >= total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
