
import {paraEmail,usuarioValido,mostrarLogin} from './usuario.js';
let C,modal=null,windowPeriod='week';
const periods={day:'Hoje',week:'Semana',month:'Mês'},states=['Agendada','Realizada','Não compareceu','Cancelada'],outcomes=['Pendente','Ganho','Perdido'];
const val=x=>String(x||'').trim().toLowerCase();
const items=k=>C.state.data[k]||[];
const E=x=>C.esc(x);
const me=()=>val(C?.state.user?.email);
export function roleIdentity(){
 if(!C?.state.user)return 'GESTAO';
 const uid=C.state.user.id,m=items('roster').find(x=>x.owner_id===uid&&x.role==='GESTAO'&&x.active&&val(x.member_email)===me());
 if(m)return 'GESTAO';
 return items('roster').find(x=>x.active&&x.owner_id!==uid&&val(x.member_email)===me())?.role||'GESTAO';
}
// tipos de usuário: GESTAO é o Admin (a conta dona dos dados)
export const ROLE_LABEL={GESTAO:'Admin',SDR:'SDR',CLOSER:'Closer',CLIENTE:'Cliente',IA:'Escritório IA'};
const ROLE_INFO={SDR:'Prospecção e agendamento. Vê só os leads distribuídos para ele.',CLOSER:'Reuniões e fechamento. Vê só os leads distribuídos para ele.',
 CLIENTE:'A empresa que contratou a Mioli. Vê o painel, o funil de vendas e acompanha os leads da operação dela, sem telefone, e-mail ou anotações.',
 IA:'O login das IAs do escritório (Jarvis, Secretária, Diretor Comercial, Eloá). Lê tudo; cria e altera leads, tarefas, reuniões e ligações; não apaga nada.'};
export const roleLabel=r=>ROLE_LABEL[r||roleIdentity()]||r;
const VIEWS={SDR:['sdr','leads','calendar','tasks','activities','settings','connect','send','warmup','callQueue'],
 CLOSER:['closer','leads','calendar','tasks','activities','settings','deals','callQueue'],
 CLIENTE:['cliente','deals','settings'],
 IA:['dashboard','clientOperations','companies','leads','people','deals','callQueue','tasks','calendar','activities','reports','notifications','settings']};
