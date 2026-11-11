/* ===========================================================
   qualificacao.js — regras comerciais do JADEM (sem tela, sem banco)

   Funil, interesse, situação do decisor, ICP, score e completude.
   Tudo aqui é função pura: recebe o lead e a configuração da operação
   e devolve o resultado com a justificativa. Os pesos são REGRAS DA
   OPERAÇÃO, configuráveis pelo gestor; não são estatística validada.
   =========================================================== */

export const ETAPAS = ['Novo lead', 'Pesquisa e enriquecimento', 'Prospecção iniciada', 'Contato estabelecido',
  'Em qualificação', 'Qualificado', 'Reunião agendada', 'Reunião realizada', 'Proposta enviada', 'Negociação',
  'Fechado — ganho', 'Fechado — perdido'];
export const GANHO = 'Fechado — ganho';
export const PERDIDO = 'Fechado — perdido';
export const ETAPAS_FECHADAS = [GANHO, PERDIDO];
// etapas antigas do JADEM (antes da atualização do funil) -> novas
export const ETAPA_ANTIGA = { 'Novo': 'Novo lead', 'Em contato': 'Prospecção iniciada', 'Qualificado': 'Qualificado',
  'Oportunidade': 'Qualificado', 'Cliente': GANHO, 'Descartado': PERDIDO };
export const etapaAtual = s => ETAPAS.includes(s) ? s : (ETAPA_ANTIGA[s] || 'Novo lead');

export const INTERESSES = ['Não avaliado', 'Baixo', 'Médio', 'Alto', 'Sem interesse'];
export const DECISOR = ['Não identificado', 'Identificado', 'Contato estabelecido', 'Autoridade confirmada'];
export const TEL_STATUS = ['Não informado', 'Encontrado', 'Validado', 'Inválido'];
export const ZAP_STATUS = ['Não confirmado', 'Confirmado'];

const txt = v => String(v == null ? '' : v).trim();
export const semAcento = v => txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soDigitos = v => txt(v).replace(/\D/g, '');

/* ---------------- configuração por operação ---------------- */
export const CONFIG_PADRAO = {
  cnaes: [],            // ['8630503', ...] (só dígitos)
  segmentos: [],        // palavras que indicam o segmento-alvo
  especialidades: [],   // palavras que indicam especialidade identificada
  ufs: [],              // vazio = Brasil inteiro
  pesos: { cnae: 30, segmento: 25, especialidade: 25, regiao: 10, privado: 10 },
  limites: { A: 70 },   // aderência mínima (%) para sugerir ICP A
  score: { icp: 50, engajamento: 50 },
  tarefa_pesquisa: true,
  followup: true,
  dias_parado: 7,
};

export const MODELO_MARKETING_MEDICO = {
  nome: 'Marketing médico (Cazado Marketing)',
  publico: 'Médicos especialistas e clínicas particulares. Brasil inteiro; atendimento por região e serviço sujeito a validação.',
  cnaes: ['8630503', '8630502', '8630501'],
  cnaes_rotulos: {
    '8630503': 'Atividade médica ambulatorial restrita a consultas',
    '8630502': 'Atividade médica ambulatorial com recursos para exames complementares',
    '8630501': 'Atividade médica ambulatorial com recursos para procedimentos cirúrgicos',
  },
  segmentos: ['medic', 'clinica', 'consultorio', 'saude', 'hospital dia', 'instituto'],
  especialidades: ['dermatolog', 'cardiolog', 'ortoped', 'oftalmolog', 'ginecolog', 'obstetr', 'urolog', 'pediatr',
    'neurolog', 'endocrinolog', 'gastro', 'otorrino', 'psiquiatr', 'oncolog', 'cirurgia plastica', 'plastica',
    'reumatolog', 'pneumolog', 'nefrolog', 'angiolog', 'vascular', 'mastolog', 'proctolog', 'geriatr', 'nutrolog',
    'medicina esportiva', 'fisiatr', 'hematolog', 'infectolog', 'alergolog', 'radiolog', 'anestesiolog',
    'medicina estetica', 'tricolog', 'olhos', 'coluna', 'joelho', 'ombro', 'mao', 'pe e tornozelo'],
  ufs: [],
  pesos: { cnae: 30, segmento: 25, especialidade: 25, regiao: 10, privado: 10 },
  limites: { A: 70 },
  score: { icp: 50, engajamento: 50 },
};

export function configDa(op) {
  const c = (op && op.commercial_config) || {};
  return {
    ...CONFIG_PADRAO, ...c,
    pesos: { ...CONFIG_PADRAO.pesos, ...(c.pesos || {}) },
    limites: { ...CONFIG_PADRAO.limites, ...(c.limites || {}) },
    score: { ...CONFIG_PADRAO.score, ...(c.score || {}) },
    cnaes: (c.cnaes || []).map(soDigitos).filter(Boolean),
    segmentos: (c.segmentos || []).map(semAcento).filter(Boolean),
    especialidades: (c.especialidades || []).map(semAcento).filter(Boolean),
    ufs: (c.ufs || []).map(x => txt(x).toUpperCase()).filter(Boolean),
  };
}
export const temRegrasICP = cfg => !!(cfg.cnaes.length || cfg.segmentos.length || cfg.especialidades.length);

