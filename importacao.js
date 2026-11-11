/* ===========================================================
   importacao.js — leitura de planilhas de leads (sem tela, sem banco)

   Reconhece as colunas, limpa CNPJ, telefones e e-mails, acha
   duplicados por CNPJ e monta o plano: o que entra, o que só completa
   um lead que já existe, o que fica de fora e por quê.
   Regras: nunca inventar dado, nunca apagar dado que já existe,
   nunca juntar leads de operações (clientes) diferentes.
   =========================================================== */
import { semAcento, etapaAtual } from './qualificacao.js';

const txt = v => String(v == null ? '' : v).trim();
const dig = v => txt(v).replace(/\D/g, '');
export const chave = v => semAcento(v).replace(/[^a-z0-9]/g, '');

/* ---------------- colunas reconhecidas ---------------- */
// campo -> nomes de coluna aceitos (comparados sem acento, sem espaço e sem pontuação)
export const CAMPOS = [
  ['company_name', 'Razão social', ['razaosocial', 'nomeempresarial', 'empresa', 'nomedaempresa', 'nomeempresa', 'company', 'empresanome', 'razao']],
  ['trade_name', 'Nome fantasia', ['nomefantasia', 'fantasia', 'nomecomercial']],
  ['cnpj', 'CNPJ', ['cnpj', 'cnpjcompleto', 'numerocnpj', 'nrcnpj', 'documento', 'cnpjcpf']],
  ['cnae', 'CNAE principal (código)', ['cnae', 'cnaeprincipal', 'cnaefiscal', 'codigocnae', 'cnaecodigo', 'cnaefiscalprincipal', 'codigoatividadeprincipal', 'cnaeprincipalcodigo']],
  ['cnae_description', 'CNAE (descrição)', ['descricaocnae', 'cnaedescricao', 'atividadeprincipal', 'descricaoatividadeprincipal', 'cnaeprincipaldescricao', 'descricaodaatividade']],
  ['legal_nature', 'Natureza jurídica', ['naturezajuridica', 'natureza']],
  ['segment', 'Segmento', ['segmento', 'ramo', 'setor', 'ramodeatividade', 'atividade']],
  ['specialty', 'Especialidade', ['especialidade', 'especialidades', 'especialidademedica']],
  ['address', 'Endereço (logradouro)', ['endereco', 'logradouro', 'rua', 'enderecocompleto']],
  ['address_number', 'Número', ['numero', 'num', 'nro', 'numeroendereco']],
  ['address_extra', 'Complemento', ['complemento']],
  ['district', 'Bairro', ['bairro']],
  ['cep', 'CEP', ['cep', 'codigopostal']],
  ['city', 'Cidade', ['cidade', 'municipio', 'nomemunicipio']],
  ['state', 'Estado (UF)', ['uf', 'estado', 'siglauf']],
  ['website', 'Site', ['site', 'website', 'url', 'homepage', 'sitedaempresa']],
  ['origin', 'Origem do lead', ['origem', 'fonte', 'canal', 'origemdolead']],
  ['contact_name', 'Nome do contato', ['contato', 'nomedocontato', 'nomecontato', 'responsavel', 'pessoa', 'decisor', 'nomedecisor', 'socio', 'nomesocio']],
  ['position', 'Cargo', ['cargo', 'funcao', 'posicao', 'qualificacaosocio', 'qualificacao']],
  ['phone', 'Telefone', ['telefone', 'fone', 'tel', 'telefonecomercial', 'telefoneprincipal', 'celular', 'dddtelefone', 'telefonefixo', 'contatotelefonico', 'telefones']],
  ['ddd', 'DDD', ['ddd']],
  ['whatsapp', 'WhatsApp', ['whatsapp', 'whats', 'zap', 'wpp', 'whatsappcomercial']],
  ['email', 'E-mail', ['email', 'mail', 'correioeletronico', 'emailcomercial', 'emails', 'enderecoeletronico']],
  ['notes', 'Observações', ['observacoes', 'observacao', 'obs', 'notas', 'informacoes', 'comentarios', 'anotacoes']],
  ['estimated_value', 'Valor potencial', ['valor', 'valorprevisto', 'ticket', 'valorpotencial']],
  ['status', 'Etapa do funil', ['etapa', 'etapadofunil', 'estagio', 'fase']],
];
export const ROTULO = Object.fromEntries(CAMPOS.map(([c, r]) => [c, r]));
const MULTIPLOS = new Set(['phone', 'email', 'notes', 'ddd', 'whatsapp']);
export const campoMultiplo = c => MULTIPLOS.has(c);

