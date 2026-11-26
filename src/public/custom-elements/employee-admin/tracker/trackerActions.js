import { trkState, renderAssignBar } from './trackerView.js';

/** Repaints only the selection bar (checkbox state is already live in the DOM). */
function paintBar(ce) {
    const bar = ce.querySelector('#trkBar');
    if (!bar) { ce.render(); return; }
    bar.outerHTML = renderAssignBar(ce, ce._adminData);
}

export function handleTrackerClick(ce, action, target) {
    if (!action.startsWith('admin-trk-')) return false;
    const st = trkState(ce);
    const d = ce._adminData;
    switch (action) {
        case 'admin-trk-emp': {
            const id = target.dataset.emp;
            if (st.empId !== id) { st.sel.clear(); st.confirm = false; }
            st.empId = st.empId === id ? null : id;
            ce.render();
            return true;
        }
        case 'admin-trk-table':
            st.tableOpen = !st.tableOpen;
            ce.render();
            return true;
        case 'admin-trk-clear':
            st.sel.clear();
            st.confirm = false;
            ce.querySelectorAll('[data-action="admin-trk-ws"]').forEach(el => {
                el.checked = false;
                el.closest('.trk-ws')?.classList.remove('sel');
            });
            paintBar(ce);
            return true;
        case 'admin-trk-assign':
            st.confirm = true;
            paintBar(ce);
            return true;
        case 'admin-trk-assign-cancel':
            st.confirm = false;
            paintBar(ce);
            return true;
        case 'admin-trk-assign-confirm': {
            if (!d?.permissions?.manageScheduling || !st.empId || !st.sel.size) return true;
            const byDate = {};
            for (const k of st.sel) {
                const [dateKey, typeId] = k.split('|');
                (byDate[dateKey] = byDate[dateKey] || []).push(typeId);
            }
            const items = Object.entries(byDate).sort().map(([dateKey, workshopTypeIds]) => ({ dateKey, workshopTypeIds }));
            st.sel.clear();
            st.confirm = false;
            ce._startBusy('מצרף לסדנאות…');
            ce._dispatch('adminAssignBatch', { employeeId: st.empId, items, notify: st.notify });
            return true;
        }
        case 'admin-trk-ws':
        case 'admin-trk-notify':
            return true; // handled on change
        default:
            return false;
    }
}

export function handleTrackerChange(ce, input) {
    const action = input?.dataset?.action;
    if (!action?.startsWith('admin-trk-')) return false;
    const st = trkState(ce);
    if (action === 'admin-trk-ws') {
        const key = input.dataset.key;
        if (input.checked) st.sel.add(key); else st.sel.delete(key);
        input.closest('.trk-ws')?.classList.toggle('sel', input.checked);
        st.confirm = false;
        paintBar(ce);
        return true;
    }
    if (action === 'admin-trk-notify') {
        st.notify = !!input.checked;
        return true;
    }
    return false;
}
