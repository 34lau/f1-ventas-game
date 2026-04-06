/* ═══════════════════════════════════════════════════════════════════════
   F1 SALES GRAND PRIX — script.js
   Single-file game logic · GitHub Pages ready · GSAP 3 + Canvas API
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'f1_sales_gp_v3';

const TEAMS = [
  { id: 'ferrari',     name: 'Ferrari',      color: '#DC0000', accent: '#FFFFFF' },
  { id: 'mercedes',    name: 'Mercedes',     color: '#00D2BE', accent: '#FFFFFF' },
  { id: 'redbull',     name: 'Red Bull',     color: '#3671C6', accent: '#FFD700' },
  { id: 'mclaren',     name: 'McLaren',      color: '#FF8700', accent: '#FFFFFF' },
  { id: 'alpine',      name: 'Alpine',       color: '#FF87BC', accent: '#0090FF' },
  { id: 'astonmartin', name: 'Aston Martin', color: '#358C75', accent: '#FFD700' },
];

// Silverstone Grand Prix circuit (normalised 0–1 coords, counterclockwise)
// Key corners: Copse → Maggotts-Becketts-Chapel → Hangar → Stowe → Club → Abbey → Village/Loop
const WAYPOINTS = [
  [.60,.24],  // National Pit Straight — SF line
  [.74,.22],  // Abbey entry
  [.83,.30],  // Copse (fast right)
  [.86,.38],  // Maggotts S1
  [.79,.44],  // Maggotts S2
  [.85,.49],  // Becketts right
  [.79,.54],  // Becketts left
  [.84,.60],  // Chapel / Hangar entry
  [.83,.68],  // Hangar Straight
  [.79,.75],  // Stowe entry
  [.70,.82],  // Stowe apex
  [.58,.86],  // Vale
  [.46,.86],  // Club entry
  [.35,.80],  // Club apex / Woodcote
  [.26,.72],  // Abbey
  [.19,.62],  // Village (sharp right)
  [.15,.53],  // The Loop (hairpin)
  [.19,.45],  // Aintree (fast left)
  [.24,.37],  // Wellington Straight
  [.34,.27],  // Wellington exit
  [.46,.23],  // Back to National Pit Straight
];

const PATH_RES   = 840;   // precomputed points on circuit
const BASE_SPD   = 1;     // points/frame (normal)
const FAST_SPD   = 7;     // points/frame (fast lap)
const FAST_TICKS = 200;   // frames at fast speed per sale

// ═══════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════

function blankState() {
  return {
    setupComplete:      false,
    groupTarget:        0,
    groupTargetReached: false,
    teams: TEAMS.map((t, i) => ({
      id:              t.id,
      name:            t.name,
      color:           t.color,
      accent:          t.accent,
      driverName:      '',
      sales:           0,
      target:          0,
      position:        i + 1,
      prevPosition:    i + 1,
      isTargetReached: false,
      isDRSActive:     false,
    })),
  };
}

let S = blankState(); // global state

// ═══════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch(_) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);

    // Merge saved data preserving TEAMS metadata (color/accent)
    S = {
      ...blankState(),
      ...saved,
      teams: TEAMS.map(defaults => {
        const sv = (saved.teams || []).find(t => t.id === defaults.id);
        return sv ? { ...defaults, ...sv } : { ...defaults };
      }),
    };
    return S.setupComplete;
  } catch(_) {
    return false;
  }
}

function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  S = blankState();
}

// ═══════════════════════════════════════════════════════════════════════
// GAME LOGIC
// ═══════════════════════════════════════════════════════════════════════

const getTeam     = id => S.teams.find(t => t.id === id);
const leaderboard = ()  => [...S.teams].sort((a, b) => b.sales - a.sales);
const groupProg   = ()  => {
  const cur = S.teams.reduce((s, t) => s + t.sales, 0);
  return { cur, target: S.groupTarget,
           pct: S.groupTarget > 0 ? Math.min(100, cur / S.groupTarget * 100) : 0 };
};

function recalcPositions() {
  let changed = false;
  leaderboard().forEach((t, i) => {
    const team = getTeam(t.id);
    if (team.position !== i + 1) {
      team.prevPosition = team.position;
      team.position = i + 1;
      changed = true;
    }
  });
  return changed;
}

function updateDRS() {
  const board = leaderboard();
  board.forEach((t, i) => {
    const team = getTeam(t.id);
    team.isDRSActive = i > 0 && (board[i-1].sales - t.sales) === 1;
  });
}

function registerSale(teamId, amount) {
  const team = getTeam(teamId);
  if (!team || amount < 1) return;

  const hadTarget = team.isTargetReached;
  team.sales += amount;

  // Animate car
  triggerFastLap(teamId);

  // Individual target
  const justReached = !hadTarget && team.target > 0 && team.sales >= team.target;
  if (justReached) {
    team.isTargetReached = true;
    notify(`🏆 PURPLE SECTOR · TARGET REACHED · ${team.driverName.toUpperCase()}`, '#FFD700', 4500);
    playFanfare();
    speak(true);
  } else {
    notify(`⚡ ${team.driverName.toUpperCase()} · +${amount} VENTA${amount > 1 ? 'S' : ''}`, team.color, 2800);
    playEngineRev();
    speak(false);
  }

  const moved = recalcPositions();
  updateDRS();

  // Group target
  const gp = groupProg();
  if (gp.pct >= 100 && !S.groupTargetReached) {
    S.groupTargetReached = true;
    notify('🏁 ¡META GRUPAL ALCANZADA — VICTORIA!', '#FFD700', 6000);
  }

  saveState();
  updateProgressBar();

  if (moved) {
    animateLeaderboardFlip();
  } else {
    renderLeaderboard();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CIRCUIT — CATMULL-ROM PATH + CANVAS LOOP
// ═══════════════════════════════════════════════════════════════════════

let circuitPath = [];
let canvas, ctx, rafId;
let cars = [];

// Build smooth circuit path using Catmull-Rom splines
function buildPath() {
  const pts = WAYPOINTS;
  const n   = pts.length;
  circuitPath = [];

  const seg = Math.ceil(PATH_RES / n);

  for (let s = 0; s < n; s++) {
    const p0 = pts[(s - 1 + n) % n];
    const p1 = pts[s];
    const p2 = pts[(s + 1) % n];
    const p3 = pts[(s + 2) % n];

    for (let i = 0; i < seg; i++) {
      const t = i / seg, t2 = t * t, t3 = t2 * t;
      circuitPath.push({
        x: .5 * ((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
        y: .5 * ((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3),
      });
    }
  }
}

function initCars() {
  const n = TEAMS.length;
  cars = TEAMS.map((t, i) => ({
    teamId:     t.id,
    color:      t.color,
    accent:     t.accent,
    idx:        Math.round((i / n) * circuitPath.length), // stagger positions
    fastTicks:  0,
    particles:  [],
  }));
}

function triggerFastLap(teamId) {
  const car = cars.find(c => c.teamId === teamId);
  if (car) car.fastTicks = FAST_TICKS;
}

// ── Canvas loop ──────────────────────────────────────────────────────

function startLoop() {
  function loop() {
    updateCars();
    draw();
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);
}
function stopLoop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width  = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}

function updateCars() {
  const pLen = circuitPath.length;
  cars.forEach(car => {
    const spd = car.fastTicks > 0 ? FAST_SPD : BASE_SPD;
    if (car.fastTicks > 0) {
      car.fastTicks--;
      // Emit spark particles
      if (Math.random() < .55) {
        const pt = circuitPath[car.idx % pLen];
        for (let i = 0; i < 2; i++) {
          car.particles.push({
            x: pt.x, y: pt.y,
            vx: (Math.random() - .5) * .009,
            vy: (Math.random() - .5) * .009,
            life: 1, size: Math.random() * 2.5 + 1,
          });
        }
      }
    }
    car.idx = (car.idx + spd) % pLen;

    // Decay particles
    car.particles = car.particles.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += .00009; p.life -= .045;
      return p.life > 0;
    });
  });
}

function draw() {
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  drawTrack(W, H);
  drawParticles(W, H);
  drawCars(W, H);
}

function drawTrack(W, H) {
  if (!circuitPath.length) return;
  const pts = circuitPath.map(p => [p.x * W, p.y * H]);

// Helper: build closed circuit path in ctx
  function tracePath() {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  // ── 1. Union Jack in infield ────────────────────────────────────
  // Fill the enclosed circuit area and clip to it, then draw the flag.
  // The dark track stroke painted on top in step 3 covers the track surface,
  // leaving the flag visible only inside the infield.
  ctx.save();
  tracePath();
  ctx.clip();

  // Bounding box of the circuit interior
  let minX = W, minY = H, maxX = 0, maxY = 0;
  pts.forEach(([x, y]) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  });
  const bx = minX, by = minY, bw = maxX - minX, bh = maxY - minY;
  const cx = bx + bw / 2, cy = by + bh / 2;

  // Blue field
  ctx.fillStyle = '#012169';
  ctx.fillRect(bx, by, bw, bh);

  // St Andrew's cross (white diagonals — wide)
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = bh * .27;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(bx, by);   ctx.lineTo(bx + bw, by + bh);
  ctx.moveTo(bx + bw, by); ctx.lineTo(bx, by + bh);
  ctx.stroke();

  // St Patrick's cross (red diagonals — narrow, offset)
  ctx.strokeStyle = '#CF142B';
  ctx.lineWidth = bh * .13;
  ctx.beginPath();
  ctx.moveTo(bx, by);   ctx.lineTo(bx + bw, by + bh);
  ctx.moveTo(bx + bw, by); ctx.lineTo(bx, by + bh);
  ctx.stroke();

  // St George's cross (white vertical + horizontal — wide)
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = bh * .30;
  ctx.beginPath();
  ctx.moveTo(cx, by); ctx.lineTo(cx, by + bh);
  ctx.moveTo(bx, cy); ctx.lineTo(bx + bw, cy);
  ctx.stroke();

  // St George's cross (red — narrower)
  ctx.strokeStyle = '#CF142B';
  ctx.lineWidth = bh * .18;
  ctx.beginPath();
  ctx.moveTo(cx, by); ctx.lineTo(cx, by + bh);
  ctx.moveTo(bx, cy); ctx.lineTo(bx + bw, cy);
  ctx.stroke();

  // Dark atmospheric overlay so the flag reads as depth, not flat
  ctx.fillStyle = 'rgba(0,0,0,.60)';
  ctx.fillRect(bx - 5, by - 5, bw + 10, bh + 10);

  ctx.restore(); // end clip

  // ── 2. Outer crimson neon glow (3 passes for intensity) ─────────
  ctx.save();
  ctx.shadowColor = '#FF1801'; ctx.shadowBlur = 35;
  ctx.strokeStyle = '#CC0000';
  ctx.lineWidth = 32; ctx.lineCap = ctx.lineJoin = 'round';
  tracePath(); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = '#FF3300'; ctx.shadowBlur = 18;
  ctx.strokeStyle = '#EE1100';
  ctx.lineWidth = 26;
  tracePath(); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.shadowColor = '#FF6644'; ctx.shadowBlur = 8;
  ctx.strokeStyle = '#FF2200';
  ctx.lineWidth = 20;
  tracePath(); ctx.stroke();
  ctx.restore();

   // ── 3. Dark asphalt track surface ───────────────────────────────
  ctx.save();
  ctx.strokeStyle = '#0c0c0f';
  ctx.lineWidth = 18; ctx.lineCap = ctx.lineJoin = 'round';
  tracePath(); ctx.stroke();
  ctx.restore();

  // ── 4. Inner white edge line ─────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.72)';
  ctx.lineWidth = 1.4;
  tracePath(); ctx.stroke();
  ctx.restore();

  // ── 5. Start/Finish chequered line ───────────────────────────────
  const sf   = circuitPath[0];
  const sf2  = circuitPath[2]; // skip 1 point for stable angle
  const sfAng = Math.atan2((sf2.y - sf.y) * H, (sf2.x - sf.x) * W) + Math.PI / 2;
  ctx.save();
  ctx.translate(sf.x * W, sf.y * H);
  ctx.rotate(sfAng);
  // Chequered blocks
  const sqSize = 3.5;
  for (let row = 0; row < 4; row++) {
    for (let col = -2; col < 2; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#FFFFFF' : '#000000';
      ctx.fillRect(col * sqSize, (row - 2) * sqSize, sqSize, sqSize);
    }
  }
  ctx.restore();
}

function drawParticles(W, H) {
  cars.forEach(car => {
    car.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life * .8;
      ctx.fillStyle = car.color;
      ctx.shadowColor = car.color; ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  });
}

function drawCars(W, H) {
  const pLen = circuitPath.length;
  cars.forEach(car => {
    const i0  = Math.floor(car.idx) % pLen;
    const i1  = (i0 + 1) % pLen;
    const pt  = circuitPath[i0];
    const pt2 = circuitPath[i1];
    const x   = pt.x * W;
    const y   = pt.y * H;
    const ang = Math.atan2((pt2.y - pt.y) * H, (pt2.x - pt.x) * W);

    const team    = getTeam(car.teamId);
    const glowing = team?.isTargetReached;
    const fast    = car.fastTicks > 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);

    if (glowing) {
      ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 22;
    } else if (fast) {
      ctx.shadowColor = car.color; ctx.shadowBlur = 12;
    }

    // Car body
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-10, -4.5, 20, 9, 2);
    ctx.fill();

    // Accent stripe
    ctx.fillStyle = fast ? '#FFFFFF' : car.accent;
    ctx.fillRect(-5, -2, 10, 4);

    // Motion blur on fast lap: trailing ghost
    if (fast) {
      for (let g = 1; g <= 3; g++) {
        const gi = (i0 - g * 4 + pLen) % pLen;
        const gpt = circuitPath[gi];
        ctx.globalAlpha = .08 / g;
        ctx.save();
        ctx.translate(gpt.x * W - x, gpt.y * H - y);
        ctx.fillStyle = car.color;
        ctx.beginPath();
        ctx.roundRect(-10, -4.5, 20, 9, 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  });
}

// ═══════════════════════════════════════════════════════════════════════
// SETUP SCREEN
// ═══════════════════════════════════════════════════════════════════════

function openSetup() {
  stopLoop();
  document.getElementById('game-screen').classList.remove('visible');
  const el = document.getElementById('setup-screen');
  el.classList.add('visible');
  el.innerHTML = buildSetupHTML();
}

function buildSetupHTML() {
  return `
    <div class="setup-card">
      <div class="setup-logo">
        <div class="logo-badge">F1</div>
        <div>
          <span class="logo-main">SALES GRAND PRIX</span>
          <span class="logo-sub">TEAM CONFIGURATION · SEASON ${new Date().getFullYear()}</span>
        </div>
      </div>

      <div class="form-section">
        <label class="form-label">🏆 Meta Grupal Mensual (unidades totales del equipo)</label>
        <input type="number" id="inp-group" class="form-input gold-accent"
               placeholder="ej. 1200" min="1" value="${S.groupTarget || ''}">
      </div>

      <div class="teams-grid">
        ${TEAMS.map(t => {
          const saved = getTeam(t.id);
          return `
            <div class="team-form-card" style="--tc:${t.color}">
              <div class="team-form-header">
                <span class="team-dot"></span>
                <span class="team-label">${t.name}</span>
              </div>
              <input type="text"   id="inp-drv-${t.id}"  class="form-input"
                     placeholder="Nombre del Vendedor"
                     value="${saved?.driverName && saved.driverName !== t.name ? saved.driverName : ''}">
              <input type="number" id="inp-tgt-${t.id}"  class="form-input"
                     placeholder="Meta Individual" min="1"
                     value="${saved?.target || ''}">
            </div>`;
        }).join('')}
      </div>

      <div class="setup-actions">
        <button class="btn-start" onclick="submitSetup()">🚦 INICIAR CARRERA</button>
        ${S.setupComplete
          ? `<button class="btn-cancel" onclick="closeSetup()">← Volver a la Carrera</button>`
          : ''}
      </div>
    </div>`;
}

function closeSetup() {
  document.getElementById('setup-screen').classList.remove('visible');
  document.getElementById('game-screen').classList.add('visible');
  if (!rafId) startLoop();
}

function submitSetup() {
  const groupTarget = parseInt(document.getElementById('inp-group').value, 10);
  if (!groupTarget || groupTarget < 1) { alert('Ingresa una Meta Grupal válida.'); return; }

  let valid = true;
  TEAMS.forEach(t => {
    const drv = document.getElementById(`inp-drv-${t.id}`).value.trim();
    const tgt = parseInt(document.getElementById(`inp-tgt-${t.id}`).value, 10);
    if (!drv || !tgt || tgt < 1) valid = false;
  });
  if (!valid) { alert('Completa el nombre y meta de todos los pilotos.'); return; }

  S.groupTarget   = groupTarget;
  S.setupComplete = true;
  if (!S.sessionStart) S.sessionStart = new Date().toISOString();

  TEAMS.forEach(t => {
    const team = getTeam(t.id);
    team.driverName = document.getElementById(`inp-drv-${t.id}`).value.trim();
    team.target     = parseInt(document.getElementById(`inp-tgt-${t.id}`).value, 10);
    // Reset target flags when config changes with 0 sales
    if (team.sales === 0) team.isTargetReached = false;
  });

  recalcPositions();
  updateDRS();
  saveState();
  showGame();
}

// ═══════════════════════════════════════════════════════════════════════
// GAME SCREEN
// ═══════════════════════════════════════════════════════════════════════

function showGame() {
  document.getElementById('setup-screen').classList.remove('visible');
  document.getElementById('game-screen').classList.add('visible');

  canvas = document.getElementById('circuit-canvas');
  ctx    = canvas.getContext('2d');
  resizeCanvas();

  renderLeaderboard();
  updateProgressBar();
  initCars();
  if (!rafId) startLoop();
}

// ═══════════════════════════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════

function renderLeaderboard() {
  const el = document.getElementById('lb-rows');
  if (!el) return;
  el.innerHTML = leaderboard().map(t => rowHTML(t)).join('');
}

function rowHTML(team) {
  const pct    = team.target > 0 ? Math.min(100, team.sales / team.target * 100) : 0;
  const board  = leaderboard();
  const ahead  = board[team.position - 2];
  const gap    = ahead ? ahead.sales - team.sales : 0;

  return `
    <div class="lb-row${team.isTargetReached ? ' row-gold' : ''}"
         data-id="${team.id}"
         style="--tc:${team.color}">
      <span class="lb-pos">${team.position}</span>
      <div class="lb-driver">
        <span class="lb-colorbar"></span>
        <div class="lb-names">
          <span class="lb-team">${team.name}</span>
          <span class="lb-name">${team.driverName || team.name}</span>
        </div>
        ${team.isDRSActive      ? '<span class="drs-pill">DRS</span>'  : ''}
        ${team.isTargetReached  ? '<span class="target-pill">★</span>' : ''}
      </div>
      <span class="lb-sales">${team.sales.toLocaleString()}</span>
      <div class="lb-progress">
        ${team.target > 0 ? `
          <span class="lb-frac">${team.sales}/${team.target}</span>
          <div class="lb-minibar">
            <div class="lb-minifill${team.isTargetReached ? ' fill-gold' : ''}"
                 style="width:${pct.toFixed(1)}%"></div>
          </div>` : '<span class="lb-frac">—</span>'}
        ${gap > 0 ? `<span class="lb-gap">+${gap}</span>` : ''}
      </div>
    </div>`;
}

// GSAP FLIP animation for position swaps
function animateLeaderboardFlip() {
  const container = document.getElementById('lb-rows');
  if (!container) return;

  if (typeof gsap === 'undefined') { renderLeaderboard(); return; }

  // 1. Snapshot Y positions before update
  const before = {};
  [...container.querySelectorAll('.lb-row')].forEach(row => {
    before[row.dataset.id] = row.getBoundingClientRect().top;
  });

  // 2. Re-render DOM in new order
  renderLeaderboard();

  // 3. Animate each row from its old Y to its new Y (FLIP technique)
  [...container.querySelectorAll('.lb-row')].forEach(row => {
    const id  = row.dataset.id;
    const old = before[id];
    if (old === undefined) return;
    const delta = old - row.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) return;
    gsap.fromTo(row,
      { y: delta, zIndex: 5 },
      { y: 0, zIndex: 1, duration: .6, ease: 'power3.out', clearProps: 'zIndex' }
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PROGRESS BAR
// ═══════════════════════════════════════════════════════════════════════

function updateProgressBar() {
  const { cur, target, pct } = groupProg();
  const fill = document.getElementById('progress-fill');
  const pctEl = document.getElementById('progress-pct');
  const vals  = document.getElementById('hud-values');
  if (!fill) return;

  if (typeof gsap !== 'undefined') {
    gsap.to(fill, { width: pct.toFixed(2) + '%', duration: .75, ease: 'power2.out' });
  } else {
    fill.style.width = pct.toFixed(2) + '%';
  }
  if (pctEl) pctEl.textContent = Math.floor(pct) + '%';
  if (vals)  vals.textContent  = `${cur.toLocaleString()} / ${target.toLocaleString()}`;
}

// ═══════════════════════════════════════════════════════════════════════
// NOTIFICATION BANNER
// ═══════════════════════════════════════════════════════════════════════

let _notifTimer;

function notify(text, color = '#FFD700', ms = 3000) {
  const el = document.getElementById('notif-banner');
  if (!el) return;

  el.textContent   = text;
  el.style.color   = color;
  el.style.borderColor = color;
  el.style.boxShadow   = `0 0 30px ${color}44`;
  el.classList.remove('hidden');

  if (typeof gsap !== 'undefined') {
    gsap.fromTo(el,
      { y: 24, opacity: 0, scale: .88 },
      { y: 0, opacity: 1, scale: 1, duration: .32, ease: 'back.out(2)' }
    );
  }

  clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => {
    if (typeof gsap !== 'undefined') {
      gsap.to(el, { opacity: 0, y: -14, scale: .95, duration: .28,
                    onComplete: () => el.classList.add('hidden') });
    } else {
      el.classList.add('hidden');
    }
  }, ms);
}

// ═══════════════════════════════════════════════════════════════════════
// SUPERVISOR PANEL
// ═══════════════════════════════════════════════════════════════════════

let _supOpen = false;

function toggleSupervisor() {
  _supOpen ? closeSupervisor() : openSupervisor();
}

function openSupervisor() {
  _supOpen = true;
  const modal = document.getElementById('supervisor-modal');
  const board  = leaderboard();

  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeSupervisor()"></div>
    <div class="modal-card" id="modal-card">
      <div class="modal-head">
        <span class="modal-title">🔧 PIT WALL · SUPERVISOR</span>
        <button class="modal-x" onclick="closeSupervisor()">✕</button>
      </div>
      <div class="modal-body">
        <label class="form-label">Escudería / Piloto</label>
        <select id="sup-team" class="form-input">
          ${board.map(t => `
            <option value="${t.id}">
              P${t.position} — ${t.name} · ${t.driverName || t.name}
              (${t.sales} ventas${t.isTargetReached ? ' ★' : ''})
            </option>`).join('')}
        </select>

        <label class="form-label" style="margin-top:4px">Unidades de Venta</label>
        <div class="sale-counter">
          <button class="counter-btn" onclick="adjAmt(-1)">−</button>
          <input type="number" id="sup-amt" class="form-input gold-accent"
                 value="1" min="1" style="text-align:center; margin-bottom:0">
          <button class="counter-btn" onclick="adjAmt(+1)">+</button>
        </div>

        <button class="btn-start" style="margin-top:18px" onclick="confirmSale()">
          🏁 CONFIRMAR PIT STOP
        </button>

        <hr class="divider">

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn-cancel" style="flex:1"
                  onclick="closeSupervisor();openSetup()">⚙ Configuración</button>
          <button class="btn-cancel btn-danger" style="flex:1"
                  onclick="doReset()">⚠ Reiniciar</button>
        </div>
      </div>
    </div>`;

  if (typeof gsap !== 'undefined') {
    gsap.fromTo('#modal-card',
      { scale: .92, opacity: 0 },
      { scale: 1,   opacity: 1, duration: .2, ease: 'power2.out' });
  }

  setTimeout(() => document.getElementById('sup-amt')?.focus(), 60);
}

function closeSupervisor() {
  _supOpen = false;
  document.getElementById('supervisor-modal').innerHTML = '';
}

function adjAmt(delta) {
  const el = document.getElementById('sup-amt');
  if (el) el.value = Math.max(1, (parseInt(el.value, 10) || 1) + delta);
}

function confirmSale() {
  const teamId = document.getElementById('sup-team')?.value;
  const amount = parseInt(document.getElementById('sup-amt')?.value, 10);
  if (!teamId || !(amount >= 1)) return;
  playBeep();
  closeSupervisor();
  registerSale(teamId, amount);
}

function doReset() {
  if (!confirm('¿Reiniciar toda la carrera? Se borrarán todos los datos guardados.')) return;
  closeSupervisor();
  stopLoop();
  resetState();
  openSetup();
}

// ═══════════════════════════════════════════════════════════════════════
// AUDIO  (Web Audio API procedural + SpeechSynthesis radio)
// ═══════════════════════════════════════════════════════════════════════

let _actx = null;
let _audioOn = true;

function getACtx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  return _actx;
}

function playEngineRev() {
  if (!_audioOn) return;
  try {
    const c = getACtx(), t = c.currentTime, d = 2.6;

    // Main V6 tone
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(4200, t + d * .72);
    o.frequency.linearRampToValueAtTime(3400, t + d);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(.19, t + .04);
    g.gain.linearRampToValueAtTime(.14, t + d * .7);
    g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + d);

    // Harmonic overlay
    const o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'square';
    o2.frequency.setValueAtTime(320, t);
    o2.frequency.exponentialRampToValueAtTime(8400, t + d * .72);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(.045, t + .1);
    g2.gain.linearRampToValueAtTime(0, t + d);
    o2.connect(g2); g2.connect(c.destination);
    o2.start(t); o2.stop(t + d);

    // Turbo whine
    const o3 = c.createOscillator(), g3 = c.createGain(), f = c.createBiquadFilter();
    o3.type = 'sawtooth';
    o3.frequency.setValueAtTime(1800, t);
    o3.frequency.linearRampToValueAtTime(14000, t + d * .6);
    f.type = 'bandpass'; f.frequency.value = 5000; f.Q.value = 10;
    g3.gain.setValueAtTime(0, t);
    g3.gain.linearRampToValueAtTime(.03, t + .3);
    g3.gain.linearRampToValueAtTime(0, t + d);
    o3.connect(f); f.connect(g3); g3.connect(c.destination);
    o3.start(t); o3.stop(t + d);
  } catch(_) {}
}

function playFanfare() {
  if (!_audioOn) return;
  try {
    const c = getACtx(), t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i*.14);
      g.gain.linearRampToValueAtTime(.22, t + i*.14 + .05);
      g.gain.exponentialRampToValueAtTime(.001, t + i*.14 + .9);
      o.connect(g); g.connect(c.destination);
      o.start(t + i*.14); o.stop(t + i*.14 + 1);
    });
  } catch(_) {}
}

function playBeep() {
  if (!_audioOn) return;
  try {
    const c = getACtx(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t);
    o.frequency.linearRampToValueAtTime(1200, t + .07);
    g.gain.setValueAtTime(.15, t);
    g.gain.exponentialRampToValueAtTime(.001, t + .22);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + .25);
  } catch(_) {}
}

const RADIO_LINES = [
  'Great job, box box!', 'Fastest lap — keep pushing!',
  'Brilliant work, stay focused.', 'Gap is closing, push push push!',
  'Copy that. Outstanding!', 'We are fighting here, come on!',
  'That is a good lap. Keep it up.',
];
const TARGET_LINES = [
  'Target reached! Absolutely mega!',
  'We did it! Incredible lap!',
  'Purple sector confirmed — well done!',
];

function speak(isTarget = false) {
  if (!_audioOn || !window.speechSynthesis) return;
  const pool  = isTarget ? TARGET_LINES : RADIO_LINES;
  const text  = pool[Math.floor(Math.random() * pool.length)];
  const utter = new SpeechSynthesisUtterance(text);
  utter.pitch = 1.08; utter.rate = 1.18; utter.volume = .9;
  const voices = speechSynthesis.getVoices();
  const en = voices.find(v => v.lang.startsWith('en') && /male/i.test(v.name))
          || voices.find(v => v.lang.startsWith('en'))
          || null;
  if (en) utter.voice = en;
  speechSynthesis.speak(utter);
}

function toggleAudio() {
  _audioOn = !_audioOn;
  const btn = document.getElementById('btn-audio');
  if (btn) btn.textContent = _audioOn ? '🔊' : '🔇';
}

// ═══════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════

(function init() {
  buildPath();

  // Pre-load speech voices
  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener('voiceschanged', () => speechSynthesis.getVoices());
  }

  const hasSave = loadState();

  if (hasSave) {
    showGame();
  } else {
    openSetup();
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (!S.setupComplete) return;
    if ((e.key === 's' || e.key === 'S') && !['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) {
      e.preventDefault(); toggleSupervisor();
    }
    if (e.key === 'Escape') closeSupervisor();
  });

  window.addEventListener('resize', resizeCanvas);

  // Dev console helpers: window._f1.registerSale('ferrari', 5)
  window._f1 = { state: S, registerSale, getTeam, leaderboard };
})();
