/* 胡桃鉗下坡實驗室：開過一次後，沒有網路也能用。

   這個網域還放了其他程式，caches 是整個網域共用的，所以：
   - 只碰 ramp-lab- 開頭的快取，別的程式的快取一律不動。
   - 不用 caches.match()，那會查到全網域；一律開自己的快取來查。

   改版時：把 VERSION 改成和 index.html 一樣，舊的網頁快取會自動清掉。
   影片內容換掉時：才把 MEDIA 後面的數字加 1，不然每次改版都要重新下載影片。 */
var VERSION = '2026.11.07-2';
var PREFIX = 'ramp-lab-';
var CACHE = PREFIX + VERSION;
var MEDIA = PREFIX + 'media-1';
var BASE = self.registration.scope;
var INDEX = BASE + 'index.html';
var NET_WAIT = 3000; /* 導覽請求等網路的最長時間，超過就先開快取 */

var FILES = ['rec.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'media/start.jpg', 'media/home-art.png', 'media/secret1.jpg', 'media/secret2.jpg', 'media/secret3.jpg'];
var VIDEOS = ['media/secret1.mp4', 'media/secret2.mp4', 'media/secret3.mp4'];
var HELP = ['sim1', 'sim2', 'sim3', 'sim4', 'sim5', 'sec1', 'sec2', 'sec3', 'sec4', 'home1', 'home2', 'home3', 'home4', 'ins1', 'ins2', 'ins3', 'ins4', 'ins5'].map(function(n){ return 'help/' + n + '.jpg'; });

function abs(u){ return new URL(u, BASE).href; }

/* 只查自己的兩個快取 */
function own(key){
  return caches.open(CACHE).then(function(c){ return c.match(key); }).then(function(r){
    return r || caches.open(MEDIA).then(function(c){ return c.match(key); });
  });
}

/* 下載一個檔案存起來；連內容下載都算在時間內，網路卡住不會一直等 */
function save(name, url, ms){
  var ctl = self.AbortController ? new AbortController() : null;
  var t = ctl ? setTimeout(function(){ ctl.abort(); }, ms) : 0;
  return fetch(url, ctl ? {cache:'no-cache', signal:ctl.signal} : {cache:'no-cache'}).then(function(r){
    if (r.status !== 200) throw new Error('status ' + r.status);
    return caches.open(name).then(function(c){ return c.put(url, r); });
  }).then(function(){ clearTimeout(t); }, function(e){ clearTimeout(t); throw e; });
}

/* 全部要存的檔案。影片放在網頁的小檔案後面 */
function jobs(){
  return [[CACHE, INDEX, 20000]]
    .concat(FILES.map(function(u){ return [CACHE, abs(u), 20000]; }))
    .concat(VIDEOS.map(function(u){ return [MEDIA, abs(u), 120000]; }))
    .concat(HELP.map(function(u){ return [CACHE, abs(u), 20000]; }));
}

/* 一個一個補齊還沒存到的檔案。失敗就跳過，下次打開再補；
   別的程式清掉快取時，這裡也會補回來。 */
var filling = null;
function fill(){
  if (filling) return filling;
  filling = jobs().reduce(function(p, j){
    return p.then(function(){
      return caches.open(j[0]).then(function(c){ return c.match(j[1]); }).then(function(hit){
        if (!hit) return save(j[0], j[1], j[2]).catch(function(){});
      });
    });
  }, Promise.resolve()).then(report).then(function(){ filling = null; }, function(){ filling = null; });
  return filling;
}

/* 告訴網頁存好了幾個檔案 */
function report(){
  var all = jobs();
  return Promise.all(all.map(function(j){ return caches.open(j[0]).then(function(c){ return c.match(j[1]); }); })).then(function(r){
    var ok = r.filter(Boolean).length;
    return self.clients.matchAll({includeUncontrolled:true}).then(function(list){
      list.forEach(function(c){ c.postMessage({type:'ramp-offline', ok:ok, total:all.length, version:VERSION}); });
    });
  });
}

self.addEventListener('install', function(e){
  /* 只有首頁一定要存到；其他檔案之後由 fill() 補，Wi-Fi 不穩時才不會整個裝不起來 */
  e.waitUntil(save(CACHE, INDEX, 20000).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k.indexOf(PREFIX) === 0 && k !== CACHE && k !== MEDIA; })
      .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('message', function(e){
  if (e.data === 'ramp-fill') e.waitUntil(fill());
});

function goodPage(r){
  return r.ok && !r.redirected && /text\/html/.test(r.headers.get('content-type') || '');
}

/* 打開網頁：先問網站有沒有新版（不用瀏覽器 10 分鐘的快取）。
   網路卡住超過 NET_WAIT、斷線，或回錯誤頁（包含被 Wi-Fi 登入頁轉走），就改用快取。 */
function openPage(e){
  var net = fetch(e.request.url.split('#')[0], {cache:'no-cache', credentials:'same-origin'});
  e.waitUntil(net.then(function(r){
    if (!goodPage(r)) return;
    var copy = r.clone();
    return caches.open(CACHE).then(function(c){ return c.put(INDEX, copy); });
  }).catch(function(){}));
  return new Promise(function(done){
    var over = false;
    function finish(r){ if (!over) { over = true; done(r); } }
    function useCache(other){ own(INDEX).then(function(hit){ if (hit) finish(hit); else if (other) finish(other); }); }
    var timer = setTimeout(function(){ useCache(null); }, NET_WAIT);
    net.then(function(r){
      clearTimeout(timer);
      if (goodPage(r)) finish(r); else useCache(r);
    }, function(){
      clearTimeout(timer);
      useCache(Response.error());
    });
  });
}

/* 影片：有存到就從快取切出瀏覽器要的那一段（iPhone 一定會要求分段，沒有就播不了），
   還沒存到就照常走網路。 */
function video(req, key){
  return caches.open(MEDIA).then(function(c){ return c.match(key); }).then(function(hit){
    if (!hit) return fetch(req);
    var range = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get('range') || '').trim());
    if (!range || (range[1] === '' && range[2] === '')) return hit;
    return hit.arrayBuffer().then(function(buf){
      var size = buf.byteLength, a, b;
      if (range[1] === '') { a = Math.max(size - Number(range[2]), 0); b = size - 1; }
      else { a = Number(range[1]); b = range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1); }
      if (a >= size || a > b) return new Response(null, {status:416, headers:{'Content-Range':'bytes */' + size}});
      return new Response(buf.slice(a, b + 1), {status:206, statusText:'Partial Content', headers:{
        'Content-Type':'video/mp4', 'Content-Length':String(b - a + 1), 'Content-Range':'bytes ' + a + '-' + b + '/' + size, 'Accept-Ranges':'bytes'}});
    });
  });
}

/* 圖示、預覽圖、說明圖片：快取優先，沒有才走網路 */
function file(req, key){
  return own(key).then(function(hit){
    if (hit) return hit;
    return fetch(req).then(function(r){
      if (r.status === 200 && r.type === 'basic') {
        var copy = r.clone();
        caches.open(CACHE).then(function(c){ return c.put(key, copy); });
      }
      return r;
    });
  });
}

self.addEventListener('fetch', function(e){
  var req = e.request, u = new URL(req.url), key = u.origin + u.pathname;
  /* 只處理這個程式自己的檔案；Google 字型和其他程式都不經手 */
  if (req.method !== 'GET' || key.indexOf(BASE) !== 0) return;
  if (req.mode === 'navigate') {
    if (key === BASE || key === INDEX) e.respondWith(openPage(e));
    else if (key === BASE + 'rec.html') e.respondWith(fetch(req).catch(function(){ return own(key).then(function(r){ return r || Response.error(); }); }));
    return;
  }
  if (/\.mp4$/.test(u.pathname)) e.respondWith(video(req, key));
  else e.respondWith(file(req, key));
});
