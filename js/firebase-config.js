/*
 * ===========================================================
 *  CONFIGURACIÓN DE FIREBASE
 * ===========================================================
 * 1. Ve a https://console.firebase.google.com
 * 2. Crea un proyecto nuevo (gratis) — por ejemplo "crm-calibracion-sena".
 * 3. Dentro del proyecto: menú "Compilación" → "Firestore Database" →
 *    "Crear base de datos" → elige modo de PRUEBA por ahora (lo ajustamos
 *    después con reglas de seguridad, ver README.md).
 * 4. Ve a "Configuración del proyecto" (ícono de engranaje) → pestaña
 *    "General" → baja hasta "Tus apps" → clic en el ícono </> (Web) →
 *    registra la app (el nombre puede ser "crm-web") → Firebase te
 *    mostrará un bloque `firebaseConfig` como el de abajo.
 * 5. Copia esos valores y pégalos reemplazando los que dicen "TU_...".
 * 6. Guarda este archivo y recarga index.html — ya debería conectar solo.
 *
 * Si dejas los valores de ejemplo tal cual, la aplicación sigue
 * funcionando en MODO LOCAL (localStorage), como hasta ahora, y te lo
 * indicará con un aviso.
 * ===========================================================
 */

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

let firebaseDB = null;
let firebaseEnabled = false;

try{
  const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("TU_");
  if(isConfigured && typeof firebase !== "undefined"){
    firebase.initializeApp(firebaseConfig);
    firebaseDB = firebase.firestore();
    firebaseEnabled = true;
  }
}catch(e){
  console.error("No se pudo inicializar Firebase:", e);
  firebaseDB = null;
  firebaseEnabled = false;
}
