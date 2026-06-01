export function sceneHtml({
  title,
  eyebrow,
  headline,
  subhead,
  points = [],
  component = "clean_explainer",
  transparent = false,
}) {
  const items = points.length ? points : ["Focus", "Structure", "Rhythm", "Review"];
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="./styles.css" />
</head>
<body class="${transparent ? "transparent" : ""}">
<main class="stage" data-component="${escapeHtml(component)}">
  <div class="background-grid"></div>
  <header class="topbar">
    <div class="brand-mark"><span></span>WM Academy</div>
    <div class="scene-code">${escapeHtml(eyebrow)}</div>
  </header>

  <section class="layout">
    <div class="text-stack">
      <div class="eyebrow">${escapeHtml(eyebrow)}</div>
      <h1>${escapeHtml(headline)}</h1>
      <div class="focus-line"></div>
      <p>${escapeHtml(subhead)}</p>
      <div class="kinetic-caption">${items.map((phrase, index) => `<span data-point="${index}">${escapeHtml(phrase)}</span>`).join("")}</div>
    </div>

    <div class="canvas">
      <div class="primary-shape"></div>
      <div class="secondary-shape one"></div>
      <div class="secondary-shape two"></div>
      <div class="secondary-shape three"></div>
      <div class="bar-chart">${items.map((item, index) => `<div class="bar-wrap"><div class="bar" data-index="${index}"></div><label>${escapeHtml(labelFor(item))}</label></div>`).join("")}</div>
      <svg class="diagram" viewBox="0 0 620 420" aria-hidden="true">
        <path class="diagram-line line-a" d="M78 102 C178 78 230 140 320 132 C428 122 462 74 548 96" />
        <path class="diagram-line line-b" d="M92 292 C184 226 278 224 370 274 C430 306 492 302 560 240" />
      </svg>
      <div class="cursor"></div>
      <div class="click-ring"></div>
      <div class="tooltip">Source of truth</div>
    </div>
  </section>

  <section class="points">
    ${items.map((point, index) => `<article class="point" data-index="${index}">
      <span>0${index + 1}</span>
      <strong>${escapeHtml(point)}</strong>
      <small>${escapeHtml(detailFor(point, component))}</small>
    </article>`).join("")}
  </section>
</main>
<script src="./animation.js"></script>
</body>
</html>`;
}

export function sceneCss({ transparent = false }) {
  return `:root{--bg:${transparent ? "transparent" : "#f7f6f1"};--ink:#111111;--muted:#666666;--soft:#d9d4c8;--hair:#e8e3d8;--gold:#b89332;--blue:#276ef1;--warm:#fffaf0;--ease:cubic-bezier(0.22,1,0.36,1)}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${transparent ? "transparent" : "#f7f6f1"};font-family:Inter,Segoe UI,Arial,sans-serif;color:var(--ink);letter-spacing:0}
.stage{position:relative;width:100vw;height:100vh;background:var(--bg);padding:54px 68px;overflow:hidden}
.background-grid{position:absolute;inset:0;background:linear-gradient(to right,rgba(17,17,17,.045) 1px,transparent 1px) 0 0/96px 96px,linear-gradient(to bottom,rgba(17,17,17,.045) 1px,transparent 1px) 0 0/96px 96px}
.topbar{position:relative;display:flex;justify-content:space-between;align-items:center;height:42px;font-size:18px;color:var(--muted)}
.brand-mark{font-weight:800;color:var(--ink)}.brand-mark span{display:inline-block;width:12px;height:12px;background:var(--gold);margin-right:12px}.scene-code{font-family:Consolas,monospace;text-transform:uppercase;color:var(--gold)}
.layout{position:relative;display:grid;grid-template-columns:1.04fr .96fr;gap:70px;align-items:center;height:610px}
.text-stack{position:relative;z-index:2}.eyebrow{font-family:Consolas,monospace;text-transform:uppercase;font-size:20px;color:var(--gold);margin-bottom:24px}
h1{font-size:86px;line-height:.96;font-weight:850;margin:0;max-width:880px;color:var(--ink)}
.focus-line{height:5px;width:0;background:var(--gold);margin:32px 0 26px;transform-origin:left center}
p{font-size:30px;line-height:1.28;color:var(--muted);margin:0;max-width:780px}
.kinetic-caption{display:flex;flex-wrap:wrap;gap:10px;margin-top:34px;max-width:840px}
.kinetic-caption span{font-size:24px;font-weight:800;background:#fff;border:1px solid var(--hair);padding:8px 12px;color:#777;opacity:0;transform:translateY(12px) scale(.98)}
.canvas{position:relative;height:420px;background:rgba(255,255,255,.66);border:1px solid var(--hair);overflow:hidden;box-shadow:0 26px 80px rgba(30,25,15,.12)}
.primary-shape{position:absolute;left:64px;top:74px;width:136px;height:136px;border-radius:50%;background:var(--blue);transform:translateX(-210px);box-shadow:0 24px 70px rgba(39,110,241,.22)}
.secondary-shape{position:absolute;width:52px;height:52px;border-radius:50%;background:#d7e4ff;opacity:0;transform:translateY(20px)}.secondary-shape.one{left:250px;top:118px}.secondary-shape.two{left:330px;top:118px}.secondary-shape.three{left:410px;top:118px}
.bar-chart{position:absolute;left:72px;right:72px;bottom:52px;height:155px;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;align-items:end}
.bar-wrap{height:100%;display:grid;grid-template-rows:1fr 38px;gap:10px}.bar{align-self:end;width:100%;height:0;background:linear-gradient(180deg,var(--blue),#8ab4ff);border-radius:6px 6px 0 0}.bar-wrap label{text-align:center;font-size:13px;line-height:1.1;font-weight:800;color:#555;white-space:normal;overflow:hidden;overflow-wrap:anywhere}
.diagram{position:absolute;inset:0;width:100%;height:100%;fill:none;pointer-events:none}.diagram-line{stroke:var(--gold);stroke-width:3;stroke-linecap:round;stroke-dasharray:720;stroke-dashoffset:720;opacity:.9}
.cursor{position:absolute;width:24px;height:34px;background:#111;clip-path:polygon(0 0,0 100%,31% 76%,49% 100%,65% 92%,47% 68%,84% 68%);transform:translate(58px,44px);filter:drop-shadow(0 8px 18px rgba(0,0,0,.28))}
.click-ring{position:absolute;width:52px;height:52px;border:3px solid var(--blue);border-radius:50%;opacity:0;transform:translate(42px,30px) scale(.45)}
.tooltip{position:absolute;right:56px;top:44px;background:#111;color:#fff;font-size:18px;font-weight:800;padding:11px 14px;opacity:0;transform:translateY(10px)}
.points{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:24px}
.point{min-height:150px;background:#fff;border:1px solid var(--hair);padding:22px;opacity:.42;transform:translateY(24px) scale(.985);transition:opacity .35s var(--ease),transform .35s var(--ease),border-color .35s var(--ease),box-shadow .35s var(--ease)}
.point span{font-family:Consolas,monospace;color:var(--gold);font-size:17px}.point strong{display:block;font-size:25px;line-height:1.08;margin:18px 0 12px}.point small{display:block;font-size:16px;line-height:1.3;color:var(--muted);opacity:0;transform:translateY(8px)}
.stage[data-active="0"] .point[data-index="0"],.stage[data-active="1"] .point[data-index="1"],.stage[data-active="2"] .point[data-index="2"],.stage[data-active="3"] .point[data-index="3"]{opacity:1;transform:translateY(-8px) scale(1.025);border-color:rgba(184,147,50,.65);box-shadow:0 18px 45px rgba(184,147,50,.13)}
.stage[data-active="0"] .point[data-index="0"] small,.stage[data-active="1"] .point[data-index="1"] small,.stage[data-active="2"] .point[data-index="2"] small,.stage[data-active="3"] .point[data-index="3"] small{opacity:1;transform:none}`;
}

export function animationJs({ duration = 20, pointCount = 4, barValues = [], pointTimes = [] } = {}) {
  const bars = barValues.length ? barValues : [52, 78, 62, 90];
  // pointTimes: [{start,end}] scene-relative seconds (from voice alignment).
  // When present, focus + captions are LOCKED to the narration. When absent,
  // they fall back to even division across the scene duration.
  return `const stage=document.querySelector('.stage');const points=[...document.querySelectorAll('.point')];const words=[...document.querySelectorAll('.kinetic-caption span')];const bars=[...document.querySelectorAll('.bar')];const paths=[...document.querySelectorAll('.diagram-line')];const primary=document.querySelector('.primary-shape');const small=[...document.querySelectorAll('.secondary-shape')];const line=document.querySelector('.focus-line');const cursor=document.querySelector('.cursor');const ring=document.querySelector('.click-ring');const tooltip=document.querySelector('.tooltip');const duration=${Number(duration)};const count=${Number(pointCount)||4};const values=${JSON.stringify(bars)};const pointTimes=${JSON.stringify(pointTimes || [])};
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function ease(t){return 1-Math.pow(1-clamp(t,0,1),3)}
function outBack(t){t=clamp(t,0,1)-1;return 1+t*t*(2.7*t+1.7)}
function lerp(a,b,t){return a+(b-a)*t}
function stagger(p,start,step,len){return clamp((p-start)/len,0,1)}
function startOf(i){return pointTimes[i]&&typeof pointTimes[i].start==='number'?pointTimes[i].start:(i*duration/Math.max(count,1))}
function activeAt(t){if(pointTimes.length){let a=0;for(let i=0;i<pointTimes.length;i++){if(t>=startOf(i)-0.001)a=i}return a}return Math.min(count-1,Math.floor((t/duration)*count))}
function renderAt(t){const p=clamp(t/duration,0,1);const active=activeAt(t);stage.dataset.active=String(active);
primary.style.transform='translateX('+lerp(-210,0,ease(p/.12))+'px) scale('+(1+0.1*ease((p-.08)/.22))+')';
line.style.width=(100*ease((p-.12)/.14))+'%';
small.forEach((el,i)=>{const e=ease(stagger(p,.16+i*.035,.035,.16));el.style.opacity=String(e);el.style.transform='translateY('+(20-20*e)+'px)'});
bars.forEach((el,i)=>{const e=outBack(stagger(p,.28+i*.04,.04,.22));el.style.height=(values[i%values.length]*e)+'%'});
paths.forEach((path,i)=>{path.style.strokeDashoffset=String(720-(720*ease(stagger(p,.36+i*.08,.08,.28))))});
points.forEach((card,i)=>{const local=clamp((t-startOf(i))/0.5,0,1);card.style.opacity=i===active?'1':String(i<active?.62:.40);card.style.transform='translateY('+(i===active?-8:24-24*ease(local))+'px) scale('+(i===active?1.03:.985)+')'});
words.forEach((word,i)=>{const e=ease(clamp((t-startOf(i))/0.4,0,1));const hot=i===active;word.style.opacity=String(0.25+0.75*e);word.style.transform='translateY('+(12-12*e)+'px) scale('+(hot?1.08:.98+.02*e)+')';word.style.color=hot?'#111':'#888';word.style.borderColor=hot?'rgba(39,110,241,.55)':'#e8e3d8';word.style.background=hot?'#fff':'#fbfaf6'});
const x=lerp(58,515,ease(p)),y=lerp(44,292,.5-.5*Math.cos(p*Math.PI));cursor.style.transform='translate('+x+'px,'+y+'px)';const aStart=startOf(active),click=Math.max(0,1-Math.abs(t-(aStart+0.2))*4);ring.style.transform='translate('+(x-14)+'px,'+(y-14)+'px) scale('+(0.45+click*.82)+')';ring.style.opacity=String(click*.7);tooltip.style.opacity=String(clamp((p-.2)*5,0,1)*clamp((.86-p)*5,0,1));tooltip.style.transform='translateY('+(10-10*clamp((p-.2)*5,0,1))+'px)'}
window.renderAt=renderAt;window.__wmVideoReady=true;renderAt(0);`;
}

function captionWords(headline, subhead) {
  const text = `${headline} ${subhead}`.replace(/[^\w&]+/g, " ").trim();
  return text.split(/\s+/).slice(0, 12);
}

function labelFor(point) {
  return String(point).replace(/\s+/g, " ");
}

function detailFor(point, component) {
  const p = String(point).toLowerCase();
  if (p.includes("visibility")) return "Make work observable before it becomes urgent.";
  if (p.includes("system")) return "Use the operating layer as the source of truth.";
  if (p.includes("task")) return "Track ownership, state, blocker, and next action.";
  if (p.includes("report")) return "Turn activity into decisions and priorities.";
  if (p.includes("client")) return "Connect the work to a real relationship and outcome.";
  if (p.includes("project")) return "Group related tasks around one delivery objective.";
  if (p.includes("document")) return "Write decisions where the team can reuse them.";
  if (p.includes("follow")) return "Close the loop and make the next step visible.";
  if (component === "growth_engine") return "Restraint, rhythm, and hierarchy make the system legible.";
  return "Reveal only what matters at this moment in the narration.";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
