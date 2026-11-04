
import {openLeadFromDeal,openMeetingFromDeal} from './features.js';
let C=null,activeId=null,tab='resumo',saving=false;
const stages=['Novo','Contato','Qualificado','Proposta','Negociação','Ganho','Perdido'];
const esc=v=>C.esc(v??'');
const list=k=>C.state.data[k]||[];
const deal=()=>list('deals').find(x=>x.id===activeId);
const linked=d=>list('leads').find(x=>x.id===d?.lead_id);
const company=d=>list('companies').find(x=>x.id===d?.company_id);
const person=d=>list('people').find(x=>x.id===d?.person_id);
const tDate=d=>{if(!d)return '—';const t=new Date(d);return Number.isFinite(t.getTime())?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(t):'—'};
const onlyDate=d=>{if(!d)return 'Não definido';const p=d.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:d};
const digits=v=>String(v||'').replace(/\D/g,'');
const leadDetail=(label,val)=>'<div class="deal-detail-info-field"><span>'+esc(label)+'</span><strong>'+esc(val??'—')+'</strong></div>';
const wha=p=>{let n=digits(p);return n.length===10||n.length===11?'55'+n:n};
const history=()=>list('dealHistory').filter(x=>x.deal_id===activeId).sort((x,y)=>Date.parse(y.created_at)-Date.parse(x.created_at));
const actorLabel=x=>{
 const mail=String(x.actor_email||'').trim(),mine=C.state.user||{};
 if(x.actor_id&&x.actor_id===mine.id)return mine.user_metadata?.full_name||mine.user_metadata?.name||mail||mine.email||'Usuário autenticado';
 if(mail){const member=list('roster').find(r=>r.member_email?.toLowerCase()===mail.toLowerCase());return member?.display_name||mail;}
 return x.actor_id?'Usuário identificado no registro':'Registro anterior (autor não identificado)';
};
async function writeAudit(d,kind,detail){
 if(!d||d.owner_id!==C.state.user?.id)return;
 const {data,error}=await C.db.from('jadem_deal_history').insert({owner_id:d.owner_id,deal_id:d.id,actor_id:C.state.user.id,kind,detail}).select('*').single();
 if(error)throw error;
 if(data){C.state.data.dealHistory=[data,...list('dealHistory').filter(x=>x.id!==data.id)];if(activeId===d.id)C.render();}
}
const auditAttempt=(d,kind,detail)=>{writeAudit(d,kind,detail).catch(err=>{console.warn('JADEM auditoria:',err.message);C.toast('O registro de auditoria não pôde ser gravado.');});};
function fullAudit(d){
 const entries=history().slice(),l=linked(d);
 if(l){
  for(const a of list('leadEvents').filter(x=>x.lead_id===l.id)){
   entries.push({id:'lead-'+a.id,kind:'Lead · '+String(a.action||'ação'),detail:a.detail||'Interação na ficha do lead.',created_at:a.created_at,actor_id:a.actor_id,actor_email:a.actor_email});
  }
  for(const c of list('callHistory').filter(x=>x.lead_id===l.id)){
   entries.push({id:'call-'+c.id,kind:'Ligação registrada',detail:[c.display_result||c.result,c.notes].filter(Boolean).join(' · '),created_at:c.happened_at||c.created_at,actor_id:c.actor_id,actor_email:c.actor_email});
  }
 }
 return entries.sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
}

