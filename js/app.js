let crmState = {};
let activeSector = "Todos";
let viewMode = "cards";
const STORAGE_PREFIX = "crm_calibracion:";

function slug(s){ return s.replace(/\s+/g,'-'); }

/*
 * ===========================================================
 * PERSISTENCIA DE DATOS: Firebase (compartido) con respaldo local
 * ===========================================================
 * Si js/firebase-config.js está correctamente configurado, todos los
 * cambios se guardan en Firestore (la nube) y se sincronizan EN VIVO
 * entre cualquier persona que abra esta misma página (varios
 * compañeros del laboratorio pueden trabajar a la vez).
 *
 * Si Firebase no está configurado todavía, la app sigue funcionando
 * normalmente guardando los datos en este navegador (localStorage),
 * exactamente como antes.
 * ===========================================================
 */
const COLLECTION_NAME = "crm_calibracion";

function defaultCompanyState(){
  return {status:"Por contactar", nextAction:"", notes:"", contactDate:"", medium:""};
}

function updateDbModeBadge(){
  const badge = document.getElementById("dbModeBadge");
  if(!badge) return;
  if(firebaseEnabled){
    badge.className = "mode-firebase";
    badge.innerHTML = '<span class="dot"></span>Conectado a Firebase (compartido)';
  } else {
    badge.className = "mode-local";
    badge.innerHTML = '<span class="dot"></span>Modo local (solo este navegador)';
  }
}

/* Carga inicial + suscripción en tiempo real (si hay Firebase) */
function loadState(){
  COMPANIES.forEach(c=>{ crmState[c.id] = defaultCompanyState(); });
  updateDbModeBadge();

  if(firebaseEnabled && firebaseDB){
    firebaseDB.collection(COLLECTION_NAME).onSnapshot((snapshot)=>{
      snapshot.forEach(doc=>{
        crmState[doc.id] = { ...defaultCompanyState(), ...doc.data() };
      });
      renderDashboard();
      renderEmpresas();
    }, (err)=>{
      console.error("Error de Firestore:", err);
      showToast("No se pudo conectar a la base de datos en la nube, se usará guardado local");
      loadStateLocalFallback();
    });
  } else {
    loadStateLocalFallback();
  }
}

function loadStateLocalFallback(){
  COMPANIES.forEach(c=>{
    try{
      const raw = localStorage.getItem(STORAGE_PREFIX + c.id);
      if(raw) crmState[c.id] = { ...defaultCompanyState(), ...JSON.parse(raw) };
    }catch(e){ /* keep default */ }
  });
}

/* Guarda un registro: en Firestore si está disponible, si no en localStorage */
async function saveState(id){
  const pill = document.getElementById("syncPill");
  pill.classList.add("saving");
  pill.innerHTML = '<span class="dot"></span>Guardando...';

  if(firebaseEnabled && firebaseDB){
    try{
      await firebaseDB.collection(COLLECTION_NAME).doc(id).set({
        ...crmState[id],
        updatedAt: new Date().toISOString()
      });
      pill.classList.remove("saving");
      pill.innerHTML = '<span class="dot"></span>Guardado en Firebase (compartido)';
      return true;
    }catch(e){
      console.error(e);
      pill.innerHTML = '<span class="dot"></span>Error al guardar en Firebase — reintenta';
      return false;
    }
  }

  try{
    localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(crmState[id]));
    pill.classList.remove("saving");
    pill.innerHTML = '<span class="dot"></span>Datos guardados en este navegador';
    return true;
  }catch(e){
    pill.innerHTML = '<span class="dot"></span>Error al guardar — reintenta';
    return false;
  }
}

function showToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1800);
}

/* ---------- NAVIGATION ---------- */
document.getElementById("navList").addEventListener("click", (e)=>{
  const btn = e.target.closest("button[data-view]");
  if(!btn) return;
  document.querySelectorAll(".nav-list button").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById("view-"+btn.dataset.view).classList.add("active");
  if(btn.dataset.view==="dashboard") renderDashboard();
  if(btn.dataset.view==="eventos") renderEventos();
  if(btn.dataset.view==="registro") renderActivities();
});

