
import {teamButton} from './roles.js';
import {googleWidget,isGoogleConnected,syncGoogleMeeting,verifyGoogleAvailability,bookingPageUrl} from './google.js';
import {operationField} from './operations.js';
import {agendaBoard} from './agenda.js';
let C;
let feature={panel:null,tab:'info',filter:'Todos',audioConsent:false,recorder:null,recorderStream:null,recChunks:[],importBusy:false};
const statuses=['Novo','Em contato','Qualificado','Oportunidade','Cliente','Descartado'];
const co=(key)=>C.state.data[key]||[];
const e=x=>C.esc(x);
const button=(name,label,klass='outline')=>'<button class="btn '+klass+' sm" data-fx="'+name+'">'+label+'</button>';
const bare=(val)=>String(val==null?'':val).trim();
const dateTime=(d)=>C.fmt(d,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const scoreCalc=l=>{
 let v=0;
 if(bare(l.company_name))v+=10;
 if(bare(l.contact_name))v+=10;
 if(bare(l.phone).replace(/\D/g,'').length>=10)v+=15;
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bare(l.email)))v+=10;
 if(bare(l.segment))v+=10;
 if(bare(l.position))v+=5;
 if(l.is_decision_maker===true||l.is_decision_maker==='true')v+=15;
 if(bare(l.website))v+=5;
 v+=({Alto:15,'Médio':8,Baixo:0})[l.fit]||0;
 v+=({Alto:10,'Médio':5,Baixo:0})[l.interest]||0;
 if(Number(l.estimated_value)>0)v+=5;
 return Math.min(100,v);
};
const warmth=n=>n>=80?['hot','Quente']:n>=50?['warm','Morno']:['','Frio'];
const scoreHtml=n=>{let w=warmth(Number(n)||0);return '<div class="leadscore"><span class="score-ring '+w[0]+'">'+Number(n||0)+'</span><span class="score-txt">'+w[1]+'</span></div>'};
const openInfo=id=>{feature.panel={type:'detail',id};feature.tab='info';feature.audioConsent=false;C.render();writeEvent(id,'visualizou')};
export function openLeadFromDeal(id){if(co('leads').some(x=>x.id===id))openInfo(id)}
export function openMeetingFromDeal(p={}){feature.panel={type:'meeting',...p};C.render()}
const lnk=(url,label)=>/^https:\/\//i.test(String(url||''))?'<a class="btn outline sm" target="_blank" rel="noopener noreferrer" href="'+e(url)+'">'+label+'</a>':'<span class="muted">Link indisponível</span>';
const cleanPhone=s=>bare(s).replace(/\D/g,'');
const auditActor=x=>{
 const email=String(x.actor_email||'').trim(),mine=C.state.user||{};
 if(x.actor_id&&mine.id===x.actor_id)return mine.user_metadata?.full_name||mine.user_metadata?.name||email||mine.email||'Usuário autenticado';
 if(email)return co('roster').find(r=>String(r.member_email||'').toLowerCase()===email.toLowerCase())?.display_name||email;
 return x.actor_id?'Usuário registrado':'Registro anterior sem identificação';
};

