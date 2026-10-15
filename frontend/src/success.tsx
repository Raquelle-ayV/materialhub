import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { MaterialPhoto } from './ui';
import './success.css';

/** Confetti: change the colours or amount here. Brown, beige, light caramel, soft olive. */
const CONFETTI_COLORS = ['#7A6352', '#E6DCCB', '#D6B47F', '#A9AE8A'];
const CONFETTI_COUNT = 60;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A number that ticks from `from` to `to` once the line has faded in. */
function Ticker({ from, to, delay }: { from: number; to: number; delay: number }) {
  const [value, setValue] = useState(from);
  useEffect(() => { const timer = setTimeout(() => setValue(to), delay); return () => clearTimeout(timer); }, [to, delay]);
  return <span className="celebrate-count" key={value}>{value}</span>;
}

export type CelebrationProps = {
  title: string;
  subtitle: string;
  material: { name: string; image?: string; detail: string };
  /** Shown under a dashed line in the card, e.g. the code to show at pickup. */
  code?: { label: string; value: string };
  /** One centred line, e.g. "−1 credit, 2 credits left": `lead`, then the number ticking from → to, then `tail`. */
  credit: { lead: string; from: number; to: number; tail: string; accent?: boolean };
  primary: { to: string; label: string };
  secondary: { to: string; label: string };
};

/** Shared success screen (reservation made, drop-off completed): pop-in check, confetti, then the details fade up in turn. */
export function CelebrationPage({ title, subtitle, material, code, credit, primary, secondary }: CelebrationProps) {
  const badge = useRef<HTMLSpanElement>(null);
  const calm = reducedMotion();
  useEffect(() => {
    if (calm) return;
    const timer = setTimeout(() => {
      const rect = badge.current?.getBoundingClientRect(); if (!rect) return;
      void confetti({
        particleCount: CONFETTI_COUNT, colors: CONFETTI_COLORS, spread: 360, startVelocity: 16, gravity: 1.4, decay: .9, ticks: 60, scalar: .6, shapes: ['square', 'circle'],
        origin: { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight }, disableForReducedMotion: true,
      });
    }, 500);
    return () => { clearTimeout(timer); confetti.reset(); };
  }, [calm]);
  const step = (i: number) => ({ '--i': i } as React.CSSProperties);
  return <section className={`celebrate ${calm ? 'calm' : ''}`} aria-live="polite">
    <span className="celebrate-badge" ref={badge} aria-hidden="true">
      <svg viewBox="0 0 72 72"><path d="M22 37.5 31.5 47 50 27"/></svg>
    </span>
    <h1 className="celebrate-in" style={step(0)}>{title}</h1>
    <p className="celebrate-subtitle celebrate-in" style={step(1)}>{subtitle}</p>
    <div className="celebrate-card celebrate-in" style={step(2)}>
      <div className="celebrate-material"><MaterialPhoto src={material.image} alt=""/><div><b>{material.name}</b><span>{material.detail}</span></div></div>
      {code && <div className="celebrate-code"><small>{code.label}</small><strong>{code.value}</strong></div>}
    </div>
    <p className={`celebrate-credit celebrate-in ${credit.accent ? 'accent' : ''}`} style={step(3)}>
      {credit.lead}<Ticker from={credit.from} to={credit.to} delay={calm ? 0 : 1000}/>{credit.tail}
    </p>
    <div className="celebrate-actions celebrate-in" style={step(4)}>
      <Link className="button dark full" to={primary.to}>{primary.label}</Link>
      <Link className="text-button" to={secondary.to}>{secondary.label}</Link>
    </div>
  </section>;
}
