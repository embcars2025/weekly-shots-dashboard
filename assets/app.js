const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const n1=v=>Number(v).toFixed(1), n2=v=>Number(v).toFixed(2);
const kickoff=v=>new Intl.DateTimeFormat("en-US",{weekday:"long",month:"2-digit",day:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"America/New_York",timeZoneName:"short"}).format(new Date(v));
const pickDate=v=>{const parts=new Intl.DateTimeFormat("en-US",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"America/New_York"}).formatToParts(new Date(v));const get=type=>parts.find(part=>part.type===type)?.value||"";return `${get("year")}-${get("month")}-${get("day")}`};
const pickDateLabel=v=>new Intl.DateTimeFormat("es-US",{weekday:"long",month:"long",day:"numeric",year:"numeric",timeZone:"America/New_York"}).format(new Date(v));
function formTable(rows,team){return `<table><caption class="visually-hidden">Selected current-form matches for ${esc(team)}</caption><thead><tr><th scope="col">Date</th><th scope="col">V</th><th scope="col">Opponent</th><th scope="col">Pos</th><th scope="col">Score</th><th scope="col">T</th><th scope="col">TA</th><th scope="col">TR</th><th scope="col">TAR</th><th scope="col">RC</th></tr></thead><tbody>${rows.map(r=>{const names=(r.red_card_players||[]).map(x=>x.player).filter(Boolean).join(', ');return `<tr><td>${esc(r.date.slice(5))}</td><td>${esc(r.venue)}</td><td class="opponent">${esc(r.opponent)}</td><td>${esc(r.opponent_position)}</td><td>${esc(r.score)}</td><td>${r.T}</td><td>${r.TA}</td><td>${r.TR}</td><td>${r.TAR}</td><td class="${r.red_card?'rc':''}">${r.red_card?'YES':'—'}${names?`<span class="fallback">${esc(names)}</span>`:''}${r.red_card_fallback?'<span class="fallback">minimum fallback</span>':''}</td></tr>`}).join('')}</tbody></table>`}
function teamPanel(name,role,position,rows,avg){return `<section class="panel"><div class="panel-heading"><strong>${esc(name)}</strong><span>${esc(role)} &nbsp;|&nbsp; Position ${esc(position)}</span></div><div class="table-wrap">${formTable(rows,name)}</div><div class="sample-summary"><span>Selected sample ${rows.length} matches</span><span>T = ${n1(avg.T)}</span><span>TA = ${n1(avg.TA)}</span><span>TR = ${n1(avg.TR)}</span><span>TAR = ${n1(avg.TAR)}</span></div><div class="definitions">T shots &nbsp;|&nbsp; TA shots on target &nbsp;|&nbsp; TR shots received &nbsp;|&nbsp; TAR SOT received</div></section>`}
function h2hTable(f){return `<table><caption class="visually-hidden">${esc(f.previous_season_label)} league meetings between ${esc(f.home_team)} and ${esc(f.away_team)}</caption><thead><tr><th scope="col">Date</th><th scope="col">Fixture</th><th scope="col">Score</th><th scope="col">${esc(f.home_team)} T</th><th scope="col">${esc(f.home_team)} TA</th><th scope="col">${esc(f.away_team)} T</th><th scope="col">${esc(f.away_team)} TA</th><th scope="col">Same venue</th></tr></thead><tbody>${f.h2h.map(r=>`<tr><td>${esc(r.date)}</td><td class="fixture">${esc(r.fixture)}</td><td>${esc(r.score)}</td><td>${r.team_a_T}</td><td>${r.team_a_TA}</td><td>${r.team_b_T}</td><td>${r.team_b_TA}</td><td>${r.same_venue?'YES — use for T2':'No'}</td></tr>`).join('')}</tbody></table>`}
function teamCalculation(name,c,forecast){return `<section class="calculation"><h3>${esc(name)}</h3><div class="formula-line">Shots = (${n1(c.current_form.T)} + ${n1(c.same_venue_h2h.T)} + ${n1(c.two_h2h_average.T)}) / 3</div><div class="formula-result">= ${n2(forecast.shots)}</div><div class="formula-line">SOT = (${n1(c.current_form.TA)} + ${n1(c.same_venue_h2h.TA)} + ${n1(c.two_h2h_average.TA)}) / 3</div><div class="formula-result">= ${n2(forecast.sot)}</div><div class="context">Received context&nbsp; TR ${n1(c.current_form.TR)} &nbsp;|&nbsp; TAR ${n1(c.current_form.TAR)}</div></section>`}
function matchComponents(c,f){return `<section class="calculation"><h3>MATCH COMPONENTS</h3><div class="component-row"><span>T1</span><span>Recent totals</span><strong>${n2(c.T1)}</strong></div><div class="component-row"><span>T2</span><span>Same-venue H2H</span><strong>${n2(c.T2)}</strong></div><div class="component-row"><span>T3</span><span>Two-H2H average</span><strong>${n2(c.T3)}</strong></div><div class="combined-line">Combined shots = (T1+T2+T3)/3 = ${n2(f.combined_shots)}</div><div class="component-row"><span>TA1</span><span></span><strong>${n2(c.TA1)}</strong></div><div class="component-row"><span>TA2</span><span></span><strong>${n2(c.TA2)}</strong></div><div class="component-row"><span>TA3</span><span></span><strong>${n2(c.TA3)}</strong></div><div class="combined-line">Combined SOT = (TA1+TA2+TA3)/3 = ${n2(f.combined_sot)}</div></section>`}
function forecastBox(label,value){return `<div class="forecast-box"><span>${esc(label)}</span><strong>${n1(value)}</strong></div>`}
function worksheet(f){const hf={shots:f.forecasts.home_shots,sot:f.forecasts.home_sot},af={shots:f.forecasts.away_shots,sot:f.forecasts.away_sot};return `<article class="worksheet" data-match-id="${esc(f.match_id)}" data-pick-date="${esc(pickDate(f.kickoff_utc))}"><header class="worksheet-title"><h2 tabindex="-1">${esc(f.home_team)} vs ${esc(f.away_team)}</h2><p>${esc(f.league_name)} &nbsp;|&nbsp; Kickoff ${kickoff(f.kickoff_utc)} &nbsp;|&nbsp; Data cutoff ${kickoff(f.data_cutoff_et)}</p></header><div class="team-grid">${teamPanel(f.home_team,'HOME',f.home_position,f.home_form,f.home_averages)}${teamPanel(f.away_team,'AWAY',f.away_position,f.away_form,f.away_averages)}</div><div class="section-heading">${esc(f.previous_season_label)} HEAD-TO-HEAD — BOTH LEAGUE MEETINGS</div><div class="h2h">${h2hTable(f)}<p class="h2h-note">Same-venue match feeds T2/TA2. Both matches feed each team’s H2H average and T3/TA3.</p></div><div class="calculation-grid">${teamCalculation(f.home_team,f.home_components,hf)}${matchComponents(f.components,f.forecasts)}${teamCalculation(f.away_team,f.away_components,af)}</div><div class="forecast-grid">${forecastBox(`${f.home_team} SHOTS`,f.forecasts.home_shots)}${forecastBox(`${f.away_team} SHOTS`,f.forecasts.away_shots)}${forecastBox(`COMBINED SHOTS`,f.forecasts.combined_shots)}${forecastBox(`${f.home_team} SOT`,f.forecasts.home_sot)}${forecastBox(`${f.away_team} SOT`,f.forecasts.away_sot)}${forecastBox(`COMBINED SOT`,f.forecasts.combined_sot)}</div></article>`}

