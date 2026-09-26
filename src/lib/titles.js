// Remembers the list titles each person uses, so the last one is picked for them next time.
const key = (type) => `pulse_titles_${type}`;

export function recentTitles(type) {
  try { return JSON.parse(localStorage.getItem(key(type))) || []; } catch { return []; }
}

export function rememberTitle(type, title) {
  if (!title) return;
  try {
    const list = [title, ...recentTitles(type).filter((t) => t.toLowerCase() !== title.toLowerCase())].slice(0, 6);
    localStorage.setItem(key(type), JSON.stringify(list));
  } catch { /* storage full or blocked */ }
}
