"use client";
import { useState } from "react";
import { post } from "@/lib/client";
export default function PrivacyRequestForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.currentTarget;
        setBusy(true);
        setError("");
        try {
          const result = await post<{ reference: string }>(
            "/privacy/requests",
            Object.fromEntries(new FormData(form)),
          );
          setMessage(
            `Request received. Your reference is ${result.reference}. Keep this reference when contacting us. Submission does not automatically erase data or cancel orders.`,
          );
          form.reset();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Your email
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
        />
      </label>
      <label>
        Request type
        <select name="type">
          <option value="ACCESS">Access my information</option>
          <option value="CORRECTION">Correct my information</option>
          <option value="ERASURE">Erase my information</option>
          <option value="WITHDRAWAL">Withdraw consent</option>
          <option value="NOMINATION">
            Nomination or representative request
          </option>
          <option value="GRIEVANCE">Raise a grievance</option>
        </select>
      </label>
      <label>
        Details
        <textarea
          name="details"
          minLength={10}
          maxLength={2000}
          placeholder="Describe your request. Include the restaurant name and order number if relevant."
          required
        />
      </label>
      <p>
        We use your email and message to investigate, verify and respond to this
        request. This form is not a mailing-list signup.
      </p>
      <button disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
      <p role="status">{message}</p>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