/* ---------------- dados do lead ---------------- */
const PUBLICO = /\b(prefeitura|municipio|municipal|secretaria|estado d[eo]|governo|fundacao estadual|autarquia|consorcio intermunicipal|sus)\b/;
const PRIVADO = /\b(ltda|eireli|s\/?a|s\.a\.?|me|epp|sociedade simples|sociedade empresaria|empresario individual|slu|ss)\b/;
export function naturezaPrivada(l) {
  const base = semAcento([l.legal_nature, l.company_name].filter(Boolean).join(' ')).replace(/[.,]/g, ' ');
  if (PUBLICO.test(base)) return 'Não';
  if (PRIVADO.test(' ' + base + ' ')) return 'Sim';
  return 'Não identificado';
}
export function especialidadeDe(l, cfg) {
  if (txt(l.specialty)) return { valor: txt(l.specialty), fonte: 'informada' };
  const nome = semAcento([l.trade_name, l.company_name, l.cnae_description].filter(Boolean).join(' '));
  const achou = cfg.especialidades.find(p => nome.includes(p));
  return achou ? { valor: achou, fonte: 'identificada pelo nome' } : null;
}

/** aderência ao ICP: compatibilidade da empresa com o perfil da operação */
export function aderencia(l, cfg) {
  const p = cfg.pesos, motivos = [];
  let pts = 0, max = 0;
  const cnae = soDigitos(l.cnae);
  const textoSeg = semAcento([l.segment, l.cnae_description, l.trade_name, l.company_name].filter(Boolean).join(' '));
  const cnaeOk = !!cnae && cfg.cnaes.includes(cnae);
  const segOk = cfg.segmentos.some(s => textoSeg.includes(s));
  const esp = especialidadeDe(l, cfg);
  const privado = naturezaPrivada(l);
  const uf = txt(l.state).toUpperCase();
  if (cfg.cnaes.length) {
    max += p.cnae;
    if (cnaeOk) { pts += p.cnae; motivos.push('CNAE ' + l.cnae + ' é prioritário (+' + p.cnae + ')'); }
    else motivos.push(cnae ? 'CNAE ' + l.cnae + ' fora da lista prioritária (+0)' : 'CNAE não informado (+0)');
  }
  if (cfg.segmentos.length) {
    max += p.segmento;
    if (segOk) { pts += p.segmento; motivos.push('Segmento compatível (+' + p.segmento + ')'); }
    else motivos.push('Segmento compatível não identificado (+0)');
  }
  if (cfg.especialidades.length) {
    max += p.especialidade;
    if (esp) { pts += p.especialidade; motivos.push('Especialidade ' + esp.fonte + ': ' + esp.valor + ' (+' + p.especialidade + ')'); }
    else motivos.push('Especialidade não identificada (+0)');
  }
  max += p.regiao;
  if (!cfg.ufs.length) { pts += p.regiao; motivos.push('Abrangência Brasil inteiro (+' + p.regiao + ')'); }
  else if (cfg.ufs.includes(uf)) { pts += p.regiao; motivos.push('UF ' + uf + ' atendida (+' + p.regiao + ')'); }
  else motivos.push(uf ? 'UF ' + uf + ' fora da área definida (+0)' : 'UF não informada (+0)');
  max += p.privado;
  if (privado === 'Sim') { pts += p.privado; motivos.push('Operação privada pela razão social/natureza (+' + p.privado + ')'); }
  else motivos.push(privado === 'Não' ? 'Indício de órgão público (+0)' : 'Natureza privada não identificada (+0)');
  return { pct: max ? Math.round(pts / max * 100) : 0, motivos, cnaeOk, segOk, esp, privado };
}

/** ICP sugerido. O CNAE sozinho nunca leva ao A. */
export function sugerirICP(l, cfg) {
  if (!temRegrasICP(cfg)) return { classe: null, motivo: 'Operação sem regras de ICP configuradas.' };
  const a = aderencia(l, cfg);
  const medico = a.cnaeOk || a.segOk;
  if (medico && a.esp && a.privado === 'Sim' && a.pct >= cfg.limites.A)
    return { classe: 'A', motivo: 'Segmento-alvo, especialidade identificada, operação privada e aderência ' + a.pct + '%.' , a };
  if (medico) {
    const falta = [!a.esp && 'especialidade', a.privado !== 'Sim' && 'natureza privada', a.pct < cfg.limites.A && 'aderência mínima'].filter(Boolean);
    return { classe: 'B', motivo: 'Aderência potencial (' + a.pct + '%). Falta confirmar: ' + falta.join(', ') + '.', a };
  }
  return { classe: 'C', motivo: 'Fora do perfil prioritário ou sem aderência identificada (' + a.pct + '%).', a };
}

