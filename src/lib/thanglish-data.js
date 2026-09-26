// ─────────────────────────────────────────────────────────────
//  THANGLISH → ENGLISH word lists (offline fallback)
//  The same lists are copied into apps-script/Code.gs by
//  scripts/sync-thanglish.py, so the app and the server agree.
//  Patterns are plain strings (turned into regexes at runtime).
// ─────────────────────────────────────────────────────────────

// Whole phrases first (longest wins). [alternatives, English]
export const PHRASES = [
  // Everyday conversation
  [['enna pandra', 'enna panra', 'enna panringa', 'enna pannureenga', 'enna pannura', 'enna panreenga', 'enna pannringa'], 'what are you doing'],
  [['saptiya', 'saapteengala', 'sapteengala', 'saptingala', 'saapitiya', 'sapteenga'], 'did you eat'],
  [['enga irukinga', 'enga irukeenga', 'enga irukka', 'enga iruka', 'enga irukenga'], 'where are you'],
  [['epo varuvinga', 'eppo varuvinga', 'epo varuva', 'eppo varuveenga', 'epo vareenga', 'eppo vareenga'], 'when will you come'],
  [['epdi irukinga', 'eppadi irukeenga', 'epdi iruka', 'eppadi irukka', 'epdi irukeenga'], 'how are you'],
  [['nalla irukken', 'nalla iruken', 'nalla irukkaen'], 'I am fine'],
  [['vandhutu irukken', 'vanthuttu irukken', 'vandhutu iruken', 'varen varen'], 'I am on the way'],
  [['kelambitten', 'kilambitten', 'kelambiten'], 'I have left'],
  [['theriyala', 'teriyala', 'theriyadhu', 'theriyathu', 'therla'], "don't know"],
  [['puriyala', 'puriyalai', 'puriyalaye'], "didn't understand"],
  [['mudiyadhu', 'mudiyathu', 'mudiyala', 'mudiyaathu'], 'cannot'],
  [['velai irukku', 'vela iruku', 'vela irukku', 'velai iruku'], 'busy with work'],
  [['leave la irukanga', 'leave la irukaru', 'leave la iruken', 'leave la irukken'], 'is on leave'],
  [['ooru la illa', 'oorla illa', 'ooru la ila'], 'is out of town'],
  // Sales
  [['interest illa', 'interest illai', 'intrest illa', 'interested illa', 'interest ila'], 'not interested'],
  [['thevai illa', 'theva illa', 'thevai illai', 'theva ila'], 'not needed'],
  [['stock illa', 'stock ila', 'stock illai'], 'out of stock'],
  [['stock iruka', 'stock irukka'], 'is stock available'],
  [['delivery eppo', 'delivery epo'], 'when is the delivery'],
  [['delivery varala', 'delivery varla', 'delivery vandhala'], 'delivery has not arrived'],
  [['sample kudunga', 'sample anupunga', 'sample anuppunga', 'sample venum'], 'wants a sample'],
  [['quotation anupunga', 'quotation anuppunga', 'quotation venum'], 'send a quotation'],
  [['price list anupunga', 'price list anuppunga', 'price list venum', 'rate list anupunga'], 'send the price list'],
  [['location anupunga', 'location anuppunga', 'location share pannunga'], 'send the location'],
  [['owner illa', 'owner ila', 'owner illai'], 'owner not available'],
  [['owner kitta pesanum', 'owner kita pesanum', 'owner kitta pesunga'], 'need to talk to the owner'],
  [['amount anupuren', 'amount anuppuren', 'pay panren', 'pay pannuren', 'payment panren'], 'will send the payment'],
  [['payment pannitanga', 'pay pannitanga', 'amount potutanga', 'amount pottutanga', 'payment aachu'], 'has paid'],
  [['order podrom', 'order poduvom', 'order poduvanga', 'order poduvaru', 'order pannuvanga', 'order pannuvaru'], 'will place an order'],
  [['order potanga', 'order pottanga', 'order pannitanga', 'order pottaru'], 'placed an order'],
  [['rate jaasthi', 'rate jasthi', 'rate adhigam', 'rate athigam', 'vilai jaasthi'], 'price is too high'],
  [['rate kammi pannunga', 'rate kammi panna mudiyuma', 'discount venum', 'discount kudunga'], 'wants a discount'],
  [['vera kadai la vaanguranga', 'vera edathula vaanguranga', 'already vaanguranga'], 'already buying from another shop'],
  // Calls
  [['phone edukala', 'call edukala', 'edukala', 'edukkala', 'eduthala', 'edukalai', 'edukavillai', 'call attend pannala'], 'did not pick up'],
  [['reach aagala', 'reach agala', 'not reachable ah iruku'], 'not reachable'],
  [['switch off ah iruku', 'switch off ah irukku', 'switch off la iruku', 'switched off ah iruku'], 'phone switched off'],
  [['busy ah iruku', 'busy ah irukku', 'busy ya irukanga', 'busy ah irukanga', 'busy nu sonnanga'], 'busy'],
  [['call back pannunga', 'thirumba call pannunga', 'marupadiyum call pannunga'], 'call back'],
  [['call pannunga', 'call panunga', 'call pannu', 'call pannanum', 'kupdunga', 'koopdunga', 'kooptunga', 'kupudunga'], 'call'],
  [['yosichu solren', 'yosithu solren', 'yosikiren', 'yosikaren', 'yosichu sollren'], 'will think and let us know'],
  [['ok nu sonnanga', 'ok nu sonnaru', 'okay nu sonnanga', 'sari nu sonnanga'], 'agreed'],
  [['wrong number', 'thappana number', 'thappu number'], 'wrong number'],
  // Hiring
  [['salary evlo', 'salary evvalavu', 'sambalam evlo'], 'asked about the salary'],
  [['salary kammi', 'sambalam kammi'], 'salary is too low'],
  [['experience iruku', 'experience irukku', 'anubavam iruku'], 'has experience'],
  [['experience illa', 'experience ila', 'anubavam illa'], 'no experience'],
  [['licence iruku', 'license iruku', 'licence irukku', 'license irukku'], 'has a licence'],
  [['licence illa', 'license illa', 'licence ila', 'license ila'], 'no licence'],
  [['vela venum', 'velai venum', 'job venum'], 'needs a job'],
  [['vela venam', 'velai venam', 'job venam'], "doesn't want the job"],
  [['interview ku varuvanga', 'interview ku varuvaanga', 'interview ku varuvaru', 'interview ku varen', 'interview varuvanga'], 'will come for the interview'],
  [['interview ku varala', 'interview varala', 'interview ku varla'], 'did not come for the interview'],
  [['join pannitaru', 'join pannitanga', 'join panitaru', 'join panitanga', 'join aagitaru', 'join agitaru'], 'has joined'],
  [['join panraru', 'join panranga', 'join pannuvaru', 'join pannuvanga'], 'will join'],
  [['vera company la join pannitaru', 'vera company join pannitaru', 'already vera company'], 'already joined another company'],
  [['vela vittu poitaru', 'velaya vittutaru', 'resign pannitaru'], 'has left the job']
];

