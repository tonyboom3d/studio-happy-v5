import wixData from 'wix-data';
import { webMethod, Permissions } from "wix-web-module";

// פונקציה לשליפת פריטי התפריט מה-CMS
export const getMenuItems = webMethod(Permissions.Anyone, async () => {
    try {
        const results = await wixData.query("MenuItems")
            .ascending("order") // סידור לפי המספר שהגדרת
            .find({ omitTotalCount: true });

        // המרת המידע מה-CMS למבנה שה-React שלך מצפה לקבל
        const menuItems = results.items.map(item => ({
            label: item.title,
            href: item.link,
            highlight: item.highlight || false,
            hasDropdown: item.hasDropdown || false,
            dropdownType: item.dropdownType || undefined
        }));

        return menuItems;
    } catch (error) {
        console.error("Error fetching menu items:", error);
        return []; // החזרת מערך ריק במקרה של שגיאה כדי לא לשבור את האתר
    }
});

import { customEmbeds } from "@wix/embeds";
import { auth } from "@wix/essentials";

const EMBED_NAME = "Studio Happy – Preloader";

const createEmbedElevated = auth.elevate(customEmbeds.createCustomEmbed);
const listEmbedsElevated  = auth.elevate(customEmbeds.listCustomEmbeds);

function buildPreloaderEmbedHtml() {
  const css = [
    "@import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;600&display=swap');",
    "@keyframes sh-rise-in{from{opacity:0;transform:translateY(48px)}to{opacity:1;transform:translateY(0)}}",
    "@keyframes sh-slide-up{from{transform:translateY(0)}to{transform:translateY(-100%)}}",
    "#sh-preloader{position:fixed;inset:0;z-index:999999;background:#E4C1F9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:24px;font-family:'Assistant',system-ui,sans-serif;will-change:transform}",
    "#sh-preloader.sh-exit{animation:sh-slide-up .72s cubic-bezier(.76,0,.24,1) forwards}",
    "#sh-preloader__content{display:flex;flex-direction:column;align-items:center;gap:28px;opacity:0}",
    "#sh-preloader__content.sh-visible{animation:sh-rise-in .6s ease forwards}",
    "#sh-preloader__logo{width:180px;height:auto;display:block}",
    "#sh-preloader__bar-wrap{width:240px;display:flex;flex-direction:column;align-items:center;gap:10px}",
    "#sh-preloader__track{width:100%;height:5px;border-radius:9999px;background:rgba(255,255,255,.35);overflow:hidden}",
    "#sh-preloader__fill{height:100%;width:0%;border-radius:9999px;background:#fff;transition:width .35s ease}",
    "#sh-preloader__pct{font-size:13px;font-weight:600;color:rgba(255,255,255,.9);letter-spacing:.04em}",
    "#sh-preloader__label{font-size:16px;font-weight:400;color:#fff;direction:rtl;text-align:center;margin:0}",
  ].join("");

  // בדיקת דף בית ו-session + הפעלה עצמאית — ללא תלות ב-masterPage.js
  const js = [
    "(function(){",
      "console.log('[SH-Preloader] script running, pathname='+location.pathname);",
      // בדיקת session — לא להציג שוב באותו סשן
      "if(sessionStorage.getItem('sh_pl_shown')){console.log('[SH-Preloader] already shown this session, skip');return;}",
      // בדיקת דף בית לפי URL
      "var p=location.pathname.replace(/\\/+$/,'');",
      "console.log('[SH-Preloader] normalised path='+p);",
      "var isHome=(p===''||p==='/studio-happy'||p.endsWith('/home'));",
      "console.log('[SH-Preloader] isHome='+isHome);",
      "if(!isHome){console.log('[SH-Preloader] not home page, skip');return;}",
      "sessionStorage.setItem('sh_pl_shown','1');",
      "console.log('[SH-Preloader] starting preloader');",

    "function buildDOM(){",
      "var el=document.createElement('div');",
      "el.id='sh-preloader';",
      "el.setAttribute('aria-live','polite');",
      "el.setAttribute('role','status');",
      "el.innerHTML='<div id=\"sh-preloader__content\">",
        "<img id=\"sh-preloader__logo\" src=\"https://static.wixstatic.com/media/6b73e9_c72e8dc610254f22a491186407b51dc9~mv2.png\" alt=\"Studio Happy\"/>",
        "<div id=\"sh-preloader__bar-wrap\">",
          "<div id=\"sh-preloader__track\"><div id=\"sh-preloader__fill\"></div></div>",
          "<span id=\"sh-preloader__pct\">0%</span>",
        "</div>",
        "<p id=\"sh-preloader__label\">\u05d9\u05d5\u05e6\u05e8\u05d9\u05dd \u05dc\u05da \u05e9\u05de\u05d7 \u05e2\u05d5\u05d3 \u05e8\u05d2\u05e2...</p>",
      "</div>';",
      "document.body.appendChild(el);",
      "return el;",
    "}",
    "function runProgress(onDone){",
      "var fill=document.getElementById('sh-preloader__fill');",
      "var pct=document.getElementById('sh-preloader__pct');",
      "var steps=[{to:12,at:120},{to:28,at:380},{to:41,at:700},{to:55,at:1050},{to:62,at:1520},{to:68,at:2000},{to:74,at:2350},{to:83,at:2700},{to:91,at:3050},{to:96,at:3380},{to:100,at:3700}];",
      "steps.forEach(function(s){setTimeout(function(){fill.style.width=s.to+'%';pct.textContent=s.to+'%';},s.at);});",
      "setTimeout(onDone,4000);",
    "}",
    "function dismiss(el){",
      "el.classList.add('sh-exit');",
      "el.addEventListener('animationend',function(){",
        "el.remove();",
        "var st=document.getElementById('sh-preloader-styles');if(st)st.remove();",
      "},{once:true});",
    "}",
    // הפעלה ישירה — לא מחכה ל-masterPage
    "console.log('[SH-Preloader] buildDOM...');",
    "var el=buildDOM();",
    "console.log('[SH-Preloader] DOM built, el='+el.id);",
    "requestAnimationFrame(function(){requestAnimationFrame(function(){",
      "var c=document.getElementById('sh-preloader__content');",
      "console.log('[SH-Preloader] content el='+c);",
      "if(c)c.classList.add('sh-visible');",
    "});});",
    "runProgress(function(){dismiss(el);});",
    "}());",
  ].join("");

  return (
    "<style id=\"sh-preloader-styles\">" + css + "<\/style>" +
    "<script>" + js + "<\/script>"
  );
}

/**
 * יוצר Custom Embed ב-Wix עם כל קוד ה-preloader מוטמע (inline) ב־BODY_END.
 * הרץ פעם אחת מדף Velo כשאתה מחובר כבעל האתר.
 */
export const installPreloaderEmbed = webMethod(Permissions.Admin, async () => {
  const listRes  = await listEmbedsElevated();
  const existing = (listRes.customEmbeds || []).some((e) => e.name === EMBED_NAME);

  if (existing) {
    return {
      ok: true,
      skipped: true,
      message: "Custom embed כבר קיים – לא נוצר כפול.",
    };
  }

  const created = await createEmbedElevated({
    name: EMBED_NAME,
    position: "BODY_END",
    enabled: true,
    loadOnce: true,
    embedData: {
      category: "ESSENTIAL",
      html: buildPreloaderEmbedHtml(),
    },
  });

  return {
    ok: true,
    id: created._id,
    message: "Custom embed נוצר. ה-preloader מוטמע inline בקוד האתר.",
  };
});
