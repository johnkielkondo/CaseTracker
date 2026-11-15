# Design references

The current book is a local Three.js model with TypeScript and a Vite multi-page build. It uses curved page geometry, canvas-generated leather and paper textures, metallic lettering, and an environment-lit scene. Implementation references: [Three.js canvas textures](https://threejs.org/docs/pages/CanvasTexture.html) and [Three.js standard materials](https://threejs.org/docs/pages/MeshStandardMaterial.html). No external book artwork or model is downloaded at runtime.

The tracker uses the following 21st.dev community components as interaction references:

- [Slide Up Text by animbits](https://preview.21st.dev/%40animbits/components/text-slide-up): staggered word entrances. Adapted to the two-line serif heading with a short, one-time reveal.
- [Animated Tabs by SmoothUI / Edu Calvo](https://preview.21st.dev/%40educalvolpz/components/animated-tabs): a sliding selection indicator. Adapted to the field-note chapter buttons with measured indicator width, responsive repositioning, and arrow/Home/End keyboard support.

These are independently written CSS and vanilla JavaScript implementations, not copied component source. The original React/Motion dependencies are not installed. Existing typography, paper layers, colors, and reduced-motion behavior are preserved.
