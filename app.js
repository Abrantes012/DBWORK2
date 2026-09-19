const USERS_KEY = "dbwork_users_v3", SESSION_KEY = "dbwork_session_v3", LOCATIONS_KEY = "dbwork_locations_v3", ACTIVE_LOCATION_KEY = "dbwork_active_location_v3";

// Google Sheets sync configuration. Set API_URL in config.js to your deployed
// Google Apps Script Web App URL. If it is empty, the app falls back to localStorage.
const API_URL = (window.DBWORK_CONFIG && window.DBWORK_CONFIG.API_URL) || "";
let REMOTE_USERS = null;
let REMOTE_LOCATIONS = null;
let REMOTE_READY = false;

async function apiGet(action) {
  if (!API_URL) return null;
  const res = await fetch(API_URL + "?action=" + encodeURIComponent(action), { cache: "no-store" });
  if (!res.ok) throw new Error("API request failed: " + res.status);
  return await res.json();
}

async function apiPost(action, payload) {
  if (!API_URL) return null;
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload })
  });
  if (!res.ok) throw new Error("API request failed: " + res.status);
  return await res.json();
}

async function loadRemoteData() {
  if (!API_URL) return;
  try {
    const data = await apiGet("bootstrap");
    REMOTE_USERS = Array.isArray(data?.users) && data.users.length ? data.users : defaultUsers.map(x => ({ ...x }));
    REMOTE_LOCATIONS = Array.isArray(data?.locations) && data.locations.length ? data.locations : [defaultLocation()];
    REMOTE_READY = true;
    localStorage.setItem(USERS_KEY, JSON.stringify(REMOTE_USERS));
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(REMOTE_LOCATIONS));
    if (!Array.isArray(data?.users) || !data.users.length) await apiPost("saveUsers", { users: REMOTE_USERS });
    if (!Array.isArray(data?.locations) || !data.locations.length) await apiPost("saveLocations", { locations: REMOTE_LOCATIONS });
  } catch (err) {
    console.error("Google Sheets connection failed:", err);
    REMOTE_READY = false;
    const banner = document.getElementById("loginError");
    if (banner) { banner.textContent = "Online database unavailable. Using local data until the connection is restored."; banner.style.display = "block"; }
  }
}

async function syncRemoteData() {
  if (!API_URL) return;
  try {
    const data = await apiGet("bootstrap");
    if (Array.isArray(data?.users)) { REMOTE_USERS = data.users; localStorage.setItem(USERS_KEY, JSON.stringify(REMOTE_USERS)); }
    if (Array.isArray(data?.locations)) { REMOTE_LOCATIONS = data.locations; localStorage.setItem(LOCATIONS_KEY, JSON.stringify(REMOTE_LOCATIONS)); }
    REMOTE_READY = true;
    if (me() && loc()) {
      // Keep the selected accommodation if it still exists.
      const activeId = localStorage.getItem(ACTIVE_LOCATION_KEY);
      if (activeId && REMOTE_LOCATIONS.some(x => x.id === activeId)) {
        refresh();
      }
    }
  } catch (err) { console.warn("Background Google Sheets sync failed:", err); }
}

const defaultUsers = [
  { username: "admin", displayName: "System Administrator", password: "admin123", role: "admin" },
  { username: "editor", displayName: "Demo Editor", password: "editor123", role: "editor" },
  { username: "viewer", displayName: "Demo Viewer", password: "viewer123", role: "viewer" }
];

function users() {
  if (Array.isArray(REMOTE_USERS) && REMOTE_USERS.length) return REMOTE_USERS;
  let u = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
  if (!u) { u = defaultUsers; localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  return u;
}
function me() { return users().find(u => u.username === localStorage.getItem(SESSION_KEY)); }
function roleText(r) { return r === "admin" ? "Administrator" : r === "editor" ? "Editor" : "Viewer"; }
function editable() { return me()?.role !== "viewer"; }
function admin() { return me()?.role === "admin"; }

function defaultLocation() {
  return {
    id: "zilweg-245-haarlem",
    name: "Zilweg 245",
    city: "Haarlem",
    address: "Zilweg 245",
    country: "Netherlands",
    rooms: ROOM_NUMBERS.map(n => ({ number: n, capacity: Number(ROOM_META[String(n)]?.capacity || 2) })),
    residents: INITIAL_RESIDENTS.map(x => ({ ...x })),
    arrivals: []
  };
}

function locations() {
  if (Array.isArray(REMOTE_LOCATIONS)) return REMOTE_LOCATIONS;
  let l = JSON.parse(localStorage.getItem(LOCATIONS_KEY) || "null");
  if (!l) {
    l = [defaultLocation()];
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(l));
  }
  return l;
}

