import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const LANG_KEY = 'pulse_voice_lang';
const getLang = () => { try { return localStorage.getItem(LANG_KEY) || 'en-IN'; } catch { return 'en-IN'; } };

/**
 * Tap to speak instead of typing (English or Tamil). Adds what you say to the end of the box.
 * Speak in Tamil, then tap ✨ English to turn it into English. Hidden where the browser can't do it.
 */
export default function VoiceButton({ onText }) {
  const [on, setOn] = useState(false);
  const [lang, setLang] = useState(getLang);
  const rec = useRef(null);
  useEffect(() => () => rec.current?.abort(), []);
  if (!Recognition) return null;

  const switchLang = () => {
    const next = lang === 'en-IN' ? 'ta-IN' : 'en-IN';
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* ignore */ }
  };

  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    const r = new Recognition();
    r.lang = lang;
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      const said = Array.from(e.results).slice(e.resultIndex).filter((x) => x.isFinal).map((x) => x[0].transcript).join(' ').trim();
      if (said) onText(said);
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };

  return (
    <span className="voice-wrap">
      <button type="button" className={`voice-btn ${on ? 'on' : ''}`} onClick={toggle} aria-label={on ? 'Stop voice typing' : 'Speak instead of typing'}>
        {on ? <MicOff size={14} /> : <Mic size={14} />}
        <span>{on ? 'Stop' : 'Speak'}</span>
      </button>
      {!on && <button type="button" className="voice-lang" onClick={switchLang} title="Voice language">{lang === 'en-IN' ? 'EN' : 'தமிழ்'}</button>}
    </span>
  );
}
