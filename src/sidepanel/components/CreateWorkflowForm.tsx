import { useEffect, useRef, useState } from "react";
import { addOutline, createWorkflow } from "../../shared/workflowActions";
import { parseOutline, countOutline } from "../../shared/outline";
import { LIMITS, validateDomain, validateWorkflowName } from "../../shared/validators";
import { CATEGORY_DISTRACTIONS, JOB_CATEGORIES, type CategoryId } from "../lib/categories";
import type { Ui } from "../lib/ui";
import { BusyButton } from "./Buttons";

// What you've typed survives closing the panel mid-form; cleared on create or Cancel.
const DRAFT_KEY = "orion.newWorkflowDraft";
interface Draft {
  name: string;
  category: CategoryId;
  plan: string;
}

function readDraft(): Draft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Draft> | null;
    if (!raw || typeof raw !== "object") return null;
    const category = JOB_CATEGORIES.some((c) => c.id === raw.category) ? (raw.category as CategoryId) : "software";
    return {
      name: typeof raw.name === "string" ? raw.name.slice(0, LIMITS.workflowName) : "",
      category,
      plan: typeof raw.plan === "string" ? raw.plan.slice(0, 20_000) : "",
    };
  } catch {
    return null;
  }
}

function writeDraft(d: Draft | null): void {
  try {
    if (!d || (!d.name && !d.plan)) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: the form still works, it just won't survive a close */
  }
}

interface Props {
  ui: Ui;
  onCreated: (id: string) => void;
  onCancel: () => void;
}

export function CreateWorkflowForm({ ui, onCreated, onCancel }: Props) {
  const [initial] = useState(readDraft);
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<CategoryId>(initial?.category ?? "software");
  const [plan, setPlan] = useState(initial?.plan ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [guardOpen, setGuardOpen] = useState(false);
  const [grace, setGrace] = useState(5);
  const [domains, setDomains] = useState<string[]>(CATEGORY_DISTRACTIONS[initial?.category ?? "software"]);
  const [domainInput, setDomainInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => writeDraft({ name, category, plan }), [name, category, plan]);

  const items = parseOutline(plan);
  const NAME_HINT = "Name the workflow, like “Payments API v2”.";
  const count = countOutline(items);

  function addDomain() {
    const d = validateDomain(domainInput);
    if (!d) {
      setError("Enter a bare domain like reddit.com");
      return;
    }
    if (domains.length >= LIMITS.maxDomains) return;
    setDomains((prev) => (prev.includes(d) ? prev : [...prev, d]));
    setDomainInput("");
    setError(null);
  }

  async function submit() {
    if (busy) return;
    if (!validateWorkflowName(name)) {
      setNameError(NAME_HINT);
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    const id = await ui.run(async () => {
      const wf = await createWorkflow(name, grace, domains, category);
      if (items.length) await addOutline(wf.id, null, items);
      return wf.id;
    });
    setBusy(false);
    if (id) {
      writeDraft(null);
      onCreated(id);
    }
  }

  return (
    <form
      className="create"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <header className="wf-head">
        <button
          type="button"
          className="icon-btn"
          aria-label="Cancel"
          data-tip="Cancel"
          data-tip-align="start"
          onClick={() => {
            writeDraft(null);
            onCancel();
          }}
        >
          ←
        </button>
        <div className="wf-title">
          <h2>New workflow</h2>
        </div>
      </header>

      <label className="field">
        <span>Name</span>
        <input
          ref={nameRef}
          autoFocus
          aria-label="Workflow name"
          value={name}
          maxLength={LIMITS.workflowName}
          placeholder="Payments API v2"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "wf-name-error" : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
            setNameError(null);
          }}
          onBlur={() => {
            // Validate on leaving, but not a field nobody has typed in yet.
            if (nameTouched && !validateWorkflowName(name)) setNameError(NAME_HINT);
          }}
        />
        {nameError && (
          <span id="wf-name-error" className="error" role="alert">
            {nameError}
          </span>
        )}
      </label>

      <fieldset className="field">
        <legend>Kind of work</legend>
        <div className="chips">
          {JOB_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              className={`chip-btn ${category === c.id ? "chip-on" : ""}`}
              onClick={() => {
                setCategory(c.id);
                setDomains(CATEGORY_DISTRACTIONS[c.id]);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>
          Plan <span className="muted">(optional · one task per line, indent for subtasks, or paste a plan from any AI)</span>
        </span>
        <textarea
          rows={7}
          aria-label="Plan: one task per line, indent for subtasks"
          value={plan}
          placeholder={"Auth refactor\n  Token refresh\n    Write retry test\n  Logout everywhere\nDocs"}
          onChange={(e) => setPlan(e.target.value)}
          onKeyDown={(e) => {
            // Tab indents inside the plan instead of leaving the field.
            if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              const t = e.currentTarget;
              const s = t.selectionStart;
              const next = `${plan.slice(0, s)}  ${plan.slice(t.selectionEnd)}`;
              setPlan(next);
              requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
            }
          }}
        />
        {count > 0 && <span className="muted small">{count} task{count === 1 ? "" : "s"} will be created</span>}
      </label>

      <div className="field">
        <button type="button" className="section-toggle" aria-expanded={guardOpen} onClick={() => setGuardOpen((v) => !v)}>
          <span className={`caret ${guardOpen ? "caret-open" : ""}`}>▸</span> Distraction guard <span className="muted small">{domains.length} sites</span>
        </button>
        {guardOpen && (
          <div className="guard">
            <p className="muted small">Get a nudge after a grace period on these sites. Needs tab memory (Settings).</p>
            <label className="field-inline">
              Grace period
              <input type="number" aria-label="Grace period in minutes" min={0} max={60} value={grace} onChange={(e) => setGrace(Number(e.target.value))} /> min
            </label>
            <div className="tags">
              {domains.map((d) => (
                <span key={d} className="tag">
                  {d}
                  <button type="button" aria-label={`Remove ${d}`} onClick={() => setDomains((p) => p.filter((x) => x !== d))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="inline-form">
              <input
                aria-label="Add a site to the distraction guard"
                value={domainInput}
                placeholder="Add a site, e.g. news.ycombinator.com"
                onChange={(e) => setDomainInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDomain();
                  }
                }}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={addDomain}>
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <BusyButton className="btn btn-primary btn-full" type="submit" busy={busy}>
        Create workflow
      </BusyButton>
    </form>
  );
}
