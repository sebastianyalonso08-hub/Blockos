(() => {
  const $ = id => document.getElementById(id);
  const modal=$('authModal'), form=$('authForm'), message=$('authMessage');
  let mode='signup', client=null, currentUser=null;
  // The account gate is shown synchronously, before any network request or 3D setup.
  document.body.classList.add('auth-required');
  if(modal){modal.classList.remove('hidden');document.body.style.overflow='hidden';}
  const cfg=window.BLOCKOS_CONFIG||{};
  if(window.supabase){try{client=window.supabase.createClient()}catch(e){console.error(e)}}
  const on=(id,event,fn)=>$(id)?.addEventListener(event,fn);
  function setMessage(s,error=false){if(message){message.textContent=s;message.classList.toggle('error',error)}}
  function toast(s){const t=$('toast');t.textContent=s;t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),3500)}
  function authAlias(username){return username.trim().toLowerCase()+'@accounts.blockosville.invalid'}
  function openAuth(m='signup'){if(!modal)return;if(!currentUser)document.body.classList.add('auth-required');setMode(m);modal.classList.remove('hidden');document.body.style.overflow='hidden';setTimeout(()=>$('username')?.focus(),60)}
  function closeAuth(){if(!modal||!currentUser)return;modal.classList.add('hidden');document.body.style.overflow='';setMessage('');form?.reset()}
  function setMode(m){mode=m;const signup=m==='signup';$('signupTab')?.classList.toggle('selected',signup);$('loginTab')?.classList.toggle('selected',!signup);if($('authTitle'))$('authTitle').textContent=signup?'Create an account':'Welcome back';if($('authSubtitle'))$('authSubtitle').textContent=signup?'Join Blockos Ville.':'Sign in to your account.';$('username')?.classList.remove('hidden');if($('username'))$('username').required=true;$('usernameLabel')?.classList.remove('hidden');if($('password'))$('password').autocomplete=signup?'new-password':'current-password';if($('authSubmit'))$('authSubmit').textContent=signup?'Create Account':'Log In';setMessage('')}
  function displayUser(user,username){
    currentUser=user||null;
    document.body.classList.toggle('auth-required',!currentUser);
    const scope=user?(user.id||user.user_metadata?.username||user.email||'account'):'';
    const safeScope=String(scope).toLowerCase().replace(/[^a-z0-9_-]/g,'_');
    equippedKey='blockos_'+safeScope+'_equipped';colorKey='blockos_'+safeScope+'_body_colors';coinsKey='blockos_'+safeScope+'_coins';
    const name=username||user?.user_metadata?.username||user?.email?.split('@')[0]||'';
    if($('signedInAs'))$('signedInAs').textContent=user?name:'';
    if($('openAuth'))$('openAuth').textContent=user?'Sign Out':'Log In';
    $('headerSignup')?.classList.toggle('hidden',!!user);
    if($('profileName'))$('profileName').textContent=name;
    if($('profileMessage'))$('profileMessage').textContent=user?'Your profile is active.':'Create an account or log in to continue.';
    if($('profileAction'))$('profileAction').textContent=user?'Sign Out':'Create Account';
    if(user)closeAuth();
  }
  async function refresh(){
    let sessionUser=null;
    try {
      if(client){
        const {data,error}=await client.auth.getSession();
        if(error)console.warn('Session restore failed:',error.message);
        sessionUser=data?.session?.user||null;
      }
    } catch(error) { console.error('Session restore failed:',error); }
    if(sessionUser){
      const fallbackName=sessionUser.user_metadata?.username||sessionUser.username||sessionUser.email?.split('@')[0]||'Player';
      displayUser(sessionUser,fallbackName);
      try {
        const {data:p,error}=await client.from('profiles').select('username').eq('id',sessionUser.id).maybeSingle();
        if(error)console.warn('Profile name lookup failed:',error.message);
        if(p?.username&&currentUser?.id===sessionUser.id)displayUser(sessionUser,p.username);
      } catch(error){console.warn('Profile name lookup failed:',error)}
    } else {
      displayUser(null);
      openAuth('signup');
    }
    // A failing page request must not leave another page permanently in "Loading".
    const tasks=[
      ['catalog',()=>loadCatalog().then(()=>renderItemDetail())],
      ['avatar',()=>loadAvatarInventory()],
      ['profile',()=>loadPublicProfile()],
      ['people',()=>searchPeople($('peopleQuery')?.value.trim()||'')],
      ['friends',()=>loadFriendsPage()]
    ];
    await Promise.all(tasks.map(async([name,fn])=>{try{await fn()}catch(error){console.error(name+' page load failed:',error);const targets={catalog:'catalogItems',avatar:'avatarInventory',profile:'publicProfile',people:'peopleResult',friends:'friendsContent'};const target=$(targets[name]);if(target)target.textContent='Could not load this section. Please try again.'}}));
    if(!currentUser)openAuth('signup');
  }
  form?.addEventListener('submit',async e=>{
    e.preventDefault();
    const username=$('username').value.trim(),password=$('password').value,email=authAlias(username);
    $('authSubmit').disabled=true;setMessage('');
    try{
      if(!/^[a-zA-Z0-9_]{3,20}$/.test(username))throw Error('Username must be 3–20 letters, numbers or underscores.');
      if(password.length<8)throw Error('Password must be at least 8 characters.');
      if(!client)throw Error('Account service could not start. Please reload the page.');
      if(mode==='signup'){
        const {data,error}=await client.auth.signUp({email,password,options:{data:{username}}});
        if(error)throw error;
        if(data.session){displayUser(data.user,username);await refresh();toast('Account created.');}
        else setMessage('Account created. If email confirmation is enabled, confirm your account before logging in.');
      }else{
        const {data,error}=await client.auth.signInWithPassword({email,password});
        if(error)throw Error('Login failed. Check your username and password.');
        displayUser(data.user,username);await refresh();toast('Signed in.');
      }
    }catch(err){setMessage(err.message||'Could not complete request.',true)}
    finally{$('authSubmit').disabled=false;$('authSubmit').textContent=mode==='signup'?'Create Account':'Log In'}
  });
  async function signOut(){
    if(client){const {error}=await client.auth.signOut();if(error){toast(error.message);return}}
    currentUser=null;
    resetSignedOutState();
    displayUser(null);
    await loadAvatarInventory();
    await loadCatalog();renderItemDetail();
    await loadPublicProfile();await searchPeople('');await loadFriendsPage();
    openAuth('signup');
  }
  const DEFAULT_BODY_COLORS={head:'#ffcc33',torso:'#1479bd',leftArm:'#ffcc33',rightArm:'#ffcc33',leftLeg:'#39834b',rightLeg:'#39834b'};
  function resetSignedOutState(){
    currentEquipped={};bodyColors={...DEFAULT_BODY_COLORS};
    avatarRenderers.forEach(r=>r.update(bodyColors,{},catalogItems));
    const label=$('avatarEquipped');if(label)label.textContent='Sign in to view your wardrobe.';
    const host=$('avatarInventory');if(host)host.innerHTML='<p>Create an account or log in to view your wardrobe.</p>';
    updateCoinLabels(0);
  }
  on('openAuth','click',()=>currentUser?signOut():openAuth('login'));on('headerSignup','click',()=>openAuth('signup'));on('profileAction','click',()=>currentUser?signOut():openAuth('signup'));on('signupTab','click',()=>setMode('signup'));on('loginTab','click',()=>setMode('login'));on('closeAuth','click',closeAuth);modal?.addEventListener('click',e=>{if(e.target===modal)closeAuth()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal&&!modal.classList.contains('hidden'))closeAuth()});
  document.querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>toast('“'+b.dataset.game+'” is not connected to a playable world yet.')));
  async function loadForum(){const host=$('forumPosts');if(!host)return;if(!client){host.innerHTML='<p>Forum is unavailable until account services are configured.</p>';return}const {data,error}=await client.from('forum_posts').select('id,title,body,category,created_at,user_id,profiles(id,username)').order('created_at',{ascending:false}).limit(50);if(error){host.textContent='Could not load topics. Please try again later.';return}host.innerHTML=data.length?data.map(p=>'<article class="forum-post"><b>'+escapeHTML(p.title)+'</b> <small>['+escapeHTML(p.category)+'] by '+'<a href="/profile.html?id='+encodeURIComponent(p.profiles?.id||p.user_id||'')+'">'+escapeHTML(p.profiles?.username||'Player')+'</a> · '+new Date(p.created_at).toLocaleString()+'</small><p>'+escapeHTML(p.body)+'</p></article>').join(''):'<p>No topics have been published yet.</p>'}
  on('forumForm','submit',async e=>{e.preventDefault();if(!currentUser){toast('Please sign in to publish.');openAuth('login');return}const title=$('forumTitle').value.trim(),body=$('forumBody').value.trim(),category=$('forumCategory').value;if(!title||!body)return;const post={title,body,category,user_id:currentUser.id};if(!client){openAuth('signup');return}const {error}=await client.from('forum_posts').insert(post);if(error){toast('Could not publish: '+error.message);return}e.target.reset();toast('Topic published.');loadForum()});loadForum();
  // Help form records support requests in the Blockos Ville backend.
  on('helpForm','submit',async e=>{e.preventDefault();if(!currentUser){toast('Please sign in to send a support request.');openAuth('login');return}const subject=$('helpSubject').value.trim(),details=$('helpDetails').value.trim(),out=$('helpMessage');if(!client){out.textContent='Please try again after reloading the page.';return}const {error}=await client.from('support_requests').insert({user_id:currentUser.id,subject,details});out.textContent=error?'Could not submit: '+error.message:'Request submitted. The team does not have a support dashboard yet. Save this confirmation number: BV-'+Date.now().toString().slice(-6);if(!error)e.target.reset()});
  // My Profile resolves the signed-in account first, then loads the requested immutable account ID.
  // Username URLs are supported only as a compatibility fallback.
  async function loadPublicProfile(){
    const host=$('publicProfile'); if(!host)return;
    const params=new URLSearchParams(location.search);
    const requestedId=params.get('id');
    const requestedName=params.get('user')||params.get('username');
    host.innerHTML='<p>Loading profile…</p>';
    let profile=null, ownerId=null;
    if(client){
      if(!currentUser){host.innerHTML='<p>Create an account or log in to view profiles.</p>';openAuth('signup');return;}
      let query=client.from('profiles').select('id,username,created_at,description,body_colors');
      if(requestedId)query=query.eq('id',requestedId);
      else if(requestedName)query=query.ilike('username',requestedName);
      else query=query.eq('id',currentUser.id);
      const {data,error}=await query.maybeSingle();
      if(error){console.error('Profile lookup failed:',error);host.innerHTML='<p>Could not load this profile. Check the profiles table and its Row Level Security policies.</p>';return;}
      profile=data; ownerId=data?.id||null;
    }else{
      host.innerHTML='<p>Please log in to view profiles.</p>';
      return;
    }
    if(!profile){host.innerHTML='<h2>Player not found</h2><p>This account could not be found. Open the player from the People page so the profile link uses the correct account ID.</p>';return;}
    const own=!!currentUser&&String(ownerId)===String(currentUser.id);
    const name=profile.username||'Player';
    if($('profileName'))$('profileName').textContent=name;
    if($('profileMessage'))$('profileMessage').textContent='Account ID: '+String(profile.id).padStart(4,'0');
    const action=$('profileAction');if(action){action.classList.toggle('hidden',!own);action.textContent=own?'Sign Out':'Create Account';}
    const details=document.querySelector('.profile-details');
    if(details){
      details.innerHTML=`<h2>${escapeHTML(name)}</h2><p><b>Account ID:</b> <code>${escapeHTML(profile.id)}</code></p><p><b>Member since:</b> ${new Date(profile.created_at).toLocaleDateString('en-US')}</p><hr><h2>Description</h2><p id="profileDescriptionText">${escapeHTML(profile.description||'This user has not written a description yet.')}</p>${own?'<form id="descriptionForm"><label for="profileDescriptionInput">Edit your description</label><textarea id="profileDescriptionInput" maxlength="500" rows="5" placeholder="Tell everyone a little about yourself..."></textarea><button class="classic-button blue-button" type="submit">Save Description</button><p id="descriptionStatus" role="status"></p></form>':''}`;
      if(own&&$('profileDescriptionInput'))$('profileDescriptionInput').value=profile.description||'';
      on('descriptionForm','submit',async e=>{
        e.preventDefault();if(!currentUser||String(currentUser.id)!==String(ownerId))return;
        const value=$('profileDescriptionInput').value.trim(),status=$('descriptionStatus');
        if(client){const {error}=await client.from('profiles').update({description:value}).eq('id',currentUser.id);if(error){status.textContent='Could not save description: '+error.message;return;}}
        else{status.textContent='Please log in to save changes.';return;}
        profile.description=value;$('profileDescriptionText').textContent=value||'This user has not written a description yet.';status.textContent='Description saved.';
      });
    }
    const stage=$('profileAvatar');
    if(stage){
      if(own){publicProfileRenderer?.update(bodyColors,currentEquipped,catalogItems);}
      else if(client&&ownerId){
        const [{data:colorData},{data:eq}]=await Promise.all([
          client.from('profiles').select('body_colors').eq('id',ownerId).maybeSingle(),
          client.from('avatar_equipped').select('category,item_id').eq('user_id',ownerId)
        ]);
        publicProfileRenderer?.update({...bodyColors,...(colorData?.body_colors||profile.body_colors||{})},Object.fromEntries((eq||[]).map(x=>[x.category,x.item_id])),catalogItems);
      }else{publicProfileRenderer?.update({...bodyColors,...(profile.body_colors||{})},{},catalogItems);}
    }
  }
  document.querySelectorAll('.wear-button').forEach(b=>b.addEventListener('click',()=>toast('The clothing editor is still in development.')));
  async function renderPeopleResults(players){
    const out=$('peopleResult');if(!out)return;
    const self=currentUser?.id;
    const safePlayers=(players||[]).filter(p=>p&&p.id&&p.username);
    let requests=[];
    if(self&&client){
      const [sent,received]=await Promise.all([
        client.from('friend_requests').select('id,status,sender_id,receiver_id').eq('sender_id',self).limit(500),
        client.from('friend_requests').select('id,status,sender_id,receiver_id').eq('receiver_id',self).limit(500)
      ]);
      if(sent.error)throw new Error('Could not load sent friend requests: '+sent.error.message);
      if(received.error)throw new Error('Could not load received friend requests: '+received.error.message);
      requests=[...(sent.data||[]),...(received.data||[])];
    }
    const byPlayer=new Map();
    for(const request of requests){
      const other=String(request.sender_id)===String(self)?String(request.receiver_id):String(request.sender_id);
      const previous=byPlayer.get(other);
      if(request.status==='accepted'||!previous)byPlayer.set(other,request);
    }
    let html='<ul class="people-results">';
    for(const p of safePlayers){
      const isSelf=!!self&&String(p.id)===String(self);let state='none',action='';
      if(!isSelf&&currentUser){
        const request=byPlayer.get(String(p.id));
        if(request){if(request.status==='accepted')state='Friends';else if(String(request.sender_id)===String(self))state='Request Sent';else if(request.status==='pending')state='Respond in Your Friends';}
        action=state==='none'?`<button class="classic-button" type="button" data-friend-request="${escapeHTML(p.id)}">Add Friend</button>`:`<span>${escapeHTML(state)}</span>`;
      }
      html+=`<li><a href="/profile.html?id=${encodeURIComponent(p.id)}">${escapeHTML(p.username)}</a>${isSelf?' (You)':''} ${action}</li>`;
    }
    out.innerHTML=html+'</ul>';
    if(!safePlayers.length)out.innerHTML='<p>No players found.</p>';
  }
  async function searchPeople(q=''){
    const out=$('peopleResult');if(!out)return;
    if(!currentUser){out.innerHTML='<p>Create an account or log in to find players.</p>';return;}
    if(!client){out.innerHTML='<p>Please log in to find players.</p>';openAuth('signup');return;}
    out.textContent='Loading players…';
    try {
      let query=client.from('profiles').select('id,username,created_at').order('created_at',{ascending:false}).limit(100);
      if(q)query=query.ilike('username','%'+q.replace(/[%,_]/g,'')+'%');
      const {data,error}=await query;
      if(error)throw new Error(error.message||'Player search failed');
      await renderPeopleResults(data||[]);
    } catch(error) { out.textContent='Could not load players: '+(error.message||'request failed')+' '; const retry=document.createElement('button');retry.className='classic-button';retry.textContent='Try again';retry.addEventListener('click',()=>searchPeople(q));out.appendChild(retry);console.error('People query failed:',error); }
  }
  on('peopleSearch','submit',async e=>{e.preventDefault();const q=$('peopleQuery').value.trim();$('peopleResult').textContent='Searching…';await searchPeople(q)});
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-friend-request]');if(!b)return;if(!currentUser){toast('Please log in to add friends.');openAuth('login');return}const receiver=b.dataset.friendRequest;if(receiver===currentUser.id)return;b.disabled=true;if(client){const {error}=await client.from('friend_requests').insert({sender_id:currentUser.id,receiver_id:receiver,status:'pending'});if(error)toast(error.code==='23505'?'A request already exists.':error.message);else toast('Friend request sent.')}else{toast('Please try again after reloading the page.');return}await searchPeople($('peopleQuery')?.value.trim()||'')});
  async function loadFriendsPage(){const host=$('friendsContent');if(!host)return;if(!currentUser){host.innerHTML='<p>Please log in to view your friends and requests.</p>';return}if(client){const {data,error}=await client.from('friend_requests').select('id,status,sender_id,receiver_id,created_at,sender:profiles!friend_requests_sender_id_fkey(id,username),receiver:profiles!friend_requests_receiver_id_fkey(id,username)').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order('created_at',{ascending:false});if(error){host.textContent='Could not load friends: '+(error.message||'request failed')+'.';return}const rows=data||[];const accepted=rows.filter(r=>r.status==='accepted');const sent=rows.filter(r=>r.status==='pending'&&r.sender_id===currentUser.id);const received=rows.filter(r=>r.status==='pending'&&r.receiver_id===currentUser.id);const section=(title,items,kind)=>`<h2>${title}</h2>${items.length?'<ul>'+items.map(r=>{const other=r.sender_id===currentUser.id?r.receiver:r.sender;return `<li><a href="/profile.html?id=${encodeURIComponent(other?.id||'')}">${escapeHTML(other?.username||'Player')}</a>${kind==='received'?` <button class="classic-button blue-button" data-friend-accept="${r.id}">Accept</button> <button class="classic-button" data-friend-reject="${r.id}">Reject</button>`:kind==='sent'?' <small>Request sent</small>':''}</li>`}).join('')+'</ul>':'<p>None yet.</p>'}`;host.innerHTML=section('Your Friends',accepted,'friends')+section('Incoming Requests',received,'received')+section('Sent Requests',sent,'sent');}else{host.innerHTML='<p>Please log in to use friends.</p>';}}
  document.addEventListener('click',async e=>{const accept=e.target.closest('[data-friend-accept]'),reject=e.target.closest('[data-friend-reject]');if(!accept&&!reject)return;const id=(accept||reject).dataset.friendAccept||(reject||accept).dataset.friendReject;const status=accept?'accepted':'rejected';if(client){const {error}=await client.from('friend_requests').update({status}).eq('id',id).eq('receiver_id',currentUser.id);if(error){toast('Could not update request: '+error.message);return}}else{toast('Please try again after reloading the page.');return}toast(accept?'Friend request accepted.':'Friend request rejected.');loadFriendsPage()});loadFriendsPage();
  if(client)client.auth.onAuthStateChange((event,session)=>{if(event==='INITIAL_SESSION')return;if(session){(async()=>{const {data:p}=await client.from('profiles').select('username').eq('id',session.user.id).maybeSingle();displayUser(session.user,p?.username||session.user.user_metadata?.username||session.user.email?.split('@')[0]);await loadAvatarInventory();loadCatalog().then(()=>renderItemDetail());await loadPublicProfile();await searchPeople($('peopleQuery')?.value.trim()||'');await loadFriendsPage()})()}else if(event==='SIGNED_OUT'){displayUser(null);currentEquipped={};bodyColors={head:'#ffcc33',torso:'#1479bd',leftArm:'#ffcc33',rightArm:'#ffcc33',leftLeg:'#39834b',rightLeg:'#39834b'};avatarRenderers.forEach(r=>r.update(bodyColors,{},catalogItems));resetSignedOutState();loadAvatarInventory();loadPublicProfile();searchPeople();loadFriendsPage();openAuth('signup')}});
  // Catalog items are loaded only from the configured database. No built-in demo inventory.
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
  let catalogItems=[...catalogSeed], selectedCatalogCategory='all', currentEquipped={}, bodyColors={head:'#ffcc33',torso:'#1479bd',leftArm:'#ffcc33',rightArm:'#ffcc33',leftLeg:'#39834b',rightLeg:'#39834b'}, avatarRenderers=[], publicProfileRenderer=null;
  let equippedKey='', colorKey='', coinsKey='';
  function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  async function getOwned(){if(!client||!currentUser)return [];const {data,error}=await client.from('inventory').select('item_id').eq('user_id',currentUser.id);if(error)throw new Error(error.message||'Could not load your inventory');return Array.isArray(data)?data.map(x=>String(x.item_id)):[]}
  async function getCoins(){if(!client||!currentUser)return 0;const {data}=await client.from('profiles').select('coins').eq('id',currentUser.id).maybeSingle();return Number(data?.coins??0)}
  function updateCoinLabels(n){['catalogCoins','avatarCoins'].forEach(id=>{if($(id))$(id).textContent='Blockos Coins: '+n})}
  function iconMarkup(i){if(i.category==='face')return `<img class="item-2d-face" src="${escapeHTML(i.image_url||'/assets/faces/classic-smile.svg')}" alt="${escapeHTML(i.name)}">`;if(i.category==='shirt'||i.category==='tshirt'||i.category==='pants')return `<img class="clothing-art ${i.category}" src="/assets/clothing/${escapeHTML(i.id)}.svg" alt="${escapeHTML(i.name)}">`;return `<canvas class="item-3d-preview" data-preview="${escapeHTML(i.id)}" aria-label="3D preview of ${escapeHTML(i.name)}"></canvas>`}
  let catalogLoadToken=0;
  async function loadCatalog(){
    const host=$('catalogItems');if(!host)return;
    const token=++catalogLoadToken;
    // Always show the built-in catalog first; a slow or unavailable backend request
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
    if(token===catalogLoadToken){await renderCatalog(host,token);avatarRenderers.forEach(r=>r.update(bodyColors,currentEquipped,catalogItems));}
  }
  async function renderCatalog(host,token){
    const category=selectedCatalogCategory,q=($('catalogSearch')?.value||'').trim().toLowerCase();
    const items=catalogItems.filter(i=>(category==='all'||i.category===category)&&(!q||(String(i.name)+' '+String(i.description||'')+' '+String(i.category)).toLowerCase().includes(q)));
    let owned=[],coins=0,ownedLoadError=null;
    try{owned=await getOwned()}catch(e){console.warn('Could not load inventory for catalog.',e);ownedLoadError=e}
    try{coins=await Promise.race([getCoins(),new Promise(resolve=>setTimeout(()=>resolve(0),2500))])}catch(e){console.warn('Could not load coin balance.',e);coins=0}
    if(token!==catalogLoadToken)return;
    updateCoinLabels(coins);
    host.innerHTML=items.map(i=>`<article class="catalog-item" id="${escapeHTML(i.id)}"><div class="item-icon">${iconMarkup(i)}</div><a class="item-name" href="/item.html?id=${encodeURIComponent(i.id)}">${escapeHTML(i.name)}</a><p>Updated: Recently</p><p>Creator: <a href="/profile.html?user=${encodeURIComponent(i.creator||'Blockos Ville')}">${escapeHTML(i.creator||'Blockos Ville')}</a></p><p>Number Sold: ${Number(i.sold_count ?? 0)}</p><p>Favorited: 0 times</p><p class="price">${Number(i.price)===0?'Free':`BC: ${Number(i.price)}`}</p>${owned.includes(i.id)?'<p class="owned">Owned</p>':ownedLoadError?'<p class="owned-status-error">Ownership unavailable — retry after connection returns.</p>':'<button class="classic-button blue-button" data-buy="'+escapeHTML(i.id)+'">Buy</button>'}</article>`).join('')||'<p>No items found.</p>';
    const notice=$('catalogNotice');if(notice)notice.textContent=`You have ${coins} Blockos Coins. Buy items here, then equip them in Avatar.`;
    host.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>buyItem(b.dataset.buy)));
    host.querySelectorAll('.item-3d-preview').forEach(c=>makeItemPreview(c,c.dataset.preview));
  }
  async function buyItem(id){const item=catalogItems.find(x=>x.id===id);if(!item)return;if(!currentUser||!client){openAuth('signup');return}const {data,error}=await client.rpc('purchase_catalog_item',{p_item_id:id});if(error){toast(error.message);return}const result=data?.data??data;toast(result==='owned'?'You already own this item.':'Item purchased!');await loadCatalog();await loadAvatarInventory()}
  async function equipItem(id){if(!currentUser||!client){openAuth('signup');return}const item=catalogItems.find(x=>x.id===id);if(!item)return;const owned=await getOwned();if(!owned.includes(id)){toast('You must buy this item first.');return}const {error}=await client.rpc('equip_catalog_item',{p_item_id:id});if(error){toast(error.message);return}toast('Item equipped.');await loadAvatarInventory()}
  async function unequipCategory(cat){if(!currentUser||!client){openAuth('signup');return}const {error}=await client.from('avatar_equipped').delete().eq('user_id',currentUser.id).eq('category',cat);if(error){toast(error.message);return}await loadAvatarInventory()}
  async function loadAvatarInventory(){
    const host=$('avatarInventory');
    const requestedUserId=currentUser?.id||null;
    if(!requestedUserId){
      resetSignedOutState();
      if(host)host.innerHTML='<p>Create an account or log in to view your wardrobe.</p>';
      return;
    }
    if(host)host.innerHTML='<p>Loading your inventory…</p>';
    try {
      const owned=await getOwned();
      if((currentUser?.id||null)!==requestedUserId)return;
      currentEquipped={};
      const [{data:eq,error:eqError},{data:p,error:profileError}]=await Promise.all([
        client.from('avatar_equipped').select('category,item_id').eq('user_id',requestedUserId),
        client.from('profiles').select('body_colors').eq('id',requestedUserId).maybeSingle()
      ]);
      if(eqError)throw new Error('Could not load equipped items: '+eqError.message);
      if(profileError)throw new Error('Could not load avatar colors: '+profileError.message);
      if((currentUser?.id||null)!==requestedUserId)return;
      currentEquipped=Object.fromEntries((eq||[]).map(x=>[x.category,x.item_id]));
      bodyColors={...DEFAULT_BODY_COLORS,...(p?.body_colors||{})};
      const categories=['head','face','hat','tshirt','shirt','pants'];
      const label=$('avatarEquipped');
      if(label)label.innerHTML=categories.filter(c=>currentEquipped[c]).map(c=>{const i=catalogItems.find(x=>x.id===currentEquipped[c]);return i?`<div class="equipped-item"><b>${escapeHTML(c.toUpperCase())}</b> ${escapeHTML(i.name)} <button class="classic-button" data-remove="${c}">Remove</button></div>`:''}).join('')||'No items equipped yet.';
      if(host){host.innerHTML=owned.map(id=>{const i=catalogItems.find(x=>x.id===id);if(!i)return '';return `<article class="catalog-item inventory-item"><div class="item-icon">${iconMarkup(i)}</div><a class="item-name" href="/item.html?id=${encodeURIComponent(i.id)}">${escapeHTML(i.name)}</a><p>${escapeHTML(i.category.toUpperCase())}</p>${currentEquipped[i.category]===id?'<p class="owned">Equipped</p>':'<button class="classic-button blue-button" data-equip="'+escapeHTML(id)+'">Wear</button>'}</article>`}).join('')||'<p>Your wardrobe is empty. <a href="/catalog.html">Shop the Catalog</a>.</p>';host.querySelectorAll('[data-equip]').forEach(b=>b.addEventListener('click',()=>equipItem(b.dataset.equip)));host.querySelectorAll('.item-3d-preview').forEach(c=>makeItemPreview(c,c.dataset.preview));}
      label?.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>unequipCategory(b.dataset.remove)));
      updateCoinLabels(await getCoins());
      avatarRenderers.forEach(r=>r.update(bodyColors,currentEquipped,catalogItems));
    } catch(error) {
      console.error('Avatar inventory load failed:',error);
      if(host)host.innerHTML='<p>Could not load your wardrobe: '+escapeHTML(error.message||'request failed')+'. <button class="classic-button" id="retryAvatarInventory" type="button">Try again</button></p>';
      on('retryAvatarInventory','click',loadAvatarInventory);
    }
  }
  on('catalogSearchButton','click',loadCatalog);on('catalogSearch','keydown',e=>{if(e.key==='Enter')loadCatalog()});document.querySelectorAll('[data-category]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const c=a.dataset.category;selectedCatalogCategory=c;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('selected',x===a));loadCatalog()}));document.querySelectorAll('[data-wardrobe]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const cat=a.dataset.wardrobe;document.querySelectorAll('#avatarInventory .inventory-item').forEach(card=>{card.style.display=cat==='all'||card.querySelector('p')?.textContent===cat.toUpperCase()?'':'none'})}));
  async function saveBodyColors(){const part=$('bodyPart')?.value,color=$('bodyColor')?.value;if(!part||!color)return;bodyColors[part]=color;if(client&&currentUser){const {error}=await client.from('profiles').update({body_colors:bodyColors}).eq('id',currentUser.id);if(error){toast('Could not save color: '+error.message);return}}else{openAuth('signup');return}avatarRenderers.forEach(r=>r.update(bodyColors,currentEquipped,catalogItems));toast('Color applied.');}
  on('applyBodyColor','click',saveBodyColors);document.querySelectorAll('.classic-color-swatches [data-color]').forEach(b=>b.addEventListener('click',()=>{if($('bodyColor'))$('bodyColor').value=b.dataset.color;saveBodyColors()}));on('redrawAvatar','click',e=>{e.preventDefault();avatarRenderers.forEach(r=>r.update(bodyColors,currentEquipped,catalogItems));});
  function renderItemDetail(){const host=$('itemDetail');if(!host)return;const id=new URLSearchParams(location.search).get('id');const item=catalogItems.find(x=>x.id===id);if(!item){host.innerHTML='<p>Item not found. <a href="/catalog.html">Return to Catalog</a>.</p>';return}host.innerHTML=`<div class="item-detail-layout"><div class="item-detail-image">${iconMarkup(item)}</div><div class="item-detail-info"><h1>${escapeHTML(item.name)}</h1><p class="item-creator">Creator: <a href="/profile.html?user=${encodeURIComponent(item.creator||'Blockos Ville')}"><span id="creatorAvatar" class="creator-avatar-stage" aria-label="Creator avatar preview"></span> ${escapeHTML(item.creator||'Blockos Ville')}</a></p><p class="item-detail-price">Price: ${Number(item.price)===0?'Free':`BC: ${Number(item.price)}`}</p><p>${escapeHTML(item.description||'No description provided.')}</p><p>Number Sold: ${Number(item.sold_count??0)}</p><button class="classic-button blue-button" id="detailBuy">Buy Item</button><p><a href="/catalog.html">Back to Catalog</a></p></div></div>`;host.querySelectorAll('.item-3d-preview').forEach(c=>makeItemPreview(c,c.dataset.preview));const creatorName=item.creator||'Blockos Ville';const creatorRenderer=makeAvatar(host.querySelector('#creatorAvatar'),false);if(creatorRenderer&&client&&creatorName!=='Blockos Ville'){(async()=>{const {data:creator}=await client.from('profiles').select('id,body_colors').eq('username',creatorName).maybeSingle();if(creator){const {data:eq}=await client.from('avatar_equipped').select('category,item_id').eq('user_id',creator.id);creatorRenderer.update({...{head:'#ffcc33',torso:'#1479bd',leftArm:'#ffcc33',rightArm:'#ffcc33',leftLeg:'#39834b',rightLeg:'#39834b'},...(creator.body_colors||{})},Object.fromEntries((eq||[]).map(x=>[x.category,x.item_id])),catalogItems)}})()}on('detailBuy','click',()=>buyItem(item.id))}
    function makeItemPreview(canvas,id){
    if(!window.THREE||canvas.dataset.ready)return;
    const item=catalogItems.find(x=>x.id===id);if(!item)return;canvas.dataset.ready='1';
    let renderer;try{renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true})}catch(error){console.warn('Catalog preview unavailable:',error);canvas.dataset.ready='error';return}renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
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
  function makeAvatar(stage, registerForCurrentUser=true){
    if(!stage||!window.THREE)return;const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(32,1,.1,100);camera.position.set(4,3,7);camera.lookAt(0,1.35,0);
    let renderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true})}catch(error){console.error('Avatar WebGL initialization failed:',error);stage.textContent='3D preview is unavailable in this browser.';return null}renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));stage.appendChild(renderer.domElement);scene.add(new THREE.HemisphereLight(0xffffff,0x777777,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(4,7,5);scene.add(light);
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
      }
      if(tee){ // A T-Shirt is a transparent front decal and remains visible over a Shirt.
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
    function resize(){const r=stage.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);camera.updateProjectionMatrix()}new ResizeObserver(resize).observe(stage);resize();renderer.domElement.style.touchAction='pan-y';renderer.domElement.addEventListener('pointerdown',e=>{down=true;last=e.clientX;renderer.domElement.setPointerCapture(e.pointerId)});renderer.domElement.addEventListener('pointermove',e=>{if(down){rot+=(e.clientX-last)*.012;last=e.clientX;rig.rotation.y=rot}});renderer.domElement.addEventListener('pointerup',()=>down=false);renderer.domElement.addEventListener('pointercancel',()=>down=false);function frame(){renderer.render(scene,camera);requestAnimationFrame(frame)}frame();const api={update};if(registerForCurrentUser)avatarRenderers.push(api);update(registerForCurrentUser?bodyColors:{head:'#ffcc33',torso:'#1479bd',leftArm:'#ffcc33',rightArm:'#ffcc33',leftLeg:'#39834b',rightLeg:'#39834b'},registerForCurrentUser?currentEquipped:{},catalogItems);return api;
  }

  // Early multiplayer foundation: Supabase Realtime Presence + Broadcast lobby.
  let lobbyChannel=null, lobbyJoined=false;
  function lobbyName(){return currentUser?.user_metadata?.username||currentUser?.email?.split('@')[0]||'Player';}
  function renderLobbyPlayers(state){const host=$('lobbyPlayers');if(!host)return;const players=[];for(const key of Object.keys(state||{})){for(const p of state[key]||[])players.push(p)}host.innerHTML=players.length?players.map(p=>`<li><span class="presence-dot"></span>${escapeHTML(p.username||'Player')}${p.room?` <small>— ${escapeHTML(p.room)}</small>`:''}</li>`).join(''):'<li>No players online in this lobby yet.</li>';const count=$('lobbyPlayerCount');if(count)count.textContent=String(players.length);}
  function addLobbyMessage(msg){const host=$('lobbyChatMessages');if(!host)return;const row=document.createElement('p');row.className='lobby-chat-line';const who=document.createElement('b');who.textContent=(msg.username||'Player')+': ';const body=document.createElement('span');body.textContent=msg.text||'';row.append(who,body);host.appendChild(row);host.scrollTop=host.scrollHeight;}
  async function joinLobby(){const status=$('lobbyStatus');if(!status)return;if(!currentUser){status.textContent='Please log in to join multiplayer.';openAuth('login');return}if(!client){status.textContent='Cross-device multiplayer chat is not implemented in this backend yet.';return}if(lobbyJoined)return;const room=$('lobbyRoom')?.value||'Main Lobby';status.textContent='Connecting to '+room+'…';lobbyChannel=client.channel('blockos-lobby-'+room,{config:{presence:{key:currentUser.id||lobbyName()},broadcast:{self:false}}});lobbyChannel.on('presence',{event:'sync'},()=>renderLobbyPlayers(lobbyChannel.presenceState()));lobbyChannel.on('broadcast',{event:'chat'},({payload})=>addLobbyMessage(payload));lobbyChannel.subscribe(async state=>{if(state!=='SUBSCRIBED')return;await lobbyChannel.track({user_id:currentUser.id,username:lobbyName(),room,joined_at:new Date().toISOString()});lobbyJoined=true;status.textContent='Connected to '+room+'. You are in the lobby.';$('joinLobby')?.classList.add('hidden');$('leaveLobby')?.classList.remove('hidden');});}
  async function leaveLobby(){if(lobbyChannel){try{await lobbyChannel.untrack();await client.removeChannel(lobbyChannel)}catch(e){console.warn(e)}lobbyChannel=null}lobbyJoined=false;renderLobbyPlayers({});if($('lobbyStatus'))$('lobbyStatus').textContent='You left the lobby.';$('joinLobby')?.classList.remove('hidden');$('leaveLobby')?.classList.add('hidden');}
  on('joinLobby','click',joinLobby);on('leaveLobby','click',leaveLobby);
  on('lobbyChatForm','submit',async e=>{e.preventDefault();const input=$('lobbyChatInput'),textValue=input?.value.trim();if(!textValue)return;if(!lobbyChannel||!lobbyJoined){toast('Join a lobby before chatting.');return}if(textValue.length>240){toast('Messages must be 240 characters or less.');return}await lobbyChannel.send({type:'broadcast',event:'chat',payload:{username:lobbyName(),text:textValue,at:new Date().toISOString()}});addLobbyMessage({username:lobbyName(),text:textValue});input.value='';});
  window.addEventListener('beforeunload',()=>{if(lobbyChannel&&client)client.removeChannel(lobbyChannel)});

  try{makeAvatar($('heroAvatar'))}catch(error){console.error(error)}
  try{publicProfileRenderer=makeAvatar($('profileAvatar'),false)}catch(error){console.error(error)}
  try{makeAvatar($('avatarEditor'))}catch(error){console.error(error)}
  refresh().catch(error=>{console.error('Blockos Ville initialization failed:',error);displayUser(null);openAuth('signup')});
})();


