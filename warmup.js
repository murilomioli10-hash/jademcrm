
let C;
const rec=k=>C.state.data[k]||[];
const safe=s=>C.esc(s??'');
const accountFor=slot=>rec('whatsappAccounts').find(x=>x.slot===slot);
const checksFor=id=>rec('whatsappChecks').filter(x=>x.account_id===id);
const sevenDays=()=>Date.now()-7*86400000;
const formatDate=s=>s?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(s)):'—';
const phoneNum=s=>String(s||'').replace(/\D/g,'');
const statuses=['A configurar','Em teste','Operacional','Restrito'];
function card(slot){
 const a=accountFor(slot),tests=a?checksFor(a.id):[],ok=tests.filter(x=>x.result==='OK'&&Date.parse(x.created_at)>=sevenDays());
 const sent=ok.some(x=>x.direction==='Envio real'),received=ok.some(x=>x.direction==='Recebimento real');
 const number=a?.phone||'',status=a?.status||'A configurar';
 const options=statuses.map(s=>'<option '+(status===s?'selected':'')+' value="'+safe(s)+'">'+safe(s)+'</option>').join('');
 const alerts=(sent&&received)?'Envio e recebimento reais registrados nesta semana.':'Registre os testes reais para confirmar o funcionamento.';
 return '<article class="warmup-account">'+
 '<div class="warmup-account-top"><div class="warmup-number">'+slot+'</div><div><h3>'+safe(a?.label||'WhatsApp '+slot)+'</h3><small>'+safe(number?('+'+number):'Número não cadastrado')+'</small></div>'+
 '<span class="warmup-tag '+(status==='Operacional'?'ok':status==='Restrito'?'bad':'')+'">'+safe(status)+'</span></div>'+
 '<div class="warmup-verifications"><span class="'+(sent?'verified':'')+'">✓ Envio real</span><span class="'+(received?'verified':'')+'">✓ Recebimento real</span></div>'+
 '<p class="warmup-help">'+safe(alerts)+'</p>'+
 '<form class="warmup-form" data-warmup-slot="'+slot+'">'+
 '<label>Identificação<input name="label" type="text" minlength="2" maxlength="80" placeholder="WhatsApp '+slot+'" required value="'+safe(a?.label||('WhatsApp '+slot))+'"></label>'+
 '<label>Telefone com DDI e DDD<input name="phone" type="tel" placeholder="5511999999999" required value="'+safe(number)+'"></label>'+
 '<label>Situação<select name="status">'+options+'</select></label>'+
 '<button class="btn primary sm" type="submit">Salvar número</button></form>'+
 '<div class="warmup-controls">'+
 (a?'<button class="btn outline sm" type="button" data-warmup-check="'+slot+'" data-direction="Envio real">Registrar envio</button>'+
 '<button class="btn outline sm" type="button" data-warmup-check="'+slot+'" data-direction="Recebimento real">Registrar recebimento</button>'+
 '<button class="btn outline sm" type="button" data-warmup-check="'+slot+'" data-direction="Conexão">Registrar conexão</button>':'')+
 '<a class="btn neutral sm" href="https://web.whatsapp.com/" target="_blank" rel="noopener noreferrer">WhatsApp Web ↗</a></div>'+
 '<div class="warmup-account-foot">'+tests.length+' testes registrados'+(tests.length?' • último: '+safe(formatDate(tests.slice().sort((x,y)=>Date.parse(y.created_at)-Date.parse(x.created_at))[0].created_at)):'')+'</div>'+
 '</article>';
}
export function warmupView(){
 const records=rec('whatsappAccounts'),tests=rec('whatsappChecks'),configured=records.filter(x=>x.phone).length,restricted=records.filter(x=>x.status==='Restrito').length;
 const metrics='<div class="grid4">'+
 '<div class="card kpi"><div class="metric-label">WhatsApps disponíveis</div><div class="metric-value">5</div></div>'+
 '<div class="card kpi"><div class="metric-label">Cadastrados</div><div class="metric-value">'+configured+'</div></div>'+
 '<div class="card kpi"><div class="metric-label">Em observação</div><div class="metric-value">'+(5-restricted)+'</div></div>'+
 '<div class="card kpi"><div class="metric-label">Testes esta semana</div><div class="metric-value">'+tests.filter(x=>Date.parse(x.created_at)>=sevenDays()).length+'</div></div></div>';
 const history=tests.slice().sort((x,y)=>Date.parse(y.created_at)-Date.parse(x.created_at)).slice(0,30);
 return C.title('Aquecimento • 5 WhatsApps','Acompanhe contas próprias com testes reais e histórico operacional.')+
 '<div class="warmup-intro"><div><strong>Preparação e acompanhamento de 5 contas</strong><p>Esta área não cria conversas simuladas. Registre contatos legítimos, testes reais de envio e recebimento e eventuais restrições. Nenhum número é conectado ou aquecido automaticamente.</p></div><a class="btn primary sm" target="_blank" rel="noopener noreferrer" href="https://web.whatsapp.com/">Abrir WhatsApp Web ↗</a></div>'+
 metrics+'<div class="warmup-grid">'+[1,2,3,4,5].map(card).join('')+'</div>'+
 '<div class="card warmup-history"><div class="sectionhead"><h2>Histórico de testes</h2><span>'+tests.length+' registros</span></div>'+
 (history.length?history.map(x=>'<div class="warmup-history-row"><b>'+safe(records.find(a=>a.id===x.account_id)?.label||'WhatsApp')+'</b><span>'+safe(x.direction)+' · '+safe(x.result)+'</span><small>'+safe(formatDate(x.created_at))+'</small></div>').join(''):'<div class="warmup-empty">Sem testes registrados ainda.</div>')+
 '</div>';
}
async function save(event){
 const form=event.target.closest('form[data-warmup-slot]');
 if(!form)return;
 event.preventDefault();
 const slot=Number(form.dataset.warmupSlot),old=accountFor(slot),fd=new FormData(form);
 const phone=phoneNum(fd.get('phone')),label=String(fd.get('label')||'').trim(),status=String(fd.get('status')||'A configurar');
 if(!/^\d{10,15}$/.test(phone)){C.toast('Informe número com DDI e DDD (10 a 15 dígitos).');return;}
 if(!label||label.length<2||label.length>80||!statuses.includes(status)){C.toast('Confira nome e situação da conta.');return}
 if(rec('whatsappAccounts').some(x=>x.slot!==slot&&x.phone===phone)){C.toast('Este número já está cadastrado em outra posição.');return}
 const payload={owner_id:C.state.user.id,slot,label,phone,status,updated_at:new Date().toISOString()};
 const {error}=await(old?C.db.from('jadem_whatsapp_accounts').update(payload).eq('id',old.id):C.db.from('jadem_whatsapp_accounts').insert(payload));
 if(error){C.toast(error.message);return}
 C.toast('WhatsApp '+slot+' salvo.');await C.load();
}
async function action(event){
 const btn=event.target.closest('[data-warmup-check]');if(!btn)return;
 const slot=Number(btn.dataset.warmupCheck),a=accountFor(slot);if(!a){C.toast('Cadastre o número primeiro.');return}
 const direction=btn.dataset.direction;
 if(!window.confirm('Você realizou este teste de verdade na conta '+a.label+'? Clique em OK apenas se sim.'))return;
 const success=window.confirm('O teste funcionou? OK = Funcionou; Cancelar = Falhou.');
 const details=window.prompt('Observação opcional sobre o teste (não informe dados pessoais):','');
 if(details===null)return;
 const {error}=await C.db.from('jadem_whatsapp_checks').insert({owner_id:C.state.user.id,account_id:a.id,direction,result:success?'OK':'Falha',notes:details.slice(0,1000)});
 if(error){C.toast(error.message);return}
 C.toast('Resultado de teste real salvo.');await C.load();
}
export function setupWarmup(ctx){C=ctx;document.addEventListener('submit',save);document.addEventListener('click',action)}
