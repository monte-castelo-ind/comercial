/* Service worker do app Comercial (pasta /comercial/) — nov/2026.
   Para o app ABRIR sem internet (no cliente, sem sinal). Só vale para esta pasta: o sw.js da raiz
   do hub continua sem cache nenhum para os outros apps.

   Como funciona:
   - A página (index.html) vem SEMPRE da rede quando há internet: atualização subida no main aparece
     na hora, como antes. A cópia guardada só é usada quando a rede falha (ou demora mais de 6 s).
   - Firebase (o código), fontes, Leaflet e os arquivos comuns do hub (mc-base.css, pedidos-equipamento.js…)
     vêm da cópia guardada e são renovados por trás, a cada uso.
   - Os DADOS (Firestore, login, Google Maps) não passam por aqui: o próprio Firebase guarda no aparelho.
   Para forçar todos a descartarem as cópias antigas: suba a VERSAO abaixo. */
var VERSAO = 'mc-comercial-v1';
var BASE = [
  './',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
];
/* o que pode ser guardado (o resto passa direto para a rede) */
function guardavel(url){
  if(url.origin === self.location.origin) return url.pathname.indexOf('/sw.js') < 0;
  return /^(www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)$/.test(url.hostname)
         && !/firestore|identitytoolkit|securetoken/.test(url.pathname);
}

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(VERSAO).then(function(c){
    return Promise.all(BASE.map(function(u){
      return fetch(new Request(u, { mode: u.indexOf('http') === 0 ? 'cors' : 'same-origin', cache: 'reload' }))
        .then(function(r){ if(r.ok) return c.put(u, r); }).catch(function(){});
    }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k.indexOf('mc-comercial-') === 0 && k !== VERSAO; })
      .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);

  /* a página: rede primeiro (até 6 s); sem rede, a última cópia */
  if(req.mode === 'navigate'){
    e.respondWith(new Promise(function(ok){
      var feito = false;
      var daCopia = function(){
        caches.match('./').then(function(r){ if(!feito && r){ feito = true; ok(r); } });
      };
      var t = setTimeout(daCopia, 6000);
      fetch(req).then(function(r){
        clearTimeout(t);
        if(r && r.ok){ var cp = r.clone(); caches.open(VERSAO).then(function(c){ c.put('./', cp); }); }
        if(!feito){ feito = true; ok(r); }
      }).catch(function(){
        clearTimeout(t);
        caches.match('./').then(function(r){
          if(!feito){ feito = true; ok(r || new Response('<h3 style="font-family:sans-serif">Sem internet e o app ainda não foi aberto neste aparelho com sinal.</h3>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } })); }
        });
      });
    }));
    return;
  }

  if(!guardavel(url)) return;

  /* arquivos: a cópia guardada na hora, e renova por trás */
  e.respondWith(caches.open(VERSAO).then(function(c){
    return c.match(req).then(function(guardado){
      var rede = fetch(req).then(function(r){
        if(r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
        return r;
      }).catch(function(){ return guardado; });
      return guardado || rede;
    });
  }));
});
