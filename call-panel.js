
import {openLeadFromDeal,openMeetingFromDeal} from './features.js';
let C,chosen='',opened=null,formBusy=false,editScript=false,search='',onlyToday=false;
let sessionSeconds=0,timerStart=0,timerHandle=null,isRunning=false,requestId=null,remoteScript='';
let phase='qualification',panelTab='Qualificar',draft={},quick='',tags=[],selectedScriptId='',isNewScript=false;
const esc=v=>C.esc(v??'');
const data=k=>C.state.data[k]||[];
const auth=l=>l.owner_id===C.state.user.id||data('assignments').some(a=>a.lead_id===l.id&&String(a.assigned_email||'').toLowerCase()===String(C.state.user.email||'').toLowerCase());
const phone=l=>String(l.phone||'').replace(/\D/g,'');
const tel=l=>{const p=phone(l);return p.length===10||p.length===11?'55'+p:p};
const when=x=>x?new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(x)):'—';
const isDue=l=>l.next_call_at&&new Date(l.next_call_at).getTime()<=Date.now();
const canCall=l=>auth(l)&&phone(l).length>=10&&!l.do_not_contact&&l.status!=='Descartado';
const rank=l=>(isDue(l)?1000:0)+(l.is_decision_maker?45:0)+Number(l.score||0)*2-(l.next_call_at&&!isDue(l)?250:0)-Math.min(85,Number(l.call_attempts||0)*5);
function leadQueue(){
 let q=data('leads').filter(canCall);
 if(onlyToday)q=q.filter(l=>isDue(l)||!l.last_called_at&&!l.next_call_at);
 if(search)q=q.filter(l=>[l.company_name,l.contact_name,l.phone].some(x=>String(x||'').toLowerCase().includes(search.toLowerCase())));
 return q.sort((a,b)=>rank(b)-rank(a)||a.company_name.localeCompare(b.company_name,'pt-BR'));
}
const current=()=>leadQueue().find(x=>x.id===chosen)||leadQueue()[0]||null;
const client=l=>data('clientOperations').find(x=>x.id===l?.operation_id);
function renderedScript(l){
 const clientOp=client(l),selectedScript=data('callScripts').find(s=>s.id===selectedScriptId&&s.operation_id===l.operation_id);
 const text=selectedScript?.content||remoteScript||clientOp?.call_script||'Olá, {contato}! Tudo bem? Aqui é da Mioli. Estou falando com a empresa {empresa}. Poderia conversar com a pessoa responsável?';
 const tokens={contato:l.contact_name||'tudo bem',empresa:l.company_name,decisor:l.contact_name||'o responsável',servico:clientOp?.service_type||'estruturação comercial'};
 return text.replace(/\{(contato|empresa|decisor|servico)\}/gi,(_,k)=>tokens[k.toLowerCase()]);
}
function clock(s){s=Math.max(0,Math.floor(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function seconds(){return sessionSeconds+(isRunning?Math.floor((Date.now()-timerStart)/1000):0)}
function timerText(){
 const el=document.getElementById('jademCallDuration');if(el)el.textContent=clock(seconds());
 const btn=document.querySelector('[data-call="timer"]');if(btn)btn.textContent=isRunning?'Pausar cronômetro':'Iniciar cronômetro';
}
function stopTimer(){if(isRunning){sessionSeconds=seconds();isRunning=false}if(timerHandle){clearInterval(timerHandle);timerHandle=null}timerText()}
function startTimer(){if(isRunning)return;isRunning=true;timerStart=Date.now();timerHandle=setInterval(timerText,1000);timerText()}
function leadLog(l){
 const h=data('callHistory').filter(x=>x.lead_id===l.id).slice().sort((a,b)=>Date.parse(b.happened_at)-Date.parse(a.happened_at)).slice(0,10);
 return h.length?h.map(x=>'<div class="dial-log"><strong>'+esc(x.result)+'</strong><small>'+esc(when(x.happened_at))+' · '+esc(x.actor_email||'')+'</small><p>'+esc(x.notes)+'</p><small>Duração anotada: '+clock(x.duration_seconds||0)+'</small></div>').join(''):
 '<div class="dial-empty">Nenhuma ligação registrada ainda.</div>';
}
export function callQueueView(){
 const q=leadQueue(),l=current();
 const daily=data('callHistory').filter(x=>x.actor_id===C.state.user.id&&new Date(x.happened_at).toDateString()===new Date().toDateString());
 const items=[['Ligações de hoje',daily.length],['Fila de contatos',q.length],['Retornos vencidos',q.filter(isDue).length],['Reuniões agendadas',daily.filter(x=>x.result==='Reunião agendada').length]];
 return C.title('Minhas Ligações','Prospecção, abordagem, resultados, retornos e tarefas por empresa atendida.',
 '<button class="btn primary" data-call="begin">'+C.ic('phone')+' Começar Prospecção</button>')+
 '<div class="grid4 dial-stats">'+items.map(x=>'<div class="card kpi"><div class="metric-label">'+esc(x[0])+'</div><div class="metric-value">'+x[1]+'</div></div>').join('')+'</div>'+
 '<div class="dial-work"><div class="card dial-queue"><div class="dial-queue-top"><h2>Fila de prospecção</h2><small>'+q.length+' contatos</small></div>'+
 '<div class="dial-filters"><input id="dialSearch" placeholder="Buscar empresa ou decisor" value="'+esc(search)+'">'+
 '<label><input id="dialToday" type="checkbox" '+(onlyToday?'checked':'')+'> Prioridade de hoje</label></div>'+
 '<div class="dial-scroller">'+(q.length?q.slice(0,200).map((x,i)=>'<button class="dial-lead-row '+(x.id===l?.id?'selected':'')+'" data-call="choose:'+x.id+'">'+
 '<span class="dial-num">'+(i+1)+'</span><span><strong>'+esc(x.company_name)+'</strong><small>'+esc(x.contact_name||'Decisor não identificado')+'</small>'+
 '<small>'+esc(x.next_call_at?'Retorno '+when(x.next_call_at):'Sem retorno agendado')+'</small></span>'+
 '<b>'+Number(x.score||0)+'</b></button>').join(''):'<p class="dial-empty">Nenhum contato disponível. Cadastre leads com telefone válido.</p>')+'</div></div>'+
 (l?'<section class="card dial-preview"><div class="dial-preview-head"><div><span class="dial-eyebrow">PRÓXIMA LIGAÇÃO</span><h2>'+esc(l.company_name)+'</h2>'+
 '<p>'+esc(l.contact_name||'Decisor não identificado')+'</p><small>'+esc(client(l)?.name||'Sem operação')+'</small></div><div class="dial-score">'+Number(l.score||0)+'</div></div>'+
 '<div class="dial-preview-data">'+[['Telefone',l.phone],['Status',l.status],['Tentativas',l.call_attempts||0],['Último contato',when(l.last_called_at)],['Próximo retorno',when(l.next_call_at)],['Interesse',l.fit||'Não avaliado']].map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('')+'</div>'+
 '<div class="dial-actions"><button class="btn primary" data-call="begin">☎ Ligar — abrir atendimento</button>'+
 '<button class="btn outline" data-call="lead">Abrir ficha</button><button class="btn outline" data-call="next">Próximo lead →</button></div>'+
 '<div class="dial-preview-script"><h3>Script comercial</h3><p>'+esc(renderedScript(l))+'</p></div>'+
 '<div class="dial-preview-history"><h3>Últimas ligações</h3>'+leadLog(l)+'</div></section>':
 '<div class="card dial-empty"><h2>Sem contatos para ligar</h2><p>Importe leads para iniciar a prospecção.</p></div>')+'</div>'+
 '<div class="notice dial-disclaimer">Ao clicar em Ligar, o painel de atendimento abre. A chamada só começa no aparelho quando você aciona o discador. O tempo é medido por cronômetro manual; o JADEM não detecta nem grava a chamada automaticamente.</div>';
}
function tickFields(label,html){return '<label class="dial-field"><span>'+label+'</span>'+html+'</label>'}
const outcomeChoices=['Sem interesse','Caixa postal','Não atendeu','Número inválido','Retornar depois','Interessado','Reunião agendada','Proposta enviada','Follow-up','Fechado','Perdido','Falei c/ lead','Não chama','Não é momento'];
const resultMap={
 'Sem interesse':'Sem interesse','Caixa postal':'Não atendeu','Não atendeu':'Não atendeu','Número inválido':'Número inválido',
 'Retornar depois':'Retornar','Interessado':'Interessado','Reunião agendada':'Reunião agendada',
 'Proposta enviada':'Interessado','Follow-up':'Retornar','Fechado':'Interessado','Perdido':'Sem interesse',
 'Falei c/ lead':'Falou com decisor','Não chama':'Não atendeu','Não é momento':'Retornar'
};
const pipeline=[['','— manter —'],['Novo','Novo'],['Em contato','Em contato'],['Qualificado','Qualificado'],
 ['Oportunidade','Oportunidade'],['Cliente','Cliente'],['Descartado','Descartado']];
function escAttr(s){return esc(s)}
function field(name,label,input){return '<label class="dial-field"><span>'+label+'</span>'+input+'</label>'}
function select(name,values,chosen='',extra=''){
 return '<select name="'+name+'" '+extra+'><option value="">Selecionar...</option>'+
 values.map(v=>'<option value="'+escAttr(v)+'" '+(v===chosen?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>';
}
function textField(name,value='',hint='',rows=4){
 return '<textarea name="'+name+'" rows="'+rows+'" maxlength="4000" placeholder="'+escAttr(hint)+'">'+esc(value||'')+'</textarea>';
}
function input(name,val='',attrs=''){return '<input name="'+name+'" value="'+escAttr(val||'')+'" '+attrs+'>'}
function radio(name,values,selected){
 return '<div class="dial-radio-row">'+values.map(v=>'<label class="dial-radio"><input type="radio" name="'+name+'" value="'+escAttr(v)+'" '+(selected===v?'checked':'')+'><span>'+esc(v)+'</span></label>').join('')+'</div>';
}
function tabContents(l){
 if(panelTab==='Qualificar')return '<h3>Qualificar contato</h3>'+
 field('Nome do decisor',input('decision_maker',draft.decision_maker??l.contact_name,'maxlength="200" placeholder="Nome do responsável"'))+
 field('É o decisor?',radio('decision_flag',['Sim','Não / Influenciador','Não sei'],draft.decision_flag||''))+
 field('A pessoa atendeu?',radio('answered',['Sim','Não'],draft.answered||''))+
 field('Nível de interesse',radio('interest_level',['Alto','Médio','Baixo','Não avaliado'],draft.interest_level||''))+
 field('Principal dor / desafio',textField('pain',draft.pain,'Ex.: preço, suporte, captação de clientes...',3));
 if(panelTab==='Script')return '<h3>Script comercial</h3><p class="dial-modal-script">'+esc(renderedScript(l))+'</p>'+
 '<p class="dial-tip">Selecione o script no painel à esquerda. O administrador pode cadastrar scripts para esta operação.</p>';
 if(panelTab==='Notas')return '<h3>Notas do contato</h3>'+field('O que aconteceu na chamada?',textField('notes',draft.notes,'Resumo da conversa, objeções e próximos passos...',6));
 if(panelTab==='WhatsApp')return '<h3>WhatsApp</h3><p class="dial-tip">Abra a conversa para enviar uma mensagem autorizada ao contato.</p>'+
 '<a class="btn primary" href="https://wa.me/'+esc(tel(l))+'" target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp ↗</a>';
 if(panelTab==='Tarefa')return '<h3>Próxima tarefa</h3>'+field('Descrição da tarefa',input('task_title',draft.task_title,'maxlength="300" placeholder="Ex.: enviar apresentação"'))+
 '<div class="dial-form-two">'+field('Prazo',input('task_due_at',draft.task_due_at,'type="datetime-local"'))+
 field('Prioridade',select('task_priority',['Normal','Alta','Baixa'],draft.task_priority||'Normal'))+'</div>';
 if(panelTab==='Reunião')return '<h3>Agendar reunião</h3><p class="dial-tip">Se a chamada resultar em reunião agendada, selecione esse resultado ao finalizar. O JADEM abrirá o formulário do Google Agenda e Meet após o registro.</p>'+
 '<button type="button" class="btn outline" data-call="meeting">Abrir agendamento agora ↗</button>';
 return '';
}
function callScriptBox(l){
 const op=client(l),scripts=data('callScripts').filter(s=>s.operation_id===l.operation_id);
 const chosen=scripts.find(s=>s.id===selectedScriptId);
 const chosenValue=chosen?.id||'initial';
 const choose='<select id="callScriptSelect" data-call-select="script">'+
 '<option value="initial" '+(chosenValue==='initial'?'selected':'')+'>Ligação inicial</option>'+
 scripts.map(x=>'<option value="'+escAttr(x.id)+'" '+(chosenValue===x.id?'selected':'')+'>'+esc(x.title)+'</option>').join('')+'</select>';
 const editor=editScript&&op&&l.owner_id===C.state.user.id?
 '<form id="callScriptEdit"><label>Nome do script'+input('title',isNewScript?'':chosen?.title||'Ligação inicial','required maxlength="90"')+'</label>'+
 '<label>Conteúdo<textarea name="script" rows="9" maxlength="10000" required>'+
 esc(isNewScript?'':chosen?.content||op.call_script||'')+'</textarea></label>'+
 '<div class="dial-script-actions"><button class="btn primary sm" type="submit">Salvar script</button><button type="button" class="btn neutral sm" data-call="cancelScript">Cancelar</button></div></form>':
 '<p id="dialScriptText">'+esc(renderedScript(l))+'</p>';
 return '<section class="dial-script dial-script-in-session"><div class="dial-script-head"><h3>Scripts</h3>'+
 (op&&l.owner_id===C.state.user.id?'<button type="button" class="btn outline sm" data-call="newScript">+ Novo</button>':'')+
 '</div>'+choose+editor+'<div class="dial-script-copy"><button type="button" class="btn outline sm" data-call="copyScript">Copiar script</button></div>'+
 (!op?'<p class="dial-tip">Vincule o lead a uma operação para cadastrar scripts.</p>':
 !scripts.length&&!op.call_script?'<p class="dial-tip">Nenhum script cadastrado para esta empresa; exibindo sugestão inicial.</p>':'')+'</section>';
}
function qualificationModal(l){
 const tabs=['Qualificar','Script','Notas','WhatsApp','Tarefa','Reunião'];
 return '<div class="dial-modal-grid dial-live-grid"><div class="dial-modal-left">'+
 '<div class="dial-contact"><div class="dial-avatar">'+esc((l.contact_name||l.company_name).slice(0,1).toUpperCase())+'</div>'+
 '<div><strong>'+esc(l.company_name)+'</strong><span>'+esc(l.contact_name||'Decisor não identificado')+'</span><small>'+esc(client(l)?.name||'Sem operação')+'</small></div></div>'+
 '<div class="dial-session-controls"><a class="btn primary" href="tel:+'+esc(tel(l))+'" data-call="dial">☎ Abrir Vivo Voz Negócio / Discador</a>'+
 '<button type="button" class="btn outline sm" data-call="timer">'+(isRunning?'Pausar cronômetro':'Iniciar cronômetro')+'</button>'+
 '<button type="button" class="btn neutral sm" data-call="reset">Zerar</button></div>'+
 callScriptBox(l)+'<div class="dial-sidehistory"><h3>Histórico de ligações</h3>'+leadLog(l)+'</div></div>'+
 '<div class="dial-modal-right dial-qualify-col">'+
 '<nav class="dial-calltabs">'+tabs.map(t=>'<button type="button" data-call="tab:'+t+'" class="'+(panelTab===t?'active':'')+'">'+esc(t)+'</button>').join('')+'</nav>'+
 '<form id="callDraftForm" class="dial-qualify-form">'+tabContents(l)+'</form>'+
 '<div class="dial-quick"><h4>Resultado rápido</h4><div>'+
 [['Caixa postal','Caixa postal'],['Não chama','Não chama'],['Falei c/ lead','Falei c/ lead'],['Sem interesse','Sem interesse'],['Não é momento','Não é momento']].map(x=>
 '<button type="button" class="dial-quicktag" data-call="quick:'+x[0]+'">'+esc(x[1])+'</button>').join('')+'</div></div>'+
 '<div class="dial-qualification-footer"><small>Qualifique durante a chamada; depois finalize e registre o histórico.</small>'+
 '<button type="button" class="btn primary" data-call="finish">Finalizar ligação →</button></div>'+
 '</div></div>';
}
function finishingModal(l){
 return '<div class="dial-finalize"><div class="dial-finalize-head"><div><h3>Finalizar ligação</h3><small>'+esc(l.company_name)+' · Duração: '+clock(seconds())+'</small></div>'+
 '<button type="button" class="btn neutral sm" data-call="back">← Voltar à chamada</button></div>'+
 '<form id="callFinishForm" class="dial-finalize-form">'+
 field('Resultado *',select('display_result',outcomeChoices,quick,'required'))+
 '<div class="dial-result-tags"><b>TAGS</b><div>'+outcomeChoices.map(tag=>
 '<button type="button" class="dial-tag '+(tags.includes(tag)?'on':'')+'" data-call="tag:'+tag+'">'+esc(tag)+'</button>').join('')+'</div></div>'+
 field('Notas / o que aconteceu',textField('notes',draft.notes||'', 'Resumo da ligação e detalhes combinados...',4))+
 '<div class="dial-form-two">'+field('Próximo follow-up',input('next_call_at',draft.next_call_at||'','type="datetime-local"'))+
 field('Mover pipeline para', '<select name="pipeline_status">'+pipeline.map(([v,label])=>'<option value="'+escAttr(v)+'" '+(v===(draft.pipeline_status||'')?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select>')+'</div>'+
 '<div class="dial-form-section"><h3>Tarefa (opcional)</h3>'+
 field('Descrição',input('task_title',draft.task_title||'','maxlength="300" placeholder="Ex.: Retornar proposta"'))+
 '<div class="dial-form-two">'+field('Prazo',input('task_due_at',draft.task_due_at||'','type="datetime-local"'))+
 field('Prioridade',select('task_priority',['Normal','Alta','Baixa'],draft.task_priority||'Normal'))+'</div></div>'+
 (l.owner_id===C.state.user.id?'<div class="dial-attachment">'+
 field('Enviar gravação (opcional, até 25 MB)','<input name="recording" type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/ogg,audio/aac,.mp3,.m4a,.wav,.webm,.ogg">')+
 '<label class="dial-recording-confirm"><input type="checkbox" name="audio_consent"> Confirmo que tenho autorização ou base legal adequada para armazenar este áudio.</label></div>':
 '<p class="dial-tip">Gravações poderão ser anexadas pelo responsável da operação.</p>')+
 '<label class="dial-recording-confirm"><input type="checkbox" name="no_contact"> Não contatar novamente</label>'+
 '<div class="dial-final-buttons"><button type="button" class="btn outline" data-call="back">Cancelar</button>'+
 '<button type="submit" name="finish_mode" value="followup" class="btn outline">Salvar e criar follow-up</button>'+
 '<button type="submit" name="finish_mode" value="stage" class="btn outline">Salvar e mover etapa</button>'+
 '<button type="submit" name="finish_mode" value="plain" class="btn primary">Apenas finalizar</button></div>'+
 '</form></div>';
}
export function callModal(){
 if(!opened)return '';
 const l=data('leads').find(x=>x.id===opened);if(!l)return '';
 return '<div class="dial-shade" data-dial-shade><div class="dial-modal '+(phase==='finish'?'dial-final-mode':'')+'" role="dialog" aria-modal="true" aria-label="Central de ligações">'+
 '<div class="dial-modal-header"><div><small>JADEM CRM / CENTRAL DE ATENDIMENTO</small><h2>'+esc(l.company_name)+'</h2><p>'+esc(l.phone||'')+' · '+esc(client(l)?.name||'Sem operação')+'</p></div>'+
 '<div class="dial-header-right"><div class="dial-time"><small>DURAÇÃO DA SESSÃO</small><strong id="jademCallDuration">'+clock(seconds())+'</strong></div>'+
 '<button type="button" class="dial-close" data-call="close" aria-label="Fechar">×</button></div></div>'+
 (phase==='finish'?finishingModal(l):qualificationModal(l))+'</div></div>';
}

function stop(){if(isRunning){sessionSeconds=seconds();isRunning=false}if(timerHandle){clearInterval(timerHandle);timerHandle=null}updateTimer()}
function start(){if(isRunning)return;timerStart=Date.now();isRunning=true;timerHandle=setInterval(updateTimer,1000);updateTimer()}
function updateTimer(){const t=document.getElementById('jademCallDuration');if(t)t.textContent=clock(seconds());const b=document.querySelector('[data-call="timer"]');if(b)b.textContent=isRunning?'Pausar cronômetro':'Iniciar cronômetro'}
function open(){
 const l=current();if(!l){C.toast('Não há leads disponíveis para prospecção.');return}
 stop();sessionSeconds=0;requestId=crypto.randomUUID();opened=l.id;editScript=false;remoteScript='';phase='qualification';panelTab='Qualificar';draft={};quick='';tags=[];selectedScriptId='';isNewScript=false;C.render();
 if(!client(l)?.call_script)C.db.rpc('jadem_authorized_call_script',{p_lead_id:l.id}).then(({data,error})=>{
  if(!error&&opened===l.id&&data){remoteScript=data;const target=document.getElementById('dialScriptText');if(target)target.textContent=renderedScript(l)}
 }).catch(console.warn);
}
function close(){stop();opened=null;requestId=null;phase='qualification';draft={};tags=[];C.render()}
function next(){const q=leadQueue();let i=q.findIndex(l=>l.id===current()?.id);chosen=q[i+1]?.id||q[0]?.id||'';C.render()}
async function uploadOptionalAudio(file,leadId,consent){
 if(!file||!file.size)return null;
 if(!consent)throw Error('Confirme que possui autorização ou base legal para armazenar a gravação.');
 if(file.size>25*1024*1024)throw Error('Arquivo de áudio acima do limite de 25 MB.');
 const ext=String(file.name||'').split('.').pop().toLowerCase();
 const formats={mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',wav:'audio/wav',webm:'audio/webm',ogg:'audio/ogg',aac:'audio/aac'};
 if(!formats[ext])throw Error('Formato de áudio não permitido.');
 const path=C.state.user.id+'/'+crypto.randomUUID()+'.'+ext;
 const up=await C.db.storage.from('jadem-call-audio').upload(path,file,{contentType:formats[ext],upsert:false});
 if(up.error)throw up.error;
 const ins=await C.db.from('jadem_call_recordings').insert({lead_id:leadId,file_path:path,filename:file.name,mime_type:formats[ext],bytes:file.size,consent_confirmed:true});
 if(ins.error){await C.db.storage.from('jadem-call-audio').remove([path]);throw ins.error}
 return path;
}
function captureDraft(){
 const form=document.getElementById('callDraftForm');
 if(!form)return;
 const fd=new FormData(form);
 for(const [key,value] of fd.entries())draft[key]=String(value);
}
function draftValues(key,values){return values.get(key)===null?'':String(values.get(key)||'').trim()}
async function saveCall(form,mode){
 const l=data('leads').find(x=>x.id===opened);if(!l)throw Error('Lead não localizado.');
 const fd=new FormData(form),v=k=>draftValues(k,fd),display=v('display_result'),base=resultMap[display];
 if(!base)throw Error('Selecione o resultado final.');
 const unanswered=['Caixa postal','Não atendeu','Não chama','Número inválido'].includes(display);
 if(draft.answered==='Não'&&!unanswered||draft.answered==='Sim'&&unanswered)throw Error('Corrija a informação sobre atendimento ou selecione resultado compatível.');
 const answered=!unanswered;
 const level=draft.interest_level||'Não avaliado';
 const interest=answered?(level==='Alto'?'Sim':level==='Médio'?'Talvez':level==='Baixo'?'Não':'Não avaliado'):'Não avaliado';
 const txt=v('notes')||draft.notes||'';
 const summary=txt.trim()||('Resultado registrado: '+display);
 const follow=v('next_call_at'),stage=v('pipeline_status'),task=v('task_title'),due=v('task_due_at');
 if(mode==='followup'&&!follow)throw Error('Escolha a data do próximo follow-up.');
 if(mode==='stage'&&!stage)throw Error('Selecione a etapa para mover o pipeline.');
 if(task&&!due&&mode!=='followup')throw Error('Informe um prazo para a tarefa.');
 const asIso=x=>x?new Date(x).toISOString():null;
 if(follow&&!Number.isFinite(Date.parse(follow))||due&&!Number.isFinite(Date.parse(due)))throw Error('Data de retorno ou tarefa inválida.');
 const job=task||(mode==='followup'?'Retornar contato: '+l.company_name:'');
 const jobDate=task?due:mode==='followup'?follow:'';
 if(job&&!jobDate)throw Error('Defina o prazo da tarefa.');
 const audio=fd.get('recording');
 if(audio?.size){
  if(l.owner_id!==C.state.user.id)throw Error('A gravação precisa ser anexada pelo responsável da operação.');
  if(!fd.has('audio_consent'))throw Error('Confirme a autorização de armazenamento da gravação.');
  if(audio.size>25*1024*1024)throw Error('O áudio precisa ter no máximo 25 MB.');
 }
 const blocked=fd.has('no_contact');
 const args={
 p_lead_id:l.id,p_request_id:requestId,p_result:base,p_notes:summary,p_next_action:draft.next_action||job||null,
 p_next_call_at:asIso(follow),p_no_contact:blocked,p_decision_maker:draft.decision_maker||l.contact_name||null,
 p_answered:answered,p_interest:interest,p_duration_seconds:seconds(),p_task_title:job||null,
 p_task_due_at:asIso(jobDate),p_task_priority:v('task_priority')||draft.task_priority||'Normal',
 p_display_result:display,p_tags:tags,p_pain:draft.pain||null,
 p_decision_flag:draft.decision_flag==='Sim'?true:draft.decision_flag==='Não / Influenciador'?false:null,
 p_interest_level:level,p_pipeline_status:stage||null
 };
 const {error}=await C.db.rpc('jadem_complete_call',args);if(error)throw error;
 let audioErr='';
 if(audio?.size){
  try{await uploadOptionalAudio(audio,l.id,true)}catch(err){audioErr=err.message||'Erro ao anexar gravação';console.warn('Audio attach failed',err)}
 }
 const meeting=display==='Reunião agendada'?{lead_id:l.id,operation_id:l.operation_id,guest_name:draft.decision_maker||l.contact_name||'',guest_email:l.email||'',
  guest_phone:l.phone||'',guest_company:l.company_name||'',title:'Reunião comercial — '+l.company_name}:null;
 stop();opened=null;requestId=null;phase='qualification';draft={};tags=[];quick='';
 await C.load();
 chosen=leadQueue().find(x=>x.id!==l.id)?.id||leadQueue()[0]?.id||'';
 C.toast(audioErr?'Ligação salva. Gravação não anexada: '+audioErr:'Ligação finalizada e histórico atualizado.');
 if(meeting)openMeetingFromDeal(meeting);else C.render();
}

async function onSubmit(e){
 if(!['callFinishForm','callScriptEdit'].includes(e.target.id))return;
 e.preventDefault();e.stopPropagation();if(formBusy)return;
 formBusy=true;const button=e.submitter||e.target.querySelector('[type=submit]');if(button)button.disabled=true;
 try{
  if(e.target.id==='callFinishForm')await saveCall(e.target,button?.value||'plain');
  else{
   const l=data('leads').find(x=>x.id===opened),op=client(l);
   if(!l||!op||l.owner_id!==C.state.user.id)throw Error('Somente o gestor pode salvar scripts.');
   const fd=new FormData(e.target),title=String(fd.get('title')||'').trim(),content=String(fd.get('script')||'').trim();
   if(title.length<2||title.length>90||content.length<5||content.length>10000)throw Error('Informe título e conteúdo válidos.');
   const payload={title,content,updated_at:new Date().toISOString()};
   const existing=data('callScripts').find(x=>x.id===selectedScriptId);
   const dbquery=existing&&!isNewScript?C.db.from('jadem_call_scripts').update(payload).eq('id',existing.id):
     C.db.from('jadem_call_scripts').insert({...payload,operation_id:op.id,owner_id:l.owner_id}).select('id').single();
   const {data:created,error}=await dbquery;
   if(error)throw error;
   if(created?.id)selectedScriptId=created.id;
   remoteScript='';isNewScript=false;editScript=false;
   await C.load();C.toast('Script salvo para a operação.');
  }
 }catch(err){C.toast(err.message||'Erro no registro.');console.warn(err)}
 finally{formBusy=false;if(button)button.disabled=false}
}
function onClick(e){
 const b=e.target.closest('[data-call]');if(!b)return;
 const action=b.dataset.call;
 if(action==='begin')open();
 else if(action==='close')close();
 else if(action==='next')next();
 else if(action==='lead'){const l=current();if(l)openLeadFromDeal(l.id)}
 else if(action.startsWith('choose:')){chosen=action.slice(7);C.render()}
 else if(action==='timer'){isRunning?stop():start()}
 else if(action==='reset'){stop();sessionSeconds=0;updateTimer()}
 else if(action==='dial')start();
 else if(action==='script'){captureDraft();editScript=!editScript;C.render()}
 else if(action==='newScript'){captureDraft();selectedScriptId='';isNewScript=true;editScript=true;C.render()}
 else if(action==='cancelScript'){captureDraft();editScript=false;isNewScript=false;C.render()}
 else if(action==='copyScript'){const l=data('leads').find(x=>x.id===opened);if(l&&navigator.clipboard?.writeText){navigator.clipboard.writeText(renderedScript(l)).then(()=>C.toast('Script copiado.')).catch(()=>C.toast('Não foi possível copiar.'))}}
 else if(action.startsWith('tab:')){captureDraft();panelTab=action.slice(4);C.render()}
 else if(action==='finish'){captureDraft();stop();phase='finish';quick='';C.render()}
 else if(action.startsWith('quick:')){
  captureDraft();quick=action.slice(6);
  if(['Caixa postal','Não chama'].includes(quick)){draft.answered='Não';draft.interest_level='Não avaliado'}
  else{draft.answered='Sim';if(quick==='Sem interesse')draft.interest_level='Baixo'}
  stop();phase='finish';C.render();
 }
 else if(action==='back'){phase='qualification';panelTab='Qualificar';C.render()}
 else if(action.startsWith('tag:')){
  const tag=action.slice(4);tags=tags.includes(tag)?tags.filter(x=>x!==tag):[...tags,tag];
  b.classList.toggle('on',tags.includes(tag));
 }
 else if(action==='meeting'){
  const l=data('leads').find(x=>x.id===opened);if(!l)return;
  if(!window.confirm('Abrir agendamento? As informações ainda não salvas desta ligação serão descartadas.'))return;
  close();openMeetingFromDeal({lead_id:l.id,operation_id:l.operation_id,guest_name:l.contact_name||'',guest_company:l.company_name,guest_phone:l.phone,guest_email:l.email||''});
 }
}
function onChange(e){
 if(e.target.id==='dialToday'){onlyToday=e.target.checked;chosen='';C.render()}
 if(e.target.matches('[data-call-select="script"]')){
  captureDraft();selectedScriptId=e.target.value==='initial'?'':e.target.value;editScript=false;remoteScript='';C.render();
 }
}
function onInput(e){
 if(e.target.id!=='dialSearch')return;
 search=e.target.value;const pos=e.target.selectionStart||0;C.render();
 const input=document.getElementById('dialSearch');if(input){input.focus();input.setSelectionRange(pos,pos)}
}

export function setupCallPanel(ctx){C=ctx;document.addEventListener('click',onClick);document.addEventListener('change',onChange);
 document.addEventListener('input',onInput);document.addEventListener('submit',onSubmit)}
