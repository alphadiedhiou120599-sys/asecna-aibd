/* =========================================================
   APP.JS — PARTIE 1/3
   Données, persistance, auth, navigation, poste, sites, photos
   ========================================================= */

/* ---------- DONNÉES ---------- */
let equipements = JSON.parse(localStorage.getItem('eq') || '[]');
let controles   = JSON.parse(localStorage.getItem('ct') || '[]');
let duties      = JSON.parse(localStorage.getItem('duties') || '[]');
let users = JSON.parse(localStorage.getItem('users') || 'null') || [
  { user: 'admin', pass: 'admin', role: 'admin', site: 'AIBD' },
  { user: 'chef',  pass: 'chef',  role: 'chef',  site: 'AIBD' },
  { user: 'tech',  pass: 'tech',  role: 'technicien', site: 'AIBD' }
];
let seuils = JSON.parse(localStorage.getItem('seuils') || 'null') || {
  batV: 12, batT: 35, ondAuto: 30, geCarb: 50, hebdo: 7, mensuel: 30
};
let sites = JSON.parse(localStorage.getItem('sites') || 'null') || [
  { name: 'AIBD', code: 'AIBD' },
  { name: 'Dakar', code: 'DSS' },
  { name: 'Bamako', code: 'BKO' },
  { name: 'Niamey', code: 'NIM' },
  { name: 'Ouagadougou', code: 'OUA' }
];
let currentUser = null;
let currentSite = 'AIBD';
let installPrompt = null;
let currentCtrlId = null;
let tempPhotos = [];
let sigCanvas, sigCtx, isDrawing = false;
let qrScanner = null;
let lastReportData = null;

/* ---------- PERSISTANCE ---------- */
function save(localOnly = false) {
  localStorage.setItem('eq', JSON.stringify(equipements));
  localStorage.setItem('ct', JSON.stringify(controles));
  localStorage.setItem('users', JSON.stringify(users));
  localStorage.setItem('seuils', JSON.stringify(seuils));
  localStorage.setItem('duties', JSON.stringify(duties));
  localStorage.setItem('sites', JSON.stringify(sites));
  if (!localOnly && typeof queueSync === 'function') queueSync();
}

function todayStr() { return new Date().toISOString().slice(0,10); }

/* ---------- MODE SOMBRE ---------- */
function toggleDark() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('dark', isDark ? '1' : '0');
  document.getElementById('darkBtn').textContent = isDark ? '☀️' : '🌙';
  setTimeout(renderCharts, 100);
}
if (localStorage.getItem('dark') === '1') {
  document.body.classList.add('dark');
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('darkBtn');
    if (b) b.textContent = '☀️';
  });
}

/* ---------- AUTHENTIFICATION ---------- */
function login(e) {
  e.preventDefault();
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const s = document.getElementById('loginSite').value;
  const found = users.find(x => x.user === u && x.pass === p);
  if (!found) { document.getElementById('loginError').textContent = 'Identifiants incorrects'; return; }
  currentUser = found;
  currentSite = s || found.site || 'AIBD';
  sessionStorage.setItem('currentUser', JSON.stringify(found));
  sessionStorage.setItem('currentSite', currentSite);
  enterApp();
}

function enterApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appHeader').classList.remove('hidden');
  document.getElementById('appNav').classList.remove('hidden');
  document.getElementById('appMain').classList.remove('hidden');
  document.getElementById('userName').textContent = currentUser.user;
  document.getElementById('userRole').textContent = currentUser.role;
  document.getElementById('headerSite').textContent = currentSite;
  document.getElementById('dashSite').textContent = '(' + currentSite + ')';
  document.querySelectorAll('nav button').forEach(b => {
    if (b.textContent.includes('Admin') && currentUser.role !== 'admin') b.classList.add('hidden');
  });
  renderAll();
  loadSeuilsForm();
  fillSitesSelects();
  renderSites();
  if (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG) {
    const fb = document.getElementById('fbConfig');
    if (fb) fb.value = JSON.stringify(FIREBASE_CONFIG, null, 2);
  }
  if (typeof updateFbStatus === 'function') {
    updateFbStatus();
    updateSyncTime();
  }
}

function logout() {
  currentUser = null;
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('currentSite');
  location.reload();
}

/* ---------- NAVIGATION ---------- */
function showTab(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (id === 'scan') startScanner(); else stopScanner();
  if (id === 'dashboard') renderCharts();
}

/* ---------- POSTE ---------- */
function getCurrentDuty() { return duties.find(d => d.date === todayStr() && !d.fin && d.site === currentSite); }
function isUserOnDuty(username) { const d = getCurrentDuty(); return d && d.technicien === username; }
function amIOnDuty() { return currentUser && isUserOnDuty(currentUser.user); }

function declareDuty(e) {
  e.preventDefault();
  const t = document.getElementById('dutySelect').value;
  const plage = document.getElementById('dutyPlage').value;
  if (getCurrentDuty()) {
    if (!confirm('Un technicien est déjà en poste. Le remplacer ?')) return;
    endDutySilent();
  }
  duties.push({
    id: Date.now(),
    date: todayStr(),
    technicien: t,
    plage, site: currentSite,
    debut: new Date().toISOString(),
    fin: null
  });
  save(); renderAll();
  alert(t + ' est en poste sur ' + currentSite);
}

function endDuty() {
  if (!confirm('Terminer le poste ?')) return;
  endDutySilent(); renderAll();
}

function endDutySilent() {
  const d = getCurrentDuty();
  if (d) { d.fin = new Date().toISOString(); save(); }
}

function renderDuty() {
  const d = getCurrentDuty();
  const banner = document.getElementById('dutyBanner');
  const text = document.getElementById('dutyText');
  const box = document.getElementById('currentDutyBox');
  const today = document.getElementById('todayDate');
  const warning = document.getElementById('dutyWarning');
  if (today) today.textContent = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  if (d) {
    banner.classList.remove('off');
    text.textContent = '👤 En poste : ' + d.technicien + (d.plage ? ' (' + d.plage + ')' : '');
    if (box) box.innerHTML = `<div class="alert-item ok">✅ <b>${d.technicien}</b> en poste${d.plage?' – '+d.plage:''}. Début : ${new Date(d.debut).toLocaleTimeString('fr-FR')}</div>`;
  } else {
    banner.classList.add('off');
    text.textContent = 'Aucun technicien en poste';
    if (box) box.innerHTML = `<div class="alert-item warn">⚠️ Aucun technicien en poste sur ${currentSite}.</div>`;
  }
  const badge = document.getElementById('dutyBadge');
  if (badge) {
    if (amIOnDuty()) { badge.textContent = 'EN POSTE'; badge.classList.remove('off'); }
    else { badge.textContent = 'Hors poste'; badge.classList.add('off'); }
  }
  if (warning) warning.classList.toggle('hidden', amIOnDuty());
  const tbody = document.getElementById('listDuty');
  if (tbody) {
    tbody.innerHTML = '';
    duties.slice().reverse().forEach(d => {
      tbody.innerHTML += `<tr>
        <td>${d.date}</td><td>${d.technicien}</td><td>${d.site || '-'}</td><td>${d.plage || '-'}</td>
        <td>${new Date(d.debut).toLocaleTimeString('fr-FR')}</td>
        <td>${d.fin ? new Date(d.fin).toLocaleTimeString('fr-FR') : '<span class="badge ok">En cours</span>'}</td>
      </tr>`;
    });
  }
  const sel = document.getElementById('dutySelect');
  if (sel) {
    sel.innerHTML = '<option value="">-- Choisir --</option>';
    users.filter(u => (u.role === 'technicien' || u.role === 'chef') && (!u.site || u.site === currentSite))
      .forEach(u => sel.innerHTML += `<option value="${u.user}">${u.user} (${u.role})</option>`);
  }
}

/* ---------- SITES ---------- */
function fillSitesSelects() {
  ['loginSite', 'eqSite', 'rapSite', 'newUserSite'].forEach(id => {
    const s = document.getElementById(id);
    if (!s) return;
    const cur = s.value;
    s.innerHTML = '';
    if (id === 'rapSite') s.innerHTML = '<option value="">Tous les sites</option>';
    sites.forEach(site => {
      const opt = document.createElement('option');
      opt.value = site.code;
      opt.textContent = site.name + ' (' + site.code + ')';
      s.appendChild(opt);
    });
    if (cur) s.value = cur;
  });
  if (currentUser && currentUser.site) {
    const s = document.getElementById('eqSite');
    if (s) s.value = currentUser.site;
  }
}

