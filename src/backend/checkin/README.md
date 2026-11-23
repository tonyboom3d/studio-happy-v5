# Self Check-in — manual CMS setup

This feature needs a few Wix CMS (Content Manager) collections/fields created **manually** in the
Wix Editor before the code works. Create them with permissions = **Admin** (read/write), since all
backend access uses `suppressAuth: true`.

## New collection: `CheckinSessions`
One row per device/QR scan (the "anti-sharing" device token).

| Field | Type | Notes |
|---|---|---|
| `deviceTokenHash` | Text | SHA-256 hex of the device token. Indexed/unique recommended. |
| `status` | Text | `new` \| `otp_sent` \| `checked_in` |
| `phone` | Text | normalized E.164, set once OTP is requested |
| `orderId` | Text | `WorkshopOrders._id`, set once OTP is requested |
| `otpHash` | Text | SHA-256 of the current OTP code (never store the raw code) |
| `otpExpiresAt` | Date and Time | |
| `otpAttempts` | Number | verify attempts, resets on resend |
| `otpSendCount` | Number | sends for this session, caps resend abuse |
| `lastOtpAt` | Date and Time | resend cooldown |
| `checkedInAt` | Date and Time | set on success |
| `expiresAt` | Date and Time | end of the matched workshop's day (Israel time); session is invalid after this |

## New collection: `CheckinSettings`
Single row, `_id` (or any key) = `default`.

| Field | Type | Notes |
|---|---|---|
| `enabled` | Boolean | feature flag — master on/off switch |
| `testPhones` | Text (or Tags/Array) | comma-separated local phones (`05XXXXXXXX`) allowed even when `enabled=false` |
| `windowBeforeMin` | Number | minutes before workshop start the flow opens (default 60 if unset) |

Set `enabled = false` and add your own test phone before going live.

## `WorkshopOrders` — add fields
| Field | Type |
|---|---|
| `checkedInAt` | Date and Time |
| `checkedInPhone` | Text |
| `checkinSessionId` | Text |
| `checkinReminderSentAt` | Date and Time |

## `Dashboard_Roles` — add field
| Field | Type |
|---|---|
| `photo` | Image |

## `PrintQueue` — add fields
| Field | Type | Notes |
|---|---|---|
| `kind` | Text | `addon` (default, existing rows) \| `checkin_customer` \| `checkin_staff` |
| `workshopOrderId` | Text | set only for `checkin_*` rows (existing `addOnOrderId` stays null for these) |

## ManyChat
Create a WhatsApp Utility template + ManyChat flow for the check-in reminder, then paste its flow
namespace into `CHECKIN_REMINDER_FLOW_NS` in `wix/src/backend/manychatService.jsw`.

## mqtt-bridge Worker
`mqtt-bridge/src/raster.js` and `mqtt-bridge/src/index.js` were extended with optional `title` /
`infoLines` / `noteLines` / `hideTotal` receipt fields (backwards compatible — add-on receipts are
unaffected). Deploy with `wrangler deploy` from `mqtt-bridge/` after review.

## `/checkin` page
Create a new Wix page at path `/checkin` (hidden from the site menu/sitemap), add the
`self-checkin` Custom Element (`wix/src/public/custom-elements/self-checkin.js`) to it with element
id `#selfCheckin`, then copy the contents of
`wix/src/pages/_checkin-page-controller.reference.js` into that page's real (Editor-generated) code
file and delete the reference file. Print the studio's check-in QR code pointing at
`https://www.studiohappy.art/checkin`.
