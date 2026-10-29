import React from 'react';
import {AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame, Easing} from 'remotion';

type Lang = 'en' | 'es';
type L = {en: string; es: string};
type Cam = {z: number; x: number; y: number}; // zoom + focus point in image px
type Scene = {
  img: string; w: number; h: number; dur: number;
  from: Cam; to: Cam; title: L; sub: L;
};

const FPS = 30;
const XF = 12; // crossfade frames
const C = {bg: '#161616', text: '#ffffff', mute: '#b9bfcc', accent: '#dbe7ff', blue: '#5b8cff'};
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Helvetica, Arial, sans-serif';

// Cada escena usa una captura real de landing/img (datos de demostración).
const SCENES: Scene[] = [
  {img: '01-workspace-oscuro.png', w: 1360, h: 900, dur: 105,
    from: {z: 1.0, x: 680, y: 450}, to: {z: 2.6, x: 300, y: 70},
    title: {en: 'One Workspace per project', es: 'Un Workspace por proyecto'},
    sub: {en: 'Switch between Lanzamiento, Estudio and Personal', es: 'Cambia entre Lanzamiento, Estudio y Personal'}},
  {img: '01-workspace-oscuro.png', w: 1360, h: 900, dur: 120,
    from: {z: 1.5, x: 330, y: 250}, to: {z: 1.9, x: 400, y: 440},
    title: {en: 'Shortcuts with thumbnails', es: 'Accesos con miniatura'},
    sub: {en: 'Sections, tags and the name right below', es: 'Secciones, tags y el nombre justo debajo'}},
  {img: '06-nuevo-acceso.png', w: 1360, h: 900, dur: 120,
    from: {z: 1.0, x: 680, y: 450}, to: {z: 1.2, x: 680, y: 450},
    title: {en: 'New shortcut: image, tags, domain rules', es: 'Nuevo acceso: imagen, tags y reglas por dominio'},
    sub: {en: 'Paste a capture as the thumbnail', es: 'Pega una captura como miniatura'}},
  {img: '07-tags.png', w: 1360, h: 900, dur: 105,
    from: {z: 1.0, x: 680, y: 450}, to: {z: 1.9, x: 330, y: 330},
    title: {en: 'Tags across all your Workspaces', es: 'Tags de todos tus Workspaces'},
    sub: {en: 'One view for your whole library', es: 'Una vista para toda tu biblioteca'}},
  {img: '03-workspace-claro.png', w: 1360, h: 900, dur: 105,
    from: {z: 1.0, x: 680, y: 450}, to: {z: 1.35, x: 600, y: 400},
    title: {en: 'Focus the tab you already have', es: 'Enfoca la pestaña que ya tienes'},
    sub: {en: 'It looks for a matching tab before opening a new one', es: 'Busca una pestaña coincidente antes de abrir otra'}},
  {img: '04-inventario.png', w: 1360, h: 900, dur: 120,
    from: {z: 1.0, x: 680, y: 450}, to: {z: 1.2, x: 680, y: 450},
    title: {en: 'Inventory: see and free up tabs', es: 'Inventario: revisa y libera pestañas'},
    sub: {en: 'Unload selected tabs; they reload when you return', es: 'Descarga pestañas; se recargan al volver'}},
  {img: '04b-agrupar.png', w: 1360, h: 900, dur: 105,
    from: {z: 1.0, x: 680, y: 450}, to: {z: 1.2, x: 680, y: 450},
    title: {en: 'Group tabs by Workspace', es: 'Agrupa pestañas por Workspace'},
    sub: {en: 'Open sections in their own window and group', es: 'Abre secciones en ventana y grupo propios'}},
  {img: '02-side-panel.png', w: 400, h: 860, dur: 120,
    from: {z: 1.0, x: 200, y: 430}, to: {z: 1.9, x: 200, y: 200},
    title: {en: 'Side Panel and ★ Pinned', es: 'Side Panel y ★ Fijados'},
    sub: {en: 'Your pinned shortcuts, always at hand', es: 'Tus accesos fijados, siempre a mano'}},
  {img: '05b-diseno.png', w: 1360, h: 900, dur: 90,
    from: {z: 1.0, x: 680, y: 450}, to: {z: 1.15, x: 680, y: 450},
    title: {en: 'Ten styles, your way', es: 'Diez estilos, a tu gusto'},
    sub: {en: 'Backgrounds, colors and thumbnail sizes', es: 'Fondos, colores y tamaños de miniatura'}},
  {img: '05c-sincronizar.png', w: 1360, h: 900, dur: 105,
    from: {z: 1.0, x: 680, y: 450}, to: {z: 1.15, x: 680, y: 450},
    title: {en: 'Optional sync', es: 'Sincronización opcional'},
    sub: {en: 'Local storage by default', es: 'Datos locales por defecto'}},
  {img: '05d-respaldo.png', w: 1360, h: 900, dur: 105,
    from: {z: 1.0, x: 680, y: 450}, to: {z: 1.15, x: 680, y: 450},
    title: {en: 'ZIP backup you control', es: 'Respaldo ZIP bajo tu control'},
    sub: {en: 'Your data stays yours', es: 'Tus datos, bajo tu control'}},
];