function addSite(e) {
  e.preventDefault();
  const name = document.getElementById('newSiteName').value.trim();
  const code = document.getElementById('newSiteCode').value.trim().toUpperCase();
  if (sites.some(s => s.code === code)) { alert('Code déjà utilisé'); return; }
  sites.push({ name, code });
  save(); fillSitesSelects(); renderSites();
  document.getElementById('newSiteName').value = '';
  document.getElementById('newSiteCode').value = '';
  alert('Site ajouté');
}

function delSite(i) {
  if (!confirm('Supprimer ce site ?')) return;
  sites.splice(i, 1);
  save(); fillSitesSelects(); renderSites();
}

function renderSites() {
  const tbody = document.getElementById('listSites');
  if (!tbody) return;
  tbody.innerHTML = '';
  sites.forEach((s, i) => {
    tbody.innerHTML += `<tr><td>${s.name}</td><td>${s.code}</td>
      <td><button class="btn-sm red" onclick="delSite(${i})">✕</button></td></tr>`;
  });
}

/* ---------- NOTIFICATIONS ---------- */
function requestNotifPermission() {
  if (!('Notification' in window)) { alert('Notifications non supportées'); return; }
  Notification.requestPermission().then(p => {
    if (p === 'granted') {
      alert('✅ Notifications activées');
      new Notification('ASECNA AIBD', { body: 'Vous recevrez les alertes de contrôle.' });
    } else alert('Notifications refusées');
  });
}

function checkAndNotify() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = new Date();
  equipements.forEach(eq => {
    const list = controles.filter(c => c.eqId === eq.id);
    const last = list[list.length - 1];
    if (!last) return;
    const jours = (today - new Date(last.date)) / 86400000;
    const seuil = last.type === 'Hebdomadaire' ? seuils.hebdo : seuils.mensuel;
    if (jours > seuil) new Notification('⚠️ Contrôle en retard', { body: `${eq.id} – ${Math.floor(jours)} jours` });
  });
}
setInterval(checkAndNotify, 3600000);

/* ---------- CHAMPS DYNAMIQUES ---------- */
function toggleTypeFields() {
  const t = document.getElementById('eqType').value;
  ['Bat','Ond','Cha','GE'].forEach(k => document.getElementById('fields' + k).classList.add('hidden'));
  if (t === 'Batterie') document.getElementById('fieldsBat').classList.remove('hidden');
  if (t === 'Onduleur') document.getElementById('fieldsOnd').classList.remove('hidden');
  if (t === 'Chargeur') document.getElementById('fieldsCha').classList.remove('hidden');
  if (t === 'Groupe électrogène') document.getElementById('fieldsGE').classList.remove('hidden');
}

