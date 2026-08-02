/**
 * Employee Portal messaging (Module A/B) — personal + system-wide messages.
 *
 * Collection: EmployeeMessages (create manually in the Wix CMS):
 *   title (Text), body (Text), scope (Text: 'ALL' | 'EMPLOYEE'),
 *   employeeId (Text — Dashboard_Roles _id, set only when scope='EMPLOYEE'),
 *   expiresAt (Date & Time, optional), createdBy (Text — Dashboard_Roles _id).
 *
 * Access model: any employee (`submitAvailability`) may read their own
 * messages; management (create/edit/delete/list-all) requires the
 * `manageEmployees` permission on Dashboard_Roles.
 */
import wixData from 'wix-data';
import { Permissions, webMethod } from 'wix-web-module';
import { assertEmployeeAccess } from 'backend/staffRoles.js';

const SA = { suppressAuth: true };
const COLLECTION = 'EmployeeMessages';

function mapMessage(item, now) {
    const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
    return {
        id: item._id,
        title: item.title || '',
        body: item.body || '',
        scope: item.scope === 'EMPLOYEE' ? 'EMPLOYEE' : 'ALL',
        employeeId: item.employeeId || null,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        expired: !!(expiresAt && expiresAt.getTime() < now.getTime()),
        createdAt: item._createdDate ? new Date(item._createdDate).toISOString() : null,
    };
}

/** Personal + system messages relevant to the logged-in employee, not expired. */
export const getMyMessages = webMethod(Permissions.Anyone, async () => {
    const { role } = await assertEmployeeAccess('submitAvailability');
    const now = new Date();

    const systemQuery = wixData.query(COLLECTION).eq('scope', 'ALL');
    const personalQuery = wixData.query(COLLECTION).eq('scope', 'EMPLOYEE').eq('employeeId', role._id);
    const result = await systemQuery.or(personalQuery)
        .descending('_createdDate')
        .limit(200)
        .find(SA)
        .catch(() => ({ items: [] }));

    const items = (result.items || []).map(m => mapMessage(m, now)).filter(m => !m.expired);
    return {
        personal: items.filter(m => m.scope === 'EMPLOYEE'),
        system: items.filter(m => m.scope === 'ALL'),
    };
});

/** All messages (incl. expired) for the admin management screen. */
export const listAllMessages = webMethod(Permissions.SiteMember, async () => {
    await assertEmployeeAccess('manageEmployees');
    const now = new Date();
    const result = await wixData.query(COLLECTION)
        .descending('_createdDate')
        .limit(500)
        .find(SA)
        .catch(() => ({ items: [] }));

    const mapped = (result.items || []).map(m => mapMessage(m, now));
    const employeeIds = [...new Set(mapped.filter(m => m.scope === 'EMPLOYEE' && m.employeeId).map(m => m.employeeId))];
    let namesById = {};
    if (employeeIds.length) {
        const rolesResult = await wixData.query('Dashboard_Roles')
            .hasSome('_id', employeeIds)
            .limit(1000)
            .find(SA)
            .catch(() => ({ items: [] }));
        for (const r of (rolesResult.items || [])) namesById[r._id] = r.displayName || '(ללא שם)';
    }
    return mapped.map(m => ({ ...m, employeeName: m.employeeId ? (namesById[m.employeeId] || '—') : null }));
});

/** Creates or updates a message (system-wide or targeted at one employee). */
export const saveMessage = webMethod(Permissions.SiteMember, async (payload) => {
    const { role } = await assertEmployeeAccess('manageEmployees');

    const title = String(payload?.title || '').trim().slice(0, 150);
    const body = String(payload?.body || '').trim().slice(0, 2000);
    if (!title || !body) {
        throw new Error('BAD_REQUEST: יש להזין כותרת ותוכן להודעה.');
    }

    const scope = payload?.scope === 'EMPLOYEE' ? 'EMPLOYEE' : 'ALL';
    const employeeId = scope === 'EMPLOYEE' ? String(payload?.employeeId || '').trim() : null;
    if (scope === 'EMPLOYEE' && !employeeId) {
        throw new Error('BAD_REQUEST: יש לבחור עובד/ת להודעה אישית.');
    }

    let expiresAt = null;
    if (payload?.expiresAt) {
        const d = new Date(payload.expiresAt);
        if (Number.isNaN(d.getTime())) {
            throw new Error('BAD_REQUEST: תאריך תפוגה לא תקין.');
        }
        expiresAt = d;
    }

    const data = { title, body, scope, employeeId, expiresAt };
    let saved;
    if (payload?.id) {
        const existing = await wixData.get(COLLECTION, payload.id, SA).catch(() => null);
        if (!existing) throw new Error('NOT_FOUND: ההודעה לא נמצאה.');
        saved = await wixData.update(COLLECTION, { ...existing, ...data }, SA);
    } else {
        saved = await wixData.insert(COLLECTION, { ...data, createdBy: role._id }, SA);
    }

    console.log(`[messagingService] saveMessage: id=${saved._id} scope=${scope} by=${role._id}`);
    return { ok: true, message: mapMessage(saved, new Date()) };
});

/** Deletes a message. */
export const deleteMessage = webMethod(Permissions.SiteMember, async (messageId) => {
    const { role } = await assertEmployeeAccess('manageEmployees');
    if (!messageId) throw new Error('BAD_REQUEST: חסר מזהה הודעה.');

    await wixData.remove(COLLECTION, messageId, SA);
    console.log(`[messagingService] deleteMessage: id=${messageId} by=${role._id}`);
    return { ok: true };
});
