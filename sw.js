// No page caching: order data and website updates continue to load normally.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch{}
  const page=data.page==='completed.html'?'completed.html':'index.html';
  event.waitUntil(self.registration.showNotification(data.title||'Order Manager',{
    body:data.body||'There is an update on the order board.',tag:data.tag||'order-manager',
    icon:new URL('notification-icon.svg',self.registration.scope).href,
    data:{url:new URL(page,self.registration.scope).href}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||'index.html',self.registration.scope);
  if(url.origin!==self.location.origin)return;
  event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clients){if(new URL(client.url).origin===url.origin&&client.url.startsWith(self.registration.scope)){await client.navigate(url.href);return client.focus();}}
    return self.clients.openWindow(url.href);
  })());
});
