"use client";
import { useEffect, useRef, useState } from "react";
import type { Context, Review, Action } from "../lib/domain";
import type { Entity } from "../lib/database";
import type { Scenario } from "../lib/scenarios";
import type { Audit } from "../lib/service";
interface Workspace {
  context: Context;
  scenarios: Scenario[];
  scenario: Scenario;
  reviews: Review[];
  audit: Audit[];
  connection: { configured: boolean; model: string; status: string };
  pricing: {
    decisionInput: number;
    generationInput: number | null;
    generationOutput: number | null;
    dailyBudget: number;
    monthlyBudget: number;
    dailyEvaluations: number;
  };
  review?: Review;
}
const relationLabel: Record<string, string> = {
  contradicted: "Contradicted",
  new_information: "New information",
  unclear: "Unclear",
  supported: "Supported",
};
const outcomeLabel: Record<string, string> = {
  correction: "Correction detected",
  multiple: "Multiple corrections",
  ambiguous: "Needs review",
  no_correction: "No correction detected",
  unrelated: "Unrelated reply",
  opt_out: "Contact stopped",
};
const actionLabel: Record<Action["type"], string> = {
  update_fact: "Update local research",
  pause: "Pause this follow-up",
  rewrite: "Save revised draft",
  research: "Research further",
  human_review: "Human review",
};
function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
function date(value: unknown) {
  return value
    ? new Date(String(value)).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Calcutta",
      })
    : "Date unknown";
}
type View = "workspace" | "followups" | "history" | "quality";
const views: { id: View; label: string; icon: string }[] = [
  { id: "workspace", label: "Reply review", icon: "◫" },
  { id: "followups", label: "Local follow-ups", icon: "↗" },
  { id: "history", label: "Review history", icon: "◷" },
  { id: "quality", label: "Data quality & usage", icon: "▥" },
];
function WorkspaceNav({
  view,
  navigate,
  mobile = false,
}: {
  view: View;
  navigate: (view: View) => void;
  mobile?: boolean;
}) {
  return (
    <nav
      aria-label={
        mobile ? "Mobile workspace navigation" : "Workspace navigation"
      }
      className={mobile ? "mobile-navigation" : undefined}
    >
      {views.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          onClick={() => navigate(item.id)}
          className={view === item.id ? "nav-active" : undefined}
          aria-current={view === item.id ? "page" : undefined}
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
function FollowupList({
  context,
  review,
  stale,
}: {
  context: Context;
  review: Review | null;
  stale: boolean;
}) {
  return (
    <div className="followup-list">
      {context.outreach.map((message) => {
        const impact =
            !stale && !review?.assessment.failure
              ? review?.impacts.find((i) => i.messageId === message.id)
              : undefined,
          sent = message.status === "sent",
          affected = impact?.affected;
        return (
          <article
            className={`followup-card ${affected ? "affected" : ""}`}
            key={message.id}
          >
            <div className="followup-heading">
              <h3>
                {sent
                  ? "Already sent"
                  : message.factIds.length
                    ? "Fact-dependent follow-up"
                    : "General introduction"}
              </h3>
              <Tag tone={sent ? "neutral" : affected ? "amber" : "green"}>
                {sent
                  ? "Sent · History"
                  : message.status === "cancelled"
                    ? "Cancelled"
                    : message.status === "paused"
                      ? "Paused"
                      : affected
                        ? "Needs review"
                        : impact
                          ? "Unaffected"
                          : message.status === "queued"
                            ? "Queued"
                            : "Draft"}
              </Tag>
            </div>
            <p>{message.body}</p>
            <div className="followup-meta">
              <span>
                {sent
                  ? "Kept in history. Sent email cannot be recalled here."
                  : impact?.reason ||
                    (!stale && review && !review.assessment.failure
                      ? "No repair proposed for this message."
                      : "Evaluate the prospect reply to check whether this follow-up needs repair.")}
              </span>
              {impact?.discovery === "inferred" && (
                <Tag tone="amber">Inferred · Coverage not guaranteed</Tag>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
export default function Tracker() {
  const [view, setView] = useState<View>("workspace");
  const [qualityReviewId, setQualityReviewId] = useState("");
  const [scenarioId, setScenarioId] = useState("crm"),
    [data, setData] = useState<Workspace | null>(null),
    [reply, setReply] = useState(""),
    [support, setSupport] = useState(true),
    [mode, setMode] = useState<"practice" | "live">("practice"),
    [drafts, setDrafts] = useState(false),
    [review, setReview] = useState<Review | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [edits, setEdits] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [evaluatedInputs, setEvaluatedInputs] = useState("");
  const resultRef = useRef<HTMLElement>(null);
  const signature = JSON.stringify({
    scenarioId,
    reply,
    support,
    mode,
    drafts,
  });
  const stale = Boolean(review && signature !== evaluatedInputs);
  const canApprove = Boolean(
    review &&
    review.state === "needs_review" &&
    !stale &&
    !busy &&
    !review.assessment.failure,
  );
  useEffect(() => {
    function syncView() {
      const hash = window.location.hash.slice(1);
      setView(views.find((item) => item.id === hash)?.id || "workspace");
    }
    syncView();
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);
  useEffect(() => {
    if (!loading && data && view !== "workspace") {
      document.getElementById(view)?.focus({ preventScroll: true });
    }
  }, [view, loading, data]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setReview(null);
    setQualityReviewId("");
    setSelected([]);
    setNotice("");
    fetch(`/api/workspace?scenario=${encodeURIComponent(scenarioId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body as Workspace;
      })
      .then((body) => {
        setData(body);
        setReply(body.scenario.reply);
        setSupport(body.context.seller.integrations.includes("HubSpot"));
        setEdits({});
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scenarioId]);
  async function act(operation: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          scenarioId,
          reply,
          hubspotSupported: support,
          mode,
          generateDrafts: drafts,
          ...extra,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "The action could not be completed.");
      setData(body as Workspace);
      if (body.review) {
        setReview(body.review);
        setEvaluatedInputs(signature);
        if (operation === "evaluate") {
          setSelected(
            body.review.actions
              .filter((a: Action) =>
                ["update_fact", "pause", "rewrite"].includes(a.type),
              )
              .map((a: Action) => a.id),
          );
          setEdits({});
          setTimeout(() => resultRef.current?.focus(), 0);
        }
      }
      if (operation === "approve")
        setNotice(
          "Selected changes saved locally. Revised drafts remain paused. History preserves the original evidence.",
        );
      if (operation === "reject")
        setNotice(
          "Proposal rejected. No proposed research or draft changes were applied.",
        );
      if (operation === "revert") {
        setReview(null);
        setNotice(
          "Internal repair reverted through a new audited action. Reevaluate to propose another repair.",
        );
      }
      if (operation === "feedback")
        setNotice("Your feedback was recorded in the local audit history.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this action.",
      );
    } finally {
      setBusy(false);
    }
  }
  function choose(action: Action, checked: boolean) {
    setSelected((current) =>
      checked
        ? [
            ...new Set([
              ...current,
              action.id,
              ...(action.dependsOn ? [action.dependsOn] : []),
            ]),
          ]
        : current.filter(
            (id) =>
              id !== action.id &&
              !review?.actions.some(
                (a) => a.id === id && a.dependsOn === action.id,
              ),
          ),
    );
  }
  function viewHistory(item: Review) {
    setView("workspace");
    window.location.hash = "workspace";
    setReply(item.reply);
    setSupport(item.hubspotSupported);
    setMode(item.assessment.mode);
    setReview(item);
    setSelected(item.selectedActionIds || []);
    setEdits(item.operatorEdits || {});
    setEvaluatedInputs(
      JSON.stringify({
        scenarioId,
        reply: item.reply,
        support: item.hubspotSupported,
        mode: item.assessment.mode,
        drafts,
      }),
    );
    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth" });
      resultRef.current?.focus({ preventScroll: true });
    }, 0);
  }
  const ctx = data?.context,
    activeFacts = ctx?.facts.filter((f) => f.status !== "superseded") || [];
  const dependentCount = review?.impacts.filter((i) => i.affected).length || 0;
  const events = data?.audit || [],
    reviews = data?.reviews || [];
  const qualityReview =
    reviews.find((r) => r.id === qualityReviewId) || reviews.at(-1);
  const outstandingFollowups =
    ctx?.outreach.filter(
      (message) =>
        ["queued", "draft"].includes(message.status) &&
        ctx.facts.some(
          (f) =>
            f.status === "superseded" &&
            (message.factIds.includes(f.id) ||
              message.claims.some((claim) => claim.factIds.includes(f.id))),
        ),
    ) || [];
  const generationOutputTokens = reviews.reduce(
    (sum, r) => sum + (r.assessment.usage?.generationOutputTokens || 0),
    0,
  );
  const tokens = reviews.reduce(
      (total, r) => total + (r.assessment.usage?.decisionInputTokens || 0),
      0,
    ),
    generationTokens = reviews.reduce(
      (total, r) => total + (r.assessment.usage?.generationInputTokens || 0),
      0,
    );
  return (
    <div className="app-shell">
      <a href="#workspace" className="skip-link">
        Skip to review workspace
      </a>
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-mark">
            b<span>↗</span>
          </span>
          <span>
            buyer<span className="brand-sub">correction tracker</span>
          </span>
        </a>
        <div className="workspace-label">
          <span className="avatar">R</span>
          <div>
            <strong>Routewise workspace</strong>
            <small>Fictional seller · Local demo</small>
          </div>
        </div>
        <WorkspaceNav view={view} navigate={setView} />
        <div className="sidebar-bottom">
          <span className="dot" />
          Proposed module for Rhycon<p>No connector or endorsement claimed.</p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span>{" "}
            {views.find((item) => item.id === view)?.label}
          </span>
          <div>
            <Tag tone="green">Fictional data</Tag>
            <span className="operator-avatar" title="Local operator">
              LO
            </span>
          </div>
        </header>
        <main id="workspace">
          <WorkspaceNav view={view} navigate={setView} mobile />
          <div className="page-heading">
            <div>
              <p className="eyebrow">BUYER CORRECTION TRACKER</p>
              <h1>Keep your outreach in sync.</h1>
              <p>
                A prospect corrected your research. See what needs to change
                before you follow up.
              </p>
            </div>
            <Tag tone="green">
              {mode === "practice" ? "Practice mode" : "Live mode"}
            </Tag>
          </div>
          <section className="scenario-bar" aria-label="Scenario controls">
            <div className="scenario-icon">✦</div>
            <div className="scenario-select">
              <label htmlFor="scenario">Explore a fictional scenario</label>
              <select
                id="scenario"
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value)}
                disabled={busy}
              >
                {data ? (
                  data.scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))
                ) : (
                  <option value="crm">CRM switched to HubSpot</option>
                )}
              </select>
            </div>
            <p>
              {data?.scenario.description || "Loading your practice workspace…"}
            </p>
            <span className="demo-label">No emails are sent</span>
          </section>
          <div role="status" aria-live="polite">
            {notice && <div className="notice success">✓ {notice}</div>}
            {loading && (
              <div className="notice">
                Loading fictional records and history…
              </div>
            )}
          </div>
          {error && (
            <div role="alert" className="notice danger">
              {error}
              <button className="text-button" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {ctx && !loading && (
            <>
              <section
                className="context-strip"
                aria-label="Seller and prospect context"
              >
                <div>
                  <span className="context-label">SELLER</span>
                  <h2>{String(ctx.seller.name)}</h2>
                  <p>{ctx.seller.productDescription}</p>
                  <div className="capability">
                    <Tag tone="green">Salesforce supported</Tag>
                    <label>
                      <input
                        type="checkbox"
                        checked={support}
                        onChange={(e) => setSupport(e.target.checked)}
                        disabled={busy}
                      />{" "}
                      HubSpot supported
                    </label>
                  </div>
                </div>
                <div>
                  <span className="context-label">PROSPECT COMPANY</span>
                  <h2>{String(ctx.company.name)}</h2>
                  <p>{String(ctx.company.domain)}</p>
                  <Tag>Company information</Tag>
                </div>
                <div>
                  <span className="context-label">PROSPECT CONTACT</span>
                  <h2>{String(ctx.contact.name)}</h2>
                  <p>{String(ctx.contact.role)}</p>
                  <Tag tone={ctx.contact.suppressed ? "red" : "neutral"}>
                    {ctx.contact.suppressed
                      ? "Contact suppressed"
                      : "Reply received"}
                  </Tag>
                </div>
              </section>
              <div hidden={view !== "workspace"} className="workspace-grid">
                <section className="panel belief-panel">
                  <div className="panel-heading">
                    <span className="step">1</span>
                    <h2>What we believed</h2>
                    <Tag>Research</Tag>
                  </div>
                  <p className="panel-subtitle">
                    The facts behind our planned outreach.
                  </p>
                  {activeFacts.map((fact) => {
                    const evidence = ctx.evidence.find(
                      (e) => e.id === fact.evidenceId,
                    );
                    return (
                      <article key={fact.id} className="fact-card">
                        <div className="fact-title">
                          <span>{fact.field}</span>
                          <Tag
                            tone={
                              fact.operatorEdited
                                ? "amber"
                                : fact.buyerReported
                                  ? "green"
                                  : "neutral"
                            }
                          >
                            {fact.operatorEdited
                              ? "Operator-edited"
                              : fact.buyerReported
                                ? "Buyer-reported"
                                : "Research inference"}
                          </Tag>
                        </div>
                        <h3>{fact.value}</h3>
                        <p className="scope-label">
                          {fact.scope} scope · Version {fact.version}
                        </p>
                        {evidence && (
                          <details>
                            <summary>View source & provenance</summary>
                            <blockquote>{evidence.originalText}</blockquote>
                            <p>{String(evidence.speaker)}</p>
                            <p>
                              Published:{" "}
                              {String(evidence.publishedAt || "Unknown")} ·
                              Checked: {String(evidence.checkedAt || "Unknown")}
                            </p>
                            <p>{String(evidence.provenance)}</p>
                            {Boolean(evidence.sourceUrl) && (
                              <p>
                                Fictional source: {String(evidence.sourceUrl)}
                              </p>
                            )}
                          </details>
                        )}
                      </article>
                    );
                  })}
                  <div className="subtle-callout">
                    Dated sources may be out of date. Buyer-reported changes
                    keep their own provenance.
                  </div>
                </section>
                <section className="panel reply-panel">
                  <div className="panel-heading">
                    <span className="step">2</span>
                    <h2>What the prospect said</h2>
                    <Tag>Buyer reply</Tag>
                  </div>
                  <div className="reply-person">
                    <span className="avatar">MC</span>
                    <div>
                      <strong>{String(ctx.contact.name)}</strong>
                      <small>
                        {String(ctx.company.name)} · Fictional conversation
                      </small>
                    </div>
                  </div>
                  <label className="sr-only" htmlFor="reply">
                    Prospect reply
                  </label>
                  <textarea
                    id="reply"
                    value={reply}
                    maxLength={12000}
                    rows={5}
                    onChange={(e) => setReply(e.target.value)}
                    disabled={busy}
                  />
                  <details className="conversation">
                    <summary>View conversation context</summary>
                    {ctx.messages.slice(-6).map((m: Entity) => (
                      <article key={m.id}>
                        <Tag>{String(m.direction)}</Tag>
                        <p>{String(m.body)}</p>
                        <small>{date(m.timestamp)}</small>
                      </article>
                    ))}
                  </details>
                  <div className="evaluate-controls">
                    <div className="segmented" aria-label="Evaluation mode">
                      <button
                        aria-pressed={mode === "practice"}
                        onClick={() => setMode("practice")}
                        disabled={busy}
                      >
                        Practice
                      </button>
                      <button
                        aria-pressed={mode === "live"}
                        onClick={() => setMode("live")}
                        disabled={busy}
                      >
                        Live
                      </button>
                    </div>
                    <button
                      className="primary"
                      onClick={() => act("evaluate")}
                      disabled={busy || !reply.trim()}
                    >
                      {busy ? "Working…" : "Evaluate reply"}
                      <span aria-hidden="true"> ↗</span>
                    </button>
                  </div>
                  <p className="connection-status">
                    <span
                      className={`dot ${mode === "live" && !data?.connection.configured ? "amber" : ""}`}
                    />
                    {mode === "practice"
                      ? "Simulated results · No API calls or model confidence"
                      : data?.connection.status}
                  </p>
                  {mode === "live" && (
                    <label className="draft-option">
                      <input
                        type="checkbox"
                        checked={drafts}
                        onChange={(e) => setDrafts(e.target.checked)}
                        disabled={busy}
                      />{" "}
                      Generate optional draft suggestions (additional API usage)
                    </label>
                  )}
                </section>
              </div>
              <section
                hidden={view !== "workspace"}
                ref={resultRef}
                tabIndex={-1}
                className="results-section"
                aria-labelledby="results-title"
              >
                <div className="section-title">
                  <div>
                    <p className="eyebrow">REVIEW & REPAIR</p>
                    <h2 id="results-title">What changed?</h2>
                  </div>
                  {review && (
                    <Tag
                      tone={
                        stale
                          ? "amber"
                          : review.state === "approved"
                            ? "green"
                            : "neutral"
                      }
                    >
                      {stale
                        ? "Inputs changed · Needs reevaluation"
                        : review.state.replaceAll("_", " ")}
                    </Tag>
                  )}
                </div>
                {!review ? (
                  <div className="empty-state">
                    <span>↔</span>
                    <h3>Start with the prospect’s reply</h3>
                    <p>
                      Evaluate to see proposed corrections and the specific
                      follow-ups that depend on them.
                    </p>
                    <small>
                      Nothing changes in your research or drafts until you
                      approve. An opt-out stops local outreach immediately.
                    </small>
                  </div>
                ) : (
                  <>
                    {stale && (
                      <div className="notice warning" role="status">
                        Your inputs changed. Evaluate again before approving
                        this proposal.
                      </div>
                    )}
                    {review.assessment.failure && (
                      <div className="notice danger" role="alert">
                        {review.assessment.failure}
                      </div>
                    )}
                    <div className="result-summary">
                      <div className="result-symbol">
                        {review.assessment.optOut ? "⊘" : "↔"}
                      </div>
                      <div>
                        <h3>{outcomeLabel[review.assessment.outcome]}</h3>
                        <p>
                          {review.assessment.optOut
                            ? "This contact is suppressed and pending local messages are cancelled. No new pitch is proposed."
                            : `${review.assessment.corrections.length} proposed correction${review.assessment.corrections.length === 1 ? "" : "s"} · ${dependentCount} pending follow-up${dependentCount === 1 ? "" : "s"} need attention`}
                        </p>
                      </div>
                      <Tag
                        tone={
                          review.assessment.mode === "practice"
                            ? "neutral"
                            : "green"
                        }
                      >
                        {review.assessment.mode === "practice"
                          ? "Simulated"
                          : "Live OpenAI"}
                      </Tag>
                    </div>
                    {review.assessment.corrections.map((c) => {
                      const fact = ctx.facts.find((f) => f.id === c.factId);
                      return (
                        <article key={c.id} className="correction-card">
                          <div className="correction-heading">
                            <h3>{fact?.field || c.category}</h3>
                            <Tag
                              tone={c.relation === "unclear" ? "amber" : "red"}
                            >
                              {relationLabel[c.relation]}
                            </Tag>
                            <Tag>{c.scope} scope</Tag>
                          </div>
                          <div className="before-after">
                            <div>
                              <span>Previous belief</span>
                              <strong>
                                {fact?.value || "Historical research fact"}
                              </strong>
                            </div>
                            <span className="change-arrow">→</span>
                            <div>
                              <span>Buyer-reported proposal</span>
                              <strong>
                                {c.replacementValue ||
                                  "Further confirmation needed"}
                              </strong>
                            </div>
                          </div>
                          <blockquote>“{c.quote}”</blockquote>
                          <p>{c.summary}</p>
                        </article>
                      );
                    })}
                    {review.assessment.warnings.map((warning, i) => (
                      <p className="result-footnote" key={i}>
                        ⓘ {warning}
                      </p>
                    ))}
                    <div className="section-title">
                      <h2>Affected follow-ups</h2>
                      <span>{dependentCount} need attention</span>
                    </div>
                    <FollowupList context={ctx} review={review} stale={stale} />
                    {review.actions.length > 0 && (
                      <section className="approval-panel">
                        <div className="section-title">
                          <div>
                            <h2>Choose the changes to apply</h2>
                            <p>
                              You can approve a correction while declining a
                              rewrite.
                            </p>
                          </div>
                          <Tag>Human approval required</Tag>
                        </div>
                        {review.actions.map((action) => (
                          <div className="action-card" key={action.id}>
                            <label className="action-select">
                              <input
                                type="checkbox"
                                checked={selected.includes(action.id)}
                                onChange={(e) =>
                                  choose(action, e.target.checked)
                                }
                                disabled={!canApprove}
                              />
                              <span>
                                <strong>{actionLabel[action.type]}</strong>
                                <small>{action.reason}</small>
                              </span>
                            </label>
                            {(action.newValue || action.newBody) && (
                              <div className="action-editor">
                                <label htmlFor={`edit-${action.id}`}>
                                  {action.type === "rewrite"
                                    ? "Suggested draft · Edit before approval"
                                    : "Proposed value · Edit before approval"}
                                </label>
                                <textarea
                                  id={`edit-${action.id}`}
                                  rows={action.type === "rewrite" ? 3 : 1}
                                  maxLength={4000}
                                  value={
                                    edits[action.id] ??
                                    action.newBody ??
                                    action.newValue ??
                                    ""
                                  }
                                  disabled={!canApprove}
                                  onChange={(e) =>
                                    setEdits((current) => ({
                                      ...current,
                                      [action.id]: e.target.value,
                                    }))
                                  }
                                />
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="approval-footer">
                          <p>
                            Local records only. Rewritten drafts remain paused.
                          </p>
                          <div>
                            <button
                              className="secondary"
                              disabled={!canApprove}
                              onClick={() =>
                                act("reject", { reviewId: review.id })
                              }
                            >
                              Reject proposal
                            </button>
                            <button
                              className="primary"
                              disabled={!canApprove || !selected.length}
                              onClick={() =>
                                act("approve", {
                                  reviewId: review.id,
                                  actionIds: selected,
                                  edits: Object.fromEntries(
                                    Object.entries(edits).filter(([id]) =>
                                      selected.includes(id),
                                    ),
                                  ),
                                })
                              }
                            >
                              Approve selected ({selected.length})
                            </button>
                          </div>
                        </div>
                      </section>
                    )}
                    {!review.actions.length &&
                      review.state === "needs_review" &&
                      !review.assessment.failure && (
                        <button
                          className="secondary"
                          disabled={!canApprove}
                          onClick={() =>
                            act("approve", {
                              reviewId: review.id,
                              actionIds: [],
                            })
                          }
                        >
                          Acknowledge review
                        </button>
                      )}
                    <details className="technical">
                      <summary>Evaluation details & returned judgments</summary>
                      <p>
                        Reference timezone: Asia/Calcutta · Fictional reference
                        date: 10 October 2026 · Evaluation latency:{" "}
                        {review.latencyMs} ms
                      </p>
                      <pre>
                        {JSON.stringify(
                          {
                            mode: review.assessment.mode,
                            model: review.assessment.model,
                            judgments: review.assessment.judgments,
                            usage: review.assessment.usage,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                    <div className="feedback">
                      <span>Help assess evaluation quality:</span>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          act("feedback", {
                            reviewId: review.id,
                            kind: "missed_correction",
                          })
                        }
                      >
                        Report a missed correction
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          act("feedback", {
                            reviewId: review.id,
                            kind: "incorrectly_flagged",
                          })
                        }
                      >
                        Report an incorrect flag
                      </button>
                    </div>
                  </>
                )}
              </section>
              {view === "followups" && (
                <section
                  id="followups"
                  tabIndex={-1}
                  className="results-section"
                  aria-label="Local follow-ups"
                >
                  <div className="section-title">
                    <h2>Local follow-ups</h2>
                    <Tag>{ctx.outreach.length} messages</Tag>
                  </div>
                  <p>
                    Current saved messages for {String(ctx.company.name)}.
                    Review a prospect reply before approving repairs. No email
                    is sent from this demo.
                  </p>
                  {(!review || stale || review.assessment.failure) && (
                    <p className="subtle-callout">
                      {stale
                        ? "Your inputs changed. Evaluate again for current impact judgments."
                        : "Impact judgments appear after a successful evaluation. Saved statuses are shown below."}
                    </p>
                  )}
                  <FollowupList context={ctx} review={review} stale={stale} />
                  <a
                    className="text-button"
                    href="#workspace"
                    onClick={() => setView("workspace")}
                  >
                    Review reply and choose repairs
                  </a>
                </section>
              )}
              <section
                id="history"
                tabIndex={-1}
                hidden={view !== "workspace" && view !== "history"}
                className="history-section"
              >
                <div className="section-title">
                  <div>
                    <p className="eyebrow">A CLEAR PAPER TRAIL</p>
                    <h2>History that keeps the evidence</h2>
                  </div>
                  <Tag>{reviews.length} reviews</Tag>
                </div>
                <div className="history-grid">
                  <div className="panel">
                    <h3>Research versions</h3>
                    {ctx.facts.map((f) => (
                      <article key={f.id} className="history-item">
                        <div>
                          <strong>
                            {f.field}: {f.value}
                          </strong>
                          <Tag
                            tone={
                              f.status === "superseded" ? "neutral" : "green"
                            }
                          >
                            {f.status}
                          </Tag>
                        </div>
                        <small>
                          {f.scope} scope · v{f.version} ·{" "}
                          {f.operatorEdited
                            ? "Operator-edited"
                            : f.buyerReported
                              ? "Buyer-reported"
                              : "Original research"}
                        </small>
                        <details>
                          <summary>Supporting evidence</summary>
                          <p>
                            {
                              ctx.evidence.find((e) => e.id === f.evidenceId)
                                ?.originalText
                            }
                          </p>
                        </details>
                      </article>
                    ))}
                  </div>
                  <div className="panel">
                    <h3>Reviews & audited actions</h3>
                    {!reviews.length && !events.length ? (
                      <p className="muted">
                        Your evaluations and approvals will appear here.
                      </p>
                    ) : (
                      <>
                        {[...reviews].reverse().map((r) => (
                          <article className="history-item" key={r.id}>
                            <button
                              className="history-review"
                              onClick={() => viewHistory(r)}
                            >
                              {outcomeLabel[r.assessment.outcome]}{" "}
                              <Tag>{r.state.replaceAll("_", " ")}</Tag>
                            </button>
                            <small>
                              {date(r.createdAt)} · {r.assessment.mode}
                            </small>
                          </article>
                        ))}
                        {[...events].reverse().map((event) => (
                          <article key={event.id} className="history-item">
                            <div>
                              <strong>
                                {event.action.replaceAll("_", " ")}
                              </strong>
                              <small>{date(event.timestamp)}</small>
                            </div>
                            <p>{event.reason}</p>
                            <small>
                              {event.actor} · {event.changes.length} recorded
                              changes
                            </small>
                            {event.action === "approve" &&
                              event.changes.length > 0 &&
                              !events.some(
                                (e) => e.revertsEventId === event.id,
                              ) && (
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() =>
                                    act("revert", { eventId: event.id })
                                  }
                                >
                                  Revert this internal repair
                                </button>
                              )}
                            <details>
                              <summary>Audit evidence and changes</summary>
                              <pre>
                                {JSON.stringify(
                                  {
                                    evidenceIds: event.evidenceIds,
                                    changes: event.changes,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          </article>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </section>
              <section
                id="quality"
                tabIndex={-1}
                hidden={view !== "workspace" && view !== "quality"}
                className="panel quality-panel"
              >
                <div className="section-title">
                  <h2>Data quality & usage</h2>
                  <Tag>Local observations</Tag>
                </div>
                <p>
                  These observations cover the selected scenario:{" "}
                  {data?.scenario.title}. They update when you evaluate, approve
                  repairs, or record feedback.
                </p>
                <h3>Research quality</h3>
                <div className="metrics">
                  <div>
                    <strong>{activeFacts.length}</strong>
                    <span>Current facts</span>
                  </div>
                  <div>
                    <strong>
                      {
                        activeFacts.filter(
                          (f) => f.buyerReported && !f.operatorEdited,
                        ).length
                      }
                    </strong>
                    <span>Buyer-reported facts</span>
                  </div>
                  <div>
                    <strong>
                      {
                        ctx.facts.filter((f) => f.status === "superseded")
                          .length
                      }
                    </strong>
                    <span>Superseded facts preserved</span>
                  </div>
                  <div>
                    <strong>
                      {
                        activeFacts.filter(
                          (f) =>
                            !ctx.evidence.some((e) => e.id === f.evidenceId),
                        ).length
                      }
                    </strong>
                    <span>Current facts missing evidence</span>
                  </div>
                </div>
                <p>
                  Research inferences and buyer statements retain their sources;
                  they are not independently verified. Operator-edited values
                  are labelled separately in research history.
                </p>
                <p>
                  <strong>
                    {outstandingFollowups.length} pending follow-ups still
                    reference superseded research.
                  </strong>{" "}
                  {outstandingFollowups.length
                    ? "Their repair remains outstanding."
                    : "No pending messages reference superseded research."}
                </p>
                <a
                  className="text-button"
                  href="#followups"
                  onClick={() => setView("followups")}
                >
                  Inspect local follow-ups
                </a>
                <h3>Evaluation feedback</h3>
                <div className="metrics">
                  <div>
                    <strong>
                      {reviews.filter((r) => r.state === "approved").length}
                    </strong>
                    <span>Approved reviews</span>
                  </div>
                  <div>
                    <strong>
                      {reviews.filter((r) => r.state === "rejected").length}
                    </strong>
                    <span>Rejected reviews</span>
                  </div>
                  <div>
                    <strong>
                      {
                        events.filter((e) => e.action === "missed_correction")
                          .length
                      }
                    </strong>
                    <span>Reported misses</span>
                  </div>
                  <div>
                    <strong>
                      {
                        events.filter((e) => e.action === "incorrectly_flagged")
                          .length
                      }
                    </strong>
                    <span>Reported incorrect flags</span>
                  </div>
                </div>
                {qualityReview ? (
                  <div className="quality-feedback">
                    <label htmlFor="quality-review">Evaluation to assess</label>
                    <select
                      id="quality-review"
                      value={qualityReview.id}
                      disabled={busy}
                      onChange={(e) => setQualityReviewId(e.target.value)}
                    >
                      {[...reviews].reverse().map((r) => (
                        <option key={r.id} value={r.id}>
                          {date(r.createdAt)} ·{" "}
                          {outcomeLabel[r.assessment.outcome]} ·{" "}
                          {r.assessment.mode} · {r.state.replaceAll("_", " ")} ·{" "}
                          {r.id.slice(-6)}
                        </option>
                      ))}
                    </select>
                    <div className="feedback">
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          act("feedback", {
                            reviewId: qualityReview.id,
                            kind: "missed_correction",
                          })
                        }
                      >
                        Report a missed correction
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          act("feedback", {
                            reviewId: qualityReview.id,
                            kind: "incorrectly_flagged",
                          })
                        }
                      >
                        Report an incorrect flag
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => viewHistory(qualityReview)}
                      >
                        Open selected evaluation
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="subtle-callout">
                    No evaluations yet. Evaluate a reply in Reply review to
                    record quality feedback. Practice mode needs no API key.
                  </p>
                )}
                <h3>API usage</h3>
                <p>
                  Returned input tokens: Decisions {tokens.toLocaleString()} ·
                  Generation {generationTokens.toLocaleString()}.{" "}
                  {tokens > 0
                    ? `Estimated standard decision input cost: $${((tokens * (data?.pricing.decisionInput || 0)) / 1000000).toFixed(6)}.`
                    : "No live token usage recorded."}{" "}
                  {data?.pricing.generationInput !== null &&
                  data?.pricing.generationOutput !== null &&
                  generationTokens > 0
                    ? `Estimated generation cost: $${((generationTokens * (data?.pricing.generationInput || 0) + generationOutputTokens * (data?.pricing.generationOutput || 0)) / 1000000).toFixed(6)} (input and output).`
                    : "Generation cost unavailable until reviewed pricing and live usage are recorded."}
                </p>
                <details>
                  <summary>Live usage limits</summary>
                  <p>
                    At most {data?.pricing.dailyEvaluations} uncached
                    evaluations per UTC day. Budget reservation limit: $
                    {data?.pricing.dailyBudget} per day and $
                    {data?.pricing.monthlyBudget} per UTC calendar month.
                    Standard generation prices are supplied for the default
                    GPT-5 nano model. Other models require reviewed input/output
                    prices. These app limits do not limit other uses of your API
                    key.
                  </p>
                </details>
                <p className="muted">
                  Practice observations are simulated. Human feedback is
                  reported, not a measured accuracy score or proof of conversion
                  uplift.
                </p>
              </section>
            </>
          )}
          <footer className="how-it-works">
            <span className="how-icon">i</span>
            <div>
              <h2>How this works</h2>
              <p>
                The app supplies context. OpenAI judges the correction. You
                review the proposed changes. The app updates the local records.
              </p>
              <p className="muted">
                Practice mode uses simulated results. Rhycon is the proposed
                host platform; the seller sells its own product, and the
                prospect contact corrects information about their organisation.
                This single-operator demonstration has no real email sending or
                external integrations.
              </p>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
