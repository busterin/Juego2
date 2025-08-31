(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  let vw = 0, vh = 0, dpr = 1;
  let floorY = 0;
  let groundHeight = 0;

  function resize() {
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    floorY = Math.floor(vh * 0.82);
    groundHeight = Math.max(32, Math.floor(vh * 0.18));
  }
  window.addEventListener('resize', resize);
  resize();

  // Constantes
  const GRAV = 1200, FRICTION = 0.86, MAX_DX = 220, JUMP_V = 420, WALK_SPEED = 120;
  const TARGET_SECONDS = 120;
  const WORLD_LEN = Math.round(WALK_SPEED * TARGET_SECONDS);

  // Jugador
  const player = { x:40, y:0, w:28, h:48, vx:0, vy:0, onGround:true, alive:true, reachedGoal:false };

  // Enemigos
  function makeEnemy(x, y, minX, maxX, speed) {
    return { x, y, w:28, h:28, vx:speed, minX, maxX, speed:Math.abs(speed) };
  }
  const enemies = [];
  for (let i=1;i<=12;i++){
    const seg = (WORLD_LEN/12)*i;
    enemies.push(makeEnemy(seg, floorY-28, seg-60, seg+80, 40));
  }

  // Meta
  const goal = { x:WORLD_LEN-60, y:0, w:24, h:64 };

  // Cámara
  let camX = 0;
  function updateCamera(){
    const leftMargin = vw*0.33;
    camX = Math.max(0, Math.min(player.x-leftMargin, WORLD_LEN-vw));
  }

  // Input
  const keys = { left:false, right:false, jump:false };
  function setKey(code, pressed){
    if (code==="ArrowLeft"||code==="KeyA") keys.left=pressed;
    if (code==="ArrowRight"||code==="KeyD") keys.right=pressed;
    if (code==="Space"||code==="ArrowUp") if(pressed) keys.jump=true;
  }
  window.addEventListener('keydown',e=>setKey(e.code,true));
  window.addEventListener('keyup',e=>setKey(e.code,false));

  // HUD
  const overlayEnd = document.getElementById('overlayEnd');
  const endTitle = document.getElementById('endTitle');
  const endSubtitle = document.getElementById('endSubtitle');
  const btnPlay = document.getElementById('btnPlay');
  const btnRestart = document.getElementById('btnRestart');
  const timerEl = document.getElementById('timer');
  const progressFill = document.getElementById('progress-fill');

  let startTime=0, elapsed=0, rafId=0, started=false, lastT=0;

  btnPlay.addEventListener('click', ()=> startGame());
  btnRestart.addEventListener('click', ()=> startGame());

  function startGame(){
    overlayEnd.hidden=true;
    resetGame();
    started=true;
    startTime=performance.now();
    lastT=startTime;
    loop();
  }

  function resetGame(){
    player.x=40;
    player.y=floorY-player.h;
    player.vx=0; player.vy=0;
    player.onGround=true;
    player.alive=true;
    player.reachedGoal=false;
    enemies.forEach(e=>{
      e.x=e.minX+20;
      e.vx=e.speed;
    });
    camX=0; elapsed=0;
  }

  function loop(now){
    rafId=requestAnimationFrame(loop);
    let dt=(now-lastT)/1000; lastT=now;
    if(dt>0.05) dt=0.05;

    if(!player.alive||player.reachedGoal){ return endRound(); }

    // Movimiento
    if(keys.left&&!keys.right) player.vx=-WALK_SPEED;
    else if(keys.right&&!keys.left) player.vx=WALK_SPEED;
    else player.vx*=FRICTION;

    if(keys.jump && player.onGround){ player.vy=-JUMP_V; player.onGround=false; }
    keys.jump=false;

    player.vy+=GRAV*dt;
    player.x+=player.vx*dt;
    player.y+=player.vy*dt;

    if(player.y+player.h>=floorY){
      player.y=floorY-player.h;
      player.vy=0; player.onGround=true;
    }

    if(player.x<0) player.x=0;
    if(player.x+player.w>WORLD_LEN) player.x=WORLD_LEN-player.w;

    enemies.forEach(e=>{
      e.x+=e.vx*dt;
      if(e.x<e.minX){ e.x=e.minX; e.vx=e.speed; }
      if(e.x+e.w>e.maxX){ e.x=e.maxX-e.w; e.vx=-e.speed; }
      if(aabb(player,e)) player.alive=false;
    });

    if(aabb(player,goal)) player.reachedGoal=true;

    elapsed=(now-startTime)/1000;
    timerEl.textContent=formatTime(elapsed);
    progressFill.style.width=`${((player.x+player.w)/WORLD_LEN*100)}%`;

    updateCamera();
    render();
  }

  function endRound(){
    cancelAnimationFrame(rafId);
    started=false;
    overlayEnd.hidden=false;
    const timeStr=formatTime(elapsed);
    if(player.reachedGoal){
      endTitle.textContent="¡Has llegado a la meta!";
      endSubtitle.textContent=`Tiempo: ${timeStr}`;
    } else {
      endTitle.textContent="¡Game Over!";
      endSubtitle.textContent=`Duraste ${timeStr}`;
    }
  }

  // Render
  function render(){
    ctx.clearRect(0,0,vw,vh);
    ctx.fillStyle="#87ceeb"; ctx.fillRect(0,0,vw,vh);
    ctx.fillStyle="#3b8c2a"; ctx.fillRect(-camX,floorY,vw+WORLD_LEN,groundHeight);

    drawGoal(goal);
    enemies.forEach(drawEnemy);
    drawPlayer(player);
  }
  function drawPlayer(p){
    const x=Math.round(p.x-camX), y=Math.round(p.y);
    ctx.fillStyle="#ffce54"; ctx.fillRect(x,y,p.w,p.h);
  }
  function drawEnemy(e){
    const x=Math.round(e.x-camX), y=Math.round(e.y);
    ctx.fillStyle="#6a5acd"; ctx.fillRect(x,y,e.w,e.h);
  }
  function drawGoal(g){
    const x=Math.round(g.x-camX);
    ctx.fillStyle="#8b5a2b"; ctx.fillRect(x,g.y,g.w,g.h);
  }

  // Utils
  function aabb(a,b){ return (a.x<a+b.w && a.x+a.w>b.x && a.y<a+b.h && a.y+a.h>b.y); }
  function formatTime(s){ const m=Math.floor(s/60); const ss=Math.floor(s%60); return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; }

})();