// ─────────────────────────────────────────────────────────────
//  Offline Thanglish → English (demo mode, and when no AI key is set).
//  With AI English turned on (Settings), the server writes proper
//  sentences instead. The same logic runs on the server as polishBasic_.
// ─────────────────────────────────────────────────────────────
import { PHRASES, WORDS, TYPOS, GRAMMAR, QUESTION_START, REPORTED, PROPER } from './thanglish-data';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Longest phrases first so "call back pannunga" wins over "call pannunga"
const PHRASE_RES = PHRASES
  .flatMap(([alts, en]) => alts.map((a) => [a, en]))
  .sort((a, b) => b[0].length - a[0].length)
  .map(([a, en]) => [new RegExp(`\\b${esc(a).replace(/ /g, '\\s+')}\\b`, 'gi'), en]);
const GRAMMAR_RES = GRAMMAR.map(([re, to]) => [new RegExp(re, 'gi'), to]);
const PARTICLES = /\s+\b(ah|ha|nu|um|dhan|than|ku|kku|la|da|di|pa|ma|ji|nga)\b(?=[\s,.!?]|$)/gi;
const QUESTION = new RegExp(QUESTION_START, 'i');
const REPORTED_RES = REPORTED.map(([re, to]) => [new RegExp(re, 'gi'), to]);
const PROPER_RE = new RegExp(`\\b(${PROPER.join('|')})\\b`, 'gi');

function sentenceCase(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => {
      let t = s.trim();
      if (!t) return '';
      t = t.charAt(0).toUpperCase() + t.slice(1);
      if (!/[.!?]$/.test(t)) t += QUESTION.test(t) ? '?' : '.';
      return t;
    })
    .filter(Boolean)
    .join(' ');
}

export function basicPolish(text) {
  let t = ` ${String(text || '').replace(/\s+/g, ' ').trim()} `;
  if (!t.trim()) return '';
  REPORTED_RES.forEach(([re, to]) => { t = t.replace(re, to); });
  PHRASE_RES.forEach(([re, en]) => { t = t.replace(re, en); });
  t = t.replace(/\b[A-Za-z']+\b/g, (w) => {
    const low = w.toLowerCase();
    if (WORDS[low] !== undefined) return WORDS[low];
    if (TYPOS[low] !== undefined) return TYPOS[low];
    return w;
  });
  t = t.replace(PARTICLES, '');
  t = t.replace(/\bi\b/g, 'I').replace(PROPER_RE, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  t = t.replace(/\s+/g, ' ');
  GRAMMAR_RES.forEach(([re, to]) => { t = t.replace(re, to); });
  t = t.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/,\s*,/g, ',').trim();
  return sentenceCase(t);
}
