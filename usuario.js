// Login por nome de usuário.
// O login do Supabase só aceita e-mail; quem entra com usuário ganha um e-mail
// interno: "cazado" vira "cazado@usuarios.jadem.invalid". O domínio .invalid é
// reservado e não existe (RFC 2606): nenhum e-mail chega lá e ninguém pode
// registrá-lo, então "Esqueci minha senha" não serve para esses logins. Quem
// perde a senha pede uma nova ao administrador ("Nova senha" na lista).
// O mesmo domínio está na função jadem-usuarios e no escritório (jadem.js).
export const DOMINIO_USUARIO = 'usuarios.jadem.invalid';
const limpo = v => String(v || '').trim().toLowerCase();
// usuário: 3 a 31 caracteres, letras sem acento, números, ponto, hífen e sublinhado
export const usuarioValido = v => /^[a-z0-9][a-z0-9._-]{2,30}$/.test(limpo(v));
export const paraEmail = v => { v = limpo(v); return v && !v.includes('@') ? v + '@' + DOMINIO_USUARIO : v; };
export const ehUsuario = e => limpo(e).endsWith('@' + DOMINIO_USUARIO);
export const mostrarLogin = e => ehUsuario(e) ? limpo(e).slice(0, -(DOMINIO_USUARIO.length + 1)) : String(e || '');
