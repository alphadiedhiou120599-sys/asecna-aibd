/* =========================================================
   FIREBASE-INIT.JS — PARTIE 1/2
   Configuration et initialisation Firebase
   ========================================================= */

let FIREBASE_CONFIG = JSON.parse(localStorage.getItem('fbConfig') || 'null') || null;
let firebaseReady = false;
let fireDb = null;
let fireRef = null;
let syncQueue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
let lastSyncTime = localStorage.getItem('lastSync') || null;

/* ---------- INITIALISATION ---------- */
function initFirebase() {
  if (!FIREBASE_CONFIG) { updateFbStatus(); return; }
  if (typeof firebase !== 'undefined') { connectFirebase(); return; }
  const scripts = [
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
  ];
  let loaded = 0;
  scripts.forEach(src => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      loaded++;
      if (loaded === scripts.length) connectFirebase();
    };
    s.onerror = () => console.warn('Impossible de charger Firebase');
    document.head.appendChild(s);
  });
}

function connectFirebase() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    fireDb = firebase.database();
    fireRef = fireDb.ref('asecna_aibd');
    firebaseReady = true;
    updateFbStatus();
    listenFirebase();
    console.log('✅ Firebase connecté');
  } catch (e) {
    console.error('Erreur Firebase :', e);
    firebaseReady = false;
    updateFbStatus();
  }
}

/* ---------- ÉCOUTE DES CHANGEMENTS ---------- */
function listenFirebase() {
  if (!fireRef) return;
  fireRef.on('value', snap => {
    const data = snap.val();
    if (!data) return;
    if (data.equipements) {
      const remoteEq = Object.values(data.equipements);
      const map = new Map(equipements.map(e => [e.id, e]));
      remoteEq.forEach(r => map.set(r.id, r));
      equipements = Array.from(map.values());
    }
    if (data.controles) {
      const remoteCt = Object.values(data.controles);
      const map = new Map(controles.map(c => [c.id, c]));
      remoteCt.forEach(r => map.set(r.id, r));
      controles = Array.from(map.values());
    }
    if (data.duties) {
      const remoteD = Object.values(data.duties);
      const map = new Map(duties.map(d => [d.id || d.debut, d]));
      remoteD.forEach(r => map.set(r.id || r.debut, r));
      duties = Array.from(map.values());
    }
    if (data.sites) sites = data.sites;
    lastSyncTime = new Date().toISOString();
    localStorage.setItem('lastSync', lastSyncTime);
    save(true);
    renderAll();
    updateSyncTime();
  }, err => console.warn('Erreur listener Firebase :', err));
}

/* ---------- ENVOI VERS FIREBASE ---------- */
function pushToFirebase() {
  if (!firebaseReady || !fireRef) return;
  const payload = {
    equipements: objectifyById(equipements),
    controles: objectifyById(controles),
    duties: objectifyByKey(duties, 'debut'),
    sites: sites,
    updatedAt: Date.now(),
    updatedBy: currentUser ? currentUser.user : 'system'
  };
  fireRef.set(payload)
    .then(() => {
      syncQueue = [];
      localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
      lastSyncTime = new Date().toISOString();
      localStorage.setItem('lastSync', lastSyncTime);
      updateSyncTime();
    })
    .catch(err => console.warn('Erreur push Firebase :', err));
}

function objectifyById(arr) {
  const o = {};
  arr.forEach(x => o[x.id] = x);
  return o;
}

function objectifyByKey(arr, key) {
  const o = {};
  arr.forEach(x => o[x[key] || Date.now()] = x);
  return o;
}

/* ---------- INDICATEURS UI ---------- */
function updateFbStatus() {
  const el = document.getElementById('fbStatus');
  if (!el) return;
  if (firebaseReady) {
    el.innerHTML = '<span class="badge ok">✅ Firebase connecté</span> – Sync temps réel active';
  } else if (FIREBASE_CONFIG) {
    el.innerHTML = '<span class="badge warn">⚠️ Configuré mais non connecté</span>';
  } else {
    el.innerHTML = '<span class="badge info">ℹ️ Mode local (pas de sync cloud)</span>';
  }
  updateOnlineBadge();
}

function updateOnlineBadge() {
  const b = document.getElementById('onlineBadge');
  if (!b) return;
  if (firebaseReady) { b.textContent = 'En ligne'; b.classList.remove('off'); }
  else { b.textContent = 'Hors ligne'; b.classList.add('off'); }
}

function updateSyncTime() {
  const el = document.getElementById('lastSync');
  if (el && lastSyncTime) el.textContent = new Date(lastSyncTime).toLocaleString('fr-FR');
}
/* =========================================================
   FIREBASE-INIT.JS — PARTIE 2/2
   Synchronisation et boutons d'administration
   ========================================================= */

/* ---------- SYNCHRONISATION ---------- */
function queueSync() {
  if (!firebaseReady) return;
  syncQueue.push({ at: Date.now() });
  localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
  showSyncIndicator(true);
  pushToFirebase();
}

function showSyncIndicator(show) {
  const el = document.getElementById('syncIndicator');
  if (!el) return;
  if (show) {
    el.classList.add('show', 'syncing');
    el.textContent = '🔄 Synchronisation...';
    setTimeout(() => {
      el.classList.remove('syncing');
      el.textContent = '✅ Synchronisé';
      setTimeout(() => el.classList.remove('show'), 1500);
    }, 800);
  }
}

/* ---------- CONFIGURATION UTILISATEUR ---------- */
function saveFbConfig() {
  const txt = document.getElementById('fbConfig').value.trim();
  if (!txt) {
    FIREBASE_CONFIG = null;
    localStorage.removeItem('fbConfig');
    alert('Config Firebase supprimée. Mode local activé.');
    location.reload();
    return;
  }
  try {
    const cfg = JSON.parse(txt);
    if (!cfg.apiKey || !cfg.databaseURL) throw new Error('Champs apiKey et databaseURL requis');
    FIREBASE_CONFIG = cfg;
    localStorage.setItem('fbConfig', JSON.stringify(cfg));
    alert('✅ Configuration enregistrée. Rechargement...');
    location.reload();
  } catch (e) {
    alert('❌ Config invalide : ' + e.message);
  }
}

function testFbConnection() {
  if (!FIREBASE_CONFIG) { alert('Aucune config Firebase enregistrée.'); return; }
  if (firebaseReady) alert('✅ Firebase est connecté.');
  else alert('❌ Firebase non connecté. Vérifiez la config et rechargez.');
}

function forceSyncUp() {
  if (!firebaseReady) { alert('Firebase non connecté.'); return; }
  pushToFirebase();
  alert('Sync envoyée au cloud.');
}

function forceSyncDown() {
  if (!firebaseReady) { alert('Firebase non connecté.'); return; }
  fireRef.once('value').then(snap => {
    const data = snap.val();
    if (data) {
      if (data.equipements) equipements = Object.values(data.equipements);
      if (data.controles) controles = Object.values(data.controles);
      if (data.duties) duties = Object.values(data.duties);
      if (data.sites) sites = data.sites;
      save(true);
      renderAll();
      alert('Données reçues du cloud.');
    }
  });
}