/* Runas Rotas v1 — original pixel art rendered with Canvas. */
'use strict';
const $=s=>document.querySelector(s),canvas=$('#canvas'),ctx=canvas.getContext('2d'),keys=new Set(),pressed=new Set(),SAVE='runas-rotas-v1';
ctx.imageSmoothingEnabled=false;
let mode='title',time=0,room=0,enemies=[],shots=[],arrows=[],waves=[],particles=[],serial=0,shake=0,toastTimer=0,sound=false,audio,offset=0;
let defeated=new Set(),bloodByRoom={},deathPoses=[];
let progress={dash:false,book:false,page:false,spell:false,thorns:false,boss:false,visited:[0]},checkpoint={room:0,x:100,y:420};
const p={x:100,y:420,w:18,h:32,vx:0,vy:0,face:1,hp:5,mana:3,ground:false,coyote:0,inv:0,attack:0,cool:0,dash:0,dashCool:0,magicCool:0};
const rooms=[
 {name:'El umbral verde',kind:'forest',platforms:[[0,480,960,60],[230,398,130,16],[420,326,130,16],[620,256,140,16],[810,192,150,16],[820,105,140,16],[820,20,140,16]],exits:{right:1,up:3},spawn:[[550,448,'goblin']],items:[['shrine',100,480]],hint:'A / D: moverse · Espacio: saltar · J: espada · E: interactuar.'},
 {name:'Sendero de los exiliados',kind:'forest',platforms:[[0,480,960,60],[160,398,135,16],[350,322,130,16],[555,250,135,16],[790,185,170,16],[820,100,140,16],[820,15,140,16]],exits:{left:0,right:2,up:4},spawn:[[430,448,'goblin'],[730,438,'hob'],[620,218,'archer']],items:[['dash',410,322]],hint:'Unas botas antiguas brillan en las alturas. Acercate y presioná E.'},
 {name:'El trono de espinas',kind:'boss',platforms:[[0,480,960,60],[195,376,130,16],[640,376,130,16]],exits:{left:1},spawn:[],items:[['gate',135,480]],hint:'Las zarzas no ceden a la espada. Necesitás recuperar la magia del fuego.'},
 {name:'Archivo de las raíces',kind:'ruins',platforms:[[0,480,770,60],[860,480,100,60],[120,394,145,16],[340,316,145,16],[575,390,150,16]],exits:{right:4,down:0},spawn:[[620,358,'goblin']],items:[['book',405,316],['shrine',100,480]],hint:'Un libro duerme entre las raíces. El hueco de la derecha desciende al umbral.'},
 {name:'La copa de los susurros',kind:'canopy',platforms:[[0,480,270,60],[395,480,375,60],[860,480,100,60],[170,370,130,16],[405,280,120,16],[635,205,120,16]],exits:{left:3,right:5,down:1},spawn:[[550,448,'goblin'],[445,248,'archer']],items:[['page',690,205]],hint:'Usá el impulso para cruzar entre ramas. Una página espera en lo alto.'},
 {name:'Vigilia del campamento',kind:'ruins',platforms:[[0,480,960,60],[190,385,150,16],[440,303,135,16],[690,385,150,16]],exits:{left:4},spawn:[[320,438,'hob'],[620,448,'goblin'],[780,438,'hob'],[485,271,'archer']],items:[['shrine',880,480]],hint:'Los hobgoblins dejan una abertura después de atacar. E en el santuario cura y guarda.'}
];
function readSave(){try{const d=JSON.parse(localStorage.getItem(SAVE));return d?.version===1&&Number.isInteger(d.checkpoint?.room)&&rooms[d.checkpoint.room]&&Number.isFinite(d.checkpoint.x)&&Number.isFinite(d.checkpoint.y)?d:null;}catch{return null;}}
function save(){try{localStorage.setItem(SAVE,JSON.stringify({version:1,progress,checkpoint,defeated:[...defeated]}));}catch{toast('Guardado no disponible en este navegador. Podés continuar en esta sesión.');}}
function beep(f=300,d=.1,type='triangle'){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(f,audio.currentTime);o.frequency.exponentialRampToValueAtTime(f*.55,audio.currentTime+d);g.gain.setValueAtTime(.025,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d);}catch{}}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=5;}
function panel(html){$('#overlay').innerHTML=`<div class="panel">${html}</div>`;$('#overlay button')?.focus();}
function resume(){mode='play';$('#overlay').innerHTML='';keys.clear();pressed.clear();canvas.focus();}
function title(){mode='title';$('#hud').hidden=true;$('#bossbar').hidden=true;panel(`<div class="eyebrow">UNA AVENTURA DE ESPADA Y CONOCIMIENTO</div><h1>RUNAS<br>ROTAS</h1><div class="subtitle">EL BOSQUE OLVIDADO</div><div class="ornament">─ ◇ ─</div><p>Bajo las raíces duerme un lenguaje perdido.<br>Encontrá sus páginas. Despertá su magia.</p><button class="primary" id="start">${readSave()?'CONTINUAR EL VIAJE':'ENTRAR AL BOSQUE'} →</button>${readSave()?'<button class="secondary" id="new">NUEVA PARTIDA</button>':''}<div class="menu-options"><button class="secondary" id="help">CONTROLES</button><button class="secondary" id="sound"></button><button class="secondary" id="fullscreen">F · PANTALLA COMPLETA</button></div><p class="keys">↑ ↓ / TAB · ELEGIR &nbsp; ENTER · CONFIRMAR</p><p class="credits">CAPÍTULO I · VERSIÓN 1.6 · SOLO TECLADO</p>`);bindMenu();$('#help').onclick=help;$('#start').onclick=()=>start(true);if($('#new'))$('#new').onclick=()=>{panel('<h2>Un nuevo viaje</h2><p>Se reemplazará el progreso guardado de este navegador.</p><button id="confirm" class="primary">COMENZAR DE NUEVO</button><button id="back" class="secondary">VOLVER</button>');$('#confirm').onclick=()=>start(false);$('#back').onclick=title;};}
function start(load){const d=load&&readSave();progress={dash:false,book:false,page:false,spell:false,thorns:false,boss:false,visited:[0]};if(d){for(const k of ['dash','book','page','spell','thorns','boss'])progress[k]=!!d.progress?.[k];progress.visited=Array.isArray(d.progress?.visited)?d.progress.visited.filter(n=>Number.isInteger(n)&&rooms[n]):[0];}defeated=new Set(Array.isArray(d?.defeated)?d.defeated.filter(id=>typeof id==='string'):[]);bloodByRoom={};deathPoses=[];checkpoint=d?d.checkpoint:{room:0,x:100,y:420};Object.assign(p,{hp:5,mana:3,inv:0,cool:0,attack:0,dashCool:0,magicCool:0});enter(checkpoint.room,checkpoint.x,checkpoint.y);$('#hud').hidden=false;resume();save();}
function enter(n,x,y){room=n;Object.assign(p,{x,y,vx:0,vy:0,dash:0,ground:false,coyote:0});shots=[];arrows=[];waves=[];particles=[];deathPoses=[];enemies=rooms[n].spawn.map(([x,y,type],i)=>({id:`${n}:${i}`,x,y,type,w:type==='hob'?26:22,h:type==='hob'?42:32,hp:type==='hob'?5:3,max:type==='hob'?5:3,vx:0,vy:0,face:-1,state:'idle',timer:.7,hit:0,attackId:-1,home:x})).filter(e=>!defeated.has(e.id));if(n===2&&progress.thorns&&!progress.boss)addBoss();if(!progress.visited.includes(n)){progress.visited.push(n);save();}$('#zone').textContent=rooms[n].name;toast(rooms[n].hint);}
function addBoss(){if(enemies.some(e=>e.type==='boss'))return;enemies.push({x:730,y:408,w:52,h:72,type:'boss',hp:32,max:32,vx:0,vy:0,face:-1,state:'idle',timer:1.5,hit:0,attackId:-1,turn:0,hordeCalled:false});}
function journal(){
 if(mode!=='play')return;
 mode='journal';
 const discoveries=[];
 if(progress.dash)discoveries.push('Botas del viento · Shift');
 if(progress.book)discoveries.push('Grimorio recuperado');
 if(progress.page)discoveries.push(progress.spell?'Página traducida · Ascua · K':'Página ilegible · Sin investigar');
 panel(`<div class="eyebrow">TU VIAJE</div><h2>${progress.book?'El grimorio del errante':'Notas del viaje'}</h2><div class="map">${[3,4,5,0,1,2].filter(n=>progress.visited.includes(n)).map(n=>`<div class="${room===n?'current':''}">${rooms[n].name}${room===n?' · VOS':''}</div>`).join('')}</div><p>${discoveries.length?discoveries.join('<br>'):'Todavía no registraste ningún hallazgo.'}</p>${progress.book&&progress.page&&!progress.spell?'<button id="research" class="primary">INVESTIGAR PÁGINA</button>':''}<button id="back" class="secondary">VOLVER AL BOSQUE</button>`);
 $('#back').onclick=resume;
 if($('#research'))$('#research').onclick=()=>{offset=0;cipher();};
}
function cipher(){mode='cipher';const coded='OD OODPD DEUH HO FDPLQR',signature='LXOLQ VDHUK',translate=text=>text.replace(/[A-Z]/g,c=>String.fromCharCode(65+(c.charCodeAt(0)-65-offset+26)%26)),decoded=coded.replace(/[A-Z]/g,c=>String.fromCharCode(65+(c.charCodeAt(0)-65-offset+26)%26));panel(`<div class="eyebrow">GRIMORIO / PÁGINA 01</div><h2>Una voz entre las letras</h2><p><em>«Parece que quien escribió esta página no quería que cualquiera la leyera. Eso del final parece una firma… ¿Iulin Saerh, el escriba de la Torre Gris? Las letras se ven extrañamente cambiadas».</em></p><div class="cipher">${coded}<small>— ${signature}</small></div><p class="alphabet">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>${Array.from({length:26},(_,i)=>String.fromCharCode(65+(i-offset+26)%26)).join('')}</p><div class="tool"><button id="minus" aria-label="Reducir desplazamiento">−</button><span>DESPLAZAMIENTO: ${offset}</span><button id="plus" aria-label="Aumentar desplazamiento">+</button></div><p class="decoded">${decoded}</p><p class="signature">— ${translate(signature)}</p><button class="primary" id="solve">INSCRIBIR TRADUCCIÓN</button><button class="secondary" id="back">MÁS TARDE</button><p id="feedback" role="status"></p>`);$('#minus').onclick=()=>{offset=(offset+25)%26;cipher();$('#minus').focus();};$('#plus').onclick=()=>{offset=(offset+1)%26;cipher();$('#plus').focus();};$('#back').onclick=resume;$('#solve').onclick=()=>{if(offset===3){progress.spell=true;p.mana=3;save();resume();toast('ASCUA DESBLOQUEADA · K para lanzar fuego. Las llamas abren caminos entre las zarzas.');beep(780,.4);}else $('#feedback').textContent='La frase sigue siendo extraña. Quizá la firma ayude a reconocer el orden de las letras.';};}
function help(){if(!['play','title'].includes(mode))return;const wasTitle=mode==='title';mode='pause';panel('<div class="eyebrow">UN RESPIRO ENTRE LAS RAÍCES</div><h2>El bosque puede esperar</h2><p>A / D o flechas · Moverse<br>Espacio / W / ↑ · Saltar &nbsp; J · Espada<br>Shift · Impulso (requiere botas)<br>K · Ascua (requiere descifrar la página)<br>E · Interactuar &nbsp; Tab · Grimorio y mapa &nbsp; Esc · Pausa<br><br>La espada restaura magia al acertar. El impulso protege un instante. Los santuarios curan y guardan. Las salidas doradas conectan las salas.</p><button class="primary" id="back">VOLVER</button><div class="menu-options"><button class="secondary" id="sound"></button><button class="secondary" id="fullscreen">F · PANTALLA COMPLETA</button></div>');bindMenu();$('#back').onclick=wasTitle?title:resume;}
window.addEventListener('keydown',e=>{if(e.code==='KeyF'){e.preventDefault();if(!e.repeat)toggleFullscreen();return;}if(mode!=='play'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();const buttons=[...document.querySelectorAll('#overlay button')];const i=buttons.indexOf(document.activeElement),d=['ArrowUp','ArrowLeft'].includes(e.code)?-1:1;buttons[(i+d+buttons.length)%buttons.length]?.focus();return;}if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)&&mode==='play')e.preventDefault();if(e.code==='Escape'){if(mode==='play')help();else if(['journal','cipher'].includes(mode))resume();else if(mode==='pause')$('#back').click();return;}if(e.code==='Tab'&&mode==='play'){journal();return;}if(!keys.has(e.code))pressed.add(e.code);keys.add(e.code);});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();pressed.clear();if(mode==='play')help();});
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
function burst(x,y,color,n=12){for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*180,vy:-Math.random()*150,life:.3+Math.random()*.5,color});}
function hurt(from){if(p.inv>0||p.dash>0||mode!=='play')return;p.hp--;p.inv=1.25;p.vy=-220;shake=.2;burst(p.x+9,p.y+12,'#dc8b75');beep(110,.18,'sawtooth');if(p.hp<=0){mode='dead';panel('<div class="eyebrow">LAS RAÍCES RECUERDAN TUS PASOS</div><h2>La llama no se apaga</h2><p>Conservás tus descubrimientos. Volvé al último santuario y observá las señales antes de atacar.</p><button class="primary" id="retry">VOLVER A INTENTAR</button>');$('#retry').onclick=()=>{p.hp=5;p.mana=3;p.inv=1;resetEncounters();save();enter(checkpoint.room,checkpoint.x,checkpoint.y);resume();};}}
function hit(e,amount){if(e.hp<=0)return;e.hp-=amount;e.hit=.16;burst(e.x+e.w/2,e.y+e.h/2,'#a52d35');if(e.hp<=0)killEnemy(e);beep(220,.07,'square');if(e.hp<=0&&e.type==='boss'){enemies=enemies.filter(enemy=>!enemy.summoned);arrows=[];waves=[];progress.boss=true;save();mode='win';panel('<div class="eyebrow">CAPÍTULO I · COMPLETADO</div><h2>El bosque vuelve a respirar</h2><div class="ornament">─ ᛟ ─</div><p>La corona cayó. La primera página volvió a hablar.<br>Pero el grimorio todavía guarda muchos silencios.</p><p>Obtuviste el sello del bosque.<br>La historia continuará en el siguiente capítulo.</p><button class="primary" id="explore">SEGUIR EXPLORANDO</button>');$('#explore').onclick=resume;}}
function physics(a,dt){const bottom=a.y+a.h;a.vy+=1050*dt;a.x+=a.vx*dt;a.y+=a.vy*dt;a.ground=false;for(const [x,y,w]of rooms[room].platforms)if(a.vy>=0&&bottom<=y+3&&a.y+a.h>=y&&a.x+a.w>x&&a.x<x+w){a.y=y-a.h;a.vy=0;a.ground=true;}}
function interact(){for(const [type,x,y]of rooms[room].items){if(Math.hypot(p.x+9-x,p.y+32-y)>65)continue;if(type==='shrine'){checkpoint={room,x:x-9,y:y-32};p.hp=5;p.mana=3;resetEncounters();enter(room,p.x,p.y);p.inv=1.25;save();toast('Santuario encendido · Progreso guardado · Salud y magia restauradas');beep(600,.3);}if(type==='dash'&&!progress.dash){progress.dash=true;save();toast('BOTAS DEL VIENTO · Shift para impulsarte, incluso en el aire.');beep(650,.3);}if(type==='book'&&!progress.book){progress.book=true;save();toast('GRIMORIO ANTIGUO · Buscá las páginas perdidas. Tab para consultar tus hallazgos.');}if(type==='page'&&!progress.page){progress.page=true;save();toast('PÁGINA ENCONTRADA · Investigala en el grimorio con Tab para comprenderla.');}if(type==='page'&&progress.book&&!progress.spell){offset=0;cipher();}}}
function updateBoss(e,dt){const fast=e.hp<=e.max/2;if(fast&&!e.hordeCalled&&e.ground){e.hordeCalled=true;e.state='summon';e.timer=1.1;e.vx=0;beep(75,.5,'sawtooth');}if(e.state==='summon'){if(e.timer<=0){summonHorde();e.state='recover';e.timer=1.2;}return;}if(e.state==='idle'&&e.timer<=0){e.turn++;e.move=(e.turn-1)%3;e.state='wind';e.timer=fast?.65:.9;e.lock=e.face;}else if(e.state==='wind'&&e.timer<=0){e.state='strike';e.timer=e.move===0?.6:e.move===1?1.3:.65;if(e.move===1){e.vy=-560;e.target=Math.max(80,Math.min(830,p.x));}beep(95,.2,'sawtooth');}else if(e.state==='strike'){if(e.move===0){e.face=e.lock;const b={x:e.lock>0?e.x+e.w:e.x-100,y:e.y-8,w:100,h:85};if(overlap(p,b))hurt(e.x);}if(e.move===1){e.vx=(e.target-e.x)*2;if(e.ground&&e.timer<.8){for(const dir of [-1,1])waves.push({x:e.x+26,y:458,w:24,h:22,vx:dir*(fast?300:220),life:3});shake=.3;e.timer=0;}}if(e.move===2){e.face=e.lock;e.vx=e.lock*(fast?470:360);if(overlap(p,e))hurt(e.x);}if(e.timer<=0){e.state='recover';e.timer=fast?.65:1.15;}}else if(e.state==='recover'&&e.timer<=0){e.state='idle';e.timer=.35;}}
function tick(dt){time+=dt;if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('#toast').classList.remove('show');}if(mode!=='play'){pressed.clear();return;}for(const k of ['inv','attack','cool','dash','dashCool','magicCool'])p[k]=Math.max(0,p[k]-dt);shake=Math.max(0,shake-dt);p.coyote=p.ground?.1:Math.max(0,p.coyote-dt);
 const dir=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);if(dir)p.face=dir;if(p.dash<=0)p.vx=dir*190;
 if((pressed.has('Space')||pressed.has('KeyW')||pressed.has('ArrowUp'))&&p.coyote>0){p.vy=-500;p.coyote=0;p.ground=false;beep(420,.08);}
 if((pressed.has('ShiftLeft')||pressed.has('ShiftRight'))&&progress.dash&&p.dashCool<=0){p.dash=.18;p.dashCool=.75;p.vx=p.face*560;beep(500,.1);}
 if(p.dash>0){p.vy=-1050*dt;burst(p.x+9,p.y+18,'#82b6a2',1);}if(pressed.has('KeyJ')&&p.cool<=0){p.attack=.2;p.cool=.36;serial++;beep(380,.08);}
 if(pressed.has('KeyK')&&progress.spell&&p.magicCool<=0&&p.mana>0){p.mana--;p.magicCool=.45;shots.push({x:p.x+9,y:p.y+13,w:12,h:9,vx:p.face*430,life:1.8});beep(720,.15,'sawtooth');}
 physics(p,dt);if(room===2&&!progress.thorns&&p.x>100){p.x=100;p.vx=0;}
 const boss=enemies.find(e=>e.type==='boss'&&e.hp>0);if(boss)p.x=Math.max(8,Math.min(932,p.x));const ex=rooms[room].exits;
 if(p.x>948){if(ex.right!==undefined)enter(ex.right,20,420);else p.x=942;}else if(p.x< -6){if(ex.left!==undefined)enter(ex.left,920,420);else p.x=0;}
 if(p.y< -25&&ex.up!==undefined)enter(ex.up,880,420);if(p.y>570){if(ex.down!==undefined)enter(ex.down,850,55);else{hurt(p.x);if(mode==='play'){p.x=60;p.y=400;p.vy=0;}}}if(pressed.has('KeyE'))interact();
 const sword={x:p.face>0?p.x+p.w:p.x-46,y:p.y-2,w:46,h:39};for(const e of enemies){if(e.hp<=0)continue;e.hit=Math.max(0,e.hit-dt);e.timer-=dt;const dist=p.x-e.x;e.face=dist<0?-1:1;e.vx=0;
 if(e.type==='archer')updateArcher(e,dt);else if(e.type==='boss')updateBoss(e,dt);else if(e.state==='idle'){if(Math.abs(dist)<65&&Math.abs(p.y-e.y)<55){e.state='wind';e.timer=e.type==='hob'?.48:.32;e.lock=e.face;}else if(Math.abs(dist)<620)e.vx=e.face*(e.type==='hob'?165:180);}else if(e.state==='wind'&&e.timer<=0){e.state='strike';e.timer=.18;}else if(e.state==='strike'){e.face=e.lock;e.vx=e.lock*(e.type==='hob'?165:180);const box={x:e.face>0?e.x+e.w:e.x-45,y:e.y,w:45,h:e.h};if(overlap(p,box))hurt(e.x);if(e.timer<=0){e.state='recover';e.timer=e.type==='hob'?.7:.42;}}else if(e.state==='recover'&&e.timer<=0)e.state='idle';
 guardLedge(e,dt);physics(e,dt);e.x=Math.max(10,Math.min(930-e.w,e.x));if(e.y>600){e.hp=0;killEnemy(e);}if(p.attack>0&&overlap(sword,e)&&e.attackId!==serial){e.attackId=serial;hit(e,1);p.mana=Math.min(3,p.mana+1);}}
 updateArrows(dt);for(const s of shots){s.x+=s.vx*dt;s.life-=dt;burst(s.x,s.y,'#e6af64',1);if(room===2&&!progress.thorns&&s.x>115){progress.thorns=true;s.life=0;save();burst(138,435,'#e9a44c',35);addBoss();}for(const e of enemies)if(s.life>0&&e.hp>0&&overlap(s,e)){hit(e,2);s.life=0;}}shots=shots.filter(s=>s.life>0);for(const w of waves){w.x+=w.vx*dt;w.life-=dt;if(overlap(p,w))hurt(w.x);}waves=waves.filter(w=>w.life>0);for(const corpse of deathPoses)corpse.life-=dt;deathPoses=deathPoses.filter(c=>c.life>0);for(const a of particles){a.x+=a.vx*dt;a.y+=a.vy*dt;a.vy+=230*dt;a.life-=dt;}particles=particles.filter(a=>a.life>0).slice(-250);
 $('#health').textContent='♥'.repeat(Math.max(0,p.hp))+'♡'.repeat(Math.max(0,5-p.hp));$('#mana').textContent=progress.spell?'◆'.repeat(p.mana)+'◇'.repeat(3-p.mana):'— MAGIA DORMIDA —';$('#bossbar').hidden=!boss||boss.hp<=0;if(boss)$('#bossbar i').style.width=`${Math.max(0,boss.hp/boss.max*100)}%`;pressed.clear();}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}function label(t,x,y,c='#d5d9af',size=10){ctx.fillStyle=c;ctx.font=`${size}px monospace`;ctx.textAlign='center';ctx.fillText(t,Math.round(x),Math.round(y));}
