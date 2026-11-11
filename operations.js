
import {configDa,MODELO_MARKETING_MEDICO} from './qualificacao.js';
let C=null,modal=null,working=false,user='';
const esc=x=>C.esc(x??'');
const full=()=>C.state.rawData||C.state.data;
const ops=()=>full().clientOperations||[];
const scoped=['companies','people','deals','tasks','activities','leads','meetings','send','sendCampaigns'];
const related=['leadEvents','recordings','shares','assignments','stageHistory'];
const states=['Implantação','Ativa','Pausada','Encerrada'];
function key(){return 'jadem_op_'+C.state.user.id}
export function scopeOperations(){
 if(!C?.state.user)return;
 if(user!==C.state.user.id){user=C.state.user.id;try{C.state.activeOperation=localStorage.getItem(key())||''}catch{C.state.activeOperation=''}}
 let id=C.state.activeOperation||'';
 if(id&&id!=='unassigned'&&!ops().some(o=>o.id===id)){id='';C.state.activeOperation=''}
 const d={...full()};
 if(id){
  for(const n of scoped)d[n]=(full()[n]||[]).filter(x=>id==='unassigned'?!x.operation_id:x.operation_id===id);
  const lids=new Set(d.leads.map(x=>x.id)),mids=new Set(d.meetings.map(x=>x.id));
  for(const n of related)d[n]=(full()[n]||[]).filter(x=>lids.has(x.lead_id));
  d.callHistory=(full().callHistory||[]).filter(x=>lids.has(x.lead_id));
  d.callScripts=(full().callScripts||[]).filter(x=>x.operation_id===id);
  d.tasks=(full().tasks||[]).filter(x=>x.operation_id===id||(x.lead_id&&lids.has(x.lead_id)));
  d.dealHistory=(full().dealHistory||[]).filter(x=>new Set(d.deals.map(y=>y.id)).has(x.deal_id));
  d.notifications=(full().notifications||[]).filter(x=>mids.has(x.meeting_id));
 }
 C.state.data=d;
}
export function operationSelector(){
 const id=C?.state.activeOperation||'';
 return '<div class="jadem-operation-select"><label for="jademClientPicker">OPERAÇÃO ATIVA</label><select id="jademClientPicker" data-operation-choose>'+
 '<option value="">Todas as operações</option><option value="unassigned" '+(id==='unassigned'?'selected':'')+'>Sem operação / antigos</option>'+
 ops().map(x=>'<option value="'+esc(x.id)+'" '+(id===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select>'+
 '<button data-nav="clientOperations" class="jadem-operation-manage">Gerenciar operações →</button></div>';
}
export function operationField(existing){
 const val=existing===undefined?(C.state.activeOperation==='unassigned'?'':C.state.activeOperation||''):existing||'';
 return '<div class="field wide"><label>Empresa atendida pela Mioli</label><select name="operation_id"><option value="" '+(!val?'selected':'')+'>Sem operação</option>'+
 ops().map(x=>'<option value="'+esc(x.id)+'" '+(val===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+
 '</select><small class="operation-help">O cadastro ficará associado à operação selecionada.</small></div>';
}
function move(id){
 if(id&&id!=='unassigned'&&!ops().some(o=>o.id===id)){C.toast('Operação inválida.');return}
 C.state.activeOperation=id;
 try{localStorage.setItem(key(),id)}catch{}
 scopeOperations();C.state.modal=null;C.state.view='gestao';C.state.search='';C.render();
}
function counts(id){
 return ['leads','meetings','deals','tasks'].map(k=>(full()[k]||[]).filter(v=>v.operation_id===id&&(k!=='tasks'||!v.done)&&(k!=='meetings'||v.status!=='Cancelada')).length);
}
export function operationsView(){
 const a=ops(),summary=[['Operações',a.length],['Ativas',a.filter(x=>x.status==='Ativa').length],
 ['Leads totais',(full().leads||[]).length],['Leads sem operação',(full().leads||[]).filter(x=>!x.operation_id).length]];
 return C.title('Operações dos Clientes','Empresas que contratam a Mioli, com base de leads e indicadores próprios.',
 '<button class="btn primary" data-op="new">'+C.ic('plus')+' Nova operação</button>')+
 '<div class="notice">Esta área cadastra <b>seus clientes</b>. A aba <b>Empresas</b> continua para os prospects que sua equipe abordará. Registros anteriores ficam em <b>Sem operação</b>.</div>'+
 '<div class="grid4 op-summary">'+summary.map(x=>'<div class="card kpi"><div class="metric-label">'+esc(x[0])+'</div><div class="metric-value">'+x[1]+'</div></div>').join('')+'</div>'+
 (a.length?'<div class="op-grid">'+a.map(x=>{
 const n=counts(x.id);
 return '<div class="card op-card"><div class="op-card-top"><span class="op-avatar">'+esc(x.name[0])+'</span><div><h2>'+esc(x.name)+'</h2><small>'+esc(x.segment||'Segmento a definir')+'</small></div><span class="op-status">'+esc(x.status)+'</span></div>'+
 '<p>'+esc(x.service_type||'Serviço comercial da Mioli')+'</p><div class="op-stats">'+n.map((v,i)=>'<div><b>'+v+'</b><small>'+['Leads','Reuniões','Negócios','Tarefas'][i]+'</small></div>').join('')+'</div>'+
 '<div class="op-commercial">'+(x.setup_value!==null?'<span>Setup '+C.money(Number(x.setup_value))+'</span>':'')+
 (x.commission_percent!==null?'<span>Comissão '+Number(x.commission_percent)+'%</span>':'')+'</div>'+
 '<div class="op-buttons"><button class="btn primary sm" data-op="open:'+x.id+'">Entrar na operação</button>'+
 '<button class="btn outline sm" data-op="edit:'+x.id+'">Editar</button></div></div>';
 }).join('')+'</div>':'<div class="card op-empty"><h2>Cadastre seu primeiro cliente</h2><p>Crie a operação para separar a prospecção, as reuniões e as vendas.</p><button class="btn primary" data-op="new">Criar operação</button></div>')+
 '<div class="notice">Separação interna da Mioli: não habilita logins de clientes. Acesso independente e subdomínios precisarão de permissões específicas numa etapa posterior.</div>';
}
const f=(name,label,value='',type='text',rules='')=>'<label class="op-field"><span>'+label+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value??'')+'" '+rules+'></label>';
export function operationsOverlay(){
 if(modal===null)return '';
 const x=modal?ops().find(v=>v.id===modal):null;
 return '<div class="featureoverlay"><div class="featuremodal" role="dialog" aria-modal="true"><div class="featureheader"><h2>'+(x?'Editar cliente':'Nova operação do cliente')+'</h2>'+
 '<button type="button" class="btn neutral sm" data-op="close">Fechar</button></div><form class="op-form" id="operationForm">'+
 '<p class="muted">Cadastre a empresa que contratou a Mioli Consultoria.</p><div class="op-fields">'+
 f('name','Nome da empresa *',x?.name,'text','required minlength="2" maxlength="160"')+
 f('segment','Segmento',x?.segment)+f('service_type','Serviço contratado',x?.service_type)+
 f('contact_name','Responsável',x?.contact_name)+f('contact_email','E-mail do responsável',x?.contact_email,'email')+
 f('setup_value','Setup (R$)',x?.setup_value,'number','min="0" step="0.01"')+
 f('commission_percent','Comissão (%)',x?.commission_percent,'number','min="0" max="100" step="0.01"')+
 '<label class="op-field"><span>Status</span><select name="status">'+states.map(s=>'<option value="'+s+'" '+(s===(x?.status||'Implantação')?'selected':'')+'>'+s+'</option>').join('')+'</select></label>'+
 '<label class="op-field op-wide"><span>Observações</span><textarea name="notes" rows="3">'+esc(x?.notes||'')+'</textarea></label></div>'+
 regrasCampos(x)+
 '<div class="op-actions"><button type="button" class="btn outline" data-op="close">Cancelar</button><button class="btn primary" type="submit" '+(working?'disabled':'')+'>Salvar operação</button></div></form></div></div>';
}
// ---------- regras comerciais (ICP e score) ----------
const cnaeFmt=c=>/^\d{7}$/.test(c)?c.replace(/^(\d{4})(\d)(\d{2})$/,'$1-$2/$3'):c;
function regrasCampos(x){
 const c=configDa(x),p=c.pesos;
 const ta=(n,l,v,h)=>'<label class="op-field op-wide"><span>'+l+'</span><textarea name="'+n+'" rows="2" placeholder="'+esc(h)+'">'+esc(v)+'</textarea></label>';
 const num=(n,l,v)=>f(n,l,v,'number','min="0" max="100" step="1"');
 return '<details class="op-regras" '+(x&&(x.commercial_config&&Object.keys(x.commercial_config).length)?'':'open')+'><summary><strong>Regras comerciais: ICP, score e fechamento</strong></summary>'+
 '<p class="muted">Pesos são regras da operação para priorizar leads, não probabilidade estatística. O CNAE sozinho nunca define o ICP A. Mudar aqui não altera contrato, setup nem comissão.</p>'+
 '<div class="op-actions" style="justify-content:flex-start;margin:6px 0 10px"><button type="button" class="btn outline sm" data-op="modelo-medico">Usar modelo: Marketing médico (Cazado)</button></div>'+
 '<div class="op-fields">'+
 f('closing_requirement','Condição exigida para Fechado — ganho',x?.closing_requirement,'text','maxlength="200" placeholder="Ex.: contrato assinado e 1ª mensalidade paga"')+
 ta('cfg_cnaes','CNAEs prioritários (um por linha)',c.cnaes.map(cnaeFmt).join('\n'),'8630-5/03')+
 ta('cfg_segmentos','Palavras do segmento-alvo (separe por vírgula)',c.segmentos.join(', '),'medic, clinica, consultorio')+
 ta('cfg_especialidades','Palavras que indicam especialidade (separe por vírgula)',c.especialidades.join(', '),'dermatolog, ortoped, cardiolog')+
 f('cfg_ufs','UFs atendidas (vazio = Brasil inteiro)',c.ufs.join(', '),'text','placeholder="SP, RJ, MG"')+
 num('cfg_p_cnae','Peso: CNAE prioritário',p.cnae)+num('cfg_p_segmento','Peso: segmento',p.segmento)+num('cfg_p_especialidade','Peso: especialidade',p.especialidade)+
 num('cfg_p_regiao','Peso: região atendida',p.regiao)+num('cfg_p_privado','Peso: operação privada',p.privado)+
 num('cfg_limite_a','Aderência mínima para ICP A (%)',c.limites.A)+
 num('cfg_s_icp','Score: peso da aderência ao ICP',c.score.icp)+num('cfg_s_eng','Score: peso do engajamento',c.score.engajamento)+
 f('cfg_dias','Dias sem movimentação para alertar',c.dias_parado,'number','min="1" max="365" step="1"')+
 '<label class="op-field op-wide"><span><input type="checkbox" name="cfg_tarefa_pesquisa" '+(c.tarefa_pesquisa?'checked':'')+'> Criar tarefa de pesquisa para lead sem telefone e sem e-mail</span></label>'+
 '<label class="op-field op-wide"><span><input type="checkbox" name="cfg_followup" '+(c.followup?'checked':'')+'> Criar tarefa de follow-up quando uma conversa termina sem próximo passo</span></label>'+
 '</div></details>';
}
function lerRegras(d,anterior){
 const lista=k=>String(d.get(k)||'').split(/[,\n;]+/).map(x=>x.trim()).filter(Boolean);
 const n=(k,min=0,max=100)=>{const v=Number(d.get(k));if(!Number.isFinite(v)||v<min||v>max)throw Error('Valor inválido em regras comerciais ('+k.replace('cfg_','')+').');return Math.round(v)};
 const cnaes=String(d.get('cfg_cnaes')||'').split(/\n+/).map(x=>(x.match(/^\s*([\d.\-\/ ]{7,12})/)||[])[1]||x).map(x=>x.replace(/\D/g,'')).filter(Boolean);
 if(cnaes.some(c=>c.length!==7))throw Error('Cada CNAE prioritário precisa ter 7 dígitos (ex.: 8630-5/03).');
 const ufs=lista('cfg_ufs').map(x=>x.toUpperCase());
 if(ufs.some(u=>!/^[A-Z]{2}$/.test(u)))throw Error('UFs devem ter 2 letras, separadas por vírgula.');
 const s={icp:n('cfg_s_icp'),engajamento:n('cfg_s_eng')};
 if(!s.icp&&!s.engajamento)throw Error('Os pesos do score não podem ser os dois zero.');
 return {...(anterior||{}),cnaes,segmentos:lista('cfg_segmentos'),especialidades:lista('cfg_especialidades'),ufs,
  pesos:{cnae:n('cfg_p_cnae'),segmento:n('cfg_p_segmento'),especialidade:n('cfg_p_especialidade'),regiao:n('cfg_p_regiao'),privado:n('cfg_p_privado')},
  limites:{A:n('cfg_limite_a')},score:s,dias_parado:n('cfg_dias',1,365),tarefa_pesquisa:d.has('cfg_tarefa_pesquisa'),followup:d.has('cfg_followup')};
}
function aplicarModelo(){
 const form=document.getElementById('operationForm');if(!form)return;
 const m=MODELO_MARKETING_MEDICO,set=(k,v)=>{if(form.elements[k])form.elements[k].value=v};
 set('cfg_cnaes',m.cnaes.map(c=>cnaeFmt(c)+' — '+m.cnaes_rotulos[c]).join('\n'));
 set('cfg_segmentos',m.segmentos.join(', '));set('cfg_especialidades',m.especialidades.join(', '));set('cfg_ufs','');
 set('cfg_p_cnae',m.pesos.cnae);set('cfg_p_segmento',m.pesos.segmento);set('cfg_p_especialidade',m.pesos.especialidade);
 set('cfg_p_regiao',m.pesos.regiao);set('cfg_p_privado',m.pesos.privado);set('cfg_limite_a',m.limites.A);
 set('cfg_s_icp',m.score.icp);set('cfg_s_eng',m.score.engajamento);
 if(form.elements.segment&&!form.elements.segment.value)form.elements.segment.value='Marketing médico e posicionamento estratégico';
 C.toast('Modelo aplicado. Revise e clique em Salvar operação.');
}
async function submit(e){
 if(e.target.id!=='operationForm')return;
 e.preventDefault();if(working)return;working=true;
 const d=new FormData(e.target),v=k=>String(d.get(k)||'').trim(),name=v('name'),mail=v('contact_email'),status=v('status');
 const setup=v('setup_value')?Number(v('setup_value')):null,comm=v('commission_percent')?Number(v('commission_percent')):null;
 try{
  if(name.length<2||name.length>160)throw Error('Informe o nome do cliente.');
  if(!states.includes(status))throw Error('Status inválido.');
  if(mail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))throw Error('E-mail inválido.');
  if(setup!==null&&(!Number.isFinite(setup)||setup<0))throw Error('Setup inválido.');
  if(comm!==null&&(!Number.isFinite(comm)||comm<0||comm>100))throw Error('Comissão deve ser entre 0% e 100%.');
  const anterior=modal?ops().find(o=>o.id===modal):null;
  const record={name,segment:v('segment'),service_type:v('service_type'),contact_name:v('contact_name'),
   contact_email:mail,setup_value:setup,commission_percent:comm,status,notes:v('notes'),updated_at:new Date().toISOString(),
   closing_requirement:v('closing_requirement')||null,commercial_config:lerRegras(d,anterior?.commercial_config)};
  const q=modal?C.db.from('jadem_client_operations').update(record).eq('id',modal):
    C.db.from('jadem_client_operations').insert({...record,owner_id:C.state.user.id});
  const {error}=await q;if(error)throw error;
  modal=null;await C.load();C.toast('Operação salva com sucesso.');
 }catch(err){C.toast(err.code==='23505'?'Este cliente já está cadastrado.':err.message)}
 finally{working=false;C.render()}
}
function click(e){
 const btn=e.target.closest('[data-op]');if(!btn)return;
 const op=btn.dataset.op;
 if(op==='new'){modal='';C.render()}
 else if(op==='close'){modal=null;C.render()}
 else if(op.startsWith('edit:')){modal=op.slice(5);C.render()}
 else if(op.startsWith('open:'))move(op.slice(5));
 else if(op==='modelo-medico')aplicarModelo();
}
function change(e){if(e.target.matches('[data-operation-choose]'))move(e.target.value)}
export function setupOperations(ctx){C=ctx;document.addEventListener('click',click);document.addEventListener('change',change);document.addEventListener('submit',submit)}