const relatedTasks=d=>list('tasks').filter(x=>(d.company_id&&x.company_id===d.company_id)||(d.person_id&&x.person_id===d.person_id));
const relatedMeetings=d=>{
 const lead=linked(d);return lead?list('meetings').filter(m=>m.lead_id===lead.id):[];
};
function titleBanner(d){
 const l=linked(d),co=company(d),pe=person(d),contact=l?.contact_name||pe?.name||'';
 const name=co?.name||l?.company_name||d.title||'Oportunidade';
 const phone=l?.phone||pe?.phone||co?.phone||'',cnpj=co?.cnpj||l?.cnpj||'';
 return '<header class="jadem-detail-hero"><div class="jadem-kicker">JADEM CRM / FUNIL / ATENDIMENTO COMERCIAL</div>'+
 '<div class="jadem-hero-head"><div class="jadem-identity"><div class="jadem-avatar">J</div><div><h2>'+esc(name)+'</h2>'+
 '<p>'+esc(d.title)+(contact?' · '+esc(contact):'')+(cnpj?' · CNPJ '+esc(cnpj):'')+'</p></div></div>'+
 '<div class="jadem-hero-actions">'+(phone?'<a class="btn outline sm" data-deal-track="Discador" href="tel:+'+esc(wha(phone))+'">☎ Ligar</a><a class="btn outline sm" target="_blank" rel="noopener noreferrer" data-deal-track="WhatsApp" href="https://wa.me/'+wha(phone)+'">◉ WhatsApp</a>':'')+
 (l?'<button class="btn outline sm" data-deal-action="open-lead">Gerenciar lead</button>':'')+
 '<button class="jadem-back" data-deal-action="close">← Voltar ao funil</button></div></div></header>';
}
function resumo(d){
 const l=linked(d),co=company(d),pe=person(d);
 const phone=l?.phone||pe?.phone||co?.phone||'',mail=l?.email||pe?.email||co?.email||'';
 const opts=list('leads').filter(x=>x.owner_id===d.owner_id&&(x.operation_id||null)===(d.operation_id||null));
 return '<div class="deal-view-two"><section class="deal-view-section"><h3>Informações do contato</h3><div class="deal-view-info-grid">'+
 leadDetail('Empresa',co?.name||l?.company_name)+leadDetail('Pessoa responsável',l?.contact_name||pe?.name)+
 leadDetail('Telefone / WhatsApp',phone)+leadDetail('E-mail',mail)+
 leadDetail('Cargo',l?.position||pe?.position)+leadDetail('Origem',l?.origin||'Não informada')+
 leadDetail('Criado em',tDate(d.created_at))+leadDetail('Atualizado',tDate(d.updated_at))+
 '</div></section><section class="deal-view-section"><h3>Lead associado</h3>'+
 '<p class="deal-helper">Vincule um lead para acessar sua ficha, histórico, gravações e reuniões diretamente pelo funil.</p>'+
 '<form id="deal-link-form" class="deal-inline-form"><label for="deal-link-select">Escolher lead desta operação</label>'+
 '<select id="deal-link-select" name="lead_id"><option value="">Sem lead vinculado</option>'+
 opts.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===d.lead_id?'selected':'')+'>'+esc(x.company_name+(x.contact_name?' — '+x.contact_name:''))+'</option>').join('')+'</select>'+
 '<button class="btn outline sm" type="submit">Salvar vínculo</button></form>'+
 (l?'<div class="deal-lead-score"><strong>Score '+(Number(l.score)||0)+'/100</strong><span>'+esc(l.status||'Novo')+'</span></div>':'')+
 '</section></div><section class="deal-view-section"><h3>Observações e informações comerciais</h3>'+
 '<p class="deal-view-notes">'+esc(d.notes||'Ainda não existem observações nesta oportunidade. Clique em Editar oportunidade para adicionar.')+'</p></section>';
}
function timeline(records){
 return records.length?'<div class="deal-timeline">'+records.map(x=>'<div class="deal-time-item"><div class="deal-timeline-dot"></div><div><div class="deal-time-head"><strong>'+esc(x.kind)+'</strong><time>'+esc(tDate(x.created_at))+'</time></div>'+
 '<div class="jadem-audit-actor">👤 '+esc(actorLabel(x))+'</div><p>'+esc(x.detail||'Registro realizado')+'</p></div></div>').join('')+'</div>':
 '<div class="deal-no-data">Nenhum registro de auditoria disponível.</div>';
}
function historico(d){
 const all=fullAudit(d),views=all.filter(x=>x.kind==='Acesso').length;
 return '<section class="deal-view-section jadem-audit-section"><div class="jadem-audit-title"><div><h3>Histórico de acessos e ações</h3>'+
 '<p class="deal-helper">Usuário responsável, data, horário e ação confirmada. Cliques externos indicam apenas a abertura do canal, não o envio de mensagens ou a realização de chamadas.</p></div>'+
 '<span class="jadem-audit-counter">'+views+' acesso(s) · '+all.length+' evento(s)</span></div>'+
 (!all.length?'<div class="deal-no-data">Ainda não há ações registradas nesta oportunidade.</div>':timeline(all))+'</section>';
}
function atividades(d){
 const acts=history().filter(x=>['Nota','Ligação','WhatsApp','E-mail','Reunião','Outro'].includes(x.kind));
 return historico(d)+'<section class="deal-view-section"><h3>Registrar atividade</h3>'+
 '<form id="deal-activity-form" class="deal-inline-form"><label>Tipo de contato</label>'+
 '<select name="kind">'+['Nota','Ligação','WhatsApp','E-mail','Reunião','Outro'].map(x=>'<option value="'+x+'">'+x+'</option>').join('')+'</select>'+
 '<label>Descrição</label><textarea name="detail" rows="4" maxlength="4000" required placeholder="O que foi conversado? Próximo passo, objeção ou informação importante..."></textarea>'+
 '<button class="btn primary sm" type="submit" '+(saving?'disabled':'')+'>Salvar atividade</button></form></section>'+
 '<section class="deal-view-section"><h3>Atividades registradas ('+acts.length+')</h3>'+timeline(acts)+'</section>';
}
function tarefas(d){
 const tasks=relatedTasks(d).slice().sort((a,b)=>String(a.due_at||'').localeCompare(String(b.due_at||'')));
 const needsLink=!d.company_id&&!d.person_id;
 return '<section class="deal-view-section"><h3>Próximos passos</h3>'+
 (needsLink?'<div class="notice">Para criar tarefas vinculadas a esta oportunidade, primeiro associe uma empresa ou uma pessoa em “Editar oportunidade”.</div>':
 '<form id="deal-task-form" class="deal-inline-form"><label>O que precisa ser feito?</label><input name="title" minlength="2" maxlength="300" required placeholder="Ex.: Retornar proposta ao cliente"><label>Quando?</label><input type="datetime-local" name="due_at" required>'+
 '<label>Prioridade</label><select name="priority"><option>Normal</option><option>Alta</option><option>Baixa</option></select><button class="btn primary sm" type="submit" '+(saving?'disabled':'')+'>Criar tarefa</button></form>')+'</section>'+
 '<section class="deal-view-section"><h3>Tarefas relacionadas ('+tasks.length+')</h3>'+
 (tasks.length?tasks.map(t=>'<div class="deal-task-item"><span class="'+(t.done?'deal-done':'')+'">'+esc(t.title)+'</span><small>'+esc(t.done?'Concluída':'Pendente')+' · '+esc(tDate(t.due_at))+' · '+esc(t.priority||'Normal')+'</small></div>').join(''):
 '<div class="deal-no-data">Nenhuma tarefa encontrada para essa pessoa ou empresa.</div>')+'</section>';
}
function reunioes(d){
 const meets=relatedMeetings(d).slice().sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at));
 return '<section class="deal-view-section"><h3>Reuniões ('+meets.length+')</h3>'+
 (!d.lead_id?'<p class="deal-helper">Vincule um lead à oportunidade para reunir aqui seus agendamentos. Você pode agendar uma reunião agora mesmo.</p>':'')+
 (meets.length?meets.map(m=>'<div class="deal-meeting-item"><div><strong>'+esc(m.title)+'</strong><span>'+esc(tDate(m.scheduled_at))+' · '+esc(m.status)+'</span></div>'+
 (m.meet_url&&/^https:\/\/meet\.google\.com\//.test(m.meet_url)?'<a class="btn outline sm" target="_blank" rel="noopener noreferrer" href="'+esc(m.meet_url)+'">Entrar no Meet ↗</a>':'')+'</div>').join(''):
 '<div class="deal-no-data">Nenhuma reunião vinculada até agora.</div>')+
 '<button class="btn primary sm" data-deal-action="new-meeting">Agendar nova reunião</button></section>';
}
function infoExtras(d){
 const l=linked(d),co=company(d),pe=person(d);
 return '<div class="jadem-top-row"><section class="jadem-stage-card"><span>ETAPA ATUAL DO FUNIL</span><select data-deal-action-select="stage">'+stages.map(v=>'<option value="'+esc(v)+'" '+(v===d.stage?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select><small>Atualização integrada ao Kanban</small></section>'+
 '<section class="jadem-service-card"><span>CENTRAL DE ATENDIMENTO</span><strong>'+esc(l?.contact_name||pe?.name||'Contato comercial')+'</strong><small>'+esc(l?.phone||pe?.phone||co?.phone||'Telefone não cadastrado')+'</small></section></div>'+
 '<section class="deal-view-section"><h3>Informações do lead e qualificação</h3><div class="deal-view-info-grid">'+
 leadDetail('Nome do lead',l?.contact_name||pe?.name)+leadDetail('Empresa',co?.name||l?.company_name)+
 leadDetail('Telefone',l?.phone||pe?.phone||co?.phone)+leadDetail('WhatsApp',l?.whatsapp||l?.phone||pe?.phone)+
 leadDetail('E-mail',l?.email||pe?.email||co?.email)+leadDetail('CNPJ',co?.cnpj||l?.cnpj)+
 leadDetail('Cidade',co?.city||l?.city)+leadDetail('Estado',co?.state||l?.state)+
 leadDetail('Origem',l?.origin)+leadDetail('Classe / Status',l?.status||'Não definida')+
 leadDetail('Pontuação',l&&l.score!=null?String(l.score)+'/100':'Não definida')+
 leadDetail('Valor da oportunidade',C.money(d.amount||0))+
 '</div></section>';
}
function ligacoes(d){
 const h=history().filter(x=>x.kind==='Ligação'),l=linked(d),co=company(d),pe=person(d),phone=l?.phone||pe?.phone||co?.phone||'';
 return '<section class="deal-view-section"><h3>Ligações e resultados</h3>'+
 (phone?'<a class="btn primary sm" data-deal-track="Discador" href="tel:+'+esc(wha(phone))+'">☎ Ligar agora</a>':'<div class="notice">Cadastre um telefone para ligar.</div>')+
 '<form id="deal-activity-form" class="deal-inline-form"><input type="hidden" name="kind" value="Ligação"><label>Registrar resultado da ligação</label>'+
 '<textarea name="detail" rows="3" maxlength="4000" required placeholder="Atendeu? Próximo contato, objeção, retorno..."></textarea>'+
 '<button class="btn primary sm" type="submit" '+(saving?'disabled':'')+'>Salvar ligação</button></form></section>'+
 '<section class="deal-view-section"><h3>Histórico de ligações ('+h.length+')</h3>'+timeline(h)+'</section>';
}
function fechamento(d){
 return '<div class="jadem-top-row"><section class="jadem-stage-card"><span>RESULTADO DA OPORTUNIDADE</span>'+
 '<select data-deal-action-select="stage">'+stages.map(v=>'<option value="'+esc(v)+'" '+(v===d.stage?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>'+
 '<small>Selecione Ganho ou Perdido para concluir a negociação</small></section>'+
 '<section class="jadem-service-card"><span>VALOR NEGOCIADO</span><strong>'+C.money(d.amount||0)+'</strong>'+
 '<small>Previsão de fechamento: '+esc(onlyDate(d.expected_close))+'</small></section></div>'+
 '<section class="deal-view-section"><h3>Fechamento comercial</h3>'+
 '<p class="deal-helper">A etapa é salva no CRM e sincronizada com o funil. Para registrar justificativas, valores ou observações, utilize Editar oportunidade.</p>'+
 '<div class="jadem-inline-actions"><button class="btn dark sm" data-deal-action="edit">Editar oportunidade</button>'+
 '<button class="btn outline sm" data-deal-action="new-meeting">Agendar reunião</button></div></section>'+historico(d);
}
const leadStyles='<style>.jadem-audit-title{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.jadem-audit-counter{color:#148e80;background:#e6f8f3;border-radius:8px;padding:8px 11px;font-size:11px;font-weight:800;white-space:nowrap}.jadem-audit-actor{color:#667e93;font-size:11px;font-weight:700;margin-top:4px}.jadem-audit-section .deal-time-head{gap:15px}.deal-detail-backdrop.jadem-page{position:fixed;inset:0;padding:0;display:block;background:#f4f7fb;backdrop-filter:none;z-index:80}.jadem-page .deal-detail-panel{width:100%;height:100dvh;max-height:none;overflow-y:auto;border-radius:0;box-shadow:none;background:#f4f7fb}.jadem-detail-hero{background:#fff;padding:22px clamp(18px,3vw,48px);border-bottom:1px solid #e7edf4}.jadem-kicker{color:#139984;font-size:10px;font-weight:800;letter-spacing:1.7px;margin-bottom:14px}.jadem-hero-head{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}.jadem-identity{display:flex;align-items:center;gap:15px;min-width:0}.jadem-avatar{width:49px;height:49px;border-radius:13px;background:#173c59;color:#fff;display:flex;align-items:center;justify-content:center;font:800 21px Manrope}.jadem-identity h2{font:800 clamp(21px,2.7vw,29px) Manrope;color:#17334d;margin:0 0 5px}.jadem-identity p{font-size:12px;color:#7a8da1;margin:0;overflow-wrap:anywhere}.jadem-hero-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.jadem-back{border:1px solid #dce6ef;background:#f4f7fb;color:#3a566c;border-radius:9px;padding:10px 13px;font:700 12px Manrope;cursor:pointer}.jadem-page .deal-tablist{padding:0 clamp(18px,3vw,48px);position:sticky;top:0;z-index:4;box-shadow:0 2px 10px #1b46620b}.jadem-page .deal-tablist button{font-size:12px;padding:15px 18px}.jadem-page .deal-view-content{max-width:1500px;margin:0 auto;padding:22px clamp(18px,3vw,48px) 120px}.jadem-page .deal-view-section{box-shadow:0 2px 8px #25405a08}.jadem-top-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:17px}.jadem-stage-card,.jadem-service-card{background:#fff;border:1px solid #e4ecf3;border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:9px;min-width:0}.jadem-stage-card>span,.jadem-service-card>span{font-size:10px;font-weight:800;letter-spacing:1px;color:#8496a8}.jadem-stage-card select{max-width:380px;border:1px solid #d6e5ec;background:#f7fbfc;border-radius:9px;padding:11px;color:#173c59;font-weight:700}.jadem-stage-card small,.jadem-service-card small{font-size:11px;color:#8b9aac}.jadem-service-card strong{font:800 18px Manrope;color:#23485f}.jadem-inline-actions{display:flex;gap:10px;flex-wrap:wrap}.jadem-footbar{position:fixed;bottom:0;left:0;right:0;z-index:10;background:#fff;border-top:1px solid #e3eaf1;box-shadow:0 -8px 30px #29405713;padding:13px clamp(18px,3vw,48px);display:flex;gap:9px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.jadem-footbar .btn{min-height:39px}.jadem-footbar .jadem-spacer{flex:1}.jadem-page .deal-view-info-grid{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:720px){.jadem-detail-hero{padding:15px}.jadem-identity{align-items:flex-start}.jadem-avatar{width:40px;height:40px;flex-shrink:0}.jadem-hero-actions{width:100%}.jadem-hero-actions .btn{flex:1}.jadem-page .deal-view-content{padding:13px 13px 125px}.jadem-top-row{grid-template-columns:1fr}.jadem-page .deal-view-info-grid{grid-template-columns:1fr}.jadem-footbar{padding:9px;justify-content:center}.jadem-footbar .btn{font-size:10px;flex:1}.jadem-footbar .jadem-spacer{display:none}}</style>';
export function dealDetailsOverlay(){
 const d=deal();if(!d||C.state.modal)return '';
 const navigation=[['atividades','Atividades'],['resumo','Informações'],['ligacoes','Ligações'],['tarefas','Tarefas'],['reunioes','Reuniões'],['fechamento','Fechamento']];
 const body=tab==='resumo'?infoExtras(d)+resumo(d):tab==='atividades'?atividades(d):tab==='ligacoes'?ligacoes(d):tab==='tarefas'?tarefas(d):tab==='reunioes'?reunioes(d):fechamento(d);
 const l=linked(d),co=company(d),pe=person(d),phone=l?.phone||pe?.phone||co?.phone||'';
 const footer='<footer class="jadem-footbar"><span class="jadem-spacer"></span>'+
 (l?'<button class="btn outline sm" data-deal-action="open-lead">Ver / gerenciar lead</button>':'')+
 (phone?'<a class="btn outline sm" data-deal-track="Discador" href="tel:+'+esc(wha(phone))+'">☎ Ligar agora</a>':'')+
 '<button class="btn outline sm" data-deal-action="to-qualificacao">Qualificação</button>'+
 '<button class="btn primary sm" data-deal-action="to-fechamento">Fechamento</button></footer>';
 return '<div class="deal-detail-backdrop jadem-page">'+leadStyles+'<div class="deal-detail-panel" role="region" aria-label="Atendimento comercial da oportunidade">'+
 titleBanner(d)+'<nav class="deal-tablist" aria-label="Abas do atendimento">'+navigation.map(x=>'<button role="tab" aria-selected="'+(tab===x[0])+'" class="'+(tab===x[0]?'active':'')+'" data-deal-tab="'+x[0]+'">'+x[1]+'</button>').join('')+'</nav>'+
 '<main class="deal-view-content">'+body+'</main>'+footer+'</div></div>';
}
function open(id){
 if(!list('deals').some(x=>x.id===id))return;
 activeId=id;tab='atividades';C.render();auditAttempt(deal(),'Acesso','Abriu a ficha da oportunidade pelo funil.');
}
function close(){activeId=null;C.render()}
async function updateDeal(d,values){
 const {error}=await C.db.from('jadem_deals').update({...values,updated_at:new Date().toISOString()}).eq('id',d.id).eq('owner_id',C.state.user.id);
 if(error)throw error;await C.load();
}
async function onSubmit(ev){
 if(!['deal-link-form','deal-activity-form','deal-task-form'].includes(ev.target.id))return;
 ev.preventDefault();if(saving||!deal())return;
 saving=true;const d=deal(),f=new FormData(ev.target);
 try{
  if(ev.target.id==='deal-link-form'){
   const id=String(f.get('lead_id')||'');
   if(id&&!list('leads').some(x=>x.id===id&&x.owner_id===d.owner_id&&(x.operation_id||null)===(d.operation_id||null)))throw Error('O lead selecionado pertence a outra operação.');
   await updateDeal(d,{lead_id:id||null});C.toast('Lead vinculado à oportunidade.');
  }else if(ev.target.id==='deal-activity-form'){
   const kind=String(f.get('kind')||'Nota'),detail=String(f.get('detail')||'').trim();
   if(!['Nota','Ligação','WhatsApp','E-mail','Reunião','Outro'].includes(kind)||!detail)throw Error('Selecione o tipo e descreva a atividade.');
   const {error}=await C.db.from('jadem_deal_history').insert({owner_id:d.owner_id,deal_id:d.id,actor_id:C.state.user.id,kind,detail});
   if(error)throw error;
   await C.load();C.toast('Atividade registrada.');
  }else{
   if(!d.company_id&&!d.person_id)throw Error('Vincule primeiro uma pessoa ou empresa à oportunidade.');
   const title=String(f.get('title')||'').trim(),due=String(f.get('due_at')||''),priority=String(f.get('priority')||'Normal');
   const parsed=new Date(due);
   if(title.length<2||!Number.isFinite(parsed.getTime()))throw Error('Informe uma tarefa e horário válidos.');
   if(!['Normal','Alta','Baixa'].includes(priority))throw Error('Prioridade inválida.');
   const payload={owner_id:d.owner_id,operation_id:d.operation_id||null,title,due_at:parsed.toISOString(),priority,done:false,
    company_id:d.company_id||null,person_id:d.person_id||null,notes:'Oportunidade: '+d.title};
   const {error}=await C.db.from('jadem_tasks').insert(payload);if(error)throw error;
   auditAttempt(d,'Tarefa','Criou tarefa: '+title+'. Prazo: '+tDate(parsed.toISOString()));
   await C.load();C.toast('Tarefa criada.');
  }
 }catch(err){C.toast(err.message||'Erro ao salvar.')}finally{saving=false;C.render()}
}
async function onClick(ev){
 const channel=ev.target.closest?.('[data-deal-track]');
 if(channel&&deal()){
  const which=channel.dataset.dealTrack;
  auditAttempt(deal(),'Canal externo',which==='WhatsApp'?'Abriu o WhatsApp do contato. Envio não confirmado.':'Acionou o discador do contato. Chamada não confirmada.');
  return;
 }

 const card=ev.target.closest('[data-deal-open]');
 if(card&&!ev.target.closest('button,select,a,input,textarea,label')){
  open(card.dataset.dealOpen);return;
 }
 if(ev.target.matches('[data-deal-backdrop]')){close();return;}
 const tabButton=ev.target.closest('[data-deal-tab]');
 if(tabButton){tab=tabButton.dataset.dealTab;C.render();return;}
 const btn=ev.target.closest('[data-deal-action]');
 if(!btn||!deal())return;
 const action=btn.dataset.dealAction,d=deal();
 if(action==='close')close();
 else if(action==='to-qualificacao'){tab='resumo';C.render();}
 else if(action==='to-fechamento'){tab='fechamento';C.render();}
 else if(action==='edit'){C.state.modal={kind:'deals',id:d.id};C.render();}
 else if(action==='open-lead'){
  if(!d.lead_id){C.toast('Associe um lead primeiro.');return}
  activeId=null;openLeadFromDeal(d.lead_id);
 }
 else if(action==='new-meeting'){
  const l=linked(d),p=person(d),co=company(d);
  const info={lead_id:l?.id||null,operation_id:d.operation_id||null,
   guest_name:l?.contact_name||p?.name||'',guest_email:l?.email||p?.email||'',
   guest_phone:l?.phone||p?.phone||'',guest_company:l?.company_name||co?.name||'',
   title:'Reunião comercial — '+d.title};
  activeId=null;openMeetingFromDeal(info);
 }
}
async function onChange(ev){
 if(!ev.target.matches('[data-deal-action-select="stage"]')||!deal())return;
 const before=deal().stage,next=ev.target.value;
 if(before===next)return;
 if(!stages.includes(next)){ev.target.value=before;return;}
 try{await updateDeal(deal(),{stage:next});C.toast('Etapa atualizada no funil.')}
 catch(err){ev.target.value=before;C.toast(err.message||'Não foi possível alterar a etapa.')}
}
function keyboard(ev){
 if(ev.key==='Escape'&&activeId&&!C.state.modal&&!ev.target.closest('form'))close();
 if((ev.key==='Enter'||ev.key===' ')&&ev.target.matches('[data-deal-open]')){
  ev.preventDefault();open(ev.target.dataset.dealOpen);
 }
}
export function setupDealDetails(ctx){
 C=ctx;document.addEventListener('click',onClick);
 document.addEventListener('submit',onSubmit);
 document.addEventListener('change',onChange);
 document.addEventListener('keydown',keyboard);
}