async function writeEvent(lead_id,action,detail=''){
 const target=co('leads').find(x=>x.id===lead_id);
 const payload={lead_id,action,detail};
 if(target?.owner_id && target.owner_id!==C.state.user.id)payload.owner_id=target.owner_id;
 const {error}=await C.db.from('jadem_lead_events').insert(payload);
 if(error){console.warn('Lead audit failed:',error.message);C.toast('Atenção: ação realizada, mas não foi possível registrar a auditoria.');return;}
 const {data}=await C.db.from('jadem_lead_events').select('*').eq('lead_id',lead_id).order('created_at',{ascending:false}).limit(100);
 if(data)C.state.data.leadEvents=[...data,...C.state.data.leadEvents.filter(x=>x.lead_id!==lead_id)];
 if(feature.panel?.type==='detail'&&feature.panel.id===lead_id&&feature.tab==='history')C.render();
}
export function setupFeatures(deps){
 C=deps;
 document.addEventListener('click',onFxClick);
 document.addEventListener('change',onFxChange);
 document.addEventListener('submit',onFxSubmit);
}
export function leadsView(){
 const q=bare(C.state.search).toLowerCase();
 let list=co('leads').filter(l=>!q||[l.company_name,l.contact_name,l.email,l.phone,l.segment,l.city,l.origin].some(x=>bare(x).toLowerCase().includes(q)));
 if(feature.filter==='Quente')list=list.filter(l=>l.score>=80);
 else if(feature.filter==='Morno')list=list.filter(l=>l.score>=50&&l.score<80);
 else if(feature.filter==='Frio')list=list.filter(l=>l.score<50);
 else if(feature.filter!=='Todos')list=list.filter(l=>l.status===feature.filter);
 list.sort((a,b)=>Number(b.score)-Number(a.score)||new Date(b.created_at)-new Date(a.created_at));
 const leads=co('leads');
 const btns='<div class="stacked">'+button('download-template',C.ic('download')+' Modelo Excel')+button('export-xlsx',C.ic('download')+' Exportar Excel')+button('import-xlsx',C.ic('plus')+' Importar Excel','dark')+button('lead-new',C.ic('plus')+' Novo lead','primary')+'</div>';
 return C.title('Lista de leads','Score automático de 0 a 100, qualificação e histórico de acessos.',btns)
 +'<div class="leadmetrics">'+[
 ['Total de leads',leads.length],['Quentes (80–100)',leads.filter(l=>l.score>=80).length],['Qualificados',leads.filter(l=>l.status==='Qualificado').length],['Valor potencial',C.money(leads.reduce((n,l)=>n+Number(l.estimated_value||0),0))]
 ].map(a=>'<div class="card leadmetric"><small>'+e(a[0])+'</small><strong>'+e(a[1])+'</strong></div>').join('')+'</div>'
 +'<div class="card"><div class="leadtools"><span class="muted">Filtrar por</span><select id="leadFilter" aria-label="Filtrar leads">'+['Todos','Quente','Morno','Frio',...statuses].map(x=>'<option '+(feature.filter===x?'selected':'')+'>'+e(x)+'</option>').join('')+'</select><span class="muted">'+list.length+' resultado(s) • ordenados por score</span></div>'
 +(list.length?'<div class="tablewrap"><table class="datatable leadtable"><thead><tr><th>Empresa / contato</th><th>Score</th><th>Status</th><th>Segmento</th><th>Contato</th><th>Origem</th><th>Atualizado</th></tr></thead><tbody>'+
 list.map(l=>'<tr class="clickable-row" data-lead-open="'+e(l.id)+'"><td><div class="namecell"><span class="letter">'+e(l.company_name.slice(0,1).toUpperCase())+'</span><div>'+e(l.company_name)+'<span class="secondtext">'+e(l.contact_name||'Sem decisor identificado')+'</span></div></div></td><td>'+scoreHtml(l.score)+'</td><td>'+C.badge(l.status)+'</td><td>'+e(l.segment||'—')+'</td><td>'+e(l.phone||l.email||'—')+'</td><td>'+e(l.origin||'—')+'</td><td>'+C.fmt(l.updated_at)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="feature-empty">Nenhum lead encontrado. Cadastre um novo lead ou importe sua planilha Excel.</div>')
 +'<input id="leadExcelInput" type="file" accept=".xlsx,.xls,.csv" hidden></div>'
 +'<p class="note" style="margin-top:12px">Pontuação indicativa: dados completos + aderência do perfil + interesse informado. A temperatura não representa probabilidade estatística de venda.</p>';
}
export function calendarView(){
 const meetings=co('meetings').slice().sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at));
 const future=meetings.filter(m=>new Date(m.scheduled_at).getTime()>=Date.now());
 return C.title('Google Agenda & Meet','Reuniões com leads ou convidados externos. Integre seu link de agendamento do Google.',button('meeting-new',C.ic('plus')+' Nova reunião','primary'))+agendaBoard()+googleWidget()
 +'<div class="grid4"><div class="card kpi"><div class="metric-label">Total de reuniões</div><div class="metric-value">'+meetings.length+'</div></div><div class="card kpi"><div class="metric-label">Próximas reuniões</div><div class="metric-value">'+future.length+'</div></div></div>'
 +'<div class="card" style="margin-top:17px"><div class="sectionhead"><h2>Reuniões da operação</h2><span>'+meetings.length+' registros</span></div>'
 +(meetings.length?'<div class="tablewrap"><table class="datatable"><thead><tr><th>Reunião / convidado</th><th>Empresa</th><th>Quando</th><th>Agenda & Meet</th></tr></thead><tbody>'+
 meetings.map(m=>{const lead=co('leads').find(l=>l.id===m.lead_id);
 return '<tr><td><strong>'+e(m.title)+'</strong><span class="secondtext">'+e(m.guest_name||lead?.contact_name||'Participante externo')+(m.guest_email?' • '+e(m.guest_email):'')+'</span></td><td>'+e(lead?.company_name||m.guest_company||'Convidado externo')+'</td><td>'+dateTime(m.scheduled_at)+'</td><td><div class="stacked">'+
 lnk(calendarUrl(m,lead),'Abrir no Google')+
 (isGoogleConnected()&&(!m.google_event_id||!m.meet_url)?'<button class="btn primary sm" data-google="sync:'+m.id+'">'+(m.google_event_id?'Atualizar Meet':'Criar no Google + Meet')+'</button>':'')+
 (m.meet_url?lnk(m.meet_url,'Entrar no Meet'):'')+'</div></td></tr>';
 }).join('')+'</tbody></table></div>':'<div class="feature-empty">Ainda não existem reuniões. Você pode registrar um convidado externo sem precisar cadastrar lead.</div>')+'</div>';
}
export function callLibraryView(){
 const files=co('recordings');
 return C.title('Gravações de chamadas','Áudios armazenados de forma privada e vinculados a cada lead.')
 +'<div class="notice"><strong>Como funciona:</strong> anexe arquivos de ligações gravadas pela sua telefonia/serviço ou grave uma nota pelo microfone no cadastro do lead. O navegador não grava automaticamente ligações telefônicas, Google Meet ou WhatsApp.</div>'
 +'<div class="card"><div class="sectionhead"><h2>Biblioteca de áudios</h2><span>'+files.length+' gravação(ões)</span></div>'
 +(files.length?'<div class="tablewrap"><table class="datatable"><thead><tr><th>Arquivo</th><th>Lead</th><th>Data</th><th>Ações</th></tr></thead><tbody>'+files.map(f=>{
 const lead=co('leads').find(l=>l.id===f.lead_id);
 return '<tr><td>'+e(f.filename)+'</td><td>'+e(lead?.company_name||'—')+'</td><td>'+C.fmt(f.created_at)+'</td><td>'+button('play:'+f.id,'Ouvir áudio')+'</td></tr>';
 }).join('')+'</tbody></table></div>':'<div class="feature-empty">Nenhum áudio enviado. Abra um lead e acesse a aba Gravações para adicionar.</div>')+'</div>';
}
export function featuresOverlay(){
 if(!feature.panel)return '';
 let p=feature.panel;
 if(p.type==='edit')return leadForm(p);
 if(p.type==='detail')return leadDetail(p);
 if(p.type==='meeting')return meetingForm(p);
 return '';
}
function fieldValue(name,x){return C.inp(name,x[0],x[1],x[2]||'text',!!x[3],!!x[4])}
function leadForm(p){
 const l=(p.id&&co('leads').find(x=>x.id===p.id))||{};
 if(p.id&&l.owner_id&&l.owner_id!==C.state.user.id)return '<div class="featureoverlay"><div class="featuremodal"><div class="featurebody">Você tem acesso somente de leitura a este lead. '+button('close','Fechar')+'</div></div></div>';
 const check=l.is_decision_maker?'checked':'';
 const fields=[
 C.inp('company_name','Nome da empresa',l.company_name,'text',true,true),
 operationField(l.id?l.operation_id:undefined),
 C.inp('contact_name','Nome do contato',l.contact_name),
 C.inp('position','Cargo / função',l.position),
 C.inp('phone','WhatsApp / telefone',l.phone,'tel'),
 C.inp('email','E-mail',l.email,'email'),
 C.inp('segment','Segmento / atividade',l.segment),
 C.inp('city','Cidade',l.city),
 C.inp('state','UF',l.state),
 C.inp('website','Site da empresa',l.website),
 C.inp('origin','Origem do lead',l.origin),
 C.sel('status','Etapa',statuses.map(x=>[x,x]),l.status||'Novo'),
 C.sel('fit','Perfil ideal (ICP)',['Baixo','Médio','Alto'].map(x=>[x,x]),l.fit||'Médio'),
 C.sel('interest','Interesse demonstrado',['Baixo','Médio','Alto'].map(x=>[x,x]),l.interest||'Baixo'),
 C.inp('estimated_value','Valor potencial (R$)',l.estimated_value||'0','number'),
 '<div class="field wide"><label class="squared-input"><input type="checkbox" name="is_decision_maker" '+check+'> Falei com o decisor / pessoa com poder de decisão</label></div>',
 C.area('notes','Informações adicionais',l.notes)
 ].join('');
 return '<div class="featureoverlay" data-feature-overlay><div class="featuremodal"><div class="featureheader"><h2>'+(p.id?'Editar lead':'Cadastrar novo lead')+'</h2>'+button('close','Fechar')+'</div><div class="featurebody"><div class="notice">Score calculado automaticamente a partir dos dados, perfil (ICP) e interesse.</div><form class="featureform" id="leadRecordForm"><div class="formgrid">'+fields+'</div><div class="formfooter">'+button('close','Cancelar')+'<button class="btn primary" type="submit">Salvar lead</button></div></form></div></div></div>';
}
function detailCell(label,val){return '<div><div class="detaillabel">'+e(label)+'</div><div class="detailvalue">'+e(val||'—')+'</div></div>'}
function leadDetail(p){
 const l=co('leads').find(x=>x.id===p.id);if(!l)return '';
 const isOwner=l.owner_id===C.state.user.id;
 let tabs=[['history','Atividades'],['info','Informações'],['calls','Ligações'],['tasks','Tarefas'],['meet','Reuniões'],['closing','Fechamento']];
 if(isOwner)tabs.push(['audio','Gravações'],['sharing','Compartilhar']);
 let content='';
 if(feature.tab==='info'){
 content='<div class="notice">Score '+Number(l.score)+' / 100 — '+warmth(l.score)[1]+'. Avaliação por dados, perfil e interesse.</div>'
 +'<div class="detailgrid">'+[
 ['Contato',l.contact_name],['Cargo',l.position],['Telefone',l.phone],['E-mail',l.email],['Segmento',l.segment],['Cidade',l.city?l.city+' / '+(l.state||''):l.state],
 ['Origem',l.origin],['Site',l.website],['Status',l.status],['Perfil ideal',l.fit],['Interesse',l.interest],['Decisor',l.is_decision_maker?'Sim':'Não'],
 ['Valor potencial',C.money(l.estimated_value)]
 ].map(v=>detailCell(v[0],v[1])).join('')+'</div><div class="separator"></div><div class="detaillabel">Observações</div><p style="font-size:12px;line-height:1.8;white-space:pre-line">'+e(l.notes||'Nenhuma observação')+'</p><div class="stacked" style="margin-top:20px">'+teamButton(l)+(isOwner?button('edit-lead:'+l.id,C.ic('edit')+' Editar lead','dark'):'')+(l.phone?lnk('https://wa.me/'+(cleanPhone(l.phone).length<=11?'55':'')+cleanPhone(l.phone),'Abrir WhatsApp'):'')+'</div>';
 }else if(feature.tab==='history'){
 const events=co('leadEvents').filter(a=>a.lead_id===l.id).map(a=>({...a,kind:a.action,when:a.created_at}));
 const calls=co('callHistory').filter(a=>a.lead_id===l.id).map(a=>({id:'ligacao-'+a.id,kind:'Ligação registrada',detail:[a.display_result||a.result,a.notes].filter(Boolean).join(' · '),when:a.happened_at||a.created_at,actor_id:a.actor_id,actor_email:a.actor_email}));
 const all=[...events,...calls].sort((a,b)=>Date.parse(b.when||0)-Date.parse(a.when||0));
 const views=events.filter(a=>a.action==='visualizou').length;
 content='<section class="jadem-lead-audit"><h3>Histórico de acessos e ações</h3><p class="muted">'+views+' acesso(s) à ficha · '+all.length+' evento(s) registrados</p>'+
 '<p class="muted">Ações identificadas por usuário, data e horário. Abrir o WhatsApp ou discador não confirma envio ou ligação.</p>'+
 (all.length?'<div class="timeline">'+all.map(a=>'<div class="timelinerow"><strong>'+e(a.kind||'Atividade')+'</strong>'+
 '<small>'+dateTime(a.when)+'</small><p><b>Usuário:</b> '+e(auditActor(a))+'</p>'+
 (a.detail?'<p>'+e(a.detail)+'</p>':'')+'</div>').join('')+'</div>':'<div class="feature-empty">Nenhum acesso ou ação registrado até agora.</div>')+'</section>';
 }else if(feature.tab==='sharing'){
 const shared=co('shares').filter(s=>s.lead_id===l.id);
 content='<div class="notice">Compartilhe com e-mails confiáveis. O colaborador precisa criar uma conta no JADEM com o mesmo endereço. Ele poderá visualizar a ficha, e seus acessos serão registrados, mas não poderá editá-la.</div>'
 +'<form id="shareLeadForm" class="featureform"><div class="formgrid">'+C.inp('shared_email','E-mail do colaborador','','email',true,true)+'</div><div class="formfooter"><button class="btn primary" type="submit">Conceder acesso</button></div></form>'
 +'<div class="separator"></div><h3 style="font-size:13px">Usuários com acesso</h3>'
 +(shared.length?shared.map(s=>'<div class="settingsrow"><div><strong>'+e(s.shared_email)+'</strong><p>Permissão de leitura • desde '+C.fmt(s.created_at)+'</p></div>'+button('remove-share:'+s.id,'Revogar','danger')+'</div>').join(''):'<p class="muted">Nenhum compartilhamento ativo.</p>');
 }else if(feature.tab==='audio'){
 const files=co('recordings').filter(a=>a.lead_id===l.id);
 content='<div class="notice">Para anexar uma ligação, utilize um áudio obtido legalmente de sua telefonia. O botão de gravação ao vivo captura apenas o microfone autorizado do navegador — não a chamada externa.</div>'
 +'<label class="squared-input"><input id="audioConsent" type="checkbox" '+(feature.audioConsent?'checked':'')+'> Tenho autorização/base legal adequada para gravar ou armazenar este áudio.</label>'
 +'<div class="stacked" style="margin:15px 0">'+button('audio-upload:'+l.id,C.ic('plus')+' Anexar áudio','dark')+button('audio-start:'+l.id,'Gravar microfone')+button('audio-stop:'+l.id,'Parar gravação','danger')+'</div>'
 +'<input type="file" id="audioFile" hidden accept="audio/webm,audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/ogg,audio/aac,.mp3,.m4a,.wav,.ogg,.webm">'
 +(files.length?files.map(f=>'<div class="recbox"><strong>'+e(f.filename)+'</strong><small>'+dateTime(f.created_at)+' • '+Math.round((Number(f.bytes)||0)/1024)+' KB</small>'+button('play:'+f.id,'Reproduzir','outline')+' '+button('delete-audio:'+f.id,'Excluir','danger')+'</div>').join(''):'<div class="feature-empty">Nenhuma gravação anexada.</div>');
 }else if(feature.tab==='calls'){
 const calls=co('callHistory').filter(x=>x.lead_id===l.id).slice().sort((a,b)=>Date.parse(b.happened_at)-Date.parse(a.happened_at));
 const dial=l.phone?'<a class="btn primary sm" href="tel:+'+e(cleanPhone(l.phone).length<=11?'55'+cleanPhone(l.phone):cleanPhone(l.phone))+'">☎ Ligar agora</a>':'<div class="notice">Telefone não cadastrado.</div>';
 content='<h3>Ligações realizadas</h3><p class="muted">Resultados de ligações registrados na central de chamadas.</p>'+dial+
 (calls.length?'<div class="timeline">'+calls.map(x=>'<div class="timelinerow"><strong>'+e(x.result||'Ligação registrada')+'</strong><small>'+dateTime(x.happened_at)+'</small><p>'+e(x.notes||'Sem observações')+'</p></div>').join('')+'</div>':'<div class="feature-empty">Nenhuma ligação registrada para este lead.</div>');
 }else if(feature.tab==='tasks'){
 const tasks=co('tasks').filter(x=>x.lead_id===l.id).slice().sort((a,b)=>String(a.due_at||'').localeCompare(String(b.due_at||'')));
 content='<h3>Tarefas relacionadas</h3><p class="muted">Tarefas vinculadas diretamente a este lead.</p>'+
 (tasks.length?tasks.map(x=>'<div class="recbox"><strong>'+e(x.title||'Tarefa')+'</strong><small>'+dateTime(x.due_at)+'</small><p>'+e(x.notes||'')+'</p></div>').join(''):'<div class="feature-empty">Nenhuma tarefa vinculada diretamente a este lead.</div>');
 }else if(feature.tab==='closing'){
 const deals=co('deals').filter(x=>x.lead_id===l.id);
 content='<h3>Fechamento comercial</h3><p class="muted">Oportunidades vinculadas a este lead. Para alterar a etapa ou registrar resultados, utilize o Funil de vendas.</p>'+
 (deals.length?deals.map(x=>'<div class="recbox"><strong>'+e(x.title||'Oportunidade')+'</strong><small>Etapa: '+e(x.stage||'Não informada')+'</small><p>Valor: '+C.money(x.amount||0)+'</p></div>').join(''):'<div class="feature-empty">Nenhuma oportunidade vinculada a este lead.</div>');
 }else {
 const meetings=co('meetings').filter(m=>m.lead_id===l.id).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at));
 content=(isOwner?'<div class="stacked" style="margin-bottom:16px">'+button('meeting-new:'+l.id,C.ic('plus')+' Agendar reunião','primary')+'</div>':'')
 +'<div class="notice">Salve a reunião e abra o evento no Google Agenda. O convite é confirmado na sua conta Google.</div>'
 +(meetings.length?meetings.map(m=>'<div class="recbox"><strong>'+e(m.title)+'</strong><small>'+dateTime(m.scheduled_at)+'</small><div class="stacked">'+lnk(calendarUrl(m,l),'Google Agenda')+(m.meet_url?lnk(m.meet_url,'Abrir Meet'):'')+'</div></div>').join(''):'<div class="feature-empty">Nenhuma reunião cadastrada para este lead.</div>');
 }
 const detailCss='<style>.featureoverlay.jadem-lead-screen{position:fixed;inset:0;display:block;padding:0;background:#f4f7fb;backdrop-filter:none;z-index:120}.jadem-lead-screen .jadem-lead-surface{width:100%;max-width:none;height:100dvh;max-height:none;overflow-y:auto;border-radius:0;box-shadow:none;background:#f4f7fb}.jadem-lead-header{background:#fff;padding:23px clamp(18px,3vw,45px);align-items:flex-start}.jadem-lead-header .eyebrow{letter-spacing:1.7px;color:#139984;font-weight:800;margin-bottom:8px}.jadem-lead-header h2{font:800 clamp(21px,3vw,29px) Manrope;margin:0 0 7px;color:#17334d}.jadem-lead-header p{font-size:12px;color:#718599;margin:0}.jadem-lead-header .jadem-lead-head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.jadem-lead-screen .featuretabs{background:#fff;position:sticky;top:0;z-index:3;padding:0 clamp(18px,3vw,45px)}.jadem-lead-screen .featuretab{font-size:12px;padding:15px 18px}.jadem-lead-screen .featurebody{max-width:1400px;margin:0 auto;padding:20px clamp(18px,3vw,45px) 120px}.jadem-lead-screen .detailgrid{grid-template-columns:repeat(2,minmax(0,1fr));background:#fff;border:1px solid #e2eaf2;border-radius:14px;padding:22px}.jadem-lead-stage{background:#fff;border:1px solid #e4edf4;border-radius:12px;padding:17px 20px;display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;margin:15px 0}.jadem-lead-stage strong{font-size:13px;color:#173c59}.jadem-lead-stage span{font-size:11px;color:#7990a3}.jadem-lead-footer{position:fixed;bottom:0;left:0;right:0;z-index:8;background:#fff;border-top:1px solid #e3eaf1;padding:13px clamp(18px,3vw,45px);display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;box-shadow:0 -8px 25px #28415915}@media(max-width:720px){.jadem-lead-header{padding:15px}.jadem-lead-header .jadem-lead-head-actions{width:100%}.jadem-lead-screen .featurebody{padding:13px 13px 120px}.jadem-lead-screen .detailgrid{grid-template-columns:1fr;padding:13px}.jadem-lead-footer{padding:9px;justify-content:center}.jadem-lead-footer .btn{flex:1;font-size:11px}}</style>';
 const tel=cleanPhone(l.phone||''),whatsapp=tel.length<=11?'55'+tel:tel;
 const foot='<footer class="jadem-lead-footer">'+(l.phone?'<a class="btn outline sm" data-lead-channel="discador" href="tel:+'+e(whatsapp)+'">☎ Ligar agora</a>':'')+
 (isOwner?button('edit-lead:'+l.id,'Qualificação','dark'):'')+
 button('lead-tab:closing','Fechamento','primary')+'</footer>';
 return '<div class="featureoverlay jadem-lead-screen">'+detailCss+
 '<div class="featuremodal wide jadem-lead-surface"><div class="featureheader jadem-lead-header">'+
 '<div><div class="eyebrow">JADEM CRM / LEADS / ATENDIMENTO COMERCIAL</div><h2>'+e(l.company_name)+' &nbsp; '+scoreHtml(l.score)+'</h2>'+
 '<p>'+e(l.contact_name||'')+' · '+e(l.phone||'Sem telefone')+' · '+e(l.city||'')+'</p></div>'+
 '<div class="jadem-lead-head-actions">'+(l.phone?'<a class="btn outline sm" data-lead-channel="discador" href="tel:+'+e(whatsapp)+'">☎ Ligar</a><a class="btn outline sm" target="_blank" rel="noopener noreferrer" data-lead-channel="whatsapp" href="https://wa.me/'+whatsapp+'">WhatsApp</a>':'')+
 button('close','← Voltar à lista')+'</div></div>'+
 '<div class="featuretabs">'+tabs.map(t=>'<button class="featuretab '+(feature.tab===t[0]?'on':'')+'" data-fx="lead-tab:'+t[0]+'">'+e(t[1])+'</button>').join('')+'</div>'+
 '<div class="featurebody"><div class="jadem-lead-stage"><div><span>ETAPA DO LEAD</span><br><strong>'+e(l.status||'Novo')+'</strong></div>'+
 '<div><span>CENTRAL DE ATENDIMENTO</span><br><strong>'+e(l.contact_name||'Contato comercial')+'</strong></div></div>'+
 content+'</div>'+foot+'</div></div>';
}
function meetingForm(p){
 const l=p.lead_id?co('leads').find(x=>x.id===p.lead_id):null;
 const leadSelect=C.sel('lead_id','Vincular a um lead (opcional)',co('leads').map(l=>[l.id,l.company_name+' — '+(l.contact_name||'')]),l?.id||'',true);
 const linked=isGoogleConnected(),booking=bookingPageUrl();
 return '<div class="featureoverlay" data-feature-overlay><div class="featuremodal"><div class="featureheader"><h2>Nova reunião</h2>'+button('close','Fechar')+'</div><div class="featurebody">'+
 '<div class="notice">Agende com qualquer pessoa, mesmo fora da sua lista de leads. O link Google Meet não precisa ser preenchido manualmente.</div>'+
 '<form class="featureform" id="meetingForm"><div class="formgrid">'+leadSelect+operationField(l?.operation_id??p.operation_id)+
 C.inp('guest_name','Nome do convidado / participante',p.guest_name||'','text',true)+
 C.inp('guest_email','E-mail do convidado (para convite)',p.guest_email||'','email')+
 C.inp('guest_phone','Telefone / WhatsApp',p.guest_phone||'','tel')+
 C.inp('guest_company','Empresa ou organização',p.guest_company||'','text',true)+
 C.inp('title','Título da reunião',p.title||'Reunião comercial','text',true,true)+
 '<div class="field wide"><label>Escolher horário no Google Agenda</label>'+
 (booking?'<a class="btn primary" target="_blank" rel="noopener noreferrer" href="'+e(booking)+'">📅 Abrir meu agendamento Google ↗</a>':'<div class="notice">Configure sua página pública de agendamento em Agendamentos.</div>')+
 '<p class="note">Escolha o horário na página do Google. Depois, sincronize ou importe a reserva no JADEM; não é necessário salvar esta mesma reunião duas vezes.</p>'+
 '<details><summary style="cursor:pointer;color:#567389;font-size:12px;font-weight:700">Ou informar data e hora diretamente no JADEM</summary>'+
 '<div style="margin-top:10px">'+C.inp('scheduled_at','Data e hora (para salvar direto no JADEM)',p.scheduled_at||'','datetime-local',true,false)+'</div></details></div>'+
 C.sel('duration_minutes','Duração',[[30,'30 minutos'],[45,'45 minutos'],[60,'1 hora'],[90,'1h30']],60)+
 C.area('notes','Pauta / observações','')+
 '<div class="field wide"><details class="meet-advanced"><summary>Já tenho um link Meet (opcional)</summary>'+
 C.inp('meet_url','Colar link existente do Google Meet','','url',true)+
 '</details></div></div>'+
 (linked?
 '<div class="meeting-google-state connected"><strong>✓ Google Agenda conectada</strong><p>Ao salvar no JADEM, o evento será criado na sua agenda e o Meet será solicitado automaticamente. Convites serão enviados aos e-mails informados.</p></div>':
 '<div class="meeting-google-state"><strong>Google Agenda não conectada ao JADEM</strong><p>Você pode abrir um evento preenchido no Google Agenda e adicionar o Meet por lá. Para o JADEM criar e salvar o link automaticamente, conecte o Google na tela de Agendamentos.</p></div>')+
 '<div class="meeting-google-tools">'+
 '<button type="button" class="btn outline sm" data-fx="google-calendar-draft">'+C.ic('calendar')+' Abrir no Google Agenda</button>'+
 (booking?'<a class="btn outline sm" target="_blank" rel="noopener noreferrer" href="'+e(booking)+'">'+C.ic('link')+' Meu link de agendamento ↗</a>':'')+
 '</div><div class="formfooter">'+button('close','Cancelar')+
 '<button class="btn primary" type="submit">Salvar reunião'+(linked?' e gerar Meet':' no JADEM')+'</button></div></form></div></div></div>';
}
function googleCalendarDraft(form){
 const v=Object.fromEntries(new FormData(form).entries());
 const name=bare(v.title),rawDate=bare(v.scheduled_at),duration=Number(v.duration_minutes)||60;
 if(!name||!rawDate)throw Error('Informe título, data e horário antes de abrir o Google Agenda.');
 const start=new Date(rawDate);
 if(!Number.isFinite(start.getTime()))throw Error('Data ou horário inválido.');
 if(duration<15||duration>480)throw Error('Duração inválida.');
 const end=new Date(start.getTime()+duration*60000);
 const iso=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const q=new URLSearchParams({
  action:'TEMPLATE',text:name,dates:iso(start)+'/'+iso(end),
  details:[v.notes, v.guest_name?'Participante: '+v.guest_name:'',v.guest_company?'Empresa: '+v.guest_company:'',v.guest_phone?'Telefone: '+v.guest_phone:''].filter(Boolean).join('\n')
 });
 if(v.guest_email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.guest_email))q.set('add',v.guest_email);
 return 'https://calendar.google.com/calendar/render?'+q.toString();
}
function calendarUrl(m,lead){
 const start=new Date(m.scheduled_at),end=new Date(start.getTime()+(Number(m.duration_minutes)||60)*60000);
 const iso=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const q=new URLSearchParams({action:'TEMPLATE',text:m.title,dates:iso(start)+'/'+iso(end),details:(m.notes||'')+(m.meet_url?'\nGoogle Meet: '+m.meet_url:'')+'\nConvidado: '+(m.guest_name||lead?.contact_name||'')+'\nEmpresa: '+(m.guest_company||lead?.company_name||''),location:m.meet_url||''});
 return 'https://calendar.google.com/calendar/render?'+q.toString();
}
async function saveLead(form){
 const v=Object.fromEntries(new FormData(form).entries());
 for(const k of Object.keys(v))if(typeof v[k]==='string')v[k]=v[k].trim();
 v.is_decision_maker=!!form.elements.is_decision_maker.checked;
 v.estimated_value=Math.max(0,Number(v.estimated_value)||0);
 if(v.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))throw Error('E-mail inválido.');
 if(!v.company_name||v.company_name.length<2)throw Error('Informe o nome da empresa.');
 v.score=scoreCalc(v);
 v.operation_id=v.operation_id||null;
 const leadId=feature.panel?.id||null;
 if(leadId){const original=co('leads').find(x=>x.id===leadId);if(original&&original.owner_id!==C.state.user.id)throw Error('Lead compartilhado: acesso somente para leitura.')}
 const q=leadId?C.db.from('jadem_leads').update({...v,updated_at:new Date().toISOString()}).eq('id',leadId).select('id').single():C.db.from('jadem_leads').insert(v).select('id').single();
 const {data,error}=await q;if(error)throw error;
 const original=leadId?co('leads').find(x=>x.id===leadId):null;
 const changed=original?Object.entries({company_name:'empresa',contact_name:'contato',phone:'telefone',email:'e-mail',status:'etapa comercial',fit:'perfil ICP',interest:'interesse',notes:'observações',estimated_value:'valor potencial',is_decision_maker:'identificação do decisor'}).filter(([k])=>String(original[k]??'')!==String(v[k]??'')).map(([k,label])=>k==='status'||k==='fit'||k==='interest'?label+': '+String(original[k]||'—')+' → '+String(v[k]||'—'):label+' atualizado'):[];
 const detail=original?(changed.length?'Campos alterados: '+changed.join('; '):'Formulário salvo sem alterações de campos'):'Lead cadastrado · Pontuação inicial: '+v.score;
 await C.load();await writeEvent(data.id,leadId?'editou':'criou',detail.slice(0,1500));
 feature.panel={type:'detail',id:data.id};feature.tab='info';C.render();C.toast('Lead salvo com sucesso.');
}
async function saveMeeting(form){
 const v=Object.fromEntries(new FormData(form).entries());
 for(const k in v)if(typeof v[k]==='string')v[k]=v[k].trim();
 const lead=v.lead_id?co('leads').find(x=>x.id===v.lead_id):null;
 if(v.lead_id&&!lead)throw Error('Lead selecionado indisponível.');
 if(!lead&&(!v.guest_name||v.guest_name.length<2))throw Error('Informe o nome do convidado para marcar sem lead.');
 if(!v.scheduled_at)throw Error('Informe a data e hora.');
 if(v.guest_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.guest_email))throw Error('E-mail inválido.');
 if(v.meet_url&&!/^https:\/\/meet\.google\.com\/[a-z0-9-]+(?:[/?#].*)?$/i.test(v.meet_url))throw Error('Link do Meet inválido.');
 const assigned=!!lead&&co('assignments').some(x=>x.lead_id===lead.id&&x.assigned_email.toLowerCase()===C.state.user.email.toLowerCase());
 if(lead&&lead.owner_id!==C.state.user.id&&!assigned)throw Error('Você não pode agendar para este lead.');
 v.owner_id=lead?.owner_id||C.state.user.id;
 v.operation_id=lead?.operation_id||v.operation_id||null;
 v.lead_id=lead?.id||null;
 v.guest_name=v.guest_name||lead?.contact_name||lead?.company_name||null;
 v.guest_email=v.guest_email||lead?.email||null;
 v.guest_phone=v.guest_phone||lead?.phone||null;
 v.guest_company=v.guest_company||lead?.company_name||null;
 v.source='JADEM CRM';
 v.scheduled_at=new Date(v.scheduled_at).toISOString();
 if(!Number.isFinite(new Date(v.scheduled_at).getTime()))throw Error('Data inválida.');
 v.duration_minutes=Number(v.duration_minutes)||60;
 v.status='Agendada';v.result='Pendente';
 const closer=lead?co('assignments').find(x=>x.lead_id===lead.id&&x.role==='CLOSER'):null;
 v.closer_email=closer?.assigned_email||(!lead||lead.owner_id===C.state.user.id?C.state.user.email:null);
 const autoGoogle=isGoogleConnected();
 delete v.auto_google;
 if(autoGoogle)await verifyGoogleAvailability(v.scheduled_at,v.duration_minutes);
 const {data:meeting,error}=await C.db.from('jadem_lead_meetings').insert(v).select('*').single();
 if(error)throw error;
 await C.load();
 if(lead)await writeEvent(lead.id,'reuniao',v.title);
 feature.panel=null;C.render();C.toast('Reunião salva no JADEM.');
 if(autoGoogle){try{await syncGoogleMeeting(meeting)}catch(err){C.toast('Reunião salva, mas não vinculada ao Google: '+err.message)}}
}
async function loadXlsx(){
 if(window.XLSX)return window.XLSX;
 if(!window.__jademXlsxPromise)window.__jademXlsxPromise=new Promise((resolve,reject)=>{
 const s=document.createElement('script');s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';s.async=true;
 s.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('A biblioteca Excel não iniciou.'));
 s.onerror=()=>reject(Error('Não foi possível carregar o leitor Excel.'));document.head.append(s);
 });
 return window.__jademXlsxPromise;
}
const excelHeaders=['Empresa','Contato','Cargo','Telefone','Email','Segmento','Cidade','Estado','Origem','Site','Status','Perfil','Interesse','Decisor','Valor previsto','Observações'];
function excelValue(s){let v=bare(s);return /^[=+\-@\t\r]/.test(v)?"'"+v:v}
function rowForExport(l){return {
 Empresa:excelValue(l.company_name),Contato:excelValue(l.contact_name),Cargo:excelValue(l.position),Telefone:excelValue(l.phone),
 Email:excelValue(l.email),Segmento:excelValue(l.segment),Cidade:excelValue(l.city),Estado:excelValue(l.state),Origem:excelValue(l.origin),
 Site:excelValue(l.website),Status:l.status,Perfil:l.fit,Interesse:l.interest,Decisor:l.is_decision_maker?'Sim':'Não',
 'Valor previsto':Number(l.estimated_value||0),Score:Number(l.score||0),'Observações':excelValue(l.notes)
}}
async function exportXlsx(template=false){
 const XLSX=await loadXlsx();
 const rows=template?[Object.fromEntries(excelHeaders.map(h=>[h,'']))]:co('leads').map(rowForExport);
 const ws=XLSX.utils.json_to_sheet(rows,{header:template?excelHeaders:[...excelHeaders,'Score']});
 ws['!cols']=excelHeaders.concat(['Score']).map(h=>({wch:['Empresa','Contato','Observações'].includes(h)?30:19}));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Leads');
 XLSX.writeFile(wb,template?'jadem-modelo-importacao.xlsx':'jadem-leads-'+new Date().toISOString().slice(0,10)+'.xlsx');
}
function norm(k){return String(k).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function readCell(row,aliases){const dict=Object.fromEntries(Object.entries(row).map(([k,v])=>[norm(k),v]));for(const k of aliases){if(dict[norm(k)]!==undefined)return bare(dict[norm(k)]);}return '';}
function yes(x){return ['1','sim','s','yes','true','x'].includes(norm(x))}
function safeEnum(x,items,def){let z=items.find(y=>norm(y)===norm(x));return z||def}
function mappedLead(row){
 let l={
 company_name:readCell(row,['Empresa','Razão Social','Nome da Empresa','Company','empresa_nome']),
 contact_name:readCell(row,['Contato','Pessoa','Nome','Decisor','Nome do Contato']),
 position:readCell(row,['Cargo','Função','Posição']),
 phone:readCell(row,['Telefone','Celular','WhatsApp','Fone']),
 email:readCell(row,['Email','E-mail','Correio']),
 segment:readCell(row,['Segmento','Ramo','Atividade']),
 city:readCell(row,['Cidade','Município']),
 state:readCell(row,['Estado','UF']),
 origin:readCell(row,['Origem','Fonte','Canal']),
 website:readCell(row,['Site','Website','URL']),
 status:safeEnum(readCell(row,['Status','Situação','Etapa']),statuses,'Novo'),
 fit:safeEnum(readCell(row,['Perfil','ICP','Fit']),['Baixo','Médio','Alto'],'Médio'),
 interest:safeEnum(readCell(row,['Interesse','Intenção']),['Baixo','Médio','Alto'],'Baixo'),
 is_decision_maker:yes(readCell(row,['Decisor','É Decisor','Tomador de decisão'])),
 estimated_value:Math.max(0,Number(readCell(row,['Valor previsto','Valor','Ticket']).replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'))||0),
 notes:readCell(row,['Observações','Notas','Informações','Obs'])
 };
 l.score=scoreCalc(l);
 return l;
}
async function importXlsx(file){
 if(feature.importBusy)return;
 if(!file)return;
 if(file.size>5*1024*1024)throw Error('Arquivo acima de 5 MB.');
 const XLSX=await loadXlsx();
 const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
 const ws=wb.Sheets[wb.SheetNames[0]];
 if(!ws)throw Error('Não há planilha no arquivo.');
 const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
 if(rows.length>2000)throw Error('Limite de 2.000 linhas por importação.');
 const seen=new Set(co('leads').map(l=>[norm(l.company_name),cleanPhone(l.phone),norm(l.email)].join('|')));
 const prepared=[];let skipped=0;
 for(const item of rows){
  const l=mappedLead(item);
  if(l.company_name.length<2){skipped++;continue;}
  const key=[norm(l.company_name),cleanPhone(l.phone),norm(l.email)].join('|');
  if(seen.has(key)){skipped++;continue;}
  seen.add(key);prepared.push({...l,operation_id:C.state.activeOperation&&C.state.activeOperation!=='unassigned'?C.state.activeOperation:null});
 }
 if(!prepared.length)return C.toast('Nenhum lead novo para importar. Confira as colunas e os duplicados.');
 if(!C.state.activeOperation&&(C.state.rawData?.clientOperations||[]).length)throw Error('Selecione a operação no menu lateral antes de importar Excel.');
 if(!window.confirm('Importar '+prepared.length+' leads para o JADEM CRM? '+skipped+' linhas serão ignoradas (vazias, inválidas ou duplicadas).'))return;
 feature.importBusy=true;
 let done=0,events=[];
 try{
  for(let i=0;i<prepared.length;i+=100){
   const {data,error}=await C.db.from('jadem_leads').insert(prepared.slice(i,i+100)).select('id');
   if(error)throw error;
   done+=(data||[]).length;
   events.push(...(data||[]).map(x=>({lead_id:x.id,action:'importou',detail:'Importação Excel'})));
  }
  for(let i=0;i<events.length;i+=100){
   const r=await C.db.from('jadem_lead_events').insert(events.slice(i,i+100));
   if(r.error)console.warn('Audit import:',r.error.message);
  }
  await C.load();C.toast(done+' leads importados com sucesso.');
 }catch(err){await C.load();throw Error('Importação parcial ('+done+' registros): '+err.message)}
 finally{feature.importBusy=false;}
}
async function playAudio(id){
 const row=co('recordings').find(x=>x.id===id);if(!row)return;
 const {data,error}=await C.db.storage.from('jadem-call-audio').createSignedUrl(row.file_path,120);
 if(error)throw error;
 window.open(data.signedUrl,'_blank','noopener,noreferrer');
}
async function uploadAudio(file,leadId){
 if(!feature.audioConsent)throw Error('Confirme a autorização de gravação/armazenamento.');
 if(!file||!file.size)throw Error('Arquivo vazio.');
 if(file.size>25*1024*1024)throw Error('O áudio deve ter no máximo 25 MB.');
 const allowed=['audio/webm','audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg','audio/aac'];
 const ext=(file.name.split('.').pop()||'webm').toLowerCase();
 const extMime={webm:'audio/webm',mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',aac:'audio/aac'};
 const mime=allowed.includes(file.type)?file.type:extMime[ext];
 if(!mime)throw Error('Formato de áudio não suportado.');
 const uid=C.state.user.id,path=uid+'/'+crypto.randomUUID()+'.'+ext;
 const up=await C.db.storage.from('jadem-call-audio').upload(path,file,{contentType:mime,upsert:false});
 if(up.error)throw up.error;
 const ins=await C.db.from('jadem_call_recordings').insert({lead_id:leadId,file_path:path,filename:file.name,mime_type:mime,bytes:file.size,consent_confirmed:true});
 if(ins.error){await C.db.storage.from('jadem-call-audio').remove([path]);throw ins.error;}
 await C.load();await writeEvent(leadId,'gravacao','Áudio anexado');
 feature.tab='audio';C.render();C.toast('Áudio anexado ao lead.');
}
async function micStart(id){
 if(!feature.audioConsent)throw Error('Confirme primeiro que possui autorização para gravar.');
 if(feature.recorder)throw Error('Já há uma gravação em andamento.');
 if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Microfone não disponível neste navegador.');
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});
 const type=MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'';
 const r=new MediaRecorder(stream,type?{mimeType:type}:{});
 feature.recChunks=[];feature.recorderStream=stream;feature.recorder=r;
 r.ondataavailable=x=>{if(x.data&&x.data.size)feature.recChunks.push(x.data)};
 r.onstop=async()=>{const blob=new Blob(feature.recChunks,{type:r.mimeType||'audio/webm'});stream.getTracks().forEach(t=>t.stop());feature.recorder=null;feature.recorderStream=null;try{await uploadAudio(new File([blob],'microfone-'+Date.now()+'.webm',{type:blob.type}),id)}catch(err){C.toast(err.message)}};
 r.start();
 C.toast('Microfone gravando. Clique em Parar gravação para salvar.');
}
function fxKind(btn,prefix){return btn.startsWith(prefix)?btn.slice(prefix.length):null}
async function onFxClick(ev){
 const outbound=ev.target.closest?.('[data-lead-channel]');
 if(outbound&&feature.panel?.type==='detail'){
  const which=outbound.dataset.leadChannel;
  const msg=which==='whatsapp'?'Abriu o WhatsApp do contato; mensagem não confirmada.':'Acionou o discador; ligação não confirmada.';
  writeEvent(feature.panel.id,'abriu canal externo',msg).catch(err=>console.warn('JADEM auditoria:',err.message));
  return;
 }

 const row=ev.target.closest('[data-lead-open]');
 if(row){openInfo(row.dataset.leadOpen);return;}
 const b=ev.target.closest('[data-fx]');
 if(!b){
  if(ev.target.matches('[data-feature-overlay]')){if(!feature.recorder){feature.panel=null;C.render()}else C.toast('Pare a gravação antes de fechar.')}
  return;
 }
 const a=b.dataset.fx;
 try{
  if(a==='close'){if(feature.recorder)throw Error('Pare a gravação antes de fechar.');feature.panel=null;C.render();}
  else if(a==='lead-new'){feature.panel={type:'edit'};C.render();}
  else if(a==='google-calendar-draft'){const form=document.getElementById('meetingForm');if(!form)throw Error('Formulário de reunião não encontrado.');window.open(googleCalendarDraft(form),'_blank','noopener,noreferrer');C.toast('Revise o convite e adicione o Meet no Google Agenda antes de salvar.');}
  else if(a.startsWith('edit-lead:')){feature.panel={type:'edit',id:a.split(':')[1]};C.render();}
  else if(a.startsWith('lead-tab:')){feature.tab=a.split(':')[1];C.render();}
  else if(a==='meeting-new'||a.startsWith('meeting-new:')){feature.panel={type:'meeting',lead_id:a.includes(':')?a.split(':')[1]:null};C.render();}
  else if(a==='export-xlsx')await exportXlsx(false);
  else if(a==='download-template')await exportXlsx(true);
  else if(a==='import-xlsx')document.getElementById('leadExcelInput')?.click();
  else if(a.startsWith('remove-share:')){
    const s=co('shares').find(x=>x.id===a.split(':')[1]);if(!s)return;
    if(!confirm('Revogar acesso de '+s.shared_email+' a este lead?'))return;
    const {error}=await C.db.from('jadem_lead_shares').delete().eq('id',s.id);
    if(error)throw error;await C.load();await writeEvent(s.lead_id,'revogou compartilhamento','Acesso removido para '+s.shared_email);C.toast('Acesso revogado.');
  }
  else if(a.startsWith('play:'))await playAudio(a.split(':')[1]);
  else if(a.startsWith('audio-upload:')){if(!feature.audioConsent)throw Error('Marque a caixa de autorização antes de anexar áudio.');document.getElementById('audioFile')?.click();}
  else if(a.startsWith('audio-start:'))await micStart(a.split(':')[1]);
  else if(a.startsWith('audio-stop:')){if(feature.recorder)feature.recorder.stop();else C.toast('Não há gravação em andamento.');}
  else if(a.startsWith('delete-audio:')){
   if(!confirm('Excluir permanentemente este áudio?'))return;
   const row=co('recordings').find(x=>x.id===a.split(':')[1]);if(!row)return;
   const del=await C.db.from('jadem_call_recordings').delete().eq('id',row.id);if(del.error)throw del.error;
   const sr=await C.db.storage.from('jadem-call-audio').remove([row.file_path]);if(sr.error)C.toast('Metadados removidos; verifique o arquivo no Storage.');
   await C.load();C.toast('Áudio removido.');
  }
 }catch(err){C.toast(err.message||'Não foi possível executar a ação.');console.warn(err);}
}
async function onFxChange(ev){
 if(ev.target.id==='leadFilter'){feature.filter=ev.target.value;C.render();}
 if(ev.target.id==='audioConsent'){feature.audioConsent=ev.target.checked;}
 if(ev.target.id==='leadExcelInput'){try{await importXlsx(ev.target.files[0])}catch(err){C.toast(err.message)}ev.target.value=''}
 if(ev.target.id==='audioFile'){try{await uploadAudio(ev.target.files[0],feature.panel?.id)}catch(err){C.toast(err.message)}ev.target.value=''}
}
async function onFxSubmit(ev){
 if(!['leadRecordForm','meetingForm','shareLeadForm'].includes(ev.target.id))return;
 ev.preventDefault();ev.stopPropagation();
 const f=ev.target;const submit=f.querySelector('[type=submit]');if(submit)submit.disabled=true;
 try{if(f.id==='leadRecordForm')await saveLead(f);else if(f.id==='meetingForm')await saveMeeting(f);else{
   const lead=co('leads').find(x=>x.id===feature.panel?.id);
   if(!lead||lead.owner_id!==C.state.user.id)throw Error('Acesso negado.');
   const email=bare(f.elements.shared_email.value).toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Informe um e-mail válido.');
   if(email===bare(C.state.user.email).toLowerCase())throw Error('Você já é o responsável por este lead.');
   const {error}=await C.db.from('jadem_lead_shares').insert({lead_id:lead.id,shared_email:email});
   if(error)throw error;await C.load();await writeEvent(lead.id,'compartilhou','Acesso de leitura concedido para '+email);C.toast('Acesso liberado.');}
 }catch(err){C.toast(err.message||'Erro ao salvar.');console.warn(err);}finally{if(submit)submit.disabled=false;}
}
