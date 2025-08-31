(() => {
  // -------- Canvas & escala HDPI ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let vw = 0, vh = 0, dpr = 1;

  function resize() {
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Actualiza suelo relativo a viewport
    floorY = Math.floor(vh * 0.82);
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  // -------- Constantes del juego ----------
  const GRAV = 1200;           // px/s^2
  const FRICTION = 0.86;       // atenuación horizontal cuando no pulsas
  const MAX_DX = 220;          // vel horizontal máx
  const JUMP_V = 420;          // impulso de salto
  const WALK_SPEED = 120;      // velocidad al pulsar ←/→
  const TARGET_SECONDS = 120;  // ~2 minutos
  const WORLD_LEN = Math.round(WALK_SPEED * TARGET_SECONDS); // ≈ 14400 px

  // Suelo/plataformas muy simples (un plano)
  let floorY = Math.floor(vh * 0.82);
  const groundHeight = Math.max(32, Math.floor(vh * 0.18));

  // -------- Jugador ----------
  const player = {
    x: 40,
    y: floorY - 48,
    w: 28,
    h: 48,
    vx: 0,
    vy: 0,
    onGround: true,
    alive: true,
    reachedGoal: false
  };

  // -------- Enemigos (patrullas simples) ----------
  function makeEnemy(x, y, minX, maxX, speed) {
    return { x, y, w: 28, h: 28, vx: speed, minX, maxX, speed: Math.abs(speed) };
  }
  const enemies = [];
  // Distribuye enemigos a lo largo del camino
  for (let i = 1; i <= 24; i++) {
    const seg = (WORLD_LEN / 24) * i;
    const patrolWidth = 140 + (i % 3) * 40;
    const minX = seg - 90;
    const maxX = seg + patrolWidth - 90;
    enemies.push(makeEnemy(minX + 50, floorY - 28, minX, maxX, 40 + (i % 3) * 20));
  }

  // -------- Meta ----------
  const goal = {
    x: WORLD_LEN - 40,
    y: floorY - 64,
    w: 24,
    h: 64
  };

  // -------- Cámara ----------
  let camX = 0;
  function updateCamera() {
    const leftMargin = vw * 0.33;
    camX = Math.max(0, Math.min(player.x - leftMargin, WORLD_LEN - vw));
  }

  // -------- Input: teclado ----------
  const keys = { left: false, right: false, jump: false };
  function setKey(code, pressed) {
    if (code === 'ArrowLeft' || code === 'KeyA') keys.left = pressed;
    if (code === 'ArrowRight' || code === 'KeyD') keys.right = pressed;
    if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
      if (pressed) keys.jump = true; // se consume en el update
    }
  }
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft','ArrowRight','Space','ArrowUp'].includes(e.code)) e.preventDefault();
    setKey(e.code, true);
  });
  window.addEventListener('keyup', (e) => setKey(e.code, false));

  // -------- Input: táctil (D-pad y salto) ----------
  const tc = document.getElementById('touchControls');
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const btnJump = document.getElementById('btnJump');

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (isTouch) tc.classList.add('visible');

  // helpers para botones táctiles
  function bindHold(btn, onDown, onUp) {
    const down = (e) => { e.preventDefault(); onDown(); btn.setPointerCapture?.(e.pointerId); };
    const up = (e) => { e.preventDefault(); onUp(); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }
  bindHold(btnLeft, () => keys.left = true, () => keys.left = false);
  bindHold(btnRight, () => keys.right = true, () => keys.right = false);
  bindHold(btnJump, () => keys.jump = true, () => { /* nada en up */ });

  // -------- HUD y Overlays ----------
  const overlay = document.getElementById('overlay');
  const overlayEnd = document.getElementById('overlayEnd');
  const endTitle = document.getElementById('endTitle');
  const endSubtitle = document.getElementById('endSubtitle');
  const btnStart = document.getElementById('btnStart');
  const btnRestart = document.getElementById('btnRestart');
  const timerEl = document.getElementById('timer');
  const progressFill = document.getElementById('progress-fill');

  let started = false;
  let startTime = 0;
  let elapsed = 0;
  let rafId = 0;

  btnStart.addEventListener('click', startGame);
  btnRestart.addEventListener('click', () => {
    overlayEnd.hidden = true;
    resetGame();
    startGame();
  });

  function startGame() {
    overlay.classList.remove('show');
    if (!started) {
      started = true;
      startTime = performance.now();
      lastT = startTime;
      loop();
    }
  }

  function resetGame() {
    // resetea estado
    player.x = 40;
    player.y = floorY - player.h;
    player.vx = 0; player.vy = 0;
    player.onGround = true;
    player.alive = true;
    player.reachedGoal = false;
    enemies.forEach((e, i) => {
      e.x = e.minX + 50;
      e.vx = Math.sign(e.vx || 1) * e.speed;
    });
    camX = 0; elapsed = 0;
  }

  // -------- Lógica del juego ----------
  let lastT = performance.now();
  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const t = now ?? performance.now();
    let dt = (t - lastT) / 1000;
    lastT = t;
    if (dt > 0.05) dt = 0.05; // cap a 50 ms para estabilidad

    if (!player.alive || player.reachedGoal) return endRound();

    // Entrada horizontal
    if (keys.left && !keys.right) player.vx = -WALK_SPEED;
    else if (keys.right && !keys.left) player.vx = WALK_SPEED;
    else player.vx *= FRICTION;

    // Salto (consumible)
    if (keys.jump && player.onGround) {
      player.vy = -JUMP_V;
      player.onGround = false;
    }
    keys.jump = false;

    // Física
    player.vx = Math.max(-MAX_DX, Math.min(MAX_DX, player.vx));
    player.vy += GRAV * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Colisión con suelo/plataforma única
    const groundTop = floorY - 0;
    if (player.y + player.h >= groundTop) {
      player.y = groundTop - player.h;
      player.vy = 0;
      player.onGround = true;
    }

    // Límites del mundo
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > WORLD_LEN) player.x = WORLD_LEN - player.w;

    // Enemigos: patrulla y colisiones
    enemies.forEach(e => {
      e.x += e.vx * dt;
      if (e.x < e.minX) { e.x = e.minX; e.vx = e.speed; }
      if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -e.speed; }
      if (aabb(player, e)) {
        // No hay "pisar"; cualquier toque = KO
        player.alive = false;
      }
    });

    // Meta
    if (aabb(player, goal)) {
      player.reachedGoal = true;
    }

    // HUD
    elapsed = (t - startTime) / 1000;
    timerEl.textContent = formatTime(elapsed);
    progressFill.style.width = `${Math.min(100, ((player.x + player.w) / WORLD_LEN) * 100)}%`;

    // Cámara y render
    updateCamera();
    render();
  }

  function endRound() {
    // Cancela bucle y muestra overlay final una sola vez
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    overlayEnd.hidden = false;
    const timeStr = formatTime(elapsed);
    if (player.reachedGoal) {
      endTitle.textContent = '¡Has llegado a la meta!';
      endSubtitle.textContent = `Tiempo: ${timeStr}`;
    } else {
      endTitle.textContent = '¡Game Over!';
      endSubtitle.textContent = `Duraste ${timeStr}. Inténtalo de nuevo.`;
    }
  }

  // -------- Render ----------
  function render() {
    // Fondo cielo
    ctx.clearRect(0, 0, vw, vh);

    // Parallax simple (colinas)
    drawHills();

    // Suelo
    ctx.fillStyle = '#3b8c2a';
    ctx.fillRect(-camX, floorY, Math.max(vw, WORLD_LEN) + camX + 200, groundHeight);
    // Línea del suelo (borde)
    ctx.fillStyle = '#2a5d1e';
    ctx.fillRect(-camX, floorY, Math.max(vw, WORLD_LEN) + camX + 200, 6);

    // Meta (bandera)
    drawGoal(goal);

    // Enemigos
    enemies.forEach(e => drawEnemy(e));

    // Jugador
    drawPlayer(player);
  }

  function drawHills() {
    const sky = ctx.createLinearGradient(0, 0, 0, vh);
    sky.addColorStop(0, '#87ceeb');
    sky.addColorStop(1, '#b8ecff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, vw, vh);

    // colinas parallax
    const parLayers = [
      { h: vh*0.40, y: vh*0.75, speed: 0.2 },
      { h: vh*0.30, y: vh*0.82, speed: 0.4 }
    ];
    ctx.fillStyle = '#7bd36a';
    parLayers.forEach((l, idx) => {
      const offset = - (camX * l.speed) % 600;
      for (let x = offset - 600; x < vw + 600; x += 600) {
        ctx.beginPath();
        ctx.moveTo(x, l.y);
        ctx.quadraticCurveTo(x+150, l.y - l.h, x+300, l.y);
        ctx.quadraticCurveTo(x+450, l.y + l.h*0.2, x+600, l.y);
        ctx.closePath();
        ctx.globalAlpha = idx === 0 ? 0.35 : 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  }

  function drawPlayer(p) {
    const x = Math.round(p.x - camX), y = Math.round(p.y);
    // cuerpo
    ctx.fillStyle = '#ffce54';
    ctx.fillRect(x, y, p.w, p.h);
    // gorra
    ctx.fillStyle = '#ff6b57';
    ctx.fillRect(x - 2, y - 8, p.w + 4, 10);
    // ojos
    ctx.fillStyle = '#222';
    ctx.fillRect(x + 6, y + 14, 4, 6);
    ctx.fillRect(x + p.w - 10, y + 14, 4, 6);
    // sombra suelo
    if (p.onGround) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.fillRect(x + 4, floorY - 6, p.w - 8, 4);
      ctx.globalAlpha = 1;
    }
  }

  function drawEnemy(e) {
    const x = Math.round(e.x - camX), y = Math.round(e.y);
    ctx.fillStyle = '#6a5acd';
    ctx.fillRect(x, y, e.w, e.h);
    // ojos "enfadados"
    ctx.fillStyle = '#111';
    ctx.fillRect(x + 6, y + 8, 6, 6);
    ctx.fillRect(x + e.w - 12, y + 8, 6, 6);
    // dientes
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 8, y + e.h - 8, e.w - 16, 4);
  }

  function drawGoal(g) {
    const x = Math.round(g.x - camX);
    // poste
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(x, g.y - 4, 6, g.h + 4);
    // bandera
    ctx.fillStyle = '#4cd6ff';
    ctx.beginPath();
    ctx.moveTo(x+6, g.y + 8);
    ctx.lineTo(x+6 + 36, g.y + 18);
    ctx.lineTo(x+6, g.y + 28);
    ctx.closePath();
    ctx.fill();
    // base
    ctx.fillStyle = '#5c3b1a';
    ctx.fillRect(x - 6, g.y + g.h, 18, 10);
  }

  // -------- Utilidades ----------
  function aabb(a, b) {
    return (a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y);
  }
  function formatTime(s) {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  }

  // Evita scroll con barra espaciadora cuando el juego está activo
  window.addEventListener('keydown', (e) => {
    if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
  });

  // Para poder reiniciar con teclado si quieres
  window.addEventListener('keypress', (e) => {
    if (!started && e.code === 'Enter') startGame();
  });
})();