import { getMenuItems } from 'backend/menuService.web.js';
import { session } from 'wix-storage-frontend';
import { cart } from 'wix-stores-frontend';
import wixEcomFrontend from 'wix-ecom-frontend';
import wixLocation from 'wix-location';

const CUSTOM_MENU_ID = '#customElement1';

$w.onReady(async function () {
    if (!wixLocation.url.includes('new')) return;

    const customMenu = $w(CUSTOM_MENU_ID); // ודא שזה ה-ID של ה-Custom Element של התפריט במסך

    if (!customMenu || typeof customMenu.setAttribute !== 'function') {
        console.warn(`${CUSTOM_MENU_ID} is not a Custom Element. Menu data and cart sync were skipped.`);
        return;
    }

    const openCart = () => {
        try {
            wixEcomFrontend.openSideCart();
        } catch (e) {
            console.error('openSideCart:', e);
        }
    };

    if (typeof customMenu.on === 'function') {
        customMenu.on('open-cart', openCart);
    } else {
        console.warn(`${CUSTOM_MENU_ID} does not support custom events. Check that this ID belongs to the header menu Custom Element.`);
    }

    // 1. טיפול במידע של התפריט (CMS + Session)
    let cachedMenu = session.getItem('menuItemsData');
    
    if (cachedMenu) {
        customMenu.setAttribute('menu-data', cachedMenu);
    } else {
        const freshMenuData = await getMenuItems();
        const stringifiedData = JSON.stringify(freshMenuData);
        session.setItem('menuItemsData', stringifiedData);
        customMenu.setAttribute('menu-data', stringifiedData);
    }

    // 2. טיפול בעגלת הקניות בזמן אמת
    try {
        const currentCart = await cart.getCurrentCart();
        const initialCount = currentCart.totals.quantity || 0;
        customMenu.setAttribute('cart-count', initialCount.toString());
        
        cart.onChange((changedCart) => {
            const newCount = changedCart.totals.quantity || 0;
            customMenu.setAttribute('cart-count', newCount.toString());
        });
    } catch (err) {
        console.error("Cart error:", err);
        customMenu.setAttribute('cart-count', '0');
    }
});
