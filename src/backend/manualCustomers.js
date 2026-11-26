/**
 * manualCustomers.js — CRM contact search for the manual add-customer picker.
 */
import { contacts } from 'wix-crm-backend';

const LIMIT = 5;

function firstOf(list, key) {
    const arr = Array.isArray(list) ? list : (Array.isArray(list?.items) ? list.items : []);
    const primary = arr.find((x) => x?.primary) || arr[0];
    return primary?.[key] || '';
}

function shapeContact(c) {
    const first = c?.info?.name?.first || '';
    const last = c?.info?.name?.last || '';
    const email = c?.primaryInfo?.email || firstOf(c?.info?.emails, 'email');
    const phone = c?.primaryInfo?.phone || firstOf(c?.info?.phones, 'phone');
    return {
        id: c?._id || '',
        name: `${first} ${last}`.trim() || email || phone || 'ללא שם',
        email,
        phone,
    };
}

export async function searchContacts(query) {
    const q = String(query || '').trim().slice(0, 60);
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const seen = new Map();
    const add = (res) => {
        for (const c of (res?.items || [])) {
            if (c?._id && !seen.has(c._id)) seen.set(c._id, shapeContact(c));
        }
    };

    if (!tokens.length) {
        let res = await contacts.queryContacts().descending('_createdDate').limit(LIMIT).find().catch(() => null);
        if (!res) res = await contacts.queryContacts().limit(LIMIT).find().catch(() => ({ items: [] }));
        add(res);
        return [...seen.values()].slice(0, LIMIT);
    }

    const tok = tokens[0];
    const digits = tok.replace(/\D/g, '');
    const runs = [
        contacts.queryContacts().startsWith('info.name.first', tok).limit(15).find(),
        contacts.queryContacts().startsWith('info.name.last', tok).limit(15).find(),
        contacts.queryContacts().startsWith('primaryInfo.email', tok).limit(15).find(),
    ];
    if (digits.length >= 3) {
        const local = digits.replace(/^0/, '');
        runs.push(contacts.queryContacts().startsWith('primaryInfo.phone', `+972${local}`).limit(15).find());
        runs.push(contacts.queryContacts().startsWith('primaryInfo.phone', digits).limit(15).find());
    }
    (await Promise.all(runs.map((r) => r.catch(() => null)))).forEach(add);

    const hay = (c) => `${c.name} ${c.email} ${c.phone}`.toLowerCase();
    return [...seen.values()]
        .filter((c) => tokens.every((t) => hay(c).includes(t)))
        .slice(0, LIMIT);
}
