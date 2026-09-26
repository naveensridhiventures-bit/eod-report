import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

/** Tap to speak instead of typing. Adds what you say to the end of the box. Hidden where the browser can't do it. */
export default function VoiceButton({ onText, lang = 'en-IN' }) {
  const [on, setOn] = useState(false);
  const rec = useRef(null);
  useEffect(() => () => rec.current?.abort(), []);
  if (!Recognition) return null;

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
    <button type="button" className={`voice-btn ${on ? 'on' : ''}`} onClick={toggle} aria-label={on ? 'Stop voice typing' : 'Speak instead of typing'} title={on ? 'Stop' : 'Speak'}>
      {on ? <MicOff size={16} /> : <Mic size={16} />}
      <span>{on ? 'Listening… tap to stop' : 'Speak'}</span>
    </button>
  );
}
