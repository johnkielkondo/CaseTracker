import * as THREE from 'three';

// All artwork is generated locally: no remote images or texture requests.
function surface(width = 1024, height = 1536) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d')! };
}
function texture(canvas: HTMLCanvasElement, color = true) {
  const map = new THREE.CanvasTexture(canvas);
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}
let seed = 431;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

export function leatherTextures() {
  const { canvas, ctx } = surface();
  const bump = surface();
  const metal = surface();
  ctx.fillStyle = '#122c34'; ctx.fillRect(0, 0, 1024, 1536);
  bump.ctx.fillStyle = '#888'; bump.ctx.fillRect(0, 0, 1024, 1536);
  metal.ctx.fillStyle = '#000'; metal.ctx.fillRect(0, 0, 1024, 1536);
  // Fine irregular grain and pores produce a tangible leather finish under light.
  for (let i = 0; i < 105000; i++) {
    const x = random() * 1024, y = random() * 1536, r = .5 + random() * 2.2;
    ctx.fillStyle = `rgba(${random() > .5 ? '108,132,128' : '0,9,14'},${.06 + random() * .18})`;
    ctx.fillRect(x, y, r, r * .6);
    bump.ctx.fillStyle = `rgb(${80 + Math.floor(random() * 110)}  ${80} ${80})`;
    bump.ctx.fillRect(x, y, r, r * .7);
  }
  const shade = ctx.createLinearGradient(0, 0, 1024, 0);
  shade.addColorStop(0, '#020b12aa'); shade.addColorStop(.055, '#020b1288');
  shade.addColorStop(.09, '#56787622'); shade.addColorStop(.14, '#00000000');
  shade.addColorStop(.95, '#00000000'); shade.addColorStop(1, '#020b1255');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, 1024, 1536);
  // Keep an unlettered copy for the spine and back board.
  const plain = surface(); plain.ctx.drawImage(canvas, 0, 0);
  function foil(c: CanvasRenderingContext2D, color: string) {
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 2;
    c.strokeRect(100, 100, 824, 1336); c.strokeRect(110, 110, 804, 1316);
    c.textAlign = 'center'; c.font = '23px Georgia';
    c.fillText('THE LAW STUDENT’S COMPANION', 512, 222);
    c.font = '64px Georgia'; c.fillText('PHILIPPINE', 512, 420);
    c.font = '76px Georgia'; c.fillText('LAW SCHOOL', 512, 518);
    c.font = 'italic 30px Georgia'; c.fillText('Cases, notes & understanding', 512, 610);
    c.beginPath(); c.moveTo(240, 675); c.lineTo(784, 675); c.stroke();
    c.lineWidth = 5;
    c.beginPath(); c.moveTo(512, 775); c.lineTo(512, 1045);
    c.moveTo(435, 1045); c.lineTo(589, 1045);
    c.moveTo(350, 835); c.lineTo(674, 835); c.stroke();
    for (const x of [350, 674]) {
      c.beginPath(); c.moveTo(x, 835); c.lineTo(x - 66, 945); c.lineTo(x + 66, 945); c.closePath(); c.stroke();
      c.beginPath(); c.ellipse(x, 945, 66, 39, 0, 0, Math.PI); c.stroke();
    }
    c.beginPath(); c.arc(512, 802, 13, 0, Math.PI * 2); c.fill();
    c.font = '26px Georgia'; c.fillText('D I G E S T   T R A C K E R', 512, 1220);
    c.font = '19px Georgia'; c.fillText('P H I L I P P I N E   E D I T I O N', 512, 1280);
  }
  foil(ctx, '#c9af70'); foil(metal.ctx, '#e8e8e8'); foil(bump.ctx, '#b8b8b8');
  return { cover: texture(canvas), plain: texture(plain.canvas), bump: texture(bump.canvas, false), metal: texture(metal.canvas, false) };
}

