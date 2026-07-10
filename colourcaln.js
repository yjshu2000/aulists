//bloop
const RATINGS = [
  {id:'red',         label:'bruh',     emoji:'💀', colour:'var(--c-red)',         desc:'failed all basics'},
  {id:'red-orange',  label:'aauugh',   emoji:'😬', colour:'var(--c-red-orange)',  desc:'failed some basics'},
  {id:'orange',      label:'aur naur', emoji:'🙁', colour:'var(--c-orange)',      desc:'basics done; no tasks'},
  {id:'yellow',      label:'hrmh',     emoji:'😐', colour:'var(--c-yellow)',      desc:'some/few tasks done'},
  {id:'yellow-green',label:'eehh',     emoji:'🙃', colour:'var(--c-yellow-green)',desc:'most tasks done'},
  {id:'green',       label:'decent',   emoji:'🙂', colour:'var(--c-green)',       desc:'all (min) tasks done'},
  {id:'cyan',        label:'yippee',   emoji:'🤩', colour:'var(--c-cyan)',        desc:'more than min tasks done'},
];
const AWAY = {id:'purple', label:'away', emoji:'😶‍🌫️', colour:'var(--c-purple)', desc:'away from home'}
const RMAP = Object.fromEntries(RATINGS.map(r=>[r.id,r]));
const WIN_SHORT = 30;
const WIN_LONG  = 360;

let data = {};        // { "YYYY-MM-DD": ratingId }
let storageOK = true;

// ---- date helpers (local time) ----
/**
 * Returns today's date with the time zeroed out, in local time.
 * @returns {Date} today at midnight.
 */
function today(){
  const n=new Date();
  return new Date(n.getFullYear(),n.getMonth(),n.getDate());
}
/**
 * Formats a date as the "YYYY-MM-DD" key used to index `data`.
 * @param {Date} d - the date to format.
 * @returns {string} the storage key.
 */
function toKey(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+
    String(d.getDate()).padStart(2,'0');
}
/**
 * Parses a "YYYY-MM-DD" storage key back into a Date.
 * @param {string} k - the storage key.
 * @returns {Date} the parsed local-time date.
 */
function fromKey(k){
  const [y,m,d]=k.split('-').map(Number);
  return new Date(y,m-1,d);
}
/**
 * Adds (or subtracts) whole days to a date.
 * @param {Date} d - starting date.
 * @param {number} n - number of days to add; negative to subtract.
 * @returns {Date} a new Date `n` days after `d`.
 */
function addDays(d,n){
  const x=new Date(d);
  x.setDate(x.getDate()+n);
  return x;
}
/**
 * Finds the Sunday that starts the week containing a date.
 * @param {Date} d - any date within the target week.
 * @returns {Date} that week's Sunday.
 */
function startOfWeekSun(d){
  const x=new Date(d);
  x.setDate(x.getDate()-x.getDay());
  return x;
}
/**
 * Formats a date as a long label, e.g. "Wednesday, Jul 8".
 * @param {Date} d - the date to format.
 * @returns {string} the formatted label.
 */
function fmtLong(d){
  return d.toLocaleDateString(undefined,
    {weekday:'long',month:'short',day:'numeric'});
}
/**
 * Formats a date as a short label, e.g. "Jul 8".
 * @param {Date} d - the date to format.
 * @returns {string} the formatted label.
 */
function fmtShort(d){
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}

// ---- storage ----
/**
 * Loads saved ratings from localStorage into `data`. Leaves `data` untouched
 * (empty) if nothing is stored or storage is unavailable.
 */
async function load(){
  try{
    const raw = localStorage.getItem('ratings');
    if(raw) data = JSON.parse(raw) || {};
  }catch(e){ storageOK=false; }
}
/**
 * Persists `data` to localStorage and refreshes the storage status note.
 */
async function persist(){
  try{
    localStorage.setItem('ratings', JSON.stringify(data));
    storageOK=true;
  }
  catch(e){ storageOK=false; }
  setStatus();
}
/**
 * Updates the status line to reflect whether saving to this device is currently
 * working.
 */