function setLocations(l) {
  REMOTE_LOCATIONS = l;
  localStorage.setItem(LOCATIONS_KEY, JSON.stringify(l));
}

async function persistLocations() {
  if (!API_URL) return;
  try { await apiPost("saveLocations", { locations: REMOTE_LOCATIONS || locations() }); REMOTE_READY = true; }
  catch (err) { console.error("Could not save locations to Google Sheets:", err); alert("The online database could not be updated. Please check your connection and try again."); }
}

async function persistUsers() {
  if (!API_URL) return;
  try { await apiPost("saveUsers", { users: REMOTE_USERS || users() }); REMOTE_READY = true; }
  catch (err) { console.error("Could not save users to Google Sheets:", err); alert("The online user database could not be updated."); }
}
function activeLocation() { return locations().find(x => x.id === localStorage.getItem(ACTIVE_LOCATION_KEY)); }
function loc() { return activeLocation(); }
function setActiveLocation(id) { localStorage.setItem(ACTIVE_LOCATION_KEY, id); }
function clearActiveLocation() { localStorage.removeItem(ACTIVE_LOCATION_KEY); }

function saveLocation() {
  let all = locations(), idx = all.findIndex(x => x.id === loc().id);
  if (idx >= 0) { all[idx] = loc(); setLocations(all); persistLocations(); }
}

function room(n) {
  let l = loc();
  let rs = l.residents.filter(r => Number(r.room) === Number(n));
  let m = l.rooms.find(x => Number(x.number) === Number(n));
  let cap = m?.capacity || 2;
  let type = rs.length >= cap ? "full" : rs.length ? "partial" : "available";
  return { n: Number(n), rs, cap, type, label: type === "full" ? "Full" : type === "partial" ? "Partially Occupied" : "Available" };
}

function go(page) {
  if (page === "users" && !admin()) return alert("Administrator permission required.");
  if (page === "accommodations" && !admin()) return alert("Administrator permission required.");
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById(page)?.classList.add('active');
  document.querySelectorAll('.nav').forEach(x => x.classList.toggle('active', x.dataset.page === page));
  if (page === 'rooms') renderRooms();
  if (page === 'residents') renderResidents();
  if (page === 'arrivals') renderArrivals();
  if (page === 'users') renderUsers();
  if (page === 'accommodations') renderAccommodations();
}

async function init() {
  await loadRemoteData();
  document.getElementById('date').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  document.querySelectorAll('.nav').forEach(b => b.onclick = () => go(b.dataset.page));
  document.querySelectorAll('[data-page-jump]').forEach(b => b.onclick = () => go(b.dataset.pageJump));
  document.querySelectorAll('[data-op]').forEach(b => b.onclick = () => operation(b.dataset.op));
  document.getElementById('roomSearch').oninput = renderRooms;
  document.getElementById('roomFilter').onchange = renderRooms;
  document.getElementById('residentSearch').oninput = renderResidents;
  document.getElementById('accommodationSearch').oninput = renderAccommodations;
  document.getElementById('logout').onclick = logout;
  document.getElementById('locationLogout').onclick = logout;
  document.getElementById('changeAccommodation').onclick = showLocationSelector;
  document.getElementById('saveArrival').onclick = saveArrival;
  document.getElementById('addUser').onclick = addUser;
  document.getElementById('addRoom').onclick = addRoom;
  document.getElementById('addAccommodation').onclick = addAccommodation;
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modalCancel').onclick = closeModal;
  if (me()) {
    if (loc()) start();
    else showLocationSelector();
  } else {
    document.getElementById('loginBtn').onclick = login;
  }
}