/* ---------- DASHBOARD ---------- */
function drawDonut(statusCounts, statusColors){
  const svg = document.getElementById("statusDonut");
  const legend = document.getElementById("statusLegend");
  const total = Object.values(statusCounts).reduce((a,b)=>a+b,0) || 1;
  const r = 50, cx = 60, cy = 60, circumference = 2*Math.PI*r;
  let offset = 0;
  const segments = STATUSES.map(s=>{
    const v = statusCounts[s]||0;
    const frac = v/total;
    const len = frac*circumference;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${statusColors[s]}" stroke-width="16"
      stroke-dasharray="${len} ${circumference-len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
    return seg;
  }).join("");
  svg.innerHTML = segments + `<circle cx="${cx}" cy="${cy}" r="32" fill="#fff"/>
    <text x="${cx}" y="${cy-2}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="20" font-weight="600" fill="#1B2430">${total}</text>
    <text x="${cx}" y="${cy+14}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8" fill="#8B93A1">EMPRESAS</text>`;

  legend.innerHTML = STATUSES.map(s=>{
    const v = statusCounts[s]||0;
    const pct = total ? Math.round((v/total)*100) : 0;
    return `<li><span class="sw" style="background:${statusColors[s]}"></span>${s}<span class="n">${v} · ${pct}%</span></li>`;
  }).join("");
}

function renderExecSummary(counts, statusCounts){
  const total = COMPANIES.length;
  const contactados = total - (statusCounts["Por contactar"]||0);
  const pctContactados = Math.round((contactados/total)*100);
  const pctClientes = Math.round(((statusCounts["Cliente"]||0)/total)*100);
  const municipiosCubiertos = new Set(COMPANIES.map(c=>c.municipio)).size;
  const el = document.getElementById("execSummaryText");
  el.innerHTML = `De <b>${total} empresas</b> identificadas en <b>${municipiosCubiertos} municipios de Caldas</b>,
    se ha contactado al <b>${pctContactados}%</b> (${contactados} empresas). De ellas,
    <b>${statusCounts["Cliente"]||0}</b> ya son clientes (${pctClientes}% del total identificado) y
    <b>${statusCounts["Cotización enviada"]||0}</b> tienen una cotización enviada en curso.
    Faltan <b>${statusCounts["Por contactar"]||0}</b> empresas por contactar por primera vez.`;
}

function renderDashboard(){
  const statuses = Object.values(crmState).map(s=>s.status);
  const counts = {
    prospectos: statuses.length,
    cotizaciones: statuses.filter(s=>s==="Cotización enviada"||s==="Cliente").length,
    clientes: statuses.filter(s=>s==="Cliente").length,
    seguimiento: statuses.filter(s=>s!=="Por contactar").length,
  };
  document.getElementById("kpiStrip").innerHTML = GOALS.map(g=>{
    const val = counts[g.key];
    const pct = Math.min(100, Math.round((val/g.target)*100));
    return `<div class="kpi-card">
      <div class="num">${val}<span> / ${g.target}</span></div>
      <div class="lbl">${g.label}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>`;
  }).join("");

  const statusCounts = {};
  STATUSES.forEach(s=>statusCounts[s]=0);
  COMPANIES.forEach(c=>{ const s=(crmState[c.id]||{}).status||"Por contactar"; statusCounts[s]++; });
  const statusColors = {
    "Por contactar":"#C08A2E","Contactado":"#2A5C8A","Cotización enviada":"#3E6FA6",
    "Cliente":"#2A6B45","No interesado":"#8C3327","Sin respuesta":"#8B93A1"
  };
  drawDonut(statusCounts, statusColors);

  const sectors = [...new Set(COMPANIES.map(c=>c.sector))];
  const sectorCounts = {};
  sectors.forEach(s=>sectorCounts[s]=0);
  COMPANIES.forEach(c=>sectorCounts[c.sector]++);
  const maxSec = Math.max(...Object.values(sectorCounts),1);
  document.getElementById("sectorChart").innerHTML = sectors.map(s=>{
    const v = sectorCounts[s];
    return `<div class="chart-row"><div class="clabel">${s}</div><div class="chart-track"><i style="width:${(v/maxSec)*100}%"></i></div><div class="chart-val">${v}</div></div>`;
  }).join("");

  renderExecSummary(counts, statusCounts);

  const pending = COMPANIES.filter(c=>(crmState[c.id]||{}).nextAction).slice(0,8);
  const list = document.getElementById("pendingList");
  if(pending.length===0){
    list.innerHTML = `<li style="color:var(--ink-soft)">Aún no hay próximas acciones registradas. Ve a "Empresas" y programa el seguimiento de un prospecto.</li>`;
  } else {
    list.innerHTML = pending.map(c=>{
      const st = crmState[c.id];
      return `<li><span>${c.name} — ${st.nextAction}</span><span class="stamp st-${slug(st.status)}">${st.status}</span></li>`;
    }).join("");
  }
}

