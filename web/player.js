const $ = s => document.querySelector(s);
const themes = {
  firered:{alt:'Red handheld game cartridge',description:'A classic handheld adventure, ready to continue anywhere.',edition:'FIRE / 01',color:'#cf402a'},
  emerald:{alt:'Green handheld game cartridge',description:'A classic handheld adventure, preserved on your own drive.',edition:'EMERALD / 02',color:'#287955'},
  leafgreen:{alt:'Leaf-green handheld game cartridge',description:'A classic handheld adventure with offline saves.',edition:'LEAF / 03',color:'#65852b'},
  homebrew:{alt:'Game cartridge',description:'A new world from an independent creator. Your next discovery is ready to play.',edition:'NEW ADVENTURES',color:'#377794'}
};
let library = [], selected = 0, playing = null, started = false, saveTimer, saving = null;
const mb = n => `${Math.round(n / 1048576)} MB`;
function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').hidden=true,4500); }
function openDialog(id) { $(id).showModal(); }
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#addTab').onclick=()=>openDialog('#addDialog');
$('#libraryTab').onclick=()=>{if(playing)$('#backButton').click();else $('#games').scrollIntoView({block:'nearest',behavior:'smooth'});};
$('#phoneButton').onclick=()=>openDialog('#phoneDialog');
$('#helpButton').onclick=()=>openDialog('#helpDialog');
$('#playerHelpButton').onclick=()=>openDialog('#helpDialog');
$('#importButton').onclick=()=>$('#romFile').click();
function selectGame(index) {
  if(!library.length)return;
  selected=(index+library.length)%library.length;
  const game=library[selected], theme=themes[game.theme];
  $('#featured').dataset.theme=game.theme;
  $('#gameTitle').textContent=game.title;
  $('#series').textContent=game.system==='nds'?'Nintendo DS':game.theme==='homebrew'?'Independent games':'Pokémon';
  $('#platform').textContent=game.system==='nds'?'NINTENDO DS':game.system==='gba'?'GAME BOY ADVANCE':'GAME BOY / GAME BOY COLOR';
  $('#description').textContent=game.system==='nds'?'A dual-screen adventure from an independent creator. Tap the lower screen to control it.':theme.description;
  $('#edition').textContent=theme.edition;
  $('#heroImage').src=game.theme==='homebrew'?'icon.svg':`assets/${game.theme}.svg`;
  $('#heroImage').alt=theme.alt;
  $('#heroImage').classList.remove('arrive'); void $('#heroImage').offsetWidth; $('#heroImage').classList.add('arrive');
  $('#playButton span').textContent=game.saved?'Continue game':'Play game';
  $('#saveNote').textContent=game.saved?'Your last session is on the drive':'Installed on your drive';
  $('#playButton').disabled=false;
  document.querySelectorAll('.game-card').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));
}
async function refreshLibrary() {
  const response=await fetch('/api/library');if(!response.ok)throw Error('Could not read the drive.');
  const data=await response.json();
  library=data.games.sort((a,b)=>['firered','emerald','leafgreen','homebrew'].indexOf(a.theme)-['firered','emerald','leafgreen','homebrew'].indexOf(b.theme));
  // The app's library is the ROMs bundled in it; which of them have a saved session lives in the
  // shell-mirrored store, not in the JSON.
  if(savesToApp()){const stored=new Set(await nativeSaves.keys());library.forEach(game=>{game.saved=stored.has(game.id);});}
  $('#gameCount').textContent=`${library.length} game${library.length===1?'':'s'} installed`;
  $('#driveStatus').textContent=`${savesToApp()?'On this iPhone':'Drive connected'} · ${mb(data.free)} free`;
  $('#driveMeter').style.width=`${100-data.free/data.total*100}%`;
  $('#phoneLink').href=data.phoneURL;$('#phoneLink').textContent=data.phoneURL;
  $('#games').replaceChildren();
  library.forEach((game,i)=>{
    const b=document.createElement('button');b.className='game-card';b.setAttribute('aria-label',`Select ${game.title}`);
    if(game.theme!=='homebrew'){const img=document.createElement('img');img.src=`assets/${game.theme}.svg`;img.alt='';b.append(img);}
    else {const icon=document.createElement('span');icon.className='generic-art';icon.textContent=game.system.toUpperCase();b.append(icon);}
    const text=document.createElement('span');text.className='card-text';
    for(const [tag,content,cls] of [['small',game.theme==='homebrew'?'HOMEBREW':'POKÉMON',''],['strong',game.title,''],['small',game.system==='nds'?'Nintendo DS':game.system==='gba'?'Game Boy Advance':'Game Boy','card-system']]){const el=document.createElement(tag);el.textContent=content;el.className=cls;text.append(el);}
    const check=document.createElement('span');check.className='check';check.textContent='✓';check.setAttribute('aria-hidden','true');b.append(text,check);b.onclick=()=>selectGame(i);$('#games').append(b);
  });
  selectGame(Math.min(selected,library.length-1));
  if(!library.length){$('#description').textContent='Your collection starts here. Add a game to get playing.';$('#playButton').disabled=true;}
}
async function importFiles(files) {
  $('#importButton').disabled=true;
  let added=0;const failures=[];
  for(const file of files){
    $('#importStatus').textContent=`Copying ${file.name} to your drive…`;
    try {
      if(!/\.(gba|gb|gbc|nds)$/i.test(file.name))throw Error('Unzip the download and choose a .gba, .gb, .gbc, or .nds file.');
      if(file.size>64*1048576)throw Error('Games must be 64 MB or smaller.');
      const r=await fetch('/api/import',{method:'POST',headers:{'X-Filename':encodeURIComponent(file.name)},body:file});
      const result=await r.json();if(!r.ok)throw Error(result.error);added++;
    }catch(e){failures.push(`${file.name}: ${e.message}`);}
  }
  $('#importStatus').textContent=[added?`${added} game${added===1?'':'s'} added. Ready to play.`:'',...failures].join(' ');
  $('#importButton').disabled=false;$('#romFile').value='';await refreshLibrary();
}
$('#romFile').onchange=e=>importFiles([...e.target.files]);
const drop=$('#dropZone');drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag');};drop.ondragleave=()=>drop.classList.remove('drag');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');importFiles([...e.dataTransfer.files]);};
async function saveSession(quiet=false) {
  if(!started)return false;
  if(saving)return saving;
  saving=(async()=>{
    try{
      const state=window.EJS_emulator.gameManager.getState();
      if(savesToApp())await nativeSaves.put(playing.id,state);
      else{
        const r=await fetch(`/api/save/${playing.id}`,{method:'POST',body:state});
        if(!r.ok)throw Error((await r.json()).error);
      }
      $('#playStatus').textContent=`Saved to ${savesLabel()} · ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
      if(!quiet)toast(`Session saved to ${savesLabel()}.`);return true;
    }catch(e){$('#playStatus').textContent=`Save failed: ${e.message}`;if(!quiet)toast(`Could not save to ${savesLabel()}. Try again.`);return false;}
    finally{saving=null;}
  })();return saving;
}
$('#saveButton').onclick=()=>saveSession();
const controllerButtons=[...document.querySelectorAll('.control[data-input]')];
const activePointers=new Map();
function setControllerVisual(button,pressed){
  button.classList.toggle('pressed',pressed);button.setAttribute('aria-pressed',String(pressed));
  if(pressed)$('#controllerStatus').textContent=`${button.getAttribute('aria-label').toUpperCase()} · PRESSED`;
  else if(!activePointers.size)$('#controllerStatus').textContent='CONTROLLER READY';
}
function sendControllerInput(button,pressed){
  if(!started||!window.EJS_emulator?.gameManager){
    $('#controllerStatus').textContent='WAITING FOR GAME';return;
  }
  window.EJS_emulator.gameManager.simulateInput(0,Number(button.dataset.input),pressed?1:0);
  setControllerVisual(button,pressed);
}
controllerButtons.forEach(button=>{
  button.addEventListener('pointerdown',event=>{
    event.preventDefault();button.setPointerCapture?.(event.pointerId);activePointers.set(event.pointerId,button);sendControllerInput(button,true);
  });
  const release=event=>{
    if(activePointers.get(event.pointerId)!==button)return;
    activePointers.delete(event.pointerId);sendControllerInput(button,false);
  };
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  button.addEventListener('keydown',event=>{
    if(!['Enter',' '].includes(event.key)||event.repeat)return;
    event.preventDefault();sendControllerInput(button,true);
  });
  button.addEventListener('keyup',event=>{
    if(!['Enter',' '].includes(event.key))return;
    event.preventDefault();sendControllerInput(button,false);
  });
  // Accessibility APIs issue a synthetic click without pointer events.
  button.addEventListener('click',event=>{
    if(event.detail!==0)return;
    sendControllerInput(button,true);setTimeout(()=>sendControllerInput(button,false),80);
  });
  button.addEventListener('contextmenu',event=>event.preventDefault());
});
const baseKeyboardControls={ArrowUp:4,ArrowDown:5,ArrowLeft:6,ArrowRight:7,KeyX:8,KeyZ:0,Enter:3,ShiftLeft:2,ShiftRight:2,KeyA:10,KeyS:11};
const keyboardControls=()=>playing?.system==='nds'?{...baseKeyboardControls,KeyC:9,KeyD:1}:baseKeyboardControls;
window.addEventListener('keydown',event=>{if(event.target.closest?.('.control'))return;const input=keyboardControls()[event.code];if(input===undefined||event.repeat)return;const button=controllerButtons.find(item=>Number(item.dataset.input)===input);if(button)setControllerVisual(button,true);});
window.addEventListener('keyup',event=>{if(event.target.closest?.('.control'))return;const input=keyboardControls()[event.code];if(input===undefined)return;const button=controllerButtons.find(item=>Number(item.dataset.input)===input);if(button)setControllerVisual(button,false);});
$('#backButton').onclick=async()=>{
  $('#backButton').disabled=true;
  if(started && !await saveSession(true)){$('#backButton').disabled=false;toast(`Save failed. Try again before leaving.`);return;}
  clearInterval(saveTimer);started=false;location.reload();
};
/**
 * Where a session lives.
 *
 * On the drive the player talks to the local server: POST and GET `/api/save/<id>`. Inside the
 * iOS app there is no server, so the shell sets `window.PocketFieldNative` and the same sessions
 * go to an IndexedDB store instead — a store the shell mirrors to a native file, so a state
 * survives the app being closed the way a drive state survives the drive being ejected.
 */
const savesToApp=()=>window.PocketFieldNative===true;
const nativeSaves=(()=>{
  const DB='pocketfield-saves',STORE='state';let opening=null;
  const open=()=>opening??=(opening=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  }));
  const run=async(mode,work)=>{const db=await open();return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,mode);const request=work(transaction.objectStore(STORE));
    transaction.oncomplete=()=>resolve(request?request.result:undefined);
    transaction.onerror=()=>reject(transaction.error);
  });};
  return {
    put:(id,state)=>run('readwrite',store=>store.put(state,id)),
    get:id=>run('readonly',store=>store.get(id)),
    keys:async()=>(await run('readonly',store=>store.getAllKeys()))||[],
  };
})();
const savesLabel=()=>savesToApp()?'this iPhone':'your drive';
$('#playButton').onclick=async()=>{
  if(playing||!library[selected])return;
  playing=library[selected];const theme=themes[playing.theme];
  $('#library').hidden=true;$('header').hidden=true;$('#playScreen').hidden=false;document.querySelector('.console').classList.toggle('is-nds',playing.system==='nds');$('#playingTitle').textContent=`${playing.theme==='homebrew'?'':'Pokémon '}${playing.title}`;
  $('#playStatus').textContent='Starting your game…';
  window.EJS_player='#game';window.EJS_core=playing.system;window.EJS_gameUrl=`/api/rom/${playing.id}`;
  window.EJS_gameName=playing.filename;window.EJS_gameID=parseInt(playing.id.slice(0,10),16);
  window.EJS_pathtodata='/emulator/';window.EJS_startOnLoaded=true;window.EJS_color=theme.color;
  window.EJS_language='en-US';window.EJS_disableAutoLang=false;window.EJS_threads=false;window.EJS_volume=.5;
  window.EJS_defaultOptions={'ejs_threads':'disabled'};
  window.EJS_Buttons={saveState:false,loadState:false,saveSav:true,loadSav:true};
  if(playing.saved){
    const savedState=savesToApp()?await nativeSaves.get(playing.id):null;
    window.EJS_loadStateURL=savesToApp()?(savedState?URL.createObjectURL(savedState):null):`/api/save/${playing.id}`;
  }
  window.EJS_onGameStart=()=>{started=true;$('#saveButton').disabled=false;$('#playStatus').textContent=`Have fun. Sessions save to ${savesLabel()} every 20 seconds.`;saveTimer=setInterval(()=>saveSession(true),20000);};
  const loader=document.createElement('script');loader.src='/emulator/loader.js';loader.onerror=()=>$('#playStatus').textContent='The emulator files could not be read. Check the drive.';document.body.append(loader);
};
window.addEventListener('keydown',e=>{if(playing||document.querySelector('dialog[open]')||['INPUT','BUTTON','A'].includes(e.target.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();selectGame(selected+1);}if(e.key==='ArrowLeft'){e.preventDefault();selectGame(selected-1);}if(e.key==='Enter')$('#playButton').click();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started)saveSession(true);});
window.addEventListener('beforeunload',e=>{if(started){e.preventDefault();e.returnValue='Save your session before leaving.';}});
// Remove the earlier shell-only cache: the complete runtime now lives on the drive.
if('serviceWorker' in navigator)navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));
refreshLibrary().catch(e=>{$('#driveStatus').textContent=savesToApp()?'Library unavailable':'Drive unavailable';$('#description').textContent=savesToApp()?'The bundled games could not be read.':'Open Pocket Field.app from your connected drive.';toast(e.message);});
