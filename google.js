
let C,dialog=false,bookingDialog=false,token=null,expiresAt=0,events=[];
const clientKey=()=> 'jadem_google_client_id_'+(C?.state.user?.id||'');
const accountKey=()=> 'jadem_google_calendar_account_'+(C?.state.user?.id||'');
const rememberedAccount=()=>{try{return localStorage.getItem(accountKey())||''}catch{return ''}};
const rememberAccount=value=>{if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value||''))return;
 try{localStorage.setItem(accountKey(),value)}catch{}};
const forgetAccount=()=>{try{localStorage.removeItem(accountKey())}catch{}};
const bookingLink=()=>C?.state.data?.calendarSettings?.find(x=>x.owner_id===C.state.user.id)?.booking_url||'';
export function bookingPageUrl(){return bookingLink()};
const clientId=()=>{try{return localStorage.getItem(clientKey())||''}catch{return ''}};
const e=x=>C.esc(x);
export function setupGoogle(ctx){C=ctx;document.addEventListener('click',handle);document.addEventListener('submit',configure)}
export function isGoogleConnected(){return !!token && expiresAt>Date.now()+30000}
export function googleWidget(){
 const id=clientId(),ready=isGoogleConnected(),account=rememberedAccount();
 return '<div class="card" style="margin-bottom:18px"><div class="sectionhead"><h2>Google Agenda + Google Meet</h2><span>'+(ready?'Conectado':'Aguardando conexão')+'</span></div><div class="cardbody"><div class="notice">'+
 (ready?'Conta Google autorizada'+(account?' ('+e(account)+')':'')+'. O CRM pode ler eventos, inserir reuniões e gerar links Meet.':id?'Client ID configurado. Sua conexão de navegador é temporária; reconecte quando necessário. '+(account?'Última agenda: '+e(account):''):'Configure o Client ID OAuth do Google Cloud. Sem isso, eventos são salvos apenas no JADEM.')+
 '</div><div class="stacked"><button class="btn outline sm" data-google="config">Configurar Google OAuth</button>'+
 (id?'<button class="btn primary sm" data-google="connect">Conectar conta Google</button>':'')+
 (ready?'<button class="btn outline sm" data-google="refresh">Atualizar agenda</button><button class="btn outline sm" data-google="disconnect">Desconectar</button>':'')+
 (account?'<button class="btn outline sm" data-google="forget-account">Trocar conta Google</button>':'')+'</div>'+
 (ready&&events.length?'<div class="separator"></div><div class="detaillabel">Próximos eventos Google</div>'+events.slice(0,8).map(x=>'<div class="settingsrow"><div><strong>'+e(x.summary||'Evento')+'</strong><p>'+e(x.start?.dateTime?C.fmt(x.start.dateTime,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):x.start?.date||'')+'</p></div></div>').join(''):'')+'</div></div>'+bookingPanel();
}
export function googleOverlay(){
 if(bookingDialog)return '<div class="featureoverlay"><div class="featuremodal"><div class="featureheader"><h2>Seu link público de agendamento</h2><button class="btn neutral sm" data-google="booking-close">Fechar</button></div><div class="featurebody"><div class="notice">Cole o link da página de agendamentos do Google Agenda. O link continuará hospedado pelo Google e bloqueará os horários reservados no mesmo calendário.</div><form id="googleBookingForm" class="featureform">'+C.inp('booking_url','URL da página de agendamento',bookingLink(),'url',true,true)+'<div class="formfooter"><button class="btn neutral" data-google="booking-close" type="button">Cancelar</button><button class="btn primary" type="submit">Salvar link</button></div></form></div></div></div>';
 return !dialog?'':'<div class="featureoverlay"><div class="featuremodal"><div class="featureheader"><h2>Integração Google</h2><button class="btn neutral sm" data-google="close">Fechar</button></div><div class="featurebody"><div class="notice">No Google Cloud, ative a API Google Calendar e crie OAuth Client ID para aplicativo Web. Cadastre <strong>https://jadem-crm.vercel.app</strong> nas origens JavaScript autorizadas. Se estiver em teste, inclua seu e-mail nos usuários de teste. Use somente o Client ID público, nunca Client Secret.</div><form id="googleClientForm">'+C.inp('client_id','OAuth Client ID',clientId(),'text',true,true)+'<div class="formfooter"><a class="btn outline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud ↗</a><button class="btn primary" type="submit">Salvar ID</button></div></form></div></div></div>';
}