// Single words
export const WORDS = {
  // question words
  enna: 'what', epo: 'when', eppo: 'when', enga: 'where', yaaru: 'who', yaar: 'who', evlo: 'how much', evvalavu: 'how much',
  epdi: 'how', eppadi: 'how', yen: 'why', en: 'why',
  // people
  naan: 'I', na: 'I', naanga: 'we', nee: 'you', neenga: 'you', avan: 'he', avaru: 'he', aval: 'she', ava: 'she', avanga: 'they',
  enakku: 'I', enaku: 'I', unakku: 'you', ungalukku: 'you', avangaluku: 'they', avarukku: 'he', amma: 'mother', appa: 'father',
  // time
  naalaiku: 'tomorrow', nalaiku: 'tomorrow', naalaikku: 'tomorrow', nalaikku: 'tomorrow', nalaki: 'tomorrow', naliku: 'tomorrow',
  inniku: 'today', indru: 'today', innaiku: 'today', innikku: 'today', inniki: 'today',
  nethu: 'yesterday', nethikku: 'yesterday', neththu: 'yesterday',
  saayangalam: 'evening', sayangalam: 'evening', saayanthiram: 'evening', kaalaila: 'in the morning', kalaila: 'in the morning',
  kaalaiyila: 'in the morning', madhiyam: 'afternoon', mathiyam: 'afternoon', raathiri: 'night', rathiri: 'night',
  mani: "o'clock", vaaram: 'week', varam: 'week', maasam: 'month', adutha: 'next', ippo: 'now', ipo: 'now', appo: 'then',
  aprom: 'later', apram: 'later', apparam: 'later', appuram: 'later', innum: 'still', seekiram: 'soon', sikiram: 'soon', udane: 'immediately',
  thirumba: 'again', marupadiyum: 'again',
  // yes / no / want
  aama: 'yes', aamaa: 'yes', illa: 'no', illai: 'no', ila: 'no', sari: 'okay', seri: 'okay',
  venum: 'wants', vendum: 'needs', venam: "doesn't want", venaam: "doesn't want", vendam: "doesn't want", vendaam: "doesn't want",
  mudiyum: 'can', mudiyuma: 'can you',
  // verbs
  sonnanga: 'said', sonnaru: 'said', sonnar: 'said', sonnen: 'I said', sollunga: 'please tell', sollu: 'tell', solren: 'will tell',
  pesunga: 'please talk', pesinen: 'spoke', pesunen: 'spoke', pesalam: "let's talk", pesanum: 'need to talk', pesuren: 'will talk',
  anupunga: 'send', anuppunga: 'send', anuppu: 'send', anupu: 'send', anupinen: 'sent', anuppinen: 'sent', anupuren: 'will send',
  varuvanga: 'will come', varuvaanga: 'will come', varuvaru: 'will come', varala: 'did not come', varla: 'did not come',
  vanthanga: 'came', vandhanga: 'came', vanga: 'come', vaanga: 'come', ponga: 'go', poitanga: 'left', poitaru: 'left',
  pakalam: "we'll see", paakalam: "we'll see", paakuren: 'will check', pakuren: 'will check', paarunga: 'please check',
  kettanga: 'asked', kettaru: 'asked', kekkuren: 'will ask', kudunga: 'give', kudu: 'give', kuduthen: 'gave',
  vaangunga: 'buy', vaanguvanga: 'will buy', vaangala: 'did not buy', vaanginaanga: 'bought', vaangitanga: 'bought',
  panren: 'will do', pannuren: 'will do', pannunga: 'please do', pannala: 'did not do', pannitten: 'done', panniten: 'done',
  irukku: 'is there', iruku: 'is there', irukanga: 'are there', irundhuchu: 'was there', aachu: 'done', achu: 'done',
  mudinjuchu: 'finished', mudinjathu: 'finished', therinjavanga: 'known person',
  // things
  vilai: 'price', rate: 'price', kammi: 'low', kamma: 'low', jaasthi: 'high', jasthi: 'high', adhigam: 'high', athigam: 'high',
  kadai: 'shop', kada: 'shop', veedu: 'house', veetla: 'at home', ennai: 'oil', arisi: 'rice', paruppu: 'dal', sakkarai: 'sugar',
  sambalam: 'salary', vela: 'job', velai: 'job', panam: 'money', kaasu: 'money',
  // describing
  kandippa: 'definitely', konjam: 'a little', romba: 'very', rombha: 'very', nalla: 'good', mosam: 'bad', pudhu: 'new', puthu: 'new',
  pazhaya: 'old', palaya: 'old', nandri: 'thank you', inga: 'here', anga: 'there'
};

