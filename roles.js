
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
 CLIENTE:'A empresa que contratou a Mioli. Vê só o painel de números da operação dela, sem a lista de leads.',
 IA:'O login das IAs do escritório (Jarvis, Secretária, Diretor Comercial, Eloá). Lê tudo; cria e altera leads, tarefas, reuniões e ligações; não apaga nada.'};
export const roleLabel=r=>ROLE_LABEL[r||roleIdentity()]||r;
const VIEWS={SDR:['sdr','leads','calendar','tasks','activities','settings','connect','send','warmup','callQueue'],
 CLOSER:['closer','leads','calendar','tasks','activities','settings','deals','callQueue'],
 CLIENTE:['cliente','settings'],
 IA:['dashboard','clientOperations','companies','leads','people','deals','callQueue','tasks','calendar','activities','reports','notifications','settings']};
export function roleCanView(v){
 const r=roleIdentity();if(r==='GESTAO')return v!=='cliente';
 return (VIEWS[r]||VIEWS.SDR).includes(v);
}
export function roleHome(){const r=roleIdentity();return r==='SDR'?'sdr':r==='CLOSER'?'closer':r==='CLIENTE'?'cliente':r==='IA'?'leads':'gestao'}
export function roleAutoView(){if(C.state.view==='dashboard'||!roleCanView(C.state.view))C.state.view=roleHome()}
export function setupRoles(ctx){C=ctx;document.addEventListener('click',clicked);document.addEventListener('submit',submitted);document.addEventListener('change',changed)}
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
  +'<p class="note">Você vê só os números consolidados. Os dados dos contatos ficam com a equipe da Mioli.</p>';
}
const opName=id=>items('clientOperations').find(o=>o.id===id)?.name||'—';
// cartão de Usuários nas Configurações (só o Admin)
export function usersCard(){
 if(roleIdentity()!=='GESTAO')return '';
 const uid=C.state.user.id,people=items('roster').filter(x=>x.owner_id===uid&&val(x.member_email)!==me());
 const tipos=['SDR','CLOSER','CLIENTE','IA'];
 return '<div class="card" style="margin-top:18px"><div class="sectionhead"><h2>Usuários e acessos</h2><div class="flexrow"><button class="btn outline sm" data-role="team">'+C.ic('users')+' Equipe e distribuição</button><button class="btn primary sm" data-role="new">'+C.ic('plus')+' Adicionar usuário</button></div></div>'
 +'<div class="cardbody"><div class="grid4" style="margin-bottom:8px">'+tipos.map(t=>'<div><strong style="font-size:12px;color:#27384e">'+E(ROLE_LABEL[t])+' · '+people.filter(x=>x.role===t&&x.active).length+'</strong><p class="note" style="margin:6px 0 0">'+E(ROLE_INFO[t])+'</p></div>').join('')+'</div>'
 +(people.length?'<div class="tablewrap"><table class="datatable"><thead><tr><th>Nome</th><th>E-mail</th><th>Tipo</th><th>Operação</th><th>Ativo</th></tr></thead><tbody>'+people.map(r=>'<tr><td>'+E(r.display_name||'—')+'</td><td>'+E(r.member_email)+'</td><td>'+C.badge(ROLE_LABEL[r.role]||r.role)+'</td><td>'+E(r.role==='CLIENTE'?opName(r.operation_id):'—')+'</td><td><div class="flexrow"><button class="btn outline sm" data-role="toggle:'+r.id+'">'+(r.active?'Sim · Desativar':'Não · Ativar')+'</button><button class="btn outline sm" data-role="senha:'+r.id+'">Nova senha</button></div></td></tr>').join('')+'</tbody></table></div>':'<div class="feature-empty">Nenhum usuário adicionado ainda.</div>')
 +'<p class="note" style="margin-top:12px">Ao adicionar, o JADEM cria a conta com uma senha temporária e mostra a senha para você enviar à pessoa. No primeiro acesso ela troca por uma senha dela. Se a pessoa já tinha conta, ela só é adicionada e continua com a senha dela.</p></div></div>';
}
export function teamView(){
 if(roleIdentity()!=='GESTAO')return C.title('Equipe','Apenas Gestão pode gerenciar colaboradores.');
 const uid=C.state.user.id,people=items('roster').filter(x=>x.owner_id===uid),assigned=items('assignments').filter(x=>x.owner_id===uid);
 return C.title('Gestão de equipe','Colaboradores e distribuição de leads por responsável.','<button class="btn primary" data-role="new">'+C.ic('plus')+' Adicionar usuário</button>')
 +'<div class="notice">Ao adicionar um usuário, o JADEM cria a conta com uma senha temporária para você enviar; no primeiro acesso a pessoa troca. SDR e Closer visualizam apenas os leads atribuídos.</div>'
 +'<div class="grid4" style="margin-bottom:18px">'+card('Colaboradores',people.filter(x=>x.active).length)+card('SDRs',people.filter(x=>x.role==='SDR'&&x.active).length)+card('Closers',people.filter(x=>x.role==='CLOSER'&&x.active).length)+card('Distribuições',assigned.length)+'</div>'
 +'<div class="card"><div class="sectionhead"><h2>Equipe</h2></div>'+(people.length?'<div class="tablewrap"><table class="datatable"><thead><tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Ativo</th></tr></thead><tbody>'+people.map(r=>'<tr><td>'+E(r.display_name||'—')+'</td><td>'+E(r.member_email)+'</td><td>'+E(ROLE_LABEL[r.role]||r.role)+(r.role==='CLIENTE'?' · '+E(opName(r.operation_id)):'')+'</td><td>'+((val(r.member_email)===me()&&r.role==='GESTAO')?'Gestor principal':'<button class="btn outline sm" data-role="toggle:'+r.id+'">'+(r.active?'Sim · Desativar':'Não · Ativar')+'</button>')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="feature-empty">Nenhum colaborador adicionado.</div>')+'</div>'
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
  +'<p>Envie para <strong>'+E(modal.email)+'</strong> o endereço do JADEM e esta senha. No primeiro acesso o JADEM pede para trocar por uma senha da pessoa.</p>'
  +'<div class="flexrow" style="margin:16px 0"><code style="font:800 22px ui-monospace,Consolas,monospace;letter-spacing:2px;background:#f1f5f9;border-radius:10px;padding:12px 16px;user-select:all">'+E(modal.senha)+'</code><button class="btn primary sm" data-role="copiar">Copiar</button></div>'
  +'<p class="note">Esta senha não aparece de novo. Se perder, use "Nova senha" na lista de usuários.</p></div></div></div>';
 let fields='',title='';
 if(modal.type==='new'){title='Novo usuário';const ops=items('clientOperations').filter(o=>o.owner_id===C.state.user.id).map(o=>[o.id,o.name]);
 fields=C.inp('display_name','Nome','','text',true,true)+C.inp('member_email','E-mail','','email',true,true)+C.sel('role','Tipo de usuário',[['SDR','SDR — prospecção e agendamento'],['CLOSER','Closer — fechamento'],['CLIENTE','Cliente — painel de números da operação'],['IA','Escritório IA — login das IAs do escritório']],'SDR',true)
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
  const mail=val(v.member_email);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)||mail===me())throw Error('E-mail inválido ou já é gestor.');
  if(!items('roster').some(x=>x.owner_id===uid&&val(x.member_email)===me())){const x=await C.db.from('jadem_team_roster').insert({owner_id:uid,member_email:me(),display_name:'Gestor principal',role:'GESTAO'});if(x.error&&x.error.code!=='23505')throw x.error}
  if(!ROLE_LABEL[v.role]||v.role==='GESTAO')throw Error('Escolha o tipo de usuário.');
  if(v.role==='CLIENTE'&&!v.operation_id)throw Error('Escolha a operação do cliente.');
  if(items('roster').some(x=>x.owner_id===uid&&val(x.member_email)===mail))throw Error('Este e-mail já está na equipe. Desative e ative pela lista, se precisar.');
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
 if(action==='painel'){painel=null;C.render();return}
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
