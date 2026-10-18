import { day, motion } from '@kithfield/theme';

/*
 * The desk's styles, from `design/19 Moderation Console`. Colours shared with the app come from
 * the theme; the desk's own (the sidebar, cards, the brick of a removal) are as the design writes
 * them. Hover tints use the theme's cross-fade; a picked decision highlights in 150ms and history
 * rows fade in 30ms apart, as the design's notes say.
 */

const desk = {
  side: '#EDE4D5',
  card: '#fbf7f0',
  muted: '#5b5048',
  ring: '#c9973e',
  brick: '#9a3b26',
  urgentRow: '#f7e3da',
  dot: '#a0948a',
  honeyInk: '#8a5a1c',
  mossInk: '#3f5a31',
  line: 'rgba(42,34,29,.08)',
  wash: 'rgba(42,34,29,.07)',
} as const;

const cross = `${motion.cross.durationMs}ms cubic-bezier(${motion.cross.bezier.join(',')})`;
const fade = `${motion.fade.durationMs}ms cubic-bezier(${motion.fade.bezier.join(',')})`;
const sys = `-apple-system,'SF Pro Text',system-ui,sans-serif`;
const serif = `'Young Serif',Georgia,serif`;

export const styles = `
@font-face{font-family:'Young Serif';src:url(/fonts/YoungSerif-Regular.ttf) format('truetype');font-display:block}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:${day.paper};font-family:${sys};color:${day.ink};-webkit-font-smoothing:antialiased}
a{color:inherit}
kf-art{display:block}
button,input,select,textarea{font:inherit;color:inherit}
.app{display:grid;grid-template-columns:232px minmax(0,1fr);height:100vh;min-height:720px}
.side{background:${desk.side};border-right:1px solid ${desk.line};padding:18px 12px;display:flex;flex-direction:column;gap:4px;min-height:0}
.brand{display:flex;align-items:center;gap:10px;padding:0 8px 16px;text-decoration:none}
.brand kf-art{width:30px;height:30px;border-radius:8px;overflow:hidden;flex:none}
.brand-name{font:400 16px/1.1 ${serif}}
.brand-sub{font:600 11px/1.2 ${sys};color:${day.ink3};letter-spacing:.04em;text-transform:uppercase}
.nav{height:38px;border-radius:10px;padding:0 10px;display:flex;align-items:center;gap:10px;font:500 14px/1 ${sys};color:${day.ink};text-decoration:none;transition:background ${cross}}
.nav:hover{background:rgba(251,247,240,.6)}
.nav.on{font-weight:600;background:${desk.card};box-shadow:0 1px 3px rgba(42,34,29,.12)}
.nav.urgent{color:${desk.brick}}
.nav kf-art{width:18px;height:18px;flex:none}
.nav .label{flex:1}
.count{font:600 12px/1 ${sys};color:${day.ink3}}
.badge{font:600 12px/1 ${sys};color:#fff;background:${day.clay};padding:3px 7px;border-radius:9px}
.grow{flex:1}
.shift{border-radius:14px;background:${desk.card};padding:12px;display:flex;flex-direction:column;gap:8px}
.shift-who{display:flex;align-items:center;gap:8px}
.shift-who kf-art{width:30px;height:30px;border-radius:15px;overflow:hidden;flex:none}
.shift-name{font:600 13.5px/1.2 ${sys}}
.shift-on{font:12px/1.2 ${sys};color:${day.moss}}
.shift-care{font:12px/1.4 ${sys};color:${desk.muted}}
.main{display:flex;flex-direction:column;min-height:0;min-width:0}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:22px 28px 14px}
.title{font:400 28px/1.1 ${serif}}
.lead{font:13.5px/1.4 ${sys};color:${desk.muted};margin-top:4px}
.actions{display:flex;gap:8px;align-items:center}
.btn{height:34px;padding:0 14px;border-radius:17px;background:${desk.wash};color:${day.ink};display:inline-flex;align-items:center;gap:6px;font:600 13px/1 ${sys};text-decoration:none;white-space:nowrap;cursor:pointer;border:0}
.btn kf-art{width:16px;height:16px}
.btn.dark{background:${day.ink};color:${day.paper}}
.card{border-radius:18px;background:${desk.card};border:1px solid ${desk.line}}
.eyebrow{font:700 10.5px/1 ${sys};letter-spacing:.06em;text-transform:uppercase;color:${day.ink3}}
.pill{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:11px;background:${desk.wash};color:${desk.muted};font:600 11.5px/1 ${sys};white-space:nowrap}
.pill.honey{background:${day.honeyTint};color:${desk.honeyInk}}
.pill.moss{background:${day.mossTint};color:${desk.mossInk}}
.note{font:12px/1.4 ${sys};color:${day.ink3}}
.big-btn{height:44px;border-radius:22px;background:${day.ink};color:${day.paper};display:flex;align-items:center;justify-content:center;font:600 14.5px/1 ${sys};text-decoration:none;border:0;width:100%;cursor:pointer;transition:background ${fade}}
.big-btn.brick{background:${desk.brick}}
.flash{margin:0 28px 12px;padding:10px 14px;border-radius:12px;background:${day.mossTint};color:${desk.mossInk};font:600 13px/1.3 ${sys}}
.flash.warn{background:${day.honeyTint};color:${desk.honeyInk}}
.chips{padding:0 28px 12px;display:flex;gap:6px;flex-wrap:wrap}
.chip{height:32px;padding:0 12px;border-radius:15px;display:inline-flex;align-items:center;gap:4px;font:600 12.5px/1 ${sys};background:${desk.card};color:${day.ink};border:1px solid rgba(42,34,29,.1);text-decoration:none}
.chip.on{background:${day.ink};color:${day.paper}}
.queue{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;padding:0 28px 24px;min-height:0;flex:1}
.table{overflow:auto}
.qrow{display:grid;grid-template-columns:12px 74px 124px minmax(0,1fr) 116px 44px 60px 80px;gap:0 10px;align-items:center;padding:0 16px}
.qhead{padding:11px 16px;border-bottom:1px solid rgba(42,34,29,.1);font:700 10.5px/1 ${sys};letter-spacing:.06em;text-transform:uppercase;color:${day.ink3}}
.qline{height:55px;border-bottom:1px solid rgba(42,34,29,.06);cursor:pointer;font:13.5px/1.25 ${sys};text-decoration:none;transition:background ${cross}}
.qline:hover{background:rgba(248,233,199,.45)}
.qline.urgent{background:${desk.urgentRow}}
.qline.sel{background:${day.honeyTint};box-shadow:inset 3px 0 0 ${desk.ring}}
.dot{width:9px;height:9px;border-radius:5px;background:${desk.dot}}
.dot.urgent{background:${day.clay}}
.dot.flag{background:${desk.ring}}
.soft{color:${desk.muted}}
.strong{font-weight:600}
.clip{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.late{color:${desk.brick}}
.preview{padding:18px;display:flex;flex-direction:column;gap:14px}
.preview[hidden]{display:none}
.pv-cat{font:400 22px/1.15 ${serif}}
.pv-what{font:13.5px/1.45 ${sys};color:${day.ink2}}
.pv-box{border-radius:14px;background:${day.paper};padding:12px 14px;font:14px/1.45 ${sys}}
.pv-hint{font:12.5px/1.4 ${sys};color:${day.ink3}}
.pending{margin:0 28px 12px;gap:0}
.prow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid rgba(42,34,29,.07);font:13px/1.35 ${sys}}
.kv{display:flex;flex-direction:column;gap:6px;font:13px/1.4 ${sys};color:${day.ink2}}
.kv div{display:flex;justify-content:space-between;gap:12px}
.kv span+span{color:${day.ink3};text-align:right}
.empty{padding:48px 24px;text-align:center;font:400 20px/1.3 ${serif};color:${desk.muted}}
.search{display:none;position:absolute;right:0;top:42px;z-index:2;padding:12px;width:300px;flex-direction:column;gap:8px;box-shadow:0 12px 30px -12px rgba(42,34,29,.4)}
.search.open{display:flex}
.field{height:36px;border-radius:10px;border:1px solid rgba(42,34,29,.14);background:${day.card};padding:0 10px;font:13.5px/1 ${sys};width:100%}
textarea.field{height:auto;padding:10px 12px;font:14px/1.5 ${sys};color:${day.ink2};resize:vertical}
.r-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.9fr) 400px;gap:16px;padding:0 28px 24px;flex:1;min-height:0}
.pad{padding:16px 18px;display:flex;flex-direction:column;gap:14px;min-height:0}
.ctx{overflow:auto;display:flex;flex-direction:column;gap:14px;min-height:0;flex:1;padding:0 10px;margin:0 -10px}
.msg{display:flex;gap:9px;align-items:flex-start}
.msg kf-art{width:28px;height:28px;border-radius:14px;overflow:hidden;flex:none}
.msg.hit{padding:10px;margin:0 -10px;border-radius:14px;background:${day.honeyTint};box-shadow:inset 0 0 0 1.5px ${desk.ring}}
.msg-who{font:600 12px/1 ${sys};color:${day.ink3};margin-bottom:4px}
.msg-who .at{font-weight:400}
.msg-who .flagged{color:${desk.honeyInk}}
.msg-text{font:14px/1.4 ${sys};color:${day.ink};white-space:pre-wrap;overflow-wrap:anywhere}
.msg-text.gone{color:${day.ink3};font-style:italic}
.blur{filter:blur(6px);user-select:none}
.show{border:0;background:${desk.wash};border-radius:11px;height:22px;padding:0 9px;font:600 11.5px/1 ${sys};cursor:pointer;margin-left:6px}
.stack{display:flex;flex-direction:column;gap:16px;min-height:0}
.who-row{display:flex;align-items:center;gap:8px;font:13.5px/1.3 ${sys}}
.quote{font:14px/1.45 ${sys};color:${day.ink};padding:10px 12px;border-radius:12px;background:${day.paper}}
.sig{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid rgba(42,34,29,.07);font:13px/1.35 ${sys}}
.sig span:first-child{color:${desk.muted}}
.sig span:last-child{font-weight:600;text-align:right}
.decide{gap:10px}
.opt{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border-radius:12px;cursor:pointer;box-shadow:inset 0 0 0 1px ${desk.line};transition:background 150ms ease-out,box-shadow 150ms ease-out}
.opt input{position:absolute;opacity:0;pointer-events:none}
.radio{width:18px;height:18px;border-radius:9px;flex:none;margin-top:1px;border:1.5px solid rgba(42,34,29,.35);background:${day.card};transition:border 150ms ease-out}
.opt:has(input:checked){background:${day.honeyTint};box-shadow:inset 0 0 0 1.5px ${desk.ring}}
.opt:has(input:checked) .radio{border:5px solid ${day.ink}}
.opt:has(input:focus-visible){outline:2px solid ${desk.ring};outline-offset:2px}
.opt-t{font:600 14px/1.25 ${sys};color:${day.ink}}
.opt-t.brick{color:${desk.brick}}
.opt-s{font:12.5px/1.35 ${sys};color:${day.ink3};margin-top:2px}
.opt-more{display:none;gap:6px;margin:-4px 0 0 38px}
.opt:has(input:checked)+.opt-more{display:flex}
.toggle{display:flex;align-items:center;justify-content:space-between;font:13px/1.3 ${sys};cursor:pointer}
.toggle input{position:absolute;opacity:0}
.switch{width:40px;height:24px;border-radius:12px;background:rgba(42,34,29,.2);position:relative;flex:none;transition:background ${fade}}
.switch::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:10px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left ${fade}}
.toggle input:checked+.switch{background:${day.moss}}
.toggle input:checked+.switch::after{left:18px}
.toggle input:focus-visible+.switch{outline:2px solid ${desk.ring};outline-offset:2px}
.rule-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font:13px/1.3 ${sys}}
.rule-row select{height:30px;border-radius:9px;border:1px solid rgba(42,34,29,.14);background:${day.card};padding:0 8px;font:600 13px/1 ${sys};max-width:230px}
.push{margin-top:auto}
.center{text-align:center}
.m-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:16px;padding:0 28px 24px;flex:1;min-height:0}
.standing{display:flex;align-items:center;gap:14px;padding-bottom:14px}
.standing>kf-art{width:56px;height:56px;border-radius:28px;overflow:hidden;flex:none}
.standing-t{font:400 22px/1.1 ${serif}}
.hist{display:grid;grid-template-columns:14px 110px minmax(0,1fr);gap:0 12px;padding:12px 0;border-top:1px solid rgba(42,34,29,.07);align-items:start;animation:rise ${fade} both;animation-delay:calc(var(--i,0) * 30ms)}
.hist .hdot{width:10px;height:10px;border-radius:5px;background:${desk.dot};margin-top:4px}
.hdot.honey{background:${desk.ring}}.hdot.clay{background:${day.clay}}.hdot.moss{background:${day.moss}}
.hist-at{font:13px/1.35 ${sys};color:${day.ink3}}
.hist-t{font:600 14px/1.3 ${sys}}
.hist-s{font:13px/1.4 ${sys};color:${desk.muted};margin-top:2px}
.hist-s a{text-decoration:none}
@keyframes rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.act{border-radius:12px;border:1px solid rgba(42,34,29,.1)}
.act summary{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;list-style:none}
.act summary::-webkit-details-marker{display:none}
.act form{display:flex;flex-direction:column;gap:8px;padding:0 12px 12px}
.chev{font:600 13px/1 ${sys};color:${day.ink3}}
.a-grid{display:grid;grid-template-columns:330px minmax(0,1fr);gap:16px;padding:0 28px 24px;flex:1;min-height:0}
.a-list{padding:10px;display:flex;flex-direction:column;gap:2px;overflow:auto}
.a-row{display:flex;gap:10px;align-items:center;padding:11px 12px;border-radius:12px;text-decoration:none;transition:background ${cross}}
.a-row:hover{background:rgba(248,233,199,.45)}
.a-row.sel{background:${day.honeyTint};box-shadow:inset 0 0 0 1.5px ${desk.ring}}
.a-row kf-art{width:30px;height:30px;border-radius:15px;overflow:hidden;flex:none}
.a-name{font:600 14px/1.25 ${sys}}
.a-sub{font:12.5px/1.3 ${sys};color:${desk.muted}}
.a-age{font:12px/1 ${sys};color:${day.ink3}}
.a-detail{padding:18px 22px;display:flex;flex-direction:column;gap:14px}
.a-title{font:400 20px/1.1 ${serif}}
.a-meta{font:12.5px/1.3 ${sys};color:${day.ink3}}
.a-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.box{border-radius:14px;background:${day.paper};padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.box.line{background:transparent;border:1px solid rgba(42,34,29,.1)}
.box-t{font:14px/1.4 ${sys}}
.box-s{font:12.5px/1.35 ${sys};color:${day.ink3}}
.stats{padding:0 28px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.stat{padding:16px 18px;display:flex;flex-direction:column;gap:4px}
.stat-v{font:400 34px/1 ${serif}}
.stat-t{font:600 13.5px/1.3 ${sys}}
.stat-s{font:12.5px/1.35 ${sys};color:${day.ink3}}
.never{padding:6px 28px 0;font:12.5px/1.4 ${sys};color:${day.ink3}}
.audit{margin:12px 28px 24px;overflow:auto;flex:1;min-height:0}
.arow{display:grid;grid-template-columns:120px 110px 220px 120px 150px minmax(0,1fr);gap:0 14px;padding:11px 16px}
.arow.line{border-top:1px solid rgba(42,34,29,.06);font:13px/1.3 ${sys}}
.arow.line span{color:${day.ink2};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.arow.line span.strong{color:${day.ink}}
.more{display:block;padding:12px 16px;font:600 13px/1 ${sys};color:${day.ink3}}
.page{padding:0 28px 24px;display:flex;flex-direction:column;gap:12px}
.rules{padding:8px 18px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;
