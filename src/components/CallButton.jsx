import { Phone } from 'lucide-react';
import { startCall } from '../lib/callLog';

/**
 * Call button that remembers who you called, so the app can ask for the result when you come back.
 * call = { type: 'calls'|'hiring', name, phone, title, options?, prev?, leadId? }
 */
export default function CallButton({ call, className = 'btn btn-primary', label = 'Call', size = 16 }) {
  if (!call?.phone) return null;
  return (
    <a className={className} href={`tel:${call.phone}`} onClick={(e) => { e.preventDefault(); startCall(call); }}>
      <Phone size={size} /> {label}
    </a>
  );
}
