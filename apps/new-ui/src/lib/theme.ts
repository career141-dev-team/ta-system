// Light or dark, chosen in the person's menu and kept in this browser.
// ponytail: localStorage; with sign-in it can follow the person instead.
const KEY = "ta-ui:theme";
export type Theme = "light" | "dark";
export const getTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {}
}
/** Run before the page paints (layout <head>), so a dark page never flashes white. */
export const THEME_BOOT = `try{if(localStorage.getItem("${KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;
