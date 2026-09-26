// ─────────────────────────────────────────────────────────────
//  Basic Thanglish → English, used in demo mode and when no AI key
//  is set on the server. With an AI key (see README) the server
//  rewrites notes into proper English instead.
// ─────────────────────────────────────────────────────────────
const PHRASES = [
  [/\binterest(?:ed)? illa(?:i)?\b|\bintrest illa\b/g, 'not interested'],
  [/\b(?:thevai|theva) illa(?:i)?\b/g, 'not needed'],
  [/\b(?:phone |call )?(?:edukala|edukkala|eduthala|edukalai|edukavillai)\b/g, 'did not pick up'],
  [/\breach aagala\b|\breach agala\b/g, 'not reachable'],
  [/\bswitch ?off (?:ah|ha|a)? ?(?:iruku|irukku|irundhuchu)\b/g, 'switched off'],
  [/\bbusy (?:ah|ha|ya|a)? ?(?:iruku|irukku|irukanga|irukaru)\b/g, 'busy'],
  [/\bcall (?:pannunga|panunga|pannu|pannanum|pannuven|panren)\b/g, 'call'],
  [/\bcall back pannunga\b/g, 'call back'],
  [/\b(?:kupdunga|koopdunga|kooptunga|kupudunga)\b/g, 'call them'],
  [/\border (?:podrom|poduvom|poduvanga|poduvaru|potanga|pottanga|pannuvanga)\b/g, 'will place an order'],
  [/\bjoin (?:pannitaru|pannitanga|panitaru|panitanga|aagitaru|agitaru)\b/g, 'has joined'],
  [/\bjoin (?:panraru|panranga|pannuvaru|pannuvanga)\b/g, 'will join'],
  [/\binterview(?: ku| kku)? (?:varuvanga|varuvaanga|varuvaru|varuvaar|varen)\b/g, 'will come for the interview'],
  [/\b(?:yosichu|yosithu) solren\b|\byosikiren\b|\byosikaren\b/g, 'will think and let us know'],
  [/\b(?:ok|okay) nu (?:sonnanga|sonnaru|sonnar)\b/g, 'agreed'],
  [/\bprice list\b/g, 'price list']
];

const WORDS = {
  venum: 'wants', vendum: 'needs', venam: "doesn't want", venaam: "doesn't want", vendam: "doesn't want", vendaam: "doesn't want",
  illa: 'no', illai: 'no', ila: 'no', aama: 'yes', aamaa: 'yes',
  naalaiku: 'tomorrow', nalaiku: 'tomorrow', naalaikku: 'tomorrow', nalaikku: 'tomorrow', nalaki: 'tomorrow',
  inniku: 'today', indru: 'today', innaiku: 'today', innikku: 'today',
  aprom: 'later', apram: 'later', apparam: 'later', appuram: 'later',
  saayangalam: 'evening', sayangalam: 'evening', kaalaila: 'in the morning', kalaila: 'in the morning', madhiyam: 'afternoon',
  mani: "o'clock", vaaram: 'week', varam: 'week', adutha: 'next', ippo: 'now', ipo: 'now',
  sonnanga: 'said', sonnaru: 'said', sonnar: 'said', sollunga: 'please tell', sollu: 'tell',
  pesunga: 'please talk', pesinen: 'spoke', pesunen: 'spoke', pesalam: "let's talk", pesanum: 'need to talk',
  anupunga: 'send', anuppunga: 'send', anuppu: 'send', anupu: 'send', anupinen: 'sent',
  varuvanga: 'will come', varuvaanga: 'will come', varuvaru: 'will come', varala: 'did not come', varla: 'did not come', vanthanga: 'came',
  pakalam: "we'll see", paakalam: "we'll see", paakuren: 'will check', pakuren: 'will check',
  vilai: 'price', rate: 'price', kammi: 'low', kamma: 'low', jaasthi: 'high', jasthi: 'high', adhigam: 'high', athigam: 'high',
  kandippa: 'definitely', konjam: 'a little', romba: 'very', nalla: 'good', sari: 'okay', seri: 'okay',
  avanga: 'they', avaru: 'he', aval: 'she', naan: 'I', naanga: 'we', enakku: 'I', avangaluku: 'they',
  aachu: 'done', achu: 'done', mudinjuchu: 'finished', mudinjathu: 'finished', kettanga: 'asked', kettaru: 'asked',
  kadai: 'shop', kada: 'shop', ennai: 'oil', arisi: 'rice', paruppu: 'dal', sakkarai: 'sugar'
};

export function basicPolish(text) {
  let t = ` ${String(text || '').trim()} `;
  if (!t.trim()) return '';
  let low = t.toLowerCase();
  PHRASES.forEach(([re, en]) => { low = low.replace(re, en); });
  low = low.replace(/\b[a-z']+\b/g, (w) => WORDS[w] || w);
  low = low
    .replace(/\s+(ah|ha|la|nu|um|dhan|than|ku|kku)\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bi\b/g, 'I')
    .trim();
  if (!low) return '';
  low = low.charAt(0).toUpperCase() + low.slice(1);
  if (!/[.!?]$/.test(low)) low += '.';
  return low;
}
