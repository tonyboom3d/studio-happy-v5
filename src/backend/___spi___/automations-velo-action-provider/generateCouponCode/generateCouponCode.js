import { coupons } from "wix-marketing.v2";

/**
 * Autocomplete function declaration, do not delete
 * @param {import('./__schema__.js').Payload} options
 */
export const invoke = async ({ payload }) => {
    console.log("invoke: Automation triggered with payload:", payload);

    try {
        const coupon = await createCoupon(payload);
        console.log("invoke: Successfully generated coupon:", coupon._id);

        // מחזירים אובייקט ריק כדי לעבור את הולידציה של האוטומציות
        return { couponCode: coupon };
    } catch (error) {
        console.error("invoke: Failed to generate coupon. Error details:", error);
        throw error;
    }
};

function generateRandomCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

async function createCoupon(payload) {
    const numberOfParticipants = parseInt(payload?.number_of_participants, 10) || 2;
    console.log(`createCoupon: Usage limit set to ${numberOfParticipants}`);

    const randomCouponCode = generateRandomCode();

    const now = new Date();
    const expirationDate = new Date();
    expirationDate.setMonth(now.getMonth() + 6);

    let specification = {
        name: randomCouponCode,
        code: randomCouponCode,
        // שימוש ב-getTime() לקבלת המספר הענק, והמרתו ל-String כדי לרצות את ה-API והקומפיילר
        startTime: now.getTime().toString(),
        expirationTime: expirationDate.getTime().toString(),
        usageLimit: numberOfParticipants,
        limitedToOneItem: false,
        limitPerCustomer: 1,
        active: true,
        scope: {
            namespace: "bookings",
        },
        percentOffRate: 100
    };

    return await coupons.createCoupon(specification);
}