import { createServer } from "node:http";

export type Variant = "broken" | "fixed";
export interface Event {
  method: string;
  path: string;
  bio?: string;
  format?: "list" | "text";
  skills?: string;
  score?: number;
  browser: boolean;
}

// Generate only the selected implementation. The agent does not see a bug switch
// or the sibling implementation in its source directory.
export function fixtureSource(variant: Variant): string {
  return `import { createServer } from 'node:http';
let bio = 'Original bio';
const html = ${JSON.stringify(`<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Profile</title>
<style>body{font:18px system-ui;max-width:640px;margin:60px auto;padding:24px}textarea{display:block;width:100%;height:100px;margin:16px 0}button{padding:10px 24px}</style>
<h1>Profile</h1><form><label for="bio">Bio</label><textarea id="bio"></textarea><button>Save</button></form><p role="status"></p>
<script>
const field = document.querySelector('#bio');
fetch('/api/profile').then(r=>r.json()).then(p=>{field.value=p.bio;field.dataset.loaded='true'});
document.querySelector('form').onsubmit=async e=>{
  e.preventDefault();
  const r=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({bio:field.value})});
  document.querySelector('[role=status]').textContent=r.ok?'Saved':'Save failed';
};
</script></html>`)};
export function start(record = () => {}) {
  const server = createServer(async (req,res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const browser = !!req.headers['sec-fetch-mode'];
    const send = (status, body, type='application/json') => {res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body)};
    if(req.method==='GET' && path==='/') {record({method:'GET',path,browser});return send(200,html,'text/html')}
    if(req.method==='GET' && path==='/api/profile') {record({method:'GET',path,bio,browser});return send(200,JSON.stringify({bio}))}
    if(req.method==='PUT' && path==='/api/profile') {
      let raw=''; for await(const chunk of req) raw+=chunk;
      let body; try{body=JSON.parse(raw)}catch{return send(400,'{}')}
      if(typeof body.bio!=='string') return send(400,'{}');
      ${variant === "fixed" ? "bio = body.bio;" : "const submittedBio = body.bio;"}
      record({method:'PUT',path,bio:body.bio,browser});
      return send(200,JSON.stringify({bio:body.bio}));
    }
    send(404,'{}');
  });
  return server;
}
`;
}

export async function startFixture(source: string) {
  const events: Event[] = [];
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${crypto.randomUUID()}`) as {
    start: (record: (event: Event) => void) => ReturnType<typeof createServer>;
  };
  const server = module.start(event => events.push(event));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    events,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
