/**
 * manualCustomers.js — CRM contact search (contacts V5) for the manual add-customer picker.
 */
import { contactsV5 } from '@wix/crm';
import { auth } from '@wix/essentials';

const LIMIT = 5;

function shapeContact(c) {
    const first = c?.name?.first || '';
    const last = c?.name?.last || '';
    const email = c?.email?.email || '';
    const phone = c?.phone?.phone || '';
    return {
        id: c?._id || '',
        name: `${first} ${last}`.trim() || email || phone || 'ללא שם',
        email,
        phone,
    };
}

export async function searchContacts(query) {
    const q = String(query || '').trim().slice(0, 60);
    const request = {
        cursorPaging: { limit: LIMIT },
        sort: [{ fieldName: '_createdDate', order: contactsV5.SortOrder.DESC }],
    };
    if (q) {
        request.search = {
            expression: q,
            fields: ['name.full', 'email.email', 'phone.phone'],
            mode: contactsV5.Mode.OR,
            fuzzy: true,
        };
    }
    const res = await auth.elevate(contactsV5.searchContacts)(request, { nameFormat: 'BY_FIRST_NAME' });
    return (res?.contacts || []).filter((c) => c?._id).map(shapeContact).slice(0, LIMIT);
}