/* ---------- PHOTOS ---------- */
function addPhoto(input) {
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > h && w > MAX) { h = h * MAX / w; w = MAX; }
        else if (h > MAX) { w = w * MAX / h; h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        tempPhotos.push(canvas.toDataURL('image/jpeg', 0.7));
        renderPhotoPreview();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderPhotoPreview() {
  const box = document.getElementById('ctPhotosPreview');
  box.innerHTML = '';
  tempPhotos.forEach((p, i) => {
    box.innerHTML += `<div class="photo-item">
      <img src="${p}" onclick="window.open('${p}')">
      <button type="button" class="photo-del" onclick="removePhoto(${i})">✕</button>
    </div>`;
  });
}

function removePhoto(i) { tempPhotos.splice(i, 1); renderPhotoPreview(); }
/* =========================================================
   APP.JS — PARTIE 2/3
   Équipements, fiche, QR, scanner, contrôles, signature
   ========================================================= */

/* ---------- ÉQUIPEMENTS ---------- */
function addEquip(e) {
  e.preventDefault();
  const t = document.getElementById('eqType').value;
  const eq = {
    id: document.getElementById('eqId').value.trim(),
    type: t,
    site: document.getElementById('eqSite').value,
    zone: document.getElementById('eqZone').value,
    loc: document.getElementById('eqLoc').value,
    marque: document.getElementById('eqMarque').value,
    serie: document.getElementById('eqSerie').value,
    date: document.getElementById('eqDate').value,
    crit: document.getElementById('eqCrit').value,
    etat: 'Bon', details: {}
  };
  if (equipements.some(x => x.id === eq.id)) { alert('ID déjà utilisé !'); return; }
  if (t === 'Batterie') eq.details = { tech: document.getElementById('batTech').value, v: document.getElementById('batV').value, ah: document.getElementById('batAh').value, nb: document.getElementById('batNb').value, float: document.getElementById('batFloat').value, charge: document.getElementById('batCharge').value };
  if (t === 'Onduleur') eq.details = { kva: document.getElementById('ondKva').value, ve: document.getElementById('ondVe').value, vs: document.getElementById('ondVs').value, auto: document.getElementById('ondAuto').value, type: document.getElementById('ondType').value };
  if (t === 'Chargeur') eq.details = { vs: document.getElementById('chaVs').value, amp: document.getElementById('chaAmp').value, type: document.getElementById('chaType').value };
  if (t === 'Groupe électrogène') eq.details = { kva: document.getElementById('geKva').value, vf: document.getElementById('geVF').value, carb: document.getElementById('geCarb').value, res: document.getElementById('geRes').value, h: document.getElementById('geH').value };
  equipements.push(eq);
  save();
  document.getElementById('formEquip').reset();
  toggleTypeFields();
  fillSitesSelects();
  renderAll();
}

function delEquip(id) {
  if (currentUser.role === 'technicien' && !amIOnDuty()) { alert('Action réservée au technicien en poste ou admin.'); return; }
  if (!confirm('Supprimer ' + id + ' ?')) return;
  equipements = equipements.filter(x => x.id !== id);
  controles   = controles.filter(x => x.eqId !== id);
  save(); renderAll();
}

/* ---------- FICHE ÉQUIPEMENT ---------- */
function openFiche(id) {
  const eq = equipements.find(x => x.id === id);
  if (!eq) return;
  const ctrls = controles.filter(c => c.eqId === id).sort((a,b) => new Date(b.date) - new Date(a.date));
  const last = ctrls[0];
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(eq.id);
  let detailsHtml = '';
  if (eq.type === 'Batterie') detailsHtml = `<div><b>Technologie :</b> ${eq.details.tech || '-'}</div><div><b>Tension :</b> ${eq.details.v || '-'} V</div><div><b>Capacité :</b> ${eq.details.ah || '-'} Ah</div><div><b>Éléments :</b> ${eq.details.nb || '-'}</div><div><b>V flottante :</b> ${eq.details.float || '-'}</div><div><b>V charge :</b> ${eq.details.charge || '-'}</div>`;
  else if (eq.type === 'Onduleur') detailsHtml = `<div><b>Puissance :</b> ${eq.details.kva || '-'} kVA</div><div><b>V entrée :</b> ${eq.details.ve || '-'}</div><div><b>V sortie :</b> ${eq.details.vs || '-'}</div><div><b>Autonomie :</b> ${eq.details.auto || '-'} min</div><div><b>Type :</b> ${eq.details.type || '-'}</div>`;
  else if (eq.type === 'Chargeur') detailsHtml = `<div><b>V sortie :</b> ${eq.details.vs || '-'}</div><div><b>Courant :</b> ${eq.details.amp || '-'} A</div><div><b>Type :</b> ${eq.details.type || '-'}</div>`;
  else detailsHtml = `<div><b>Puissance :</b> ${eq.details.kva || '-'}</div><div><b>V/F :</b> ${eq.details.vf || '-'}</div><div><b>Carburant :</b> ${eq.details.carb || '-'}</div><div><b>Réservoir :</b> ${eq.details.res || '-'} L</div><div><b>Heures :</b> ${eq.details.h || '-'} h</div>`;
  const ctrlRows = ctrls.slice(0, 15).map(c => {
    const cls = c.resultat === 'Conforme' ? 'ok' : 'danger';
    const photos = (c.photos || []).map(p => `<img src="${p}" class="report-photo" onclick="window.open('${p}')">`).join('');
    const sig = c.signature ? `<img src="${c.signature}" style="max-height:30px;">` : '-';
    return `<tr><td>${c.date}</td><td>${c.type}</td><td>${c.valeur || '-'}</td>
      <td><span class="badge ${cls}">${c.resultat}</span></td><td>${photos || '-'}</td><td>${sig}</td></tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;">Aucun contrôle</td></tr>';
  document.getElementById('ficheContent').innerHTML = `
    <h2 style="color:var(--primary);">📦 ${eq.id}</h2>
    <div class="fiche-header">
      <div class="fiche-qr"><img src="${qrUrl}"></div>
      <div class="fiche-details">
        <div><b>Type :</b> ${eq.type}</div>
        <div><b>Site :</b> ${eq.site || 'AIBD'}</div>
        <div><b>Zone :</b> ${eq.zone}</div>
        <div><b>Localisation :</b> ${eq.loc || '-'}</div>
        <div><b>Marque :</b> ${eq.marque || '-'}</div>
        <div><b>N° série :</b> ${eq.serie || '-'}</div>
        <div><b>Mise en service :</b> ${eq.date || '-'}</div>
        <div><b>Criticité :</b> ${eq.crit}</div>
        <div><b>État :</b> <span class="badge ${eq.etat === 'Bon' ? 'ok' : (eq.etat === 'À surveiller' ? 'warn' : 'danger')}">${eq.etat}</span></div>
      </div>
    </div>
    <h3 style="color:var(--primary);font-size:14px;margin-top:14px;">Caractéristiques</h3>
    <div class="info-box">${detailsHtml}</div>
    <h3 style="color:var(--primary);font-size:14px;margin-top:14px;">Dernier contrôle</h3>
    <div class="info-box">${last ? `${last.date} – ${last.resultat} – par ${last.auteur}` : 'Aucun contrôle'}</div>
    <h3 style="color:var(--primary);font-size:14px;margin-top:14px;">Historique</h3>
    <div style="overflow-x:auto;">
      <table style="font-size:11px;">
        <thead><tr><th>Date</th><th>Type</th><th>Valeurs</th><th>Résultat</th><th>Photos</th><th>Signature</th></tr></thead>
        <tbody>${ctrlRows}</tbody>
      </table>
    </div>
    <button class="btn" onclick="document.getElementById('ficheModal').classList.add('hidden')" style="margin-top:12px;">Fermer</button>`;
  document.getElementById('ficheModal').classList.remove('hidden');
}

function showQR(id) {
  const url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(id);
  document.getElementById('qrContent').innerHTML = `<p style="margin-bottom:10px;font-weight:bold;">${id}</p><img id="qrImg" src="${url}" style="width:250px;height:250px;">`;
  document.getElementById('qrModal').classList.remove('hidden');
}

function printQR() {
  const img = document.getElementById('qrImg');
  const id = document.getElementById('qrContent').querySelector('p').textContent;
  const w = window.open('');
  w.document.write(`<html><head><title>QR ${id}</title></head><body style="text-align:center;font-family:Arial;">
    <h2>ASECNA AIBD</h2><img src="${img.src}" style="width:300px;height:300px;">
    <p><b>${id}</b></p><script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

/* ---------- SCANNER QR ---------- */
function startScanner() {
  if (qrScanner) return;
  qrScanner = new Html5Qrcode("qrReader");
  qrScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    (decodedText) => {
      stopScanner();
      const eq = equipements.find(x => x.id === decodedText);
      if (eq) openFiche(decodedText);
      else alert('QR lu : ' + decodedText + '\nAucun équipement trouvé.');
    },
    () => {}
  ).catch(err => console.warn('Erreur scanner :', err));
}

function stopScanner() {
  if (qrScanner) {
    qrScanner.stop().then(() => qrScanner.clear()).catch(() => {});
    qrScanner = null;
  }
}

/* ---------- CONTRÔLES ---------- */
function addCtrl(e) {
  e.preventDefault();
  const ctrl = {
    id: Date.now(),
    date: todayStr(),
    eqId: document.getElementById('ctEquip').value,
    type: document.getElementById('ctType').value,
    valeur: document.getElementById('ctValeur').value,
    aspect: document.getElementById('ctAspect').value,
    resultat: document.getElementById('ctResultat').value,
    action: document.getElementById('ctAction').value,
    photos: [...tempPhotos],
    valide: false, validePar: null, dateValidation: null, signature: null,
    auteur: currentUser.user,
    site: currentSite
  };
  controles.push(ctrl);
  const eq = equipements.find(x => x.id === ctrl.eqId);
  if (eq) eq.etat = ctrl.resultat === 'Conforme' ? 'Bon' : 'À surveiller';
  save();
  document.getElementById('formCtrl').reset();
  tempPhotos = [];
  renderPhotoPreview();
  renderAll();
}

function delCtrl(id) {
  if (currentUser.role === 'technicien' && !amIOnDuty()) { alert('Action réservée au technicien en poste ou admin.'); return; }
  if (!confirm('Supprimer ce contrôle ?')) return;
  controles = controles.filter(x => x.id !== id);
  save(); renderAll();
}

/* ---------- SIGNATURE ---------- */
function initSignatureCanvas() {
  sigCanvas = document.getElementById('signatureCanvas');
  sigCtx = sigCanvas.getContext('2d');
  sigCanvas.width = sigCanvas.offsetWidth;
  sigCanvas.height = sigCanvas.offsetHeight;
  sigCtx.fillStyle = 'white';
  sigCtx.fillRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigCtx.strokeStyle = '#003366';
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  sigCanvas.addEventListener('mousedown', startDraw);
  sigCanvas.addEventListener('mousemove', draw);
  sigCanvas.addEventListener('mouseup', endDraw);
  sigCanvas.addEventListener('mouseleave', endDraw);
  sigCanvas.addEventListener('touchstart', e => { e.preventDefault(); startDraw(e.touches[0]); }, { passive: false });
  sigCanvas.addEventListener('touchmove',  e => { e.preventDefault(); draw(e.touches[0]); }, { passive: false });
  sigCanvas.addEventListener('touchend', endDraw);
}

function getPos(e) { const r = sigCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function startDraw(e) { isDrawing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); }
function draw(e) { if (!isDrawing) return; const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); }
function endDraw() { isDrawing = false; }
function clearSignature() { sigCtx.fillStyle = 'white'; sigCtx.fillRect(0, 0, sigCanvas.width, sigCanvas.height); }

function openSignatureModal(ctrlId) {
  if (!amIOnDuty()) { alert('Seul le technicien EN POSTE peut valider et signer.'); return; }
  const c = controles.find(x => x.id === ctrlId);
  if (!c) return;
  currentCtrlId = ctrlId;
  const eq = equipements.find(e => e.id === c.eqId);
  document.getElementById('signatureInfo').innerHTML = `<b>Équipement :</b> ${c.eqId} – ${eq ? eq.type : ''}<br><b>Zone :</b> ${eq ? eq.zone : ''}<br><b>Type :</b> ${c.type}<br><b>Résultat :</b> ${c.resultat}<br><b>Technicien :</b> ${currentUser.user}`;
  document.getElementById('signatureModal').classList.remove('hidden');
  setTimeout(() => {
    if (!sigCanvas) initSignatureCanvas();
    else { sigCanvas.width = sigCanvas.offsetWidth; sigCanvas.height = sigCanvas.offsetHeight; clearSignature(); }
  }, 100);
}

function closeSignatureModal() { document.getElementById('signatureModal').classList.add('hidden'); currentCtrlId = null; }

function confirmValidation() {
  const blank = document.createElement('canvas');
  blank.width = sigCanvas.width; blank.height = sigCanvas.height;
  const bctx = blank.getContext('2d');
  bctx.fillStyle = 'white'; bctx.fillRect(0,0,blank.width,blank.height);
  if (sigCanvas.toDataURL() === blank.toDataURL()) { alert('Veuillez signer.'); return; }
  const c = controles.find(x => x.id === currentCtrlId);
  if (c) {
    c.valide = true;
    c.validePar = currentUser.user;
    c.dateValidation = new Date().toISOString();
    c.signature = sigCanvas.toDataURL();
    save(); renderAll();
    alert('✅ Contrôle validé et signé par ' + currentUser.user);
  }
  closeSignatureModal();
}

function viewSignature(ctrlId) {
  const c = controles.find(x => x.id === ctrlId);
  if (!c || !c.signature) return;
  document.getElementById('viewSignatureContent').innerHTML = `<div class="info-box"><b>Équipement :</b> ${c.eqId}<br><b>Date :</b> ${c.date}<br><b>Validé par :</b> ${c.validePar}<br><b>Le :</b> ${new Date(c.dateValidation).toLocaleString('fr-FR')}</div><div style="text-align:center;background:#fafafa;padding:10px;border-radius:6px;"><img src="${c.signature}" style="max-width:100%;max-height:150px;"></div>`;
  document.getElementById('viewSignatureModal').classList.remove('hidden');
}
/* =========================================================
   APP.JS — PARTIE 3/3
   Rendu, alertes, admin, rapports, graphiques, PWA, init
   ========================================================= */

/* ---------- RENDU ---------- */
function renderAll() {
  renderStats();
  renderEquip();
  renderCtrl();
  renderAlerts();
  renderLastControls();
  renderUsers();
  renderDuty();
  renderGraph();
  renderCharts();
}

function renderStats() {
  const eqs = equipements.filter(e => !e.site || e.site === currentSite);
  const ctrls = controles.filter(c => !c.site || c.site === currentSite);
  document.getElementById('sTotal').textContent = eqs.length;
  document.getElementById('sBat').textContent = eqs.filter(x => x.type === 'Batterie').length;
  document.getElementById('sOnd').textContent = eqs.filter(x => x.type === 'Onduleur').length;
  document.getElementById('sCha').textContent = eqs.filter(x => x.type === 'Chargeur').length;
  document.getElementById('sGE').textContent  = eqs.filter(x => x.type === 'Groupe électrogène').length;
  document.getElementById('sCtrl').textContent = ctrls.length;
}

function renderGraph() {
  const box = document.getElementById('graphContainer');
  if (!box) return;
  const types = ['Batterie', 'Onduleur', 'Chargeur', 'Groupe électrogène'];
  box.innerHTML = '';
  types.forEach(t => {
    const eqs = equipements.filter(e => e.type === t && (!e.site || e.site === currentSite));
    if (!eqs.length) return;
    const bons = eqs.filter(e => e.etat === 'Bon').length;
    const pct = Math.round((bons / eqs.length) * 100);
    const color = pct >= 80 ? 'green' : (pct >= 50 ? 'orange' : 'red');
    box.innerHTML += `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span><b>${t}</b></span><span>${bons}/${eqs.length} (${pct}%)</span>
      </div>
      <div class="bar-wrap"><div class="bar ${color}" style="width:${pct}%"></div></div>
    </div>`;
  });
  if (!box.innerHTML) box.innerHTML = '<p style="font-size:12px;color:var(--text2);">Aucun équipement pour ' + currentSite + '.</p>';
}

function renderEquip() {
  const q = (document.getElementById('searchEquip')?.value || '').toLowerCase();
  const tbody = document.getElementById('listEquip');
  tbody.innerHTML = '';
  equipements
    .filter(e => (!e.site || e.site === currentSite))
    .filter(e => !q || e.id.toLowerCase().includes(q) || e.zone.toLowerCase().includes(q))
    .forEach(eq => {
      const cls = eq.etat === 'Bon' ? 'ok' : (eq.etat === 'À surveiller' ? 'warn' : 'danger');
      tbody.innerHTML += `<tr>
        <td>${eq.id}</td><td>${eq.type}</td><td>${eq.site || 'AIBD'}</td><td>${eq.zone}</td>
        <td><span class="badge ${cls}">${eq.etat}</span></td>
        <td>
          <button class="btn-sm blue" onclick="openFiche('${eq.id}')">👁️</button>
          <button class="btn-sm purple" onclick="showQR('${eq.id}')">QR</button>
          <button class="btn-sm red" onclick="delEquip('${eq.id}')">✕</button>
        </td>
      </tr>`;
    });
  const sel = document.getElementById('ctEquip');
  sel.innerHTML = '<option value="">-- Choisir --</option>';
  equipements.filter(e => !e.site || e.site === currentSite)
    .forEach(eq => sel.innerHTML += `<option value="${eq.id}">${eq.id} – ${eq.type} (${eq.zone})</option>`);
}

function renderCtrl() {
  const tbody = document.getElementById('listCtrl');
  tbody.innerHTML = '';
  controles.filter(c => !c.site || c.site === currentSite).slice().reverse().forEach(c => {
    const cls = c.resultat === 'Conforme' ? 'ok' : 'danger';
    const vCls = c.valide ? 'ok' : 'warn';
    const validePar = c.valide ? `<span class="badge ${vCls}">${c.validePar}</span>` : `<span class="badge ${vCls}">En attente</span>`;
    const hasPhotos = (c.photos && c.photos.length) ? `<span class="badge info">📷${c.photos.length}</span>` : '';
    tbody.innerHTML += `<tr>
      <td>${c.date}</td><td>${c.eqId}</td><td>${c.type}</td>
      <td><span class="badge ${cls}">${c.resultat}</span> ${hasPhotos}</td>
      <td>${validePar}</td>
      <td>
        ${!c.valide ? `<button class="btn-sm green" onclick="openSignatureModal(${c.id})">✍️</button>` : ''}
        ${c.signature ? `<button class="btn-sm blue" onclick="viewSignature(${c.id})">👁️</button>` : ''}
        <button class="btn-sm red" onclick="delCtrl(${c.id})">✕</button>
      </td>
    </tr>`;
  });
}

function renderLastControls() {
  const tbody = document.getElementById('lastControls');
  tbody.innerHTML = '';
  controles.filter(c => !c.site || c.site === currentSite).slice(-5).reverse().forEach(c => {
    const cls = c.resultat === 'Conforme' ? 'ok' : 'danger';
    tbody.innerHTML += `<tr><td>${c.date}</td><td>${c.eqId}</td><td>${c.type}</td>
      <td><span class="badge ${cls}">${c.resultat}</span></td></tr>`;
  });
}

function renderUsers() {
  const tbody = document.getElementById('listUsers');
  if (!tbody) return;
  tbody.innerHTML = '';
  users.forEach((u, i) => {
    tbody.innerHTML += `<tr><td>${u.user}</td><td>${u.role}</td><td>${u.site || '-'}</td>
      <td>${u.user !== 'admin' ? `<button class="btn-sm red" onclick="delUser(${i})">✕</button>` : ''}</td></tr>`;
  });
}

/* ---------- ALERTES ---------- */
function renderAlerts() {
  const box = document.getElementById('alertList');
  if (!box) return;
  box.innerHTML = '';
  const today = new Date();
  let alerts = [];
  equipements.filter(e => !e.site || e.site === currentSite).forEach(eq => {
    const list = controles.filter(c => c.eqId === eq.id);
    const last = list[list.length - 1];
    if (!last) alerts.push({ n: 'danger', m: `${eq.id} – Aucun contrôle` });
    else {
      const jours = (today - new Date(last.date)) / 86400000;
      const seuil = last.type === 'Hebdomadaire' ? seuils.hebdo : seuils.mensuel;
      if (jours > seuil) alerts.push({ n: 'danger', m: `${eq.id} – Contrôle en retard (${Math.floor(jours)} j)` });
      else if (jours > seuil * 0.8) alerts.push({ n: 'warn', m: `${eq.id} – Contrôle bientôt dû` });
    }
    if (eq.type === 'Batterie' && last && last.valeur) {
      const mV = parseFloat(last.valeur.replace(',', '.').match(/[\d.]+/)?.[0]);
      if (!isNaN(mV) && mV < seuils.batV) alerts.push({ n: 'danger', m: `${eq.id} – Tension basse (${mV} V)` });
    }
  });
  controles.filter(c => c.resultat === 'Non conforme' && !c.valide && (!c.site || c.site === currentSite)).forEach(c => {
    alerts.push({ n: 'danger', m: `${c.eqId} – Non conforme le ${c.date}` });
  });
  if (!getCurrentDuty()) alerts.push({ n: 'warn', m: 'Aucun technicien en poste sur ' + currentSite });
  if (!alerts.length) { box.innerHTML = '<div class="alert-item ok">✅ Aucune alerte.</div>'; return; }
  alerts.forEach(a => box.innerHTML += `<div class="alert-item ${a.n}">${a.m}</div>`);
}

/* ---------- ADMIN ---------- */
function loadSeuilsForm() {
  document.getElementById('seuilBatV').value = seuils.batV;
  document.getElementById('seuilBatT').value = seuils.batT;
  document.getElementById('seuilOndAuto').value = seuils.ondAuto;
  document.getElementById('seuilGeCarb').value = seuils.geCarb;
  document.getElementById('seuilHebdo').value = seuils.hebdo;
  document.getElementById('seuilMensuel').value = seuils.mensuel;
}

function saveSeuils(e) {
  e.preventDefault();
  seuils.batV = +document.getElementById('seuilBatV').value;
  seuils.batT = +document.getElementById('seuilBatT').value;
  seuils.ondAuto = +document.getElementById('seuilOndAuto').value;
  seuils.geCarb = +document.getElementById('seuilGeCarb').value;
  seuils.hebdo = +document.getElementById('seuilHebdo').value;
  seuils.mensuel = +document.getElementById('seuilMensuel').value;
  save(); alert('Seuils enregistrés'); renderAll();
}

function addUser(e) {
  e.preventDefault();
  const u = document.getElementById('newUser').value.trim();
  const p = document.getElementById('newPass').value;
  const r = document.getElementById('newRole').value;
  const site = document.getElementById('newUserSite').value;
  if (users.some(x => x.user === u)) { alert('Existant'); return; }
  users.push({ user: u, pass: p, role: r, site });
  save(); renderUsers(); renderDuty();
  document.getElementById('newUser').value = '';
  document.getElementById('newPass').value = '';
  alert('Utilisateur ajouté');
}

function delUser(i) {
  if (!confirm('Supprimer ?')) return;
  users.splice(i, 1); save(); renderUsers(); renderDuty();
}

/* ---------- RAPPORTS ---------- */
function toggleReportDates() {
  const t = document.getElementById('rapType').value;
  document.getElementById('rapDates').classList.toggle('hidden', t !== 'perso');
}

function generateReport(e) {
  e.preventDefault();
  const type = document.getElementById('rapType').value;
  const siteFilter = document.getElementById('rapSite').value;
  const zone = document.getElementById('rapZone').value;
  const eqType = document.getElementById('rapEq').value;
  const today = new Date();
  let debut, fin = today;
  if (type === 'jour') debut = new Date(today);
  else if (type === 'semaine') { debut = new Date(today); debut.setDate(debut.getDate() - 6); }
  else if (type === 'mois') { debut = new Date(today); debut.setDate(debut.getDate() - 29); }
  else {
    const d = document.getElementById('rapDebut').value;
    const f = document.getElementById('rapFin').value;
    if (!d || !f) { alert('Dates requises'); return; }
    debut = new Date(d); fin = new Date(f);
  }
  debut.setHours(0,0,0,0); fin.setHours(23,59,59,999);
  const filterCtrl = controles.filter(c => {
    const d = new Date(c.date);
    if (d < debut || d > fin) return false;
    const eq = equipements.find(e => e.id === c.eqId);
    if (!eq) return false;
    if (siteFilter && (eq.site || 'AIBD') !== siteFilter) return false;
    if (!siteFilter && (eq.site || 'AIBD') !== currentSite) return false;
    if (zone && eq.zone !== zone) return false;
    if (eqType && eq.type !== eqType) return false;
    return true;
  });
  const filterDuty = duties.filter(d => {
    const dd = new Date(d.date);
    if (dd < debut || dd > fin) return false;
    if (siteFilter && (d.site || 'AIBD') !== siteFilter) return false;
    return true;
  });
  lastReportData = { filterCtrl, filterDuty, debut, fin, type, zone, eqType, site: siteFilter || currentSite };
  renderReport();
}

const ASECNA_LOGO = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgMTIwIj48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSI1NSIgZmlsbD0iIzAwMzM2NiIgc3Ryb2tlPSIjZmZjYzAwIiBzdHJva2Utd2lkdGg9IjQiLz48dGV4dCB4PSI2MCIgeT0iNzIiIGZvbnQtc2l6ZT0iMjIiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtd2VpZ2h0PSJib2xkIj5BU0VDTkE8L3RleHQ+PHRleHQgeD0iNjAiIHk9IjkyIiBmb250LXNpemU9IjEwIiBmaWxsPSIjZmZjYzAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiPkFJQkQ8L3RleHQ+PC9zdmc+`;

function renderReport() {
  const { filterCtrl, filterDuty, debut, fin, type, zone, eqType, site } = lastReportData;
  const total = filterCtrl.length;
  const conformes = filterCtrl.filter(c => c.resultat === 'Conforme').length;
  const nonConf = total - conformes;
  const valides = filterCtrl.filter(c => c.valide).length;
  const typeLabel = { jour: 'Journalier', semaine: 'Hebdomadaire', mois: 'Mensuel', perso: 'Personnalisé' }[type];
  let html = `
    <div class="report-header">
      <img src="${ASECNA_LOGO}" class="logo" alt="ASECNA">
      <h2>ASECNA – ${site}</h2>
      <div class="sub">Rapport de suivi des équipements de secours</div>
      <div class="sub"><b>${typeLabel}</b> – du ${debut.toLocaleDateString('fr-FR')} au ${fin.toLocaleDateString('fr-FR')}</div>
      <div class="sub">Zone : ${zone || 'Toutes'} | Type : ${eqType || 'Tous'}</div>
      <div class="sub">Généré le ${new Date().toLocaleString('fr-FR')} par ${currentUser.user}</div>
    </div>
    <div class="report-section">
      <h3>1. Synthèse</h3>
      <table class="report-table">
        <tr><th>Total contrôles</th><td>${total}</td></tr>
        <tr><th>Conformes</th><td>${conformes}</td></tr>
        <tr><th>Non conformes</th><td>${nonConf}</td></tr>
        <tr><th>Validés (signés)</th><td>${valides}</td></tr>
        <tr><th>Postes</th><td>${filterDuty.length}</td></tr>
      </table>
    </div>
    <div class="report-section">
      <h3>2. Détail des contrôles</h3>
      <table class="report-table">
        <thead><tr><th>Date</th><th>Équipement</th><th>Zone</th><th>Type</th><th>Valeurs</th><th>Résultat</th><th>Photos</th><th>Signature</th></tr></thead>
        <tbody>`;
  if (!filterCtrl.length) html += `<tr><td colspan="8" style="text-align:center;">Aucun contrôle</td></tr>`;
  else filterCtrl.forEach(c => {
    const eq = equipements.find(e => e.id === c.eqId);
    const photos = (c.photos || []).map(p => `<img src="${p}" class="report-photo">`).join('');
    html += `<tr><td>${c.date}</td><td>${c.eqId}</td><td>${eq ? eq.zone : ''}</td><td>${c.type}</td>
      <td>${c.valeur || '-'}</td><td>${c.resultat}</td><td>${photos || '-'}</td>
      <td>${c.signature ? `<div class="report-signature"><img src="${c.signature}"></div>` : '-'}</td></tr>`;
  });
  html += `</tbody></table></div>
    <div class="report-section">
      <h3>3. Postes</h3>
      <table class="report-table">
        <thead><tr><th>Date</th><th>Technicien</th><th>Plage</th><th>Début</th><th>Fin</th></tr></thead>
        <tbody>`;
  if (!filterDuty.length) html += `<tr><td colspan="5" style="text-align:center;">Aucun poste</td></tr>`;
  else filterDuty.forEach(d => {
    html += `<tr><td>${d.date}</td><td>${d.technicien}</td><td>${d.plage || '-'}</td>
      <td>${new Date(d.debut).toLocaleTimeString('fr-FR')}</td>
      <td>${d.fin ? new Date(d.fin).toLocaleTimeString('fr-FR') : 'En cours'}</td></tr>`;
  });
  html += `</tbody></table></div>
    <div class="report-section">
      <h3>4. Visas</h3>
      <table class="report-table">
        <tr><th>Technicien en poste</th><th>Chef d'équipe</th><th>Responsable</th></tr>
        <tr><td style="height:80px;"></td><td style="height:80px;"></td><td style="height:80px;"></td></tr>
      </table>
    </div>
    <div class="report-footer">ASECNA – ${site} – Document généré automatiquement</div>`;
  document.getElementById('rapContent').innerHTML = html;
  document.getElementById('rapActions').style.display = 'block';
}

function exportReportCSV() {
  if (!lastReportData) return;
  const { filterCtrl, filterDuty, debut, fin } = lastReportData;
  let csv = `ASECNA - Rapport du ${debut.toLocaleDateString('fr-FR')} au ${fin.toLocaleDateString('fr-FR')}\n\n`;
  csv += 'Date;Équipement;Zone;Type;Valeurs;Résultat;Validé par;Signé;Photos\n';
  filterCtrl.forEach(c => {
    const eq = equipements.find(e => e.id === c.eqId);
    csv += `${c.date};${c.eqId};${eq?eq.zone:''};${c.type};${c.valeur};${c.resultat};${c.validePar||''};${c.signature?'Oui':'Non'};${(c.photos||[]).length}\n`;
  });
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `Rapport_ASECNA_${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function sendReportByEmail() {
  if (!lastReportData) { alert('Générez d\'abord un rapport.'); return; }
  const email = document.getElementById('rapEmail').value.trim();
  if (!email) { alert('Saisissez une adresse email.'); return; }
  const { debut, fin, filterCtrl, filterDuty, site } = lastReportData;
  const conformes = filterCtrl.filter(c => c.resultat === 'Conforme').length;
  const nonConf = filterCtrl.length - conformes;
  const valides = filterCtrl.filter(c => c.valide).length;
  const subject = encodeURIComponent(`Rapport ASECNA ${site} – ${debut.toLocaleDateString('fr-FR')} au ${fin.toLocaleDateString('fr-FR')}`);
  const body = encodeURIComponent(
`Rapport de suivi des équipements de secours

Site : ${site}
Période : du ${debut.toLocaleDateString('fr-FR')} au ${fin.toLocaleDateString('fr-FR')}

SYNTHÈSE :
- Total contrôles : ${filterCtrl.length}
- Conformes : ${conformes}
- Non conformes : ${nonConf}
- Validés (signés) : ${valides}
- Postes : ${filterDuty.length}

Généré le ${new Date().toLocaleString('fr-FR')} par ${currentUser.user}`);
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

/* ---------- EXPORTS ---------- */
function exportCSV() {
  let csv = '=== INVENTAIRE ===\n';
  csv += 'ID;Type;Site;Zone;Localisation;Marque;N° série;Date;Criticité;État\n';
  equipements.forEach(e => csv += `${e.id};${e.type};${e.site||''};${e.zone};${e.loc};${e.marque};${e.serie};${e.date};${e.crit};${e.etat}\n`);
  csv += '\n=== CONTRÔLES ===\n';
  csv += 'Date;Équipement;Site;Type;Valeurs;Résultat;Validé;Validé par;Signé;Photos;Auteur\n';
  controles.forEach(c => csv += `${c.date};${c.eqId};${c.site||''};${c.type};${c.valeur};${c.resultat};${c.valide?'Oui':'Non'};${c.validePar||''};${c.signature?'Oui':'Non'};${(c.photos||[]).length};${c.auteur}\n`);
  csv += '\n=== POSTES ===\nDate;Technicien;Site;Plage;Début;Fin\n';
  duties.forEach(d => csv += `${d.date};${d.technicien};${d.site||''};${d.plage||''};${d.debut};${d.fin||''}\n`);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `ASECNA_${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function resetAll() {
  if (!confirm('⚠️ Effacer TOUTES les données ?')) return;
  if (!confirm('Confirmer ?')) return;
  localStorage.clear(); sessionStorage.clear(); location.reload();
}
/* =========================================================
   APP.JS — PARTIE 3/4
   Rendu, alertes, admin, rapports
   ========================================================= */

/* ---------- RENDU ---------- */
function renderAll() {
  renderStats();
  renderEquip();
  renderCtrl();
  renderAlerts();
  renderLastControls();
  renderUsers();
  renderDuty();
  renderGraph();
  renderCharts();
}

function renderStats() {
  const eqs = equipements.filter(e => !e.site || e.site === currentSite);
  const ctrls = controles.filter(c => !c.site || c.site === currentSite);
  document.getElementById('sTotal').textContent = eqs.length;
  document.getElementById('sBat').textContent = eqs.filter(x => x.type === 'Batterie').length;
  document.getElementById('sOnd').textContent = eqs.filter(x => x.type === 'Onduleur').length;
  document.getElementById('sCha').textContent = eqs.filter(x => x.type === 'Chargeur').length;
  document.getElementById('sGE').textContent  = eqs.filter(x => x.type === 'Groupe électrogène').length;
  document.getElementById('sCtrl').textContent = ctrls.length;
}

function renderGraph() {
  const box = document.getElementById('graphContainer');
  if (!box) return;
  const types = ['Batterie', 'Onduleur', 'Chargeur', 'Groupe électrogène'];
  box.innerHTML = '';
  types.forEach(t => {
    const eqs = equipements.filter(e => e.type === t && (!e.site || e.site === currentSite));
    if (!eqs.length) return;
    const bons = eqs.filter(e => e.etat === 'Bon').length;
    const pct = Math.round((bons / eqs.length) * 100);
    const color = pct >= 80 ? 'green' : (pct >= 50 ? 'orange' : 'red');
    box.innerHTML += `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span><b>${t}</b></span><span>${bons}/${eqs.length} (${pct}%)</span>
      </div>
      <div class="bar-wrap"><div class="bar ${color}" style="width:${pct}%"></div></div>
    </div>`;
  });
  if (!box.innerHTML) box.innerHTML = '<p style="font-size:12px;color:var(--text2);">Aucun équipement pour ' + currentSite + '.</p>';
}

function renderEquip() {
  const q = (document.getElementById('searchEquip')?.value || '').toLowerCase();
  const tbody = document.getElementById('listEquip');
  tbody.innerHTML = '';
  equipements
    .filter(e => (!e.site || e.site === currentSite))
    .filter(e => !q || e.id.toLowerCase().includes(q) || e.zone.toLowerCase().includes(q))
    .forEach(eq => {
      const cls = eq.etat === 'Bon' ? 'ok' : (eq.etat === 'À surveiller' ? 'warn' : 'danger');
      tbody.innerHTML += `<tr>
        <td>${eq.id}</td><td>${eq.type}</td><td>${eq.site || 'AIBD'}</td><td>${eq.zone}</td>
        <td><span class="badge ${cls}">${eq.etat}</span></td>
        <td>
          <button class="btn-sm blue" onclick="openFiche('${eq.id}')">👁️</button>
          <button class="btn-sm purple" onclick="showQR('${eq.id}')">QR</button>
          <button class="btn-sm red" onclick="delEquip('${eq.id}')">✕</button>
        </td>
      </tr>`;
    });
  const sel = document.getElementById('ctEquip');
  sel.innerHTML = '<option value="">-- Choisir --</option>';
  equipements.filter(e => !e.site || e.site === currentSite)
    .forEach(eq => sel.innerHTML += `<option value="${eq.id}">${eq.id} – ${eq.type} (${eq.zone})</option>`);
}

function renderCtrl() {
  const tbody = document.getElementById('listCtrl');
  tbody.innerHTML = '';
  controles.filter(c => !c.site || c.site === currentSite).slice().reverse().forEach(c => {
    const cls = c.resultat === 'Conforme' ? 'ok' : 'danger';
    const vCls = c.valide ? 'ok' : 'warn';
    const validePar = c.valide ? `<span class="badge ${vCls}">${c.validePar}</span>` : `<span class="badge ${vCls}">En attente</span>`;
    const hasPhotos = (c.photos && c.photos.length) ? `<span class="badge info">📷${c.photos.length}</span>` : '';
    tbody.innerHTML += `<tr>
      <td>${c.date}</td><td>${c.eqId}</td><td>${c.type}</td>
      <td><span class="badge ${cls}">${c.resultat}</span> ${hasPhotos}</td>
      <td>${validePar}</td>
      <td>
        ${!c.valide ? `<button class="btn-sm green" onclick="openSignatureModal(${c.id})">✍️</button>` : ''}
        ${c.signature ? `<button class="btn-sm blue" onclick="viewSignature(${c.id})">👁️</button>` : ''}
        <button class="btn-sm red" onclick="delCtrl(${c.id})">✕</button>
      </td>
    </tr>`;
  });
}

function renderLastControls() {
  const tbody = document.getElementById('lastControls');
  tbody.innerHTML = '';
  controles.filter(c => !c.site || c.site === currentSite).slice(-5).reverse().forEach(c => {
    const cls = c.resultat === 'Conforme' ? 'ok' : 'danger';
    tbody.innerHTML += `<tr><td>${c.date}</td><td>${c.eqId}</td><td>${c.type}</td>
      <td><span class="badge ${cls}">${c.resultat}</span></td></tr>`;
  });
}

function renderUsers() {
  const tbody = document.getElementById('listUsers');
  if (!tbody) return;
  tbody.innerHTML = '';
  users.forEach((u, i) => {
    tbody.innerHTML += `<tr><td>${u.user}</td><td>${u.role}</td><td>${u.site || '-'}</td>
      <td>${u.user !== 'admin' ? `<button class="btn-sm red" onclick="delUser(${i})">✕</button>` : ''}</td></tr>`;
  });
}

/* ---------- ALERTES ---------- */
function renderAlerts() {
  const box = document.getElementById('alertList');
  if (!box) return;
  box.innerHTML = '';
  const today = new Date();
  let alerts = [];
  equipements.filter(e => !e.site || e.site === currentSite).forEach(eq => {
    const list = controles.filter(c => c.eqId === eq.id);
    const last = list[list.length - 1];
    if (!last) alerts.push({ n: 'danger', m: `${eq.id} – Aucun contrôle` });
    else {
      const jours = (today - new Date(last.date)) / 86400000;
      const seuil = last.type === 'Hebdomadaire' ? seuils.hebdo : seuils.mensuel;
      if (jours > seuil) alerts.push({ n: 'danger', m: `${eq.id} – Contrôle en retard (${Math.floor(jours)} j)` });
      else if (jours > seuil * 0.8) alerts.push({ n: 'warn', m: `${eq.id} – Contrôle bientôt dû` });
    }
    if (eq.type === 'Batterie' && last && last.valeur) {
      const mV = parseFloat(last.valeur.replace(',', '.').match(/[\d.]+/)?.[0]);
      if (!isNaN(mV) && mV < seuils.batV) alerts.push({ n: 'danger', m: `${eq.id} – Tension basse (${mV} V)` });
    }
  });
  controles.filter(c => c.resultat === 'Non conforme' && !c.valide && (!c.site || c.site === currentSite)).forEach(c => {
    alerts.push({ n: 'danger', m: `${c.eqId} – Non conforme le ${c.date}` });
  });
  if (!getCurrentDuty()) alerts.push({ n: 'warn', m: 'Aucun technicien en poste sur ' + currentSite });
  if (!alerts.length) { box.innerHTML = '<div class="alert-item ok">✅ Aucune alerte.</div>'; return; }
  alerts.forEach(a => box.innerHTML += `<div class="alert-item ${a.n}">${a.m}</div>`);
}

/* ---------- ADMIN ---------- */
function loadSeuilsForm() {
  document.getElementById('seuilBatV').value = seuils.batV;
  document.getElementById('seuilBatT').value = seuils.batT;
  document.getElementById('seuilOndAuto').value = seuils.ondAuto;
  document.getElementById('seuilGeCarb').value = seuils.geCarb;
  document.getElementById('seuilHebdo').value = seuils.hebdo;
  document.getElementById('seuilMensuel').value = seuils.mensuel;
}

function saveSeuils(e) {
  e.preventDefault();
  seuils.batV = +document.getElementById('seuilBatV').value;
  seuils.batT = +document.getElementById('seuilBatT').value;
  seuils.ondAuto = +document.getElementById('seuilOndAuto').value;
  seuils.geCarb = +document.getElementById('seuilGeCarb').value;
  seuils.hebdo = +document.getElementById('seuilHebdo').value;
  seuils.mensuel = +document.getElementById('seuilMensuel').value;
  save(); alert('Seuils enregistrés'); renderAll();
}

function addUser(e) {
  e.preventDefault();
  const u = document.getElementById('newUser').value.trim();
  const p = document.getElementById('newPass').value;
  const r = document.getElementById('newRole').value;
  const site = document.getElementById('newUserSite').value;
  if (users.some(x => x.user === u)) { alert('Existant'); return; }
  users.push({ user: u, pass: p, role: r, site });
  save(); renderUsers(); renderDuty();
  document.getElementById('newUser').value = '';
  document.getElementById('newPass').value = '';
  alert('Utilisateur ajouté');
}

function delUser(i) {
  if (!confirm('Supprimer ?')) return;
  users.splice(i, 1); save(); renderUsers(); renderDuty();
}

/* ---------- RAPPORTS ---------- */
function toggleReportDates() {
  const t = document.getElementById('rapType').value;
  document.getElementById('rapDates').classList.toggle('hidden', t !== 'perso');
}

function generateReport(e) {
  e.preventDefault();
  const type = document.getElementById('rapType').value;
  const siteFilter = document.getElementById('rapSite').value;
  const zone = document.getElementById('rapZone').value;
  const eqType = document.getElementById('rapEq').value;
  const today = new Date();
  let debut, fin = today;
  if (type === 'jour') debut = new Date(today);
  else if (type === 'semaine') { debut = new Date(today); debut.setDate(debut.getDate() - 6); }
  else if (type === 'mois') { debut = new Date(today); debut.setDate(debut.getDate() - 29); }
  else {
    const d = document.getElementById('rapDebut').value;
    const f = document.getElementById('rapFin').value;
    if (!d || !f) { alert('Dates requises'); return; }
    debut = new Date(d); fin = new Date(f);
  }
  debut.setHours(0,0,0,0); fin.setHours(23,59,59,999);
  const filterCtrl = controles.filter(c => {
    const d = new Date(c.date);
    if (d < debut || d > fin) return false;
    const eq = equipements.find(e => e.id === c.eqId);
    if (!eq) return false;
    if (siteFilter && (eq.site || 'AIBD') !== siteFilter) return false;
    if (!siteFilter && (eq.site || 'AIBD') !== currentSite) return false;
    if (zone && eq.zone !== zone) return false;
    if (eqType && eq.type !== eqType) return false;
    return true;
  });
  const filterDuty = duties.filter(d => {
    const dd = new Date(d.date);
    if (dd < debut || dd > fin) return false;
    if (siteFilter && (d.site || 'AIBD') !== siteFilter) return false;
    return true;
  });
  lastReportData = { filterCtrl, filterDuty, debut, fin, type, zone, eqType, site: siteFilter || currentSite };
  renderReport();
}

const ASECNA_LOGO = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgMTIwIj48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSI1NSIgZmlsbD0iIzAwMzM2NiIgc3Ryb2tlPSIjZmZjYzAwIiBzdHJva2Utd2lkdGg9IjQiLz48dGV4dCB4PSI2MCIgeT0iNzIiIGZvbnQtc2l6ZT0iMjIiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtd2VpZ2h0PSJib2xkIj5BU0VDTkE8L3RleHQ+PHRleHQgeD0iNjAiIHk9IjkyIiBmb250LXNpemU9IjEwIiBmaWxsPSIjZmZjYzAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiPkFJQkQ8L3RleHQ+PC9zdmc+`;

function renderReport() {
  const { filterCtrl, filterDuty, debut, fin, type, zone, eqType, site } = lastReportData;
  const total = filterCtrl.length;
  const conformes = filterCtrl.filter(c => c.resultat === 'Conforme').length;
  const nonConf = total - conformes;
  const valides = filterCtrl.filter(c => c.valide).length;
  const typeLabel = { jour: 'Journalier', semaine: 'Hebdomadaire', mois: 'Mensuel', perso: 'Personnalisé' }[type];
  let html = `
    <div class="report-header">
      <img src="${ASECNA_LOGO}" class="logo" alt="ASECNA">
      <h2>ASECNA – ${site}</h2>
      <div class="sub">Rapport de suivi des équipements de secours</div>
      <div class="sub"><b>${typeLabel}</b> – du ${debut.toLocaleDateString('fr-FR')} au ${fin.toLocaleDateString('fr-FR')}</div>
      <div class="sub">Zone : ${zone || 'Toutes'} | Type : ${eqType || 'Tous'}</div>
      <div class="sub">Généré le ${new Date().toLocaleString('fr-FR')} par ${currentUser.user}</div>
    </div>
    <div class="report-section">
      <h3>1. Synthèse</h3>
      <table class="report-table">
        <tr><th>Total contrôles</th><td>${total}</td></tr>
        <tr><th>Conformes</th><td>${conformes}</td></tr>
        <tr><th>Non conformes</th><td>${nonConf}</td></tr>
        <tr><th>Validés (signés)</th><td>${valides}</td></tr>
        <tr><th>Postes</th><td>${filterDuty.length}</td></tr>
      </table>
    </div>
    <div class="report-section">
      <h3>2. Détail des contrôles</h3>
      <table class="report-table">
        <thead><tr><th>Date</th><th>Équipement</th><th>Zone</th><th>Type</th><th>Valeurs</th><th>Résultat</th><th>Photos</th><th>Signature</th></tr></thead>
        <tbody>`;
  if (!filterCtrl.length) html += `<tr><td colspan="8" style="text-align:center;">Aucun contrôle</td></tr>`;
  else filterCtrl.forEach(c => {
    const eq = equipements.find(e => e.id === c.eqId);
    const photos = (c.photos || []).map(p => `<img src="${p}" class="report-photo">`).join('');
    html += `<tr><td>${c.date}</td><td>${c.eqId}</td><td>${eq ? eq.zone : ''}</td><td>${c.type}</td>
      <td>${c.valeur || '-'}</td><td>${c.resultat}</td><td>${photos || '-'}</td>
      <td>${c.signature ? `<div class="report-signature"><img src="${c.signature}"></div>` : '-'}</td></tr>`;
  });
  html += `</tbody></table></div>
    <div class="report-section">
      <h3>3. Postes</h3>
      <table class="report-table">
        <thead><tr><th>Date</th><th>Technicien</th><th>Plage</th><th>Début</th><th>Fin</th></tr></thead>
        <tbody>`;
  if (!filterDuty.length) html += `<tr><td colspan="5" style="text-align:center;">Aucun poste</td></tr>`;
  else filterDuty.forEach(d => {
    html += `<tr><td>${d.date}</td><td>${d.technicien}</td><td>${d.plage || '-'}</td>
      <td>${new Date(d.debut).toLocaleTimeString('fr-FR')}</td>
      <td>${d.fin ? new Date(d.fin).toLocaleTimeString('fr-FR') : 'En cours'}</td></tr>`;
  });
  html += `</tbody></table></div>
    <div class="report-section">
      <h3>4. Visas</h3>
      <table class="report-table">
        <tr><th>Technicien en poste</th><th>Chef d'équipe</th><th>Responsable</th></tr>
        <tr><td style="height:80px;"></td><td style="height:80px;"></td><td style="height:80px;"></td></tr>
      </table>
    </div>
    <div class="report-footer">ASECNA – ${site} – Document généré automatiquement</div>`;
  document.getElementById('rapContent').innerHTML = html;
  document.getElementById('rapActions').style.display = 'block';
}

function exportReportCSV() {
  if (!lastReportData) return;
  const { filterCtrl, filterDuty, debut, fin } = lastReportData;
  let csv = `ASECNA - Rapport du ${debut.toLocaleDateString('fr-FR')} au ${fin.toLocaleDateString('fr-FR')}\n\n`;
  csv += 'Date;Équipement;Zone;Type;Valeurs;Résultat;Validé par;Signé;Photos\n';
  filterCtrl.forEach(c => {
    const eq = equipements.find(e => e.id === c.eqId);
    csv += `${c.date};${c.eqId};${eq?eq.zone:''};${c.type};${c.valeur};${c.resultat};${c.validePar||''};${c.signature?'Oui':'Non'};${(c.photos||[]).length}\n`;
  });
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `Rapport_ASECNA_${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function sendReportByEmail() {
  if (!lastReportData) { alert('Générez d\'abord un rapport.'); return; }
  const email = document.getElementById('rapEmail').value.trim();
  if (!email) { alert('Saisissez une adresse email.'); return; }
  const { debut, fin, filterCtrl, filterDuty, site } = lastReportData;
  const conformes = filterCtrl.filter(c => c.resultat === 'Conforme').length;
  const nonConf = filterCtrl.length - conformes;
  const valides = filterCtrl.filter(c => c.valide).length;
  const subject = encodeURIComponent(`Rapport ASECNA ${site} – ${debut.toLocaleDateString('fr-FR')} au ${fin.toLocaleDateString('fr-FR')}`);
  const body = encodeURIComponent(
`Rapport de suivi des équipements de secours

Site : ${site}
Période : du ${debut.toLocaleDateString('fr-FR')} au ${fin.toLocaleDateString('fr-FR')}

SYNTHÈSE :
- Total contrôles : ${filterCtrl.length}
- Conformes : ${conformes}
- Non conformes : ${nonConf}
- Validés (signés) : ${valides}
- Postes : ${filterDuty.length}

Généré le ${new Date().toLocaleString('fr-FR')} par ${currentUser.user}`);
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

/* ---------- EXPORTS ---------- */
function exportCSV() {
  let csv = '=== INVENTAIRE ===\n';
  csv += 'ID;Type;Site;Zone;Localisation;Marque;N° série;Date;Criticité;État\n';
  equipements.forEach(e => csv += `${e.id};${e.type};${e.site||''};${e.zone};${e.loc};${e.marque};${e.serie};${e.date};${e.crit};${e.etat}\n`);
  csv += '\n=== CONTRÔLES ===\n';
  csv += 'Date;Équipement;Site;Type;Valeurs;Résultat;Validé;Validé par;Signé;Photos;Auteur\n';
  controles.forEach(c => csv += `${c.date};${c.eqId};${c.site||''};${c.type};${c.valeur};${c.resultat};${c.valide?'Oui':'Non'};${c.validePar||''};${c.signature?'Oui':'Non'};${(c.photos||[]).length};${c.auteur}\n`);
  csv += '\n=== POSTES ===\nDate;Technicien;Site;Plage;Début;Fin\n';
  duties.forEach(d => csv += `${d.date};${d.technicien};${d.site||''};${d.plage||''};${d.debut};${d.fin||''}\n`);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `ASECNA_${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function resetAll() {
  if (!confirm('⚠️ Effacer TOUTES les données ?')) return;
  if (!confirm('Confirmer ?')) return;
  localStorage.clear(); sessionStorage.clear(); location.reload();
}
/* =========================================================
   APP.JS — PARTIE 4/4
   Graphiques, online/offline, PWA, initialisation
   ========================================================= */

/* ---------- GRAPHIQUES ---------- */
function renderCharts() { drawChartControles(); drawChartTypes(); }

function drawChartControles() {
  const c = document.getElementById('chartControles');
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.offsetWidth;
  const h = 220;
  c.width = w * dpr; c.height = h * dpr;
  c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0,10));
  }
  const counts = days.map(day => controles.filter(x => x.date === day && (!x.site || x.site === currentSite)).length);
  const max = Math.max(...counts, 1);
  const padL = 30, padR = 10, padT = 20, padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text2');
  ctx.font = '10px Arial';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (plotH * i / 4);
    const val = Math.round(max * i / 4);
    ctx.fillText(val, padL - 5, y + 3);
    ctx.strokeStyle = 'rgba(150,150,150,0.2)';
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
  }
  const barW = plotW / days.length * 0.6;
  const gap = plotW / days.length;
  days.forEach((day, i) => {
    const val = counts[i];
    const barH = (val / max) * plotH;
    const x = padL + i * gap + (gap - barW) / 2;
    const y = padT + plotH - barH;
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, '#00509e');
    grad.addColorStop(1, '#003366');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text2');
    ctx.textAlign = 'center';
    ctx.font = '9px Arial';
    ctx.fillText(day.slice(5).replace('-', '/'), x + barW/2, h - padB + 15);
    if (val > 0) {
      ctx.fillStyle = '#003366';
      ctx.font = 'bold 10px Arial';
      ctx.fillText(val, x + barW/2, y - 4);
    }
  });
}

function drawChartTypes() {
  const c = document.getElementById('chartTypes');
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.offsetWidth;
  const h = 220;
  c.width = w * dpr; c.height = h * dpr;
  c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const eqs = equipements.filter(e => !e.site || e.site === currentSite);
  const types = ['Batterie','Onduleur','Chargeur','Groupe électrogène'];
  const colors = ['#003366', '#00509e', '#20c997', '#fd7e14'];
  const counts = types.map(t => eqs.filter(e => e.type === t).length);
  const total = counts.reduce((a,b) => a+b, 0);
  if (!total) {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text2');
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Aucune donnée', w/2, h/2);
    return;
  }
  const cx = w * 0.35, cy = h * 0.55;
  const radius = Math.min(w * 0.25, h * 0.35);
  const innerR = radius * 0.55;
  let startAngle = -Math.PI / 2;
  counts.forEach((cnt, i) => {
    if (cnt === 0) return;
    const angle = (cnt / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.fill();
    startAngle += angle;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--card');
  ctx.fill();
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text');
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(total, cx, cy + 2);
  const legendX = w * 0.65;
  let legendY = 40;
  types.forEach((t, i) => {
    ctx.fillStyle = colors[i];
    ctx.fillRect(legendX, legendY - 10, 14, 14);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text');
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${t} (${counts[i]})`, legendX + 20, legendY + 1);
    legendY += 22;
  });
}

window.addEventListener('resize', () => { renderCharts(); });

/* ---------- ONLINE / OFFLINE ---------- */
window.addEventListener('online', () => {
  if (typeof updateOnlineBadge === 'function') updateOnlineBadge();
  if (typeof firebaseReady !== 'undefined' && firebaseReady && typeof syncQueue !== 'undefined' && syncQueue.length > 0) {
    if (typeof pushToFirebase === 'function') pushToFirebase();
  }
});
window.addEventListener('offline', () => {
  if (typeof updateOnlineBadge === 'function') updateOnlineBadge();
});

/* ---------- PWA ---------- */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  document.getElementById('installBtn').style.display = 'block';
});

function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    installPrompt.userChoice.then(r => { if (r.outcome === 'accepted') document.getElementById('installBtn').style.display = 'none'; });
  } else {
    alert("Menu navigateur → « Installer l'application » ou « Ajouter à l'écran d'accueil ».");
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swCode = `
      const CACHE = 'asecna-v3';
      self.addEventListener('install', e => self.skipWaiting());
      self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
      self.addEventListener('fetch', e => {
        if (e.request.method !== 'GET') return;
        e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
          if (resp.ok && new URL(e.request.url).origin === location.origin) {
            const clone = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return resp;
        }).catch(() => caches.match(e.request))));
      });
    `;
    const blob = new Blob([swCode], { type: 'text/javascript' });
    const swUrl = URL.createObjectURL(blob);
    navigator.serviceWorker.register(swUrl).catch(() => {});
  });
}

/* ---------- INITIALISATION ---------- */
function init() {
  fillSitesSelects();
  renderSites();
  const savedUser = sessionStorage.getItem('currentUser');
  const savedSite = sessionStorage.getItem('currentSite');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    currentSite = savedSite || currentUser.site || 'AIBD';
    enterApp();
  }
  if (typeof initFirebase === 'function') initFirebase();
  if (typeof updateOnlineBadge === 'function') updateOnlineBadge();
  if (typeof updateSyncTime === 'function') updateSyncTime();
  setTimeout(checkAndNotify, 5000);
}

init();