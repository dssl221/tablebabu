"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, patch, ApiError } from "@/lib/client";
import { istDateTime } from "@/lib/time";
import type { AdminEnquiry } from "@/lib/enquiries";
import { Brand, ErrorBox } from "./ui";
import s from "./enquiry-inbox.module.css";
type Employee = { id: string; name: string; email: string };
export function EnquiryInbox() {
  const [rows, setRows] = useState<AdminEnquiry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isAdmin, setAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await api<{
        enquiries: AdminEnquiry[];
        total: number;
        isAdmin: boolean;
      }>(
        `/platform/enquiries?page=${page}&search=${encodeURIComponent(query)}${status ? `&status=${status}` : ""}`,
      );
      setRows(result.enquiries);
      setTotal(result.total);
      setAdmin(result.isAdmin);
      setError("");
      if (result.isAdmin)
        setEmployees(
          (
            await api<{ employees: Employee[] }>(
              "/platform/enquiries/assignees",
            )
          ).employees,
        );
      setLoaded(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        window.location.replace("/login");
      setError((e as Error).message);
    }
  }, [page, query, status]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 10000);
    const refresh = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  return (
    <main className="platform-page">
      <header className="platform-header">
        <Brand />
        <Link className="button secondary" href="/control-room">
          Back to control room
        </Link>
      </header>
      <div className="section-title">
        <div>
          <h1>Hotel enquiries</h1>
          <p>
            {isAdmin
              ? "Review new requests and assign a team member to follow up."
              : "Your assigned enquiries. Contact the owner, then update the status."}
          </p>
        </div>
        <button className="button secondary" onClick={() => void load()}>
          Refresh inbox
        </button>
      </div>
      <form
        className={s.filters}
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setQuery(search);
        }}
      >
        <label>
          Search enquiries
          <input
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Hotel, owner, city or email"
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All statuses</option>
            <option value="NEW">Received</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="CONTACTED">Contacted</option>
            <option value="CLOSED">Closed</option>
          </select>
        </label>
        <button className="button primary">Search</button>
      </form>
      <ErrorBox message={error} />
      <p aria-live="polite">
        {loaded
          ? `${total} ${total === 1 ? "enquiry" : "enquiries"}`
          : "Loading enquiries..."}
      </p>
      {loaded && !rows.length && (
        <section className="panel">
          <h2>No enquiries here yet</h2>
          <p>
            {isAdmin
              ? "Messages from the contact form will appear here automatically."
              : "The main admin will assign requests to you here."}
          </p>
        </section>
      )}
      <div className={s.list}>
        {rows.map((row) => (
          <EnquiryCard
            key={`${row.id}:${row.version}`}
            row={row}
            employees={employees}
            isAdmin={isAdmin}
            refresh={load}
          />
        ))}
      </div>
      <nav className="platform-pagination" aria-label="Enquiry pages">
        <button
          className="button secondary"
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          className="button secondary"
          disabled={(page + 1) * 25 >= total}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </nav>
    </main>
  );
}
function EnquiryCard({
  row,
  employees,
  isAdmin,
  refresh,
}: {
  row: AdminEnquiry;
  employees: Employee[];
  isAdmin: boolean;
  refresh: () => Promise<void>;
}) {
  const [assignee, setAssignee] = useState(row.assignedToId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function update(data: object) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await patch(`/platform/enquiries/${row.id}`, {
        ...data,
        version: row.version,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={`panel ${s.card}`}>
      <div className={s.details}>
        <div className={s.title}>
          <h2>{row.hotelName}</h2>
          <span>
            {row.status === "NEW" ? "Received" : row.status.toLowerCase()}
          </span>
        </div>
        <p>
          {row.ownerName} / {row.city}
        </p>
        <div className={s.contact}>
          <a href={`mailto:${row.email}`}>{row.email}</a>
          {row.phone && (
            <a href={`tel:${row.phone.replace(/[^+0-9]/g, "")}`}>{row.phone}</a>
          )}
        </div>
        <p className={s.message}>{row.message}</p>
        <small>
          Received {istDateTime(row.createdAt)} IST / Reference {row.id}
        </small>
        {!!row.updates.length && (
          <details>
            <summary>Request updates</summary>
            <ul>
              {row.updates.map((event) => (
                <li key={event.id}>
                  <p>{event.message}</p>
                  <small>{istDateTime(event.createdAt)} IST</small>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div className={s.actions}>
        <p>
          <strong>Assigned to</strong>
          <br />
          {row.assignedTo?.name || "Not assigned yet"}
        </p>
        {isAdmin && (
          <>
            <label>
              Team member for {row.hotelName}
              <select
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                disabled={busy}
              >
                <option value="">Choose a team member</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} ({employee.email})
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button primary"
              disabled={
                busy ||
                !assignee ||
                (assignee === row.assignedToId && row.status !== "CLOSED")
              }
              onClick={() => void update({ assignedToId: assignee })}
            >
              {row.assignedToId ? "Reassign request" : "Assign request"}
            </button>
            <small>
              The owner sees the team member's name and a follow-up notification
              on the contact page.
            </small>
          </>
        )}
        {row.status !== "CLOSED" && (
          <div className={s.statusActions}>
            {row.status === "ASSIGNED" && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void update({ status: "CONTACTED" })}
              >
                Mark contacted
              </button>
            )}
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Close this enquiry? The owner will see that it is closed.",
                  )
                )
                  void update({ status: "CLOSED" });
              }}
            >
              Close enquiry
            </button>
          </div>
        )}
        <ErrorBox message={error} />
      </div>
    </article>
  );
}
