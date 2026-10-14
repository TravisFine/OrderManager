(() => {
  const box=document.createElement('section');
  box.setAttribute('aria-label','Notifications');
  box.style.cssText='max-width:1040px;margin:12px auto;padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border:1px solid #64748b;border-radius:10px';
  box.innerHTML='<button type="button" id="push-toggle">Enable notifications</button><button type="button" id="push-test" hidden>Send test</button><span id="push-status" role="status" style="font-size:13px;flex:1;min-width:180px">Checking notification support…</span>';
  document.querySelector('header').insertAdjacentElement('afterend',box);
  const toggle=box.querySelector('#push-toggle'),test=box.querySelector('#push-test'),status=box.querySelector('#push-status');
  let registration,subscription,busy=true;
  function show(message){status.textContent=message;}
  function update(){toggle.textContent=subscription?'Turn off notifications':'Enable notifications';test.hidden=!subscription;toggle.disabled=busy;test.disabled=busy;}
  async function request(path,data){const res=await fetch(WORKER_URL+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','x-board-key':BOARD_KEY},...(data?{body:JSON.stringify(data)}:{})});const result=await res.json();if(!res.ok)throw new Error(result.error||`Request failed (${res.status})`);return result;}
  function decode(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));}
  function offerNotifications(mode='enable') {
    if(subscription) return;
    try { if(sessionStorage.getItem('order-manager-notification-prompt')==='dismissed') return; } catch {}
    const dialog=document.createElement('dialog');
    dialog.setAttribute('aria-labelledby','notification-prompt-title');
    dialog.setAttribute('aria-describedby','notification-prompt-description');
    dialog.style.cssText='width:min(420px,calc(100vw - 40px));box-sizing:border-box;border:1px solid #60728b;border-radius:16px;padding:24px;background:#182943;color:#fff;box-shadow:0 20px 70px #0008;font-family:system-ui,sans-serif';
    const style=document.createElement('style');
    style.textContent='#notification-opt-in::backdrop{background:rgba(0,0,0,.6)}#notification-opt-in button{padding:11px 16px;border-radius:8px;font:inherit;cursor:pointer;border:1px solid #9ba9bb}';
    dialog.id='notification-opt-in';
    dialog.innerHTML='<h2 id="notification-prompt-title" style="margin:0 0 12px;font-size:23px">Turn on order notifications?</h2><p id="notification-prompt-description" style="line-height:1.55;margin:0 0 20px"></p><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" data-enable style="background:#fff;color:#182943;font-weight:700">Enable notifications</button><button type="button" data-later style="background:transparent;color:#fff">Not now</button></div>';
    const description=dialog.querySelector('p'),enable=dialog.querySelector('[data-enable]'),later=dialog.querySelector('[data-later]');
    if(mode==='enable') description.textContent='Get alerts for new and completed orders, orders waiting over an hour, and more than 5 open orders—even when this site is closed.';
    else {
      dialog.querySelector('h2').textContent='Get order notifications';
      description.textContent=mode==='blocked'?'Notifications are blocked in your browser. Allow notifications in this site’s browser settings, then reload and tap Enable notifications.':status.textContent;
      enable.hidden=true;later.textContent='Got it';
    }
    const remember=()=>{try{sessionStorage.setItem('order-manager-notification-prompt','dismissed');}catch{}};
    later.addEventListener('click',()=>{remember();dialog.close();});
    dialog.addEventListener('cancel',remember);
    dialog.addEventListener('close',()=>{dialog.remove();style.remove();});
    enable.addEventListener('click',()=>{
      remember();dialog.close();
      // Keep the browser permission request inside this user-initiated click.
      toggle.click();
    });
    document.head.append(style);document.body.append(dialog);dialog.showModal();
  }
  const supported=window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  if(!supported){toggle.disabled=true;show(/iPhone|iPad|iPod/.test(navigator.userAgent)?'On iPhone/iPad, add this site to your Home Screen and open it there to enable notifications.':'Push notifications need a supported browser and an HTTPS website.');offerNotifications('unsupported');return;}
  update();
  const setup=navigator.serviceWorker.register('./sw.js').then(async reg=>{
    registration=reg;
    if(!reg.active) await new Promise((resolve,reject)=>{
      const worker=reg.installing||reg.waiting;
      if(!worker)return reject(new Error('Service worker did not start. Reload and try again.'));
      const timer=setTimeout(()=>reject(new Error('Service worker activation timed out. Reload and try again.')),15000);
      worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(new Error('Service worker installation failed.'));}});
    });
    subscription=await reg.pushManager.getSubscription();
    if(subscription){await request('/push/subscribe',{subscription:subscription.toJSON()});show('Notifications are enabled on this device, including when the site is closed.');}
    else show(Notification.permission==='denied'?'Notifications are blocked. Allow them in this site’s browser settings, then reload.':'Get alerts for new, completed and overdue orders, and more than 5 open orders.');
    busy=false;update();
    if(!subscription) offerNotifications(Notification.permission==='denied'?'blocked':'enable');
  });
  setup.catch(e=>show(e.message));
  toggle.addEventListener('click',async()=>{
    if(busy)return;
    // Ask inside the click handler, before any network wait (required by Safari).
    const permissionPromise=!subscription?Notification.requestPermission():Promise.resolve('granted');
    busy=true;update();
    try{
      const permission=await permissionPromise;
      await setup;
      if(subscription){
        await request('/push/unsubscribe',{endpoint:subscription.endpoint});
        const removed=await subscription.unsubscribe();
        if(!removed)throw new Error('Could not remove the browser subscription. Try again.');
        subscription=null;show('Notifications are off on this device.');
      }else{
        if(permission!=='granted')throw new Error('Notifications were not allowed. You can change this in the site’s browser settings.');
        const {publicKey}=await request('/push/config');
        subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(publicKey)});
        try{await request('/push/subscribe',{subscription:subscription.toJSON()});}catch(e){await subscription.unsubscribe();subscription=null;throw e;}
        show('Enabled. Use “Send test” to check delivery on this device.');
      }
    }catch(e){show(e.message);}finally{busy=false;update();}
  });
  test.addEventListener('click',async()=>{
    busy=true;update();
    try{await request('/push/test',{endpoint:subscription.endpoint});show('Test accepted by the push service. Check your notifications.');}catch(e){show(e.message);}finally{busy=false;update();}
  });
})();
