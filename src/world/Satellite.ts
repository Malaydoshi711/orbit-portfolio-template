import * as THREE from "three";
import { PART_HEX } from "./palette";

/* ------------------------------------------------------------------ */
/* Procedural Earth-observation satellite: foil bus, tracking solar     */
/* wings, a dish and a nadir sensor, plus the flagship's parts.         */
/* ------------------------------------------------------------------ */

function panelTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 256, 128);
  grd.addColorStop(0, "#0d1f4a");
  grd.addColorStop(1, "#08142f");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = "rgba(140,180,255,0.35)";
  g.lineWidth = 1;
  for (let x = 0; x <= 256; x += 16) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 128); g.stroke(); }
  for (let y = 0; y <= 128; y += 16) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(256, y + 0.5); g.stroke(); }
  g.strokeStyle = "rgba(200,220,255,0.7)";
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 253, 125);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Satellite {
  root = new THREE.Group();
  body = new THREE.Group();
  wings: THREE.Group[] = [];
  sensor = new THREE.Object3D();
  agents: THREE.Mesh[] = [];
  agentHub = new THREE.Group();
  private agentLine: THREE.Line;
  private agentLinePos: Float32Array;
  private agentMats: THREE.MeshBasicMaterial[] = [];
  private lens: THREE.MeshBasicMaterial;
  agentAmt = 0;
  activeAgent = 0;

  beam: THREE.Mesh;
  private beamPos = new Float32Array(9);
  beamAmt = 0;

  constructor(parts = 4) {
    const n = Math.max(1, parts);
    this.root.add(this.body);

    // crinkled gold foil bus: a subdivided box with jittered vertices, flat shaded
    const busGeo = new THREE.BoxGeometry(1.1, 1.1, 1.5, 4, 4, 5);
    const p = busGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const j = 0.025;
      const h = Math.sin(x * 37.1 + y * 11.3 + z * 23.7) * 43758.5;
      const r = h - Math.floor(h) - 0.5;
      p.setXYZ(i, x + r * j, y - r * j, z + r * j * 0.6);
    }
    busGeo.computeVertexNormals();
    const foil = new THREE.MeshStandardMaterial({ color: "#c9952f", metalness: 0.55, roughness: 0.32, flatShading: true, emissive: "#2a1a05", emissiveIntensity: 0.4 });
    const bus = new THREE.Mesh(busGeo.toNonIndexed(), foil);
    this.body.add(bus);

    const white = new THREE.MeshStandardMaterial({ color: "#d9dde4", metalness: 0.1, roughness: 0.5, emissive: "#1a2030", emissiveIntensity: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: "#2a2f3a", metalness: 0.6, roughness: 0.4 });
    const radiator = new THREE.Mesh(new THREE.BoxGeometry(1.16, 1.16, 0.08), white);
    radiator.position.z = -0.79;
    this.body.add(radiator);

    // solar wings on booms along X
    const ptex = panelTexture();
    const panelMat = new THREE.MeshStandardMaterial({ map: ptex, metalness: 0.7, roughness: 0.28, emissive: "#0a1a40", emissiveIntensity: 0.6, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.x = s * 0.62;
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), dark);
      boom.rotation.z = Math.PI / 2;
      boom.position.x = s * 0.35;
      wing.add(boom);
      for (let k = 0; k < 3; k++) {
        const pane = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.03, 0.95), panelMat);
        pane.position.x = s * (0.75 + 0.65 + k * 1.3);
        wing.add(pane);
      }
      this.wings.push(wing);
      this.body.add(wing);
    }

    // dish on a short mast, pointing down to Earth (+Z is nadir)
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) { const r = (i / 12) * 0.62; prof.push(new THREE.Vector2(r, r * r * 0.7)); }
    const dish = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), new THREE.MeshStandardMaterial({ color: "#e8ebf0", metalness: 0.2, roughness: 0.45, side: THREE.DoubleSide, emissive: "#202838", emissiveIntensity: 0.5 }));
    dish.rotation.x = -Math.PI / 2;
    const dishMount = new THREE.Group();
    dishMount.position.set(0.45, 0.62, 0.55);
    dishMount.rotation.set(0.5, 0, 0.6);
    dishMount.add(dish);
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), dark);
    feed.rotation.x = Math.PI / 2;
    feed.position.z = 0.2;
    dishMount.add(feed);
    this.body.add(dishMount);

    // nadir imaging sensor with a glowing lens
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 24), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(-0.2, -0.15, 0.92);
    this.body.add(barrel);
    this.lens = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 1.8) });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), this.lens);
    lens.position.set(-0.2, -0.15, 1.125);
    this.body.add(lens);
    this.sensor.position.set(-0.2, -0.15, 1.15);
    this.body.add(this.sensor);

    // antenna whip
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 5), white);
    whip.position.set(-0.4, 0.6, -0.4);
    whip.rotation.x = 0.4;
    this.body.add(whip);

    // the flagship's parts fly in formation around the bus
    const cols = Array.from({ length: n }, (_, i) => new THREE.Color(PART_HEX[i % PART_HEX.length]));
    cols.forEach((c) => {
      const m = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.4), transparent: true, opacity: 0 });
      const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), m);
      this.agentMats.push(m);
      this.agents.push(o);
      this.agentHub.add(o);
    });
    this.agentLinePos = new Float32Array((n + 1) * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(this.agentLinePos, 3));
    this.agentLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.4, 0.9, 1.2), transparent: true, opacity: 0 }));
    this.agentLine.frustumCulled = false;
    this.agentHub.add(this.agentLine);
    this.root.add(this.agentHub);

    // scan beam: a thin additive fan from the sensor to the sweep line
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(this.beamPos, 3));
    bg.setAttribute("aT", new THREE.BufferAttribute(new Float32Array([0, 1, 1]), 1));
    this.beam = new THREE.Mesh(bg, new THREE.ShaderMaterial({
      vertexShader: `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uAmt; varying float vT; void main(){ float a = (0.05 + 0.22 * pow(1.0 - vT, 2.0)) * uAmt; gl_FragColor = vec4(vec3(0.36,0.88,1.0) * a, 1.0);
#include <colorspace_fragment>
}`,
      uniforms: { uAmt: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 6;
  }

  /** orient: dish/sensor toward Earth's centre, wings tracking the sun */
  orient(earth: THREE.Vector3, sun: THREE.Vector3, t: number) {
    this.root.lookAt(earth);
    this.root.updateMatrixWorld();
    this.body.rotation.z = Math.sin(t * 0.25) * 0.12;
    const local = sun.clone().transformDirection(this.root.matrixWorld.clone().invert());
    const ang = Math.atan2(local.z, local.y);
    this.wings.forEach((w) => (w.rotation.x = ang));
  }

  update(t: number, dt: number) {
    const k = 1 - Math.exp(-dt * 4);
    const pulse = 0.75 + 0.25 * Math.sin(t * 3);
    this.lens.color.setRGB(0.4 * pulse, 1.4 * pulse, 1.8 * pulse);

    // agents
    const a = this.agentAmt;
    this.agentHub.visible = a > 0.01;
    this.agents.forEach((o, i) => {
      const ang = t * 0.45 + (i * Math.PI * 2) / this.agents.length;
      o.position.set(Math.cos(ang) * 3.6, Math.sin(ang) * 1.4 - 0.3, Math.sin(ang) * 2.0);
      o.rotation.set(t * 0.8 + i, t * 0.6, 0);
      const on = i === this.activeAgent ? 1 : 0;
      const s = 1 + on * 0.7 + Math.sin(t * 4 + i) * 0.06;
      o.scale.lerp(new THREE.Vector3(s, s, s), k);
      this.agentMats[i].opacity = a * (0.55 + on * 0.45);
      this.agentLinePos.set([o.position.x, o.position.y, o.position.z], i * 3);
    });
    const p0 = this.agents[0].position;
    this.agentLinePos.set([p0.x, p0.y, p0.z], this.agents.length * 3);
    this.agentLine.geometry.attributes.position.needsUpdate = true;
    (this.agentLine.material as THREE.LineBasicMaterial).opacity = a * 0.5;
  }

  setBeam(a: THREE.Vector3, b: THREE.Vector3, amt: number) {
    const s = this.sensor.getWorldPosition(new THREE.Vector3());
    this.beamPos.set([s.x, s.y, s.z, a.x, a.y, a.z, b.x, b.y, b.z]);
    this.beam.geometry.attributes.position.needsUpdate = true;
    (this.beam.material as THREE.ShaderMaterial).uniforms.uAmt.value = amt;
    this.beam.visible = amt > 0.01;
  }
}