function setStatus(){
  const s=document.getElementById('status');
  if (storageOK) {
    s.textContent = 'saved on this device · export to transfer data';
  } else {
    s.textContent = 'not saved — this browser is blocking local storage,'+
    ' use export to keep it';
  }
}

/**
 * Sets (or clears) a day's rating and re-renders.
 * @param {string} key - the "YYYY-MM-DD" day key.
 * @param {?string} id - a rating id to set, or null to clear the day.
 */
function setRating(key, id){
  if(id===null){
    delete data[key];
  } else {
    data[key]=id;
  }
  persist();
  renderAll();
}

// ---- rating option buttons (shared markup) ----
/**
 * Builds the shared row of rating-option buttons (used by both the yesterday
 * bar and the day editor sheet). Clicking the already-selected option toggles
 * it off (picks null).
 * @param {?string} currentId - the day's current rating id, if any.
 * @param {Function} onPick - called with the picked rating id, or null if the
 *   current selection was toggled off.
 * @returns {Element} a `display: contents` wrapper containing the option
 *   buttons.
 */
function optButtons(currentId, onPick){
  const wrap=document.createElement('div');
  wrap.style.display='contents';
  RATINGS.forEach(r=>{
    const b=document.createElement('button');
    let selClass = '';
    if (currentId === r.id) {
      selClass = ' sel';
    }
    b.className='opt'+selClass;
    b.dataset.r=r.id;
    b.innerHTML='<span class="oe">'+r.emoji+'</span><span class="ol">'+
      r.label+'</span>';
    b.addEventListener('click',()=>{
      let picked = r.id;
      if (currentId === r.id) {
        picked = null;
      }
      onPick(picked);
    });
    wrap.appendChild(b);
  });
  return wrap;
}

// ---- render: stats windows ----
/**
 * Tallies rating counts over a trailing window of days ending today.
 * @param {number} days - window length in days, inclusive of today.
 * @returns {{counts: Object, total: number}} per-rating counts and the total
 *   number of rated days in the window.
 */
function windowStats(days){
  const T=today();
  const start=addDays(T,-(days-1));
  const counts={
    cyan:0,green:0,'yellow-green':0,yellow:0,orange:0,'red-orange':0,red:0
  };
  let total=0;
  for(const [k,v] of Object.entries(data)){
    const dt=fromKey(k);
    if(dt>=start && dt<=T && counts[v]!==undefined){
      counts[v]++;
      total++;
    }
  }
  return {counts,total};
}
/**
 * Renders one stats window: the proportional distribution bar, the rating
 * legend with counts, and the "N logged" note.
 * @param {number} days - window length in days, inclusive of today.
 * @param {string} distId - element id of the distribution bar.
 * @param {string} legId - element id of the legend container.
 * @param {string} logId - element id of the "logged" count note.
 */
function renderWindow(days, distId, legId, logId){
  const {counts,total}=windowStats(days);
  const dist=document.getElementById(distId);
  dist.innerHTML='';
  let emptyClass = '';
  if (total === 0) {
    emptyClass = ' empty';
  }
  dist.className='dist'+emptyClass;
  if(total>0){
    RATINGS.forEach(r=>{
      const c=counts[r.id];
      if(c<=0) return;
      const seg=document.createElement('div');
      seg.className='seg '+r.id;
      seg.style.width=(c/total*100)+'%';
      dist.appendChild(seg);
    });
  }
  const leg=document.getElementById(legId);
  leg.innerHTML='';
  RATINGS.forEach(r=>{
    const item=document.createElement('div');
    item.className='item';
    item.innerHTML=
      '<span class="swatch" style="background:'+r.colour+'"></span>'
      +'<span class="emo">'+r.emoji+'</span>'
      +'<span class="cnt num">'+counts[r.id]+'</span>';
    leg.appendChild(item);
  });
  document.getElementById(logId).textContent = total+' logged';
}

