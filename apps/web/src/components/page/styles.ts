import { facesFor, type Language } from '../../lib/site';

/** The type and fields of the `17 Website` pages, as inline styles. */
export function pageStyles(lang: Language) {
  const f = facesFor(lang);
  return {
    /** The display face, for sizes the shared styles don't cover. */
    serif: f.serif,
    handFace: f.hand,
    title: `margin:14px 0 0;font:400 40px/1.08 ${f.serif}`,
    heading: `margin:10px 0 0;font:400 22px/1.15 ${f.serif}`,
    body: 'margin:0;font:15.5px/1.6 -apple-system,system-ui;color:#4a3f37;text-wrap:pretty',
    small: 'font:13px/1.5 -apple-system,system-ui;color:#6b5f55',
    hand: `font:700 19px/1 ${f.hand};color:#5E7F4A`,
    label: 'font:600 13px/1 -apple-system,system-ui;color:#6b5f55',
    field:
      'box-sizing:content-box;width:calc(100% - 30px);height:50px;border-radius:14px;background:#fffaf2;border:1px solid rgba(42,34,29,.14);padding:0 14px;font:15.5px/1 -apple-system,system-ui;color:#2a221d;outline:none',
    button:
      'height:52px;border-radius:26px;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font:600 15.5px/1 -apple-system,system-ui;text-decoration:none;padding:0 22px',
  };
}
