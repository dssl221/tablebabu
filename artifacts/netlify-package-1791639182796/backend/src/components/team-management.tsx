"use client";
import { useCallback, useEffect, useState } from "react";
import { api, post, patch } from "@/lib/client";
import { istDateKey, istDateTime } from "@/lib/time";
import {
  PLATFORM_PERMISSIONS,
  PERMISSION_LABELS,
} from "@/lib/platform-permissions";
import { ErrorBox, Modal } from "./ui";
type TeamRole = {
  id: string;
  name: string;
  permissions: string[];
  version: number;
};
type Employee = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  employeeVersion: number;
  platformRoleId: string;
  allRestaurants: boolean;
  platformRole: TeamRole | null;
  restaurantAccess: { restaurantId: string; restaurant: { name: string } }[];
  _count: { authSessions: number };
  lastSession: { signedInAt: string; endedAt: string | null } | null;
};
type Session = {
  id: string;
  user: { name: string; email: string };
  signedInAt: string;
  endedAt: string | null;
  endReason: string | null;
  status: string;
  durationSeconds: number;
};
const reasons: Record<string, string> = {
  LOGOUT: "Logged out",
  EXPIRED: "Session expired",
  ROTATED: "Signed in again",
  ACCESS_CHANGED: "Permissions changed",
  DISABLED: "Account disabled",
  PASSWORD_CHANGED: "Password changed",
  PASSWORD_RESET: "Password reset",
};