// ---- render: ribbon 360 ----
/**
 * Renders the 360-day ribbon: a week-row grid running from the most recent week
 * back to the start of the window, padding out-of-range cells and colouring
 * in-range cells by that day's rating.
 */
function renderRibbon(){
  const T=today();
  const rStart=addDays(T,-(WIN_LONG-1));
  const gridStart=startOfWeekSun(rStart);
  const topWeekStart=startOfWeekSun(T);
  const rib=document.getElementById('ribbon');
  rib.innerHTML='';
  for(let ws=new Date(topWeekStart); ws>=gridStart; ws=addDays(ws,-7)){
    for(let off=0; off<7; off++){
      const d=addDays(ws,off);
      const cell=document.createElement('div');
      const inRange = d>=rStart && d<=T;
      if(!inRange){
        cell.className='rc pad';
      }
      else{
        const id=data[toKey(d)];
        if(id===AWAY.id){
          cell.className='rc';
          cell.style.background=AWAY.colour;
          cell.style.boxShadow='0 0 7px -3px '+AWAY.colour;
        }
        else if(id){
          cell.className='rc';
          cell.style.background=RMAP[id].colour;
          cell.style.boxShadow='0 0 7px -3px '+RMAP[id].colour;
        }
        else{
          cell.className='rc';
        }
        let titleSuffix = '';
        if (id === AWAY.id) {
          titleSuffix = ' · ' + AWAY.label;
        } else if (id) {
          titleSuffix = ' · ' + RMAP[id].label;
        }
        cell.title=fmtShort(d)+titleSuffix;
      }
      rib.appendChild(cell);
    }
  }
  document.getElementById('ribStart').textContent=fmtShort(rStart);
}

// ---- render: 30-day calendar ----
/**
 * Renders the 30-day calendar grid, padded out to full weeks. Cells outside the
 * 30-day window are locked (shown, but not clickable); future cells are marked
 * but not clickable either; only in-window cells open the day editor.
 */
function renderCal(){
  const T=today();
  const winStart=addDays(T,-(WIN_SHORT-1));
  const gridStart=startOfWeekSun(winStart);
  const gridEnd=addDays(startOfWeekSun(T),6);
  const cal=document.getElementById('cal');
  cal.innerHTML='';
  for(let d=new Date(gridStart); d<=gridEnd; d=addDays(d,1)){
    const key=toKey(d);
    const inWin = d>=winStart && d<=T;
    const isFuture = d>T;
    const id=data[key];
    const cell=document.createElement('div');
    let cls='cell';
    if(id) cls+=' rated '+id;
    if(!inWin) cls+=' locked';
    if(isFuture) cls+=' future';
    if(key===toKey(T)) cls+=' today';
    cell.className=cls;
    let emojiSpan = '';
    if (id === AWAY.id) {
      emojiSpan = '<span class="e">'+AWAY.emoji+'</span>';
    } else if (id) {
      emojiSpan = '<span class="e">'+RMAP[id].emoji+'</span>';
    }
    cell.innerHTML='<span class="d">'+d.getDate()+'</span>'+emojiSpan;
    if(inWin){
      cell.setAttribute('tabindex','0');
      cell.setAttribute('role','button');
      let titleSuffix = '';
      if (id === AWAY.id) {
        titleSuffix = ' · ' + AWAY.label;
      } else if (id) {
        titleSuffix = ' · ' + RMAP[id].label;
      }
      cell.title=fmtLong(d)+titleSuffix;
      const open=()=>openEditor(key,d);
      cell.addEventListener('click',open);
      cell.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){
          e.preventDefault();
          open();
        }
      });
    }
    cal.appendChild(cell);
  }
}

// ---- render: bottom yesterday bar ----
/**
 * Renders the bottom bar's rating buttons for yesterday's date.
 */
function renderYesterdayBar(){
  const Y=addDays(today(),-1);
  const key=toKey(Y);
  document.getElementById('yesterdayDate').textContent=fmtLong(Y);
  const opts=document.getElementById('yesterdayOpts');
  opts.innerHTML='';
  opts.appendChild(optButtons(data[key], id=>setRating(key,id)));
}

