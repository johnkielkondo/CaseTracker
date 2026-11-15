import { createBookScene } from './book-scene';

const screen = document.getElementById('auth-screen')!;
const track = document.querySelector<HTMLElement>('.book-scroll')!;
const host = document.getElementById('book-viewport')!;
const details = document.getElementById('study-details')!;
const caption = document.getElementById('book-caption')!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let scene: ReturnType<typeof createBookScene> | undefined;
let frame = 0;
let current = 0;
let target = 0;
let lastTime = 0;

// Authentication and navigation remain usable when WebGL is unavailable.
try {
  scene = createBookScene(host);
  scene.canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); cancelAnimationFrame(frame); frame = 0;
    scene?.dispose(); scene = undefined;
    host.classList.remove('webgl-ready');
    document.body.classList.remove('book-enhanced'); details.inert = false;
  });
  document.body.classList.add('book-enhanced');
} catch (error) {
  console.warn('3D book unavailable; showing the accessible cover.', error);
  host.querySelector('canvas')?.remove();
}

function measure() {
  const range = Math.max(1, track.offsetHeight - screen.clientHeight);
  target = reduced.matches ? 0 : Math.max(0, Math.min(1, screen.scrollTop / range));
  const complete = reduced.matches || !scene || target >= .999;
  document.body.classList.toggle('book-complete', complete);
  details.inert = !complete;
  screen.style.setProperty('--book-progress', String(reduced.matches ? 1 : target));
  caption.textContent = reduced.matches ? 'Your study workspace is below ↓'
    : target >= .999 ? 'Your next chapter starts below ↓'
    : target > .72 ? 'Chapter III · A fresh perspective'
    : target > .48 ? 'Chapter II · Every page counts'
    : target > .22 ? 'Chapter I · A place for every case'
    : 'Scroll to open your next chapter';
}
function tick(time: number) {
  frame = 0;
  const delta = Math.min(64, time - (lastTime || time - 16)); lastTime = time;
  current += (target - current) * (1 - Math.exp(-delta / 80));
  if (Math.abs(target - current) < .0003 || reduced.matches) current = target;
  scene?.render(current, reduced.matches);
  if (current !== target && !document.hidden) frame = requestAnimationFrame(tick);
}
function schedule() { if (!frame && !document.hidden) frame = requestAnimationFrame(tick); }
function onScroll() { measure(); schedule(); }
screen.addEventListener('scroll', onScroll, { passive:true });
const resize = new ResizeObserver(() => { scene?.resize(); measure(); schedule(); });
resize.observe(host);
reduced.addEventListener('change', onScroll);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { lastTime = 0; schedule(); }
});
document.querySelector('.skip-book')!.addEventListener('click', event => {
  event.preventDefault();
  screen.scrollTo({ top:track.offsetHeight, behavior:'instant' });
  measure(); current = target; schedule();
  document.getElementById('login-email')!.focus({ preventScroll:true });
});
// The 3D scene is event-driven: there is no idle animation loop.
measure(); schedule();
if (location.hash === '#study-details') (document.querySelector('.skip-book') as HTMLElement).click();
window.addEventListener('pagehide', event => {
  if (!event.persisted) { cancelAnimationFrame(frame); resize.disconnect(); scene?.dispose(); }
});
