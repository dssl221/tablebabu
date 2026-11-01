"use client";
import { useEffect, useState } from "react";
import { api, post } from "@/lib/client";
import { siteContentSchema, type SiteContent } from "@/lib/site-content";
import { istDateTime } from "@/lib/time";
import { FestivalPicker } from "./festival-picker";
type State = {
  draft: SiteContent;
  version: number;
  publishedAt: string | null;
  revisions: { id: string; action: string; createdAt: string }[];
};
export function ContentManagement({
  onDirtyChange,
}: {
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [state, setState] = useState<State>();
  const [content, setContent] = useState<SiteContent>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    const data = await api<State>("/platform/content");
    setState(data);
    setContent(data.draft);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const dirty = JSON.stringify(content) !== JSON.stringify(state?.draft);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function act(
    action: "SAVE" | "PUBLISH" | "RESTORE",
    revisionId?: string,
  ) {
    if (!state || !content || busy) return;
    if (
      action === "PUBLISH" &&
      !confirm("Publish the saved draft to the public homepage?")
    )
      return;
    if (
      action === "RESTORE" &&
      dirty &&
      !confirm("Replace your unsaved edits with this revision?")
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = siteContentSchema.safeParse(content);
      if (action === "SAVE" && !result.success)
        throw new Error(
          result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        );
      await post("/platform/content", {
        action,
        version: state.version,
        content,
        revisionId,
      });
      await load();
      setNotice(
        action === "PUBLISH"
          ? "Homepage published."
          : action === "RESTORE"
            ? "Revision restored as a draft. Review before publishing."
            : "Draft saved. Preview it before publishing.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!state || !content)
    return <p role="status">{error || "Loading page editor…"}</p>;
  return (
    <section>
      <div className="section-title">
        <div>
          <h1>Website content</h1>
          <p>
            Edit the homepage, review a saved draft, then publish when ready.
          </p>
        </div>
        <span className="platform-total">
          {dirty ? "Unsaved changes" : "Draft saved"}
        </span>
      </div>
      <p>Last published: {istDateTime(state.publishedAt)} · IST</p>
      <p role="alert">{error}</p>
      <p role="status">{notice}</p>
      <div className="cms-layout">
        <form
          className="panel team-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act("SAVE");
          }}
        >
          <fieldset disabled={busy} className="cms-fields">
            <legend>Homepage</legend>
            <FestivalPicker
              value={content.festivalTheme || "none"}
              onChange={(festivalTheme) =>
                setContent({ ...content, festivalTheme })
              }
            />
            {(
              [
                ["headline", "Main headline", 80],
                ["highlight", "Highlighted line", 80],
                ["introduction", "Introduction", 300],
                ["button", "Primary button label", 40],
                ["title", "Search title", 80],
                ["description", "Search description", 180],
              ] as const
            ).map(([key, label, max]) => (
              <label key={key}>
                {label}
                <textarea
                  required
                  maxLength={max}
                  value={content[key]}
                  onChange={(e) =>
                    setContent({ ...content, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              Hero image
              <select
                value={content.heroImage}
                onChange={(e) =>
                  setContent({
                    ...content,
                    heroImage: e.target.value as SiteContent["heroImage"],
                  })
                }
              >
                <option value="/images/restaurant.webp">Restaurant</option>
                <option value="/images/biryani.webp">Biryani</option>
                <option value="/images/lassi.webp">Lassi</option>
              </select>
            </label>
            <h2>Frequently asked questions</h2>
            {content.faqs.map(([q, a], index) => (
              <div className="cms-faq" key={index}>
                <label>
                  Question {index + 1}
                  <input
                    required
                    maxLength={160}
                    value={q}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        faqs: content.faqs.map((f, i) =>
                          i === index ? [e.target.value, a] : f,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Answer {index + 1}
                  <textarea
                    required
                    maxLength={1000}
                    value={a}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        faqs: content.faqs.map((f, i) =>
                          i === index ? [q, e.target.value] : f,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="button secondary"
                  disabled={content.faqs.length === 1}
                  onClick={() =>
                    setContent({
                      ...content,
                      faqs: content.faqs.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove question {index + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              disabled={content.faqs.length >= 12}
              onClick={() =>
                setContent({
                  ...content,
                  faqs: [...content.faqs, ["New question", "Add your answer."]],
                })
              }
            >
              Add question
            </button>
            <button className="button primary" disabled={busy}>
              Save draft
            </button>
          </fieldset>
        </form>
        <aside className="panel cms-publish">
          <h2>Review & publish</h2>
          <p>
            Only published content is visible to visitors. Save changes before
            opening the preview.
          </p>
          {!dirty && (
            <a
              className="button secondary"
              href="/?preview=1"
              target="_blank"
              rel="noopener noreferrer"
            >
              Preview saved draft ↗
            </a>
          )}
          <button
            className="button primary"
            disabled={busy || dirty}
            onClick={() => void act("PUBLISH")}
          >
            Publish homepage
          </button>
          <a href="/" target="_blank" rel="noopener noreferrer">
            View live website ↗
          </a>
          <h3>Recent revisions</h3>
          <p>Restore creates a draft; it does not change the live page.</p>
          {state.revisions.map((r) => (
            <div className="cms-revision" key={r.id}>
              <span>
                {r.action} · {istDateTime(r.createdAt)}
              </span>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void act("RESTORE", r.id)}
              >
                Restore
              </button>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}