/** coluna -> campo, pelo nome. "Telefone 2", "telefone_2" e "Fone2" viram telefone. */
export function autoMapear(cabecalhos) {
  const usados = new Set(), mapa = {};
  for (const h of cabecalhos) {
    const k = chave(h), semNum = k.replace(/\d+$/, '');
    let achou = '';
    for (const [campo, , aliases] of CAMPOS) {
      if (aliases.includes(k) || aliases.includes(semNum)) { achou = campo; break; }
    }
    if (!achou && /^ddd\d*telefone\d*$|^telefone\d*ddd\d*$/.test(k)) achou = 'phone';
    // campos simples ficam só com a primeira coluna que bate; repetidos ficam sem mapear
    if (achou && !MULTIPLOS.has(achou) && usados.has(achou)) achou = '';
    if (achou) usados.add(achou);
    mapa[h] = achou;
  }
  return mapa;
}

/* ---------------- valores ---------------- */
/** célula da planilha em texto, sem notação científica e sem perder dígitos */
export function valorCelula(v) {
  if (v == null) return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? BigInt(v).toString() : String(v);
  return txt(v);
}

function cnpjDigitoOk(c) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === +c[12] && calc(13) === +c[13];
}
/** CNPJ com 14 dígitos; completa zeros à esquerda que o Excel apagou */
export function normalizarCNPJ(v) {
  const d = dig(v);
  if (!d) return { cnpj: null };
  if (d.length > 14) return { cnpj: null, aviso: 'CNPJ com dígitos a mais: ' + txt(v) };
  const c = d.padStart(14, '0');
  if (!cnpjDigitoOk(c)) return { cnpj: null, aviso: 'CNPJ inválido (dígito verificador não confere): ' + txt(v) };
  return { cnpj: c, completou: c !== d };
}
export const formatarCNPJ = c => /^\d{14}$/.test(c || '') ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c || '');
export const formatarCNAE = c => { const d = dig(c); return d.length === 7 ? d.replace(/^(\d{4})(\d)(\d{2})$/, '$1-$2/$3') : txt(c); };

const DDDS = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45,
  46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99].map(String));
/** um telefone brasileiro: tira +55, zero de operadora, junta DDD separado e confere */
export function normalizarTelefone(v, ddd = '') {
  const original = txt(v);
  let d = dig(v);
  if (!d) return null;
  if (d.startsWith('00')) d = d.replace(/^00+/, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.startsWith('0')) { d = d.slice(1); if (d.length === 12 || d.length === 13) d = d.slice(2); }   // 0 + operadora
  const dd = dig(ddd);
  if ((d.length === 8 || d.length === 9) && dd.length === 2) d = dd + d;
  const ruim = motivo => ({ valido: false, original, motivo });
  if (d.length === 8 || d.length === 9) return ruim('sem DDD');
  if (d.length !== 10 && d.length !== 11) return ruim('quantidade de dígitos inválida');
  if (/^(\d)\1+$/.test(d) || /^0+$/.test(d.slice(2)) || /(\d)\1{6,}/.test(d.slice(2))) return ruim('número repetido ou zerado');
  if (!DDDS.has(d.slice(0, 2))) return ruim('DDD ' + d.slice(0, 2) + ' não existe');
  if (d.length === 11 && d[2] !== '9') return ruim('celular sem o 9 depois do DDD');
  if (d.length === 10 && !'2345'.includes(d[2])) return ruim(+d[2] >= 6 ? 'celular sem o nono dígito' : 'número fixo inválido');
  const tipo = d.length === 11 ? 'celular' : 'fixo';
  const formatado = tipo === 'celular' ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return { valido: true, digitos: d, formatado, tipo, original };
}
/** uma célula pode ter vários telefones: "(11) 3333-4444 / 11 98888-7777" */
export const separarTelefones = v => txt(v).split(/[;,|/\n]| e | ou /i).map(txt).filter(Boolean);
export const digitosTelefone = v => { const n = normalizarTelefone(v); return n && n.valido ? n.digitos : dig(v); };