function login() {
  let u = document.getElementById('username').value.trim(), p = document.getElementById('password').value;
  let x = users().find(a => a.username === u && a.password === p);
  if (!x) {
    let e = document.getElementById('loginError');
    e.textContent = 'Invalid username or password.';
    e.style.display = 'block';
    return;
  }
  localStorage.setItem(SESSION_KEY, u);
  clearActiveLocation();
  showLocationSelector();
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  clearActiveLocation();
  location.reload();
}

function showLocationSelector() {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('locationSelect').classList.remove('hidden');
  renderLocationSelector();
}

function renderLocationSelector() {
  let grid = document.getElementById('locationGrid');
  let l = locations();
  grid.innerHTML = l.map(x => {
    let r = x.residents.length;
    let beds = x.rooms.reduce((a, rm) => a + (rm.capacity || 2), 0) - r;
    return `<button class="location-card" onclick="chooseLocation('${x.id}')">
      <div class="location-icon">⌂</div>
      <div class="location-main"><h2>${escapeHtml(x.name)}</h2><p>${escapeHtml(x.address)}, ${escapeHtml(x.city)}</p><span>${r} residents · ${beds} free beds · ${x.rooms.length} rooms</span></div>
      <div class="location-arrow">→</div>
    </button>`;
  }).join('');
  let area = document.getElementById('adminAccommodationArea');
  area.classList.toggle('hidden', !admin());
  area.innerHTML = admin() ? `<div class="admin-location-banner"><div><b>Administrator</b><span>You can manage all accommodation locations from here.</span></div><button class="btn primary" onclick="addAccommodation()">＋ Add Accommodation</button></div>` : '';
}

function chooseLocation(id) {
  if (!locations().some(x => x.id === id)) return;
  setActiveLocation(id);
  start();
}

function start() {
  if (!loc()) { showLocationSelector(); return; }
  document.getElementById('locationSelect').classList.add('hidden');
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  let u = me(), l = loc();
  document.getElementById('displayName').textContent = u.displayName;
  document.getElementById('role').textContent = roleText(u.role);
  document.getElementById('currentAccommodation').innerHTML = `<small>Current accommodation</small><b>${escapeHtml(l.name)}</b><span>${escapeHtml(l.city)}</span>`;
  document.getElementById('dashboardAccommodation').textContent = l.name;
  document.getElementById('roomsAccommodation').textContent = l.name;
  document.getElementById('residentsAccommodation').textContent = l.name;
  document.getElementById('arrivalsAccommodation').textContent = l.name;
  document.getElementById('coordAccommodation').textContent = l.name;
  document.querySelectorAll('.admin-only').forEach(x => x.style.display = admin() ? '' : 'none');
  document.querySelectorAll('.edit-only').forEach(x => x.classList.toggle('disabled', !editable()));
  refresh();
}

function refresh() {
  renderMetrics(); renderDashboardRooms(); renderResidents(); renderRooms(); renderArrivals(); renderUsers(); renderAccommodations();
  let l = loc();
  document.getElementById('availableForCoord').textContent = l.rooms.filter(n => room(n.number).rs.length < room(n.number).cap).length;
  document.getElementById('arrivalBadge').textContent = l.arrivals.length;
}

