(() => {
  const $ = id => document.getElementById(id);
  const modal=$('authModal'), form=$('authForm'), message=$('authMessage');
  let mode='signup', client=null, currentUser=null;
  const cfg=window.BLOCKOS_CONFIG||{};
  if(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase){try{client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY)}catch(e){console.error(e)}}
  const on=(id,event,fn)=>$(id)?.addEventListener(event,fn);
  function setMessage(s,error=false){if(message){message.textContent=s;message.classList.toggle('error',error)}}
  function toast(s){const t=$('toast');t.textContent=s;t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),3500)}
  function openAuth(m='signup'){if(!modal)return;setMode(m);modal.classList.remove('hidden');document.body.style.overflow='hidden';setTimeout(()=>$(m==='signup'?'username':'email')?.focus(),60)}
  function closeAuth(){if(!modal)return;modal.classList.add('hidden');document.body.style.overflow='';setMessage('');form?.reset()}
  function setMode(m){mode=m;const signup=m==='signup';$('signupTab')?.classList.toggle('selected',signup);$('loginTab')?.classList.toggle('selected',!signup);if($('authTitle'))$('authTitle').textContent=signup?'Create an account':'Welcome back';if($('authSubtitle'))$('authSubtitle').textContent=signup?'Join Blockos Ville.':'Sign in to your account.';$('username')?.classList.toggle('hidden',!signup);if($('username'))$('username').required=signup;$('usernameLabel')?.classList.toggle('hidden',!signup);if($('password'))$('password').autocomplete=signup?'new-password':'current-password';if($('authSubmit'))$('authSubmit').textContent=signup?'Crear cuenta':'Iniciar sesión';setMessage('')}
  function displayUser(user,username){currentUser=user||null;const name=username||user?.user_metadata?.username||user?.email?.split('@')[0]||'Guest';if($('signedInAs'))$('signedInAs').textContent=user?name:'';if($('openAuth'))$('openAuth').textContent=user?'Cerrar sesión':'Iniciar sesión';$('headerSignup')?.classList.toggle('hidden',!!user);if($('profileName'))$('profileName').textContent=name;if($('profileMessage'))$('profileMessage').textContent=user?'Your profile is active.':'Sign in to view your profile.';if($('profileAction'))$('profileAction').textContent=user?'Cerrar sesión':'Crear mi cuenta';if(user)closeAuth()}
  async function refresh(){if(client){const {data}=await client.auth.getSession();if(data?.session){const u=data.session.user;const {data:p}=await client.from('profiles').select('username').eq('id',u.id).maybeSingle();displayUser(u,p?.username)}else displayUser(null);loadCatalog();loadAvatarInventory()}else{const raw=localStorage.getItem('blockos_demo_user');if(raw){try{const u=JSON.parse(raw);displayUser({email:u.email,user_metadata:{username:u.username}},u.username)}catch{localStorage.removeItem('blockos_demo_user');displayUser(null)}}else displayUser(null)}loadCatalog();loadAvatarInventory()}
  form?.addEventListener('submit',async e=>{e.preventDefault();const email=$('email').value.trim().toLowerCase(),password=$('password').value,username=$('username').value.trim();$('authSubmit').disabled=true;setMessage('');try{if(mode==='signup'&&!/^[a-zA-Z0-9_]{3,20}$/.test(username))throw Error('Username must be 3–20 letters, numbers or underscores.');if(client){if(mode==='signup'){const {data,error}=await client.auth.signUp({email,password,options:{data:{username}}});if(error)throw error;if(data.session){displayUser(data.user,username);toast('Account created.')}else setMessage('Account created. Check your email to confirm.')}else{const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;displayUser(data.user);toast('Signed in.')}}else{const users=JSON.parse(localStorage.getItem('blockos_demo_users')||'{}');if(mode==='signup'){if(users[email])throw Error('An account with this email already exists in this browser.');users[email]={username,password};localStorage.setItem('blockos_demo_users',JSON.stringify(users));localStorage.setItem('blockos_demo_user',JSON.stringify({email,username}));displayUser({email,user_metadata:{username}},username);toast('Demo account created in this browser only.')}else{if(!users[email]||users[email].password!==password)throw Error('Incorrect email or password.');const u={email,username:users[email].username};localStorage.setItem('blockos_demo_user',JSON.stringify(u));displayUser({email,user_metadata:{username:u.username}},u.username);toast('Signed in (demo).')}}}catch(err){setMessage(err.message||'Could not complete request.',true)}finally{$('authSubmit').disabled=false;$('authSubmit').textContent=mode==='signup'?'Crear cuenta':'Iniciar sesión'}});
  async function signOut(){if(client){const {error}=await client.auth.signOut();if(error){toast(error.message);return}}localStorage.removeItem('blockos_demo_user');displayUser(null);toast('Signed out.')}
  on('openAuth','click',()=>currentUser?signOut():openAuth('login'));on('headerSignup','click',()=>openAuth('signup'));on('profileAction','click',()=>currentUser?signOut():openAuth('signup'));on('signupTab','click',()=>setMode('signup'));on('loginTab','click',()=>setMode('login'));on('closeAuth','click',closeAuth);modal?.addEventListener('click',e=>{if(e.target===modal)closeAuth()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal&&!modal.classList.contains('hidden'))closeAuth()});
  document.querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>toast('“'+b.dataset.game+'” todavía no tiene un mundo jugable conectado.')));
  // Forum threads and replies use Supabase when configured. Demo mode is explicitly local.
  async function loadForum(){const host=$('forumPosts');if(!host)return;if(!client){let posts=[];try{posts=JSON.parse(localStorage.getItem('blockos_demo_forum')||'[]')}catch{}host.innerHTML=posts.length?posts.map(p=>'<article class="forum-post"><b>'+escapeHTML(p.title)+'</b><small> por '+escapeHTML(p.author)+'</small><p>'+escapeHTML(p.body)+'</p></article>').join(''):'<p>Aún no hay temas. Publica el primero en modo demostración.</p>';return}const {data,error}=await client.from('forum_posts').select('id,title,body,category,created_at,profiles(username)').order('created_at',{ascending:false}).limit(50);if(error){host.textContent='No se pudieron cargar los temas. Ejecuta el schema SQL de V5 en Supabase.';return}host.innerHTML=data.length?data.map(p=>'<article class="forum-post"><b>'+escapeHTML(p.title)+'</b> <small>['+escapeHTML(p.category)+'] por '+escapeHTML(p.profiles?.username||'Player')+' · '+new Date(p.created_at).toLocaleString()+'</small><p>'+escapeHTML(p.body)+'</p></article>').join(''):'<p>Aún no hay temas publicados.</p>'}
  on('forumForm','submit',async e=>{e.preventDefault();if(!currentUser){toast('Inicia sesión para publicar.');openAuth('login');return}const title=$('forumTitle').value.trim(),body=$('forumBody').value.trim(),category=$('forumCategory').value;if(!title||!body)return;const post={title,body,category,user_id:currentUser.id};if(client){const {error}=await client.from('forum_posts').insert(post);if(error){toast('No se pudo publicar: '+error.message);return}}else{const arr=JSON.parse(localStorage.getItem('blockos_demo_forum')||'[]');arr.unshift({...post,author:currentUser.user_metadata?.username||currentUser.email,created_at:new Date().toISOString()});localStorage.setItem('blockos_demo_forum',JSON.stringify(arr))}e.target.reset();toast('Tema publicado.');loadForum()});loadForum();
  // Help form records support requests in Supabase, or explains the demo limitation.
  on('helpForm','submit',async e=>{e.preventDefault();if(!currentUser){toast('Inicia sesión para enviar una solicitud.');openAuth('login');return}const subject=$('helpSubject').value.trim(),details=$('helpDetails').value.trim(),out=$('helpMessage');if(!client){out.textContent='Modo demostración: conecta Supabase para enviar una solicitud persistente.';return}const {error}=await client.from('support_requests').insert({user_id:currentUser.id,subject,details});out.textContent=error?'No se pudo enviar: '+error.message:'Solicitud enviada. El equipo aún no tiene un panel de soporte, así que guarda este número de confirmación: BV-'+Date.now().toString().slice(-6);if(!error)e.target.reset()});
  // A profile URL can display a public username lookup.
  async function loadPublicProfile(){if(!document.getElementById('publicProfile'))return;const name=new URLSearchParams(location.search).get('user');if(!name){$('publicProfile').textContent='Este es tu espacio de perfil. Busca un jugador desde People.';return}if(!client){$('publicProfile').textContent='Los perfiles públicos requieren Supabase.';return}const {data,error}=await client.from('profiles').select('username,created_at').eq('username',name).maybeSingle();$('publicProfile').innerHTML=error?'No se pudo cargar el perfil.':data?'<h2>'+escapeHTML(data.username)+'</h2><p>Miembro desde '+new Date(data.created_at).toLocaleDateString()+'</p>':'No se encontró ese jugador.'}loadPublicProfile();
  document.querySelectorAll('.wear-button').forEach(b=>b.addEventListener('click',()=>toast('El editor de ropa todavía está en desarrollo.')));
  on('peopleSearch','submit',async e=>{e.preventDefault();const q=$('peopleQuery').value.trim();const out=$('peopleResult');if(!q){out.textContent='Escribe un nombre para buscar.';return}if(!client){out.textContent='Conecta Supabase para buscar usuarios reales.';return}out.textContent='Buscando…';const {data,error}=await client.from('profiles').select('username,created_at').ilike('username','%'+q.replace(/[%_]/g,'')+'%').limit(30);if(error){out.textContent='No se pudo buscar: '+error.message;return}out.innerHTML=data.length?'<ul class="people-results">'+data.map(p=>'<li><a href="/profile.html?user='+encodeURIComponent(p.username)+'">'+escapeHTML(p.username)+'</a></li>').join('')+'</ul>':'No se encontraron jugadores.'});
  if(client)client.auth.onAuthStateChange((_event,session)=>{if(!session)displayUser(null)});refresh();
  const catalogSeed=[
    {id:'face-smile',name:'Classic Smile',category:'face',description:'Classic happy face.',price:0,image_url:'/assets/faces/classic-smile.svg',creator:'Blockos Ville'},
    {id:'face-serious',name:'Serious Face',category:'face',description:'A simple serious expression.',price:5,image_url:'/assets/faces/serious.svg',creator:'Blockos Ville'},
    {id:'face-silly',name:'Silly Face',category:'face',description:'A playful classic face.',price:8,image_url:'/assets/faces/silly.svg',creator:'Blockos Ville'},
    {id:'head-classic',name:'Classic Head',category:'head',description:'Classic R6 cylindrical head.',price:0,creator:'Blockos Ville'},
    {id:'hat-green',name:'Classic Green Cap',category:'hat',description:'A green baseball cap.',price:10,creator:'Blockos Ville'},
    {id:'hat-top',name:'Black Top Hat',category:'hat',description:'A classic black top hat.',price:25,creator:'Blockos Ville'},
    {id:'hat-crown',name:'Golden Crown',category:'hat',description:'A golden crown accessory.',price:50,creator:'Blockos Ville'},
    {id:'hat-party',name:'Party Cone',category:'hat',description:'A colorful party hat.',price:15,creator:'Blockos Ville'},
    {id:'shirt-blue',name:'Blue Classic Shirt',category:'shirt',description:'A blue long-sleeved classic shirt.',price:15,color:'#1479bd',creator:'Blockos Ville'},
    {id:'shirt-red',name:'Red Classic Shirt',category:'shirt',description:'A red long-sleeved classic shirt.',price:15,color:'#bd2828',creator:'Blockos Ville'},
    {id:'shirt-black',name:'Black Classic Shirt',category:'shirt',description:'A black classic shirt.',price:20,color:'#222222',creator:'Blockos Ville'},
    {id:'tshirt-logo',name:'Blockos Logo T-Shirt',category:'tshirt',description:'A short-sleeved logo tee.',price:10,color:'#e8e8e8',creator:'Blockos Ville'},
    {id:'tshirt-green',name:'Green T-Shirt',category:'tshirt',description:'A green short-sleeved tee.',price:10,color:'#39834b',creator:'Blockos Ville'},
    {id:'tshirt-yellow',name:'Yellow T-Shirt',category:'tshirt',description:'A yellow short-sleeved tee.',price:10,color:'#ffcc33',creator:'Blockos Ville'},
    {id:'pants-green',name:'Green Pants',category:'pants',description:'Classic green trousers.',price:12,color:'#39834b',creator:'Blockos Ville'},
    {id:'pants-blue',name:'Blue Pants',category:'pants',description:'Classic blue trousers.',price:12,color:'#3157a4',creator:'Blockos Ville'},
    {id:'pants-black',name:'Black Pants',category:'pants',description:'Classic black trousers.',price:15,color:'#252525',creator:'Blockos Ville'},
    {id:'hat-glasses',name:'Classic Glasses',category:'hat',description:'Black frame glasses.',price:18,creator:'Blockos Ville'},
    {id:'hat-winter',name:'Winter Beanie',category:'hat',description:'A rounded winter hat.',price:20,creator:'Blockos Ville'},
    {id:'hat-halo',name:'Golden Halo',category:'hat',description:'A floating golden ring.',price:35,creator:'Blockos Ville'}
  ];
  let catalogItems=[...catalogSeed], selectedCatalogCategory='all', currentEquipped={}, bodyColors={head:'#ffcc33',torso:'#1479bd',leftArm:'#ffcc33',rightArm:'#ffcc33',leftLeg:'#39834b',rightLeg:'#39834b'}, avatarRenderers=[];
  const demoKey='blockos_demo_inventory', equippedKey='blockos_demo_equipped', colorKey='blockos_demo_body_colors';
  function demoInventory(){try{return JSON.parse(localStorage.getItem(demoKey)||'[]')}catch{return []}}
  function demoEquipped(){try{return JSON.parse(localStorage.getItem(equippedKey)||'{}')}catch{return {}}}
  function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function coinBalance(){return Number(localStorage.getItem('blockos_demo_coins')||100)}
  async function getOwned(){if(client&&currentUser){const {data}=await client.from('inventory').select('item_id').eq('user_id',currentUser.id);return (data||[]).map(x=>x.item_id)}return demoInventory()}
  async function getCoins(){if(client&&currentUser){const {data}=await client.from('profiles').select('coins').eq('id',currentUser.id).maybeSingle();return Number(data?.coins??100)}return coinBalance()}
  function updateCoinLabels(n){['catalogCoins','avatarCoins'].forEach(id=>{if($(id))$(id).textContent='Blockos Coins: '+n})}
  function iconMarkup(i){if(i.category==='face')return `<img class="item-2d-face" src="${escapeHTML(i.image_url||'/assets/faces/classic-smile.svg')}" alt="${escapeHTML(i.name)}">`;if(i.category==='shirt'||i.category==='tshirt'||i.category==='pants')return `<img class="clothing-art ${i.category}" src="/assets/clothing/${escapeHTML(i.id)}.svg" alt="${escapeHTML(i.name)}">`;return `<canvas class="item-3d-preview" data-preview="${escapeHTML(i.id)}" aria-label="3D preview of ${escapeHTML(i.name)}"></canvas>`}
  let catalogLoadToken=0;
  async function loadCatalog(){
    const host=$('catalogItems');if(!host)return;
    const token=++catalogLoadToken;
    // Always show the built-in catalog first; a slow or unavailable Supabase request
    // must never leave the page stuck on its initial loading message.
    catalogItems=[...catalogSeed];
    renderCatalog(host, token);
    if(client){
      try{
        const remote=client.from('catalog_items').select('*').order('category').order('price');
        const result=await Promise.race([remote,new Promise(resolve=>setTimeout(()=>resolve({data:null,error:new Error('Catalog request timed out')}),5000))]);
        if(token!==catalogLoadToken)return;
        if(!result.error&&Array.isArray(result.data)&&result.data.length){
          catalogItems=result.data.map(db=>({...catalogSeed.find(x=>x.id===db.id),...db,category:db.category}));
          // Keep seeded items available if the database only contains a partial catalog.
          const ids=new Set(catalogItems.map(x=>x.id));
          catalogItems=[...catalogItems,...catalogSeed.filter(x=>!ids.has(x.id))];
        }
      }catch(err){console.warn('Catalog remote load failed; using built-in items.',err)}
    }
    if(token===catalogLoadToken)renderCatalog(host,token);
  }
  async function renderCatalog(host,token){
    const category=selectedCatalogCategory,q=($('catalogSearch')?.value||'').trim().toLowerCase();
    const items=catalogItems.filter(i=>(category==='all'||i.category===category)&&(!q||(String(i.name)+' '+String(i.description||'')+' '+String(i.category)).toLowerCase().includes(q)));
    let owned=[],coins=coinBalance();
    try{owned=await Promise.race([getOwned(),new Promise(resolve=>setTimeout(()=>resolve(demoInventory()),2500))])||[]}catch(e){console.warn('Could not load inventory for catalog.',e);owned=demoInventory()}
    try{coins=await Promise.race([getCoins(),new Promise(resolve=>setTimeout(()=>resolve(coinBalance()),2500))])}catch(e){console.warn('Could not load coin balance.',e)}
    if(token!==catalogLoadToken)return;
    updateCoinLabels(coins);
    host.innerHTML=items.map(i=>`<article class="catalog-item" id="${escapeHTML(i.id)}"><div class="item-icon">${iconMarkup(i)}</div><a class="item-name" href="#${escapeHTML(i.id)}">${escapeHTML(i.name)}</a><p>Updated: Recently</p><p>Creator: <a href="#">${escapeHTML(i.creator||'Blockos Ville')}</a></p><p>Number Sold: 0</p><p>Favorited: 0 times</p><p class="price">${Number(i.price)===0?'Free':`BC: ${Number(i.price)}`}</p>${owned.includes(i.id)?'<p class="owned">Owned</p>':'<button class="classic-button blue-button" data-buy="'+escapeHTML(i.id)+'">Buy</button>'}</article>`).join('')||'<p>No items found.</p>';
    const notice=$('catalogNotice');if(notice)notice.textContent=`You have ${coins} Blockos Coins. Buy items here, then equip them in Avatar.`;
    host.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>buyItem(b.dataset.buy)));
    host.querySelectorAll('.item-3d-preview').forEach(c=>makeItemPreview(c,c.dataset.preview));
  }
  async function buyItem(id){const item=catalogItems.find(x=>x.id===id);if(!item)return;if(client){if(!currentUser){toast('Inicia sesión para comprar artículos.');openAuth('login');return}const {data,error}=await client.rpc('purchase_catalog_item',{p_item_id:id});if(error){toast(error.message);return}toast(data==='owned'?'Ya tienes este artículo.':'¡Artículo comprado!')}else{const inv=demoInventory();if(inv.includes(id)){toast('Ya tienes este artículo.');return}let coins=coinBalance();if(coins<Number(item.price)){toast('No tienes suficientes Blockos Coins.');return}coins-=Number(item.price);inv.push(id);localStorage.setItem(demoKey,JSON.stringify(inv));localStorage.setItem('blockos_demo_coins',String(coins));toast('Comprado en modo demo; solo se guarda en este navegador.')}await loadCatalog();await loadAvatarInventory()}
  async function equipItem(id){const item=catalogItems.find(x=>x.id===id);if(!item)return;const owned=await getOwned();if(!owned.includes(id)){toast('Primero debes comprar este artículo.');return}if(client&&currentUser){const {error}=await client.rpc('equip_catalog_item',{p_item_id:id});if(error){toast(error.message);return}}else{const eq=demoEquipped();eq[item.category]=id;localStorage.setItem(equippedKey,JSON.stringify(eq))}toast('Artículo equipado.');await loadAvatarInventory()}
  async function unequipCategory(cat){if(client&&currentUser){const {error}=await client.from('avatar_equipped').delete().eq('user_id',currentUser.id).eq('category',cat);if(error){toast(error.message);return}}else{const eq=demoEquipped();delete eq[cat];localStorage.setItem(equippedKey,JSON.stringify(eq))}await loadAvatarInventory()}
  async function loadAvatarInventory(){const host=$('avatarInventory');if(!host)return;const owned=await getOwned();currentEquipped=demoEquipped();if(client&&currentUser){const {data}=await client.from('avatar_equipped').select('category,item_id').eq('user_id',currentUser.id);currentEquipped=Object.fromEntries((data||[]).map(x=>[x.category,x.item_id]));const {data:p}=await client.from('profiles').select('body_colors').eq('id',currentUser.id).maybeSingle();if(p?.body_colors)bodyColors={...bodyColors,...p.body_colors}}else{try{bodyColors={...bodyColors,...JSON.parse(localStorage.getItem(colorKey)||'{}')}}catch{}}
    const categories=['head','face','hat','tshirt','shirt','pants'];const label=$('avatarEquipped');if(label)label.innerHTML=categories.filter(c=>currentEquipped[c]).map(c=>{const i=catalogItems.find(x=>x.id===currentEquipped[c]);return i?`<div class="equipped-item"><b>${escapeHTML(c.toUpperCase())}</b> ${escapeHTML(i.name)} <button class="classic-button" data-remove="${c}">Remove</button></div>`:''}).join('')||'No items equipped yet.';
    host.innerHTML=owned.map(id=>{const i=catalogItems.find(x=>x.id===id);if(!i)return '';return `<article class="catalog-item inventory-item"><div class="item-icon">${iconMarkup(i)}</div><a class="item-name">${escapeHTML(i.name)}</a><p>${escapeHTML(i.category.toUpperCase())}</p>${currentEquipped[i.category]===id?'<p class="owned">Equipped</p>':'<button class="classic-button blue-button" data-equip="'+escapeHTML(id)+'">Wear</button>'}</article>`}).join('')||'<p>Your wardrobe is empty. <a href="/catalog.html">Shop the Catalog</a>.</p>';
    host.querySelectorAll('[data-equip]').forEach(b=>b.addEventListener('click',()=>equipItem(b.dataset.equip)));host.querySelectorAll('.item-3d-preview').forEach(c=>makeItemPreview(c,c.dataset.preview));label?.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>unequipCategory(b.dataset.remove)));updateCoinLabels(await getCoins());avatarRenderers.forEach(r=>r.update(bodyColors,currentEquipped,catalogItems));}
  on('catalogSearchButton','click',loadCatalog);on('catalogSearch','keydown',e=>{if(e.key==='Enter')loadCatalog()});document.querySelectorAll('[data-category]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const c=a.dataset.category;selectedCatalogCategory=c;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('selected',x===a));loadCatalog()}));document.querySelectorAll('[data-wardrobe]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const cat=a.dataset.wardrobe;document.querySelectorAll('#avatarInventory .inventory-item').forEach(card=>{card.style.display=cat==='all'||card.querySelector('p')?.textContent===cat.toUpperCase()?'':'none'})}));
  async function saveBodyColors(){const part=$('bodyPart')?.value,color=$('bodyColor')?.value;if(!part||!color)return;bodyColors[part]=color;if(client&&currentUser){const {error}=await client.from('profiles').update({body_colors:bodyColors}).eq('id',currentUser.id);if(error){toast('No se pudo guardar el color: '+error.message);return}}else localStorage.setItem(colorKey,JSON.stringify(bodyColors));avatarRenderers.forEach(r=>r.update(bodyColors,currentEquipped,catalogItems));toast('Color aplicado.');}
  on('applyBodyColor','click',saveBodyColors);document.querySelectorAll('.classic-color-swatches [data-color]').forEach(b=>b.addEventListener('click',()=>{if($('bodyColor'))$('bodyColor').value=b.dataset.color;saveBodyColors()}));on('redrawAvatar','click',e=>{e.preventDefault();avatarRenderers.forEach(r=>r.update(bodyColors,currentEquipped,catalogItems));});
  function makeItemPreview(canvas,id){
    if(!window.THREE||canvas.dataset.ready)return;
    const item=catalogItems.find(x=>x.id===id);if(!item)return;canvas.dataset.ready='1';
    const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    const scene=new THREE.Scene();scene.background=new THREE.Color('#ffffff');const camera=new THREE.PerspectiveCamera(35,1,.1,50);camera.position.set(3,2.4,4);camera.lookAt(0,.35,0);
    scene.add(new THREE.HemisphereLight(0xffffff,0x888888,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(3,5,4);scene.add(light);
    const g=new THREE.Group();scene.add(g);const mat=(c)=>new THREE.MeshStandardMaterial({color:c,roughness:.8});const box=(w,h,d,c,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);g.add(m);return m};
    const color=item.color||'#777777';
    if(item.category==='hat'){
      if(id==='hat-top'){g.add(new THREE.Mesh(new THREE.CylinderGeometry(.62,.62,.1,24),mat('#171717')));const a=new THREE.Mesh(new THREE.CylinderGeometry(.36,.42,.7,24),mat('#171717'));a.position.y=.38;g.add(a)}
      else if(id==='hat-crown'){g.add(new THREE.Mesh(new THREE.CylinderGeometry(.55,.6,.2,8),mat('#d6a900')));for(let n=0;n<5;n++){const a=new THREE.Mesh(new THREE.ConeGeometry(.14,.4,4),mat('#f7d548'));a.position.set(Math.cos(n*Math.PI*2/5)*.4,.28,Math.sin(n*Math.PI*2/5)*.4);g.add(a)}}
      else if(id==='hat-party'){const a=new THREE.Mesh(new THREE.ConeGeometry(.42,.85,12),mat('#e43e72'));a.position.y=.42;g.add(a);const b=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.08,16),mat('#f5c642'));g.add(b)}
      else if(id==='hat-glasses'){for(const x of [-.3,.3]){const a=new THREE.Mesh(new THREE.TorusGeometry(.22,.05,8,20),mat('#222222'));a.position.set(x,.2,.3);g.add(a)}box(.18,.05,.05,'#222222',0,.2,.3)}
      else if(id==='hat-halo'){const a=new THREE.Mesh(new THREE.TorusGeometry(.48,.07,10,32),mat('#e4bd19'));a.rotation.x=Math.PI/2;a.position.y=.3;g.add(a)}
      else {const capColor=id==='hat-green'?'#176b31':id==='hat-winter'?'#176d75':'#777777';const a=new THREE.Mesh(new THREE.SphereGeometry(.48,20,12,0,Math.PI*2,0,Math.PI/2),mat(capColor));a.position.y=.25;g.add(a);const b=new THREE.Mesh(new THREE.CylinderGeometry(.58,.58,.07,24),mat(capColor));b.position.y=.23;g.add(b)}
    } else if(item.category==='head'){const a=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.7,24),mat('#ffcc33'));g.add(a)}
    else { // Only a neutral stand-in for unexpected accessory types; never reuse the green cap.
      const a=new THREE.Mesh(new THREE.SphereGeometry(.34,16,12),mat('#aaaaaa'));g.add(a);
    }
    function resize(){const r=canvas.getBoundingClientRect();renderer.setSize(Math.max(50,r.width),Math.max(50,r.height),false);camera.aspect=Math.max(50,r.width)/Math.max(50,r.height);camera.updateProjectionMatrix()}resize();new ResizeObserver(resize).observe(canvas);
    let t=0;function frame(){if(!canvas.isConnected){renderer.dispose();return}t+=.008;g.rotation.y=t;renderer.render(scene,camera);requestAnimationFrame(frame)}frame();
  }
  function makeAvatar(stage){
    if(!stage||!window.THREE)return;const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(32,1,.1,100);camera.position.set(4,3,7);camera.lookAt(0,1.35,0);
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));stage.appendChild(renderer.domElement);scene.add(new THREE.HemisphereLight(0xffffff,0x777777,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(4,7,5);scene.add(light);
    const rig=new THREE.Group();scene.add(rig);const mat=(c,extra={})=>new THREE.MeshLambertMaterial({color:c,...extra});
    const addBox=(w,h,d,c,x,y,z,group=rig,extra={})=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c,extra));m.position.set(x,y,z);group.add(m);return m};
    function update(colors,equipped,items){
      while(rig.children.length){const o=rig.children[rig.children.length-1];rig.remove(o);if(o.geometry)o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(m){if(m.map)m.map.dispose();m.dispose()}})}
      const c={...bodyColors,...colors};const itemByCat=cat=>items.find(i=>i.id===equipped[cat]);const shirt=itemByCat('shirt'),tee=itemByCat('tshirt'),pants=itemByCat('pants');
      // Body colors are independent from clothing: garments are separate outer meshes.
      const head=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.72,32),mat(c.head));head.position.set(0,2.45,0);rig.add(head);
      const faceItem=itemByCat('face');const texture=new THREE.TextureLoader().load(faceItem?.image_url||'/assets/faces/classic-smile.svg');texture.colorSpace=THREE.SRGBColorSpace;
      const face=new THREE.Mesh(new THREE.PlaneGeometry(.58,.58),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));face.position.set(0,2.45,.395);rig.add(face);
      addBox(.86,.92,.48,c.torso,0,1.55,0);addBox(.34,.92,.42,c.leftArm,-.62,1.55,0);addBox(.34,.92,.42,c.rightArm,.62,1.55,0);addBox(.38,.88,.43,c.leftLeg,-.23,.64,0);addBox(.38,.88,.43,c.rightLeg,.23,.64,0);
      if(shirt){const sc=shirt.color||'#1479bd';addBox(.89,.94,.505,sc,0,1.55,0);addBox(.365,.95,.445,sc,-.62,1.55,0);addBox(.365,.95,.445,sc,.62,1.55,0); // long sleeves
        // collar and center placket details make this a garment, not body paint
        addBox(.25,.09,.025,'#eeeeee',0,2.005,.267);addBox(.035,.56,.018,'#eeeeee',0,1.55,.264);for(let y of [1.72,1.55,1.38])addBox(.025,.025,.02,'#333333',.06,y,.276);
      } else if(tee){ // a T-shirt is a transparent front graphic/pin; it never recolors the torso or arms.
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,256,256);
        if(tee.id==='tshirt-logo'){ctx.fillStyle='#126bb5';ctx.font='bold 54px Arial';ctx.textAlign='center';ctx.fillText('BLOCKOS',128,105);ctx.fillStyle='#e3a62f';ctx.fillRect(78,125,100,10);ctx.font='bold 24px Arial';ctx.fillStyle='#222';ctx.fillText('VILLE',128,170)}
        else {ctx.fillStyle=tee.color||'#39834b';ctx.beginPath();ctx.arc(128,128,54,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=8;ctx.stroke();ctx.fillStyle='#ffffff';ctx.font='bold 42px Arial';ctx.textAlign='center';ctx.fillText(tee.id==='tshirt-green'?'B': '★',128,143)}
        const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const decal=new THREE.Mesh(new THREE.PlaneGeometry(.56,.58),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));decal.position.set(0,1.55,.253);rig.add(decal);
      }
      if(pants){const pc=pants.color||'#3157a4';// trouser legs sit over the original legs with a narrow center seam and pockets
        addBox(.405,.9,.455,pc,-.23,.64,.008);addBox(.405,.9,.455,pc,.23,.64,.008);addBox(.025,.54,.018,'#222222',0,.69,.242);addBox(.12,.11,.018,'#dddddd',-.23,.94,.245);addBox(.12,.11,.018,'#dddddd',.23,.94,.245);
      }
      const hat=itemByCat('hat');if(hat){const hc=hat.id==='hat-green'?'#176b31':hat.id==='hat-crown'?'#d6a900':hat.id==='hat-party'?'#e43e72':hat.id==='hat-halo'?'#e4bd19':hat.id==='hat-winter'?'#176d75':hat.id==='hat-top'?'#171717':'#222222';
        if(hat.id==='hat-glasses'){for(const x of [-.2,.2]){const lens=new THREE.Mesh(new THREE.TorusGeometry(.13,.035,8,18),mat(hc));lens.position.set(x,2.45,.405);rig.add(lens)}addBox(.12,.035,.035,hc,0,2.45,.41)}
        else if(hat.id==='hat-halo'){const a=new THREE.Mesh(new THREE.TorusGeometry(.45,.065,8,28),mat(hc));a.rotation.x=Math.PI/2;a.position.y=2.95;rig.add(a)}
        else if(hat.id==='hat-crown'){const a=new THREE.Mesh(new THREE.CylinderGeometry(.4,.42,.18,8),mat(hc));a.position.y=2.91;rig.add(a);for(let n=0;n<5;n++){const sp=new THREE.Mesh(new THREE.ConeGeometry(.11,.28,4),mat('#f7d548'));sp.position.set(Math.cos(n*Math.PI*2/5)*.3,3.1,Math.sin(n*Math.PI*2/5)*.3);rig.add(sp)}}
        else if(hat.id==='hat-top'){const a=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.09,24),mat(hc));a.position.y=2.85;rig.add(a);const b=new THREE.Mesh(new THREE.CylinderGeometry(.32,.36,.55,24),mat(hc));b.position.y=3.15;rig.add(b)}
        else {const a=new THREE.Mesh(new THREE.SphereGeometry(.4,20,12,0,Math.PI*2,0,Math.PI/2),mat(hc));a.position.y=2.78;rig.add(a);const b=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.07,24),mat(hc));b.position.y=2.8;rig.add(b)}
      }
    }
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(4,4),mat('#ffffff'));floor.rotation.x=-Math.PI/2;floor.position.y=.12;scene.add(floor);let rot=0,down=false,last=0;
    function resize(){const r=stage.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);camera.updateProjectionMatrix()}new ResizeObserver(resize).observe(stage);resize();renderer.domElement.style.touchAction='pan-y';renderer.domElement.addEventListener('pointerdown',e=>{down=true;last=e.clientX;renderer.domElement.setPointerCapture(e.pointerId)});renderer.domElement.addEventListener('pointermove',e=>{if(down){rot+=(e.clientX-last)*.012;last=e.clientX;rig.rotation.y=rot}});renderer.domElement.addEventListener('pointerup',()=>down=false);renderer.domElement.addEventListener('pointercancel',()=>down=false);function frame(){renderer.render(scene,camera);requestAnimationFrame(frame)}frame();const api={update};avatarRenderers.push(api);update(bodyColors,currentEquipped,catalogItems);return api;
  }
  makeAvatar($('heroAvatar'));makeAvatar($('profileAvatar'));makeAvatar($('avatarEditor'));loadCatalog();loadAvatarInventory();
})();


