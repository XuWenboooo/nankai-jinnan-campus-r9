import * as THREE from 'three';

const host = document.querySelector('#viewport');
const plan = await fetch('../../world/r9_library_atria.json').then(response => {
  if (!response.ok) throw new Error('图书馆平面读取失败');
  return response.json();
});
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcbd4d8);
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.append(renderer.domElement);

const camera = new THREE.PerspectiveCamera(63, 1, .055, 215);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xfff6e6, 0xb4ada0, 1.65));
scene.add(new THREE.AmbientLight(0xfff6eb, .48));
const mainLight = new THREE.DirectionalLight(0xfff1d7, 2.18);
mainLight.position.set(-52, 23, -13);
mainLight.target.position.set(-59, 4, 0);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(1536, 1536);
Object.assign(mainLight.shadow.camera, {left: -21, right: 21, top: 20, bottom: -20, near: .5, far: 52});
mainLight.shadow.bias = -.0004;
scene.add(mainLight, mainLight.target);

function finish(color, roughness, pattern = '') {
  const material = new THREE.MeshStandardMaterial({color, roughness});
  if (!pattern) return material;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 surfacePosition;');
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vec4 surfacePoint = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        surfacePoint = instanceMatrix * surfacePoint;
      #endif
      surfacePosition = (modelMatrix * surfacePoint).xyz;
      #include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 surfacePosition;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 p = surfacePosition;
      ${pattern}
      diffuseColor.rgb *= shade;`);
  };
  material.customProgramCacheKey = () => pattern;
  return material;
}

const stone = finish(0xc0b6a1, .66, `
  vec2 edge = min(fract(p.xz / .68), 1.0 - fract(p.xz / .68));
  float joint = smoothstep(.002, .009, min(edge.x, edge.y));
  float grain = sin(p.x*42. + sin(p.z*19.)) * sin(p.z*52. + cos(p.x*15.));
  float shade = mix(.82, 1.0, joint) + .019*grain;`);
const wood = finish(0xb68a54, .57, `
  float seam = smoothstep(.002, .019, min(fract((p.x+p.z)/.63), 1.0-fract((p.x+p.z)/.63)));
  float grain = sin(p.y*104.+1.7*sin(p.x*3.+p.z*3.)) + .27*sin(p.y*272.+p.x*5.);
  float shade = .94 + .055*seam + .025*grain;`);
const darkWood = finish(0x593623, .52);
const plaster = finish(0xe9e4db, .82);
const concrete = finish(0xc4bbb0, .67);
const steel = new THREE.MeshStandardMaterial({color: 0x525252, metalness: .52, roughness: .34});
const red = finish(0xa43f37, .78, `
  float shade = .98 + .022 * sin(p.x*155.+p.y*79.) * sin(p.z*188.+p.y*113.);`);
const shadowGlass = new THREE.MeshStandardMaterial({
  color: 0x89abb7, metalness: .08, roughness: .21, transparent: true, opacity: .37, depthWrite: false,
});
const luminous = new THREE.MeshStandardMaterial({color: 0xfceacc, emissive: 0xffe4b3, emissiveIntensity: 1.7});
const sky = new THREE.MeshStandardMaterial({color: 0xdcf0fb, emissive: 0xa4cfe7, emissiveIntensity: 1.3});
const paper = [0xad734d, 0x785745, 0xc8bd90, 0x445865, 0x996d64, 0x718071, 0xb4a783, 0x864537]
  .map(color => finish(color, .86));

const boxes = new Map();
const floorAreas = [];
const obstacles = [];
const groundY = plan.levels.map(level => level.elevation - plan.levels[0].elevation);
function box(material, x, y, z, w, h, d) {
  if (w < .002 || h < .002 || d < .002) return;
  if (!boxes.has(material)) boxes.set(material, []);
  boxes.get(material).push([x, y, z, w, h, d]);
}
function deck(x0, z0, x1, z1, y, depth = .29) {
  floorAreas.push([x0, z0, x1, z1, y]);
  const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
  box(stone, x, y - .044 / 2, z, x1 - x0, .044, z1 - z0);
  box(plaster, x, y - .044 - (depth - .044) / 2, z, x1 - x0, depth - .044, z1 - z0);
}
function obstacle(x, z, w, d, y, h) {
  obstacles.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2, y, y + h]);
}

const [left, north, right, south] = plan.floor_limits;
function floor(y, raised) {
  if (!raised) {
    deck(left, north, right, south, y);
    return;
  }
  const [west, east] = plan.atria.map(a => a.bounds);
  deck(left, north, right, west[1], y);
  deck(left, west[3], right, south, y);
  deck(left, west[1], west[0], west[3], y);
  deck(west[2], west[1], east[0], east[3], y);
  deck(east[2], east[1], right, east[3], y);
}
function railing(x0, z0, x1, z1, y) {
  const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
  const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
  box(wood, x, y - .29, z, Math.max(w, .14), .73, Math.max(d, .14));
  box(steel, x, y + 1.06, z, Math.max(w, .058), .058, Math.max(d, .058));
  box(shadowGlass, x, y + .6, z, Math.max(w, .019), .9, Math.max(d, .019));
  obstacle(x, z, Math.max(w, .11), Math.max(d, .11), y, 1.14);
  for (let i = 0, count = Math.ceil(Math.max(w, d) / 1.8); i <= count; i++) {
    box(steel, x0 + (x1 - x0) * i / count, y + .56, z0 + (z1 - z0) * i / count, .038, 1.10, .038);
  }
}
function stairs(x0, z0, y0, y1) {
  const rises = 15, tread = .30, run = rises * tread, width = 1.44;
  const dz = .24 + width;
  const rise = (y1 - y0) / (rises * 2);
  for (let i = 0; i < rises; i++) {
    const ax = x0 + i * tread, bx = x0 + run - (i + 1) * tread;
    const ya = y0 + (i + 1) * rise, yb = y0 + (rises + i + 1) * rise;
    deck(ax, z0, ax + tread, z0 + width, ya, .19);
    deck(bx, z0 + dz, bx + tread, z0 + dz + width, yb, .19);
  }
  const flightHeight = rises * rise;
  for (const [z, meanY, sign] of [[z0, y0 + flightHeight / 2, 1],
                                  [z0 + dz + width, y0 + flightHeight * 1.5, -1]]) {
    const length = Math.hypot(run, flightHeight);
    const tilt = sign * Math.atan2(flightHeight, run);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(length, 1.08, .092), wood);
    panel.position.set(x0 + run / 2, meanY + .53, z);
    panel.rotation.z = tilt;
    panel.castShadow = true;
    panel.receiveShadow = true;
    scene.add(panel);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(length, .26, width), plaster);
    spine.position.set(x0 + run / 2, meanY - .15, z + sign * width / 2);
    spine.rotation.z = tilt;
    spine.castShadow = true;
    spine.receiveShadow = true;
    scene.add(spine);
  }
  deck(x0 + run, z0, x0 + run + 1.19, z0 + dz + width, y0 + rises * rise);
  box(wood, x0 + run + 1.19, y0 + rises * rise + .50, z0 + (dz + width) / 2, .092, 1.12, dz + width);
}

function couch(cx, cz, start) {
  const inner = 1.30, outer = 2.25, sweep = 3.12;
  const groups = [[inner, outer, .43, .04, red], [outer - .20, outer, .49, .44, red],
                  [outer, outer + .47, .08, .66, darkWood]];
  for (const [a, b, high, y, material] of groups) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, b, start, start + sweep, false);
    shape.lineTo(a * Math.cos(start + sweep), a * Math.sin(start + sweep));
    shape.absarc(0, 0, a, start + sweep, start, true);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: high, bevelEnabled: true, bevelSegments: 2, bevelSize: .035, bevelThickness: .035, curveSegments: 44,
    });
    // Work in the ground plane, retaining the soft edge of the actual benches.
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx, y, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  obstacle(cx, cz, 4.4, 4.4, 0, .95);
}

function shelf(x, z, y, index) {
  box(darkWood, x, y + .98, z, 2.25, 1.96, .045);
  for (const dx of [-1.105, 1.105]) box(darkWood, x + dx, y + .98, z, .049, 1.96, .53);
  obstacle(x, z, 2.25, .66, y, 2.05);
  for (let level = 0; level < 5; level++) {
    const base = y + .11 + level * .36;
    box(wood, x, base, z, 2.27, .041, .59);
    for (let j = 0; j < 13; j++) {
      const variety = (j * 73 + level * 29 + index * 31) % 109;
      const height = .20 + (variety % 11) * .011;
      const width = .076 + (variety % 7) * .011;
      for (const side of [-1, 1]) {
        box(paper[(variety + side + 1) % paper.length], x - .98 + j * .153,
            base + height / 2 + .018, z + .154 * side, width, height, .19);
      }
    }
  }
}

function coreWalls(y) {
  for (const center of [-25.8, 25.8]) {
    for (const z of [-4.2, 4.2]) {
      for (const direction of [-1, 1]) {
        const x = center + 4.7 * direction;
        box(plaster, x, y + 2.54, z, 6.1, 5.08, .27);
        obstacle(x, z, 6.1, .27, y, 5.08);
        box(wood, center + direction * 1.61, y + 1.20, z, .095, 2.4, .31);
      }
      box(plaster, center, y + 3.78, z, 3.3, 2.62, .27);
    }
    for (const x of [center - 7.75, center + 7.75]) {
      box(plaster, x, y + 2.54, 0, .27, 5.08, 8.4);
      obstacle(x, 0, .27, 8.4, y, 5.08);
      box(darkWood, x, y + .09, 0, .30, .16, 8.4);
    }
  }
}

function overheadSign(x, y, z, label) {
  const plate = document.createElement('canvas');
  plate.width = 512;
  plate.height = 104;
  const painter = plate.getContext('2d');
  painter.fillStyle = '#254962';
  painter.fillRect(0, 0, plate.width, plate.height);
  painter.fillStyle = '#fff';
  painter.font = '600 44px Microsoft YaHei, sans-serif';
  painter.fillText(label, 28, 68);
  const texture = new THREE.CanvasTexture(plate);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.47, .5),
    new THREE.MeshBasicMaterial({map: texture, side: THREE.DoubleSide}));
  sign.position.set(x, y, z);
  sign.rotation.y = Math.PI / 2;
  scene.add(sign);
}

function plant(x, z) {
  const ceramic = finish(0xaeaa98, .82);
  const stem = finish(0x65503a, .78);
  const leaves = [finish(0x35552a, .62), finish(0x436335, .61), finish(0x617841, .60)];
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.34, .255, .52, 20), ceramic);
  pot.position.set(x, .26, z);
  pot.receiveShadow = true;
  scene.add(pot);
  box(stem, x, 1.03, z, .065, 1.35, .065);
  const leafGeometry = new THREE.SphereGeometry(1, 8, 5);
  for (let i = 0; i < 33; i++) {
    const turn = i * 2.399;
    const reach = .22 + (i % 7) * .054;
    const leaf = new THREE.Mesh(leafGeometry, leaves[i % leaves.length]);
    leaf.position.set(x + Math.cos(turn) * reach, .74 + (i % 13) * .075, z + Math.sin(turn) * reach);
    leaf.scale.set(.22, .035, .08);
    leaf.rotation.set(.29 + (i % 4) * .17, -turn, .18);
    leaf.castShadow = true;
    scene.add(leaf);
  }
  obstacle(x, z, .68, .68, 0, 1.5);
}

const lobby = plan.entrance_lobby;
const lobbyY = lobby.floor_y - plan.levels[0].elevation;
const [northDoor, southDoor] = lobby.vestibule_planes_z;
function entranceHall() {
  const w = lobby.hall_half_width;
  deck(-w, -20.6, w, 20.6, lobbyY);
  deck(-7.3, northDoor, 7.3, -20.6, lobbyY);
  deck(-7.3, 20.6, 7.3, southDoor, lobbyY);
  for (const x of [-w, w]) {
    box(plaster, x, lobbyY + 3.35, 0, .31, 6.7, 41.2);
    obstacle(x, 0, .31, 41.2, lobbyY, 6.7);
    for (const z of [-15.4, -7.7, 0, 7.7, 15.4]) {
      box(wood, x * .991, lobbyY + 1.40, z, .085, 2.8, 3.9);
      box(luminous, x * .985, lobbyY + 3.0, z, .027, .063, 2.85);
    }
  }
  for (const [direction, door] of [[-1, northDoor], [1, southDoor]]) {
    for (const side of [-1, 1]) {
      box(plaster, side * 12.0, lobbyY + 3.1, direction * 20.6, 9.6, 6.2, .32);
      for (let x = 2.0; x <= 7.4; x += 1.07) {
        box(steel, x * side, lobbyY + 1.6, door, .048, 3.2, .065);
        if (x > 2.2) box(shadowGlass, (x - .535) * side, lobbyY + 1.57, door, 1.02, 3.08, .023);
      }
      const vestibuleDepth = Math.abs(door) - 20.6;
      box(shadowGlass, 7.3 * side, lobbyY + 1.63, direction * (20.6 + vestibuleDepth / 2),
          .055, 3.26, vestibuleDepth);
    }
  }
  for (const x of [-7.5, 7.5]) {
    for (const z of [-12.8, 12.8]) {
      box(wood, x, lobbyY + .52, z, 3.64, 1.04, .73);
      box(concrete, x, lobbyY + 1.08, z, 3.72, .085, .82);
      obstacle(x, z, 3.72, .82, lobbyY, 1.15);
    }
    for (const z of [-7.20, 7.20]) {
      box(plaster, x, lobbyY + 3.25, z, .64, 6.5, .64);
      box(concrete, x, lobbyY + .055, z, .70, .11, .70);
      obstacle(x, z, .66, .66, lobbyY, 6.5);
    }
    for (const z of [-1.8, 1.8]) {
      box(wood, x, lobbyY + .49, z, 3.60, .98, .77);
      box(concrete, x, lobbyY + 1.02, z, 3.74, .065, .86);
      box(steel, x + .91, lobbyY + 1.26, z, .45, .30, .035);
      box(steel, x - .91, lobbyY + 1.26, z, .45, .30, .035);
      obstacle(x, z, 3.72, .83, lobbyY, 1.31);
    }
  }
  for (const z of [-18.1, 18.1]) {
    for (const x of [-3.7, -2.10, 2.10, 3.7]) {
      box(steel, x, lobbyY + .51, z, .24, 1.02, 1.24);
      box(shadowGlass, x, lobbyY + .69, z + .3, .029, .44, .43);
      box(luminous, x, lobbyY + 1.03, z + .44, .058, .025, .07);
      obstacle(x, z, .25, 1.26, lobbyY, 1.04);
    }
  }
  overheadSign(10.35, lobbyY + 3.22, 0, '二层 · 服务大厅');
  for (const z of [-14, 0, 14]) {
    box(luminous, 0, lobbyY + 6.3, z, 10.8, .04, .08);
    const light = new THREE.PointLight(0xffecd0, 50, 18, 2);
    light.position.set(0, lobbyY + 4.4, z);
    scene.add(light);
  }
  box(plaster, 0, lobbyY + 6.5, 0, w * 2, .33, 41.4);
}
entranceHall();
function table(x, z, y) {
  box(wood, x, y + .741, z, 1.75, .065, .79);
  for (const dx of [-.73, .73]) for (const dz of [-.29, .29]) {
    box(steel, x + dx, y + .35, z + dz, .043, .72, .043);
  }
  obstacle(x, z, 1.82, 1.41, y, .82);
  for (const side of [-1, 1]) for (const dx of [-.48, .48]) {
    const cz = z + .64 * side;
    box(wood, x + dx, y + .43, cz, .42, .056, .43);
    box(wood, x + dx, y + .64, cz + .21 * side, .42, .38, .05);
    for (const ax of [-.16, .16]) for (const az of [-.16, .16]) {
      box(steel, x + dx + ax, y + .21, cz + az, .026, .42, .026);
    }
  }
}

groundY.forEach((y, level) => {
  floor(y, level !== 0);
  coreWalls(y);
  for (const z of [north, south]) {
    box(concrete, 0, y + .59, z, right - left, 1.18, .34);
    box(shadowGlass, 0, y + 2.46, z, right - left, 2.5, .077);
    for (let x = -84; x <= 84; x += 2.1) box(steel, x, y + 2.5, z, .073, 2.64, .097);
  }
  for (const x of [left, right]) box(plaster, x, y + 2.5, 0, .36, 5, south - north);
  for (let x = -84; x <= 84; x += 8.4) {
    for (const z of [-17.9, -10.8, 10.8, 17.9]) {
      box(plaster, x, y + 2.55, z, .50, 5.10, .5);
      obstacle(x, z, .5, .5, y, 5.1);
    }
  }
  for (let x = -79; x <= 79; x += 4.4) {
    for (const z of [-16.4, 16.4]) table(x, z, y);
    for (const z of [-8.0, 8.0]) shelf(x, z, y, Math.round(x * 1.5) + 200);
  }
  overheadSign(-42.1, y + 3.25, -.45, '西区 · 藏阅区');
  overheadSign(42.1, y + 3.25, .45, '东区 · 藏阅区');
});

const top = groundY.at(-1) + 4.32;
for (const a of plan.atria) {
  const [x0, z0, x1, z1] = a.bounds;
  const mid = (x0 + x1) / 2;
  const stepZ = z0 + .70;
  for (let level = 1; level < groundY.length; level++) {
    const y = groundY[level];
    railing(x0, z0, x1, z0, y);
    railing(x1, z0, x1, z1, y);
    railing(x0, z1, x1, z1, y);
    railing(x0, z0, x0, stepZ, y);
    railing(x0, stepZ + 3.12, x0, z1, y);
    stairs(x0, stepZ, groundY[level - 1], y);
  }
  couch(mid + 3.9, -.1, Math.PI * .42);
  couch(mid + .45, 3.7, Math.PI * 1.36);
  plant(mid + 5.7, -4.55);
  plant(mid - 4.5, 4.8);
  const lightW = 1.62, lightD = 4.66;
  const atlas = Array.from({length: 4}, (_, index) => mid - 5.5 + index * (11 / 3));
  let head = x0;
  for (const x of atlas) {
    box(plaster, (head + x - lightW / 2) / 2, top, 0, x - lightW / 2 - head, .28, z1 - z0);
    head = x + lightW / 2;
    box(wood, x, top + .25, -(lightD + .07) / 2, lightW + .18, .72, .12);
    box(wood, x, top + .25, (lightD + .07) / 2, lightW + .18, .72, .12);
    for (const side of [-1, 1]) {
      box(wood, x + side * (lightW + .08) / 2, top + .25, 0, .10, .72, lightD);
      box(plaster, x, top, side * (lightD / 2 + (z1 - z0 - lightD) / 4),
          lightW, .28, (z1 - z0 - lightD) / 2);
    }
    box(sky, x, top + .67, 0, lightW, .08, lightD);
  }
  box(plaster, (head + x1) / 2, top, 0, x1 - head, .28, z1 - z0);
  for (let x = x0 + 1.75; x < x1; x += 2.47) {
    for (const z of [-2.81, 2.81]) box(luminous, x, top - .156, z, .096, .035, .096);
  }
  for (const y of groundY) {
    for (const sign of [-1, 1]) {
      for (const x of [mid - 5.8, mid - 2, mid + 2, mid + 5.8]) {
        box(luminous, x, y + 4.14, sign * 5.1, 1.20, .035, .08);
      }
    }
  }
  const light = new THREE.PointLight(0xffefd1, 140, 25, 2);
  light.position.set(mid, 9.4, 0);
  scene.add(light);
}
box(plaster, 0, top, -12.10, right - left, .35, 17);
box(plaster, 0, top, 12.10, right - left, .35, 17);
for (const [x0, x1] of [[left, -67.2], [-50.4, 50.4], [67.2, right]]) {
  box(plaster, (x0 + x1) / 2, top, 0, x1 - x0, .35, 7.2);
}

const cube = new THREE.BoxGeometry(1, 1, 1);
const dummy = new THREE.Object3D();
for (const [material, entries] of boxes) {
  const mesh = new THREE.InstancedMesh(cube, material, entries.length);
  entries.forEach(([x, y, z, w, h, d], index) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.castShadow = material !== sky && !material.transparent;
  mesh.receiveShadow = !material.transparent;
  scene.add(mesh);
}

const player = {x: 0, z: 0, y: 0, yaw: 0, pitch: 0};
const views = {
  southDoor: [0, southDoor - .9, lobbyY, 0, 0],
  northDoor: [0, northDoor + .9, lobbyY, Math.PI, 0],
  west: [-51.4, .62, 0, 1.50, .23],
  west4: [-57, -5.4, groundY[1], 2.93, -.10],
  west5: [-61, 5.45, groundY[2], -.14, -.18],
  east: [66.2, .62, 0, 1.50, .23],
  westStair: [-67.54, -2.18, 0, -Math.PI / 2, 0],
};
const eye = 1.64;
const held = new Set();
const status = document.querySelector('#position');
const rotation = new THREE.Vector3();
function faceCamera() {
  camera.position.set(player.x, player.y + eye, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
}
function setView(id) {
  const [x, z, y, yaw, pitch] = views[id] ?? views.west;
  Object.assign(player, {x, z, y, yaw, pitch});
  faceCamera();
}
function traverse(x, z) {
  const levels = floorAreas.filter(([a, b, c, d, h]) =>
    x >= a && x <= c && z >= b && z <= d && h - player.y <= .32 && h - player.y >= -.34);
  const z0 = player.y < -1 ? northDoor : north;
  const z1 = player.y < -1 ? southDoor : south;
  if (!levels.length || x - left < .39 || right - x < .39 || z - z0 < .39 || z1 - z < .39) return false;
  const y = Math.max(...levels.map(f => f[4]));
  if (obstacles.some(([a, b, c, d, lo, hi]) =>
    y + eye > lo + .04 && y < hi - .04 && x > a - .18 && x < c + .18 && z > b - .18 && z < d + .18)) return false;
  Object.assign(player, {x, z, y});
  return true;
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('blur', () => held.clear());
document.addEventListener('keydown', event => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
    held.add(event.code);
    event.preventDefault();
  }
});
document.addEventListener('keyup', event => held.delete(event.code));
let dragging = false;
host.addEventListener('pointerdown', () => { dragging = true; });
document.addEventListener('pointerup', () => { dragging = false; });
document.addEventListener('pointermove', event => {
  if (!dragging && document.pointerLockElement !== renderer.domElement) return;
  player.yaw -= event.movementX * .0031;
  player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * .0031, -1.25, 1.25);
});
document.querySelector('#mouse').addEventListener('click', () => renderer.domElement.requestPointerLock());
document.querySelector('#view').addEventListener('change', event => setView(event.target.value));
const requested = new URLSearchParams(location.search).get('view');
document.querySelector('#view').value = views[requested] ? requested : 'west';
setView(requested);
resize();
let last = performance.now(), lastLabel = 0;
renderer.setAnimationLoop(now => {
  const dt = Math.min(.04, (now - last) / 1000);
  last = now;
  const a = Number(held.has('KeyD')) - Number(held.has('KeyA'));
  const b = Number(held.has('KeyW')) - Number(held.has('KeyS'));
  if (a || b) {
    const speed = held.has('ShiftLeft') || held.has('ShiftRight') ? 4.1 : 2.25;
    rotation.set(a, 0, -b).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, player.yaw).multiplyScalar(dt * speed);
    if (!traverse(player.x + rotation.x, player.z + rotation.z)) {
      traverse(player.x, player.z + rotation.z);
      traverse(player.x + rotation.x, player.z);
    }
  }
  faceCamera();
  if (now - lastLabel > 100) {
    lastLabel = now;
    status.value = `X ${player.x.toFixed(2)} · Z ${player.z.toFixed(2)} · 标高 ${(player.y + plan.levels[0].elevation).toFixed(2)} m`;
  }
  renderer.render(scene, camera);
});