function bookingPanel(){
 const link=bookingLink(),ready=isGoogleConnected(),choices=googleCandidates();
 return '<div class="card" style="margin-bottom:18px"><div class="sectionhead"><h2>Minha página de agendamento</h2><span>Horários livres gerenciados pelo Google</span></div><div class="cardbody"><p class="muted" style="margin-top:0">Compartilhe seu link para que o cliente escolha um horário. O Google bloqueia automaticamente os horários ocupados na mesma agenda.</p>'
 +(link?'<div class="notice" style="word-break:break-word">'+e(link)+'</div>':'<div class="hint warning">Você ainda não cadastrou o link público da sua agenda de agendamentos.</div>')
 +'<div class="stacked"><button class="btn outline sm" data-google="booking-config">Configurar link</button>'+
 (link?'<a class="btn primary sm" rel="noopener noreferrer" target="_blank" href="'+e(link)+'">Abrir página ↗</a><button class="btn outline sm" data-google="booking-copy">Copiar link</button>':'')+
 (ready?'<button class="btn dark sm" data-google="booking-import">Importar reservas Google ('+choices.length+')</button>':'')+
 '</div><p class="note" style="margin-top:13px">Depois de conectar sua Conta Google, use “Importar reservas” para trazer ao JADEM os eventos com convidados externos que ainda não estão cadastrados. A importação é manual, não contínua em segundo plano.</p></div></div>';
}
function googleCandidates(){
 const recorded=new Set((C?.state.rawData?.meetings||C?.state.data.meetings||[]).map(x=>x.google_event_id).filter(Boolean));
 return events.filter(ev=>ev.id&&!recorded.has(ev.id)&&ev.status!=='cancelled'&&ev.visibility!=='private'&&ev.transparency!=='transparent'
  &&ev.start?.dateTime && ev.end?.dateTime && ev.attendees?.some(a=>a.email&&!a.self&&!a.resource));
}
export async function fetchGoogleBusyIntervals(dayStart,dayEnd){
 if(!isGoogleConnected())throw Error('Conecte sua conta Google no JADEM.');
 const result=await api('/freeBusy',{method:'POST',body:JSON.stringify({timeMin:dayStart,timeMax:dayEnd,items:[{id:'primary'}]})});
 const calendar=result.calendars?.primary;
 if(!calendar||calendar.errors?.length)throw Error('Não foi possível consultar os horários do Google.');
 return calendar.busy||[];
}
export async function verifyGoogleAvailability(iso,minutes){
 if(!isGoogleConnected())return;
 const start=new Date(iso),end=new Date(start.getTime()+minutes*60000);
 const b=await api('/freeBusy',{method:'POST',body:JSON.stringify({timeMin:start.toISOString(),timeMax:end.toISOString(),items:[{id:'primary'}]})});
 const overlaps=b.calendars?.primary?.busy||[];
 if(overlaps.length)throw Error('Este horário já está ocupado na Google Agenda. Escolha outro horário.');
}
async function importBookings(){
 if(!isGoogleConnected())throw Error('Conecte primeiro sua conta Google.');
 const candidates=googleCandidates();
 if(!candidates.length){C.toast('Nenhuma nova reunião com convidado externo encontrada. Atualize sua agenda.');return}
 if(!window.confirm('Importar '+candidates.length+' eventos futuros do Google com convidados externos? Revise sua agenda para evitar importar compromissos pessoais.'))return;
 let done=0,skipped=0;
 for(const ev of candidates){
  const guest=ev.attendees.find(a=>a.email&&!a.self&&!a.resource),guestName=guest?.displayName||guest?.email?.split('@')[0]||ev.summary||'Participante externo';
  const start=new Date(ev.start.dateTime),end=new Date(ev.end.dateTime);
  const duration=Math.round((end.getTime()-start.getTime())/60000);
  if(!Number.isFinite(duration)||duration<15||duration>480){skipped++;continue}
  const meet=getMeet(ev),body={owner_id:C.state.user.id,lead_id:null,
   guest_name:guestName.length>=2?guestName:'Convidado externo',guest_email:guest.email,guest_company:'',
   title:(ev.summary||'Reunião agendada pelo Google').slice(0,250),scheduled_at:start.toISOString(),
   duration_minutes:duration,closer_email:C.state.user.email,source:'Google Agenda',status:'Agendada',result:'Pendente',
   google_event_id:ev.id,google_calendar_id:'primary',google_sync_status:'Importado',
   meet_url:meet&&/^https:\/\/meet\.google\.com\//.test(meet)?meet:null,notes:'Importado do Google Agenda'};
  const r=await C.db.from('jadem_lead_meetings').insert(body);
  if(r.error){if(r.error.code==='23505'){skipped++;continue}throw Error(done+' importadas, falha na próxima: '+r.error.message)}
  done++;
 }
 await C.load();C.toast(done+' reunião(ões) importada(s) do Google. '+skipped+' ignorada(s).');await refresh();
}

async function api(route,opts={}){
 if(!isGoogleConnected())throw Error('Reconecte sua conta Google');
 const r=await fetch('https://www.googleapis.com/calendar/v3'+route,{...opts,headers:{Authorization:'Bearer '+token,...(opts.body?{'Content-Type':'application/json'}:{})}});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(d.error?.message||'Google Calendar: erro '+r.status);
 return d;
}
async function refresh(){
 try{
  const primary=await api('/calendars/primary');
  if(primary?.id&&primary.id.includes('@'))rememberAccount(primary.id);
 }catch(err){console.warn('Não foi possível identificar a agenda principal',err)}
 const query=new URLSearchParams({timeMin:new Date().toISOString(),timeMax:new Date(Date.now()+60*86400000).toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'100'});
 const x=await api('/calendars/primary/events?'+query);events=x.items||[];C.render();
}
async function connect(){
 if(!clientId())throw Error('Configure o Client ID');
 if(!window.google?.accounts?.oauth2)throw Error('A biblioteca Google ainda não carregou; tente novamente.');
 await new Promise((resolve,reject)=>{
 const c=window.google.accounts.oauth2.initTokenClient({
 client_id:clientId(),scope:'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
 ...(rememberedAccount()?{login_hint:rememberedAccount()}:{}) ,
 callback:result=>{if(!result.access_token){reject(Error(result.error_description||result.error||'Autorização negada'));return}token=result.access_token;expiresAt=Date.now()+1000*(Number(result.expires_in)||3000);resolve()},
 error_callback:err=>reject(Error(err.message||err.type||'Janela do Google fechada'))
 });c.requestAccessToken({prompt:''});
 });C.toast('Google conectado.');await refresh();
}
const getMeet=x=>x.hangoutLink||x.conferenceData?.entryPoints?.find(p=>p.entryPointType==='video')?.uri||'';
export async function googleReadUpcoming(){
 const query=new URLSearchParams({timeMin:new Date(Date.now()-86400000*7).toISOString(),timeMax:new Date(Date.now()+86400000*60).toISOString(),singleEvents:'true',maxResults:'250',showDeleted:'true'});
 const result=await api('/calendars/primary/events?'+query);
 return result.items||[];
}
export async function syncGoogleMeeting(m){
 if(!isGoogleConnected())throw Error('Conecte a conta Google');
 if(m.google_event_id){
 const event=await api('/calendars/primary/events/'+encodeURIComponent(m.google_event_id));
 const link=getMeet(event);
 if(link&&/^https:\/\/meet\.google\.com\//.test(link)){
  const save=await C.db.from('jadem_lead_meetings').update({meet_url:link,google_sync_status:'Criado'}).eq('id',m.id);
  if(save.error)throw save.error;
  await C.load();C.toast('Link Meet atualizado no CRM.');
 }else C.toast('O Google ainda não disponibilizou o link Meet.');
 return {existing:true};
 }
 const l=C.state.data.leads.find(x=>x.id===m.lead_id);
 const start=new Date(m.scheduled_at),end=new Date(start.getTime()+(m.duration_minutes||60)*60000);
 const attendees=[...new Set([m.guest_email||l?.email,m.closer_email].filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x||'')).map(x=>x.toLowerCase()))].map(email=>({email}));
 const event={summary:m.title,description:(m.notes||'')+'\nJADEM CRM: '+(m.guest_company||l?.company_name||'')+'\nConvidado: '+(m.guest_name||''),start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()},conferenceData:{createRequest:{requestId:crypto.randomUUID(),conferenceSolutionKey:{type:'hangoutsMeet'}}}};
 if(attendees.length)event.attendees=attendees;
 const ev=await api('/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',{method:'POST',body:JSON.stringify(event)});
 let meet=getMeet(ev);if(!meet){const later=await api('/calendars/primary/events/'+encodeURIComponent(ev.id));meet=getMeet(later)}
 const r=await C.db.from('jadem_lead_meetings').update({google_event_id:ev.id,google_calendar_id:'primary',google_sync_status:meet?'Criado':'Meet pendente',meet_url:meet&&meet.startsWith('https://meet.google.com/')?meet:(m.meet_url||null)}).eq('id',m.id);
 if(r.error)throw Error('Evento criado no Google, mas falhou o vínculo no CRM. Verifique sua agenda antes de repetir: '+r.error.message);
 await C.load();C.toast(meet?'Reunião e Meet criados no Google.':'Evento criado no Google; Meet ainda pendente.');await refresh();return {created:true};
}
async function configure(ev){
 if(ev.target.id==='googleBookingForm'){
  ev.preventDefault();ev.stopPropagation();
  const url=ev.target.elements.booking_url.value.trim();
  let parsed;
  try{parsed=new URL(url)}catch{C.toast('Informe um link HTTPS válido.');return}
  if(parsed.protocol!=='https:'||!['calendar.app.google','calendar.google.com'].includes(parsed.hostname)){
   C.toast('Utilize somente um link de agendamento do Google Agenda.');return
  }
  const saved=await C.db.from('jadem_calendar_settings').upsert({owner_id:C.state.user.id,booking_url:url,updated_at:new Date().toISOString()},{onConflict:'owner_id'});
  if(saved.error){C.toast(saved.error.message);return}
  bookingDialog=false;await C.load();C.toast('Link de agendamento salvo.');return;
 }
 if(ev.target.id!=='googleClientForm')return;
 ev.preventDefault();ev.stopPropagation();
 const id=ev.target.elements.client_id.value.trim();
 if(!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(id)){C.toast('Client ID inválido.');return}
 try{localStorage.setItem(clientKey(),id);token=null;expiresAt=0;dialog=false;events=[];C.render();C.toast('Client ID salvo neste navegador.')}catch{C.toast('Não foi possível salvar o Client ID.')}
}
async function handle(ev){
 const btn=ev.target.closest('[data-google]');if(!btn)return;
 const x=btn.dataset.google;
 try{
 if(x==='booking-config'){bookingDialog=true;C.render()}
 else if(x==='booking-close'){bookingDialog=false;C.render()}
 else if(x==='booking-copy'){const url=bookingLink();if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);C.toast('Link copiado.')}else window.prompt('Copie seu link:',url)}
 else if(x==='booking-import'){await refresh();await importBookings()}
 else if(x==='config'){dialog=true;C.render()}
 else if(x==='close'){dialog=false;C.render()}
 else if(x==='connect')await connect()
 else if(x==='refresh')await refresh()
 else if(x==='disconnect'){token=null;expiresAt=0;events=[];C.render()}
 else if(x==='forget-account'){forgetAccount();token=null;expiresAt=0;events=[];C.toast('Conta Google esquecida. Na próxima conexão, escolha a agenda desejada.');C.render()}
 else if(x.startsWith('sync:')){const m=C.state.data.meetings.find(v=>v.id===x.slice(5));if(m)await syncGoogleMeeting(m)}
 }catch(err){C.toast(err.message||'Falha ao conectar Google.');console.warn(err)}
}