function background(){const type=rooms[room].kind,g=ctx.createLinearGradient(0,0,0,540);g.addColorStop(0,type==='canopy'?'#42654f':'#24473d');g.addColorStop(1,'#0b231e');ctx.fillStyle=g;ctx.fillRect(0,0,960,540);ctx.globalAlpha=.08;for(let i=0;i<5;i++){ctx.fillStyle='#e1efb5';ctx.beginPath();ctx.moveTo(170+i*185,0);ctx.lineTo(220+i*185,0);ctx.lineTo(65+i*185,490);ctx.lineTo(-30+i*185,490);ctx.fill();}ctx.globalAlpha=1;for(let layer=0;layer<3;layer++){const col=['#2c5040','#1d3d30','#142f25'][layer];for(let i=0;i<9;i++){const x=((i*151+layer*63)%1080)-60,w=18+layer*15;rect(x,0,w,490,col);rect(x-w*.5,115+(i%3)*70,w*2,11,col);ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(x,290);ctx.lineTo(x-65,180);ctx.lineTo(x-58,174);ctx.lineTo(x+w,295);ctx.fill();for(let j=0;j<5;j++)rect(x-70+j*17,(i%3)*35+j%2*18,110,30,col);}}if(type==='ruins'||type==='boss'){for(let i=0;i<6;i++){const x=70+i*170;rect(x,270,45,210,'#314638');rect(x-7,267,59,13,'#4b5b44');rect(x+7,286,6,185,'#3a5140');for(let j=0;j<5;j++)rect(x,300+j*34,45,2,'#21372b');}if(type==='boss'){rect(430,334,110,146,'#474932');rect(448,290,74,160,'#5a5639');rect(460,308,50,128,'#293a29');}}for(let i=0;i<36;i++){ctx.globalAlpha=.25+Math.sin(time*1.5+i)*.18;rect((i*83+Math.sin(time*.5+i)*14+960)%960,(i*47+Math.sin(time*.7+i)*18)%475,2,2,'#d5e39a');}ctx.globalAlpha=1;}
function platform(x,y,w,h){rect(x,y,w,h,'#29372a');rect(x,y,w,5,'#839552');rect(x,y+5,w,6,'#4e673b');for(let i=0;i<w;i+=16){rect(x+i,y-3-i%3,9,5,'#6c8448');rect(x+i+3,y+12,9,4,'#39462e');if(h>20){rect(x+i,y+28,12,3,'#1a2b22');rect(x+i+7,y+44,5,5,'#43513a');}}if(h<25)for(let i=8;i<w;i+=28){rect(x+i,y+h,3,12+i%11,'#3d5635');rect(x+i-3,y+h+6,6,3,'#5c7040');}}
function sprite(a,hero=false){const x=Math.round(a.x),y=Math.round(a.y),boss=a.type==='boss';ctx.save();ctx.translate(x+a.w/2,y);ctx.scale(a.face*(boss?2:1),boss?2:1);const moving=Math.abs(a.vx)>5,walk=a.ground&&moving?Math.sin(time*15)*4:0;const bob=a.ground?(moving?Math.abs(Math.sin(time*15))*1.5:Math.sin(time*3)*.6):0;ctx.translate(a.hit>0?-2:0,bob);if(hero&&p.dash>0){ctx.translate(0,7);ctx.transform(1,0,-.28,.8,0,0);}else if(boss&&a.state==='summon'){ctx.translate(0,-2+Math.sin(time*22));ctx.scale(1.04,1.04);}else if(boss&&a.state==='wind'){const t=1-Math.max(0,a.timer)/(a.hp<=a.max/2?.65:.9);if(a.move===0){ctx.translate(-3*t,0);ctx.rotate(-.08*t);}else if(a.move===1){ctx.translate(0,7*t);ctx.scale(1+.1*t,1-.2*t);}else{ctx.translate(-3*t,3*t);ctx.transform(1,0,.18*t,1,0,0);}}else if(a.state==='wind'){ctx.translate(-2,3);ctx.scale(1.08,.92);}else if(a.state==='strike'){ctx.translate(3,0);}if(hero){if(p.inv>0&&Math.floor(time*15)%2===0)ctx.globalAlpha=.35;rect(-8,11,16,17,'#b7c6b0');rect(-9,16,6,17,'#31524c');rect(-7,28+walk,5,5,'#273831');rect(3,28-walk,5,5,'#273831');rect(-7,0,14,13,'#718d7d');rect(-5,2,11,10,'#d7d7b4');rect(-8,-2,15,5,'#bcc9ad');rect(-9,4,5,9,'#8da18d');rect(1,5,5,2,'#203c34');rect(-10,13,19,5,'#bb724e');rect(-18-(moving?4:0),14+Math.sin(time*12)*2,12,4,'#a65c40');ctx.save();ctx.translate(7,17);ctx.rotate(p.attack>0?-2.2+(1-p.attack/.2)*3.5:(a.ground?walk*.08:-.5));rect(0,0,4,10,'#cec3a1');rect(3,-19,3,26,'#dbdbb3');rect(0,3,9,3,'#9a8654');ctx.restore();if(p.attack>0){const angle=-1.3+(1-p.attack/.2)*2.2;ctx.strokeStyle='#eee8b5';ctx.lineWidth=4;ctx.beginPath();ctx.arc(6,18,37,angle-.8,angle);ctx.stroke();}}else{const skin=a.hit>0?'#fff0ca':boss?'#90a46b':a.type==='hob'?'#849268':'#91aa65';rect(-9,2,18,14,skin);rect(-14,5,7,6,skin);rect(9,5,6,6,skin);rect(2,7,5,3,'#e6c878');rect(3,8,3,2,'#18271b');rect(-9,17,19,boss?13:12,boss?'#794f36':'#554f32');rect(-10,16,20,5,boss?'#b49957':'#827952');rect(-7,28+walk,5,7,skin);rect(3,28-walk,5,7,skin);if(a.type==='archer'){drawBow(a);}else{ctx.save();ctx.translate(10,18);ctx.rotate(boss&&a.state==='summon'?-2.6:boss&&a.state==='wind'?[-2.1,-.5,.35][a.move]:a.state==='wind'?-1.7:a.state==='strike'?1.2:a.state==='recover'?.5:walk*.06);rect(0,0,5,8,skin);rect(4,-6,4,22,'#8c7046');rect(2,-8,10,8,'#acb39b');ctx.restore();}if(boss){rect(-10,-5,21,7,'#c4a555');rect(-10,-10,4,7,'#d6bf72');rect(-2,-13,4,10,'#d6bf72');rect(7,-10,4,7,'#d6bf72');}if(a.type==='hob'){rect(-10,14,8,24,'#797b62');rect(-7,17,2,18,'#b9af7c');}}ctx.restore();if(boss&&a.state==='strike'&&a.move===0){ctx.strokeStyle='#ecc692';ctx.lineWidth=6;ctx.beginPath();ctx.arc(x+a.w/2,y+36,95,a.face>0?-1.1:2,a.face>0?1.1:4.2);ctx.stroke();}if(!hero&&a.hp<a.max&&!boss){rect(x,y-7,a.w,3,'#182a22');rect(x,y-7,a.w*a.hp/a.max,3,'#b9bb7c');}}
function item(type,x,y){const bob=Math.sin(time*2)*3;if(type==='shrine'){rect(x-14,y-21,28,21,'#657363');rect(x-19,y-24,38,6,'#8e9b7b');rect(x-7,y-48,14,25,'#789785');rect(x-3,y-44,6,16,'#bbe3ba');ctx.globalAlpha=.13+Math.sin(time*2)*.04;ctx.fillStyle='#a3e9b3';ctx.beginPath();ctx.arc(x,y-33,40,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}if(type==='dash'&&!progress.dash){rect(x-12,y-19+bob,8,16,'#a9bc9b');rect(x+2,y-19+bob,8,16,'#a9bc9b');rect(x-12,y-7+bob,13,5,'#d7c990');rect(x+2,y-7+bob,13,5,'#d7c990');}if(type==='book'&&!progress.book){rect(x-15,y-24+bob,30,21,'#b09053');rect(x-12,y-22+bob,24,16,'#d6ca95');rect(x-1,y-22+bob,2,17,'#6f6240');label('ᛟ',x,y-8+bob,'#676946',14);}if(type==='page'&&!progress.page){rect(x-9,y-28+bob,18,25,'#d4d2a0');for(let i=0;i<4;i++)rect(x-5,y-23+i*4+bob,10-i%2*4,1,'#7b8860');}if(type==='gate'&&!progress.thorns){for(let i=0;i<6;i++){rect(x-7+i%2*8,y-20-i*18,12,25,'#53623a');rect(x-19,y-16-i*18,35,5,'#71834a');}label('ZARZAS ANTIGUAS',x+30,y-130,'#b6c28a',9);}const active=type==='shrine'||type==='dash'&&!progress.dash||type==='book'&&!progress.book||type==='page'&&!progress.page;if(active){label(type==='shrine'?'SANTUARIO':type==='dash'?'BOTAS DEL VIENTO':type==='book'?'GRIMORIO':'PÁGINA PERDIDA',x,y-61,'#c0c69a',8);if(mode==='play'&&Math.hypot(p.x+9-x,p.y+32-y)<65)label('[ E ]',x,y-78,'#efe2ae',12);}}
function draw(){ctx.save();if(shake>0)ctx.translate(Math.sin(time*90)*4,Math.cos(time*80)*3);background();for(const a of rooms[room].platforms)platform(...a);drawBlood();for(const a of rooms[room].items)item(...a);const ex=rooms[room].exits;if(ex.up!==undefined){label('↑ HACIA LAS ALTURAS',868,66,'#d6ce97',9);rect(870,0,2,42,'#c9bc7877');}if(ex.left!==undefined)label('‹',20,439,'#d9cc91',24);if(ex.right!==undefined)label('›',940,439,'#d9cc91',24);if(ex.down!==undefined)label('↓ DESCENSO',815,517,'#d6ce97',9);for(const corpse of deathPoses){ctx.save();ctx.globalAlpha=Math.min(1,corpse.life*2);ctx.translate(corpse.x+corpse.w/2,corpse.y+corpse.h);ctx.rotate((1-corpse.life/.65)*corpse.face*1.5);ctx.translate(-corpse.x-corpse.w/2,-corpse.y-corpse.h);sprite(corpse);ctx.restore();}for(const e of enemies)if(e.hp>0)sprite(e);if(mode!=='title')sprite(p,true);drawArrows();for(const s of shots){rect(s.x,s.y,12,8,'#f2d091');rect(s.x+3,s.y+2,6,4,'#fff1b1');}for(const w of waves){rect(w.x,w.y,w.w,w.h,'#c8b37b');rect(w.x+5,w.y-7,8,10,'#8eab7a');}for(const a of particles){ctx.globalAlpha=Math.min(1,a.life*2);rect(a.x,a.y,3,3,a.color);}ctx.globalAlpha=1;for(let i=0;i<22;i++){rect(i*47,529,8,11,'#0a1c18');rect(i*47+5,521+i%3*4,4,19,'#0a1c18');}const v=ctx.createRadialGradient(480,240,140,480,270,570);v.addColorStop(0,'#06110d00');v.addColorStop(1,'#06110da8');ctx.fillStyle=v;ctx.fillRect(0,0,960,540);ctx.restore();}
let last=0,acc=0;function frame(ms){acc+=Math.min((ms-last)/1000,.05);last=ms;while(acc>=1/60){tick(1/60);acc-=1/60;}draw();requestAnimationFrame(frame);}title();requestAnimationFrame(frame);

function bindMenu(){
  const button=$('#sound');
  if(button){button.textContent=`SONIDO: ${sound?'ON':'OFF'}`;button.onclick=()=>{sound=!sound;button.textContent=`SONIDO: ${sound?'ON':'OFF'}`;beep(650);};}
  if($('#fullscreen'))$('#fullscreen').onclick=toggleFullscreen;
}
async function toggleFullscreen(){
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{toast('Usá F11 para activar la pantalla completa del navegador.');}
}

// Ordinary enemies remain defeated until a shrine rest or return after death.
function resetEncounters(){defeated.clear();bloodByRoom={};deathPoses=[];}
function killEnemy(e){
 if(e.id)defeated.add(e.id);
 burst(e.x+e.w/2,e.y+e.h/2,'#bc303c',e.type==='boss'?65:32);
 burst(e.x+e.w/2,e.y+e.h/2,'#681b29',18);
 deathPoses.push({...e,state:'dead',hit:0,life:.65});
 const surface=rooms[room].platforms.filter(([x,y,w])=>e.x+e.w>x&&e.x<x+w&&y>=e.y+e.h-4).sort((a,b)=>a[1]-b[1])[0];
 if(surface){
  const stains=bloodByRoom[room]??=[];
  const center=Math.max(surface[0]+4,Math.min(surface[0]+surface[2]-4,e.x+e.w/2));
  for(let i=0;i<12;i++)stains.push({x:Math.max(surface[0],Math.min(surface[0]+surface[2]-8,center+(Math.random()-.5)*40)),y:surface[1]-2+Math.random()*5,w:3+Math.random()*8,h:2+Math.random()*3,color:i%3?'#771e2d':'#a32c37'});
  bloodByRoom[room]=stains.slice(-240);
 }
 save();
}
function drawBlood(){for(const s of bloodByRoom[room]||[])rect(s.x,s.y,s.w,s.h,s.color);}

// Archers lock their aim during the windup, leaving time to dodge.
function updateArcher(e,dt){
 if(e.state==='idle'&&e.timer<=0&&Math.hypot(p.x-e.x,p.y-e.y)<540){
  e.state='wind';e.timer=.85;
  const dx=p.x+p.w/2-e.x-e.w/2,dy=p.y+p.h/2-e.y-16;
  const length=Math.max(1,Math.hypot(dx,dy));
  e.aim={x:dx/length,y:dy/length};e.lock=e.face;
 }else if(e.state==='wind'){
  e.face=e.lock;
  if(e.timer<=0){
   arrows.push({x:e.x+e.w/2+e.aim.x*18,y:e.y+16+e.aim.y*18,w:8,h:6,vx:e.aim.x*285,vy:e.aim.y*285,life:3});
   e.state='recover';e.timer=1.5;beep(460,.08);
  }
 }else if(e.state==='recover'&&e.timer<=0){e.state='idle';e.timer=.4;}
}
function updateArrows(dt){
 for(const arrow of arrows){
  arrow.x+=arrow.vx*dt;arrow.y+=arrow.vy*dt;arrow.life-=dt;
  if(rooms[room].platforms.some(([x,y,w,h])=>h>16&&overlap(arrow,{x,y,w,h}))){arrow.life=0;continue;}
  if(overlap(p,arrow)){hurt(arrow.x);arrow.life=0;}
 }
 arrows=arrows.filter(a=>a.life>0&&a.x>-25&&a.x<985&&a.y>-25&&a.y<565);
}
function drawBow(a){
 rect(-12,16,5,16,'#554b34');rect(-13,10,2,14,'#c6b88a');rect(-9,-1,19,5,'#506f46');
 ctx.save();ctx.translate(11,17);
 const angle=a.aim?Math.atan2(a.aim.y,a.aim.x*a.face):0;
 ctx.rotate(angle);
 rect(-3,-2,8,4,'#91aa65');
 ctx.strokeStyle='#b48b59';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(4,-13);ctx.lineTo(11,-7);ctx.lineTo(13,0);ctx.lineTo(11,7);ctx.lineTo(4,13);ctx.stroke();
 const pull=a.state==='wind'?Math.min(1,1-a.timer/.85):0;
 ctx.strokeStyle='#d5d0a3';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(4,-13);ctx.lineTo(4-pull*9,0);ctx.lineTo(4,13);ctx.stroke();
 if(a.state==='wind'){rect(-5-pull*5,-1,22,2,'#ded4a2');rect(15,-2,3,4,'#d9ddc0');}
 ctx.restore();
}
function drawArrows(){
 for(const a of arrows){ctx.save();ctx.translate(a.x+4,a.y+3);ctx.rotate(Math.atan2(a.vy,a.vx));rect(-12,-1,22,2,'#d4b985');rect(9,-2,4,4,'#e1e2c5');rect(-12,-3,5,2,'#b88063');rect(-12,1,5,2,'#b88063');ctx.restore();}
}

function summonHorde(){
 // Reinforcements belong to this attempt, not the persistent room spawns.
 for(const [x,y,type] of [[40,438,'hob'],[890,438,'hob'],[240,344,'archer'],[685,344,'archer']]){
  enemies.push({x,y,type,summoned:true,w:type==='hob'?26:22,h:type==='hob'?42:32,hp:type==='hob'?5:3,max:type==='hob'?5:3,vx:0,vy:0,face:x<480?1:-1,state:'recover',timer:1.4,hit:0,attackId:-1,home:x});
 }
}

// Keep grounded melee enemies on connected footing, including during lunges.
function guardLedge(e,dt){
 if(!e.ground||e.vx===0||!['goblin','hob'].includes(e.type))return;
 const foot=e.y+e.h;
 const direction=Math.sign(e.vx);
 const probe=e.x+e.w/2+e.vx*dt+direction*(e.w/2+3);
 const supported=rooms[room].platforms.some(([x,y,w])=>Math.abs(y-foot)<=8&&probe>=x&&probe<=x+w);
 if(!supported)e.vx=0;
}
