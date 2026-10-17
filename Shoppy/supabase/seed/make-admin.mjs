/** Invitación inicial de admin: simulación por defecto, sin contraseñas compartidas. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const PROJECT='evzlqwiipdjgtrqjlwba';
export function validateRedirect(value){
  const url=new URL(value);
  assert.ok(url.protocol==='https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname==='/acceso','Se requiere la URL HTTPS exacta del admin /acceso, sin parámetros.');
  return url.href;
}
export async function inviteAdministrator({email,redirectTo,allowedRedirects,database,apply=false}){
  assert.ok(typeof email==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Falta ADMIN_EMAIL válido.');
  email=email.toLowerCase();redirectTo=validateRedirect(redirectTo);
  assert.ok(allowedRedirects.includes(redirectTo),'La URL exacta debe estar permitida en Supabase antes de invitar.');
  let account=await database.account(email);
  if(account?.email?.toLowerCase()!==email && account)throw new Error('Identidad de Auth distinta.');
  if(account && !account.invited_at){
    const existing=await database.profile(account.id);
    if(!existing || existing.id!==account.id || existing.email.toLowerCase()!==email || existing.role!=='admin')throw new Error('Ya existe una cuenta que no corresponde a esta invitación. No se cambia su contraseña ni su rol.');
    return {mode:apply?'apply':'dry-run',invitationSent:false,alreadyAdmin:true};
  }
  if(!apply)return {mode:'dry-run',invitationSent:false,accountExists:!!account,redirectTo};
  let invitationSent=false;
  if(!account){account=await database.invite(email,redirectTo);invitationSent=true;}
  assert.ok(account?.id && account.email?.toLowerCase()===email,'La invitación devolvió otra identidad.');
  const profile=await database.profile(account.id);
  assert.ok(profile && profile.id===account.id && profile.email.toLowerCase()===email,'No se encontró el perfil exacto de la invitación. Revisa el resultado antes de repetir; el correo puede haberse enviado.');
  assert.ok(['customer','admin'].includes(profile.role),'Rol inesperado.');
  if(profile.role!=='admin')assert.ok(await database.promote(profile),'El perfil cambió; no se sobrescribe. La invitación puede haberse enviado.');
  const verified=await database.profile(account.id);
  assert.ok(verified?.role==='admin' && verified.email.toLowerCase()===email,'No se pudo verificar el rol admin.');
  return {mode:'apply',invitationSent,alreadyAdmin:profile.role==='admin',role:'admin',userId:account.id};
}
export function adminDatabase(db){
  return {
    async account(email){for(let page=1;page<=100;page++){const r=await db.auth.admin.listUsers({page,perPage:100});if(r.error)throw new Error('No se pudo consultar Auth.');const user=r.data.users.find(u=>u.email?.toLowerCase()===email);if(user)return user;if(r.data.users.length<100)return null;}throw new Error('Listado de cuentas incompleto.');},
    async invite(email,redirectTo){const r=await db.auth.admin.inviteUserByEmail(email,{redirectTo});if(r.error)throw new Error('Supabase rechazó la invitación. Verifica el correo y la configuración de envío antes de reintentar.');return r.data.user;},
    async profile(id){const r=await db.from('profiles').select('id,email,role').eq('id',id).maybeSingle();if(r.error)throw new Error('No se pudo consultar el perfil.');return r.data;},
    async promote(profile){const r=await db.from('profiles').update({role:'admin'}).eq('id',profile.id).eq('email',profile.email).eq('role',profile.role).select('id');if(r.error)throw new Error('No se pudo asignar el rol. La cuenta invitada se conserva.');return r.data?.length===1;},
  };
}
async function main(){
 const args=process.argv.slice(2);assert.ok(args.length<=1&&args.every(a=>a==='--apply'),'Usa --apply; sin opción solo se simula.');
 const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL;assert.equal(new URL(url).hostname,`${PROJECT}.supabase.co`,'Proyecto distinto al autorizado.');
 const email=process.env.ADMIN_EMAIL,redirectTo=validateRedirect(process.env.ADMIN_REDIRECT_URL);
 assert.ok(process.env.SUPABASE_SECRET_KEY&&process.env.SUPABASE_ACCESS_TOKEN,'Faltan credenciales seguras de Supabase.');
 const config=await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/config/auth`,{headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`}});assert.ok(config.ok,'No se pudo verificar la configuración Auth.');
 const settings=await config.json(),allowedRedirects=(settings.uri_allow_list??'').split(',').map(s=>s.trim());
 if(args.includes('--apply')){
   const page=await fetch(redirectTo,{redirect:'manual'});assert.equal(page.status,200,'El destino debe ser accesible sin login de Vercel.');
   const html=await page.text();assert.ok(html.includes('Configurar acceso al admin'),'El destino no contiene la pantalla preparada.');
 }
 const db=createClient(url,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 console.log(JSON.stringify(await inviteAdministrator({email,redirectTo,allowedRedirects,database:adminDatabase(db),apply:args.includes('--apply')}),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
