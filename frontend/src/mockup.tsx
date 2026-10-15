import { useEffect, useRef, useState } from 'react';
import './mockup.css';

/** Screen recording prop (local dev only): the app running inside a CSS-drawn iPhone. */
const SCREEN = { width: 393, height: 852 };
const FRAME = { width: SCREEN.width + 2 * 16, height: SCREEN.height + 2 * 16 }; // metal edge + black bezel
const MARGIN = 40;

// Inside the phone: no scrollbars, and the pointer becomes a soft grey fingertip.
const fingertip = (size: number, alpha: number) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><circle cx='${size / 2}' cy='${size / 2}' r='${size / 2 - 1}' fill='rgba(90,90,90,${alpha})' stroke='rgba(255,255,255,.55)' stroke-width='1.5'/></svg>`)}") ${size / 2} ${size / 2}, pointer`;
const injected = `
html,body,*{scrollbar-width:none!important}
::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
html,html *{cursor:${fingertip(36, .38)}!important}
/* iPhone safe areas inside the frame: content clears the Dynamic Island and the home indicator */
:root{--app-top-inset:54px!important;--app-bottom-inset:24px!important}
.camera-close,.camera-guide{top:56px!important}
.demo-toggle{top:112px!important}
.camera-note{top:116px!important}
.roll-header{padding-top:54px!important}
.camera-bottom,.roll-library{padding-bottom:28px!important}
html.mockup-pressing,html.mockup-pressing *{cursor:${fingertip(30, .55)}!important}`;

export function Mockup() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    document.title = 'Rematerial mockup';
    document.documentElement.classList.add('mockup-page');
    const fit = () => setScale(Math.min(1, (window.innerWidth - MARGIN) / FRAME.width, (window.innerHeight - MARGIN) / FRAME.height));
    fit(); window.addEventListener('resize', fit);
    return () => { window.removeEventListener('resize', fit); document.documentElement.classList.remove('mockup-page'); };
  }, []);
  // Runs again after every full reload inside the frame (login redirects etc.); in-app navigation keeps the same document.
  function dress() {
    const doc = frame.current?.contentDocument; if (!doc) return;
    frame.current?.contentWindow?.focus(); // the first tap should not also move focus into the frame
    if (!doc.getElementById('mockup-style')) { const style = doc.createElement('style'); style.id = 'mockup-style'; style.textContent = injected; doc.head.appendChild(style); }
    const root = doc.documentElement;
    doc.addEventListener('pointerdown', () => root.classList.add('mockup-pressing'));
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) doc.addEventListener(type, () => root.classList.remove('mockup-pressing'));
  }
  return <main className="mockup-stage">
    <div className="mockup-device" style={{ width: FRAME.width, height: FRAME.height, transform: `scale(${scale})` }}>
      <span className="mockup-button action"/><span className="mockup-button volume-up"/><span className="mockup-button volume-down"/><span className="mockup-button power"/>
      <div className="mockup-bezel">
        <div className="mockup-screen" style={{ width: SCREEN.width, height: SCREEN.height }}>
          <iframe ref={frame} src="/" title="Rematerial app" onLoad={dress} width={SCREEN.width} height={SCREEN.height}/>
          <span className="mockup-island" aria-hidden="true"/>
          <span className="mockup-home" aria-hidden="true"/>
        </div>
      </div>
    </div>
  </main>;
}