export function paperTexture(chapter: number, reverse = false) {
  const { canvas, ctx } = surface(768, 1152);
  ctx.fillStyle = '#f3ecda'; ctx.fillRect(0, 0, 768, 1152);
  for (let i = 0; i < 24000; i++) {
    ctx.fillStyle = `rgba(100,77,40,${random() * .06})`;
    ctx.fillRect(random() * 768, random() * 1152, 1 + random() * 2, 1);
  }
  const edge = ctx.createLinearGradient(0, 0, 768, 0);
  edge.addColorStop(0, '#72593933'); edge.addColorStop(.12, '#72593900');
  edge.addColorStop(.9, '#72593900'); edge.addColorStop(1, '#72593922');
  ctx.fillStyle = edge; ctx.fillRect(0, 0, 768, 1152);
  const titles = ['A place for every case.', 'Every page counts.', 'A fresh perspective.', 'Your next chapter.'];
  const subtitles = ['ORGANIZE', 'MAKE PROGRESS', 'REVISIT', 'BEGIN'];
  ctx.fillStyle = '#776848'; ctx.textAlign = 'center'; ctx.font = '17px Georgia';
  ctx.fillText('D I G E S T   T R A C K E R', 384, 94);
  ctx.strokeStyle = '#ae9f7e'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(80, 120); ctx.lineTo(688, 120); ctx.stroke();
  ctx.font = '20px Georgia'; ctx.fillText(reverse ? 'FIELD NOTES' : `CHAPTER ${['I', 'II', 'III', 'IV'][chapter]}`, 384, 245);
  ctx.fillStyle = '#293439'; ctx.font = '37px Georgia';
  ctx.fillText(reverse ? 'One case at a time.' : titles[chapter], 384, 320);
  ctx.fillStyle = '#8c7545'; ctx.font = '16px Georgia';
  ctx.fillText(reverse ? 'READ · REFLECT · RETURN' : subtitles[chapter], 384, 374);
  const passages = [
    ['Every decision belongs to a bigger picture.', 'Keep your subjects together and give each', 'case a place of its own.', '', 'Build your collection of case digests with', 'the details that matter: the case name,', 'the doctrine, and your next step.'],
    ['Understanding is built one reading at a time.', 'See what you have started, what you have', 'finished, and what still needs your attention.', '', 'A little progress today becomes a clearer', 'picture tomorrow. Keep going.'],
    ['Some decisions deserve a second reading.', 'Return to the difficult passages, connect', 'the doctrines, and refine your understanding.', '', 'Prepare for the next recitation with a', 'workspace that remembers where you left off.'],
    ['Your study workspace is ready.', 'Organize your subjects. Follow your progress.', 'Make room for a clearer understanding.', '', 'Sign in below to begin.']
  ];
  ctx.textAlign = 'left'; ctx.font = '23px Georgia'; ctx.fillStyle = '#4f4a3d';
  const lines = reverse ? ['A space for your notes and observations.', '', 'The question. The reasoning. The principle.', 'The small detail that makes it all click.'] : passages[chapter];
  lines.forEach((line, index) => ctx.fillText(line, 88, 495 + index * 43));
  if (reverse) {
    ctx.strokeStyle = '#ad9f7a55';
    for (let y = 720; y < 970; y += 43) { ctx.beginPath(); ctx.moveTo(88, y); ctx.lineTo(680, y); ctx.stroke(); }
  }
  ctx.textAlign = 'center'; ctx.font = '18px Georgia'; ctx.fillText(String(chapter * 2 + (reverse ? 2 : 1)), 384, 1060);
  const map = texture(canvas);
  if (reverse) { map.wrapS = THREE.RepeatWrapping; map.repeat.x = -1; map.offset.x = 1; }
  return map;
}

export function pageEdges() {
  const { canvas, ctx } = surface(512, 512);
  ctx.fillStyle = '#d5c9ae'; ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 3) {
    ctx.fillStyle = `rgba(90,74,43,${.12 + random() * .22})`; ctx.fillRect(0, y, 512, 1);
    ctx.fillStyle = '#f6efdd88'; ctx.fillRect(0, y + 1, 512, 1);
  }
  return texture(canvas);
}