let dashboardData=null;
const dateFilter=document.querySelector('#pick-date-filter');
const dateFilterStatus=document.querySelector('#pick-filter-status');
const filterEmpty=document.querySelector('#filter-empty');
function applyDateFilter(){
  const selected=dateFilter.value||'all';
  const cards=Array.from(document.querySelectorAll('#fixtures .worksheet'));
  let shown=0;
  cards.forEach(card=>{const visible=selected==='all'||card.dataset.pickDate===selected;card.classList.toggle('hidden',!visible);if(visible)shown+=1});
  const option=dateFilter.options[dateFilter.selectedIndex];
  const label=option?option.textContent:'Todos los días disponibles';
  dateFilterStatus.textContent=cards.length?`Mostrando ${shown} de ${cards.length} picks · ${label}`:'Actualmente no hay picks elegibles publicados.';
  filterEmpty.classList.toggle('hidden',shown>0||cards.length===0);
}
function populateDateFilter(rows){
  const previous=dateFilter.value||'all';
  const dates=new Map();
  rows.forEach(row=>{const key=pickDate(row.kickoff_utc);if(!dates.has(key))dates.set(key,pickDateLabel(row.kickoff_utc))});
  const options=['<option value="all">Todos los días disponibles</option>'];
  Array.from(dates).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([value,label])=>options.push(`<option value="${esc(value)}">${esc(label)}</option>`));
  dateFilter.innerHTML=options.join('');
  dateFilter.value=dates.has(previous)?previous:'all';
  dateFilter.disabled=rows.length===0;
  applyDateFilter();
}
function revealMatch(matchId){
  const card=Array.from(document.querySelectorAll('#fixtures .worksheet')).find(item=>item.dataset.matchId===String(matchId));
  if(card&&card.classList.contains('hidden')){dateFilter.value=card.dataset.pickDate||'all';applyDateFilter()}
  return card||null;
}
dateFilter.addEventListener('change',applyDateFilter);
async function fetchLatest(force=true,{signal}={}){
  const suffix=force?`?refresh=${Date.now()}`:'';
  const response=await fetch(`./data/dashboard.json${suffix}`,{cache:'no-store',signal});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const data=await response.json();
  if(!data||!Array.isArray(data.fixtures))throw new Error('Invalid dashboard data');
  return data;
}
function applyData(data,{force=false,announce=true}={}){
  if(!data||!Array.isArray(data.fixtures))throw new Error('Invalid dashboard data');
  const fixtures=document.querySelector('#fixtures');
  const empty=document.querySelector('#empty');
  const loading=document.querySelector('#loading');
  dashboardData=data;
  fixtures.innerHTML=data.fixtures.map(worksheet).join('');
  populateDateFilter(data.fixtures);
  empty.classList.toggle('hidden',data.fixtures.length>0);
  loading.classList.add('hidden');
  document.dispatchEvent(new CustomEvent('dashboard:data',{detail:{data,force,announce}}));
  return data;
}
async function load({force=false,announce=true}={}){
  const loading=document.querySelector('#loading');
  loading.textContent=force?'Checking for updated weekly data…':'Loading eligible weekly worksheets…';
  loading.classList.remove('hidden');
  try{
    return applyData(await fetchLatest(force),{force,announce});
  }catch(e){
    loading.textContent=`The weekly worksheets could not be loaded: ${e.message}`;
    document.dispatchEvent(new CustomEvent('dashboard:error',{detail:{error:e,force,announce}}));
    return null;
  }
}

window.dashboardApp={
  getData:()=>dashboardData,
  fetchLatest,
  applyData,
  revealMatch,
  reload:(options={})=>load({force:true,...options})
};
load();
