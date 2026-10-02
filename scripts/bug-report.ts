import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    findings: { type: "string" },
    plan: { type: "string" },
    model: { type: "string" },
    app: { type: "string" },
    url: { type: "string" },
    out: { type: "string" },
  },
});

if (values.findings === undefined || values.model === undefined) {
  process.stderr.write(
    "usage: tsx scripts/bug-report.ts --findings <findings.json> --model <model-id> [--plan <test-plan.json>] [--app <name>] [--url <target>] [--out <dir>]\n",
  );
  process.exit(1);
}

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(values.findings, "utf8")) as unknown;
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  process.stderr.write(
    err.code === "ENOENT"
      ? `no findings file at ${values.findings}\n`
      : `${values.findings} is not valid JSON: ${err.message}\n`,
  );
  process.exit(1);
}
const findings = (Array.isArray(raw) ? raw : (raw as { findings?: unknown[] }).findings ?? []) as Finding[];

interface Finding {
  caseId?: string;
  title?: string;
  feature?: string;
  endpoint?: string;
  severity?: string;
  reproduction?: string | string[];
  steps?: string | string[];
  calls?: unknown[];
  observed?: string;
  expected?: string;
  screenshot?: string;
}

interface PlanCase {
  id?: string;
  title?: string;
  layer?: string;
  risk?: string;
  result?: string;
}
let plan: { summary?: string; cases?: PlanCase[] } | undefined;
if (values.plan !== undefined) {
  try {
    plan = JSON.parse(readFileSync(values.plan, "utf8")) as typeof plan;
  } catch (e) {
    process.stderr.write(`cannot read test plan ${values.plan}: ${(e as Error).message}\n`);
    process.exit(1);
  }
}

const slugModel = values.model.replace(/[^A-Za-z0-9._-]+/g, "-");
const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
const outDir = values.out ?? path.dirname(values.findings);
const file = path.join(outDir, `bug-report-${stamp}-${slugModel}.html`);

const rank = (s?: string): number => ({ high: 0, critical: 0, medium: 1, low: 2 })[s ?? ""] ?? 3;
findings.sort((a, b) => rank(a.severity) - rank(b.severity));

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const asList = (v: string | string[] | undefined): string[] =>
  (v === undefined ? [] : Array.isArray(v) ? v : String(v).split(/\n|(?<=\.)\s+(?=[A-Z0-9])/))
    .map((x) => x.trim().replace(/^\d+[.)]\s+/, ""))
    .filter((x) => x);

let missingShots = 0;

// Screenshot paths in findings.json are relative to the run directory. Try the output
// dir first, then the findings file's own directory, so this works whether it runs from
// the run dir or is pointed at one from elsewhere.
function embedShot(p: string | undefined): string {
  if (p === undefined || p === "") return `<div class="noshot">no screenshot captured</div>`;
  const findingsDir = path.dirname(path.resolve(values.findings as string));
  const abs = path.isAbsolute(p)
    ? p
    : ([path.resolve(outDir, p), path.resolve(findingsDir, p)].find((c) => existsSync(c)) ??
      path.resolve(outDir, p));
  if (!existsSync(abs)) {
    missingShots += 1;
    return `<div class="noshot">screenshot not found: ${esc(p)}</div>`;
  }
  const ext = (path.extname(abs).slice(1) || "png").toLowerCase();
  const b64 = readFileSync(abs).toString("base64");
  return `<img alt="screenshot" src="data:image/${ext};base64,${b64}" />`;
}

function callsBlock(calls: unknown[] | undefined): string {
  if (calls === undefined || calls.length === 0) return "";
  const body = calls
    .map((c) => (typeof c === "string" ? c : JSON.stringify(c, null, 2)))
    .join("\n");
  return `<div class="lbl">API calls</div><pre class="calls">${esc(body)}</pre>`;
}

const counts = { high: 0, medium: 0, low: 0 };
for (const f of findings) {
  const s = f.severity === "critical" ? "high" : (f.severity ?? "low");
  counts[(s as keyof typeof counts)] = (counts[s as keyof typeof counts] ?? 0) + 1;
}

