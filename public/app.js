(() => {
  const $ = (id) => document.getElementById(id);
  const modal = $('authModal'), form = $('authForm'), message = $('authMessage');
  let mode = 'signup', supabase = null, currentUser = null, demoUser = null;
  const config = window.BLOCKOS_CONFIG || {};
  const configured = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY && window.supabase);
  if (configured) {
    try { supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY); }
    catch (e) { console.error('No se pudo inicializar Supabase', e); }
  }
  function setMessage(text, error=false) { message.textContent = text; message.classList.toggle('error', error); }
  function showModal(nextMode='signup') {
    setMode(nextMode); modal.classList.remove('hidden'); document.body.style.overflow='hidden';
    setTimeout(() => $(nextMode === 'signup' ? 'username' : 'email').focus(), 80);
  }
  function closeModal() { modal.classList.add('hidden'); document.body.style.overflow=''; setMessage(''); form.reset(); }
  function setMode(next) {
    mode=next; const signup=mode==='signup';
    $('signupTab').classList.toggle('selected',signup); $('loginTab').classList.toggle('selected',!signup);
    $('authTitle').textContent=signup?'Únete a la aventura':'Qué bueno verte de nuevo';
    $('authSubtitle').textContent=signup?'Crea tu cuenta gratis para comenzar.':'Inicia sesión para volver a tu mundo.';
    $('username').classList.toggle('hidden',!signup); $('username').required=signup;
    $('usernameLabel').classList.toggle('hidden',!signup);
    $('password').autocomplete=signup?'new-password':'current-password';
    $('authSubmit').textContent=signup?'Crear cuenta':'Iniciar sesión';
    setMessage('');
  }
  function showToast(text) { const t=$('toast');t.textContent=text;t.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.add('hidden'),3600); }
  function displayUser(user, username) {
    currentUser=user||null;
    const name=username || user?.user_metadata?.username || user?.email?.split('@')[0] || 'Invitado';
    $('signedInAs').textContent=user?'Hola, '+name:'';
    $('openAuth').textContent=user?'Cerrar sesión':'Iniciar sesión';
    $('headerSignup').classList.toggle('hidden',!!user);
    $('profileName').textContent=name;
    $('profileMessage').textContent=user?'Tu perfil está activo. ¡Bienvenido a Blockos Ville!':'Inicia sesión para ver tu perfil.';
    $('profileAction').textContent=user?'Cerrar sesión':'Crear mi cuenta';
    $('heroSignup').textContent=user?'¡Ver mi perfil!':'¡Únete gratis!';
    if (user) closeModal();
  }
  async function refreshSession() {
    if (supabase) {
      const {data,error}=await supabase.auth.getSession();
      if(error) console.error(error);
      if(data?.session) {
        const user=data.session.user;
        let name=user.user_metadata?.username;
        const {data:profile}=await supabase.from('profiles').select('username').eq('id',user.id).maybeSingle();
        displayUser(user,profile?.username||name);
      } else displayUser(null);
    } else {
      const saved=localStorage.getItem('blockos_demo_user');
      if(saved) { try { demoUser=JSON.parse(saved); displayUser({email:demoUser.email,user_metadata:{username:demoUser.username}},demoUser.username); } catch { localStorage.removeItem('blockos_demo_user'); } }
      else displayUser(null);
    }
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault(); const email=$('email').value.trim().toLowerCase(), password=$('password').value;
    const username=$('username').value.trim();
    $('authSubmit').disabled=true; $('authSubmit').textContent='Un momento…'; setMessage('');
    try {
      if(mode==='signup' && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw new Error('El nombre debe tener 3–20 caracteres: letras, números o guion bajo.');
      if(supabase) {
        if(mode==='signup') {
          const {data,error}=await supabase.auth.signUp({email,password,options:{data:{username}}});
          if(error) throw error;
          if(data.session) { displayUser(data.user,username); showToast('¡Tu cuenta está lista!'); }
          else setMessage('Cuenta creada. Revisa tu correo para confirmar el registro.');
        } else {
          const {data,error}=await supabase.auth.signInWithPassword({email,password});
          if(error) throw error;
          displayUser(data.user); showToast('¡Has iniciado sesión!');
        }
      } else {
        // Demo mode only: never use this local-only account store as production authentication.
        const users=JSON.parse(localStorage.getItem('blockos_demo_users')||'{}');
        if(mode==='signup') {
          if(users[email]) throw new Error('Ya existe una cuenta de demostración con ese correo.');
          users[email]={username,password}; localStorage.setItem('blockos_demo_users',JSON.stringify(users));
          demoUser={email,username}; localStorage.setItem('blockos_demo_user',JSON.stringify(demoUser));
          displayUser({email,user_metadata:{username}},username); showToast('Cuenta de demostración creada en este navegador.');
        } else {
          if(!users[email]||users[email].password!==password) throw new Error('Correo o contraseña incorrectos en el modo de demostración.');
          demoUser={email,username:users[email].username};localStorage.setItem('blockos_demo_user',JSON.stringify(demoUser));
          displayUser({email,user_metadata:{username:demoUser.username}},demoUser.username);showToast('Sesión de demostración iniciada.');
        }
      }
    } catch(err) { setMessage(err.message||'No se pudo completar la solicitud. Inténtalo otra vez.',true); }
    finally { $('authSubmit').disabled=false; $('authSubmit').textContent=mode==='signup'?'Crear cuenta':'Iniciar sesión'; }
  });
  async function signOut() {
    if(supabase) { const {error}=await supabase.auth.signOut();if(error){showToast(error.message);return;} }
    demoUser=null;localStorage.removeItem('blockos_demo_user');displayUser(null);showToast('Sesión cerrada.');
  }
  $('openAuth').addEventListener('click',()=>currentUser?signOut():showModal('login'));
  $('headerSignup').addEventListener('click',()=>showModal('signup'));
  $('heroSignup').addEventListener('click',()=>currentUser?document.querySelector('#profile').scrollIntoView({behavior:'smooth'}):showModal('signup'));
  $('profileAction').addEventListener('click',()=>currentUser?signOut():showModal('signup'));
  $('profileNav').addEventListener('click',e=>{e.preventDefault();document.querySelector('#profile').scrollIntoView({behavior:'smooth'});});
  $('closeAuth').addEventListener('click',closeModal);
  $('signupTab').addEventListener('click',()=>setMode('signup')); $('loginTab').addEventListener('click',()=>setMode('login'));
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.classList.contains('hidden'))closeModal();});
  $('mobileMenu').addEventListener('click',()=>$('main-nav')?.classList.toggle('open'));
  const nav=document.querySelector('.main-nav'); $('mobileMenu').addEventListener('click',()=>nav.classList.toggle('open'));
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
  if(supabase) supabase.auth.onAuthStateChange((_event,session)=>{ if(!session) displayUser(null); });
  refreshSession();
  // 3D avatar: simple original block character, rendered directly in the browser.
  const stages=[$('heroAvatar'),$('profileAvatar')];
  function makeAvatar(stage) {
    if(!stage||!window.THREE) { if(stage) stage.textContent=''; return; }
    const scene=new THREE.Scene(); scene.background=null;
    const camera=new THREE.PerspectiveCamera(32,1,.1,100);camera.position.set(4.5,3.4,6.5);camera.lookAt(0,1.35,0);
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
    stage.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff,0x5d7a99,2.1));
    const key=new THREE.DirectionalLight(0xffffff,2.5);key.position.set(3,6,4);scene.add(key);
    const avatar=new THREE.Group();scene.add(avatar);
    const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:.72});
    const addBox=(w,h,d,color,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);avatar.add(m);return m;};
    addBox(.8,.8,.42,0xffc99d,0,2.45,0); // head
    addBox(.82,.16,.44,0x6b422d,0,2.88,0); // hair
    addBox(.12,.12,.05,0x233c50,-.19,2.48,.22);addBox(.12,.12,.05,0x233c50,.19,2.48,.22);
    addBox(.85,.9,.48,0x147bd1,0,1.55,0); // torso
    addBox(.28,.86,.3,0xffc99d,-.58,1.57,0);addBox(.28,.86,.3,0xffc99d,.58,1.57,0);
    addBox(.34,.72,.36,0x31557a,-.23,.72,0);addBox(.34,.72,.36,0x31557a,.23,.72,0);
    addBox(.36,.18,.5,0x263d55,-.23,.24,.06);addBox(.36,.18,.5,0x263d55,.23,.24,.06);
    const ground=new THREE.Mesh(new THREE.CircleGeometry(1.35,48),new THREE.MeshBasicMaterial({color:0x4a9fbd,transparent:true,opacity:.23}));ground.rotation.x=-Math.PI/2;ground.position.y=.04;scene.add(ground);
    let width=1,height=1;
    function resize(){const r=stage.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
    resize();const ro=new ResizeObserver(resize);ro.observe(stage);
    let down=false,lastX=0,rotation=0;
    renderer.domElement.style.touchAction='pan-y';
    renderer.domElement.addEventListener('pointerdown',e=>{down=true;lastX=e.clientX;renderer.domElement.setPointerCapture(e.pointerId);});
    renderer.domElement.addEventListener('pointermove',e=>{if(down){rotation+=(e.clientX-lastX)*.012;lastX=e.clientX;avatar.rotation.y=rotation;}});
    renderer.domElement.addEventListener('pointerup',()=>down=false);renderer.domElement.addEventListener('pointercancel',()=>down=false);
    function animate(){renderer.render(scene,camera);requestAnimationFrame(animate);}animate();
  }
  stages.forEach(makeAvatar);
})();