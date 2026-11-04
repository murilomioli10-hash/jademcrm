
import {isGoogleConnected,googleReadUpcoming} from './google.js';
let C,googleItems=[],shiftWeeks=0,polling=false,lastPull=0,firstPulse=true;
const h=x=>C.esc(x),rows=k=>C.state.data[k]||[],owner=()=>C.state.user?.id;
const stored=()=>rows('calendarSettings').find(x=>x.owner_id===owner())||{};
const isAuto=()=>stored().auto_import===true;
const reminderMins=()=>stored().reminder_minutes||15;
const bookLink=()=>stored().booking_url||'';
const dt=x=>new Date(x);
const dateKey=x=>{const a=dt(x);return [a.getFullYear(),String(a.getMonth()+1).padStart(2,'0'),String(a.getDate()).padStart(2,'0')].join('-')};
const fmtTime=x=>new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(dt(x));
const starts=x=>x.start?.dateTime||x.start?.date;
function meetingGuest(ev){return ev.attendees?.find(a=>a.email&&!a.self&&!a.resource);}
function importedIds(){return new Set((C.state.rawData?.meetings||rows('meetings')).map(m=>m.google_event_id).filter(Boolean))}
function isRelevant(ev){return ev.id&&ev.status!=='cancelled'&&ev.visibility!=='private'&&ev.transparency!=='transparent'
 &&ev.start?.dateTime&&ev.end?.dateTime&&meetingGuest(ev)}
