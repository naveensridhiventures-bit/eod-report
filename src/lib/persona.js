// ─────────────────────────────────────────────────────────────
//  PERSONA AVATARS
//  A friendly illustrated character for every customer/candidate,
//  drawn from their name + number (the same person always gets the
//  same face). Pure SVG — works in the app, in images and in PDFs.
// ─────────────────────────────────────────────────────────────
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (arr, n) => arr[n % arr.length];

const BGS = [['#FFE7C2', '#FFC98A'], ['#D9F2E6', '#A8E0C5'], ['#E3EDFB', '#B5CDF3'], ['#F4E6FB', '#D8B9EE'], ['#FFE0DC', '#FBB7AE'], ['#FFF3C4', '#F7D96B'], ['#DDF3F7', '#A5DCE6']];
const SKIN = ['#8D5524', '#A0662F', '#B8794A', '#C68642', '#D69A63', '#E0AC69', '#7A4A2A'];
const HAIR = ['#1B1B1B', '#2B1A12', '#3B2416', '#1F1A17', '#4A2E1F'];
const SHIRT = ['#0E3B3A', '#2E9E6A', '#3D7DD8', '#E0782F', '#8A5CD1', '#C23B33', '#F4A93B', '#1F6F8B'];

/** SVG markup for a person. style 0-5 changes the hair; accessories vary with the seed. */
export function personaSvg(seedText, size = 64) {
  const h = hash(String(seedText || '?'));
  const [bg1, bg2] = pick(BGS, h);
  const skin = pick(SKIN, h >>> 3);
  const hair = pick(HAIR, h >>> 6);
  const shirt = pick(SHIRT, h >>> 9);
  const style = (h >>> 12) % 6;
  const glasses = (h >>> 15) % 5 === 0;
  const mustache = (style === 0 || style === 1 || style === 5) && (h >>> 17) % 3 === 0;
  const smile = (h >>> 19) % 3;
  const long = style === 3 || style === 4;
  const id = `g${h.toString(36)}`;

  const hairBack = long
    ? style === 3
      ? `<circle cx="32" cy="15" r="7" fill="${hair}"/><path d="M17 30c0-11 7-18 15-18s15 7 15 18v6H17z" fill="${hair}"/>`
      : `<path d="M15 32c0-12 7-20 17-20s17 8 17 20v16c-3 2-6 2-8 0V34H23v14c-2 2-5 2-8 0z" fill="${hair}"/>`
    : '';
  const hairFront = [
    `<path d="M20 26c0-8 5-13 12-13s12 5 12 13c-3-4-7-5-12-5s-9 1-12 5z" fill="${hair}"/>`,
    `<path d="M20 27c0-9 5-14 12-14 6 0 12 4 12 12-5-1-9-4-11-7-2 4-7 7-13 9z" fill="${hair}"/>`,
    `<path d="M19 27c-1-6 2-12 7-13 1-2 4-3 6-2 2-1 5 0 6 2 5 1 8 7 7 13-2-3-4-4-6-4-1-2-4-2-6-1-2-1-5-1-6 1-4 0-6 1-8 4z" fill="${hair}"/>`,
    `<path d="M20 28c0-9 5-14 12-14s12 5 12 14c-2-5-6-8-12-8s-10 3-12 8z" fill="${hair}"/>`,
    `<path d="M20 29c0-10 5-15 12-15s12 5 12 15c-3-6-7-8-12-8-2 3-6 5-12 8z" fill="${hair}"/>`,
    `<path d="M21 24c1-6 5-10 11-10s10 4 11 10c-3-2-7-3-11-3s-8 1-11 3z" fill="${hair}"/>`
  ][style];
  const mouth = [
    '<path d="M27 38c2 3 8 3 10 0" stroke="#5A2A1A" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    '<path d="M27 37c2 4 8 4 10 0z" fill="#fff" stroke="#5A2A1A" stroke-width="1.4" stroke-linejoin="round"/>',
    '<path d="M28 38c1.5 1.8 6.5 1.8 8 0" stroke="#5A2A1A" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
  ][smile];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
<clipPath id="${id}c"><circle cx="32" cy="32" r="32"/></clipPath></defs>
<g clip-path="url(#${id}c)">
<rect width="64" height="64" fill="url(#${id})"/>
${hairBack}
<path d="M10 64c1-11 10-17 22-17s21 6 22 17z" fill="${shirt}"/>
<path d="M27 47l5 6 5-6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linejoin="round"/>
<rect x="28" y="40" width="8" height="8" rx="3" fill="${skin}"/>
<ellipse cx="32" cy="30" rx="12" ry="13.5" fill="${skin}"/>
<ellipse cx="20" cy="31" rx="2.2" ry="3" fill="${skin}"/><ellipse cx="44" cy="31" rx="2.2" ry="3" fill="${skin}"/>
${long && (h >>> 21) % 2 ? `<circle cx="20" cy="35" r="1.4" fill="#F4A93B"/><circle cx="44" cy="35" r="1.4" fill="#F4A93B"/>` : ''}
${hairFront}
<path d="M24.5 26.5q3-1.6 5.5 0M34 26.5q3-1.6 5.5 0" stroke="${hair}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<ellipse cx="27" cy="30.5" rx="1.7" ry="2" fill="#2A1A12"/><ellipse cx="37" cy="30.5" rx="1.7" ry="2" fill="#2A1A12"/>
<circle cx="27.6" cy="29.9" r=".55" fill="#fff"/><circle cx="37.6" cy="29.9" r=".55" fill="#fff"/>
${glasses ? '<g fill="none" stroke="#1B1B1B" stroke-width="1.3"><circle cx="27" cy="30.5" r="4"/><circle cx="37" cy="30.5" r="4"/><path d="M31 30.5h2"/></g>' : ''}
<ellipse cx="23.5" cy="35" rx="2.2" ry="1.3" fill="#E8826B" opacity=".35"/><ellipse cx="40.5" cy="35" rx="2.2" ry="1.3" fill="#E8826B" opacity=".35"/>
<path d="M32 31.5v3.2l-1.3.6" stroke="#6B3A22" stroke-opacity=".45" stroke-width="1.2" fill="none" stroke-linecap="round"/>
${mustache ? `<path d="M27.5 36.2c2-1.6 3.4-1 4.5 0 1.1-1 2.5-1.6 4.5 0-1.6.7-3 .9-4.5.2-1.5.7-2.9.5-4.5-.2z" fill="${hair}"/>` : ''}
${mouth}
</g></svg>`;
}

export const personaUri = (seedText) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(personaSvg(seedText, 128))}`;