/* ---------- EVENTOS ---------- */
let customEvents = [];
const EVENTS_COLLECTION = "eventos_calibracion";
const EVENTS_LOCAL_KEY = "eventos_calibracion_custom";

function loadCustomEvents(){
  if(firebaseEnabled && firebaseDB){
    firebaseDB.collection(EVENTS_COLLECTION).onSnapshot((snapshot)=>{
      customEvents = [];
      snapshot.forEach(doc=> customEvents.push({...doc.data(), id:doc.id}));
      renderEventos();
    }, (err)=>{
      console.error(err);
      loadCustomEventsLocalFallback();
      renderEventos();
    });
  } else {
    loadCustomEventsLocalFallback();
  }
}

function loadCustomEventsLocalFallback(){
  try{
    const raw = localStorage.getItem(EVENTS_LOCAL_KEY);
    customEvents = raw ? JSON.parse(raw) : [];
  }catch(e){ customEvents = []; }
}

async function saveCustomEvent(ev){
  if(firebaseEnabled && firebaseDB){
    try{
      const docRef = await firebaseDB.collection(EVENTS_COLLECTION).add(ev);
      return docRef.id;
    }catch(e){
      console.error(e);
      showToast("No se pudo guardar en la nube, se guardó localmente");
    }
  }
  customEvents.push({...ev, id:"local_"+Date.now()});
  localStorage.setItem(EVENTS_LOCAL_KEY, JSON.stringify(customEvents));
  return null;
}

async function deleteCustomEvent(id){
  if(firebaseEnabled && firebaseDB && !id.startsWith("local_")){
    try{ await firebaseDB.collection(EVENTS_COLLECTION).doc(id).delete(); }catch(e){ console.error(e); }
  } else {
    customEvents = customEvents.filter(e=>e.id!==id);
    localStorage.setItem(EVENTS_LOCAL_KEY, JSON.stringify(customEvents));
  }
  renderEventos();
}