export function TeamManagement() {
  const [tab, setTab] = useState("employees"),
    [roles, setRoles] = useState<TeamRole[]>([]),
    [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [total, setTotal] = useState(0);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Employee | "new">(),
    [editingRole, setEditingRole] = useState<TeamRole | "new">();
  const [activityEmployee, setActivityEmployee] = useState<{
    id: string;
    name: string;
  }>();
  const load = useCallback(async () => {
    try {
      const [r, e] = await Promise.all([
        api<TeamRole[]>("/platform/employees/roles"),
        api<{ employees: Employee[]; total: number }>(
          `/platform/employees?search=${encodeURIComponent(query)}&page=${page}`,
        ),
      ]);
      setRoles(r);
      setEmployees(e.employees);
      setTotal(e.total);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [query, page]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section>
      <div className="section-title">
        <div>
          <div className="eyebrow">PLATFORM TEAM</div>
          <h1>Employees & access</h1>
          <p>Control roles, restaurant visibility, and account access.</p>
        </div>
      </div>
      <div className="platform-tabs">
        {["employees", "roles", "login history"].map((t) => (
          <button
            className={`button ${tab === t ? "primary" : "secondary"}`}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {notice && (
        <p role="status" className="saved-message">
          {notice}
        </p>
      )}
      {tab === "employees" && (
        <>
          <form
            className="platform-search"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setQuery(search);
            }}
          >
            <input
              aria-label="Search employees"
              placeholder="Employee name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="button secondary">Search</button>
            <button
              type="button"
              className="button primary"
              onClick={() => setEditing("new")}
            >
              Create employee
            </button>
          </form>
          <p className="muted">
            {total} employees. “Signed in” means a valid session, not live
            online presence.
          </p>
          <div className="platform-list">
            {employees.map((e) => (
              <article className="panel platform-row" key={e.id}>
                <div>
                  <h2>{e.name}</h2>
                  <p>{e.email}</p>
                  <small>
                    {e.platformRole?.name || "No role"} ·{" "}
                    {e.isActive ? "Enabled" : "Disabled"}
                  </small>
                </div>
                <div>
                  <p>
                    {e.allRestaurants
                      ? "All restaurants, including future registrations"
                      : `${e.restaurantAccess.length} assigned restaurants`}
                  </p>
                  <p>{e._count.authSessions} signed-in sessions</p>
                  <small>
                    Last login: {istDateTime(e.lastSession?.signedInAt || null)}
                  </small>
                </div>
                <div className="team-row-actions">
                  <button
                    className="button secondary"
                    onClick={() => setEditing(e)}
                    aria-label={`Edit ${e.name}`}
                  >
                    Edit access
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setActivityEmployee({ id: e.id, name: e.name });
                      setTab("login history");
                    }}
                  >
                    Login history
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!employees.length && (
            <p className="panel">
              No employees found. Create an employee to get started.
            </p>
          )}
          <nav className="platform-pagination">
            <button
              className="button secondary"
              disabled={page === 0}
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
        </>
      )}
      {tab === "roles" && (
        <>
          <button
            className="button primary"
            onClick={() => setEditingRole("new")}
          >
            Create role
          </button>
          <p className="muted">
            Changing a role signs out every employee assigned to it. Only
            platform administrators can manage this team.
          </p>
          <div className="platform-list">
            {roles.map((r) => (
              <article className="panel team-role" key={r.id}>
                <h2>{r.name}</h2>
                <ul>
                  {r.permissions.map((p) => (
                    <li key={p}>
                      {PERMISSION_LABELS[p as keyof typeof PERMISSION_LABELS]}
                    </li>
                  ))}
                </ul>
                <button
                  className="button secondary"
                  aria-label={`Edit ${r.name} role`}
                  onClick={() => setEditingRole(r)}
                >
                  Edit role
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "login history" && (
        <ActivityHistory
          key={activityEmployee?.id || "all"}
          employee={activityEmployee}
          clear={() => setActivityEmployee(undefined)}
        />
      )}
      {editing && (
        <Modal
          title={editing === "new" ? "Create employee" : `Edit ${editing.name}`}
          wide
          onClose={() => setEditing(undefined)}
        >
          <EmployeeForm
            employee={editing === "new" ? undefined : editing}
            roles={roles}
            saved={async () => {
              setEditing(undefined);
              setNotice(
                "Employee saved. Changes to existing accounts sign out their sessions.",
              );
              await load();
            }}
          />
        </Modal>
      )}
      {editingRole && (
        <Modal
          title={
            editingRole === "new" ? "Create role" : `Edit ${editingRole.name}`
          }
          onClose={() => setEditingRole(undefined)}
        >
          <RoleForm
            role={editingRole === "new" ? undefined : editingRole}
            saved={async () => {
              setEditingRole(undefined);
              setNotice("Role saved. Affected employees must sign in again.");
              await load();
            }}
          />
        </Modal>
      )}
    </section>
  );
}

function EmployeeForm({
  employee,
  roles,
  saved,
}: {
  employee?: Employee;
  roles: TeamRole[];
  saved: () => Promise<void>;
}) {
  const [all, setAll] = useState(employee?.allRestaurants || false);
  const [selected, setSelected] = useState(
    employee?.restaurantAccess.map((a) => ({
      id: a.restaurantId,
      name: a.restaurant.name,
    })) || [],
  );
  const [search, setSearch] = useState(""),
    [options, setOptions] = useState<
      { restaurantId: string; name: string; slug: string }[]
    >([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void api<{ restaurants: typeof options }>(
        `/platform/restaurants?search=${encodeURIComponent(search)}`,
      )
        .then((r) => {
          if (active) setOptions(r.restaurants);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  return (
    <form
      className="team-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        const f = new FormData(event.currentTarget);
        const body = {
          name: f.get("name"),
          email: f.get("email"),
          platformRoleId: f.get("platformRoleId"),
          allRestaurants: all,
          restaurantIds: selected.map((r) => r.id),
          isActive: f.get("enabled") === "on",
          ...(f.get("password") ? { password: f.get("password") } : {}),
          ...(employee ? { version: employee.employeeVersion } : {}),
        };
        try {
          if (employee) await patch(`/platform/employees/${employee.id}`, body);
          else await post("/platform/employees", body);
          await saved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Employee name
        <input
          name="name"
          required
          minLength={2}
          maxLength={40}
          defaultValue={employee?.name}
        />
      </label>
      <label>
        Email address
        <input
          name="email"
          type="email"
          autoComplete="off"
          required
          readOnly={!!employee}
          defaultValue={employee?.email}
        />
      </label>
      <label>
        {employee
          ? "New password (leave blank to keep current)"
          : "Initial password"}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required={!employee}
          minLength={12}
          maxLength={72}
        />
      </label>
      <p className="muted text-sm">
        Use at least 12 characters. Share the initial password privately; the
        employee can change it under Account security.
      </p>
      <label>
        Role
        <select
          name="platformRoleId"
          required
          defaultValue={
            employee?.platformRoleId ||
            roles.find((role) => role.id === "platform-viewer")?.id ||
            roles[0]?.id
          }
        >
          {roles.map((r) => (
            <option value={r.id} key={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="team-check">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={employee?.isActive ?? true}
        />
        Account enabled
      </label>
      <fieldset>
        <legend>Restaurant visibility</legend>
        <label className="team-check">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          All restaurants, including future registrations
        </label>
        {!all && (
          <>
            <label>
              Find a restaurant
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, slug or owner email"
              />
            </label>
            <p className="muted text-sm">
              Showing up to 25 matches. Search to find additional restaurants.
            </p>
            <div className="team-restaurant-options">
              {options.map((r) => (
                <label className="team-check" key={r.restaurantId}>
                  <input
                    type="checkbox"
                    checked={selected.some((s) => s.id === r.restaurantId)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, { id: r.restaurantId, name: r.name }]
                          : old.filter((s) => s.id !== r.restaurantId),
                      )
                    }
                  />
                  <span>
                    {r.name}
                    <small>({r.slug})</small>
                  </span>
                </label>
              ))}
            </div>
            <p>{selected.length} restaurants selected</p>
            <div className="team-picked">
              {selected.map((r) => (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setSelected((old) => old.filter((s) => s.id !== r.id))
                  }
                  key={r.id}
                  aria-label={`Remove ${r.name}`}
                >
                  {r.name} ×
                </button>
              ))}
            </div>
            {!selected.length && (
              <p className="muted">
                This employee will not see any restaurant until one is assigned.
              </p>
            )}
          </>
        )}
      </fieldset>
      {employee && (
        <p className="muted">
          Saving ends this employee's signed-in sessions, including when
          permissions or passwords change.
        </p>
      )}
      <ErrorBox message={error} />
      <button className="button primary" disabled={busy}>
        {busy
          ? "Saving…"
          : employee
            ? "Save employee"
            : "Create employee account"}
      </button>
    </form>
  );
}

function RoleForm({
  role,
  saved,
}: {
  role?: TeamRole;
  saved: () => Promise<void>;
}) {
  const [permissions, setPermissions] = useState<string[]>(
      role?.permissions || ["restaurants:view"],
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="team-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const body = {
            name: f.get("name"),
            permissions,
            ...(role ? { version: role.version } : {}),
          };
          if (role) await patch(`/platform/employees/roles/${role.id}`, body);
          else await post("/platform/employees/roles", body);
          await saved();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Role name
        <input
          name="name"
          required
          minLength={2}
          maxLength={60}
          defaultValue={role?.name}
        />
      </label>
      <fieldset>
        <legend>Access permissions</legend>
        {PLATFORM_PERMISSIONS.map((p) => (
          <label className="team-check" key={p}>
            <input
              type="checkbox"
              disabled={p === "restaurants:view"}
              checked={permissions.includes(p)}
              onChange={(e) =>
                setPermissions((old) =>
                  e.target.checked
                    ? [...old, p]
                    : old.filter((value) => value !== p),
                )
              }
            />
            {PERMISSION_LABELS[p]}
          </label>
        ))}
      </fieldset>
      <p className="muted">
        Roles never grant employee administration or unrestricted restaurant
        visibility. Restaurant assignments are configured per employee.
      </p>
      <ErrorBox message={error} />
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save role"}
      </button>
    </form>
  );
}

function ActivityHistory({
  employee,
  clear,
}: {
  employee?: { id: string; name: string };
  clear: () => void;
}) {
  const [from, setFrom] = useState(
      istDateKey(new Date(Date.now() - 29 * 86400000)),
    ),
    [to, setTo] = useState(istDateKey());
  const [page, setPage] = useState(0),
    [filter, setFilter] = useState({ from, to }),
    [sessions, setSessions] = useState<Session[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await api<{ total: number; sessions: Session[] }>(
        `/platform/employees/activity?from=${filter.from}&to=${filter.to}&page=${page}${employee ? `&employeeId=${employee.id}` : ""}`,
      );
      setSessions(result.sessions);
      setTotal(result.total);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter, page, employee]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div>
      <h2>
        {employee
          ? `${employee.name}'s login history`
          : "Employee login history"}
      </h2>
      <p className="muted">
        Times are in IST. Sessions overlapping the selected dates are included.
        Closing a tab does not log out; session expiry and forced sign-out are
        shown separately.
      </p>
      {employee && (
        <button className="button secondary" onClick={clear}>
          Show all employees
        </button>
      )}
      <form
        className="team-history-filter"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setFilter({ from, to });
        }}
      >
        <label>
          From (IST)
          <input
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Through (IST)
          <input
            type="date"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="button primary">Apply dates</button>
        <button
          type="button"
          className="button secondary"
          onClick={() => void load()}
        >
          Refresh history
        </button>
      </form>
      <ErrorBox message={error} />
      <p>
        {total} {total === 1 ? "session" : "sessions"}
      </p>
      <div className="platform-list">
        {sessions.map((s) => (
          <article className="panel team-session" key={s.id}>
            <div>
              <h3>{s.user.name}</h3>
              <p>{s.user.email}</p>
            </div>
            <dl>
              <div>
                <dt>Login</dt>
                <dd>{istDateTime(s.signedInAt)}</dd>
              </div>
              <div>
                <dt>{s.endReason === "LOGOUT" ? "Logout" : "Session ended"}</dt>
                <dd>
                  {s.endedAt ? istDateTime(s.endedAt) : "Still signed in"}
                </dd>
              </div>
              <div>
                <dt>Session duration</dt>
                <dd>
                  {Math.floor(s.durationSeconds / 3600)}h{" "}
                  {Math.floor((s.durationSeconds % 3600) / 60)}m{" "}
                  {s.durationSeconds % 60}s
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {s.endReason
                    ? reasons[s.endReason] || s.endReason
                    : "Signed in"}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      {!sessions.length && (
        <p className="panel">No sessions found in this date range.</p>
      )}
      <nav className="platform-pagination">
        <button
          className="button secondary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          className="button secondary"
          disabled={(page + 1) * 50 >= total}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