// Common typing mistakes and short forms
export const TYPOS = {
  intrested: 'interested', intersted: 'interested', interseted: 'interested', intrsted: 'interested', ntrstd: 'interested',
  tmrw: 'tomorrow', tmr: 'tomorrow', tomo: 'tomorrow', tommorow: 'tomorrow', tomorow: 'tomorrow', tommorrow: 'tomorrow', 'tmrow': 'tomorrow',
  pls: 'please', plz: 'please', plzz: 'please', wil: 'will', recieved: 'received', recived: 'received', wat: 'what', wht: 'what',
  bcoz: 'because', becoz: 'because', bcz: 'because', coz: 'because', msg: 'message', dnt: "don't", dont: "don't", cant: "can't",
  wont: "won't", didnt: "didn't", doesnt: "doesn't", isnt: "isn't", wasnt: "wasn't", havent: "haven't", im: "I'm", ur: 'your',
  u: 'you', r: 'are', abt: 'about', frm: 'from', nxt: 'next', wk: 'week', mrng: 'morning', evng: 'evening', eve: 'evening',
  amt: 'amount', pymt: 'payment', dlvry: 'delivery', cust: 'customer', cal: 'call', bck: 'back', thnx: 'thanks', thx: 'thanks',
  avlbl: 'available', availble: 'available', avaliable: 'available', adress: 'address', addres: 'address', beacuse: 'because',
  definately: 'definitely', seperate: 'separate', untill: 'until', tommrow: 'tomorrow', shd: 'should', wud: 'would', cud: 'could',
  lic: 'licence', exp: 'experience', sal: 'salary', intw: 'interview', intvw: 'interview', joing: 'joining', ph: 'phone'
};