const INTRO = 90;
const OUTRO = 120;
const body = SCENES.reduce((a, s) => a + s.dur - XF, 0);
export const TOTAL = INTRO - XF + body + OUTRO; // ~42 s

const ease = Easing.bezier(0.45, 0, 0.2, 1);

const Fade: React.FC<{dur: number; first?: boolean; children: React.ReactNode}> = ({dur, first, children}) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, XF, dur - XF, dur], [first ? 1 : 0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity: o}}>{children}</AbsoluteFill>;
};

const Shot: React.FC<{s: Scene; lang: Lang}> = ({s, lang}) => {
  const f = useCurrentFrame();
  const t = ease(Math.min(1, f / s.dur));
  const z = interpolate(t, [0, 1], [s.from.z, s.to.z]);
  const fx = interpolate(t, [0, 1], [s.from.x, s.to.x]);
  const fy = interpolate(t, [0, 1], [s.from.y, s.to.y]);
  const base = Math.min(1700 / s.w, 900 / s.h);
  const sc = base * z;
  const tx = 960 - fx * sc;
  const ty = 450 - fy * sc;
  const cap = interpolate(f, [8, 26], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 40%, #262b38 0%, #121212 75%)'}} />
      <div style={{position: 'absolute', left: 0, top: 0, width: s.w, height: s.h, transformOrigin: '0 0',
        transform: `translate(${tx}px, ${ty}px) scale(${sc})`, borderRadius: 14 / sc, overflow: 'hidden',
        boxShadow: '0 30px 90px rgba(0,0,0,.6)'}}>
        <Img src={staticFile(s.img)} style={{width: s.w, height: s.h, display: 'block'}} />
      </div>
      <AbsoluteFill style={{background: 'linear-gradient(to top, rgba(10,10,10,.92) 0%, rgba(10,10,10,0) 30%)'}} />
      <div style={{position: 'absolute', left: 96, bottom: 70, opacity: cap, transform: `translateY(${(1 - cap) * 16}px)`, fontFamily: FONT}}>
        <div style={{fontSize: 60, fontWeight: 800, color: C.text, letterSpacing: -1}}>{s.title[lang]}</div>
        <div style={{fontSize: 30, color: C.mute, marginTop: 8}}>{s.sub[lang]}</div>
      </div>
      <div style={{position: 'absolute', right: 80, top: 56, fontFamily: FONT, fontWeight: 800, fontSize: 34, color: C.text, opacity: .85}}>nex.b</div>
    </AbsoluteFill>
  );
};

const Card: React.FC<{lang: Lang; end?: boolean}> = ({lang, end}) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 24], [0, 1], {extrapolateRight: 'clamp'});
  const o2 = interpolate(f, [24, 48], [0, 1], {extrapolateRight: 'clamp'});
  const tag: L = end
    ? {en: 'Chrome 123+ · Manifest V3 · By.kilex', es: 'Chrome 123+ · Manifest V3 · By.kilex'}
    : {en: 'Your new tab, organized by project.', es: 'Tu nueva pestaña, organizada por proyectos.'};
  const sub: L = end
    ? {en: 'Local data · ZIP backup · optional sync', es: 'Datos locales · respaldo ZIP · sincronización opcional'}
    : {en: 'Workspaces · thumbnails · tags · Side Panel', es: 'Workspaces · miniaturas · tags · Side Panel'};
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 40%, #262b38 0%, #121212 75%)', alignItems: 'center', justifyContent: 'center', fontFamily: FONT}}>
      <Img src={staticFile('icon-128.png')} style={{width: 128, height: 128, opacity: o, transform: `scale(${0.9 + 0.1 * o})`}} />
      <div style={{fontSize: 150, fontWeight: 800, color: C.text, letterSpacing: -4, opacity: o, marginTop: 10}}>nex.b</div>
      <div style={{fontSize: 46, color: C.accent, opacity: o2, marginTop: 6, fontWeight: 600}}>{tag[lang]}</div>
      <div style={{fontSize: 30, color: C.mute, opacity: o2, marginTop: 14}}>{sub[lang]}</div>
    </AbsoluteFill>
  );
};

export const Tour: React.FC<{lang: Lang}> = ({lang}) => {
  let at = 0;
  const out: React.ReactNode[] = [];
  out.push(<Sequence key="intro" from={0} durationInFrames={INTRO}><Fade dur={INTRO} first><Card lang={lang} /></Fade></Sequence>);
  at = INTRO - XF;
  SCENES.forEach((s, i) => {
    out.push(<Sequence key={i} from={at} durationInFrames={s.dur}><Fade dur={s.dur}><Shot s={s} lang={lang} /></Fade></Sequence>);
    at += s.dur - XF;
  });
  out.push(<Sequence key="outro" from={at} durationInFrames={OUTRO}><Fade dur={OUTRO}><Card lang={lang} end /></Fade></Sequence>);
  return <AbsoluteFill style={{background: C.bg}}>{out}</AbsoluteFill>;
};
