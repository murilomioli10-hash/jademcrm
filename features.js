
import {teamButton} from './roles.js';
import {googleWidget,isGoogleConnected,syncGoogleMeeting,verifyGoogleAvailability,bookingPageUrl} from './google.js';
import {operationField} from './operations.js';
import {agendaBoard} from './agenda.js';
let C;
import * as Q from './qualificacao.js';
import * as IMP from './importacao.js';
let feature={panel:null,tab:'info',filter:'Todos',f:{},audioConsent:false,recorder:null,recorderStream:null,recChunks:[],importBusy:false,imp:null};
const statuses=Q.ETAPAS;
const co=(key)=>C.state.data[key]||[];
const e=x=>C.esc(x);
const button=(name,label,klass='outline')=>'<button class="btn '+klass+' sm" data-fx="'+name+'">'+label+'</button>';
const bare=(val)=>String(val==null?'':val).trim();
const dateTime=(d)=>C.fmt(d,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
// regras comerciais da operação do lead (ICP, pesos do score) — ver qualificacao.js
const opsAll=()=>(C.state.rawData||C.state.data).clientOperations||[];
const opDe=l=>opsAll().find(o=>o.id===l.operation_id)||null;
const cfgDe=l=>Q.configDa(opDe(l));
const calc=l=>Q.camposCalculados(l,cfgDe(l));
const scoreCalc=l=>calc(l).score;
const NI='Não informado',NID='Não identificado';
const fechado=l=>Q.ETAPAS_FECHADAS.includes(Q.etapaAtual(l.status));
const diasSem=l=>Math.floor((Date.now()-Date.parse(l.last_interaction_at||l.created_at||Date.now()))/864e5);
const parado=l=>!fechado(l)&&diasSem(l)>=cfgDe(l).dias_parado;
// próxima atividade: tarefa aberta, retorno marcado ou reunião futura (a mais próxima)
function proxima(l){
 const agora=Date.now(),itens=[];
 co('tasks').filter(t=>t.lead_id===l.id&&!t.done).forEach(t=>itens.push({quando:t.due_at,texto:'Tarefa: '+t.title}));
 if(l.next_call_at)itens.push({quando:l.next_call_at,texto:'Retorno: '+(l.next_call_action||'ligar de novo')});
 co('meetings').filter(m=>m.lead_id===l.id&&m.status==='Agendada'&&Date.parse(m.scheduled_at)>=agora).forEach(m=>itens.push({quando:m.scheduled_at,texto:'Reunião: '+m.title}));
 itens.sort((a,b)=>Date.parse(a.quando||'2999-01-01')-Date.parse(b.quando||'2999-01-01'));
 const p=itens[0];return p?{...p,vencida:!!p.quando&&Date.parse(p.quando)<agora}:null;
}
const vencidas=l=>co('tasks').some(t=>t.lead_id===l.id&&!t.done&&t.due_at&&Date.parse(t.due_at)<Date.now())||(l.next_call_at&&Date.parse(l.next_call_at)<Date.now());
function responsaveis(l){
 const nome=m=>co('roster').find(r=>String(r.member_email||'').toLowerCase()===String(m||'').toLowerCase())?.display_name||m;
 return co('assignments').filter(a=>a.lead_id===l.id).map(a=>(a.role==='SDR'?'SDR':'Closer')+': '+nome(a.assigned_email));
}
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
// filtros da lista: [chave, rótulo, valor do lead]
const FILTROS=[['etapa','Etapa',l=>Q.etapaAtual(l.status)],['icp','ICP',l=>l.icp_class?'ICP '+l.icp_class:'Não classificado'],
 ['uf','UF',l=>bare(l.state).toUpperCase()],['cidade','Cidade',l=>bare(l.city)],['cnae','CNAE',l=>l.cnae?IMP.formatarCNAE(l.cnae):''],
 ['esp','Especialidade',l=>bare(l.specialty)],['resp','Responsável',l=>responsaveis(l).join(' · ')||'Sem responsável']];
const SITUACOES={'Atividades vencidas':vencidas,'Sem movimentação':parado,'Com pendência de enriquecimento':l=>Q.pendencias(l).length>0,
 'Quente (80–100)':l=>Number(l.score)>=80,'Morno (50–79)':l=>Number(l.score)>=50&&Number(l.score)<80,'Frio (0–49)':l=>Number(l.score)<50};
export function leadsView(){
 const q=bare(C.state.search).toLowerCase(),f=feature.f;
 const leads=co('leads');
 let list=leads.filter(l=>!q||[l.company_name,l.trade_name,l.cnpj,l.contact_name,l.email,l.phone,l.segment,l.specialty,l.city,l.origin].some(x=>bare(x).toLowerCase().includes(q.replace(/[.\/-]/g,''))||bare(x).toLowerCase().includes(q)));
 for(const [k,,fn] of FILTROS)if(f[k])list=list.filter(l=>fn(l)===f[k]);
 if(f.sit&&SITUACOES[f.sit])list=list.filter(SITUACOES[f.sit]);
 list.sort((a,b)=>Number(b.score)-Number(a.score)||new Date(b.created_at)-new Date(a.created_at));
 const opcoes=fn=>[...new Set(leads.map(fn).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const filtro=(k,rot,fn)=>'<label class="lf"><span>'+e(rot)+'</span><select data-lf="'+k+'"><option value="">Todos</option>'+(k==='etapa'?statuses:opcoes(fn)).map(x=>'<option '+(f[k]===x?'selected':'')+'>'+e(x)+'</option>').join('')+'</select></label>';
 const isOwnerAll=leads.some(l=>l.owner_id===C.state.user.id);
 const btns='<div class="stacked">'+button('download-template',C.ic('download')+' Modelo Excel')+button('export-xlsx',C.ic('download')+' Exportar Excel')+button('import-xlsx',C.ic('plus')+' Importar Excel / CSV','dark')+(isOwnerAll?button('recalc',C.ic('activity')+' Recalcular ICP e score'):'')+button('lead-new',C.ic('plus')+' Novo lead','primary')+'</div>';
 return C.title('Lista de leads','Dados da empresa, contatos, etapa, ICP e próxima atividade de cada lead.',btns)
 +'<div class="leadmetrics">'+[
 ['Total de leads',leads.length],['ICP A',leads.filter(l=>l.icp_class==='A').length],['Atividades vencidas',leads.filter(vencidas).length],['Sem movimentação',leads.filter(parado).length]
 ].map(a=>'<div class="card leadmetric"><small>'+e(a[0])+'</small><strong>'+e(a[1])+'</strong></div>').join('')+'</div>'
 +'<div class="card"><div class="leadtools lf-grid">'+FILTROS.map(([k,r,fn])=>filtro(k,r,fn)).join('')
 +'<label class="lf"><span>Situação</span><select data-lf="sit"><option value="">Todas</option>'+Object.keys(SITUACOES).map(x=>'<option '+(f.sit===x?'selected':'')+'>'+e(x)+'</option>').join('')+'</select></label>'
 +(Object.values(f).some(Boolean)?button('filter-clear','Limpar filtros'):'')+'<span class="muted">'+list.length+' resultado(s) • ordenados por score</span></div>'
 +(list.length?'<div class="tablewrap"><table class="datatable leadtable"><thead><tr><th>Empresa / contato</th><th>ICP</th><th>Score</th><th>Etapa</th><th>Telefone</th><th>Cidade / UF</th><th>Próxima atividade</th></tr></thead><tbody>'+
 list.slice(0,1000).map(l=>{const p=proxima(l);return '<tr class="clickable-row" data-lead-open="'+e(l.id)+'"><td><div class="namecell"><span class="letter">'+e(l.company_name.slice(0,1).toUpperCase())+'</span><div>'+e(l.company_name)+'<span class="secondtext">'+e(l.contact_name||l.decisor_name||'Contato não identificado')+'</span></div></div></td>'
 +'<td>'+(l.icp_class?C.badge('ICP '+l.icp_class):'<span class="muted">—</span>')+'</td><td>'+scoreHtml(l.score)+'</td><td>'+C.badge(Q.etapaAtual(l.status))+'</td>'
 +'<td>'+e(l.phone||'—')+(l.phone_status==='Validado'?' <span class="tag green">validado</span>':l.phone_status==='Inválido'?' <span class="tag red">inválido</span>':'')+'</td>'
 +'<td>'+e([l.city,l.state].filter(Boolean).join(' / ')||'—')+'</td>'
 +'<td>'+(p?'<span class="'+(p.vencida?'tag red':'')+'">'+e(p.texto.slice(0,40))+'</span><span class="secondtext">'+(p.quando?C.fmt(p.quando):'sem prazo')+'</span>':parado(l)?'<span class="tag amber">parado há '+diasSem(l)+' dias</span>':'<span class="muted">—</span>')+'</td></tr>'}).join('')
 +'</tbody></table></div>'+(list.length>1000?'<p class="note">Mostrando 1.000 de '+list.length+'. Use os filtros para achar o resto.</p>':''):'<div class="feature-empty">Nenhum lead encontrado. Cadastre um novo lead ou importe sua planilha Excel ou CSV.</div>')
 +'<input id="leadExcelInput" type="file" accept=".xlsx,.xls,.csv" hidden></div>'
 +'<p class="note" style="margin-top:12px">Score comercial = aderência ao ICP + engajamento, com os pesos definidos na operação. É uma regra de priorização, não probabilidade estatística de venda. A completude cadastral é mostrada à parte e não reduz o score.</p>';
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
 if(p.type==='import')return importOverlay();
 if(p.type==='detail')return leadDetail(p);
 if(p.type==='meeting')return meetingForm(p);
 return '';
}
function fieldValue(name,x){return C.inp(name,x[0],x[1],x[2]||'text',!!x[3],!!x[4])}
function leadForm(p){
 const l=(p.id&&co('leads').find(x=>x.id===p.id))||{};
 if(p.id&&l.owner_id&&l.owner_id!==C.state.user.id)return '<div class="featureoverlay"><div class="featuremodal"><div class="featurebody">Você tem acesso somente de leitura a este lead. '+button('close','Fechar')+'</div></div></div>';
 const titulo=t=>'<div class="field wide"><div class="eyebrow" style="margin:10px 0 0">'+e(t)+'</div></div>';
 const op=opDe(l.id?l:{operation_id:C.state.activeOperation});
 const sugestao=l.id?Q.sugerirICP(l,cfgDe(l)):null;
 const linhas=a=>(a||[]).map(x=>typeof x==='string'?x:x.numero).join('\n');
 const fields=[
 titulo('Dados da empresa'),
 C.inp('company_name','Razão social',l.company_name,'text',true,true),
 C.inp('trade_name','Nome fantasia',l.trade_name),
 C.inp('cnpj','CNPJ',l.cnpj?IMP.formatarCNPJ(l.cnpj):''),
 C.inp('cnae','CNAE principal (código)',l.cnae?IMP.formatarCNAE(l.cnae):''),
 C.inp('cnae_description','CNAE (descrição)',l.cnae_description,'text',true),
 C.inp('segment','Segmento',l.segment),
 C.inp('specialty','Especialidade',l.specialty),
 C.inp('legal_nature','Natureza jurídica',l.legal_nature),
 C.inp('city','Cidade',l.city),
 C.inp('state','Estado (UF)',l.state),
 C.inp('address','Endereço',l.address,'text',true),
 C.inp('website','Site',l.website),
 C.inp('origin','Origem do lead',l.origin),
 operationField(l.id?l.operation_id:undefined),
 titulo('Dados de contato'),
 C.inp('contact_name','Nome do contato',l.contact_name),
 C.inp('position','Cargo',l.position),
 C.inp('phone','Telefone principal',l.phone,'tel'),
 C.sel('phone_status','Situação do telefone',Q.TEL_STATUS.map(x=>[x,x]),l.phone_status||'Não informado'),
 C.area('extra_phones','Telefones adicionais (um por linha)',linhas(l.extra_phones)),
 C.inp('whatsapp','WhatsApp',l.whatsapp,'tel'),
 C.sel('whatsapp_status','WhatsApp confirmado?',Q.ZAP_STATUS.map(x=>[x,x]),l.whatsapp_status||'Não confirmado'),
 C.inp('email','E-mail principal',l.email,'email'),
 C.area('extra_emails','E-mails adicionais (um por linha)',linhas(l.extra_emails)),
 C.sel('decisor_status','Decisor',Q.DECISOR.map(x=>[x,x]),l.decisor_status||'Não identificado'),
 C.inp('decisor_name','Nome do decisor',l.decisor_name),
 C.inp('decisor_position','Cargo do decisor',l.decisor_position),
 C.sel('decisor_channel','Canal com o decisor',['Telefone','WhatsApp','E-mail','Presencial','LinkedIn','Indicação','Outro'].map(x=>[x,x]),l.decisor_channel||''),
 titulo('Dados comerciais'),
 C.sel('status','Etapa do funil',statuses.map(x=>[x,x]),Q.etapaAtual(l.status||'Novo lead')),
 C.inp('stage_note','Atividade desta mudança de etapa','','text',true),
 C.inp('closing_condition','Condição de fechamento'+(op?.closing_requirement?' (exigida: '+op.closing_requirement+')':'')+' — obrigatória para Fechado — ganho',l.closing_condition,'text',true),
 C.sel('interest','Interesse demonstrado',Q.INTERESSES.map(x=>[x,x]),l.interest||'Não avaliado'),
 C.sel('icp_class','Classificação ICP',[['','Automática (regra da operação)'],['A','A — revisado pelo gestor'],['B','B — revisado pelo gestor'],['C','C — revisado pelo gestor']],l.icp_source==='Revisado'?l.icp_class:''),
 C.inp('estimated_value','Valor potencial (R$)',l.estimated_value||'0','number'),
 '<div class="field wide"><p class="note" style="margin:0">'+(sugestao?'Sugestão automática: '+(sugestao.classe?'ICP '+sugestao.classe+' — ':'')+e(sugestao.motivo):'O ICP é sugerido pela regra da operação ao salvar.')+' Escolher A, B ou C marca a classificação como revisada pelo gestor.</p></div>',
 C.area('notes','Observações',l.notes)
 ].join('');
 return '<div class="featureoverlay" data-feature-overlay><div class="featuremodal"><div class="featureheader"><h2>'+(p.id?'Editar lead':'Cadastrar novo lead')+'</h2>'+button('close','Fechar')+'</div><div class="featurebody"><div class="notice">Interesse só muda depois de uma interação ou avaliação sua. ICP e score seguem a regra da operação e mostram a justificativa na ficha.</div><form class="featureform" id="leadRecordForm"><div class="formgrid">'+fields+'</div><div class="formfooter">'+button('close','Cancelar')+'<button class="btn primary" type="submit">Salvar lead</button></div></form></div></div></div>';
}
function detailCell(label,val){return '<div><div class="detaillabel">'+e(label)+'</div><div class="detailvalue">'+e(val||'—')+'</div></div>'}
// célula com valor já escapado; vazio vira "Não informado" / "Não identificado"
const cel=(rot,html,vazio=NI)=>'<div><div class="detaillabel">'+e(rot)+'</div><div class="detailvalue">'+(html&&String(html).trim()?html:'<span class="muted">'+vazio+'</span>')+'</div></div>';
const chip=(t,cor)=>'<span class="tag '+(cor||'')+'">'+e(t)+'</span>';
const corTel={Validado:'green',Encontrado:'blue',Inválido:'red'};
function telefoneLinha(num,rotulo,status){
 const n=IMP.normalizarTelefone(num),ok=n&&n.valido;
 return '<div class="fone-linha"><div><strong>'+e(num)+'</strong>'+(rotulo?' <small class="muted">'+e(rotulo)+'</small>':'')+(status?' '+chip(status,corTel[status]||(status==='Confirmado'?'green':'')):'')+'</div>'
 +'<div class="fone-acoes"><button type="button" class="btn outline sm" data-fx="copy:'+e(num)+'">Copiar</button>'
 +(ok?'<a class="btn outline sm" data-lead-channel="discador" href="tel:+55'+n.digitos+'">Ligar</a><a class="btn outline sm" data-lead-channel="whatsapp" target="_blank" rel="noopener noreferrer" href="https://wa.me/55'+n.digitos+'">WhatsApp</a>':'<span class="muted">fora do padrão: confira o número</span>')+'</div></div>';
}
function infoTab(l,isOwner){
 const cfg=cfgDe(l),av=Q.avaliar(l,cfg),op=opDe(l),pend=Q.pendencias(l),p=proxima(l);
 const outras=l.cnpj?[...new Set(((C.state.rawData||C.state.data).leads||[]).filter(x=>x.cnpj===l.cnpj&&x.id!==l.id&&x.operation_id!==l.operation_id).map(x=>opsAll().find(o=>o.id===x.operation_id)?.name||'Sem operação'))]:[];
 const fones=(l.phone?telefoneLinha(l.phone,'principal',l.phone_status):'')+(l.extra_phones||[]).map(t=>telefoneLinha(t.numero||t,t.rotulo||'adicional')).join('');
 const emails=[l.email,...(l.extra_emails||[])].filter(Boolean).map((m,i)=>'<div>'+e(m)+(i===0?' <small class="muted">principal</small>':'')+(Q.emailDeContabilidade(m)?' '+chip('possível e-mail de contabilidade','amber'):'')+'</div>').join('');
 const secao=(t,html)=>'<div class="card info-secao"><div class="sectionhead"><h2>'+e(t)+'</h2></div><div class="detailgrid info-grid">'+html+'</div></div>';
 return (pend.length?'<div class="notice"><strong>Pendências de enriquecimento:</strong> '+pend.map(x=>e(x)).join(' · ')+'</div>':'')
 +(outras.length?'<div class="notice">Este CNPJ também está cadastrado em: <strong>'+outras.map(e).join(', ')+'</strong>. Os registros de clientes diferentes ficam separados.</div>':'')
 +secao('Dados da empresa',[
  cel('Razão social',e(l.company_name)),cel('Nome fantasia',e(l.trade_name)),cel('CNPJ',l.cnpj?e(IMP.formatarCNPJ(l.cnpj)):''),
  cel('CNAE principal',l.cnae?e(IMP.formatarCNAE(l.cnae))+(l.cnae_description?' — '+e(l.cnae_description):''):''),
  cel('Segmento',e(l.segment)),cel('Especialidade',e(l.specialty),av.icp?.a?.esp?'Sugerida pelo nome: '+e(av.icp.a.esp.valor):NID),
  cel('Cidade',e(l.city)),cel('Estado',e(l.state)),cel('Endereço',e(l.address)),
  cel('Site',/^https?:\/\//i.test(l.website||'')?'<a href="'+e(l.website)+'" target="_blank" rel="noopener noreferrer">'+e(l.website)+'</a>':e(l.website)),
  cel('Origem do lead',e(l.origin)),cel('Operação comercial',e(op?.name),'Sem operação')].join(''))
 +secao('Dados de contato',[
  cel('Nome do contato',e(l.contact_name),NID),cel('Cargo',e(l.position)),
  '<div class="info-wide">'+cel('Telefones',fones)+'</div>',
  cel('WhatsApp',l.whatsapp?telefoneLinha(l.whatsapp,'',l.whatsapp_status||'Não confirmado'):''),
  cel('E-mail',emails),
  cel('Decisor',chip(l.decisor_status||NID,l.decisor_status==='Autoridade confirmada'?'green':l.decisor_status==='Não identificado'||!l.decisor_status?'':'blue')
   +(l.decisor_name?'<div>'+e(l.decisor_name)+(l.decisor_position?' · '+e(l.decisor_position):'')+'</div>':'')+(l.decisor_channel?'<small class="muted">Canal: '+e(l.decisor_channel)+'</small>':''))].join(''))
 +secao('Dados comerciais',[
  cel('Etapa do funil',chip(Q.etapaAtual(l.status),'mint')+(l.stage_changed_at?'<small class="muted"> desde '+e(C.fmt(l.stage_changed_at))+'</small>':'')),
  cel('Status',fechado(l)?e(Q.etapaAtual(l.status)):parado(l)?chip('Sem movimentação há '+diasSem(l)+' dias','amber'):vencidas(l)?chip('Atividade vencida','red'):'Em andamento'),
  cel('Classificação ICP',l.icp_class?chip('ICP '+l.icp_class,l.icp_class==='A'?'green':l.icp_class==='B'?'blue':'')+' <small class="muted">'+e(l.icp_source||'')+(l.icp_reviewed_by?' por '+e(l.icp_reviewed_by):'')+'</small><div class="note">'+e(l.icp_reason||'')+'</div>':'','Não classificado'),
  cel('Score comercial',scoreHtml(l.score)+'<small class="muted">Aderência '+(av.aderencia??'—')+'% · Engajamento '+(av.engajamento===null?'não avaliado':av.engajamento+'%')+' · Completude '+av.completude+'%</small>'),
  cel('Interesse demonstrado',chip(l.interest||'Não avaliado',l.interest==='Alto'?'green':l.interest==='Sem interesse'?'red':'')),
  cel('Valor potencial',Number(l.estimated_value)>0?e(C.money(l.estimated_value)):''),
  cel('Responsável comercial',responsaveis(l).map(e).join('<br>'),'Sem responsável definido'),
  cel('Última interação',l.last_interaction_at?e(dateTime(l.last_interaction_at)):'','Nenhuma interação registrada'),
  cel('Próxima atividade',p?(p.vencida?chip('Vencida','red')+' ':'')+e(p.texto)+'<small class="muted"> '+(p.quando?e(dateTime(p.quando)):'sem prazo')+'</small>':'','Nenhuma atividade marcada'),
  l.closing_condition?cel('Condição de fechamento',e(l.closing_condition)):'',
  '<div class="info-wide">'+cel('Observações','<span style="white-space:pre-line;font-weight:500">'+e(l.notes||'')+'</span>','Nenhuma observação')+'</div>',
  '<div class="info-wide"><details><summary class="muted" style="cursor:pointer">Por que este score e este ICP?</summary><p class="note" style="white-space:pre-line">'+e(av.justificativa)+'</p></details></div>'].join(''))
 +'<div class="stacked" style="margin-top:20px">'+teamButton(l)+(isOwner?button('edit-lead:'+l.id,C.ic('edit')+' Editar lead','dark'):'')+'</div>';
}
function leadDetail(p){
 const l=co('leads').find(x=>x.id===p.id);if(!l)return '';
 const isOwner=l.owner_id===C.state.user.id;
 let tabs=[['history','Atividades'],['info','Informações'],['calls','Ligações'],['tasks','Tarefas'],['meet','Reuniões'],['closing','Fechamento']];
 if(isOwner)tabs.push(['audio','Gravações'],['sharing','Compartilhar']);
 let content='';
 if(feature.tab==='info'){
 content=infoTab(l,isOwner);
 }else if(feature.tab==='history'){
 const events=[...co('leadEvents').filter(a=>a.lead_id===l.id).map(a=>({...a,kind:a.action,when:a.created_at})),
  ...co('stageHistory').filter(h=>h.lead_id===l.id).map(h=>({id:'etapa-'+h.id,kind:h.from_status?'Etapa: '+h.from_status+' → '+h.to_status:'Etapa inicial: '+h.to_status,detail:h.activity||'',when:h.created_at,actor_id:h.actor_id,actor_email:h.actor_email}))];
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
 const leadId=feature.panel?.id||null;
 const original=leadId?co('leads').find(x=>x.id===leadId):null;
 if(original&&original.owner_id!==C.state.user.id)throw Error('Lead compartilhado: acesso somente para leitura.');
 if(!v.company_name||v.company_name.length<2)throw Error('Informe a razão social (ou o nome da empresa).');
 v.estimated_value=Math.max(0,Number(v.estimated_value)||0);
 // CNPJ e CNAE
 if(v.cnpj){const c=IMP.normalizarCNPJ(v.cnpj);if(!c.cnpj)throw Error(c.aviso||'CNPJ inválido.');v.cnpj=c.cnpj}else v.cnpj=null;
 if(v.cnae){const d=v.cnae.replace(/\D/g,'');if(d.length!==7)throw Error('CNAE deve ter 7 dígitos (ex.: 8630-5/03).');v.cnae=d}else v.cnae=null;
 if(v.state&&/^[a-z]{2}$/i.test(v.state))v.state=v.state.toUpperCase();
 // telefones: só números válidos; nada inventado
 // número que já estava gravado e não mudou passa como está (não trava a edição de leads antigos)
 const jaTinha=new Set([original?.phone,original?.whatsapp,...(original?.extra_phones||[]).map(t=>t.numero||t)].filter(Boolean));
 const tel=(x,rot)=>{if(!x)return '';if(jaTinha.has(x))return x;const n=IMP.normalizarTelefone(x);if(!n||!n.valido)throw Error(rot+' inválido ('+(n?.motivo||'sem dígitos')+'): '+x);return n.formatado};
 v.phone=tel(v.phone,'Telefone principal');
 v.whatsapp=tel(v.whatsapp,'WhatsApp')||null;
 v.extra_phones=v.extra_phones.split(/\n/).map(x=>x.trim()).filter(Boolean).map(x=>{const antigo=(original?.extra_phones||[]).find(t=>IMP.digitosTelefone(t.numero||t)===IMP.digitosTelefone(x));return antigo&&typeof antigo==='object'?{...antigo,numero:tel(x,'Telefone adicional')}:{numero:tel(x,'Telefone adicional'),rotulo:'adicional'}});
 if(!v.phone)v.phone_status='Não informado';else if(v.phone_status==='Não informado')v.phone_status='Encontrado';
 // e-mails
 if(v.email&&!IMP.emailValido(v.email))throw Error('E-mail principal inválido.');
 v.email=v.email?v.email.toLowerCase():'';
 const extras=IMP.normalizarEmails(v.extra_emails.replace(/\n/g,' '));
 if(extras.invalidos.length)throw Error('E-mail adicional inválido: '+extras.invalidos.join(', '));
 v.extra_emails=extras.validos.filter(x=>x!==v.email);
 // etapa e fechamento
 if(v.status===Q.GANHO&&!v.closing_condition)throw Error('Para marcar como Fechado — ganho, registre a condição de fechamento'+(opDe(v)?.closing_requirement?' exigida: '+opDe(v).closing_requirement:'')+'.');
 if(!v.stage_note||String(original?.status)===v.status)delete v.stage_note;
 v.decisor_channel=v.decisor_channel||null;
 v.is_decision_maker=['Contato estabelecido','Autoridade confirmada'].includes(v.decisor_status);
 // ICP: vazio = regra automática; A/B/C escolhido = revisão do gestor
 if(v.icp_class){
  const mudou=original?.icp_class!==v.icp_class||original?.icp_source!=='Revisado';
  v.icp_source='Revisado';
  if(mudou){v.icp_reviewed_by=C.state.user.email;v.icp_reviewed_at=new Date().toISOString();v.icp_reason='Revisado pelo gestor ('+C.state.user.email+'). Sugestão da regra: '+(Q.sugerirICP({...original,...v},cfgDe(v)).motivo||'—')}
 }else{delete v.icp_class;v.icp_source=null}
 v.operation_id=v.operation_id||null;
 Object.assign(v,calc({...(original||{}),...v}));
 const q=leadId?C.db.from('jadem_leads').update({...v,updated_at:new Date().toISOString()}).eq('id',leadId).select('id').single():C.db.from('jadem_leads').insert(v).select('id').single();
 const {data,error}=await q;if(error)throw error;
 const changed=original?Object.entries({company_name:'razão social',trade_name:'nome fantasia',cnpj:'CNPJ',cnae:'CNAE',contact_name:'contato',phone:'telefone',phone_status:'situação do telefone',whatsapp:'WhatsApp',whatsapp_status:'WhatsApp confirmado',email:'e-mail',status:'etapa comercial',icp_class:'ICP',interest:'interesse',decisor_status:'decisor',notes:'observações',estimated_value:'valor potencial',specialty:'especialidade'}).filter(([k])=>String(original[k]??'')!==String(v[k]??'')).map(([k,label])=>['status','icp_class','interest','decisor_status','phone_status','whatsapp_status'].includes(k)?label+': '+String(original[k]||'—')+' → '+String(v[k]||'—'):label+' atualizado'):[];
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
const excelHeaders=['Razão social','Nome fantasia','CNPJ','CNAE','Descrição CNAE','Segmento','Especialidade','Cidade','UF','Endereço','Site','Origem','Contato','Cargo','Telefone','Telefone 2','WhatsApp','E-mail','E-mail 2','Etapa','Observações'];
const exportHeaders=[...excelHeaders,'Situação do telefone','WhatsApp confirmado','Decisor','Nome do decisor','Interesse','ICP','Score','Aderência ICP (%)','Engajamento (%)','Completude (%)','Valor potencial','Última interação'];
function excelValue(s){let v=bare(s);return /^[=+\-@\t\r]/.test(v)?"'"+v:v}
function rowForExport(l){const x=excelValue;return {
 'Razão social':x(l.company_name),'Nome fantasia':x(l.trade_name),'CNPJ':l.cnpj?IMP.formatarCNPJ(l.cnpj):'','CNAE':l.cnae?IMP.formatarCNAE(l.cnae):'',
 'Descrição CNAE':x(l.cnae_description),'Segmento':x(l.segment),'Especialidade':x(l.specialty),'Cidade':x(l.city),'UF':x(l.state),'Endereço':x(l.address),
 'Site':x(l.website),'Origem':x(l.origin),'Contato':x(l.contact_name),'Cargo':x(l.position),'Telefone':x(l.phone),
 'Telefone 2':x((l.extra_phones||[]).map(t=>t.numero||t).join(' / ')),'WhatsApp':x(l.whatsapp),'E-mail':x(l.email),'E-mail 2':x((l.extra_emails||[]).join('; ')),
 'Etapa':Q.etapaAtual(l.status),'Observações':x(l.notes),'Situação do telefone':l.phone_status||'','WhatsApp confirmado':l.whatsapp_status||'',
 'Decisor':l.decisor_status||'','Nome do decisor':x(l.decisor_name),'Interesse':l.interest||'','ICP':l.icp_class||'','Score':Number(l.score||0),
 'Aderência ICP (%)':l.score_icp??'','Engajamento (%)':l.score_engagement??'','Completude (%)':l.completeness??'','Valor potencial':Number(l.estimated_value||0),
 'Última interação':l.last_interaction_at?new Date(l.last_interaction_at).toLocaleString('pt-BR'):''
}}
async function exportXlsx(template=false){
 const XLSX=await loadXlsx();
 const rows=template?[Object.fromEntries(excelHeaders.map(h=>[h,'']))]:co('leads').map(rowForExport);
 const cols=template?excelHeaders:exportHeaders;
 const ws=XLSX.utils.json_to_sheet(rows,{header:cols});
 // CNPJ e telefones como texto: o Excel não come zeros à esquerda
 const range=XLSX.utils.decode_range(ws['!ref']);
 for(let c=range.s.c;c<=range.e.c;c++){const h=cols[c];if(['CNPJ','CNAE','Telefone','Telefone 2','WhatsApp'].includes(h))for(let r=1;r<=range.e.r;r++){const cell=ws[XLSX.utils.encode_cell({r,c})];if(cell){cell.t='s';cell.z='@'}}}
 ws['!cols']=cols.map(h=>({wch:['Razão social','Observações','Endereço','Descrição CNAE'].includes(h)?32:18}));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Leads');
 XLSX.writeFile(wb,template?'jadem-modelo-importacao.xlsx':'jadem-leads-'+new Date().toISOString().slice(0,10)+'.xlsx');
}

/* ---------------- importação: arquivo -> mapeamento -> gravação -> relatório ---------------- */
const opValida=id=>!!id&&opsAll().some(o=>o.id===id);
async function importXlsx(file){
 if(feature.importBusy||!file)return;
 if(file.size>10*1024*1024)throw Error('Arquivo acima de 10 MB.');
 const XLSX=await loadXlsx();
 const {cabecalhos,linhas}=IMP.lerPlanilha(XLSX,await file.arrayBuffer(),file.name);
 if(!linhas.length)throw Error('A planilha não tem linhas preenchidas.');
 if(linhas.length>5000)throw Error('Limite de 5.000 linhas por importação. Divida o arquivo.');
 const ativa=C.state.activeOperation;
 feature.imp={nome:file.name,cabecalhos,linhas,mapa:IMP.autoMapear(cabecalhos),op:opValida(ativa)?ativa:'',fase:'mapear'};
 feature.panel={type:'import'};C.render();
}
function planoAtual(){
 const im=feature.imp;
 return IMP.planejarImportacao(im.linhas,im.mapa,{existentes:(C.state.rawData||C.state.data).leads||[],operacaoId:im.op||null,
  nomeOperacao:id=>opsAll().find(o=>o.id===id)?.name||'Sem operação',origem:'Importação '+im.nome,corrigir:!!im.corrigir});
}
function importOverlay(){
 const im=feature.imp;if(!im)return '';
 const head=t=>'<div class="featureoverlay"><div class="featuremodal wide"><div class="featureheader"><h2>'+e(t)+'</h2>'+(im.fase==='executando'?'':button('import-cancel','Fechar'))+'</div><div class="featurebody">';
 if(im.fase==='executando')return head('Importando '+im.nome)+'<p>Gravando no JADEM… '+e(im.progresso||'')+'</p><p class="note">Não feche esta janela.</p></div></div></div>';
 if(im.fase==='relatorio'){
  const r=IMP.resumo(im.relatorio);
  return head('Relatório da importação')+'<div class="grid4" style="margin-bottom:14px">'+[['Importados',r.importado,'green'],['Atualizados',r.atualizado,'blue'],['Ignorados',r.ignorado,'amber'],['Rejeitados',r.rejeitado,'red']].map(([t,n,c])=>'<div class="card kpi" style="min-height:0"><div class="metric-label">'+t+'</div><div class="metric-value">'+n+'</div></div>').join('')+'</div>'
  +'<p class="note">'+e(im.nome)+' · operação '+e(opsAll().find(o=>o.id===im.op)?.name||'Sem operação')+'. Conferido no banco depois da gravação: '+e(im.conferido||'—')+'</p>'
  +'<div class="stacked" style="margin:10px 0">'+button('import-report',C.ic('download')+' Baixar relatório (Excel/CSV)','primary')+'</div>'
  +'<div class="tablewrap" style="max-height:50vh"><table class="datatable"><thead><tr><th>Linha</th><th>Empresa</th><th>CNPJ</th><th>Resultado</th><th>Motivo</th></tr></thead><tbody>'
  +im.relatorio.slice(0,800).map(x=>'<tr><td>'+x.linha+'</td><td>'+e(x.empresa)+'</td><td>'+e(IMP.formatarCNPJ(x.cnpj))+'</td><td>'+chip(x.resultado,{importado:'green',atualizado:'blue',ignorado:'amber',rejeitado:'red'}[x.resultado])+'</td><td>'+e(x.motivo||'')+'</td></tr>').join('')
  +'</tbody></table></div></div></div></div>';
 }
 const temOps=opsAll().length>0;
 let plano=null,erroPlano='';
 try{plano=planoAtual()}catch(err){erroPlano=err.message}
 const r=plano?IMP.resumo(plano.relatorio):null;
 const exemplo=h=>im.linhas.map(x=>IMP.valorCelula(x[h])).filter(Boolean).slice(0,2).join(' · ');
 const opcoesCampo=v=>'<option value="">— ignorar coluna —</option>'+IMP.CAMPOS.map(([c,rot])=>'<option value="'+c+'" '+(v===c?'selected':'')+'>'+e(rot)+'</option>').join('');
 const semEmpresa=!Object.values(im.mapa).some(c=>c==='company_name'||c==='trade_name');
 return head('Importar '+im.nome)
 +'<div class="notice">'+im.linhas.length+' linha(s) e '+im.cabecalhos.length+' coluna(s). Cada lead novo também entra no Funil de vendas, na coluna Novo. Confira para onde vai cada coluna; colunas ignoradas não são gravadas. Nada que já existe é apagado: leads repetidos só recebem os dados que faltam.</div>'
 +'<div class="formgrid" style="margin-bottom:14px"><div class="field wide"><label>Operação comercial (cliente) *</label><select data-imp-op>'+(temOps?'<option value="">Selecione…</option>':'<option value="">Sem operação</option>')+opsAll().map(o=>'<option value="'+e(o.id)+'" '+(im.op===o.id?'selected':'')+'>'+e(o.name)+'</option>').join('')+'</select></div>'
 +'<div class="field wide"><label class="squared-input"><input type="checkbox" data-imp-corrigir '+(im.corrigir?'checked':'')+'> Corrigir dados de leads já cadastrados: troca razão social, nome fantasia, CNAE, cidade/UF, endereço, site e decisor pelos da planilha e separa contatos que vieram juntos ("Ana;Paulo"). Nunca troca por vazio; etapa, interesse, ligações e anotações ficam como estão.</label></div></div>'
 +'<div class="tablewrap" style="max-height:42vh"><table class="datatable"><thead><tr><th>Coluna da planilha</th><th>Exemplo</th><th>Vai para</th></tr></thead><tbody>'
 +im.cabecalhos.map((h,i)=>'<tr><td><strong>'+e(h)+'</strong></td><td class="muted">'+e(exemplo(h).slice(0,70))+'</td><td><select data-imp-map="'+i+'">'+opcoesCampo(im.mapa[h])+'</select></td></tr>').join('')+'</tbody></table></div>'
 +(semEmpresa?'<div class="notice" style="margin-top:12px">Escolha a coluna da razão social ou do nome fantasia: sem ela, nenhuma linha entra.</div>':'')
 +(erroPlano?'<div class="notice">'+e(erroPlano)+'</div>':'')
 +(r?'<p style="margin-top:12px"><strong>Prévia:</strong> '+r.importado+' novo(s) · '+r.atualizado+' completado(s) · '+r.ignorado+' ignorado(s) · '+r.rejeitado+' rejeitado(s)</p>':'')
 +'<div class="formfooter">'+button('import-cancel','Cancelar')+'<button class="btn primary" data-fx="import-run" '+((temOps&&!im.op)||semEmpresa||!r||(!r.importado&&!r.atualizado)?'disabled':'')+'>Importar</button></div></div></div></div>';
}
async function importRun(){
 const im=feature.imp;if(!im||feature.importBusy)return;
 if(opsAll().length&&!opValida(im.op))throw Error('Escolha a operação comercial.');
 const plano=planoAtual();
 const rel=plano.relatorio,byLinha=new Map(rel.map(x=>[x.linha,x]));
 const op=im.op||null,cfgOp=Q.configDa(opsAll().find(o=>o.id===op));
 feature.importBusy=true;im.fase='executando';C.render();
 let novos=0,atual=0,negocios=0,avisoNegocio='';const eventos=[];
 const prepara=it=>{
  const l={...it.lead,operation_id:op,interest:'Não avaliado',stage_note:'Importação: '+im.nome};
  if(l.status===Q.GANHO){l.status='Negociação';byLinha.get(it.linha).motivo=(byLinha.get(it.linha).motivo?byLinha.get(it.linha).motivo+'; ':'')+'etapa "ganho" exige condição de fechamento: entrou como Negociação'}
  if(!l.status)delete l.status;
  return {...l,...Q.camposCalculados(l,cfgOp)};
 };
 try{
  for(let i=0;i<plano.novos.length;i+=50){
   const lote=plano.novos.slice(i,i+50);
   im.progresso='novos '+Math.min(i+50,plano.novos.length)+' de '+plano.novos.length;C.render();
   let {data,error}=await C.db.from('jadem_leads').insert(lote.map(prepara)).select('id,company_name,trade_name,estimated_value,operation_id');
   if(error){   // um registro ruim derruba o lote: grava um a um para saber qual
    data=[];
    for(const it of lote){
     const r=await C.db.from('jadem_leads').insert(prepara(it)).select('id,company_name,trade_name,estimated_value,operation_id').single();
     if(r.error){const x=byLinha.get(it.linha);x.resultado='rejeitado';x.motivo=(r.error.code==='23505'?'CNPJ já cadastrado nesta operação':r.error.message)}
     else data.push(r.data);
    }
   }
   novos+=(data||[]).length;
   (data||[]).forEach(x=>eventos.push({lead_id:x.id,action:'importou',detail:'Importação '+im.nome}));
   // todo lead importado entra no Funil de vendas, na coluna Novo
   if((data||[]).length){
    const r=await C.db.from('jadem_deals').insert(data.map(x=>({title:(x.trade_name||x.company_name).slice(0,200),stage:'Novo',amount:Number(x.estimated_value)||0,operation_id:x.operation_id||null,lead_id:x.id})));
    if(r.error)avisoNegocio=r.error.message;else negocios+=data.length;
   }
  }
  const existentes=new Map(((C.state.rawData||C.state.data).leads||[]).map(l=>[l.id,l]));
  // atualiza de 5 em 5 (centenas de leads em poucos segundos, sem sobrecarregar o banco)
  const umaAtualizacao=async a=>{
   const base=existentes.get(a.id);
   const patch={...a.patch,...Q.camposCalculados({...base,...a.patch},cfgOp),updated_at:new Date().toISOString()};
   const r=await C.db.from('jadem_leads').update(patch).eq('id',a.id);
   if(r.error){const x=byLinha.get(a.linha);x.resultado='rejeitado';x.motivo='Não foi possível completar: '+r.error.message}
   else{atual++;eventos.push({lead_id:a.id,action:im.corrigir?'importação corrigiu dados':'importação completou dados',detail:a.campos.join(', ')+' · '+im.nome,...(base.owner_id!==C.state.user.id?{owner_id:base.owner_id}:{})})}
  };
  for(let i=0;i<plano.atualizacoes.length;i+=5){
   im.progresso='atualizando '+Math.min(i+5,plano.atualizacoes.length)+' de '+plano.atualizacoes.length;C.render();
   await Promise.all(plano.atualizacoes.slice(i,i+5).map(umaAtualizacao));
  }
  for(let i=0;i<eventos.length;i+=100){const r=await C.db.from('jadem_lead_events').insert(eventos.slice(i,i+100));if(r.error)console.warn('Auditoria da importação:',r.error.message)}
  await C.load();
  // confere no banco: os CNPJs importados estão lá, na operação certa
  const cnpjs=plano.novos.map(n=>n.lead.cnpj).filter(Boolean);
  const gravados=((C.state.rawData||C.state.data).leads||[]).filter(l=>(l.operation_id||null)===op&&cnpjs.includes(l.cnpj)).length;
  im.conferido=novos+' novo(s) e '+atual+' atualizado(s) gravados; '+negocios+' no Funil de vendas (Novo)'+(avisoNegocio?' — negócios não criados: '+avisoNegocio:'')+(cnpjs.length?'; '+gravados+' de '+cnpjs.length+' CNPJs encontrados na operação':'');
  im.relatorio=rel;im.fase='relatorio';
  C.toast(novos+' lead(s) importado(s), '+atual+' completado(s).');
 }catch(err){
  await C.load();im.relatorio=rel;im.fase='relatorio';im.conferido='importação interrompida: '+err.message+' ('+novos+' novos gravados antes do erro)';
 }finally{feature.importBusy=false;C.render()}
}
function baixarRelatorio(){
 const im=feature.imp;if(!im?.relatorio)return;
 const blob=new Blob([IMP.relatorioCSV(im.relatorio)],{type:'text/csv;charset=utf-8'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='relatorio-importacao-'+im.nome.replace(/\.[^.]+$/,'')+'.csv';a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
async function recalcular(){
 const meus=co('leads').filter(l=>l.owner_id===C.state.user.id);
 if(!meus.length)return;
 if(!confirm('Recalcular ICP, score e completude de '+meus.length+' lead(s) pela regra de cada operação? ICP revisado pelo gestor é mantido.'))return;
 let n=0;
 for(const l of meus){
  const novo=calc(l);
  if(['score','score_icp','score_engagement','completeness','icp_class','score_reason'].some(k=>(l[k]??null)!==(novo[k]??null))){
   const r=await C.db.from('jadem_leads').update(novo).eq('id',l.id);if(!r.error)n++;
  }
 }
 await C.load();C.toast(n+' lead(s) recalculado(s).');
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
  else if(a==='import-cancel'){if(feature.importBusy)return;feature.imp=null;feature.panel=null;C.render();}
  else if(a==='import-run')await importRun();
  else if(a==='import-report')baixarRelatorio();
  else if(a==='recalc')await recalcular();
  else if(a==='filter-clear'){feature.f={};C.render();}
  else if(a.startsWith('copy:')){const t=a.slice(5);try{await navigator.clipboard.writeText(t);C.toast('Copiado: '+t)}catch(err){C.toast('Não foi possível copiar. Selecione o número.')}}
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
 if(ev.target.dataset?.lf){feature.f={...feature.f,[ev.target.dataset.lf]:ev.target.value};C.render();}
 if(ev.target.dataset?.impMap!==undefined&&feature.imp){feature.imp.mapa={...feature.imp.mapa,[feature.imp.cabecalhos[+ev.target.dataset.impMap]]:ev.target.value};C.render();}
 if(ev.target.hasAttribute?.('data-imp-op')&&feature.imp){feature.imp.op=ev.target.value;C.render();}
 if(ev.target.hasAttribute?.('data-imp-corrigir')&&feature.imp){feature.imp.corrigir=!!ev.target.checked;C.render();}
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