/** engajamento: interesse demonstrado de verdade. Sem interação = não avaliado. */
export function engajamento(l) {
  const base = { 'Sem interesse': 0, 'Baixo': 25, 'Médio': 50, 'Alto': 75 }[l.interest];
  if (base === undefined) return { pct: null, motivos: ['Interesse ainda não avaliado'] };
  let pct = base; const motivos = ['Interesse ' + l.interest + ' (' + base + ')'];
  if (l.interest !== 'Sem interesse') {
    if (['Contato estabelecido', 'Autoridade confirmada'].includes(l.decisor_status)) { pct += 15; motivos.push('Decisor: ' + l.decisor_status + ' (+15)'); }
    const etapa = etapaAtual(l.status);
    if (ETAPAS.indexOf(etapa) >= ETAPAS.indexOf('Reunião agendada') && !ETAPAS_FECHADAS.includes(etapa)) { pct += 10; motivos.push('Etapa ' + etapa + ' (+10)'); }
  }
  return { pct: Math.min(100, pct), motivos };
}

/** completude cadastral: indicador separado, não entra no score */
const CAMPOS_COMPLETUDE = [['company_name', 'Razão social'], ['cnpj', 'CNPJ'], ['cnae', 'CNAE'], ['city', 'Cidade'],
  ['state', 'Estado'], ['phone', 'Telefone'], ['email', 'E-mail'], ['contact_name', 'Contato'], ['position', 'Cargo'],
  ['website', 'Site'], ['specialty', 'Especialidade'], ['address', 'Endereço']];
export function completude(l) {
  const faltando = CAMPOS_COMPLETUDE.filter(([k]) => !txt(l[k])).map(([, r]) => r);
  return { pct: Math.round((CAMPOS_COMPLETUDE.length - faltando.length) / CAMPOS_COMPLETUDE.length * 100), faltando };
}

/** pendências de enriquecimento para o SDR */
export function pendencias(l) {
  const p = [];
  if (!txt(l.phone) && !(l.extra_phones || []).length) p.push('Encontrar telefone');
  else if (l.phone_status === 'Encontrado') p.push('Validar telefone');
  if (!txt(l.email)) p.push('Encontrar e-mail');
  if ((l.decisor_status || 'Não identificado') === 'Não identificado') p.push('Identificar o decisor');
  if (!txt(l.cnae)) p.push('Informar CNAE');
  if (!txt(l.specialty)) p.push('Confirmar especialidade');
  if (!txt(l.website)) p.push('Procurar site');
  if (!l.icp_class) p.push('Classificar ICP');
  return p;
}

/** score comercial = aderência e engajamento, com os pesos da operação */
export function avaliar(l, cfg) {
  const icp = sugerirICP(l, cfg);
  const ad = temRegrasICP(cfg) ? aderencia(l, cfg) : null;
  const en = engajamento(l);
  const comp = completude(l);
  const w = cfg.score;
  const partes = [];
  if (ad) partes.push([ad.pct, w.icp]);
  partes.push([en.pct ?? 0, w.engajamento]);   // sem interação ainda: conta 0 até a primeira avaliação
  const soma = partes.reduce((s, [, p]) => s + p, 0);
  const score = soma ? Math.round(partes.reduce((s, [v, p]) => s + v * p, 0) / soma) : 0;
  const justificativa = [
    'Regra da operação (pesos ICP ' + w.icp + ' / engajamento ' + w.engajamento + '; não é probabilidade estatística).',
    ad ? 'Aderência ao ICP ' + ad.pct + '%: ' + ad.motivos.join('; ') + '.' : 'Aderência: operação sem regras de ICP.',
    'Engajamento ' + (en.pct === null ? 'não avaliado (conta 0 até a primeira interação)' : en.pct + '%') + ': ' + en.motivos.join('; ') + '.',
    'Completude cadastral ' + comp.pct + '% (não altera o score).',
  ].join('\n');
  return { score, aderencia: ad ? ad.pct : null, engajamento: en.pct, completude: comp.pct, icp, justificativa };
}

/** campos de score/ICP para gravar no lead. ICP revisado pelo gestor não é sobrescrito. */
export function camposCalculados(l, cfg) {
  const r = avaliar(l, cfg);
  const out = { score: r.score, score_icp: r.aderencia, score_engagement: r.engajamento, completeness: r.completude, score_reason: r.justificativa };
  if (l.icp_source !== 'Revisado') { out.icp_class = r.icp.classe; out.icp_source = r.icp.classe ? 'Automático' : null; out.icp_reason = r.icp.motivo; }
  return out;
}

/** e-mail que parece ser do escritório de contabilidade (comum em bases da Receita) */
export const emailDeContabilidade = e => /contab|contador|contadora|escritorio|fiscal|tributar/.test(semAcento(e));
