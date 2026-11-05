(function cleanupDevPwaCache() {
        var isDevHost = ['localhost', '127.0.0.1'].indexOf(window.location.hostname) >= 0
          || window.location.hostname.indexOf('192.168.') === 0;
        if (!isDevHost) return;
        if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
          navigator.serviceWorker.getRegistrations()
            .then(function(regs) { regs.forEach(function(reg) { reg.unregister(); }); })
            .catch(function() {});
        }
        if (window.caches && window.caches.keys) {
          window.caches.keys()
            .then(function(keys) { return Promise.all(keys.map(function(key) { return caches.delete(key); })); })
            .catch(function() {});
        }
      })();