const cards = findings
  .map((f, i) => {
    const steps = asList(f.reproduction ?? f.steps);
    return `<details class="card ${esc(f.severity)}" id="bug-${i + 1}">
  <summary><span class="badge ${esc(f.severity)}">${esc(f.severity ?? "?")}</span>
    <span class="sumtitle">#${i + 1} ${esc(f.title)}</span>${f.feature ? `<span class="sumfeat">${esc(f.feature)}</span>` : ""}</summary>
  <div class="body">
  <div class="meta">${f.caseId ? `<span><b>Test case:</b> <a href="#case-${esc(f.caseId)}">${esc(f.caseId)}</a></span>` : ""}${f.endpoint ? `<span><b>Endpoint:</b> <code>${esc(f.endpoint)}</code></span>` : ""}</div>
  <div class="grid">
    <div class="col">
      ${steps.length ? `<div class="lbl">Steps to replicate</div><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
      ${callsBlock(f.calls)}
      ${f.expected ? `<div class="lbl">Expected</div><p>${esc(f.expected)}</p>` : ""}
      ${f.observed ? `<div class="lbl">Observed</div><p>${esc(f.observed)}</p>` : ""}
    </div>
    <div class="col shot">${embedShot(f.screenshot)}</div>
  </div>
  </div>
</details>`;
  })
  .join("\n");

const summaryRows = findings
  .map((f, i) => `<tr class="row-${esc(f.severity)}"><td>${i + 1}</td><td><span class="badge ${esc(f.severity)}">${esc(f.severity ?? "?")}</span></td><td>${esc(f.feature ?? "")}</td><td><a href="#bug-${i + 1}">${esc(f.title)}</a></td></tr>`)
  .join("");
const summaryTable = `<table class="summary"><thead><tr><th>#</th><th>Severity</th><th>Feature</th><th>Bug</th></tr></thead><tbody>${summaryRows}</tbody></table>`;

const planCases = plan?.cases ?? [];
const outcome = (r?: string): "pass" | "fail" | "notrun" =>
  r === "pass" ? "pass" : r === "fail" ? "fail" : "notrun";
const planCounts = { pass: 0, fail: 0, notrun: 0 };
for (const c of planCases) planCounts[outcome(c.result)]++;
const bugForCase = new Map<string, number>();
findings.forEach((f, i) => {
  if (f.caseId && !bugForCase.has(f.caseId)) bugForCase.set(f.caseId, i + 1);
});
const planRows = planCases
  .map((c) => {
    const o = outcome(c.result);
    const bug = c.id ? bugForCase.get(c.id) : undefined;
    const label = o === "pass" ? "pass" : o === "fail" ? "fail" : esc(c.result || "not run");
    const res = bug ? `<a href="#bug-${bug}">${label}, bug #${bug}</a>` : label;
    return `<tr id="case-${esc(c.id)}"><td><code>${esc(c.id)}</code></td><td><span class="badge ${esc(c.risk)}">${esc(c.risk ?? "?")}</span></td><td>${esc(c.title)}</td><td>${esc(c.layer ?? "")}</td><td class="res ${o}">${res}</td></tr>`;
  })
  .join("");
const planSection = plan
  ? `<h2>Test plan</h2>${plan.summary ? `<p class="plansum">${esc(plan.summary)}</p>` : ""}
<details class="plan"${planCases.length <= 40 ? " open" : ""}><summary>${planCases.length} test cases: ${planCounts.pass} passed, ${planCounts.fail} failed, ${planCounts.notrun} not run</summary>
<table class="summary"><thead><tr><th>ID</th><th>Risk</th><th>Test case</th><th>Layer</th><th>Result</th></tr></thead><tbody>${planRows}</tbody></table></details>
<h2>Bugs</h2>`
  : "";

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Bug report — ${esc(values.model)} — ${stamp}</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#0d1117;color:#e6edf3}
  header.top{padding:24px 28px;background:#161b22;border-bottom:1px solid #30363d}
  header.top h1{margin:0 0 6px;font-size:20px}
  header.top .sub{color:#8b949e;font-size:13px}
  .tallies{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
  .pill{padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600}
  .pill.high{background:#4a1414;color:#ff9c9c}.pill.medium{background:#4a3a14;color:#ffd479}.pill.low{background:#1c3a4a;color:#8fd4ff}.pill.total{background:#21262d;color:#e6edf3}
  main{max-width:1000px;margin:0 auto;padding:20px}
  table.summary{width:100%;border-collapse:collapse;margin:8px 0 20px;font-size:14px}
  table.summary th,table.summary td{text-align:left;padding:7px 10px;border-bottom:1px solid #30363d}
  table.summary th{color:#8b949e;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  table.summary a{color:#58a6ff;text-decoration:none}table.summary a:hover{text-decoration:underline}
  .card{background:#161b22;border:1px solid #30363d;border-left-width:4px;border-radius:8px;margin:12px 0}
  .card.high,.card.critical{border-left-color:#f85149}.card.medium{border-left-color:#d29922}.card.low{border-left-color:#388bfd}
  .card>summary{display:flex;align-items:center;gap:10px;padding:14px 18px;cursor:pointer;list-style:none}
  .card>summary::-webkit-details-marker{display:none}
  .card>summary::before{content:"▶";color:#8b949e;font-size:11px;transition:transform .15s}
  .card[open]>summary::before{transform:rotate(90deg)}
  .sumtitle{font-weight:600}.sumfeat{color:#8b949e;font-size:13px;margin-left:auto}
  .card .body{padding:0 18px 16px}
  .card:target{outline:2px solid #58a6ff}
  .badge{font-size:11px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:4px}
  .badge.high,.badge.critical{background:#f85149;color:#fff}.badge.medium{background:#d29922;color:#000}.badge.low{background:#388bfd;color:#fff}
  .meta{display:flex;gap:16px;flex-wrap:wrap;color:#8b949e;font-size:13px;margin-bottom:12px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media(max-width:720px){.grid{grid-template-columns:1fr}}
  .lbl{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#8b949e;margin:10px 0 4px}
  ol{margin:0;padding-left:20px}li{margin:2px 0}
  code{background:#21262d;padding:1px 5px;border-radius:4px;font-size:13px}
  pre.calls{background:#0b0f14;border:1px solid #30363d;border-radius:6px;padding:10px;overflow-x:auto;font-size:12px;white-space:pre-wrap}
  .shot img{width:100%;border:1px solid #30363d;border-radius:6px}
  h2{font-size:17px;margin:24px 0 8px}
  .plansum{color:#8b949e;margin:0 0 10px}
  details.plan>summary{cursor:pointer;color:#e6edf3;font-weight:600;padding:6px 0}
  td.res.pass{color:#3fb950}td.res.fail,td.res.fail a{color:#f85149}td.res.notrun{color:#8b949e}
  tr:target{outline:2px solid #58a6ff}
  .meta a{color:#58a6ff;text-decoration:none}
  .noshot{color:#6e7681;font-style:italic;border:1px dashed #30363d;border-radius:6px;padding:20px;text-align:center}
</style></head><body>
<header class="top">
  <h1>QA bug report</h1>
  <div class="sub">Model: <b>${esc(values.model)}</b> &nbsp;·&nbsp; App: ${esc(values.app ?? "—")} ${values.url ? `(${esc(values.url)})` : ""} &nbsp;·&nbsp; ${stamp}</div>
  <div class="tallies">
    ${plan ? `<span class="pill total">${planCases.length} test cases</span>` : ""}
    <span class="pill total">${findings.length} bugs</span>
    <span class="pill high">${counts.high} high</span>
    <span class="pill medium">${counts.medium} medium</span>
    <span class="pill low">${counts.low} low</span>
  </div>
</header>
<main>${planSection}${findings.length ? summaryTable : ""}${cards || "<p>No findings.</p>"}</main>
<script>
  // open a card when its summary-table link is clicked, and on load if URL has a hash
  function openHash(){var h=location.hash&&document.querySelector(location.hash);if(!h)return;if(h.tagName==='DETAILS')h.open=true;var p=h.closest('details');if(p)p.open=true;}
  document.querySelectorAll('table.summary a[href^="#bug-"], .meta a').forEach(function(a){a.addEventListener('click',function(){var t=document.querySelector(this.getAttribute('href'));if(t)t.open=true;});});
  addEventListener('hashchange',openHash);openHash();
</script>
</body></html>`;

writeFileSync(file, html, "utf8");
if (missingShots > 0) {
  process.stderr.write(
    `warning: ${missingShots} screenshot(s) not found, so the report has gaps.\n` +
      `Paths in findings.json are relative to the run directory. Run this from there, ` +
      `or pass --out <the run directory>.\n`,
  );
}
process.stderr.write(`bug report: ${plan ? `${planCases.length} test cases, ` : ""}${findings.length} bugs -> ${file}\n`);
process.stdout.write(file + "\n");
