(function () {
  'use strict';

  var canvas = document.getElementById('balloonScene');
  var toggle = document.getElementById('balloonToggle');
  if (!canvas || typeof window.THREE === 'undefined') return;

  var THREE = window.THREE;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Pinkies palette: pastel, light, medium, deep + glass tint per family.
  var FAMILIES = [
    { weight: 0.42, roles: ['#FFE3EF', '#FFB0D2', '#FF5FA6', '#FF2D8B'], glass: '#FF8FC1' },
    { weight: 0.30, roles: ['#E8F7FF', '#B8E4FF', '#6EC6FF', '#2E9BE6'], glass: '#8FD3FF' },
    { weight: 0.28, roles: ['#FFFFFF', '#FFFFFF', '#F3F6FA', '#E2E9F1'], glass: '#F2F7FF' }
  ];

  var OBSTACLE_SELECTOR = [
    '.announce', '.site-header', '.booking-panel',
    '.attraction-card', '.benefits-strip', '.section-heading', '.tees-section h2',
    '.attractions-section h2', '.shop-filter', '.product-card',
    '.story-copy h2', '.story-copy p', '.story-copy .button',
    '.footer-brand', '.footer-links h3', '.footer-links a', '.footer-note', '.footer-bottom span',
    '.balloon-toggle'
  ].join(',');

  // For these only the glyph lines block balloons; the surrounding background stays free to fill.
  var TEXT_SELECTOR = [
    '.section-heading', '.tees-section h2', '.attractions-section h2',
    '.story-copy h2', '.story-copy p',
    '.footer-brand', '.footer-links h3', '.footer-links a', '.footer-note', '.footer-bottom span'
  ].join(',');
  var textRange = document.createRange();

  // Two signature balloons settle behind the "PLAY WELL." doodle, in the spots marked by .story-bubble.
  var ANCHORS = [
    { selector: '.bubble-one', color: '#FF5FA6', freeRadius: 0.85 },
    { selector: '.bubble-two', color: '#6EC6FF', freeRadius: 0.6 }
  ];

  var STEP = 1 / 60;
  var CAM_Z = 11;
  var FOV = 38;
  var Z_BOUND = 1.6;
  var SIZE_BOOST = 1.15;

  var renderer, scene, camera, keyLight, geometry;
  var groups = [];
  var balls = [];
  var obstacles = [];
  var obstacleEls = [];
  var W = 0, H = 0, vw = 1, vh = 1, offX = 0, bandPullY = 1.85;
  var pockets = [];
  var running = false, enabled = false, paused = false, rafId = 0;
  var lastTime = 0, acc = 0, startTime = 0, simTime = 0;
  var lastScrollY = window.scrollY;
  var obstacleClock = 0, clusterClock = 0;
  var center = new THREE.Vector3(0, 0, 0);
  var targetCenter = new THREE.Vector3(0, 0, 0);
  var mouse = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, active: false, down: false, strength: 0 };
  var tmpMatrix = new THREE.Matrix4();
  var tmpQuat = new THREE.Quaternion();
  var tmpPos = new THREE.Vector3();
  var tmpScale = new THREE.Vector3();

  function smoothstep(a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { t = Math.min(1, Math.max(0, t)); return 1 - Math.pow(1 - t, 3); }

  function ballCount() {
    return window.innerWidth < 768 ? 60 : 84;
  }

  function pickFamily() {
    var r = Math.random(), sum = 0;
    for (var i = 0; i < FAMILIES.length; i++) {
      sum += FAMILIES[i].weight;
      if (r <= sum) return i;
    }
    return FAMILIES.length - 1;
  }

  function pickRadius() {
    var r = Math.random();
    var base = r < 0.3 ? lerp(0.27, 0.39, Math.random()) : r < 0.8 ? lerp(0.42, 0.6, Math.random()) : lerp(0.66, 0.87, Math.random());
    return base * SIZE_BOOST * (window.innerWidth < 768 ? 0.5 : 1);
  }

  function makeMaterial(color, glass) {
    var c = new THREE.Color(color);
    if (glass) {
      return new THREE.MeshPhysicalMaterial({
        color: c, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
        transmission: 0.95, ior: 1.485, thickness: 2.2, specularColor: new THREE.Color('#ffffff'),
        specularIntensity: 1, attenuationColor: c, attenuationDistance: 1,
        emissive: c, emissiveIntensity: 0.12, transparent: true
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: c, roughness: 0.44, metalness: 0, clearcoat: 0.24, clearcoatRoughness: 0.35,
      emissive: c, emissiveIntensity: 0.08
    });
  }

  function viewSize() {
    vh = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    vw = vh * (W / Math.max(1, H));
    // On phones the world continues past the screen edges, so balloons can slip out sideways around cards and drift back.
    offX = W < 700 ? vw * 0.4 : 0;
  }

  function setupRenderer() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    camera.position.set(0, 0, CAM_Z);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xffb0d2, 1.6));

    keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(-6, 10, 8);
    keyLight.castShadow = true;
    var size = window.innerWidth < 768 ? 1024 : 2048;
    keyLight.shadow.mapSize.set(size, size);
    var sc = keyLight.shadow.camera;
    sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 0.5; sc.far = 30;
    keyLight.shadow.bias = -0.0003;
    keyLight.shadow.radius = 12;
    scene.add(keyLight);

    var rim = new THREE.DirectionalLight(0xffffff, 1.25); rim.position.set(8, 7, -8); scene.add(rim);
    var front = new THREE.DirectionalLight(0xffffff, 0.4); front.position.set(0, 0, 11); scene.add(front);
    var side = new THREE.DirectionalLight(0xffffff, 0.3); side.position.set(-9, -2, 4); scene.add(side);

    geometry = new THREE.SphereGeometry(1, 40, 32);
  }

  function disposeBalls() {
    groups.forEach(function (g) {
      scene.remove(g.mesh);
      g.mesh.material.dispose();
      g.mesh.dispose();
    });
    groups = [];
    balls = [];
  }

  function buildBalls() {
    disposeBalls();
    var n = ballCount();
    var buckets = {};
    for (var i = 0; i < n; i++) {
      var fam = pickFamily();
      var glass = Math.random() < 0.22;
      var role = Math.random();
      var roleIndex = role < 0.25 ? 0 : role < 0.55 ? 1 : role < 0.85 ? 2 : 3;
      var key = fam + (glass ? 'g' : 's' + roleIndex);
      var color = glass ? FAMILIES[fam].glass : FAMILIES[fam].roles[roleIndex];
      if (!buckets[key]) buckets[key] = { color: color, glass: glass, list: [] };
      var r = pickRadius();
      var b = { id: i, r: r, mass: r * r * r, scale: r, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, group: null, index: 0 };
      buckets[key].list.push(b);
      balls.push(b);
    }
    ANCHORS.forEach(function (a, ai) {
      var el = document.querySelector(a.selector);
      if (!el) return;
      var fr = a.freeRadius * SIZE_BOOST * (window.innerWidth < 768 ? 0.5 : 1);
      var ab = { id: n + ai, r: fr, freeR: fr, mass: fr * fr * fr, scale: fr, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, group: null, index: 0, anchorEl: el, anchored: false, ax: 0, ay: 0 };
      buckets['anchor' + ai] = { color: a.color, glass: false, list: [ab] };
      balls.push(ab);
    });
    Object.keys(buckets).forEach(function (key) {
      var bucket = buckets[key];
      var mesh = new THREE.InstancedMesh(geometry, makeMaterial(bucket.color, bucket.glass), bucket.list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      var group = { mesh: mesh, list: bucket.list };
      bucket.list.forEach(function (b, idx) { b.group = group; b.index = idx; });
      groups.push(group);
      scene.add(mesh);
    });
    scatterFar();
  }

  function scatterFar() {
    var far = 1.5 * Math.max(vw, vh);
    balls.forEach(function (b) {
      var a = Math.random() * Math.PI * 2;
      var d = far * (0.8 + Math.random() * 0.5);
      b.x = Math.cos(a) * d;
      b.y = Math.sin(a) * d;
      b.z = (Math.random() * 2 - 1) * Z_BOUND;
      var speed = 0.08 + Math.random() * 0.05;
      b.vx = -Math.cos(a) * speed;
      b.vy = -Math.sin(a) * speed;
      b.vz = 0;
      b.scale = b.r;
    });
    startTime = simTime;
  }

  function toWorldX(px) { return (px / W - 0.5) * vw; }
  function toWorldY(py) { return (0.5 - py / H) * vh; }

  function refreshObstacles() {
    obstacles = [];
    var pad = 0.06;
    for (var i = 0; i < obstacleEls.length; i++) {
      var el = obstacleEls[i];
      var rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || rect.bottom < -40 || rect.top > H + 40 || rect.right < 0 || rect.left > W) continue;
      if (el.closest('[hidden]')) continue;
      var soft = !!el.closest('.site-footer');
      if (el.matches(TEXT_SELECTOR)) {
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        var rects = [], node;
        while ((node = walker.nextNode())) {
          if (!/\S/.test(node.nodeValue)) continue;
          textRange.selectNodeContents(node);
          Array.prototype.push.apply(rects, textRange.getClientRects());
        }
        el.querySelectorAll('img,svg').forEach(function (m) { rects.push(m.getBoundingClientRect()); });
        for (var j = 0; j < rects.length; j++) {
          var ln = rects[j];
          if (ln.width < 2 || ln.height < 2) continue;
          obstacles.push({ l: toWorldX(ln.left) - pad, r: toWorldX(ln.right) + pad, t: toWorldY(ln.top) + pad, b: toWorldY(ln.bottom) - pad, soft: soft });
        }
        continue;
      }
      // Edges that touch the viewport are extended far outside it, so balloons are always pushed back into view.
      var cw = document.documentElement.clientWidth || W;
      var wide = rect.width >= cw * 0.9;
      obstacles.push({
        l: !offX && (wide || rect.left <= 2) ? -vw : toWorldX(rect.left) - pad,
        r: !offX && (wide || rect.right >= cw - 2) ? vw : toWorldX(rect.right) + pad,
        t: rect.top <= 2 || (wide && rect.bottom < H * 0.3) ? vh : toWorldY(rect.top) + pad,
        b: rect.bottom >= H - 2 || (wide && rect.top > H * 0.7) ? -vh : toWorldY(rect.bottom) - pad,
        // Footer text still blocks balloons, but doesn't repel the band, so they spill into the footer's white space.
        soft: soft
      });
    }
    refreshAnchors();
  }

  function refreshAnchors() {
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.anchorEl) continue;
      var rect = b.anchorEl.getBoundingClientRect();
      var onScreen = rect.width > 2 && rect.bottom > H * 0.05 && rect.top < H * 0.95;
      if (onScreen) {
        // Kept at the front of the 3D band so the rest of the cluster gathers behind; sizes are perspective-corrected.
        var ps = CAM_Z / (CAM_Z - Z_BOUND);
        var nx = toWorldX(rect.left + rect.width / 2) / ps, ny = toWorldY(rect.top + rect.height / 2) / ps;
        // Move with the page while scrolling so the balloon stays glued behind the doodle.
        if (b.anchored && onScreen) { b.x += nx - b.ax; b.y += ny - b.ay; }
        b.ax = nx; b.ay = ny;
        b.r = rect.width / 2 / W * vw / ps;
      } else {
        b.r = b.freeR;
      }
      b.anchored = onScreen;
      b.mass = b.r * b.r * b.r * (b.anchored ? 4 : 1);
    }
  }

  // Picks the horizontal strip with the most free space so the balloon band lies where nothing covers it.
  function bandScore(y) {
    var free = 0, cols = 16;
    for (var ix = 0; ix <= cols; ix++) {
      var x = -vw / 2 + vw * ix / cols;
      free += Math.min(1, Math.max(0, clearance(x, y) / 0.9));
    }
    return free / (cols + 1) - Math.abs(y) / vh * 0.25;
  }

  function updateClusterCenter() {
    var footer = document.querySelector('.site-footer');
    var fr = footer && footer.getBoundingClientRect();
    if (fr && fr.top < H * 0.75 && fr.bottom > H * 0.5) {
      // Near the end of the page the cluster settles into the footer and spreads out to fill its white space.
      var top = Math.max(fr.top, 0), bottom = Math.min(fr.bottom, H);
      targetCenter.set(0, toWorldY((top + bottom) / 2), 0);
      bandPullY = 0.55;
      updatePockets(false);
      return;
    }
    bandPullY = 1.85;
    updatePockets(!!offX);
    var marginY = vh * 0.16, rows = 14;
    var bestY = 0, bestScore = -Infinity;
    for (var iy = 0; iy <= rows; iy++) {
      var y = -vh / 2 + marginY + (vh - 2 * marginY) * iy / rows;
      var s = bandScore(y);
      if (s > bestScore) { bestScore = s; bestY = y; }
    }
    if (bestScore > bandScore(targetCenter.y) + 0.08) targetCenter.set(0, bestY, 0);
  }

  // Widest horizontal gap at height y once the (non-footer) obstacles are cut out of the screen width.
  function freeSpan(y) {
    var cuts = [];
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.soft || y > o.t || y < o.b) continue;
      cuts.push(o);
    }
    cuts.sort(function (a, c) { return a.l - c.l; });
    var x = -vw / 2, edge = vw / 2, l = 0, r = 0;
    for (var j = 0; j < cuts.length; j++) {
      var end = Math.min(cuts[j].l, edge);
      if (end - x > r - l) { l = x; r = end; }
      x = Math.max(x, cuts[j].r);
    }
    if (edge - x > r - l) { l = x; r = edge; }
    return { l: l, r: r, blocked: cuts.length > 0 };
  }

  // Phones: finds the empty "pockets" beside headings and buttons (e.g. right of a short title) that the band never reaches.
  function findPockets() {
    var found = [], run = null, rows = 64, minW = vw * 0.22, minH = vh * 0.045;
    function close() {
      if (run && run.t - run.b >= minH) found.push(run);
      run = null;
    }
    for (var iy = 0; iy <= rows; iy++) {
      var y = vh / 2 - vh * iy / rows;
      var g = freeSpan(y), w = g.r - g.l;
      if (!g.blocked) {
        // Short line gaps inside a heading keep the pocket going; a long free stretch is band territory.
        if (run && ++run.gaps > 2) close();
        continue;
      }
      if (w >= minW && run && Math.min(run.r, g.r) - Math.max(run.l, g.l) >= minW) {
        run.l = Math.max(run.l, g.l); run.r = Math.min(run.r, g.r); run.b = y; run.gaps = 0;
      } else {
        close();
        if (w >= minW && w < vw * 0.9) run = { l: g.l, r: g.r, t: y, b: y, gaps: 0 };
      }
    }
    close();
    return found;
  }

  function updatePockets(enabled) {
    var sy = window.scrollY, px = H / vh;
    var next = (enabled ? findPockets() : []).map(function (p) {
      var half = vh / 64 / 2;
      return {
        // Pockets that reach the screen edge continue past it, so balloons can peek in from outside.
        l: p.l <= -vw / 2 + 0.01 ? p.l - vw * 0.08 : p.l,
        r: p.r >= vw / 2 - 0.01 ? p.r + vw * 0.08 : p.r,
        top: (0.5 - (p.t + half) / vh) * H + sy,
        bottom: (0.5 - (p.b - half) / vh) * H + sy,
        fill: 0, cap: 0
      };
    });
    next.forEach(function (p) { p.cap = (p.r - p.l) * (p.bottom - p.top) / px * 0.55; });
    function projR(b) { return b.scale * CAM_Z / (CAM_Z - b.z); }
    function fits(b, p) { return 2 * projR(b) <= Math.min((p.bottom - p.top) / px * 1.2, p.r - p.l); }
    var limit = Math.floor(balls.length * 0.45), used = 0;
    // Balloons already in a pocket stay with it while it's still on screen, so nothing reshuffles mid-scroll.
    balls.forEach(function (b) {
      var old = b.pocket;
      b.pocket = null;
      if (!old || b.anchored) return;
      for (var i = 0; i < next.length; i++) {
        var p = next[i];
        if (p.fill < p.cap && used < limit && fits(b, p) && p.top < old.bottom && p.bottom > old.top && p.l < old.r && p.r > old.l) {
          b.pocket = p; p.fill += Math.PI * projR(b) * projR(b); used++;
          break;
        }
      }
    });
    next.forEach(function (p) {
      var cx = (p.l + p.r) / 2, cy = toWorldY((p.top + p.bottom) / 2 - sy);
      var cand = balls.filter(function (b) { return !b.pocket && !b.anchored && fits(b, p); });
      cand.sort(function (a, c) {
        var sa = CAM_Z / (CAM_Z - a.z), sc = CAM_Z / (CAM_Z - c.z);
        return Math.hypot(a.x * sa - cx, a.y * sa - cy) - Math.hypot(c.x * sc - cx, c.y * sc - cy);
      });
      for (var i = 0; i < cand.length && p.fill < p.cap && used < limit; i++) {
        cand[i].pocket = p; p.fill += Math.PI * projR(cand[i]) * projR(cand[i]); used++;
      }
    });
    pockets = next;
  }

  function clearance(x, y) {
    var c = Infinity;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.soft) continue;
      var dx = Math.max(o.l - x, 0, x - o.r);
      var dy = Math.max(o.b - y, 0, y - o.t);
      var d = (dx === 0 && dy === 0) ? -Math.min(x - o.l, o.r - x, y - o.b, o.t - y) : Math.hypot(dx, dy);
      if (d < c) c = d;
    }
    return c;
  }

  // Pushes a ball out of DOM rectangles, using its on-screen (perspective) position and size.
  function resolveObstacles(b, strength) {
    var s = CAM_Z / (CAM_Z - b.z);
    var px = b.x * s, py = b.y * s, R = b.scale * s;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var cx = Math.min(Math.max(px, o.l), o.r);
      var cy = Math.min(Math.max(py, o.b), o.t);
      var dx = px - cx, dy = py - cy;
      var d2 = dx * dx + dy * dy;
      var nx, ny, pen;
      if (d2 > 1e-10) {
        if (d2 >= R * R) continue;
        var d = Math.sqrt(d2);
        nx = dx / d; ny = dy / d; pen = R - d;
      } else {
        var dl = px - o.l, dr = o.r - px, dt = o.t - py, db = py - o.b;
        var m = Math.min(dl, dr, dt, db);
        if (m === dl) { nx = -1; ny = 0; } else if (m === dr) { nx = 1; ny = 0; } else if (m === dt) { nx = 0; ny = 1; } else { nx = 0; ny = -1; }
        pen = m + R;
      }
      var move = pen * strength / s;
      b.x += nx * move;
      b.y += ny * move;
      if (offX && ny !== 0 && !o.soft) {
        // On phones a balloon pressed against a card's top/bottom slides off to the nearest side and flows around it.
        var side = px < (o.l + o.r) / 2 ? -1 : 1;
        b.vx += side * Math.min(pen, 0.06) * 0.5 / s;
      }
      var vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= nx * vn * 1.15;
        b.vy -= ny * vn * 1.15;
      }
      px = b.x * s; py = b.y * s;
    }
  }

  function step() {
    simTime += STEP;
    var t = simTime;
    var entranceT = easeOutCubic((t - startTime) / 2.2);
    var boost = lerp(7.5, 1, entranceT);

    center.x += (targetCenter.x - center.x) * 0.03;
    center.y += (targetCenter.y - center.y) * 0.03;

    // The cursor is a big invisible balloon that glides smoothly instead of jumping.
    var mpx = mouse.x, mpy = mouse.y;
    mouse.x += (mouse.tx - mouse.x) * 0.16;
    mouse.y += (mouse.ty - mouse.y) * 0.16;
    // Cap how fast the invisible balloon can travel so a flick sweeps the cluster instead of teleporting it.
    var mvMax = 0.14, mvx = mouse.x - mpx, mvy = mouse.y - mpy, mvLen = Math.hypot(mvx, mvy);
    if (mvLen > mvMax) { mvx *= mvMax / mvLen; mvy *= mvMax / mvLen; mouse.x = mpx + mvx; mouse.y = mpy + mvy; }
    mouse.vx = mvx; mouse.vy = mvy;
    mouse.strength = lerp(mouse.strength, mouse.active ? 1 : 0, 0.06);
    var mouseCore = Math.min(vw, vh) * (window.innerWidth < 768 ? 0.13 : 0.19) * (mouse.down ? 1.3 : 1) * mouse.strength;
    var mouseField = mouseCore * 0.45;

    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      b.vx += Math.sin(t * 0.4 + b.id * 1.5) * 0.0004 * b.r;
      b.vy += Math.cos(t * 0.5 + b.id * 1.2) * 0.0004 * b.r;
      b.vz += Math.sin(t * 0.35 + b.id) * 0.0001;

      var k = 0.006 * boost;
      if (b.pocket && !b.anchored) {
        // Box-shaped pull: firm until the balloon is inside its pocket, then only a light drift to the middle so it fills evenly.
        var pk = b.pocket, ps2 = CAM_Z / (CAM_Z - b.z);
        var qx = b.x * ps2, qy = b.y * ps2;
        var pt = toWorldY(pk.top - lastScrollY), pb = toWorldY(pk.bottom - lastScrollY);
        var ox2 = Math.max(pk.l - qx, 0) - Math.max(qx - pk.r, 0);
        var oy2 = Math.max(pb - qy, 0) - Math.max(qy - pt, 0);
        b.vx += (ox2 * 1.6 + ((pk.l + pk.r) / 2 - qx) * 0.25) * k / ps2;
        b.vy += (oy2 * 2.2 + ((pt + pb) / 2 - qy) * 0.4) * k / ps2;
        b.vz += (center.z - b.z) * k * 1.8;
      } else if (b.anchored) {
        // Springs to its spot behind the doodle, at the front of the band.
        b.vx += (b.ax - b.x) * 0.012;
        b.vy += (b.ay - b.y) * 0.012;
        b.vz += (Z_BOUND - b.z) * 0.02;
      } else {
        // Gentle horizontal / firm vertical pull keeps the balloons packed in a band across the free area.
        b.vx += (center.x - b.x) * k * 0.45;
        // Balloons that wandered off-screen are drawn back in a little faster.
        if (Math.abs(b.x) > vw / 2) b.vx += (center.x - b.x) * k * 0.8;
        b.vy += (center.y - b.y) * k * bandPullY;
        b.vz += (center.z - b.z) * k * 1.8;
      }

      var damp = 0.91;
      if (mouseCore > 0.01) {
        // Thin soft cushion around the solid cursor-balloon: neighbours ease off before touching it.
        var s = CAM_Z / (CAM_Z - b.z);
        var dx = b.x * s - mouse.x, dy = b.y * s - mouse.y;
        var dist = Math.hypot(dx, dy) || 0.0001;
        var contact = mouseCore + b.scale * s;
        if (dist < contact + mouseField) {
          var sf = 1 - smoothstep(contact, contact + mouseField, dist);
          var push = sf * 0.012;
          b.vx += dx / dist * push / s;
          b.vy += dy / dist * push / s;
          damp = lerp(0.91, 0.84, sf);
        }
      }

      b.vx *= damp; b.vy *= damp; b.vz *= damp;
      var ox = b.x, oy = b.y;
      b.x += b.vx; b.y += b.vy; b.z += b.vz;
      b.scale += (b.r - b.scale) * (b.anchorEl ? 0.05 : 0.12);
      b.dx = b.x - ox; b.dy = b.y - oy;
    }

    for (var it = 0; it < 4; it++) {
      for (var a = 0; a < balls.length; a++) {
        var p = balls[a];
        for (var c = a + 1; c < balls.length; c++) {
          var q = balls[c];
          var ex = q.x - p.x, ey = q.y - p.y, ez = q.z - p.z;
          var minD = p.scale + q.scale;
          var d2 = ex * ex + ey * ey + ez * ez;
          if (it === 0 && d2 >= minD * minD && d2 < minD * minD * 2.6) {
            // Short-range magnet: neighbours drift together so the cluster stays tightly packed.
            var dd = Math.sqrt(d2);
            var pull = (dd - minD) * 0.0016 / dd;
            var pm = p.anchored ? 0 : q.anchored ? 1 : q.mass / (p.mass + q.mass);
            var qm = q.anchored ? 0 : p.anchored ? 1 : 1 - pm;
            p.vx += ex * pull * pm; p.vy += ey * pull * pm; p.vz += ez * pull * pm;
            q.vx -= ex * pull * qm; q.vy -= ey * pull * qm; q.vz -= ez * pull * qm;
            continue;
          }
          if (d2 >= minD * minD || d2 < 1e-10) continue;
          var d = Math.sqrt(d2);
          var nx = ex / d, ny = ey / d, nz = ez / d;
          var overlap = (minD - d) * 0.28;
          // Anchored balloons are immovable: the rest of the cluster flows around them.
          var ip = p.anchored ? 0 : 1 / p.mass, iq = q.anchored ? 0 : 1 / q.mass;
          if (ip + iq === 0) continue;
          var pr = ip / (ip + iq), qr = iq / (ip + iq);
          p.x -= nx * overlap * pr; p.y -= ny * overlap * pr; p.z -= nz * overlap * pr;
          q.x += nx * overlap * qr; q.y += ny * overlap * qr; q.z += nz * overlap * qr;
          var rv = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny + (q.vz - p.vz) * nz;
          if (rv < 0) {
            var j = -(1.02) * rv / (ip + iq);
            p.vx -= j * nx * ip; p.vy -= j * ny * ip; p.vz -= j * nz * ip;
            q.vx += j * nx * iq; q.vy += j * ny * iq; q.vz += j * nz * iq;
          }
        }
      }
      for (var o = 0; o < balls.length; o++) {
        var ball = balls[o];
        resolveObstacles(ball, 0.6);
        if (mouseCore > 0.01) {
          // The cursor is a solid balloon of infinite mass: overlap is resolved softly and only the
          // velocity heading into it is cancelled, so balloons slide around it instead of bouncing off.
          var ms = CAM_Z / (CAM_Z - ball.z);
          var mx = ball.x * ms - mouse.x, my = ball.y * ms - mouse.y;
          var md = Math.hypot(mx, my) || 0.0001;
          var minM = mouseCore + ball.scale * ms;
          if (md < minM) {
            var mnx = mx / md, mny = my / md;
            var mv = (minM - md) * 0.3 / ms;
            ball.x += mnx * mv;
            ball.y += mny * mv;
            var rvn = (ball.vx - mouse.vx / ms) * mnx + (ball.vy - mouse.vy / ms) * mny;
            if (rvn < 0) { ball.vx -= mnx * rvn; ball.vy -= mny * rvn; }
          }
        }
      }
    }

    for (var e = 0; e < balls.length; e++) {
      var bb = balls[e];
      var xb = vw / 2 + bb.r + offX;
      if (bb.x > xb) { bb.x = xb; bb.vx *= -0.3; }
      if (bb.x < -xb) { bb.x = -xb; bb.vx *= -0.3; }
      var yb = vh / 2 + bb.r;
      if (bb.y > yb) { bb.y = yb; bb.vy *= -0.3; }
      if (bb.y < -yb) { bb.y = -yb; bb.vy *= -0.3; }
      if (bb.z > Z_BOUND) { bb.z = Z_BOUND; bb.vz *= -0.3; }
      if (bb.z < -Z_BOUND) { bb.z = -Z_BOUND; bb.vz *= -0.3; }
    }
  }

  function syncMeshes() {
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      for (var i = 0; i < group.list.length; i++) {
        var b = group.list[i];
        tmpPos.set(b.x, b.y, b.z);
        tmpScale.set(b.scale, b.scale, b.scale);
        tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
        group.mesh.setMatrixAt(i, tmpMatrix);
      }
      group.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - lastTime) / 1000 || 0);
    lastTime = now;

    var sy = window.scrollY;
    var scrollDelta = sy - lastScrollY;
    lastScrollY = sy;
    if (scrollDelta) {
      // Content slides under the balloons while scrolling; give them a playful nudge.
      var kick = Math.max(-0.25, Math.min(0.25, scrollDelta / H * vh * 0.06));
      balls.forEach(function (b) { b.vy += kick * (0.6 + (b.id % 5) * 0.12); });
    }

    obstacleClock -= dt;
    if (scrollDelta || obstacleClock <= 0) { refreshObstacles(); obstacleClock = 0.25; }
    clusterClock -= dt;
    if (clusterClock <= 0) { updateClusterCenter(); clusterClock = 0.3; }

    acc += dt;
    var steps = 0;
    while (acc >= STEP && steps < 4) { step(); acc -= STEP; steps++; }
    if (steps === 4) acc = 0;

    syncMeshes();
    renderer.render(scene, camera);
  }

  function start() {
    if (running || !enabled || paused || document.hidden) return;
    running = true;
    lastTime = performance.now();
    lastScrollY = window.scrollY;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function resize() {
    W = document.documentElement.clientWidth || window.innerWidth;
    H = document.documentElement.clientHeight || window.innerHeight;
    viewSize();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    camera.aspect = W / Math.max(1, H);
    camera.updateProjectionMatrix();
    refreshObstacles();
    if (balls.length !== ballCount()) buildBalls();
    updateClusterCenter();
    center.copy(targetCenter);
  }

  function setPointer(clientX, clientY) {
    mouse.tx = toWorldX(clientX);
    mouse.ty = toWorldY(clientY);
    if (!mouse.active && mouse.strength < 0.05) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
    mouse.active = true;
  }

  function releasePointer() {
    mouse.active = false;
    mouse.down = false;
  }

  function bindInput() {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      setPointer(e.clientX, e.clientY);
    }, { passive: true });
    window.addEventListener('mousedown', function () { mouse.down = true; });
    window.addEventListener('mouseup', function () { mouse.down = false; });
    window.addEventListener('blur', releasePointer);
    document.documentElement.addEventListener('mouseleave', releasePointer);
    window.addEventListener('touchstart', function (e) {
      if (e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', function (e) {
      if (e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchend', releasePointer, { passive: true });
    window.addEventListener('touchcancel', releasePointer, { passive: true });
    window.addEventListener('resize', function () { if (renderer) resize(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
  }

  function setVisible(on) {
    canvas.hidden = !on;
    if (toggle) toggle.hidden = !on;
    document.body.classList.toggle('balloons-ready', on);
  }

  function updatePauseUi() {
    if (!toggle) return;
    toggle.classList.toggle('is-paused', paused);
    var label = paused ? 'Play balloon animation' : 'Pause balloon animation';
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    setVisible(true);
    resize();
    start();
  }

  function disable() {
    enabled = false;
    stop();
    setVisible(false);
  }

  function init() {
    try {
      setupRenderer();
    } catch (err) {
      console.warn('Pinkies balloons disabled: WebGL is not available.', err);
      return;
    }
    obstacleEls = Array.prototype.slice.call(document.querySelectorAll(OBSTACLE_SELECTOR));
    bindInput();

    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); disable(); });
    canvas.addEventListener('webglcontextrestored', function () { if (!reduceMotion.matches) enable(); });

    if (toggle) {
      toggle.addEventListener('click', function () {
        paused = !paused;
        updatePauseUi();
        if (paused) stop(); else start();
      });
      updatePauseUi();
    }

    var onMotionChange = function () { if (reduceMotion.matches) disable(); else enable(); };
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onMotionChange);
    else if (reduceMotion.addListener) reduceMotion.addListener(onMotionChange);
    onMotionChange();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