function renderMetrics() {
  let l = loc(), d = l.rooms.map(x => room(x.number)), beds = d.reduce((a, x) => a + x.cap - x.rs.length, 0);
  document.getElementById('metrics').innerHTML = [
    ['Total Rooms', d.length], ['Available Rooms', d.filter(x => x.type === 'available').length],
    ['Partially Occupied', d.filter(x => x.type === 'partial').length], ['Full Rooms', d.filter(x => x.type === 'full').length],
    ['Total Residents', l.residents.length], ['Free Beds', beds], ['Upcoming Arrivals', l.arrivals.length]
  ].map(x => `<div class="metric"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('');
}

function card(x) {
  return `<div class="room ${x.type}" onclick="roomDetail(${x.n})"><div class="room-top"><span class="room-no">${x.n}</span><span class="status">${x.label}</span></div><div class="bar"><div class="fill"></div></div><div class="room-meta">${x.rs.length}/${x.cap} beds · ${x.rs.map(r => escapeHtml(r.name)).join(', ') || 'No residents'}</div></div>`;
}
function renderDashboardRooms() { document.getElementById('dashboardRooms').innerHTML = loc().rooms.map(x => room(x.number)).map(card).join(''); }
function renderRooms() {
  let q = (document.getElementById('roomSearch').value || '').toLowerCase(), f = document.getElementById('roomFilter').value;
  document.getElementById('roomsGrid').innerHTML = loc().rooms.map(x => room(x.number)).filter(x => (!q || String(x.n).includes(q)) && (f === 'all' || x.type === f)).map(card).join('');
  document.getElementById('roomAdmin').innerHTML = admin() ? loc().rooms.map(x => `<div class="admin-row"><b>Room ${x.number}</b><span>Capacity ${x.capacity}</span><button class="btn" onclick="editRoom(${x.number})">Edit</button><button class="btn danger" onclick="removeRoom(${x.number})">Delete</button></div>`).join('') : '';
}
function renderResidents() {
  let q = (document.getElementById('residentSearch').value || '').toLowerCase();
  let r = loc().residents.filter(x => [x.name, x.room, x.country, x.company, x.contact, x.phone, x.coordinator].join(' ').toLowerCase().includes(q));
  document.getElementById('residentRows').innerHTML = r.map(x => `<tr><td>${escapeHtml(x.name)}</td><td>${x.room}</td><td>${escapeHtml(x.country || '')}</td><td>${escapeHtml(x.company || '')}</td><td>${escapeHtml(x.phone || x.contact || '')}</td><td>${escapeHtml(x.coordinator || '')}</td><td>${escapeHtml(x.arrival || '')}</td><td><button class="btn" onclick="editResident(${loc().residents.indexOf(x)})">Edit</button></td></tr>`).join('');
}
function renderArrivals() {
  let el = document.getElementById('arrivalsList'), a = loc().arrivals;
  if (!a.length) { el.innerHTML = '<div class="note">No pending arrivals.</div>'; return; }
  el.innerHTML = a.map((x, i) => `<div class="arrival-card"><div><span class="arrival-dot"></span><b>${escapeHtml(x.name)}</b><div class="muted">${escapeHtml(x.date || 'Date not set')} · ${escapeHtml(x.country || 'Country not set')} · ${escapeHtml(x.phone || 'No phone')}</div><div class="muted">Coordinator: ${escapeHtml(x.coordinator || '—')} · Driver: ${escapeHtml(x.driver || '—')} · ${x.people || 1} person(s)</div></div><div><button class="btn" onclick="completeArrival(${i})">Check In</button><button class="btn danger" onclick="deleteArrival(${i})">Remove</button></div></div>`).join('');
}
function saveArrival() {
  if (!editable()) return alert('This account is read-only.');
  let a = { name: document.getElementById('arrName').value.trim(), phone: document.getElementById('arrPhone').value.trim(), coordinator: document.getElementById('arrCoordinator').value.trim(), country: document.getElementById('arrCountry').value.trim(), date: document.getElementById('arrDate').value, people: Number(document.getElementById('arrPeople').value || 1), driver: document.getElementById('driverName').value.trim(), vehicle: document.getElementById('vehicle').value.trim(), notes: document.getElementById('arrNotes').value.trim() };
  if (!a.name) return alert('Enter the arrival name.');
  loc().arrivals.push(a); saveLocation();
  document.getElementById('arrivalSaved').innerHTML = '<div class="note" style="margin-top:12px">Arrival added. A notification is now visible in Arrivals.</div>';
  ['arrName', 'arrPhone', 'arrCoordinator', 'arrCountry', 'arrDate', 'driverName', 'vehicle', 'arrNotes'].forEach(id => document.getElementById(id).value = '');
  refresh();
}
function completeArrival(i) { if (!editable()) return; let a = loc().arrivals[i]; operation('checkin', a); }
function deleteArrival(i) { if (!editable()) return; if (confirm('Remove this arrival?')) { loc().arrivals.splice(i, 1); saveLocation(); refresh(); } }

function operation(type, preset = null) {
  if (!editable()) return alert('This account is read-only.');
  let title = type === 'checkin' ? 'Check In' : type === 'move' ? 'Move Room' : 'Check Out', body = '';
  if (type === 'checkin') {
    body = `<div class="form two"><label>Full Name<input id="opName" value="${escapeAttr(preset?.name || '')}"></label><label>Phone<input id="opPhone" value="${escapeAttr(preset?.phone || '')}"></label><label>Country<input id="opCountry" value="${escapeAttr(preset?.country || '')}"></label><label>Coordinator Name<input id="opCoordinator" value="${escapeAttr(preset?.coordinator || '')}"></label><label>Company<input id="opCompany"></label><label>Arrival Date<input id="opArrival" type="date" value="${preset?.date || new Date().toISOString().slice(0, 10)}"></label><label>Room<select id="opRoom">${loc().rooms.map(x => room(x.number)).map(x => `<option value="${x.n}" ${x.rs.length >= x.cap ? 'disabled' : ''}>${x.n} — ${x.label}</option>`).join('')}</select></label></div>`;
  } else {
    body = `<label>Resident<select id="opResident">${loc().residents.map(r => `<option value="${escapeAttr(r.name)}">${escapeHtml(r.name)} — Room ${r.room}</option>`).join('')}</select></label>${type === 'move' ? `<label>New Room<select id="opRoom">${loc().rooms.map(x => room(x.number)).map(x => `<option value="${x.n}" ${x.rs.length >= x.cap ? 'disabled' : ''}>${x.n} — ${x.label}</option>`).join('')}</select></label>` : ''}`;
  }
  openModal(title, body, () => saveOperation(type, preset));
}

function saveOperation(type, preset) {
  let l = loc();
  if (type === 'checkin') {
    let name = document.getElementById('opName').value.trim(), roomNo = Number(document.getElementById('opRoom').value);
    if (!name) return alert('Enter a name.');
    if (room(roomNo).rs.length >= room(roomNo).cap) return alert('Room is full.');
    l.residents.push({ name, room: roomNo, country: document.getElementById('opCountry').value.trim(), company: document.getElementById('opCompany').value.trim(), phone: document.getElementById('opPhone').value.trim(), contact: document.getElementById('opPhone').value.trim(), coordinator: document.getElementById('opCoordinator').value.trim(), arrival: document.getElementById('opArrival').value });
    if (preset) l.arrivals = l.arrivals.filter(a => a !== preset);
  } else {
    let name = document.getElementById('opResident').value, r = l.residents.find(x => x.name === name);
    if (type === 'move') {
      let n = Number(document.getElementById('opRoom').value);
      if (room(n).rs.length >= room(n).cap) return alert('Room is full.');
      if (r) r.room = n;
    } else l.residents = l.residents.filter(x => x.name !== name);
  }
  saveLocation(); closeModal(); refresh();
}

function roomDetail(n) {
  let x = room(n), buttons = admin() ? `<button class="btn" onclick="editRoom(${n});closeModal()">Edit Room</button>` : '';
  openModal('Room ' + n, `<p><b>Status:</b> ${x.label}</p><p><b>Occupancy:</b> ${x.rs.length}/${x.cap}</p><p><b>Residents:</b><br>${x.rs.map(r => escapeHtml(r.name)).join('<br>') || 'None'}</p>${buttons}`, null);
}
function addRoom() {
  if (!admin()) return;
  openModal('Add Room', '<div class="form two"><label>Room Number<input id="rn" type="number"></label><label>Capacity<input id="rc" type="number" min="1" value="2"></label></div>', () => {
    let n = Number(document.getElementById('rn').value), c = Number(document.getElementById('rc').value || 2);
    if (!n) return alert('Enter a room number.');
    if (loc().rooms.some(x => Number(x.number) === n)) return alert('Room already exists.');
    loc().rooms.push({ number: n, capacity: c }); loc().rooms.sort((a, b) => a.number - b.number); saveLocation(); closeModal(); refresh();
  });
}
function editRoom(n) {
  if (!admin()) return;
  let x = loc().rooms.find(r => Number(r.number) === Number(n));
  openModal('Edit Room', '<div class="form two"><label>Room Number<input id="rn" type="number" value="' + x.number + '"></label><label>Capacity<input id="rc" type="number" min="1" value="' + x.capacity + '"></label></div>', () => {
    let nn = Number(document.getElementById('rn').value), cc = Number(document.getElementById('rc').value || 2);
    if (loc().rooms.some(r => r !== x && Number(r.number) === nn)) return alert('Room already exists.');
    if (loc().residents.some(r => Number(r.room) === Number(x.number)) && nn !== Number(x.number)) return alert('Move residents before changing this room number.');
    x.number = nn; x.capacity = cc; loc().rooms.sort((a, b) => a.number - b.number); saveLocation(); closeModal(); refresh();
  });
}
function removeRoom(n) {
  if (!admin()) return;
  if (room(n).rs.length) return alert('This room has residents. Move them first.');
  if (confirm('Delete room ' + n + '?')) { loc().rooms = loc().rooms.filter(x => Number(x.number) !== Number(n)); saveLocation(); refresh(); }
}
function editResident(i) {
  if (!editable()) return;
  let r = loc().residents[i];
  openModal('Edit Resident', `<div class="form two"><label>Full Name<input id="en" value="${r.name}"></label><label>Phone<input id="ep" value="${r.phone || r.contact || ''}"></label><label>Coordinator Name<input id="ec" value="${r.coordinator || ''}"></label><label>Company<input id="eco" value="${r.company || ''}"></label><label>Country<input id="ect" value="${r.country || ''}"></label></div>`, () => {
    r.name = document.getElementById('en').value.trim();
    r.phone = document.getElementById('ep').value.trim();
    r.contact = r.phone;
    r.coordinator = document.getElementById('ec').value.trim();
    r.company = document.getElementById('eco').value.trim();
    r.country = document.getElementById('ect').value.trim();
    saveLocation(); closeModal(); refresh();
  });
}

function renderAccommodations() {
  if (!admin()) return;
  let q = (document.getElementById('accommodationSearch').value || '').toLowerCase();
  let l = locations().filter(x => [x.name, x.address, x.city, x.country].join(' ').toLowerCase().includes(q));
  document.getElementById('accommodationRows').innerHTML = l.map(x => {
    let beds = x.rooms.reduce((a, r) => a + (r.capacity || 2), 0) - x.residents.length;
    return `<div class="accommodation-row"><div class="accommodation-info"><div class="location-icon small">⌂</div><div><b>${escapeHtml(x.name)}</b><span>${escapeHtml(x.address)}, ${escapeHtml(x.city)}, ${escapeHtml(x.country)}</span><small>${x.rooms.length} rooms · ${x.residents.length} residents · ${beds} free beds</small></div></div><div class="row-actions"><button class="btn" onclick="editAccommodation('${x.id}')">Edit</button><button class="btn danger" onclick="removeAccommodation('${x.id}')">Remove</button></div></div>`;
  }).join('');
}

function addAccommodation() {
  if (!admin()) return;
  openModal('Add Accommodation', `<div class="form two"><label>Accommodation Name<input id="an"></label><label>City<input id="acity"></label><label>Address<input id="aad"></label><label>Country<input id="acountry" value="Netherlands"></label></div>`, () => {
    let name = document.getElementById('an').value.trim(), city = document.getElementById('acity').value.trim(), address = document.getElementById('aad').value.trim(), country = document.getElementById('acountry').value.trim();
    if (!name || !city || !address) return alert('Fill in the accommodation name, city and address.');
    let id = (name + '-' + city + '-' + address).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
    let all = locations(); all.push({ id, name, city, address, country, rooms: [], residents: [], arrivals: [] }); setLocations(all); persistLocations(); closeModal(); renderLocationSelector(); renderAccommodations();
  });
}

function editAccommodation(id) {
  if (!admin()) return;
  let x = locations().find(a => a.id === id); if (!x) return;
  openModal('Edit Accommodation', `<div class="form two"><label>Accommodation Name<input id="an" value="${escapeAttr(x.name)}"></label><label>City<input id="acity" value="${escapeAttr(x.city)}"></label><label>Address<input id="aad" value="${escapeAttr(x.address)}"></label><label>Country<input id="acountry" value="${escapeAttr(x.country || 'Netherlands')}"></label></div>`, () => {
    x.name = document.getElementById('an').value.trim(); x.city = document.getElementById('acity').value.trim(); x.address = document.getElementById('aad').value.trim(); x.country = document.getElementById('acountry').value.trim();
    if (!x.name || !x.city || !x.address) return alert('Fill in the accommodation name, city and address.');
    setLocations(locations()); persistLocations(); closeModal(); renderLocationSelector(); renderAccommodations();
    if (loc() && loc().id === id) start();
  });
}

function removeAccommodation(id) {
  if (!admin()) return;
  let all = locations(); if (all.length <= 1) return alert('At least one accommodation must remain.');
  let x = all.find(a => a.id === id); if (!x) return;
  if (!confirm('Remove ' + x.name + '? This removes its local rooms, residents and arrivals from this browser.')) return;
  setLocations(all.filter(a => a.id !== id));
  persistLocations();
  if (localStorage.getItem(ACTIVE_LOCATION_KEY) === id) clearActiveLocation();
  renderLocationSelector(); renderAccommodations();
}

function renderUsers() {
  if (!admin()) return;
  document.getElementById('userRows').innerHTML = users().map((u, i) => `<tr><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.displayName)}</td><td>${roleText(u.role)}</td><td>${u.username === 'admin' ? 'Protected' : `<button class="btn" onclick="changeRole(${i})">Change Role</button> <button class="btn danger" onclick="removeUser(${i})">Delete</button>`}</td></tr>`).join('');
}
function addUser() {
  if (!admin()) return;
  openModal('Add User', '<div class="form two"><label>Username<input id="nu"></label><label>Display Name<input id="nd"></label><label>Password<input id="np" type="password"></label><label>Role<select id="nr"><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="admin">Administrator</option></select></label></div>', () => {
    let u = users(), username = document.getElementById('nu').value.trim(), displayName = document.getElementById('nd').value.trim(), password = document.getElementById('np').value, role = document.getElementById('nr').value;
    if (!username || !displayName || !password) return alert('Fill all fields.');
    if (u.some(x => x.username === username)) return alert('Username already exists.');
    u.push({ username, displayName, password, role }); REMOTE_USERS = u; localStorage.setItem(USERS_KEY, JSON.stringify(u)); persistUsers(); closeModal(); renderUsers();
  });
}
function changeRole(i) {
  let u = users(); if (!admin() || u[i].username === 'admin') return;
  let r = prompt('Role: admin, editor or viewer', u[i].role); if (!['admin', 'editor', 'viewer'].includes(r)) return;
  u[i].role = r; REMOTE_USERS = u; localStorage.setItem(USERS_KEY, JSON.stringify(u)); persistUsers(); renderUsers();
}
function removeUser(i) {
  let u = users(); if (!admin() || u[i].username === 'admin') return;
  if (confirm('Delete ' + u[i].username + '?')) { u.splice(i, 1); REMOTE_USERS = u; localStorage.setItem(USERS_KEY, JSON.stringify(u)); persistUsers(); renderUsers(); }
}

function openModal(title, body, save) {
  document.getElementById('modalTitle').textContent = title; document.getElementById('modalBody').innerHTML = body; document.getElementById('modal').classList.remove('hidden'); document.getElementById('modalSave').style.display = save ? 'inline-block' : 'none'; document.getElementById('modalSave').onclick = save || null;
}
function closeModal() { document.getElementById('modal').classList.add('hidden'); }
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(v) { return escapeHtml(v); }

init();
setInterval(() => {
  if (API_URL && !document.getElementById('modal')?.classList.contains('hidden')) return;
  if (API_URL && me() && loc()) syncRemoteData();
}, 10000);