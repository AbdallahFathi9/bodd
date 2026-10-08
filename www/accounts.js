(function(){
'use strict';
var api=null,original=null,returnFocus=null,busy=false,$=function(id){return document.getElementById(id);};
function status(value){$('editAccountStatus').textContent=window.BoddI18n.t(value);}
function lock(value){busy=value;api.busy(value);Array.prototype.forEach.call($('editAccount').querySelectorAll('input,button'),function(el){el.disabled=value;});$('editAccount').setAttribute('aria-busy',String(value));}
function close(){if(busy)return;original=null;$('editAccount').reset();$('editPassword').type='password';$('showEditPassword').textContent=window.BoddI18n.t('Show password');$('showEditPassword').setAttribute('aria-pressed','false');$('accountEditor').hidden=true;if(returnFocus&&returnFocus.isConnected)returnFocus.focus();else api.focus();}
async function save(e){
 e.preventDefault();if(busy||!original)return;
 var previous=original;
 try{
  var profile=Object.assign({},previous,{label:$('editAccountName').value.trim(),server:window.PlayerCore.normalizeServer($('editServer').value),username:$('editUsername').value.trim(),password:$('editPassword').value,autoLogin:$('editAutoLogin').checked});
  if(!profile.username||!profile.password)throw new Error('Enter your username and password.');
  var oldKey=api.key(previous),newKey=api.key(profile),profiles=api.profiles();
  if(profiles.some(function(p){return api.key(p)!==oldKey&&api.key(p)===newKey;}))throw new Error('Another saved account already uses this server and username.');
  // Keep the existing storage namespace when login credentials are edited.
  profile.dataKey=typeof previous.dataKey==='string'&&previous.dataKey?previous.dataKey:oldKey;
  delete profile.profiles;
  var credentialsChanged=profile.server!==previous.server||profile.username!==previous.username||profile.password!==previous.password;
  lock(true);status(credentialsChanged?'Checking the new login details…':'Saving account…');
  if(credentialsChanged){
   var auth=await api.verify(profile);
   if(!auth.user_info||String(auth.user_info.auth)!=='1')throw new Error('Login rejected. Check your username and password.');
   if(auth.user_info.status&&auth.user_info.status!=='Active')throw new Error('The provider account is not active.');
   profile.authenticatedAt=Date.now();profile.expiresAt=Number(auth.user_info.exp_date)>0?Number(auth.user_info.exp_date):null;profile.connectionLimit=Number(auth.user_info.max_connections)||0;
  }
  var updated=profiles.map(function(p){return api.key(p)===oldKey?profile:p;}),active=api.active();
  if(active&&api.key(active)===oldKey)active=profile;
  if(!await api.write(active,updated))throw new Error('Could not save the account. Your previous details were kept.');
  lock(false);close();api.saved(previous,profile,updated,credentialsChanged);
 }catch(error){status(error.message||'Could not save the account. Your previous details were kept.');}
 finally{if(busy)lock(false);}
}
window.BoddAccounts={
 init:function(options){api=options;document.addEventListener('keydown',function(e){if($('accountEditor').hidden||e.key!=='Tab')return;var items=Array.prototype.filter.call($('accountEditor').querySelectorAll('input,button'),function(el){return !el.disabled&&el.getClientRects().length;});if(!items.length){e.preventDefault();return;}var first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}},true);$('editAccount').addEventListener('submit',save);$('cancelEditAccount').onclick=close;$('showEditPassword').onclick=function(){var reveal=$('editPassword').type==='password';$('editPassword').type=reveal?'text':'password';this.textContent=window.BoddI18n.t(reveal?'Hide password':'Show password');this.setAttribute('aria-pressed',String(reveal));};},
 open:function(profile){if(busy)return;original=profile;returnFocus=document.activeElement;$('editAccountName').value=profile.label||'';$('editServer').value=profile.server;$('editUsername').value=profile.username;$('editPassword').value=profile.password;$('editPassword').type='password';$('showEditPassword').textContent=window.BoddI18n.t('Show password');$('showEditPassword').setAttribute('aria-pressed','false');$('editAutoLogin').checked=!!profile.autoLogin;status('');$('accountEditor').hidden=false;$('editAccountName').focus();},
 back:function(){if($('accountEditor').hidden)return false;close();return true;}
};
})();
