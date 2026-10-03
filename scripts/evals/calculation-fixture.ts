import type { Variant } from "./fixture.js";

// Entirely synthetic data. Both formats describe exactly the same requirements.
export function calculationSource(variant: Variant): string {
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Match calculator</title>
<style>body{font:18px system-ui;max-width:700px;margin:60px auto;padding:24px}label{display:block;margin:16px 0}input{width:95%;padding:8px}button,select{padding:8px}output{display:block;font-size:32px;margin:24px 0}</style>
<h1>Match calculator</h1>
<p>Job requirements: <strong>Python, SQL, Docker</strong>.</p>
<p>Score = matching requirements / 3 × 100, rounded to the nearest integer. Match whole skill names, ignoring case and surrounding spaces. Extra or duplicate candidate skills do not change the score. List and text formats must give the same result.</p>
<form><label>Candidate skills (comma-separated)<input id="skills" name="skills" value="Python, SQL"></label>
<label>Requirement format<select id="format"><option value="list">List</option><option value="text">Text</option></select></label>
<button>Calculate match</button></form><output id="score" aria-label="Match score"></output><p role="status"></p>
<script>
document.querySelector('form').onsubmit=async e=>{
 e.preventDefault(); document.querySelector('#score').textContent=''; document.querySelector('[role=status]').textContent='Calculating';
 const response=await fetch('/api/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({skills:document.querySelector('#skills').value,format:document.querySelector('#format').value})});
 const data=await response.json(); document.querySelector('#score').textContent=data.score+'%'; document.querySelector('[role=status]').textContent=response.ok?'Calculated':'Calculation failed';
};
</script></html>`;
  return `import { createServer } from 'node:http';
const html=${JSON.stringify(html)};
export function start(record=()=>{}) {
 return createServer(async (req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const browser=!!req.headers['sec-fetch-mode'];
  const send=(status,data,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(data)};
  if(req.method==='GET'&&path==='/'){record({method:'GET',path,browser});return send(200,html,'text/html')}
  if(req.method==='POST'&&path==='/api/match'){
   let raw='';for await(const chunk of req)raw+=chunk;
   let body;try{body=JSON.parse(raw)}catch{return send(400,'{}')}
   if(typeof body.skills!=='string'||!['list','text'].includes(body.format))return send(400,'{}');
   const requirements=body.format==='list'?['Python','SQL','Docker']:'Python, SQL, Docker';
   const items=${variant === "broken" ? "Array.from(requirements)" : "Array.isArray(requirements)?requirements:requirements.split(',')"};
   const candidate=new Set(body.skills.split(',').map(s=>s.trim().toLowerCase()));
   const matched=items.filter(s=>candidate.has(s.trim().toLowerCase())).length;
   const score=Math.round(matched/items.length*100);
   record({method:'POST',path,browser,format:body.format,skills:body.skills,score});
   return send(200,JSON.stringify({score}));
  }
  send(404,'{}');
 });
}
`;
}