function getMeet(ev){return ev.hangoutLink||ev.conferenceData?.entryPoints?.find(x=>x.entryPointType==='video')?.uri||''}
function eligible(){const seen=importedIds();return googleItems.filter(ev=>isRelevant(ev)&&!seen.has(ev.id))}
function monday(day){const d=new Date(day.getFullYear(),day.getMonth(),day.getDate());d.setDate(d.getDate()-(d.getDay()+6)%7);return d;}
function startWeek(){const d=monday(new Date());d.setDate(d.getDate()+shiftWeeks*7);return d;}
function whenPretty(x){return C.fmt(x,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function externalLink(url,label){return '<a href="'+h(url)+'" rel="noopener noreferrer" target="_blank" class="btn outline sm">'+label+'</a>'}
export function agendaBoard(){
 if(!C?.state.user)return '';
 const mondayDate=startWeek(),weekEnd=new Date(mondayDate);weekEnd.setDate(weekEnd.getDate()+7);
 const days=Array.from({length:7},(_,i)=>{let d=new Date(mondayDate);d.setDate(d.getDate()+i);return d});
 const local=rows('meetings').filter(m=>m.status!=='Cancelada'&&dt(m.scheduled_at)>=mondayDate&&dt(m.scheduled_at)<weekEnd).map(m=>({
 id:m.id,title:m.title,time:m.scheduled_at,guest:m.guest_name||rows('leads').find(x=>x.id===m.lead_id)?.contact_name,
 source:m.source||'JADEM',meet:m.meet_url,local:true
 }));
 const seen=importedIds();
 const remote=isGoogleConnected()?googleItems.filter(x=>x.id&&!seen.has(x.id)&&x.status!=='cancelled'&&starts(x)&&dt(starts(x))>=mondayDate&&dt(starts(x))<weekEnd)
 .map(ev=>({id:ev.id,title:ev.summary||'Evento Google',time:starts(ev),guest:meetingGuest(ev)?.displayName||'',
 source:'Google Agenda',meet:getMeet(ev),local:false})):[];
 const all=[...local,...remote].sort((a,b)=>dt(a.time)-dt(b.time));
 const link=bookLink();
 const linkBox='<div class="bookpin"><div><span class="eyebrow">AGENDAMENTO PÚBLICO</span><strong>Seu link de agendamento</strong><p>'+ (link?h(link):'Cadastre o link da sua página de agendamentos do Google para compartilhar com seus clientes')+'</p></div><div class="stacked">'+
 (link?externalLink(link,'Abrir link ↗')+'<button class="btn outline sm" data-agenda="copy-link">Copiar link</button>':'')+
 '<button class="btn dark sm" data-agenda="configure-link">'+(link?'Editar link':'Fixar meu link')+'</button></div></div>';
 const head='<div class="week-head"><div><h2>Minha agenda semanal</h2><span class="muted">Reuniões do JADEM'+(isGoogleConnected()?' e compromissos Google':' • Conecte o Google para sincronizar')+'</span></div>'+
 '<div class="stacked"><button class="btn outline sm" data-agenda="prev-week">‹ Anterior</button><button class="btn outline sm" data-agenda="today">Hoje</button><button class="btn outline sm" data-agenda="next-week">Próxima ›</button>'+externalLink('https://calendar.google.com/calendar/u/0/r/week','Abrir Google Agenda ↗')+'</div></div>';
 const week='<div class="agenda-seven">'+days.map(d=>{
  const key=dateKey(d),current=dateKey(new Date())===key,events=all.filter(a=>dateKey(a.time)===key);
  return '<div class="agenda-day"><div class="agenda-daytop '+(current?'selected':'')+'"><b>'+h(new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(d))+'</b><span>'+h(new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(d))+'</span></div>'+
  '<div class="agenda-daycontent">'+(events.length?events.map(a=>'<div class="agenda-block '+(a.local?'from-crm':'from-google')+'"><span>'+fmtTime(a.time)+'</span><strong>'+h(a.title)+'</strong>'+
  (a.guest?'<small>'+h(a.guest)+'</small>':'')+'<em>'+h(a.source)+'</em>'+
  (a.meet?.startsWith('https://meet.google.com/')?'<a href="'+h(a.meet)+'" rel="noopener noreferrer" target="_blank">Abrir Meet ↗</a>':'')+'</div>').join(''):'<span class="agenda-free">Livre</span>')+'</div></div>';
 }).join('')+'</div>';
 const settings='<div class="agenda-syncbar"><label class="agenda-setting"><input type="checkbox" data-agenda-toggle="auto" '+(isAuto()?'checked':'')+'> Importar automaticamente novas reuniões com convidados externos do Google <small>(a cada ~3 minutos, com o JADEM aberto)</small></label><div class="stacked"><button class="btn outline sm" data-agenda="sync">Sincronizar agora</button><button class="btn outline sm" data-agenda="permission">Ativar notificações</button>'+
 '<label class="agenda-reminder">Avisar <select data-agenda-setting="minutes">'+[5,10,15,30,60].map(n=>'<option '+(reminderMins()===n?'selected':'')+' value="'+n+'">'+n+' min</option>').join('')+'</select> antes</label></div></div>';
 const message=isGoogleConnected()?'Google conectado nesta sessão. A agenda mostrará eventos externos sem duplicar os já importados.':'Para puxar reuniões do link de agendamento e evitar conflitos, conecte sua conta em **Google Agenda + Meet** abaixo.';
 return '<div class="card agenda-pinned">'+linkBox+head+week+'<div class="week-caption">'+h(new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(mondayDate))+' a '+h(new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(weekEnd.getTime()-86400000)))+' • '+all.length+' compromisso(s)</div>'+
 settings+'<p class="note" style="padding:0 20px 14px;margin:0">'+h(message)+'</p></div>';
}
export function agendaAlertsButton(){
 if(!C?.state.user)return '';
 const unread=rows('notifications').filter(x=>!x.read_at).length;
 return '<button class="notice-bell" data-agenda="alerts" title="Avisos de reuniões" aria-label="Notificações">🔔'+(unread?'<span class="notice-counter">'+Math.min(unread,99)+'</span>':'')+'</button>';
}
export function agendaAlertsView(){
 const records=[...rows('notifications')].sort((a,b)=>dt(b.created_at)-dt(a.created_at));
 const unread=records.filter(x=>!x.read_at).length;
 return C.title('Notificações','Novas reuniões e lembretes da sua operação.')
 +'<div class="card"><div class="sectionhead"><h2>'+unread+' aviso(s) não lido(s)</h2><button class="btn outline sm" data-agenda="permission">Ativar alertas</button></div>'+
 (records.length?records.slice(0,100).map(n=>'<div class="meeting-alert '+(n.read_at?'read':'new')+'"><div><b>'+h(n.title)+'</b><p>'+h(n.message)+'</p><small>'+whenPretty(n.created_at)+'</small></div>'+
 (!n.read_at?'<button class="btn outline sm" data-agenda="mark-read:'+n.id+'">Marcar como lida</button>':'')+'</div>').join(''):'<div class="feature-empty">Nenhum aviso por enquanto.</div>')+'</div>'+
 '<p class="note">Os alertas do navegador e os lembretes são enviados enquanto o JADEM estiver aberto. Notificações com o navegador fechado exigem uma integração adicional em segundo plano.</p>';
}
async function configure(changes){
 const old=stored(),id=owner();
 const q=old.owner_id?C.db.from('jadem_calendar_settings').update({...changes,updated_at:new Date().toISOString()}).eq('owner_id',id):
 C.db.from('jadem_calendar_settings').insert({owner_id:id,...changes});
 const result=await q;if(result.error)throw result.error;
 await C.load();
}
function browserNotice(title,text,key){
 if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
 try{new Notification(title,{body:text,tag:key||undefined})}catch(ex){console.warn(ex.message)}
}
function checkReminders(){
 const id=owner();if(!id)return;
 for(const meeting of rows('meetings')){
  if(meeting.status!=='Agendada')continue;
  const delta=dt(meeting.scheduled_at)-Date.now();
  if(delta<0||delta>reminderMins()*60000)continue;
  const key='jadem_remind_'+id+'_'+meeting.id+'_'+meeting.scheduled_at;
  try{if(sessionStorage.getItem(key))continue;sessionStorage.setItem(key,'1')}catch{continue}
  C.toast('Reunião próxima: '+meeting.title+' às '+new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(dt(meeting.scheduled_at)));
  browserNotice('JADEM • Reunião próxima',meeting.title, key);
 }
}
function isEditingForm(){
 return Boolean(document.querySelector('#meetingForm,#leadRecordForm,#recordForm,#rolesForm,#googleBookingForm,#googleClientForm,#googleConfigForm,#authForm'));
}
function safeRender(){if(!isEditingForm())C.render()}
async function pollNotifications(){
 if(!owner())return;
 const existing=new Map(rows('notifications').map(x=>[x.id,x.read_at]));
 const {data,error}=await C.db.from('jadem_notifications').select('*').order('created_at',{ascending:false}).limit(100);
 if(error)throw error;
 C.state.data.notifications=data||[];
 const newNotes=(data||[]).filter(x=>!existing.has(x.id)&&!x.read_at);
 const changed=(data||[]).length!==existing.size||(data||[]).some(x=>!existing.has(x.id)||existing.get(x.id)!==x.read_at);
 if(newNotes.length&&!firstPulse){
  C.toast(newNotes.length+' nova(s) reunião(ões) registrada(s).');
  browserNotice('JADEM • Nova reunião',newNotes[0].message,newNotes[0].id);
 }
 firstPulse=false;if(changed)safeRender();
}
function candidates(){
 const present=importedIds();
 return googleItems.filter(x=>isRelevant(x)&&!present.has(x.id)&&dt(starts(x))>=new Date(Date.now()-7*86400000));
}
async function importNew({interactive=false}={}){
 if(!owner()||!isGoogleConnected())return 0;
 const inputs=candidates();
 if(interactive&&inputs.length&&!window.confirm('Importar '+inputs.length+' eventos do Google com participantes externos? Isso pode incluir outros compromissos com convidados, além das reservas do seu link.'))return 0;
 let added=0,updated=0;
 const dbRows=rows('meetings').filter(x=>x.owner_id===owner());
 for(const event of googleItems){
  const prior=dbRows.find(x=>x.google_event_id===event.id);
  if(!prior||prior.source!=='Google Agenda')continue;
  const mstatus=event.status==='cancelled'?'Cancelada':prior.status;
  const scheduled=event.start?.dateTime||null;
  const video=getMeet(event),link=video.startsWith('https://meet.google.com/')?video:prior.meet_url;
  const changes={};if(mstatus!==prior.status&&prior.status!=='Realizada')changes.status=mstatus;
  if(scheduled&&dt(scheduled).toISOString()!==dt(prior.scheduled_at).toISOString()&&prior.status==='Agendada')changes.scheduled_at=dt(scheduled).toISOString();
  if(link&&link!==prior.meet_url)changes.meet_url=link;
  if(Object.keys(changes).length){
   const {error}=await C.db.from('jadem_lead_meetings').update(changes).eq('id',prior.id);
   if(error)console.warn('Could not reconcile event',event.id,error.message);else updated++;
  }
 }
 for(const ev of inputs.slice(0,100)){
  const guest=meetingGuest(ev);
  const start=dt(ev.start.dateTime),end=dt(ev.end.dateTime);
  const mins=Math.round((end-start)/60000);
  if(mins<15||mins>480||!Number.isFinite(mins))continue;
  const rawName=guest?.displayName||guest?.email?.split('@')[0]||'Participante externo';
  const guestName=rawName.length>=2?rawName:'Participante externo';
  const meet=getMeet(ev);
  const body={owner_id:owner(),lead_id:null,title:(ev.summary||'Reunião agendada no Google').slice(0,250),
   guest_name:guestName,guest_email:guest.email,scheduled_at:start.toISOString(),duration_minutes:mins,
   source:'Google Agenda',status:'Agendada',result:'Pendente',closer_email:C.state.user.email,
   google_event_id:ev.id,google_calendar_id:'primary',google_sync_status:'Importado',
   meet_url:meet.startsWith('https://meet.google.com/')?meet:null,notes:'Importada da Google Agenda'};
  const {error}=await C.db.from('jadem_lead_meetings').insert(body);
  if(error){if(error.code==='23505')continue;console.warn('Google booking import',error.message);continue}
  added++;
 }
 if(added||updated){await C.load();if(added)C.toast(added+' nova(s) reunião(ões) importadas da sua agenda.')}
 await pollNotifications();
 if(interactive&&!added&&!updated)C.toast('Sua agenda já está atualizada.');
 return added;
}
async function pull({interactive=false}={}){
 if(polling||!owner()||!isGoogleConnected())return;
 polling=true;
 try{
  if(!interactive&&isEditingForm()){lastPull=Date.now();return}
  const payload=await googleReadUpcoming();
  googleItems=payload;
  lastPull=Date.now();
  if(isAuto()||interactive)await importNew({interactive});
  safeRender();
 }finally{polling=false}
}
export function setupAgenda(ctx){
 C=ctx;
 document.addEventListener('click',onClick);
 document.addEventListener('change',onChange);
 setInterval(()=>{
  if(!owner())return;
  checkReminders();
  if(document.visibilityState==='visible'&&isGoogleConnected()&&Date.now()-lastPull>180000){
   pull().catch(err=>{console.warn('Agenda sync',err);C.toast('Não foi possível sincronizar com o Google: '+err.message)});
  }
  if(document.visibilityState==='visible')pollNotifications().catch(console.warn);
 },30000);
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&owner()){
   if(isGoogleConnected()&&Date.now()-lastPull>90000)pull().catch(console.warn);
   pollNotifications().catch(console.warn);
  }
 });
}
async function onChange(ev){
 const k=ev.target.dataset.agendaToggle;
 if(k==='auto'){
  const val=ev.target.checked;
  if(val&&!window.confirm('Permitir importar automaticamente eventos Google com convidados externos enquanto este CRM estiver aberto? Eles poderão incluir outros eventos, além dos agendamentos públicos.')){ev.target.checked=false;return}
  try{await configure({auto_import:val});C.toast(val?'Importação automática ativada.':'Importação automática desativada.');if(val&&isGoogleConnected())await pull({interactive:false})}
  catch(err){ev.target.checked=!val;C.toast(err.message)}
 }
 if(ev.target.dataset.agendaSetting==='minutes'){
  try{await configure({reminder_minutes:Number(ev.target.value)});C.toast('Lembrete atualizado.')}catch(err){C.toast(err.message)}
 }
}
async function onClick(ev){
 const control=ev.target.closest('[data-agenda]');if(!control)return;
 const action=control.dataset.agenda;
 try{
  if(action==='prev-week'){shiftWeeks--;C.render()}
  else if(action==='next-week'){shiftWeeks++;C.render()}
  else if(action==='today'){shiftWeeks=0;C.render()}
  else if(action==='configure-link'){document.querySelector('[data-google="booking-config"]')?.click()}
  else if(action==='copy-link'){if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(bookLink());C.toast('Link copiado.')}else window.prompt('Copie seu link:',bookLink())}
  else if(action==='alerts'){C.state.view='notifications';C.state.search='';C.render()}
  else if(action==='permission'){if(typeof Notification==='undefined'){C.toast('Este navegador não oferece notificações.');return}const p=await Notification.requestPermission();C.toast(p==='granted'?'Notificações permitidas.':'Permissão de notificações não concedida.')}
  else if(action==='sync'){if(!isGoogleConnected())throw Error('Conecte primeiro sua conta Google na seção abaixo.');await pull({interactive:true})}
  else if(action.startsWith('mark-read:')){
   const id=action.slice(10);const r=await C.db.from('jadem_notifications').update({read_at:new Date().toISOString()}).eq('id',id);
   if(r.error)throw r.error;await pollNotifications();
  }
 }catch(err){C.toast(err.message||'Erro ao atualizar agenda');console.warn(err)}
}
