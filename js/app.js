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
      showToast("No se pudo conectar a Firebase, revisa js/firebase-config.js");
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
});

/* ---------- DASHBOARD ---------- */
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
  const maxS = Math.max(...Object.values(statusCounts), 1);
  document.getElementById("statusChart").innerHTML = STATUSES.map(s=>{
    const v = statusCounts[s];
    return `<div class="chart-row"><div class="clabel">${s}</div><div class="chart-track"><i style="width:${(v/maxS)*100}%"></i></div><div class="chart-val">${v}</div></div>`;
  }).join("");

  const sectors = [...new Set(COMPANIES.map(c=>c.sector))];
  const sectorCounts = {};
  sectors.forEach(s=>sectorCounts[s]=0);
  COMPANIES.forEach(c=>sectorCounts[c.sector]++);
  const maxSec = Math.max(...Object.values(sectorCounts),1);
  document.getElementById("sectorChart").innerHTML = sectors.map(s=>{
    const v = sectorCounts[s];
    return `<div class="chart-row"><div class="clabel">${s}</div><div class="chart-track"><i style="width:${(v/maxSec)*100}%"></i></div><div class="chart-val">${v}</div></div>`;
  }).join("");

  const pending = COMPANIES.filter(c=>(crmState[c.id]||{}).nextAction).slice(0,8);
  const list = document.getElementById("pendingList");
  if(pending.length===0){
    list.innerHTML = `<li style="color:var(--ink-soft)">Aún no has registrado próximas acciones. Ve a "Empresas" y edita el seguimiento de un prospecto.</li>`;
  } else {
    list.innerHTML = pending.map(c=>{
      const st = crmState[c.id];
      return `<li><span>${c.name} — ${st.nextAction}</span><span class="stamp st-${slug(st.status)}">${st.status}</span></li>`;
    }).join("");
  }
}

/* ---------- EVENTOS ---------- */
function renderEventos(){
  const grid = document.getElementById("eventsGrid");
  const today = new Date().toISOString().slice(0,10);
  const sorted = [...EVENTS].sort((a,b)=>{
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
    return `
    <div class="card">
      <div class="card-body">
        <div class="card-top">
          <span class="sector-tag">${ev.tag}</span>
          ${badge}
        </div>
        <div class="company-name">${ev.title}</div>
        <div class="need" style="margin-bottom:12px;">${ev.desc}</div>
        <div class="contact-lines">
          <div><span class="k">Fecha</span>${ev.dateLabel}</div>
          <div><span class="k">Lugar</span>${ev.place}</div>
          <div><span class="k">Organiza</span>${ev.organizer}</div>
        </div>
        <div class="card-actions">
          <a class="btn" href="${ev.link}" target="_blank" rel="noopener" style="text-decoration:none;">Más información</a>
        </div>
      </div>
    </div>`;
  }).join("");
}

/* ---------- EMPRESAS: FILTERS ---------- */
function populateMunicipioFilter(){
  const municipios = ["", ...new Set(COMPANIES.map(c=>c.municipio))].sort();
  const sel = document.getElementById("municipioFilter");
  sel.innerHTML = municipios.map(m=> m ? `<option value="${m}">${m}</option>` : `<option value="">Todos los municipios</option>`).join("");
}

function renderSectorTabs(){
  const sectors = ["Todos", ...new Set(COMPANIES.map(c=>c.sector))];
  const el = document.getElementById("sectorTabs");
  el.innerHTML = sectors.map(s=>`<button data-sector="${s}" class="${s===activeSector?'active':''}">${s}</button>`).join("");
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

document.getElementById("guionList").innerHTML = GUION.map(g=>`<li>${g}</li>`).join("");

(function init(){
  loadState();
  renderDashboard();
  populateMunicipioFilter();
  renderSectorTabs();
  renderEmpresas();
  document.getElementById("emailBody").textContent = genericEmailBody();
})();