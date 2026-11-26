export const TRACKER_STYLE = `
.trk { display: flex; flex-direction: column; gap: 12px; }
.trk-stats { display: flex; gap: 10px; flex-wrap: wrap; }
.trk-stat { flex: 1 1 140px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 14px; }
.trk-stat b { display: block; font-size: 20px; font-weight: 700; color: #0f172a; }
.trk-stat span { font-size: 12px; color: #64748b; }
.trk-list { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
.trk-row { display: grid; grid-template-columns: minmax(130px, 1.2fr) minmax(120px, 2fr) auto auto 18px; align-items: center; gap: 14px; width: 100%; padding: 12px 16px; border: none; border-bottom: 1px solid #f1f5f9; background: #fff; cursor: pointer; text-align: start; font-family: inherit; color: #0f172a; }
.trk-row:hover { background: #f8fafc; }
.trk-row.open { background: #f5f9ff; }
.trk-name { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13.5px; min-width: 0; }
.trk-name small { display: block; font-weight: 400; font-size: 11px; color: #94a3b8; }
.trk-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
.trk-meter { height: 8px; background: #eef2f6; border-radius: 999px; overflow: hidden; }
.trk-fill { display: block; height: 100%; border-radius: 999px; background: #3b82f6; transition: width .25s; }
.trk-fill.done { background: #22c55e; }
.trk-fill.low { background: #f59e0b; }
.trk-num { font-size: 12.5px; font-variant-numeric: tabular-nums; white-space: nowrap; color: #334155; }
.trk-num b { font-size: 13.5px; }
.trk-wk { font-size: 11.5px; color: #94a3b8; white-space: nowrap; }
.trk-wk.miss { color: #b45309; }
.trk-chev { color: #94a3b8; font-size: 11px; }
.trk-panel { border-bottom: 1px solid #e5e7eb; background: #fbfcfe; padding: 12px 14px 14px; }
.trk-panel-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.trk-panel-head h4 { margin: 0; font-size: 14px; }
.trk-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: #64748b; margin-inline-start: auto; }
.trk-legend span { display: inline-flex; align-items: center; gap: 4px; }
.trk-legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.trk-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.trk-dow { font-size: 11px; color: #94a3b8; text-align: center; padding: 2px 0; }
.trk-day { background: #fff; border: 1px solid #e8ecf1; border-radius: 9px; padding: 5px; min-height: 92px; display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 11px; }
.trk-day.blank { visibility: hidden; }
.trk-day.past { background: #fafbfc; }
.trk-day.today { border-color: #3b82f6; }
.trk-day.has-sub { box-shadow: inset 0 3px 0 #3b82f6; }
.trk-day.has-sub.sch { box-shadow: inset 0 3px 0 #22c55e; }
.trk-day.vac { background: #faf5ff; }
.trk-day.closed { background: #f3f4f6; }
.trk-dh { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.trk-dh .n { font-weight: 700; font-size: 12px; color: #334155; }
.trk-dh .w { display: none; color: #94a3b8; font-size: 11px; }
.trk-tag { font-size: 9.5px; padding: 0 5px; border-radius: 6px; line-height: 15px; background: #f1f5f9; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.trk-tag.vac { background: #ede9fe; color: #6d28d9; }
.trk-tag.vac.pend { background: #fff; border: 1px dashed #a78bfa; }
.trk-tag.short { background: #fef3c7; color: #92400e; }
.trk-sub { font-size: 10.5px; border-radius: 6px; padding: 1px 5px; background: #eff6ff; color: #1d4ed8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: ltr; text-align: right; }
.trk-sub.sch { background: #dcfce7; color: #166534; }
.trk-sub.stby { background: #f1f5f9; color: #475569; }
.trk-sub.rej { background: #f8fafc; color: #94a3b8; text-decoration: line-through; }
.trk-ws { display: flex; flex-direction: column; gap: 0; border: 1px solid #e5e7eb; border-top: 3px solid var(--c, #94a3b8); border-radius: 6px; padding: 2px 4px; background: #fff; cursor: pointer; min-width: 0; }
.trk-ws.empty { background: #f8fafc; color: #64748b; border-top-color: #cbd5e1; }
.trk-ws.sel { background: #eff6ff; border-color: #93c5fd; box-shadow: 0 0 0 1px #3b82f6; }
.trk-ws.mine { border-color: #86efac; background: #f0fdf4; cursor: default; }
.trk-ws.off { cursor: default; opacity: .7; }
.trk-ws-top { display: flex; align-items: center; gap: 3px; min-width: 0; }
.trk-ws-top input { margin: 0; width: 12px; height: 12px; flex: 0 0 auto; }
.trk-ws-top .nm { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.trk-ws-top .pp { white-space: nowrap; color: #475569; }
.trk-ws-staff { font-size: 10px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trk-ws-staff.none { color: #b45309; }
.trk-ok { color: #16a34a; font-weight: 700; }
.trk-bar { position: sticky; bottom: 8px; z-index: 5; margin-top: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: #0f172a; color: #fff; border-radius: 12px; padding: 10px 14px; box-shadow: 0 10px 24px rgba(15,23,42,.22); font-size: 12.5px; }
.trk-bar[hidden] { display: none; }
.trk-bar .sp { flex: 1; }
.trk-bar label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.trk-bar .epa-btn { border-color: transparent; }
.trk-bar ul { margin: 4px 0 0; padding-inline-start: 18px; font-size: 11.5px; color: #cbd5e1; flex-basis: 100%; }
.trk-more { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
.trk-more-body { padding: 0 12px 12px; }
@media (max-width: 760px) {
    .trk-row { grid-template-columns: 1fr auto 18px; gap: 8px 10px; padding: 10px 12px; }
    .trk-row .trk-meter { grid-column: 1 / -1; grid-row: 2; }
    .trk-row .trk-wk { display: none; }
    .trk-cal { grid-template-columns: 1fr; }
    .trk-dow, .trk-day.blank, .trk-day.idle { display: none; }
    .trk-day { min-height: 0; }
    .trk-dh .w { display: inline; }
}
`;
