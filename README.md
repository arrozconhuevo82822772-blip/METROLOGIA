# CRM Calibración — Laboratorio de Metrología SENA Caldas

Tablero interactivo de prospección comercial para el laboratorio de metrología
(servicios de calibración en longitud, presión y temperatura), con base de
datos de empresas de Manizales/Caldas, seguimiento tipo CRM, plantilla de
correo y guion de llamada.

## Novedades de esta versión

- **55 empresas** en toda la jurisdicción de Caldas (antes solo Manizales):
  Chinchiná, La Dorada, Villamaría, Anserma, Riosucio, Marmato, y más.
  Cada empresa ahora tiene un campo **Municipio**, con su propio filtro en
  la vista "Empresas".
- **Nueva vista "Eventos"**: ferias, ruedas de negocios y encuentros
  empresariales reales de Caldas, con fecha, lugar, organizador y enlace.
  Esta lista es **curada manualmente** (no hay forma de que una página
  HTML sencilla lea noticias en vivo de sitios como La Patria o la Alcaldía
  sin un servidor intermedio de pago). Revisa las fuentes que están al
  final de esa vista cada 2-3 semanas y agrega eventos nuevos en
  `js/data.js`, dentro del arreglo `EVENTS`.
- Rediseño visual: iconos en el menú lateral, fondo con textura sutil,
  separadores más claros entre secciones.

## Estructura del proyecto

```
crm_calibracion_sena/
├── index.html              → Estructura de la página (barra lateral + vistas)
├── css/
│   └── styles.css          → Todos los estilos visuales
├── js/
│   ├── firebase-config.js  → Aquí pegas las credenciales de tu proyecto Firebase
│   ├── data.js              → Base de datos de empresas, metas y guion (edítalo aquí)
│   └── app.js               → Lógica de la aplicación (filtros, guardado, correo, gráficas)
└── README.md                → Este archivo
```

## Cómo usarlo

1. Descarga/descomprime la carpeta completa (los archivos deben quedar
   juntos, respetando las subcarpetas `css/` y `js/`).
2. Haz doble clic en **`index.html`**. Se abre en tu navegador (Chrome,
   Edge o Firefox), necesitas conexión a internet para cargar Firebase y
   las tipografías.
3. Trabaja normalmente: filtra, edita el seguimiento de cada empresa,
   genera correos, exporta CSV.

## Base de datos: Firebase (recomendado) o modo local automático

Esta aplicación puede guardar los datos de dos formas, **y detecta sola
cuál usar**:

- **Con Firebase configurado** → los datos se guardan en la nube
  (Firestore) y se sincronizan **en tiempo real** entre cualquier persona
  que abra la página (ideal si varios compañeros del laboratorio hacen
  seguimiento a la vez).
- **Sin Firebase configurado** → sigue funcionando exactamente como antes,
  guardando en el navegador local (`localStorage`) del computador.

En la esquina inferior izquierda verás una etiqueta que dice
**"Conectado a Firebase (compartido)"** o **"Modo local (solo este
navegador)"**, según el caso.

### Cómo configurar Firebase (una sola vez, ~10 minutos)

1. Ve a **https://console.firebase.google.com** e inicia sesión con una
   cuenta de Google (puede ser la institucional del SENA o una personal).
2. Clic en **"Crear un proyecto"**. Ponle un nombre, por ejemplo
   `crm-calibracion-sena`. Puedes desactivar Google Analytics (no se
   necesita para esto).
3. Dentro del proyecto, en el menú izquierdo: **Compilación → Firestore
   Database → Crear base de datos**.
   - Elige la ubicación más cercana (por ejemplo `southamerica-east1`).
   - Elige **"Iniciar en modo de prueba"** por ahora (dura 30 días con
     acceso abierto; luego debes aplicar las reglas de seguridad de
     abajo).
4. Ve a **Configuración del proyecto** (ícono de engranaje, arriba a la
   izquierda) → pestaña **General** → baja hasta **"Tus apps"** → clic en
   el ícono **`</>`** (Web).
5. Ponle un apodo a la app (ej. `crm-web`) y clic en **"Registrar app"**.
   Firebase te mostrará un bloque de código con un objeto
   `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`.
6. Abre el archivo **`js/firebase-config.js`** de esta carpeta con un
   editor de texto y reemplaza los valores de ejemplo (`TU_API_KEY`,
   `TU_PROYECTO`, etc.) por los que te dio Firebase. Guarda el archivo.
7. Recarga `index.html` en el navegador. La etiqueta debe cambiar a
   "Conectado a Firebase (compartido)".

### Reglas de seguridad (importante, hazlo después del paso anterior)

El "modo de prueba" deja la base de datos abierta a cualquiera durante 30
días — está bien para configurar, pero **debes cerrarla** después. En
Firebase Console: **Firestore Database → pestaña "Reglas"**, y reemplaza
el contenido por algo como esto (acceso de lectura/escritura solo a la
colección de este CRM, sin necesidad de iniciar sesión — suficiente si
solo tu equipo conoce el enlace, pero no es autenticación real):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /crm_calibracion/{docId} {
      allow read, write: if true;
    }
  }
}
```

Si más adelante quieres que solo ciertas personas (con usuario y
contraseña) puedan editar, se puede añadir **Firebase Authentication** —
puedo ayudarte a configurarlo cuando lo necesites.

## Cómo actualizar la base de datos de empresas

Abre `js/data.js` con cualquier editor de texto (Bloc de notas, VS Code,
etc.) y agrega un nuevo bloque siguiendo el mismo formato que los
existentes, dentro del arreglo `COMPANIES`:

```js
{id:"c36", sector:"Metalmecánica", name:"Nombre de la empresa",
 need:"Qué magnitud necesita calibrar", contact:"Nombre del contacto",
 phone:"Teléfono", email:"correo@empresa.com", address:"Dirección",
 note:"Observación"},
```

Guarda el archivo y recarga `index.html` en el navegador. (Esto es
independiente del seguimiento CRM: los datos de la empresa en sí viven en
este archivo; el estado/notas de seguimiento viven en Firebase o en
localStorage).

## Si varias personas usan la página a la vez

Con Firebase configurado, si dos personas editan la **misma empresa** casi
al mismo tiempo, gana el último guardado (no hay fusión automática de
cambios). Para el uso normal de prospección (cada quien trabajando
empresas distintas) esto no es un problema.