// ---- editor sheet ----
let editorKey=null;
/**
 * Opens the day-editor sheet for a given date, populating its rating options
 * and away-button state from any existing rating.
 * @param {string} key - the "YYYY-MM-DD" day key being edited.
 * @param {Date} d - the date being edited, used for the sheet's title.
 */
function openEditor(key,d){
  editorKey=key;
  document.getElementById('sheetDate').textContent=fmtLong(d);
  const opts=document.getElementById('sheetOpts');
  opts.innerHTML='';
  opts.appendChild(optButtons(data[key], id=>{
    setRating(key,id);
    closeEditor();
  }));
  document.getElementById('awayBtn').classList.toggle('sel', data[key]===AWAY.id);
  document.getElementById('overlay').classList.add('show');
}
/**
 * Closes the day-editor sheet and clears the tracked editor key.
 */
function closeEditor(){
  document.getElementById('overlay').classList.remove('show');
  editorKey=null;
}
document.getElementById('sheetClose').addEventListener('click',closeEditor);
document.getElementById('overlay').addEventListener('click',e=>{ if(e.target.id==='overlay') closeEditor(); });
document.getElementById('awayBtn').addEventListener('click',()=>{
  let awayValue = AWAY.id;
  if (data[editorKey] === AWAY.id) {
    awayValue = null;
  }
  setRating(editorKey, awayValue);
  closeEditor();
});
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeEditor(); });

// ---- export / import ----
document.getElementById('exportBtn').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='day-colours-'+toKey(today())+'.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
document.getElementById('importBtn').addEventListener('click',()=>document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change',ev=>{
  const f=ev.target.files[0];
  if(!f) return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const obj=JSON.parse(rd.result);
      let added=0;
      for(const [k,v] of Object.entries(obj)){
        if(/^\d{4}-\d{2}-\d{2}$/.test(k) && RMAP[v]){
          data[k]=v;
          added++;
        }
      }
      persist();
      renderAll();
      document.getElementById('dataHint').textContent='merged '+added+' day(s) from file.';
    }catch(e){
      document.getElementById('dataHint').textContent='that file would not parse as day-colours JSON.';
    }
  };
  rd.readAsText(f);
  ev.target.value='';
});

/**
 * Re-renders every view: both stats windows, the ribbon, the calendar, and the
 * yesterday bar. Called after any rating change or data import.
 */
function renderAll(){
  renderWindow(WIN_SHORT,'dist30','leg30','log30');
  renderWindow(WIN_LONG,'dist360','leg360','log360');
  renderRibbon();
  renderCal();
  renderYesterdayBar();
}

// ---- full legend (collapsible) ----
/**
 * Renders the collapsible full legend (emoji, swatch, short label, and long
 * description for every rating).
 */
function renderLegendFull(){
  const wrap=document.getElementById('legendFull');
  wrap.innerHTML='';
  RATINGS.forEach(r=>{
    const row=document.createElement('div');
    row.className='leg-row';
    row.innerHTML='<span class="emo">'+r.emoji+'</span>'
      +'<span class="swatch" style="background:'+r.colour+'"></span>'
      +'<span class="lshort">'+r.label+'</span>'
      +'<span class="llong">'+r.desc+'</span>';
    wrap.appendChild(row);
  });
}
renderLegendFull();
document.getElementById('legendToggle').addEventListener('click',()=>{
  const btn=document.getElementById('legendToggle');
  const full=document.getElementById('legendFull');
  const expand=full.hidden;
  full.hidden=!expand;
  btn.setAttribute('aria-expanded', String(expand));
});

/**
 * Boots the page: loads saved ratings, refreshes the storage status note, and
 * renders every view.
 */
(async function init(){
  await load();
  setStatus();
  renderAll();
})();

if('serviceWorker' in navigator){
  window.addEventListener('load', 
    ()=> navigator.serviceWorker.register('sw.js'));
}
