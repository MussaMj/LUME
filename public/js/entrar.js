import { $, $$, api, getMe, initNav, photographer, loginDestination, h } from './core.js';

const params = new URLSearchParams(location.search);
const destination = (user) => loginDestination(user, params.get('next'));
if (params.get('notice') === 'admin-login') {
  const message = document.createElement('p');
  message.className = 'notice';
  message.setAttribute('role', 'status');
  message.textContent = 'Inicia sessão com a conta de administrador para continuar';
  document.querySelector('.auth__panel').prepend(message);
}

const currentUser = await getMe();
const accountParams=new URLSearchParams(location.hash.slice(1));
if (currentUser && !accountParams.has('reset') && !accountParams.has('verify')) location.replace(destination(currentUser));
initNav('entrar');

// Imagem lateral: a Foto da Semana, se existir
api('/photos/featured').then(({ photo }) => {
  if (!photo) return;
  $('#authImg').src = photo.src;
  $('#authCaption').textContent = `${photo.title} · ${photographer(photo)}`;
}).catch(() => {});

function showTab(name) {
  $$('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.tab === name);
    t.setAttribute('aria-selected', String(t.dataset.tab === name));
  });
  $('#login').hidden = name !== 'login';
  $('#register').hidden = name !== 'register';
  $(`#${name} input`).focus();
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
if (location.hash === '#registo') showTab('register');

$('#regUser').addEventListener('input', (e) => {
  e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '');
  $('#regUserHint').textContent = `O teu perfil: /@${e.target.value || '…'}`;
});

async function submit(form, path, body) {
  const err = $('.form-error', form);
  const btn = $('button[type="submit"]', form);
  err.textContent = '';
  btn.disabled = true;
  try {
    const response = await api(path, { method: 'POST', body });
    if(response.verificationRequired) {err.classList.add('is-success');err.textContent=response.message;btn.disabled=false;return;}
    location.replace(destination(response.user));
  } catch (e) {
    err.classList.remove('is-success');
    err.textContent = e.message;
    btn.disabled = false;
  }
}

$('#login').addEventListener('submit', (e) => {
  e.preventDefault();
  submit(e.target, '/auth/login', { login: $('#loginId').value.trim(), password: $('#loginPw').value });
});

$('#register').addEventListener('submit', (e) => {
  e.preventDefault();
  submit(e.target, '/auth/register', {
    displayName: $('#regName').value.trim(),
    username: $('#regUser').value.trim(),
    email: $('#regEmail').value.trim(),
    password: $('#regPw').value,
  });
});

const accountArea=h('div',{class:'form-stack',hidden:true});
$('.auth__panel').append(accountArea);
function accountForm(mode,token) {
  $('#login').hidden=$('#register').hidden=true;
  $('.tabs').hidden=true;
  accountArea.hidden=false;
  const reset=mode==='reset', verify=mode==='verify';
  const input=verify?null:h('input',{type:reset?'password':'email',id:'accountValue',required:true,autocomplete:reset?'new-password':'email',...(reset?{minlength:12,maxlength:128}:{maxlength:120})});
  const message=h('p',{class:'account-feedback',role:'status'});
  const button=h('button',{class:'btn',type:'submit'},verify?'Confirmar e-mail':reset?'Guardar palavra-passe':'Enviar link');
  accountArea.replaceChildren(h('h2',{},verify?'Confirmar e-mail':reset?'Nova palavra-passe':mode==='request-reset'?'Recuperar palavra-passe':'Reenviar confirmação'),
    h('form',{class:'form-stack',onsubmit:async event=>{
      event.preventDefault();button.disabled=true;message.textContent='';message.classList.remove('is-error');
      try {
        const endpoint=verify?'verify-email':reset?'reset-password':mode;
        const body=verify?{token}:reset?{token,password:input.value}:{email:input.value.trim()};
        const result=await api('/auth/'+endpoint,{method:'POST',body});
        message.textContent=result.message; if(reset)input.value=''; if(reset || verify)button.hidden=true;
      } catch(err){message.classList.add('is-error');message.textContent=err.message;}
      finally{button.disabled=false;}
    }},input&&h('div',{class:'field'},h('label',{for:'accountValue'},reset?'Palavra-passe (12 a 128 caracteres)':'E-mail'),input),message,button),
    h('a',{class:'link-arrow',href:'/entrar'},'Voltar a entrar'));
  input?.focus();
}
$('#login').append(h('div',{class:'account-help'},
  h('button',{type:'button',class:'link-arrow',onclick:()=>accountForm('request-reset')},'Esqueceste a palavra-passe?'),
  h('button',{type:'button',class:'link-arrow',onclick:()=>accountForm('request-verification')},'Reenviar confirmação de e-mail')));
function accountLink() {
  const values=new URLSearchParams(location.hash.slice(1));
  for(const mode of ['reset','verify'])if(values.has(mode)) {
    const token=values.get(mode);history.replaceState(null,'',location.pathname+location.search);
    accountForm(mode,token);break;
  }
}
window.addEventListener('hashchange',accountLink);
accountLink();