// Grammar fixes applied after translation. [regex source, replacement]
export const GRAMMAR = [
  ['\\b(he|she|it) (don\'t)\\b', '$1 doesn\'t'],
  ['\\b(they|we|you|I) doesn\'t\\b', '$1 don\'t'],
  ['\\b(he|she|it) have\\b', '$1 has'],
  ['\\b(he|she|it) want\\b', '$1 wants'],
  ['\\b(he|she|it) need\\b', '$1 needs'],
  ['\\b(he|she|it) say\\b', '$1 says'],
  ['\\b(they|we|you|I) wants\\b', '$1 want'],
  ['\\b(they|we|you|I) needs\\b', '$1 need'],
  ['\\bI is\\b', 'I am'],
  ['\\b(he|she|it|they|we|you) is not interest\\b', '$1 is not interested'],
  ['\\bnot interest\\b', 'not interested'],
  ['\\bis interest\\b', 'is interested'],
  ['\\bcall back (him|her|them)\\b', 'call $1 back'],
  ['\\bwill (came|comes)\\b', 'will come'],
  ['\\bdidn\'t (came|comes)\\b', 'didn\'t come'],
  ['\\bdidn\'t (picked|picks)\\b', 'didn\'t pick'],
  ['\\bdidn\'t (joined|joins)\\b', 'didn\'t join'],
  ['\\bdid not came\\b', 'did not come'],
  ['\\bdid not picked\\b', 'did not pick'],
  ['\\bdid not joined\\b', 'did not join'],
  ['\\ba (order|interview|offer|amount|owner|update|answer|hour)\\b', 'an $1'],
  ['\\ban (price|sample|call|delivery|payment|salary|job|licence|driver|customer)\\b', 'a $1'],
  ['\\b(\\w+) \\1\\b', '$1'],
  ['\\s+([,.!?])', '$1']
];

// Words that make a sentence a question
export const QUESTION_START = '^(what|when|where|who|why|how)\\b|^(did|do|does|is|are|can|will|could|would|should)\\s+(you|he|she|they|we|i|it|the|this|that|stock|delivery|salary)\\b';

// "<something> nu sonnanga" → "they said <something>"; "<something> nu kettaru" → "asked <something>"
export const REPORTED = [
  ['(\\s*)([^,.;!?]+?)\\s+nu\\s+(sonnanga|sonnaanga|sonnaru|sonnar|solranga|solraru)\\b', '$1they said $2'],
  ['(\\s*)([^,.;!?]+?)\\s+nu\\s+(kettanga|kettaru|kekuranga|kekuraru)\\b', '$1asked $2']
];

export const PROPER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Chennai'];
