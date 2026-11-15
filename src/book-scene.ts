import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { leatherTextures, pageEdges, paperTexture } from './book-textures';

const W = 2.45, H = 3.5;
const clamp = THREE.MathUtils.clamp;
const smooth = (value: number) => value * value * (3 - 2 * value);

export function createBookScene(host: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .35;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfbf2df, 0x5a5950, 1.1));
  const key = new THREE.DirectionalLight(0xffedd4, 2);
  key.position.set(-3, 6, 8); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  key.shadow.normalBias = .025; key.shadow.bias = -.0001;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8e5f3, .9);
  rim.position.set(5, 2, 3); scene.add(rim);

  const root = new THREE.Group(); scene.add(root);
  const leather = leatherTextures();
  const leatherMaterial = new THREE.MeshStandardMaterial({ map:leather.plain, bumpMap:leather.bump, bumpScale:.025, roughness:.64, metalness:.04 });
  const coverMaterial = new THREE.MeshStandardMaterial({ map:leather.cover, bumpMap:leather.bump, bumpScale:.018, roughness:.66, envMapIntensity:.3, metalnessMap:leather.metal, metalness:.78 });
  function board(parent: THREE.Object3D, z: number) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(W + .15, H + .17, .09, 4, .04), leatherMaterial);
    mesh.position.set(W / 2, 0, z); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  board(root, -.29);
  const cover = new THREE.Group(); cover.position.z = .31; root.add(cover);
  board(cover, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W + .07, H + .09), coverMaterial);
  face.position.set(W / 2, 0, .046); cover.add(face);
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(W -.05, H -.05), new THREE.MeshStandardMaterial({ color:0xa6a083, roughness:1 }));
  inner.rotation.y = Math.PI; inner.position.set(W / 2, 0, -.046); cover.add(inner);

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(.29, .29, H + .08, 40), leatherMaterial);
  spine.scale.x = .58; spine.position.set(-.035, 0, .01);
  spine.castShadow = true; root.add(spine);
  const gold = new THREE.MeshStandardMaterial({ color:0xb89a55, metalness:.78, roughness:.33 });
  for (const y of [-1.4, -1.29, 1.29, 1.4]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.295, .295, .018, 40), gold);
    band.scale.x = .58; band.position.set(-.035, y, .01); root.add(band);
  }
  const edges = pageEdges();
  const edgeMaterial = new THREE.MeshStandardMaterial({ map:edges, roughness:1, bumpMap:edges, bumpScale:.008 });
  const paperPlain = new THREE.MeshStandardMaterial({ color:0xeee5cf, roughness:1 });
  const block = new THREE.Mesh(new THREE.BoxGeometry(W -.04, H -.08, .45), [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, paperPlain, paperPlain]);
  block.position.set(W / 2 + .015, 0, -.015); block.castShadow = true; block.receiveShadow = true; root.add(block);
  const finalPage = new THREE.Mesh(new THREE.PlaneGeometry(W -.04, H -.08), new THREE.MeshStandardMaterial({ map:paperTexture(3), roughness:.95 }));
  finalPage.position.set(W / 2 + .015, 0, .212); finalPage.receiveShadow = true; root.add(finalPage);

  // A shared front/back surface is bent by integrating the tangent along its width.
  // This preserves page length and avoids the stretchy look of a simple sine warp.
  const pages = Array.from({ length:3 }, (_, index) => {
    const geometry = new THREE.PlaneGeometry(W -.04, H -.08, 52, 12);
    const front = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map:paperTexture(index), roughness:.97, side:THREE.FrontSide }));
    const back = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map:paperTexture(index, true), roughness:.97, side:THREE.BackSide }));
    front.castShadow = true; front.receiveShadow = true; back.castShadow = true; back.receiveShadow = true;
    root.add(front, back);
    return { geometry, index };
  });
  const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(.11, 1.05, 1, 8), new THREE.MeshStandardMaterial({ color:0x7d2b27, roughness:.88, side:THREE.DoubleSide }));
  ribbon.position.set(1.9, -1.82, -.17); ribbon.rotation.z = -.13; root.add(ribbon);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity:.19 }));
  shadow.position.z = -.65; shadow.receiveShadow = true; scene.add(shadow);

  function resize() {
    const width = host.clientWidth, height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const visibleWidth = 6.4, visibleHeight = 5.6;
    const distance = Math.max(visibleHeight, visibleWidth / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.set(0, 0, distance); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  }
  function render(progress: number, reduced: boolean) {
    const open = smooth(clamp(progress / .22, 0, 1));
    cover.rotation.y = -open * (Math.PI - .025);
    cover.position.z = .31 - open * .6;
    for (const { geometry, index } of pages) {
      const turn = smooth(clamp((progress - .24 - index * .24) / .23, 0, 1));
      const curl = Math.sin(turn * Math.PI);
      const pos = geometry.attributes.position;
      const segmentWidth = (W -.04) / 52;
      let x = .015, z = .256 - index * .012 - turn * (.38 - index * .026);
      const curve: { x:number; z:number }[] = [{ x, z }];
      for (let column = 1; column <= 52; column++) {
        const u = (column - .5) / 52;
        const angle = -turn * (Math.PI -.045) + curl * (.65 * Math.sin(Math.PI * u) - .25);
        x += Math.cos(angle) * segmentWidth;
        z -= Math.sin(angle) * segmentWidth;
        curve.push({ x, z });
      }
      for (let row = 0; row <= 12; row++) {
        for (let column = 0; column <= 52; column++) {
          const p = curve[column], u = column / 52, v = row / 12;
          pos.setXYZ(row * 53 + column, p.x, (H -.08) * (.5 - v), p.z + curl * Math.sin(u * Math.PI) * (v -.5) * .12);
        }
      }
      pos.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    }
    // The view gently settles from an angled closed volume into a readable spread.
    root.rotation.set(reduced ? -.12 : -.32 + open * .22, reduced ? -.12 : -.36 + open * .3, -.1 + open * .04);
    root.position.set(-W / 2 * (1 - open), -.06, 0);
    renderer.render(scene, camera);
  }
  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
    environment.dispose(); renderer.dispose(); renderer.domElement.remove();
  }
  resize(); render(0, false);
  host.classList.add('webgl-ready');
  return { resize, render, dispose, canvas:renderer.domElement };
}
