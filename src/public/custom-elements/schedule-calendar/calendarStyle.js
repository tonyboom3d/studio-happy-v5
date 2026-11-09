import { HOUR_PX } from './calendarLayout.js';

export const CALENDAR_STYLE = `
.sc-panel { padding: 0 !important; overflow: visible; }
.sc-root { --sc-line: #e8ebf0; --sc-line-soft: #f1f3f6; --sc-text: #20303c; --sc-muted: #6b7785; --sc-blue: #116dff; --sc-blue-soft: #e7f0ff; --sc-red: #e62214;
    position: relative; direction: rtl; color: var(--sc-text); font-size: 13px; background: #fff; border-radius: 14px; }
.sc-root button { font-family: inherit; }

/* Toolbar */
.sc-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--sc-line); }
.sc-title { font-size: 17px; font-weight: 600; margin: 0 4px; white-space: nowrap; }
.sc-spacer { flex: 1; }
.sc-btn { height: 32px; padding: 0 14px; border-radius: 18px; border: 1px solid #c9d1da; background: #fff; color: var(--sc-text); font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: background .15s, border-color .15s; }
.sc-btn:hover { background: #f4f7fb; border-color: #a9b4c1; }
.sc-btn.primary { background: var(--sc-blue); border-color: var(--sc-blue); color: #fff; }
.sc-btn.primary:hover { background: #0f5fe0; }
.sc-btn.ghost { border-color: transparent; color: var(--sc-blue); }
.sc-btn.ghost:hover { background: var(--sc-blue-soft); }
.sc-btn.danger { color: var(--sc-red); border-color: #f3c1bd; }
.sc-btn.danger:hover { background: #fff1f0; }
.sc-btn.sm { height: 26px; padding: 0 10px; font-size: 12px; border-radius: 14px; }
.sc-btn[disabled] { opacity: .45; cursor: default; }
.sc-icon-btn { width: 30px; height: 30px; border-radius: 50%; border: none; background: transparent; color: var(--sc-text); font-size: 20px; line-height: 1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.sc-icon-btn:hover { background: #eef2f7; }
.sc-seg { display: inline-flex; border: 1px solid #c9d1da; border-radius: 18px; overflow: hidden; height: 32px; }
.sc-seg button { border: none; background: #fff; padding: 0 14px; font-size: 13px; cursor: pointer; color: var(--sc-text); }
.sc-seg button + button { border-inline-start: 1px solid #e1e6ec; }
.sc-seg button.active { background: var(--sc-blue-soft); color: var(--sc-blue); font-weight: 600; }
.sc-save-pill { font-size: 12px; color: var(--sc-muted); display: inline-flex; align-items: center; gap: 6px; }
.sc-save-pill.busy { color: var(--sc-blue); }
.sc-mini-spin { width: 12px; height: 12px; border: 2px solid #c7d7f5; border-top-color: var(--sc-blue); border-radius: 50%; animation: scSpin .8s linear infinite; }
@keyframes scSpin { to { transform: rotate(360deg); } }

/* Multi-select filters */
.sc-ms { position: relative; }
.sc-ms-btn.has { border-color: var(--sc-blue); color: var(--sc-blue); background: var(--sc-blue-soft); }
.sc-ms-pop { position: absolute; top: 38px; inset-inline-end: 0; z-index: 40; width: 240px; max-height: 320px; overflow: auto; background: #fff; border: 1px solid var(--sc-line); border-radius: 10px; box-shadow: 0 10px 30px rgba(22,45,61,.14); padding: 6px; }
.sc-ms-opt { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.sc-ms-opt:hover { background: #f4f7fb; }
.sc-ms-foot { display: flex; justify-content: space-between; padding: 6px 4px 2px; border-top: 1px solid var(--sc-line-soft); margin-top: 4px; }
.sc-swatch { width: 10px; height: 10px; border-radius: 3px; flex: 0 0 auto; }

/* Body layout */
.sc-body { display: flex; align-items: stretch; min-height: 520px; }
.sc-side { width: 232px; flex: 0 0 232px; border-inline-end: 1px solid var(--sc-line); padding: 14px 14px 18px; display: flex; flex-direction: column; gap: 18px; }
.sc-main { flex: 1; min-width: 0; position: relative; }
.sc-loading { position: absolute; inset: 0; background: rgba(255,255,255,.6); display: flex; align-items: center; justify-content: center; gap: 8px; z-index: 30; color: var(--sc-muted); }

/* Mini calendar */
.sc-mini-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-weight: 600; font-size: 13px; }
.sc-mini-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
.sc-mini-dow { font-size: 11px; color: var(--sc-muted); padding: 2px 0; }
.sc-mini-day { position: relative; height: 26px; border: none; background: transparent; border-radius: 50%; font-size: 12px; cursor: pointer; color: var(--sc-text); }
.sc-mini-day:hover { background: #eef2f7; }
.sc-mini-day.out { color: #b3bcc6; }
.sc-mini-day.inrange { background: var(--sc-blue-soft); border-radius: 6px; }
.sc-mini-day.today { background: var(--sc-blue); color: #fff; font-weight: 600; border-radius: 50%; }
.sc-mini-day.has::after { content: ''; position: absolute; bottom: 2px; left: 50%; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: #9aa7b5; }
.sc-mini-day.today.has::after { background: #fff; }
.sc-side-title { font-size: 12px; font-weight: 600; color: var(--sc-muted); margin: 0 0 6px; }
.sc-legend { display: flex; flex-direction: column; gap: 2px; }
.sc-legend-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: none; background: transparent; border-radius: 6px; cursor: pointer; text-align: start; font-size: 13px; color: var(--sc-text); }
.sc-legend-item:hover { background: #f4f7fb; }
.sc-legend-item.off { opacity: .4; }
.sc-legend-item .sc-swatch { width: 12px; height: 12px; }
.sc-side-stats { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--sc-muted); }
.sc-side-stats b { color: var(--sc-text); }

/* Week / day time grid */
.sc-scroll { overflow: auto; max-height: max(560px, calc(100vh - 150px)); position: relative; }
.ep-wrap:has(.sc-root) { padding: 10px 8px; }
.sc-select { border: 1px solid var(--sc-line); background: #fff; border-radius: 8px; padding: 7px 10px; font-size: 13px; font-family: inherit; color: var(--sc-text); cursor: pointer; }
.sc-select.has { border-color: var(--sc-blue); background: var(--sc-blue-soft); color: var(--sc-blue); }
.sc-floattip { position: fixed; z-index: 2147483600; max-width: 280px; white-space: pre-wrap; text-align: start; background: #20303c; color: #fff; font-size: 12px; font-weight: 400; line-height: 1.45; padding: 7px 10px; border-radius: 8px; box-shadow: 0 6px 20px rgba(22,45,61,.3); pointer-events: none; }
.sc-note-badge { flex: 0 0 auto; cursor: help; font-size: 12px; line-height: 1; }
.sc-lightbox { position: fixed; inset: 0; z-index: 2147483400; background: rgba(15,23,42,.86); display: flex; align-items: center; justify-content: center; padding: 24px; }
.sc-lightbox img { max-width: min(92vw, 900px); max-height: 86vh; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
.sc-lightbox-x { position: absolute; top: 16px; inset-inline-end: 16px; width: 38px; height: 38px; border: none; border-radius: 50%; background: rgba(255,255,255,.16); color: #fff; font-size: 22px; cursor: pointer; }
button.sc-thumb { padding: 0; cursor: zoom-in; }
.sc-grp { border-bottom: 1px solid var(--sc-line-soft); }
.sc-grp-head { cursor: pointer; border-radius: 8px; }
.sc-grp-head:hover { background: #f6f8fb; }
.sc-chev { color: var(--sc-muted); font-size: 11px; }
.sc-note-ico { font-size: 15px; }
.sc-note-btn { border: 1px solid transparent; background: transparent; border-radius: 8px; width: 30px; height: 30px; font-size: 15px; cursor: pointer; opacity: .45; flex: 0 0 auto; }
.sc-note-btn:hover { background: #eef2f7; opacity: 1; }
.sc-note-btn.has { opacity: 1; background: #fff7e6; border-color: #f5d79a; }
.sc-gd { margin: 0 6px 10px; padding: 10px 12px; background: #f9fafc; border: 1px solid var(--sc-line); border-radius: 10px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
.sc-gd-line { display: flex; gap: 8px; align-items: flex-start; }
.sc-gd-line .k { flex: 0 0 74px; color: var(--sc-muted); }
.sc-gd-line .v { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.sc-gd a { color: var(--sc-blue); text-decoration: none; }
.sc-thumbs { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
.sc-thumb { position: relative; width: 58px; height: 58px; border-radius: 8px; overflow: hidden; border: 1px solid var(--sc-line); background: #fff; display: flex; align-items: center; justify-content: center; color: var(--sc-muted); }
.sc-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sc-thumb em { position: absolute; bottom: 0; inset-inline: 0; background: rgba(32,48,60,.7); color: #fff; font-size: 9px; font-style: normal; text-align: center; }
.sc-gd-note { background: #fff7e6; border-radius: 8px; padding: 6px 9px; white-space: pre-wrap; }
.sc-gd-note.int { background: #eef3ff; }
.sc-gd-note b { display: block; font-size: 11px; color: var(--sc-muted); margin-bottom: 2px; }
.sc-wk { min-width: 640px; }
.sc-wk.day { min-width: 0; }
.sc-wk-head, .sc-allday, .sc-wk-body { display: grid; grid-template-columns: 56px repeat(var(--sc-cols), minmax(0, 1fr)); }
.sc-wk-head { position: sticky; top: 0; z-index: 20; background: #fff; border-bottom: 1px solid var(--sc-line); }
.sc-dh { border: none; background: transparent; padding: 8px 4px 6px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; border-inline-start: 1px solid var(--sc-line-soft); color: var(--sc-text); min-width: 0; }
.sc-dh:hover { background: #f7f9fc; }
.sc-dh-row { display: flex; align-items: center; gap: 6px; }
.sc-dh-dow { font-size: 12px; color: var(--sc-muted); }
.sc-dh-num { font-size: 13px; font-weight: 500; }
.sc-dh.today { box-shadow: inset 0 3px 0 var(--sc-blue); }
.sc-dh.today .sc-dh-dow, .sc-dh.today .sc-dh-num { color: var(--sc-blue); font-weight: 600; }
.sc-dh-tags { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; min-height: 14px; }
.sc-tag { font-size: 10px; line-height: 14px; padding: 0 6px; border-radius: 8px; background: #f1f3f6; color: var(--sc-muted); white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.sc-tag.hol { background: #fff4e0; color: #9a5b00; }
.sc-tag.blk { background: #fde8e7; color: #b42318; }
.sc-tag.note { background: #e7f0ff; color: #1d4ed8; }
.sc-allday { border-bottom: 1px solid var(--sc-line); background: #fbfcfd; }
.sc-allday-label { font-size: 10px; color: var(--sc-muted); padding: 6px 4px; text-align: center; }
.sc-allday-cell { border-inline-start: 1px solid var(--sc-line-soft); padding: 4px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.sc-chip { border: none; text-align: start; font-size: 11px; padding: 3px 6px; border-radius: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #eef1f5; color: var(--sc-text); }
.sc-gutter { position: relative; }
.sc-hour-label { position: absolute; inset-inline-end: 8px; transform: translateY(-50%); font-size: 11px; color: var(--sc-muted); white-space: nowrap; }
.sc-col { position: relative; border-inline-start: 1px solid var(--sc-line-soft); background-image: linear-gradient(to bottom, var(--sc-line) 1px, transparent 1px); background-size: 100% ${HOUR_PX}px; }
.sc-col.today { background-color: #fafcff; }
.sc-col.closed { background-color: #f6f7f9; background-image: linear-gradient(to bottom, var(--sc-line) 1px, transparent 1px), repeating-linear-gradient(45deg, transparent 0 8px, rgba(148,163,184,.12) 8px 16px); }
.sc-ev { position: absolute; border: none; border-radius: 4px; padding: 3px 6px 3px 4px; text-align: start; overflow: hidden; cursor: pointer; font-size: 11px; line-height: 1.35; box-shadow: 0 0 0 1px rgba(255,255,255,.9); transition: filter .12s, box-shadow .12s; display: flex; flex-direction: column; gap: 1px; }
.sc-ev:hover { filter: brightness(.97); z-index: 5; box-shadow: 0 2px 8px rgba(22,45,61,.18); }
.sc-ev.sel { filter: brightness(.92); box-shadow: 0 0 0 2px var(--sc-blue); z-index: 6; }
.sc-ev-title { font-weight: 600; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px; }
.sc-ev-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .92; }
.sc-ev-warn { flex: 0 0 auto; width: 15px; height: 15px; border-radius: 50%; background: #fff; color: var(--sc-red); font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 0 1px #f3c1bd; }
.sc-now { position: absolute; inset-inline: 0; height: 0; border-top: 2px solid var(--sc-red); z-index: 8; pointer-events: none; }
.sc-now::before { content: ''; position: absolute; inset-inline-start: -5px; top: -6px; width: 10px; height: 10px; border-radius: 50%; background: var(--sc-red); }
.sc-now-pill { position: absolute; inset-inline-end: 4px; transform: translateY(-50%); background: var(--sc-red); color: #fff; font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 8px; z-index: 9; }

/* Month grid */
.sc-month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.sc-mdow { text-align: center; font-size: 12px; color: var(--sc-muted); padding: 8px 0; border-bottom: 1px solid var(--sc-line); }
.sc-mc { min-height: 112px; border-bottom: 1px solid var(--sc-line-soft); border-inline-start: 1px solid var(--sc-line-soft); padding: 4px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.sc-mc.out { background: #fafbfc; }
.sc-mc.out .sc-mc-num { color: #b3bcc6; }
.sc-mc.closed { background: #f6f7f9; }
.sc-mc-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.sc-mc-num { border: none; background: transparent; width: 26px; height: 26px; border-radius: 50%; font-size: 12px; cursor: pointer; color: var(--sc-text); }
.sc-mc-num:hover { background: #eef2f7; }
.sc-mc.today .sc-mc-num { background: var(--sc-blue); color: #fff; font-weight: 600; }
.sc-mchip { border: none; text-align: start; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; gap: 4px; align-items: center; }
.sc-mchip .t { font-weight: 600; }
.sc-more { border: none; background: transparent; color: var(--sc-blue); font-size: 11px; text-align: start; cursor: pointer; padding: 0 6px; }

/* Drawer */
.sc-drawer { position: fixed; top: 0; bottom: 0; inset-inline-end: 0; width: min(420px, 100vw); background: #fff; z-index: 2147483000; box-shadow: 0 0 40px rgba(22,45,61,.22); display: flex; flex-direction: column; animation: scSlide .18s ease-out; direction: rtl; }
.sc-drawer.sc-no-anim { animation: none; }
@keyframes scSlide { from { transform: translateX(-24px); opacity: 0; } to { transform: none; opacity: 1; } }
.sc-dr-head { display: flex; align-items: flex-start; gap: 10px; padding: 18px 18px 8px; }
.sc-dr-color { width: 14px; height: 14px; border-radius: 4px; margin-top: 4px; flex: 0 0 auto; }
.sc-dr-head h3 { margin: 0; font-size: 18px; font-weight: 600; flex: 1; line-height: 1.3; }
.sc-dr-when { padding: 0 18px 12px 18px; color: var(--sc-muted); font-size: 13px; padding-inline-start: 42px; }
.sc-dr-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 0 18px 14px; }
.sc-stat { background: #f6f8fb; border-radius: 10px; padding: 8px 10px; }
.sc-stat span { display: block; font-size: 11px; color: var(--sc-muted); }
.sc-stat b { font-size: 16px; font-weight: 600; }
.sc-stat.warn { background: #fff1f0; }
.sc-stat.warn b { color: var(--sc-red); }
.sc-stat.ok b { color: #15803d; }
.sc-tabs { display: flex; gap: 18px; padding: 0 18px; border-bottom: 1px solid var(--sc-line); }
.sc-tab { border: none; background: transparent; padding: 10px 0; font-size: 13px; cursor: pointer; color: var(--sc-muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.sc-tab.active { color: var(--sc-blue); border-bottom-color: var(--sc-blue); font-weight: 600; }
.sc-dr-body { flex: 1; overflow: auto; padding: 14px 18px 18px; display: flex; flex-direction: column; gap: 10px; }
.sc-dr-foot { border-top: 1px solid var(--sc-line); padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.sc-note { font-size: 12px; color: var(--sc-muted); background: #f6f8fb; border-radius: 8px; padding: 8px 10px; }
.sc-empty { color: var(--sc-muted); text-align: center; padding: 18px 0; font-size: 13px; }
.sc-av { width: 32px; height: 32px; border-radius: 50%; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; font-weight: 600; background: #94a3b8; }
.sc-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--sc-line-soft); }
.sc-row:last-child { border-bottom: none; }
.sc-row-main { flex: 1; min-width: 0; }
.sc-row-main b { font-weight: 600; font-size: 13px; }
.sc-row-sub { font-size: 12px; color: var(--sc-muted); margin-top: 1px; }
.sc-row-actions { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.sc-warn-note { font-size: 11px; color: #b45309; background: #fff7e6; border-radius: 6px; padding: 2px 6px; margin-top: 3px; display: inline-block; }
.sc-badge { font-size: 11px; border-radius: 10px; padding: 1px 8px; background: #eef1f5; color: var(--sc-muted); white-space: nowrap; }
.sc-badge.ok { background: #e6f6ec; color: #15803d; }
.sc-badge.warn { background: #fff4e0; color: #9a5b00; }
.sc-badge.mute { background: #f1f3f6; color: #8a95a1; }
.sc-inline { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 10px; background: #f6f8fb; border-radius: 8px; margin: 2px 0 6px; }
.sc-inline input[type="text"], .sc-field input[type="text"], .sc-field select, .sc-field textarea, .sc-inline select { height: 30px; border: 1px solid #c9d1da; border-radius: 6px; padding: 0 8px; font-size: 13px; font-family: inherit; background: #fff; }
.sc-inline input.epa-time-input, .sc-field input.epa-time-input { width: 74px; text-align: center; direction: ltr; }
.sc-field textarea { height: auto; min-height: 64px; padding: 6px 8px; width: 100%; resize: vertical; }
.sc-picker { border: 1px solid var(--sc-line); border-radius: 10px; overflow: hidden; }
.sc-picker-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: #f6f8fb; font-weight: 600; font-size: 13px; }
.sc-picker-list { max-height: 300px; overflow: auto; padding: 0 10px; }
.sc-row.disabled { opacity: .5; }
.sc-section { border: 1px solid var(--sc-line); border-radius: 10px; padding: 10px 12px; }
.sc-section h4 { margin: 0 0 8px; font-size: 13px; font-weight: 600; }
.sc-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.sc-field label { font-size: 11px; color: var(--sc-muted); }
.sc-banner { border-radius: 8px; padding: 8px 10px; font-size: 12px; }
.sc-banner.blk { background: #fde8e7; color: #b42318; }
.sc-banner.hol { background: #fff4e0; color: #9a5b00; }
.sc-banner.note { background: #e7f0ff; color: #1d4ed8; }
.sc-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--sc-text); cursor: pointer; }
.sc-ev-list-item { display: flex; align-items: center; gap: 8px; border: none; background: transparent; width: 100%; text-align: start; padding: 8px 6px; border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--sc-text); }
.sc-ev-list-item:hover { background: #f4f7fb; }
.sc-ev-list-item .time { color: var(--sc-muted); font-size: 12px; min-width: 84px; direction: ltr; text-align: end; }

/* Toast */
.sc-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 2147483001; background: #162d3d; color: #fff; padding: 10px 18px; border-radius: 22px; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.2); max-width: 90vw; }
.sc-toast.error { background: #b42318; }

@media (max-width: 900px) {
    .sc-side { display: none; }
}
@media (max-width: 640px) {
    .sc-toolbar { padding: 10px; gap: 8px; }
    .sc-title { font-size: 15px; width: 100%; order: -1; }
    .sc-mc { min-height: 78px; }
    .sc-mchip .n { display: none; }
}
`;
