import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { type Variant } from './fixture.js';
import { tasks } from './tasks.js';

// Build disposable Harbor tasks from the same fixture and grader as eval:run.
const root = resolve(import.meta.dirname, '../..');
const output = join(root, 'runs/harbor/tasks');
const read = (path: string) => readFile(join(root, path), 'utf8');
const skill = await read('SKILL.md');
for (const definition of tasks) {
for (const [index, variant] of (['broken', 'fixed'] as Variant[]).entries()) {
  const task = join(output, `${definition.id}-${index + 1}`);
  const put = async (path: string, data: string) => {
    const full = join(task, path);
    await mkdir(resolve(full, '..'), { recursive: true });
    await writeFile(full, data);
  };
  await put('task.toml', `schema_version = "1.4"
artifacts = ["/app/output"]
[metadata]
category = "qa"
task = "${definition.id}"
fixture_state = "${variant}"
[agent]
timeout_sec = 240.0
user = "agent"
[verifier]
timeout_sec = 60.0
user = "root"
[environment]
cpus = 1
memory_mb = 2048
workdir = "/app/output"
[environment.healthcheck]
command = "curl -fsS http://localhost:3000/ >/dev/null"
interval_sec = 1.0
retries = 10
`);
  await put('instruction.md', `Perform a focused functional QA evaluation using /app/SKILL.md.
App: http://localhost:3000
Source: /app/source/app.mjs. Already running; do not modify or restart it.
Use real Chromium via Playwright, installed at /opt/qa/node_modules/playwright/index.mjs.
Write scripts and artifacts only in /app/output. Do not inspect verifier files, server logs, or other trials. Do not infer execution from source alone.
${definition.instructions}
These focused instructions override the full-site skill. Do not create a full HTML report or regression suite. Stop after writing the artifacts.
`);
  await put('environment/app.mjs', definition.source(variant));
  await put('environment/SKILL.md', skill);
  await put('environment/server.mjs', `import { appendFileSync } from 'node:fs';
import { start } from '/app/source/app.mjs';
start(event => appendFileSync('/var/lib/qa-eval/events.jsonl', JSON.stringify(event)+'\\n')).listen(3000, '0.0.0.0');
`);
  await put('environment/entrypoint.sh', '#!/bin/sh\nset -eu\nnode /opt/qa/server.mjs &\nexec "$@"\n');
  await put('environment/Dockerfile', `FROM mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e
USER root
RUN mkdir -p /opt/qa && cd /opt/qa && npm init -y && npm install --save-exact playwright@1.62.1 tsx@4.23.13 zod@4.5.4
RUN npm install -g @openai/codex@0.160.0 @anthropic-ai/claude-code@2.1.287
RUN useradd -m -s /bin/bash agent && mkdir -p /app/source /app/output /var/lib/qa-eval && chmod 700 /var/lib/qa-eval && chown agent:agent /app/output && ln -s /opt/qa/node_modules /app/node_modules
COPY app.mjs /app/source/app.mjs
COPY SKILL.md /app/SKILL.md
COPY server.mjs entrypoint.sh /opt/qa/
RUN chmod 755 /opt/qa/entrypoint.sh
WORKDIR /app/output
ENTRYPOINT ["/opt/qa/entrypoint.sh"]
CMD ["sleep", "infinity"]
`);
  await put('solution/reference.ts', (await read('scripts/evals/' + definition.referenceFile)).replace('from "playwright"', 'from "/opt/qa/node_modules/playwright/index.mjs"'));
  await put('solution/main.ts', `import { runReference } from './reference.js';\nawait runReference('http://localhost:3000', '/app/output');\n`);
  await put('solution/package.json', '{"type":"module"}');
  await put('solution/solve.sh', '#!/bin/bash\nset -euo pipefail\n/opt/qa/node_modules/.bin/tsx /solution/main.ts\n');
  for (const name of [definition.graderFile, 'artifacts.ts']) {
    await put('tests/evals/' + name, await read('scripts/evals/' + name));
  }
  await put('tests/types.ts', await read('scripts/types.ts'));
  await put('tests/package.json', '{"type":"module"}');
  await put('tests/main.ts', `import { readFile, writeFile, cp } from 'node:fs/promises';
import { ${definition.graderExport} as grade } from './evals/${definition.graderFile.replace('.ts', '.js')}';
const events = (await readFile('/var/lib/qa-eval/events.jsonl', 'utf8')).trim().split('\\n').filter(Boolean).map(line => JSON.parse(line));
const result = await grade('${variant}', events, '/app/output');
await writeFile('/logs/verifier/grade.json', JSON.stringify(result, null, 2));
await writeFile('/logs/verifier/server-events.json', JSON.stringify(events, null, 2));
await cp('/app/output', '/logs/verifier/evidence', { recursive: true });
await writeFile('/logs/verifier/reward.txt', result.passed ? '1' : '0');
`);
  await put('tests/test.sh', '#!/bin/bash\nset -euo pipefail\nln -s /opt/qa/node_modules /tests/node_modules\n/opt/qa/node_modules/.bin/tsx /tests/main.ts\n');
}
}
console.log(`Prepared Harbor tasks: ${output}`);
