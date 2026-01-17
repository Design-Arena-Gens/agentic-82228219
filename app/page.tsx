import Link from "next/link";

const examples = [
  "agent add \"Finish slides\" --due 2026-02-01 --p high --tags work,meeting",
  "agent list --limit 10",
  "agent today",
  "agent snooze 21 +3d",
  "agent export --format csv --yes > tasks.csv",
  "agent config set role tasks"
];

export default function Home() {
  return (
    <main>
      <h1>agentic — terminal-first productivity agent</h1>
      <p>
        agentic is a minimal CLI companion for everyday planning. It keeps fast,
        local-first task data in <code>~/.agentic/data.json</code>, stays
        privacy-first, and produces predictable, script-friendly output.
      </p>
      <div className="terminal-block" aria-label="Quick start commands">
        {examples.map((line) => (
          <span key={line} className="terminal-line">
            <span style={{ color: "#22d3ee" }}>$</span> {line}
          </span>
        ))}
      </div>
      <ul>
        <li>
          <strong>Offline-first store</strong> — human-readable JSON with audit
          logs in <code>~/.agentic/</code>.
        </li>
        <li>
          <strong>Helpful parsing</strong> — understands natural dates, tags,
          and priorities; only prompts when it has to.
        </li>
        <li>
          <strong>Safe defaults</strong> — confirmations for destructive
          actions, exports, and bulk edits.
        </li>
        <li>
          <strong>Integrations optional</strong> — Google, Gmail, Notion,
          Dropbox require explicit API keys before syncing.
        </li>
        <li>
          <Link href="https://github.com/" target="_blank">
            Documentation &amp; Source
          </Link>
        </li>
      </ul>
      <p style={{ marginTop: "1.5rem", fontSize: "0.95rem", color: "#94a3b8" }}>
        Deploy-ready on Vercel. Run <code>npm i</code>,{" "}
        <code>npm run build</code>, then <code>vercel deploy --prod</code>.
      </p>
    </main>
  );
}
