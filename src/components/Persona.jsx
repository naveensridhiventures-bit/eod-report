import { useMemo } from 'react';
import { personaUri } from '../lib/persona';

/** Illustrated character for a contact. ring: 'sales' | 'hiring' | 'late' adds a coloured ring. */
export default function Persona({ name, phone, size = 40, ring, title }) {
  const src = useMemo(() => personaUri(`${phone || ''}|${name || ''}`), [name, phone]);
  return (
    <img className={`persona ${ring ? `ring-${ring}` : ''}`} src={src} width={size} height={size} alt="" aria-hidden="true" title={title || name || phone} draggable="false" />
  );
}