const EMAIL = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
export function normalizarEmails(v) {
  const validos = [], invalidos = [];
  for (const p of txt(v).split(/[;,\s]+/).map(x => x.trim().replace(/^mailto:/i, '').replace(/[<>()"]/g, '')).filter(Boolean)) {
    const e = p.toLowerCase();
    if (EMAIL.test(e) && !e.includes('..')) { if (!validos.includes(e)) validos.push(e); } else invalidos.push(p);
  }
  return { validos, invalidos };
}
export const emailValido = e => EMAIL.test(txt(e).toLowerCase()) && !txt(e).includes('..');

export function numeroValor(v) {
  const s = txt(v).replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const n = Number(s.includes(',') ? s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.') : s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const DECISOR_CARGO = /socio|administrador|proprietari|diretor|ceo|dono|presidente|fundador|titular|responsavel tecnico|medico responsavel/;
const vazio = v => v == null || txt(v) === '' || (Array.isArray(v) && !v.length);

/* ---------------- uma linha -> um lead ---------------- */
export function linhaParaLead(linha, mapa, extras = {}) {
  const avisos = [], erros = [];
  const val = {}, multi = { phone: [], email: [], notes: [], ddd: [], whatsapp: [] };
  for (const [col, campo] of Object.entries(mapa)) {
    if (!campo) continue;
    const v = valorCelula(linha[col]);
    if (!v) continue;
    if (multi[campo]) multi[campo].push({ col, v });
    else if (!val[campo]) val[campo] = v;
  }
  const lead = {};
  // empresa
  lead.company_name = val.company_name || val.trade_name || '';
  if (val.trade_name && val.trade_name !== lead.company_name) lead.trade_name = val.trade_name;
  if (!lead.company_name) erros.push('Sem razão social e sem nome fantasia');
  if (val.cnpj) {
    const c = normalizarCNPJ(val.cnpj);
    if (c.cnpj) lead.cnpj = c.cnpj; else if (c.aviso) avisos.push(c.aviso);
  }
  if (val.cnae) { const c = dig(val.cnae); if (c.length === 7) lead.cnae = c; else avisos.push('CNAE fora do padrão de 7 dígitos: ' + val.cnae); }
  for (const k of ['cnae_description', 'legal_nature', 'segment', 'specialty', 'city', 'origin', 'contact_name', 'position']) if (val[k]) lead[k] = val[k];
  if (val.state) { const uf = txt(val.state).toUpperCase(); if (/^[A-Z]{2}$/.test(uf)) lead.state = uf; else lead.state = val.state; }
  if (val.website) lead.website = /^https?:\/\//i.test(val.website) ? val.website : (val.website.includes('.') ? 'https://' + val.website.replace(/^\/+/, '') : val.website);
  const end = [val.address, val.address_number && 'nº ' + val.address_number, val.address_extra, val.district, val.cep && 'CEP ' + val.cep].filter(Boolean);
  if (end.length) lead.address = end.join(', ');
  if (val.status) lead.status = etapaAtual(val.status);
  if (val.estimated_value) lead.estimated_value = numeroValor(val.estimated_value);
  // telefones: cada coluna pode ter o DDD em outra coluna com o mesmo número no nome ("DDD 1" + "Telefone 1")
  const sufixo = col => (chave(col).match(/(\d+)$/) || [])[1] || '';
  const dddDe = col => { const s = sufixo(col); const m = multi.ddd.find(x => sufixo(x.col) === s) || (multi.ddd.length === 1 ? multi.ddd[0] : null); return m ? m.v : ''; };
  const tels = [];
  for (const { col, v } of multi.phone) for (const parte of separarTelefones(v)) {
    const n = normalizarTelefone(parte, dddDe(col));
    if (!n) continue;
    if (!n.valido) { avisos.push('Telefone descartado (' + n.motivo + '): ' + n.original); continue; }
    if (!tels.some(t => t.digitos === n.digitos)) tels.push({ ...n, rotulo: col });
  }
  let zap = null;
  for (const { col, v } of multi.whatsapp) for (const parte of separarTelefones(v)) {
    const n = normalizarTelefone(parte, dddDe(col));
    if (!n) continue;
    if (!n.valido) { avisos.push('WhatsApp descartado (' + n.motivo + '): ' + n.original); continue; }
    if (!zap) zap = n;
  }
  if (tels.length) { lead.phone = tels[0].formatado; lead.phone_status = 'Encontrado'; }
  else if (zap) { lead.phone = zap.formatado; lead.phone_status = 'Encontrado'; }
  lead.extra_phones = tels.slice(1).map(t => ({ numero: t.formatado, rotulo: t.rotulo, tipo: t.tipo }));
  if (zap) { lead.whatsapp = zap.formatado; lead.whatsapp_status = 'Não confirmado'; }
  // e-mails
  const emails = [];
  for (const { v } of multi.email) { const r = normalizarEmails(v); r.validos.forEach(e => { if (!emails.includes(e)) emails.push(e); }); r.invalidos.forEach(x => avisos.push('E-mail inválido descartado: ' + x)); }
  if (emails.length) lead.email = emails[0];
  lead.extra_emails = emails.slice(1);
  // observações: várias colunas viram uma nota, com o nome da coluna
  const notas = multi.notes.map(({ col, v }) => multi.notes.length > 1 ? col + ': ' + v : v);
  if (notas.length) lead.notes = notas.join('\n');
  // decisor: só "identificado" quando a planilha traz nome E cargo de decisão
  if (lead.contact_name && DECISOR_CARGO.test(semAcento(lead.position))) {
    lead.decisor_status = 'Identificado'; lead.decisor_name = lead.contact_name; lead.decisor_position = lead.position;
  }
  if (!lead.origin && extras.origem) lead.origin = extras.origem;
  return { lead, avisos, erros };
}

/* ---------------- juntar sem apagar ---------------- */
const SIMPLES = ['company_name', 'trade_name', 'cnpj', 'cnae', 'cnae_description', 'legal_nature', 'segment', 'specialty', 'city', 'state',
  'address', 'website', 'origin', 'contact_name', 'position', 'whatsapp', 'decisor_name', 'decisor_position'];
/** o que o lead novo acrescenta ao existente: só preenche vazio; telefones e e-mails novos viram adicionais */
export function mesclar(existente, novo) {
  const patch = {}, campos = [];
  for (const k of SIMPLES) if (vazio(existente[k]) && !vazio(novo[k])) { patch[k] = novo[k]; campos.push(ROTULO[k] || k); }
  if (patch.whatsapp) patch.whatsapp_status = 'Não confirmado';
  if ((existente.decisor_status || 'Não identificado') === 'Não identificado' && novo.decisor_status === 'Identificado') patch.decisor_status = 'Identificado';
  if (!existente.estimated_value && novo.estimated_value) { patch.estimated_value = novo.estimated_value; campos.push('Valor potencial'); }
  // telefones
  const conhecidos = new Set([existente.phone, ...(existente.extra_phones || []).map(t => t.numero)].filter(Boolean).map(digitosTelefone));
  const novosTel = [novo.phone ? { numero: novo.phone, rotulo: 'importação' } : null, ...(novo.extra_phones || [])].filter(Boolean)
    .filter(t => !conhecidos.has(digitosTelefone(t.numero)));
  if (novosTel.length) {
    if (vazio(existente.phone)) { patch.phone = novosTel.shift().numero; patch.phone_status = 'Encontrado'; campos.push('Telefone'); }
    if (novosTel.length) { patch.extra_phones = [...(existente.extra_phones || []), ...novosTel]; campos.push('Telefones adicionais'); }
  }
  // e-mails
  const tem = new Set([existente.email, ...(existente.extra_emails || [])].filter(Boolean).map(e => e.toLowerCase()));
  const novosEm = [novo.email, ...(novo.extra_emails || [])].filter(Boolean).filter(e => !tem.has(e.toLowerCase()));
  if (novosEm.length) {
    if (vazio(existente.email)) { patch.email = novosEm.shift(); campos.push('E-mail'); }
    if (novosEm.length) { patch.extra_emails = [...(existente.extra_emails || []), ...novosEm]; campos.push('E-mails adicionais'); }
  }
  // observações: acrescenta só o que ainda não está lá
  if (!vazio(novo.notes) && !txt(existente.notes).includes(txt(novo.notes))) {
    patch.notes = (txt(existente.notes) ? txt(existente.notes) + '\n\n' : '') + txt(novo.notes); campos.push('Observações');
  }
  return { patch, campos };
}

/* ---------------- o plano da importação ---------------- */
/**
 * linhas: objetos {coluna: valor}; mapa: {coluna: campo}
 * ctx: { existentes: leads da conta (todas as operações), operacaoId, nomeOperacao(id), origem }
 * devolve { novos: [{linha, lead, avisos}], atualizacoes: [{linha, id, patch, campos}], relatorio: [...] }
 */
export function planejarImportacao(linhas, mapa, ctx) {
  const op = ctx.operacaoId || null;
  const mesmaOp = l => (l.operation_id || null) === op;
  const existentes = ctx.existentes || [];
  const porCnpj = new Map(), porNome = new Map(), outrasOps = new Map();
  for (const l of existentes) {
    if (mesmaOp(l)) {
      if (l.cnpj) porCnpj.set(l.cnpj, l);
      porNome.set(chave(l.company_name) + '|' + chave(l.city), l);
      porNome.set(chave(l.company_name) + '|' + digitosTelefone(l.phone), l);
    } else if (l.cnpj) {
      if (!outrasOps.has(l.cnpj)) outrasOps.set(l.cnpj, new Set());
      outrasOps.get(l.cnpj).add(ctx.nomeOperacao ? ctx.nomeOperacao(l.operation_id) : (l.operation_id || 'Sem operação'));
    }
  }
  const novos = [], atualizacoes = new Map(), relatorio = [];
  const noArquivo = new Map();   // cnpj ou nome -> item já planejado
  const reg = (linha, lead, resultado, motivo) => relatorio.push({ linha, empresa: lead.company_name || '', cnpj: lead.cnpj || '', resultado, motivo });
  linhas.forEach((row, i) => {
    const linha = i + 2;   // linha 1 é o cabeçalho
    const { lead, avisos, erros } = linhaParaLead(row, mapa, { origem: ctx.origem });
    if (erros.length) { reg(linha, lead, 'rejeitado', erros.join('; ')); return; }
    const chaveNome = chave(lead.company_name) + '|' + chave(lead.city);
    const chaveTel = chave(lead.company_name) + '|' + digitosTelefone(lead.phone);
    // repetido dentro da própria planilha
    const anterior = (lead.cnpj && noArquivo.get('c' + lead.cnpj)) || (!lead.cnpj && (noArquivo.get('n' + chaveTel)));
    if (anterior) {
      if (anterior.tipo === 'novo') {
        const { patch, campos } = mesclar(anterior.lead, lead);
        Object.assign(anterior.lead, patch);
        reg(linha, lead, 'ignorado', 'Repetido na planilha (linha ' + anterior.linha + ')' + (campos.length ? '; dados somados: ' + campos.join(', ') : ''));
      } else {
        const a = atualizacoes.get(anterior.id);
        const base = { ...anterior.existente, ...a.patch };
        const { patch, campos } = mesclar(base, lead);
        Object.assign(a.patch, patch); campos.forEach(c => a.campos.includes(c) || a.campos.push(c));
        reg(linha, lead, 'ignorado', 'Repetido na planilha (linha ' + anterior.linha + ')' + (campos.length ? '; dados somados: ' + campos.join(', ') : ''));
      }
      return;
    }
    // já existe nesta operação: completa sem apagar
    const existente = (lead.cnpj && porCnpj.get(lead.cnpj)) ||
      ((!lead.cnpj || !porNome.get(chaveNome)?.cnpj) && (porNome.get(chaveNome) || (lead.phone && porNome.get(chaveTel))));
    if (existente && (!lead.cnpj || !existente.cnpj || existente.cnpj === lead.cnpj)) {
      const { patch, campos } = mesclar(existente, lead);
      const item = { tipo: 'atualizacao', id: existente.id, existente, linha };
      if (lead.cnpj) noArquivo.set('c' + lead.cnpj, item); else noArquivo.set('n' + chaveTel, item);
      if (!campos.length) { reg(linha, lead, 'ignorado', 'Já cadastrado nesta operação, sem dados novos' + (avisos.length ? '. ' + avisos.join('; ') : '')); atualizacoes.set(existente.id, { linha, id: existente.id, patch: {}, campos: [] }); return; }
      atualizacoes.set(existente.id, { linha, id: existente.id, patch, campos });
      reg(linha, lead, 'atualizado', 'Completado: ' + campos.join(', ') + (avisos.length ? '. ' + avisos.join('; ') : ''));
      return;
    }
    // novo nesta operação
    const extras = [];
    if (lead.cnpj && outrasOps.has(lead.cnpj)) extras.push('CNPJ também existe em: ' + [...outrasOps.get(lead.cnpj)].join(', ') + ' (não mesclado)');
    if (!lead.contact_name) extras.push('sem contato identificado');
    if (!lead.phone) extras.push('sem telefone válido');
    if (!lead.email) extras.push('sem e-mail');
    const item = { tipo: 'novo', lead: { ...lead, operation_id: op }, linha, avisos };
    novos.push(item);
    if (lead.cnpj) noArquivo.set('c' + lead.cnpj, item); else noArquivo.set('n' + chaveTel, item);
    reg(linha, lead, 'importado', [...avisos, ...extras].join('; '));
  });
  return { novos, atualizacoes: [...atualizacoes.values()].filter(a => a.campos.length), relatorio };
}

export function resumo(relatorio) {
  const r = { importado: 0, atualizado: 0, ignorado: 0, rejeitado: 0 };
  relatorio.forEach(x => { r[x.resultado] = (r[x.resultado] || 0) + 1; });
  return r;
}
/** relatório em CSV para abrir no Excel (ponto e vírgula, com BOM) */
export function relatorioCSV(relatorio) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return '﻿' + ['Linha;Empresa;CNPJ;Resultado;Motivo', ...relatorio.map(r => [r.linha, r.empresa, formatarCNPJ(r.cnpj), r.resultado, r.motivo].map(q).join(';'))].join('\r\n');
}

/* ---------------- arquivo -> linhas ---------------- */
/** lê XLSX/XLS/CSV com o SheetJS. CSV é lido como texto puro, para não perder zeros à esquerda. */
export function lerPlanilha(XLSX, dados, nome) {
  let wb;
  if (/\.(csv|txt)$/i.test(nome || '')) {
    let texto = new TextDecoder('utf-8').decode(dados);
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(dados);   // CSV salvo pelo Excel em português
    wb = XLSX.read(texto.replace(/^﻿/, ''), { type: 'string', raw: true });
  } else wb = XLSX.read(new Uint8Array(dados), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw Error('Não há planilha no arquivo.');
  const linhas = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
    .filter(r => Object.values(r).some(v => valorCelula(v) !== ''));
  const cabecalhos = [];
  for (const r of linhas.slice(0, 50)) for (const k of Object.keys(r)) if (!cabecalhos.includes(k)) cabecalhos.push(k);
  return { cabecalhos: cabecalhos.filter(h => !/^__EMPTY/.test(h) || linhas.some(r => valorCelula(r[h]) !== '')), linhas };
}