export function roleCanView(v){
 const r=roleIdentity();if(r==='GESTAO')return v!=='cliente';
 return (VIEWS[r]||VIEWS.SDR).includes(v);
}
export function roleHome(){const r=roleIdentity();return r==='SDR'?'sdr':r==='CLOSER'?'closer':r==='CLIENTE'?'cliente':r==='IA'?'leads':'gestao'}
export function roleAutoView(){if(C.state.view==='dashboard'||!roleCanView(C.state.view))C.state.view=roleHome()}
export function setupRoles(ctx){C=ctx;document.addEventListener('click',clicked);document.addEventListener('submit',submitted);document.addEventListener('change',changed);document.addEventListener('input',filtrarLeads);document.addEventListener('change',filtrarLeads);arrastarQuadro()}
function bounds(p){const today=new Date(),begin=new Date(today.getFullYear(),today.getMonth(),today.getDate());if(p==='week')begin.setDate(begin.getDate()-(begin.getDay()+6)%7);if(p==='month')begin.setDate(1);const end=new Date(begin);if(p==='day')end.setDate(end.getDate()+1);if(p==='week')end.setDate(end.getDate()+7);if(p==='month')end.setMonth(end.getMonth()+1);return [begin.getTime(),end.getTime()]}
function scoped(m){
 const uid=C.state.user.id;
 return items('meetings').filter(x=>m==='GESTAO'?x.owner_id===uid:m==='SDR'?x.scheduled_by===uid:val(x.closer_email)===me()||(roleIdentity()==='GESTAO'&&x.owner_id===uid&&!x.closer_email)).sort((a,b)=>new Date(b.scheduled_at)-new Date(a.scheduled_at));
}
function numbers(list,p){const [start,end]=bounds(p),a=list.filter(x=>{const t=new Date(x.scheduled_at).getTime();return t>=start&&t<end}),held=a.filter(x=>x.status==='Realizada'),no=a.filter(x=>x.status==='Não compareceu'),won=held.filter(x=>x.result==='Ganho');return {booked:a.filter(x=>x.status!=='Cancelada').length,held:held.length,no:no.length,canceled:a.filter(x=>x.status==='Cancelada').length,won:won.length,attendance:(held.length+no.length?held.length/(held.length+no.length)*100:null),conversion:(held.length?won.length/held.length*100:null)}}
const pct=n=>n==null?'—':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n)+'%';
function card(l,n,hint=''){return '<div class="card kpi"><div class="metric-label">'+E(l)+'</div><div class="metric-value">'+E(n)+'</div><div class="metric-foot">'+E(hint)+'</div></div>'}
function summary(ms){
 const rows=[['Agendadas','booked'],['Realizadas','held'],['Faltas','no'],['Canceladas','canceled'],['Comparecimento','attendance'],['Fechamentos','won'],['Conversão reunião → venda','conversion']];
 return '<div class="card"><div class="sectionhead"><h2>Reuniões — dia, semana e mês</h2></div><div class="tablewrap"><table class="datatable"><thead><tr><th>Indicador</th>'+Object.values(periods).map(p=>'<th>'+p+'</th>').join('')+'</tr></thead><tbody>'+rows.map(([title,k])=>'<tr><td><strong>'+E(title)+'</strong></td>'+Object.keys(periods).map(p=>'<td>'+E(k==='attendance'||k==='conversion'?pct(numbers(ms,p)[k]):numbers(ms,p)[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></div>';
}
function select(id,field,value,enabled){const opts=field==='status'?states:outcomes;return '<select class="role-select" '+(!enabled?'disabled':'')+' data-role-'+field+'="'+id+'">'+opts.map(x=>'<option '+(x===value?'selected':'')+'>'+E(x)+'</option>').join('')+'</select>'}
function meetingRows(ms){
 return '<div class="card" style="margin-top:19px"><div class="sectionhead"><h2>Controle das reuniões</h2><span>'+ms.length+' registros</span></div>'+(ms.length?'<div class="tablewrap"><table class="datatable"><thead><tr><th>Lead</th><th>Data</th><th>Closer</th><th>Situação</th><th>Resultado</th><th>Google Meet</th></tr></thead><tbody>'+ms.slice(0,90).map(m=>{
 const l=items('leads').find(x=>x.id===m.lead_id),allow=roleIdentity()==='GESTAO'||val(m.closer_email)===me();
 return '<tr><td><strong>'+E(l?.company_name||m.guest_company||m.guest_name||m.title)+'</strong><span class="secondtext">'+E(m.title)+'</span></td><td>'+C.fmt(m.scheduled_at,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</td><td>'+E(m.closer_email||'A definir')+'</td><td>'+select(m.id,'status',m.status,allow)+'</td><td>'+select(m.id,'result',m.result,allow&&m.status==='Realizada')+'</td><td>'+(m.meet_url?'<a class="pilllink" href="'+E(m.meet_url)+'" target="_blank" rel="noopener noreferrer">Entrar ↗</a>':'—')+'</td></tr>'
 }).join('')+'</tbody></table></div>':'<div class="feature-empty">Nenhuma reunião registrada.</div>')+'</div>';
}
export function rolesView(mode){
 if(mode==='GESTAO'&&roleIdentity()!=='GESTAO'||mode==='SDR'&&roleIdentity()==='CLOSER'||mode==='CLOSER'&&roleIdentity()==='SDR')return C.title('Acesso restrito','Sem permissão para este painel.');
 const ms=scoped(mode),n=numbers(ms,windowPeriod),uid=C.state.user.id;
 const leadCount=items('leads').filter(l=>mode==='GESTAO'?l.owner_id===uid:items('assignments').some(a=>a.lead_id===l.id&&a.role===mode&&val(a.assigned_email)===me())).length;
 const switcher=roleIdentity()==='GESTAO'?'<div class="role-tabs">'+[['GESTAO','Gestão'],['SDR','SDR'],['CLOSER','Closer']].map(([key,name])=>'<button class="role-tab '+(key===mode?'on':'')+'" data-role-go="'+key+'">'+name+'</button>').join('')+'</div>':'';
 return C.title((mode==='GESTAO'?'Gestão comercial':mode==='SDR'?'Painel do SDR':'Painel do Closer')+(C.opAtiva()?' · '+C.opAtiva():''),
 mode==='GESTAO'?'Indicadores da operação, distribuição e performance.':mode==='SDR'?'Leads, prospecção e agendamentos.':'Reuniões, comparecimento e fechamento.',
 mode==='GESTAO'?'<button class="btn primary" data-role="team">'+C.ic('users')+' Equipe</button>':'<button class="btn primary" data-role="calendar">'+C.ic('calendar')+' Agenda</button>')
 +switcher+summary(ms)+'<div class="role-period">Período em destaque <select id="rolePeriod">'+Object.keys(periods).map(x=>'<option value="'+x+'" '+(x===windowPeriod?'selected':'')+'>'+periods[x]+'</option>').join('')+'</select></div>'
 +'<div class="grid4">'+card('Leads da carteira',leadCount)+card('Reuniões agendadas',n.booked,periods[windowPeriod])+card('Realizadas',n.held,periods[windowPeriod])+card('Conversão',pct(n.conversion),'Ganhos / reuniões realizadas')+'</div>'
 +meetingRows(ms)+'<p class="note" style="margin-top:14px">Comparecimento = realizadas ÷ (realizadas + faltas). Conversão = reuniões realizadas com resultado ganho ÷ reuniões realizadas. Canceladas não contam como agendadas. Períodos no fuso do navegador.</p>';
}
let painel=null,painelCarregando=false;
async function carregarPainel(){
 painelCarregando=true;const r=await C.db.rpc('jadem_painel_cliente');painelCarregando=false;
 painel=r.error?{erro:r.error.message}:(r.data||[]);C.render();
}
export function clientView(){
 if(roleIdentity()!=='CLIENTE')return C.title('Acesso restrito','Este painel é dos usuários do tipo Cliente.');
 if(!painel&&!painelCarregando)carregarPainel();
 const topo=C.title('Painel da operação','Os números da sua operação com a Mioli Consultoria. Últimos 30 dias, exceto onde indicado.','<button class="btn outline" data-role="painel">'+C.ic('activity')+' Atualizar</button>');
 if(!painel)return topo+'<div class="card module"><p>Carregando os números…</p></div>';
 if(painel.erro)return topo+'<div class="notice">Não foi possível carregar o painel: '+E(painel.erro)+'</div>';
 if(!painel.length)return topo+'<div class="card module"><h2>Nenhuma operação liberada</h2><p>Seu acesso ainda não foi ligado a uma operação. Fale com a Mioli Consultoria.</p></div>';
 const taxa=(a,b)=>b?Math.round(a/b*100)+'%':'—';
 return topo+painel.map(o=>'<div class="sectionhead" style="padding:0 0 12px;border:0"><h2>'+E(o.operacao)+'</h2><span>'+E(o.situacao||'')+' · atualizado '+C.fmt(o.atualizado_em,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</span></div>'
  +'<div class="grid4" style="margin-bottom:15px">'+card('Leads na operação',o.leads,o.leads_novos_30d+' novos em 30 dias')+card('Ligações',o.ligacoes_30d,o.ligacoes_7d+' nos últimos 7 dias')+card('Ligações atendidas',o.atendidas_30d,'Taxa de atendimento '+taxa(o.atendidas_30d,o.ligacoes_30d))+card('Próximas reuniões',o.proximas_reunioes,'Agendadas daqui para frente')+'</div>'
  +'<div class="grid4" style="margin-bottom:15px">'+card('Reuniões agendadas',o.reunioes_agendadas_30d)+card('Reuniões realizadas',o.reunioes_realizadas_30d,'Comparecimento '+taxa(o.reunioes_realizadas_30d,o.reunioes_realizadas_30d+o.faltas_30d))+card('Faltas',o.faltas_30d)+card('Vendas',o.vendas_30d,'Conversão '+taxa(o.vendas_30d,o.reunioes_realizadas_30d))+'</div>'
  +'<div class="card" style="margin-bottom:26px"><div class="sectionhead"><h2>Leads por etapa</h2></div><div class="cardbody">'+(Object.keys(o.leads_por_etapa||{}).length?Object.entries(o.leads_por_etapa).map(([k,n])=>'<div class="settingsrow"><div><strong>'+E(k)+'</strong></div><b>'+E(n)+'</b></div>').join(''):'<p class="note">Ainda sem leads.</p>')+'</div></div>').join('')
  +acompanharLeads()
  +'<p class="note">Telefones, e-mails e anotações dos contatos ficam com a equipe da Mioli.</p>';
}
const opName=id=>items('clientOperations').find(o=>o.id===id)?.name||'—';
// cartão de Usuários nas Configurações (só o Admin)
export function usersCard(){
 if(roleIdentity()!=='GESTAO')return '';
 const uid=C.state.user.id,people=items('roster').filter(x=>x.owner_id===uid&&val(x.member_email)!==me());
 const tipos=['SDR','CLOSER','CLIENTE','IA'];
 return '<div class="card" style="margin-top:18px"><div class="sectionhead"><h2>Usuários e acessos</h2><div class="flexrow"><button class="btn outline sm" data-role="team">'+C.ic('users')+' Equipe e distribuição</button><button class="btn primary sm" data-role="new">'+C.ic('plus')+' Adicionar usuário</button></div></div>'
 +'<div class="cardbody"><div class="grid4" style="margin-bottom:8px">'+tipos.map(t=>'<div><strong style="font-size:12px;color:#27384e">'+E(ROLE_LABEL[t])+' · '+people.filter(x=>x.role===t&&x.active).length+'</strong><p class="note" style="margin:6px 0 0">'+E(ROLE_INFO[t])+'</p></div>').join('')+'</div>'
 +(people.length?'<div class="tablewrap"><table class="datatable"><thead><tr><th>Nome</th><th>E-mail</th><th>Tipo</th><th>Operação</th><th>Ativo</th></tr></thead><tbody>'+people.map(r=>'<tr><td>'+E(r.display_name||'—')+'</td><td>'+E(mostrarLogin(r.member_email))+'</td><td>'+C.badge(ROLE_LABEL[r.role]||r.role)+'</td><td>'+E(r.role==='CLIENTE'?opName(r.operation_id):'—')+'</td><td><div class="flexrow"><button class="btn outline sm" data-role="toggle:'+r.id+'">'+(r.active?'Sim · Desativar':'Não · Ativar')+'</button><button class="btn outline sm" data-role="senha:'+r.id+'">Nova senha</button></div></td></tr>').join('')+'</tbody></table></div>':'<div class="feature-empty">Nenhum usuário adicionado ainda.</div>')
 +'<p class="note" style="margin-top:12px">Ao adicionar, o JADEM cria a conta com uma senha temporária e mostra a senha para você enviar à pessoa. No primeiro acesso ela troca por uma senha dela. Se a pessoa já tinha conta, ela só é adicionada e continua com a senha dela.</p></div></div>';
}
export function teamView(){
 if(roleIdentity()!=='GESTAO')return C.title('Equipe','Apenas Gestão pode gerenciar colaboradores.');
 const uid=C.state.user.id,people=items('roster').filter(x=>x.owner_id===uid),assigned=items('assignments').filter(x=>x.owner_id===uid);
 return C.title('Gestão de equipe','Colaboradores e distribuição de leads por responsável.','<button class="btn primary" data-role="new">'+C.ic('plus')+' Adicionar usuário</button>')
 +'<div class="notice">Ao adicionar um usuário, o JADEM cria a conta com uma senha temporária para você enviar; no primeiro acesso a pessoa troca. SDR e Closer visualizam apenas os leads atribuídos.</div>'
 +'<div class="grid4" style="margin-bottom:18px">'+card('Colaboradores',people.filter(x=>x.active).length)+card('SDRs',people.filter(x=>x.role==='SDR'&&x.active).length)+card('Closers',people.filter(x=>x.role==='CLOSER'&&x.active).length)+card('Distribuições',assigned.length)+'</div>'
 +'<div class="card"><div class="sectionhead"><h2>Equipe</h2></div>'+(people.length?'<div class="tablewrap"><table class="datatable"><thead><tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Ativo</th></tr></thead><tbody>'+people.map(r=>'<tr><td>'+E(r.display_name||'—')+'</td><td>'+E(mostrarLogin(r.member_email))+'</td><td>'+E(ROLE_LABEL[r.role]||r.role)+(r.role==='CLIENTE'?' · '+E(opName(r.operation_id)):'')+'</td><td>'+((val(r.member_email)===me()&&r.role==='GESTAO')?'Gestor principal':'<button class="btn outline sm" data-role="toggle:'+r.id+'">'+(r.active?'Sim · Desativar':'Não · Ativar')+'</button>')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="feature-empty">Nenhum colaborador adicionado.</div>')+'</div>'
 +'<div class="card" style="margin-top:18px"><div class="sectionhead"><h2>Atribuição de leads</h2></div>'+
 (items('leads').filter(x=>x.owner_id===uid).length?'<div class="tablewrap"><table class="datatable"><thead><tr><th>Empresa</th><th>SDR</th><th>Closer</th><th>Ação</th></tr></thead><tbody>'+
 items('leads').filter(x=>x.owner_id===uid).map(l=>'<tr><td>'+E(l.company_name)+'</td><td>'+E(assigned.find(x=>x.lead_id===l.id&&x.role==='SDR')?.assigned_email||'—')+'</td><td>'+E(assigned.find(x=>x.lead_id===l.id&&x.role==='CLOSER')?.assigned_email||'—')+'</td><td><button class="btn outline sm" data-role="assign:'+l.id+'">Distribuir</button></td></tr>').join('')+'</tbody></table></div>':'<div class="feature-empty">Cadastre leads para fazer a distribuição.</div>')+'</div>';
}
export function teamButton(l){return C&&roleIdentity()==='GESTAO'&&l.owner_id===C.state.user.id?'<button class="btn outline sm" data-role="assign:'+l.id+'">Distribuir SDR / Closer</button>':''}
// cria a conta (ou gera senha nova) pela função jadem-usuarios do Supabase
async function contas(acao,email,nome){
 const r=await C.db.functions.invoke('jadem-usuarios',{body:{acao,email,nome}});
 let j=r.data;if(r.error){try{j=await r.error.context?.json()}catch(e){}}
 if(!j||!j.ok)throw Error(j?.erro||r.error?.message||'Não foi possível criar a conta.');
 return j;
}
export function rolesOverlay(){
 if(!modal)return '';
 if(modal.type==='senha')return '<div class="featureoverlay"><div class="featuremodal"><div class="featureheader"><h2>Senha temporária</h2><button class="btn neutral sm" data-role="close">Fechar</button></div><div class="featurebody">'
  +'<p>Envie para a pessoa o endereço do JADEM, o login <strong>'+E(mostrarLogin(modal.email))+'</strong> e esta senha. No primeiro acesso o JADEM pede para trocar por uma senha da pessoa.</p>'
  +'<div class="flexrow" style="margin:16px 0"><code style="font:800 22px ui-monospace,Consolas,monospace;letter-spacing:2px;background:#f1f5f9;border-radius:10px;padding:12px 16px;user-select:all">'+E(modal.senha)+'</code><button class="btn primary sm" data-role="copiar">Copiar</button></div>'
  +'<p class="note">Esta senha não aparece de novo. Se perder, use "Nova senha" na lista de usuários.</p></div></div></div>';
 let fields='',title='';
 if(modal.type==='new'){title='Novo usuário';const ops=items('clientOperations').filter(o=>o.owner_id===C.state.user.id).map(o=>[o.id,o.name]);
 fields=C.inp('display_name','Nome','','text',true,true)+C.inp('member_email','Usuário ou e-mail','','text',true,true)+C.sel('role','Tipo de usuário',[['SDR','SDR — prospecção e agendamento'],['CLOSER','Closer — fechamento'],['CLIENTE','Cliente — painel de números da operação'],['IA','Escritório IA — login das IAs do escritório']],'SDR',true)
 +C.sel('operation_id','Operação (obrigatória para Cliente)',ops,'',true)
 +'<p class="note" style="grid-column:1/-1;margin:0">'+(ops.length?'':'Para criar um usuário Cliente, cadastre antes a operação em Operações dos Clientes. ')+'SDR, Closer e Escritório IA ignoram a operação.</p>'}
 else{
 const lead=items('leads').find(x=>x.id===modal.id);if(!lead)return '';
 title='Distribuir: '+lead.company_name;
 const people=items('roster').filter(x=>x.owner_id===C.state.user.id&&x.active),current=items('assignments').filter(x=>x.lead_id===lead.id);
 const choices=r=>people.filter(x=>x.role===r).map(x=>[x.member_email,(x.display_name||x.member_email)+' — '+x.member_email]);
 fields=C.sel('sdr','SDR',choices('SDR'),current.find(x=>x.role==='SDR')?.assigned_email||'',true)+C.sel('closer','Closer',[...choices('CLOSER'),[C.state.user.email,'Eu (Gestão / Closer)']],current.find(x=>x.role==='CLOSER')?.assigned_email||'',true);
 }
 return '<div class="featureoverlay"><div class="featuremodal"><div class="featureheader"><h2>'+E(title)+'</h2><button class="btn neutral sm" data-role="close">Fechar</button></div><div class="featurebody"><form id="rolesForm" class="featureform"><div class="formgrid">'+fields+'</div><div class="formfooter"><button type="button" class="btn neutral" data-role="close">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form></div></div></div>';
}
async function submitted(e){
 if(e.target.id!=='rolesForm')return;e.preventDefault();e.stopPropagation();
 const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
 try{
 if(roleIdentity()!=='GESTAO')throw Error('Sem permissão');
 const v=Object.fromEntries(new FormData(e.target).entries()),uid=C.state.user.id;let conta=null;
 if(modal.type==='new'){
  const bruto=val(v.member_email),mail=paraEmail(bruto);if(!(bruto.includes('@')?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail):usuarioValido(bruto))||mail===me())throw Error('Use um e-mail ou um usuário de 3 a 31 letras sem acento, números, ponto ou hífen.');
  if(!items('roster').some(x=>x.owner_id===uid&&val(x.member_email)===me())){const x=await C.db.from('jadem_team_roster').insert({owner_id:uid,member_email:me(),display_name:'Gestor principal',role:'GESTAO'});if(x.error&&x.error.code!=='23505')throw x.error}
  if(!ROLE_LABEL[v.role]||v.role==='GESTAO')throw Error('Escolha o tipo de usuário.');
  if(v.role==='CLIENTE'&&!v.operation_id)throw Error('Escolha a operação do cliente.');
  if(items('roster').some(x=>x.owner_id===uid&&val(x.member_email)===mail))throw Error('Este usuário (ou e-mail) já está na equipe. Desative e ative pela lista, se precisar.');
  conta=await contas('criar',mail,v.display_name.trim());
  const x=await C.db.from('jadem_team_roster').insert({owner_id:uid,member_email:mail,display_name:v.display_name.trim(),role:v.role,operation_id:v.role==='CLIENTE'?v.operation_id:null});if(x.error)throw x.error;
 }else{
  const lead=items('leads').find(x=>x.id===modal.id);if(!lead||lead.owner_id!==uid)throw Error('Sem acesso ao lead');
  for(const [role,key] of [['SDR','sdr'],['CLOSER','closer']]){
   const found=items('assignments').find(x=>x.lead_id===lead.id&&x.role===role),mail=val(v[key]);let q;
   if(found&&!mail)q=C.db.from('jadem_lead_assignments').delete().eq('id',found.id);
   else if(found&&mail!==val(found.assigned_email))q=C.db.from('jadem_lead_assignments').update({assigned_email:mail}).eq('id',found.id);
   else if(!found&&mail)q=C.db.from('jadem_lead_assignments').insert({owner_id:uid,lead_id:lead.id,role,assigned_email:mail});
   if(q){const r=await q;if(r.error)throw r.error}
  }
 }
 const novo=modal.type==='new'?conta:null;
 modal=novo&&novo.senha?{type:'senha',email:novo.email,senha:novo.senha}:null;await C.load();
 C.toast(novo&&novo.existe?'Essa pessoa já tinha conta: foi adicionada e entra com a senha dela.':'Equipe salva.');
 }catch(err){C.toast(err.message||'Falha ao salvar');console.warn(err)}finally{btn.disabled=false}
}
async function changed(e){
 if(e.target.id==='rolePeriod'){windowPeriod=e.target.value;C.render();return}
 const id=e.target.dataset.roleStatus||e.target.dataset.roleResult;if(!id)return;
 const meeting=items('meetings').find(x=>x.id===id);if(!meeting)return;
 const field=e.target.dataset.roleStatus?'status':'result',before=meeting[field];let v={[field]:e.target.value};
 if(field==='status'&&v.status!=='Realizada')v.result='Pendente';
 if(field==='result'&&meeting.status!=='Realizada'){C.toast('Marque como Realizada antes de informar resultado.');e.target.value=before;return}
 const r=await C.db.from('jadem_lead_meetings').update(v).eq('id',id);
 if(r.error){e.target.value=before;C.toast(r.error.message)}else{await C.load();C.toast('Reunião atualizada.')}
}
async function clicked(e){
 const target=e.target.closest('[data-role-go]');if(target){C.state.view=target.dataset.roleGo.toLowerCase();C.render();return}
 const b=e.target.closest('[data-role]');if(!b)return;const action=b.dataset.role;
 if(action==='close'){modal=null;C.render();return}
 if(action==='team'||action==='calendar'){C.state.view=action;C.render();return}
 if(action==='painel'){painel=null;funil=null;C.render();return}
 if(action==='zoom-'||action==='zoom+'||action==='zoom0'){mudarZoom(action);return}
 if(action==='rolar-'||action==='rolar+'){document.querySelectorAll('.cl-rolagem').forEach(k=>k.scrollBy({left:(action==='rolar+'?1:-1)*k.clientWidth*.8}));return}
 if(action==='copiar'&&modal?.senha){try{await navigator.clipboard.writeText(modal.senha);C.toast('Senha copiada.')}catch(e){C.toast('Selecione a senha e copie.')}return}
 if(roleIdentity()!=='GESTAO')return;
 if(action==='new'){modal={type:'new'};C.render()}
 else if(action.startsWith('assign:')){modal={type:'assign',id:action.split(':')[1]};C.render()}
 else if(action.startsWith('senha:')){
  const x=items('roster').find(z=>z.id===action.split(':')[1]);if(!x)return;
  if(!confirm('Gerar uma senha temporária para '+x.member_email+'? Se ela já tinha senha, a antiga deixa de funcionar.'))return;
  b.disabled=true;
  // quem foi adicionado antes da criação automática ainda não tem conta: cria agora
  try{let j=await contas('criar',val(x.member_email),x.display_name||'');if(!j.senha)j=await contas('resetar',val(x.member_email));modal={type:'senha',email:j.email,senha:j.senha};C.render()}
  catch(err){C.toast(err.message)}finally{b.disabled=false}
 }
 else if(action.startsWith('toggle:')){
  const x=items('roster').find(z=>z.id===action.split(':')[1]);if(!x||val(x.member_email)===me())return;
  const r=await C.db.from('jadem_team_roster').update({active:!x.active}).eq('id',x.id);if(r.error)C.toast(r.error.message);else await C.load();
 }
}

/* ===========================================================
   Cliente: funil de vendas e acompanhamento dos leads da operação.
   Vem da função jadem_funil_cliente() (004_cliente_funil.sql): sem
   telefone, e-mail, CNPJ, endereço, nome do decisor nem anotações.
   =========================================================== */
const ETAPAS=['Novo lead','Pesquisa e enriquecimento','Prospecção iniciada','Contato estabelecido','Em qualificação','Qualificado','Reunião agendada','Reunião realizada','Proposta enviada','Negociação','Fechado — ganho','Fechado — perdido'];
const ETAPAS_NEGOCIO=['Novo','Contato','Qualificado','Proposta','Negociação','Ganho','Perdido'];
const POR_COLUNA=30;
let funil=null,funilCarregando=false;
async function carregarFunil(){
 funilCarregando=true;const r=await C.db.rpc('jadem_funil_cliente');funilCarregando=false;
 funil=r.error?{erro:/jadem_funil_cliente|PGRST202|does not exist/i.test(r.error.message+(r.error.code||''))?'o acompanhamento ainda não foi liberado pela Mioli':r.error.message}:(r.data||[]);C.render();
}
const dias=t=>{if(!t)return null;const d=Math.floor((Date.now()-new Date(t).getTime())/864e5);return d<=0?'hoje':d===1?'há 1 dia':'há '+d+' dias'};
const dataCurta=t=>t?C.fmt(t,{day:'2-digit',month:'short'}):'—';
const reais=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(x)||0);
function corInteresse(i){return i==='Alto'?'#0f7b4d':i==='Médio'?'#a86700':i==='Baixo'?'#64748b':i==='Sem interesse'?'#b42318':'#94a3b8'}
function cartaoLead(l){
 return '<div class="dealcard" title="'+E(l.etapa)+'"><strong>'+E(l.empresa)+'</strong>'
  +'<div class="companyname">'+E([l.cidade,l.segmento].filter(Boolean).join(' · ')||'—')+'</div>'
  +'<div class="note" style="margin:6px 0 0"><span style="color:'+corInteresse(l.interesse)+';font-weight:700">● '+E(l.interesse||'Não avaliado')+'</span> · '+E(dias(l.etapa_desde)?'nesta etapa '+dias(l.etapa_desde):'')+'</div>'
  +(l.proximo_passo?'<div class="note" style="margin:4px 0 0">Próximo: '+E(l.proximo_passo)+(l.proximo_em?' · '+E(dataCurta(l.proximo_em)):'')+'</div>':'')+'</div>';
}
function telaFunil(o){
 const L=o.leads||[],N=o.negocios||[];
 let h='<div class="sectionhead" style="padding:0 0 12px;border:0"><h2>'+E(o.operacao)+'</h2><span>'+E(L.length)+' leads · atualizado '+C.fmt(o.atualizado_em,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</span></div>'
  +'<div class="cl-rolagem"><div class="kanban cl-kanban" style="'+estiloZoom()+'">'+ETAPAS.map(st=>{const da=L.filter(l=>l.etapa===st);return '<div class="kanbancol"><div class="kanbanhead">'+E(st)+' <span class="num">'+da.length+'</span></div>'
   +da.slice(0,POR_COLUNA).map(cartaoLead).join('')
   +(da.length>POR_COLUNA?'<p class="muted" style="text-align:center;margin:12px 4px">+ '+(da.length-POR_COLUNA)+' nesta etapa · veja todos em Painel da operação</p>':'')
   +(da.length?'':'<p class="muted" style="text-align:center;margin:22px 4px">Sem leads</p>')+'</div>'}).join('')+'</div></div>';
 if(N.length)h+='<div class="sectionhead" style="padding:22px 0 12px;border:0"><h2>Negócios</h2><span>'+E(N.length)+' · '+E(reais(N.filter(d=>d.etapa!=='Perdido').reduce((s,d)=>s+Number(d.valor||0),0)))+' em aberto e ganhos</span></div>'
  +'<div class="cl-rolagem"><div class="kanban cl-kanban" style="'+estiloZoom()+'">'+ETAPAS_NEGOCIO.map(st=>{const da=N.filter(d=>d.etapa===st);return '<div class="kanbancol"><div class="kanbanhead">'+E(st)+' <span class="num">'+da.length+'</span></div>'
   +da.map(d=>'<div class="dealcard"><strong>'+E(d.titulo)+'</strong><div class="companyname">'+E(d.empresa||'—')+'</div><div class="dealamount">'+E(reais(d.valor))+'</div>'+(d.previsao?'<div class="note" style="margin:4px 0 0">Previsão: '+E(dataCurta(d.previsao))+'</div>':'')+'</div>').join('')
   +(da.length?'':'<p class="muted" style="text-align:center;margin:22px 4px">Sem negócios</p>')+'</div>'}).join('')+'</div></div>';
 return h;
}
export function clientFunil(){
 if(roleIdentity()!=='CLIENTE')return C.title('Acesso restrito','Esta visão é dos usuários do tipo Cliente.');
 if(!funil&&!funilCarregando)carregarFunil();
 const topo=C.title('Funil de vendas','Onde está cada lead da sua operação, da prospecção ao fechamento.','<button class="btn outline" data-role="painel">'+C.ic('activity')+' Atualizar</button>')+barraQuadro();
 if(!funil)return topo+'<div class="card module"><p>Carregando o funil…</p></div>';
 return funilPronto(topo);
}
// a barra do quadro (setas e zoom): no funil do cliente e no do Admin
export function barraQuadro(){
 return '<div class="cl-barra"><span class="note" style="margin:0 auto 0 0">Arraste o quadro para os lados ou use as setas.</span>'
  +'<button class="btn outline sm" data-role="rolar-" title="Voltar etapas" aria-label="Voltar etapas">‹</button><button class="btn outline sm" data-role="rolar+" title="Avançar etapas" aria-label="Avançar etapas">›</button>'
  +'<span class="cl-sep"></span><button class="btn outline sm" data-role="zoom-" title="Diminuir" aria-label="Diminuir o zoom">−</button><button class="btn outline sm" data-role="zoom0" title="Tamanho normal" data-cl-zoom>'+Math.round(zoom*100)+'%</button><button class="btn outline sm" data-role="zoom+" title="Aumentar" aria-label="Aumentar o zoom">+</button></div>';
}
function funilPronto(topo){
 if(funil.erro)return topo+'<div class="notice">Não foi possível carregar o funil: '+E(funil.erro)+'.</div>';
 if(!funil.length)return topo+'<div class="card module"><h2>Nenhuma operação liberada</h2><p>Seu acesso ainda não foi ligado a uma operação. Fale com a Mioli Consultoria.</p></div>';
 return topo+funil.map(telaFunil).join('')+'<p class="note">Os leads e negócios são atualizados pela equipe da Mioli. Telefones, e-mails e anotações ficam com a equipe.</p>';
}
// Painel da operação: lista para acompanhar cada lead, com busca e etapa
function acompanharLeads(){
 if(!funil&&!funilCarregando)carregarFunil();
 if(!funil)return '<div class="card module" style="margin-bottom:18px"><p>Carregando os leads…</p></div>';
 if(funil.erro)return '<div class="notice" style="margin-bottom:18px">Acompanhamento dos leads: '+E(funil.erro)+'.</div>';
 return funil.map(o=>{const L=o.leads||[];if(!L.length)return '';
  return '<div class="card" style="margin-bottom:22px"><div class="sectionhead"><h2>Acompanhar leads · '+E(o.operacao)+'</h2><span data-cl-conta>'+L.length+' leads</span></div><div class="cardbody">'
   +'<div class="flexrow" style="gap:10px;flex-wrap:wrap;margin-bottom:12px"><input data-cl-busca placeholder="Buscar empresa, cidade ou segmento" style="flex:1;min-width:200px;padding:10px 12px;border:1px solid #dbe3ec;border-radius:10px;font:inherit">'
   +'<select data-cl-etapa style="padding:10px 12px;border:1px solid #dbe3ec;border-radius:10px;font:inherit"><option value="">Todas as etapas</option>'+ETAPAS.map(s=>'<option>'+E(s)+'</option>').join('')+'</select></div>'
   +'<div class="tablewrap"><table class="datatable"><thead><tr><th>Empresa</th><th>Cidade</th><th>Etapa</th><th>Interesse</th><th>Última interação</th><th>Próximo passo</th></tr></thead><tbody>'
   +L.map(l=>'<tr data-cl-linha data-etapa="'+E(l.etapa)+'" data-busca="'+E([l.empresa,l.cidade,l.segmento].join(' ').toLowerCase())+'"><td><strong>'+E(l.empresa)+'</strong><div class="note" style="margin:2px 0 0">'+E(l.segmento||'')+'</div></td><td>'+E(l.cidade||'—')+'</td><td>'+E(l.etapa)+'<div class="note" style="margin:2px 0 0">'+E(dias(l.etapa_desde)||'')+'</div></td>'
    +'<td><span style="color:'+corInteresse(l.interesse)+';font-weight:700">● '+E(l.interesse||'Não avaliado')+'</span></td><td>'+E(l.ultima_interacao?dataCurta(l.ultima_interacao)+' · '+dias(l.ultima_interacao):'—')+'</td><td>'+E(l.proximo_passo||'—')+(l.proximo_em?'<div class="note" style="margin:2px 0 0">'+E(dataCurta(l.proximo_em))+'</div>':'')+'</td></tr>').join('')
   +'</tbody></table></div></div></div>'}).join('');
}
// a busca e a etapa filtram a tabela na hora, sem redesenhar a página
function filtrarLeads(e){
 if(!e.target.matches||!e.target.matches('[data-cl-busca],[data-cl-etapa]'))return;
 const card=e.target.closest('.card'),q=val(card.querySelector('[data-cl-busca]').value),et=card.querySelector('[data-cl-etapa]').value;let n=0;
 card.querySelectorAll('[data-cl-linha]').forEach(tr=>{const ok=(!et||tr.dataset.etapa===et)&&(!q||tr.dataset.busca.includes(q));tr.hidden=!ok;if(ok)n++});
 card.querySelector('[data-cl-conta]').textContent=n+' leads';
}

/* zoom do funil do cliente (fica guardado neste navegador) e arrastar o quadro com o mouse */
const ZOOMS=[.5,.6,.7,.8,.9,1,1.1,1.25];
let zoom=1;try{const z=Number(localStorage.getItem('jadem-funil-zoom'));if(ZOOMS.includes(z))zoom=z}catch(e){}
// a altura das colunas compensa o zoom, para o quadro caber na tela e a barra para os lados ficar à vista
function estiloZoom(){const alt=Math.max(320,Math.round(((typeof innerHeight==='number'?innerHeight:900)-300)/zoom));return 'zoom:'+zoom+';--cl-alt:'+alt+'px'}
function mudarZoom(a){
 const i=ZOOMS.indexOf(zoom);zoom=a==='zoom0'?1:ZOOMS[Math.max(0,Math.min(ZOOMS.length-1,i+(a==='zoom+'?1:-1)))];
 try{localStorage.setItem('jadem-funil-zoom',String(zoom))}catch(e){}
 const st=estiloZoom();document.querySelectorAll('.cl-kanban').forEach(k=>{k.setAttribute('style',st)});
 document.querySelectorAll('[data-cl-zoom]').forEach(b=>{b.textContent=Math.round(zoom*100)+'%'});
}
function arrastarQuadro(){
 let a=null;
 document.addEventListener('mousedown',e=>{const k=e.target.closest&&e.target.closest('.cl-rolagem');if(!k||e.button!==0||e.target.closest('button,a,input,select'))return;a={k,x:e.clientX,l:k.scrollLeft,moveu:false};k.classList.add('arrastando')});
 document.addEventListener('mousemove',e=>{if(!a)return;const dx=e.clientX-a.x;if(Math.abs(dx)>3)a.moveu=true;if(a.moveu){a.k.scrollLeft=a.l-dx;e.preventDefault()}});
 document.addEventListener('mouseup',()=>{if(a){a.k.classList.remove('arrastando');a=null}});
}
export {estiloZoom};