function renderEventos(){
  const grid = document.getElementById("eventsGrid");
  const today = new Date().toISOString().slice(0,10);
  const allEvents = [...EVENTS, ...customEvents];
  const sorted = allEvents.sort((a,b)=>{
    if(!a.date) return 1;
    if(!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
  grid.innerHTML = sorted.map(ev=>{
    const isPast = ev.date && ev.date < today;
    const isSoon = ev.date && !isPast && ev.date <= new Date(Date.now()+1000*60*60*24*21).toISOString().slice(0,10);
    let badge = "";
    if(ev.date && isSoon) badge = `<span class="stamp st-Cliente">Próximo</span>`;
    else if(ev.date && isPast) badge = `<span class="stamp st-Sin-respuesta">Ya realizado</span>`;
    else badge = `<span class="stamp st-Por-contactar">Recurrente</span>`;
    const isCustom = !!ev.custom;
    return `
    <div class="card" data-evid="${ev.id}">
      <div class="card-body">
        <div class="card-top">
          <span class="sector-tag">${ev.tag||"Evento"}</span>
          ${badge}
        </div>
        <div class="company-name">${ev.title}</div>
        <div class="need" style="margin-bottom:12px;">${ev.desc||""}</div>
        <div class="contact-lines">
          <div><span class="k">Fecha</span>${ev.dateLabel||"Por confirmar"}</div>
          <div><span class="k">Lugar</span>${ev.place||"—"}</div>
          <div><span class="k">Organiza</span>${ev.organizer||"—"}</div>
        </div>
        <div class="card-actions">
          ${ev.link ? `<a class="btn" href="${ev.link}" target="_blank" rel="noopener" style="text-decoration:none;">Ver enlace</a>` : `<span class="btn ghost" style="cursor:default;">Sin enlace</span>`}
          ${isCustom ? `<button class="btn ghost del-event">Eliminar</button>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  grid.querySelectorAll(".del-event").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      const id = e.target.closest(".card").dataset.evid;
      deleteCustomEvent(id);
    });
  });
}

function openEventModal(){ document.getElementById("eventModalOverlay").classList.add("open"); }
function closeEventModal(){
  document.getElementById("eventModalOverlay").classList.remove("open");
  ["ev-title","ev-tag","ev-date","ev-place","ev-organizer","ev-desc","ev-link"].forEach(id=>{
    document.getElementById(id).value = "";
  });
}

document.getElementById("addEventBtn").addEventListener("click", openEventModal);
document.getElementById("cancelEventBtn").addEventListener("click", closeEventModal);
document.getElementById("eventModalOverlay").addEventListener("click", (e)=>{
  if(e.target.id === "eventModalOverlay") closeEventModal();
});

document.getElementById("saveEventBtn").addEventListener("click", async ()=>{
  const title = document.getElementById("ev-title").value.trim();
  if(!title){ showToast("Escribe al menos el nombre del evento"); return; }
  const date = document.getElementById("ev-date").value;
  const dateLabel = date ? new Date(date+"T00:00:00").toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'}) : "Fecha por confirmar";
  const ev = {
    title,
    tag: document.getElementById("ev-tag").value.trim() || "Evento",
    date,
    dateLabel,
    place: document.getElementById("ev-place").value.trim(),
    organizer: document.getElementById("ev-organizer").value.trim(),
    desc: document.getElementById("ev-desc").value.trim(),
    link: document.getElementById("ev-link").value.trim(),
    custom: true,
  };
  await saveCustomEvent(ev);
  closeEventModal();
  renderEventos();
  showToast("Evento agregado");
});

/* ---------- EMPRESAS: FILTERS ---------- */
function populateMunicipioFilter(){
  const municipios = ["", ...new Set(COMPANIES.map(c=>c.municipio))].sort();
  const sel = document.getElementById("municipioFilter");
  sel.innerHTML = municipios.map(m=> m ? `<option value="${m}">${m}</option>` : `<option value="">Todos los municipios</option>`).join("");
}

function renderSectorTabs(){
  const sectors = ["Todos", ...new Set(COMPANIES.map(c=>c.sector))];
  const el = document.getElementById("sectorTabs");
  el.innerHTML = sectors.map(s=>{
    const count = s==="Todos" ? COMPANIES.length : COMPANIES.filter(c=>c.sector===s).length;
    return `<button data-sector="${s}" class="${s===activeSector?'active':''}">${s} <span style="opacity:.6">(${count})</span></button>`;
  }).join("");
  el.querySelectorAll("button").forEach(b=>{
    b.addEventListener("click", ()=>{ activeSector=b.dataset.sector; renderSectorTabs(); renderEmpresas(); });
  });
}

function matchesFilters(c){
  const q = document.getElementById("searchBox").value.trim().toLowerCase();
  const statusF = document.getElementById("statusFilter").value;
  const municipioF = document.getElementById("municipioFilter").value;
  const st = (crmState[c.id]||{}).status || "Por contactar";
  if(activeSector !== "Todos" && c.sector !== activeSector) return false;
  if(statusF && st !== statusF) return false;
  if(municipioF && c.municipio !== municipioF) return false;
  if(q && !(c.name+" "+c.contact+" "+c.sector+" "+c.need+" "+c.municipio).toLowerCase().includes(q)) return false;
  return true;
}

function renderEmpresas(){
  const filtered = COMPANIES.filter(matchesFilters);
  document.getElementById("countLine").textContent = `${filtered.length} de ${COMPANIES.length} empresas`;
  if(viewMode==="cards"){
    document.getElementById("cardGrid").style.display="grid";
    document.getElementById("tableWrap").style.display="none";
    renderCards(filtered);
  } else {
    document.getElementById("cardGrid").style.display="none";
    document.getElementById("tableWrap").style.display="block";
    renderTable(filtered);
  }
}

function renderCards(filtered){
  const grid = document.getElementById("cardGrid");
  grid.innerHTML = filtered.map(c=>{
    const st = crmState[c.id] || {status:"Por contactar", nextAction:"", notes:"", contactDate:"", medium:""};
    return `
    <div class="card" data-id="${c.id}">
      <div class="card-body">
        <div class="card-top">
          <span class="sector-tag">${c.sector}</span>
          <span class="stamp st-${slug(st.status)}">${st.status}</span>
        </div>
        <div class="municipio-tag">${c.municipio}</div>
        <div class="company-name">${c.name}</div>
        <div class="need">${c.need}</div>
        <div class="contact-lines">
          <div><span class="k">Contacto</span>${c.contact}</div>
          <div><span class="k">Tel</span>${c.phone}</div>
          <div><span class="k">Correo</span>${c.email!=="N/D" ? `<a href="mailto:${c.email.split(' ')[0]}">${c.email}</a>` : "N/D"}</div>
          <div><span class="k">Dir</span>${c.address}</div>
        </div>
        <div class="card-actions">
          <button class="btn toggle-panel">Editar seguimiento</button>
          <button class="btn ghost gen-email">Generar correo</button>
        </div>
      </div>
      <div class="panel" id="panel-${c.id}">
        <div class="field"><label>Estado</label>
          <select class="f-status">${STATUSES.map(s=>`<option value="${s}" ${s===st.status?"selected":""}>${s}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Fecha de contacto</label><input type="date" class="f-date" value="${st.contactDate||''}"></div>
        <div class="field"><label>Medio</label>
          <select class="f-medium"><option value="">—</option>${["Correo","WhatsApp","Llamada","Visita","Referido"].map(m=>`<option value="${m}" ${m===st.medium?"selected":""}>${m}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Próxima acción</label><input type="text" class="f-next" value="${st.nextAction||''}" placeholder="Ej: Llamar el jueves"></div>
        <div class="field"><label>Observaciones</label><textarea class="f-notes" placeholder="Notas de la gestión...">${st.notes||''}</textarea></div>
        <button class="btn save-btn">Guardar seguimiento</button>
        <div class="save-note"></div>
      </div>
    </div>`;
  }).join("");

  grid.querySelectorAll(".toggle-panel").forEach(btn=>{
    btn.addEventListener("click",(e)=>{ e.target.closest(".card").querySelector(".panel").classList.toggle("open"); });
  });
  grid.querySelectorAll(".save-btn").forEach(btn=>{
    btn.addEventListener("click", async (e)=>{
      const card = e.target.closest(".card");
      const id = card.dataset.id;
      const panel = card.querySelector(".panel");
      const oldStatus = (crmState[id]||{}).status || "Por contactar";
      crmState[id] = {
        status: panel.querySelector(".f-status").value,
        contactDate: panel.querySelector(".f-date").value,
        medium: panel.querySelector(".f-medium").value,
        nextAction: panel.querySelector(".f-next").value,
        notes: panel.querySelector(".f-notes").value,
      };
      const note = panel.querySelector(".save-note");
      note.textContent = "Guardando...";
      const ok = await saveState(id);
      note.textContent = ok ? "Guardado ✓" : "Error al guardar, intenta de nuevo";
      const stampEl = card.querySelector(".stamp");
      stampEl.className = "stamp st-" + slug(crmState[id].status);
      stampEl.textContent = crmState[id].status;
      if(ok){
        const company = COMPANIES.find(c=>c.id===id);
        logAutoActivity(company, oldStatus, crmState[id]);
      }
    });
  });
  grid.querySelectorAll(".gen-email").forEach(btn=>{
    btn.addEventListener("click",(e)=>{
      const id = e.target.closest(".card").dataset.id;
      const company = COMPANIES.find(c=>c.id===id);
      generateEmail(company);
      document.querySelectorAll(".nav-list button").forEach(b=>b.classList.remove("active"));
      document.querySelector('[data-view="correo"]').classList.add("active");
      document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
      document.getElementById("view-correo").classList.add("active");
      showToast("Correo generado para " + company.name);
    });
  });
}

function renderTable(filtered){
  const wrap = document.getElementById("tableWrap");
  wrap.innerHTML = `<table class="crm-table"><thead><tr>
    <th>Empresa</th><th>Municipio</th><th>Sector</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th>Estado</th><th>Próxima acción</th>
  </tr></thead><tbody>
  ${filtered.map(c=>{
    const st = crmState[c.id]||{status:"Por contactar",nextAction:""};
    return `<tr><td>${c.name}</td><td>${c.municipio}</td><td>${c.sector}</td><td>${c.contact}</td><td>${c.phone}</td><td>${c.email}</td><td><span class="stamp st-${slug(st.status)}">${st.status}</span></td><td>${st.nextAction||"—"}</td></tr>`;
  }).join("")}
  </tbody></table>`;
}

document.querySelectorAll(".view-toggle button").forEach(b=>{
  b.addEventListener("click", ()=>{
    document.querySelectorAll(".view-toggle button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    viewMode = b.dataset.mode;
    renderEmpresas();
  });
});

document.getElementById("searchBox").addEventListener("input", renderEmpresas);
document.getElementById("statusFilter").addEventListener("change", renderEmpresas);
document.getElementById("municipioFilter").addEventListener("change", renderEmpresas);

document.getElementById("exportCsvBtn").addEventListener("click", ()=>{
  const headers = ["Empresa","Municipio","Sector","Necesidad","Contacto","Telefono","Correo","Direccion","Estado","FechaContacto","Medio","ProximaAccion","Observaciones"];
  const rows = COMPANIES.map(c=>{
    const st = crmState[c.id]||{};
    return [c.name,c.municipio,c.sector,c.need,c.contact,c.phone,c.email,c.address,st.status||"",st.contactDate||"",st.medium||"",st.nextAction||"",st.notes||""]
      .map(v=>`"${(v||"").toString().replace(/"/g,'""')}"`).join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "crm_calibracion_sena_caldas.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV exportado");
});

/* ---------- CORREO ---------- */
function genericEmailBody(){
  return `Estimado(a) [Nombre del contacto],

Reciba un cordial saludo de parte del Laboratorio de Metrología del SENA Regional Caldas – Centro de Procesos Industriales y Construcción.

Le escribimos porque identificamos que [NOMBRE DE LA EMPRESA], como empresa del sector [SECTOR], probablemente utiliza instrumentos de medición dentro de sus procesos. Contar con estos equipos calibrados y con trazabilidad es clave para asegurar la calidad de sus mediciones, reducir reprocesos y cumplir con sus sistemas de gestión.

Nuestro laboratorio cuenta con acreditación ONAC 17-LAC-018 bajo la norma NTC-ISO/IEC 17025:2017, y ofrece servicios de calibración en tres magnitudes: longitud, presión y temperatura, con respaldo institucional del SENA y cercanía regional para empresas de Manizales, Caldas y el Eje Cafetero.

Nos gustaría conocer sus necesidades actuales de calibración y ofrecerle:
• Diagnóstico gratuito de su parque de instrumentos de medición.
• Cotización sin compromiso, con respuesta en máximo 3 días hábiles.
• Un plan anual de calibración con recordatorios de vencimiento.

¿Sería posible agendar una breve llamada o visita esta semana?

Quedo atento(a) a su respuesta.

Cordialmente,
[Su nombre]
Laboratorio de Metrología — SENA Regional Caldas
Tel/WhatsApp: [número] · Correo: [correo institucional]`;
}

function generateEmail(company){
  document.getElementById("emailSubject").textContent = `Calibración acreditada ISO/IEC 17025 para ${company.name} — Laboratorio de Metrología SENA Caldas`;
  const contactFirstName = company.contact.split(/[—-]/)[0].split(",")[0].trim();
  document.getElementById("emailBody").textContent = `Estimado(a) ${contactFirstName || "equipo de " + company.name},

Reciba un cordial saludo de parte del Laboratorio de Metrología del SENA Regional Caldas – Centro de Procesos Industriales y Construcción.

Le escribimos porque identificamos que ${company.name}, como empresa del sector ${company.sector.toLowerCase()}, probablemente utiliza instrumentos relacionados con ${company.need.toLowerCase()}. Contar con estos equipos calibrados y con trazabilidad es clave para asegurar la calidad de sus mediciones, reducir reprocesos y cumplir con sus sistemas de gestión.

Nuestro laboratorio cuenta con acreditación ONAC 17-LAC-018 bajo la norma NTC-ISO/IEC 17025:2017, y ofrece servicios de calibración en longitud, presión y temperatura, con respaldo institucional del SENA y cercanía regional para empresas de Manizales, Caldas y el Eje Cafetero.

Nos gustaría conocer sus necesidades actuales de calibración y ofrecerle:
• Diagnóstico gratuito de su parque de instrumentos de medición.
• Cotización sin compromiso, con respuesta en máximo 3 días hábiles.
• Un plan anual de calibración con recordatorios de vencimiento.

¿Sería posible agendar una breve llamada o visita esta semana para conocer más sobre sus equipos?

Quedo atento(a) a su respuesta.

Cordialmente,
[Su nombre]
Laboratorio de Metrología — SENA Regional Caldas
Tel/WhatsApp: [número] · Correo: [correo institucional]`;
}

document.getElementById("resetEmailBtn").addEventListener("click", ()=>{
  document.getElementById("emailSubject").textContent = "Calibración acreditada ISO/IEC 17025 para [NOMBRE DE LA EMPRESA] — Laboratorio de Metrología SENA Caldas";
  document.getElementById("emailBody").textContent = genericEmailBody();
});

document.getElementById("copyEmailBtn").addEventListener("click", async ()=>{
  const subject = document.getElementById("emailSubject").textContent;
  const body = document.getElementById("emailBody").textContent;
  try{
    await navigator.clipboard.writeText(`Asunto: ${subject}\n\n${body}`);
    showToast("Correo copiado al portapapeles");
  }catch(e){
    showToast("No se pudo copiar, selecciona el texto manualmente");
  }
});

/* ===========================================================
 * REGISTRO DE ACTIVIDADES (evidencia de gestión y trabajo virtual)
 * ===========================================================
 * Cada actividad manual, y cada actualización de seguimiento en el CRM,
 * queda registrada aquí con fecha y hora exactas. Sirve como bitácora
 * de evidencia para reportar el avance de las actividades.
 * =========================================================== */
let activities = [];
const ACTIVITIES_COLLECTION = "registro_actividades";
const ACTIVITIES_LOCAL_KEY = "registro_actividades_local";

function loadActivities(){
  if(firebaseEnabled && firebaseDB){
    firebaseDB.collection(ACTIVITIES_COLLECTION).onSnapshot((snapshot)=>{
      activities = [];
      snapshot.forEach(doc=> activities.push({...doc.data(), id:doc.id}));
      renderActivities();
    }, (err)=>{
      console.error(err);
      loadActivitiesLocalFallback();
      renderActivities();
    });
  } else {
    loadActivitiesLocalFallback();
  }
}

function loadActivitiesLocalFallback(){
  try{
    const raw = localStorage.getItem(ACTIVITIES_LOCAL_KEY);
    activities = raw ? JSON.parse(raw) : [];
  }catch(e){ activities = []; }
}

async function saveActivity(act){
  if(firebaseEnabled && firebaseDB){
    try{
      await firebaseDB.collection(ACTIVITIES_COLLECTION).add(act);
      return;
    }catch(e){ console.error(e); }
  }
  activities.push({...act, id:"local_"+Date.now()+"_"+Math.random().toString(36).slice(2,6)});
  localStorage.setItem(ACTIVITIES_LOCAL_KEY, JSON.stringify(activities));
  renderActivities();
}

/* Registro automático: se llama cada vez que se guarda un seguimiento en el CRM */
function logAutoActivity(company, oldStatus, newState){
  saveActivity({
    date: new Date().toISOString().slice(0,10),
    type: "Actualización de seguimiento (CRM)",
    mode: (newState.medium === "Visita") ? "Presencial" : "Virtual",
    desc: `${company.name}: estado cambió de "${oldStatus}" a "${newState.status}". ${newState.nextAction ? "Próxima acción: "+newState.nextAction+"." : ""}`,
    evidence: "",
    hours: "",
    auto: true,
    timestamp: new Date().toISOString(),
  });
}

function renderActivitiesKpis(){
  const el = document.getElementById("activitiesKpiStrip");
  const total = activities.length;
  const virtual = activities.filter(a=>a.mode==="Virtual").length;
  const totalHours = activities.reduce((sum,a)=> sum + (parseFloat(a.hours)||0), 0);
  const auto = activities.filter(a=>a.auto).length;
  const cards = [
    [total, "Actividades registradas"],
    [virtual, "Realizadas en modalidad virtual"],
    [totalHours.toFixed(1), "Horas dedicadas registradas"],
    [auto, "Generadas automáticamente por el CRM"],
  ];
  el.innerHTML = cards.map(([num,lbl])=>`
    <div class="kpi-card"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>
  `).join("");
}

function renderActivities(){
  renderActivitiesKpis();
  const wrap = document.getElementById("activitiesTableWrap");
  const sorted = [...activities].sort((a,b)=> (b.timestamp||b.date||"").localeCompare(a.timestamp||a.date||""));
  if(sorted.length===0){
    wrap.innerHTML = `<div class="panel-block" style="color:var(--ink-soft);font-size:13px;">Aún no hay actividades registradas. Se agregarán solas cada vez que actualices el seguimiento de una empresa, o puedes registrar una manualmente con el botón "+ Registrar actividad".</div>`;
    return;
  }
  wrap.innerHTML = `<table class="crm-table"><thead><tr>
    <th>Fecha</th><th>Tipo</th><th>Modalidad</th><th>Descripción</th><th>Evidencia</th><th>Horas</th><th></th>
  </tr></thead><tbody>
  ${sorted.map(a=>`<tr data-actid="${a.id}">
    <td>${a.date||"—"}</td>
    <td>${a.type}${a.auto?' <span class="stamp st-Sin-respuesta" style="font-size:8.5px;">AUTO</span>':''}</td>
    <td>${a.mode||"—"}</td>
    <td>${a.desc||""}</td>
    <td>${a.evidence ? `<a href="${a.evidence}" target="_blank" rel="noopener">Ver evidencia ↗</a>` : "—"}</td>
    <td>${a.hours||"—"}</td>
    <td>${a.auto ? "" : `<button class="btn ghost del-activity" style="padding:4px 8px;font-size:9.5px;">Eliminar</button>`}</td>
  </tr>`).join("")}
  </tbody></table>`;

  wrap.querySelectorAll(".del-activity").forEach(btn=>{
    btn.addEventListener("click", async (e)=>{
      const id = e.target.closest("tr").dataset.actid;
      if(firebaseEnabled && firebaseDB && !id.startsWith("local_")){
        try{ await firebaseDB.collection(ACTIVITIES_COLLECTION).doc(id).delete(); }catch(err){ console.error(err); }
      } else {
        activities = activities.filter(a=>a.id!==id);
        localStorage.setItem(ACTIVITIES_LOCAL_KEY, JSON.stringify(activities));
        renderActivities();
      }
    });
  });
}

function openActivityModal(){
  document.getElementById("ac-date").value = new Date().toISOString().slice(0,10);
  document.getElementById("activityModalOverlay").classList.add("open");
}
function closeActivityModal(){
  document.getElementById("activityModalOverlay").classList.remove("open");
  ["ac-date","ac-desc","ac-evidence","ac-hours"].forEach(id=> document.getElementById(id).value = "");
}
document.getElementById("addActivityBtn").addEventListener("click", openActivityModal);
document.getElementById("cancelActivityBtn").addEventListener("click", closeActivityModal);
document.getElementById("activityModalOverlay").addEventListener("click",(e)=>{
  if(e.target.id==="activityModalOverlay") closeActivityModal();
});
document.getElementById("saveActivityBtn").addEventListener("click", async ()=>{
  const desc = document.getElementById("ac-desc").value.trim();
  if(!desc){ showToast("Describe brevemente la actividad"); return; }
  await saveActivity({
    date: document.getElementById("ac-date").value || new Date().toISOString().slice(0,10),
    type: document.getElementById("ac-type").value,
    mode: document.getElementById("ac-mode").value,
    desc,
    evidence: document.getElementById("ac-evidence").value.trim(),
    hours: document.getElementById("ac-hours").value,
    auto: false,
    timestamp: new Date().toISOString(),
  });
  closeActivityModal();
  showToast("Actividad registrada");
});
document.getElementById("exportActivitiesBtn").addEventListener("click", ()=>{
  const headers = ["Fecha","Tipo","Modalidad","Descripcion","Evidencia","Horas"];
  const rows = activities.map(a=>[a.date,a.type,a.mode,a.desc,a.evidence,a.hours]
    .map(v=>`"${(v||"").toString().replace(/"/g,'""')}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "registro_actividades_calibracion.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV exportado");
});

document.getElementById("guionList").innerHTML = GUION.map(g=>`<li>${g}</li>`).join("");

(function init(){
  loadState();
  loadCustomEvents();
  loadActivities();
  renderDashboard();
  populateMunicipioFilter();
  renderSectorTabs();
  renderEmpresas();
  document.getElementById("emailBody").textContent = genericEmailBody();
})();