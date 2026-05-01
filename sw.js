self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('push', function(event) {
  let d = { title: '🏠 আইডিয়াল হোম', body: 'নতুন আপডেট!' };
  try { d = event.data.json(); } catch(e) { try { d.body = event.data.text(); } catch(e2) {} }
  
  event.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, 
    icon: 'https://cdn-icons-png.flaticon.com/512/3081/3081986.png',
    vibrate: [200, 100, 200], 
    tag: 'ideal-home', 
    renotify: true
  }));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (let c of list) { if ('focus' in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow('./');
  }));
});
