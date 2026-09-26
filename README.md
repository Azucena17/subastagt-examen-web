# SubastaGT — Subastas de vehículos en tiempo real

Aplicación académica para Desarrollo y Diseño Web. Frontend SPA en **Vue 3**, backend REST en **Node.js / Express** y base de datos **SQL Server**. Las ofertas se transmiten con **Server-Sent Events (SSE)**, sin refrescar la página. Incluye adaptador alternativo para Firebase Authentication y Realtime Database.

## Enlaces de entrega

- **Sitio publicado:** pendiente de configurar una cuenta de alojamiento y desplegar.
- **Repositorio GitHub:** https://github.com/Azucena17/subastagt-examen-web
- **Versión local:** http://localhost:3000 — solo accesible mientras se ejecuta el servidor en esta computadora.

No confundir la dirección local con un sitio publicado para evaluación. Este apartado debe actualizarse con los enlaces reales después del despliegue.

## Ejecutar en esta computadora

La base **SubastaGT** ya está creada en la instancia local de SQL Server. El archivo `.env` configura la conexión de Windows. Requisitos: Node.js 22 o superior, SQL Server en ejecución y Microsoft ODBC Driver 18.

```powershell
npm install
npm run build
npm start
```

Abrir http://localhost:3000. El mismo servidor entrega el frontend compilado y la API, por lo que las llamadas `fetch('/api/...')` y `EventSource('/api/events')` funcionan desde el sitio sin configurar CORS.

En otra computadora Windows con SQL Server:

```powershell
sqlcmd -S localhost -E -C -b -i database/schema.sql
Copy-Item .env.example .env
npm ci
npm run build
npm start
```

Si la instancia tiene otro nombre, cambiar `Server=localhost` en `.env` y el parámetro `-S`. Las sesiones duran 12 horas y se cierran al reiniciar el backend.

## Tres usuarios de prueba

Se crean automáticamente al iniciar con SQL Server o modo demo. Los tres pueden publicar y ofertar; el propietario no puede ofertar por su vehículo.

| Correo | Contraseña |
| --- | --- |
| usuario1@subastagt.test | Subasta2026! |
| usuario2@subastagt.test | Subasta2026! |
| usuario3@subastagt.test | Subasta2026! |

Para probar simultáneamente, abrir navegadores diferentes o perfiles privados. Pestañas normales del mismo navegador comparten la cookie de sesión.

## Funciones

- Registro: nombre, apellido, correo, teléfono y contraseña segura. Contraseñas locales protegidas con scrypt y sal individual; cookie de sesión HttpOnly.
- Visitantes: inventario y filtros en modo lectura. Iniciar sesión para abrir la subasta, publicar o pujar.
- Ficha: año, tipo, marca, modelo, motor, transmisión, combustible, tracción y cilindros.
- Daños: verde (menor), amarillo (reparable) y rojo (salvamento), con texto además del color.
- Galería de 5 a 12 fotografías distintas; ingreso mediante enlaces HTTPS, vista previa y carrusel.
- Publicación con monto base y fechas de inicio y cierre. Edición solo por el propietario, antes de que existan ofertas y antes del cierre.
- Filtros combinables por todos los campos técnicos, daño, estado de subasta y texto; orden por cierre, precio o año.
- Monto actual y reloj sincronizados con la hora del servidor. Indicador de conexión y reconexión automática.
- Primera oferta igual o superior al monto base. Las siguientes deben aumentar por lo menos 10 %, redondeando hacia arriba al centavo. El servidor valida montos enteros en centavos.
- Estado individual “Vas ganando” o “Tu oferta ha sido superada”. La API no publica IDs, nombres ni correos de otros ofertantes.
- Al cerrar, se rechazan ofertas en el servidor. Se considera vendida si la mejor oferta supera el monto base; con cero ofertas o únicamente el monto base queda no vendida/desierta, conforme al enunciado.

Los seis lotes iniciales y sus fotografías son **ilustrativos**. No son anuncios reales; las imágenes de ejemplo no corresponden necesariamente a la marca/modelo. Las subastas iniciales vencen entre 2 y 12 horas después de crear el inventario, y no se reinician al arrancar. Publica nuevos lotes para pruebas posteriores.

## Base de datos y arquitectura

`database/schema.sql` crea exclusivamente `SubastaGT` y las tablas que falten:

| Tabla | Contenido |
| --- | --- |
| `dbo.Users` | Perfil, correo único y hash de contraseña |
| `dbo.Vehicles` | Propietario y documento JSON validado con ficha, fotos, calendario y estado de la subasta |
| `dbo.Bids` | Historial privado de ofertas, usuario, monto en centavos y fecha UTC |

La ficha y las fotos se almacenan en JSON dentro de SQL Server; el historial de ofertas es relacional con claves foráneas. Las transacciones `SERIALIZABLE` y bloqueos `UPDLOCK/HOLDLOCK` serializan las pujas de un mismo vehículo. Solo se anuncia el cambio después del commit.

```text
Navegador (Vue) ── fetch /api ──► Express ── transacción ──► SQL Server
               ◄── SSE /api/events ──┘
```

| Método y ruta | Función |
| --- | --- |
| `GET /api/config`, `GET /api/me` | Modo activo y sesión |
| `POST /api/auth/register`, `POST /api/auth/login` | Registro y acceso |
| `POST /api/logout` | Cerrar sesión |
| `GET /api/vehicles` | Inventario sanitizado |
| `POST /api/vehicles` | Publicar, requiere sesión |
| `PUT /api/vehicles/:id` | Editar la publicación propia |
| `POST /api/vehicles/:id/bids` | Pujar con validación en servidor |
| `GET /api/events` | Inventario y estados en tiempo real |

La versión SQL Server está diseñada para **una instancia de backend**. Las notificaciones y sesiones se mantienen en memoria; para escalar horizontalmente se necesita almacenamiento compartido de sesiones y distribución de eventos.

## Publicación con Firebase y Render

Esta alternativa permite alojar el backend sin exponer el SQL Server de la computadora. El adaptador está implementado; requiere credenciales y una prueba real en tu cuenta antes de entregar.

1. Crear un proyecto en [Firebase Console](https://console.firebase.google.com/).
2. Habilitar **Authentication → Email/Password**.
3. Crear **Realtime Database** y copiar su URL. Publicar las reglas de `database.rules.json`: deniegan acceso directo de clientes; solo el backend autenticado con Admin SDK manipula los datos.
4. En configuración del proyecto, registrar una aplicación web y copiar el objeto de configuración público.
5. En **Cuentas de servicio**, generar la clave privada para el servidor. Guardarla directamente como secreto en el alojamiento; **no subirla a GitHub ni pegarla en el frontend**.
6. Subir este repositorio a GitHub y crear un Web Service de Node en Render, o usar el `render.yaml` incluido.
7. Build: `npm ci --include=dev && npm run build`. Start: `npm start`. El controlador nativo de Windows es una dependencia opcional y no se utiliza en modo Firebase.
8. Configurar `NODE_ENV=production`, `DATA_MODE=firebase`, `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT` (JSON completo en una línea) y `FIREBASE_WEB_CONFIG` (JSON público en una línea, con `apiKey`).
9. Desplegar. Registrar tres cuentas desde la aplicación publicada; en Firebase no se crean automáticamente las cuentas locales de prueba. Publicar al menos un vehículo con cinco fotografías.
10. Probar desde dos navegadores y actualizar arriba los enlaces reales y las credenciales de las cuentas de evaluación.

Las cuentas y vehículos locales no se migran automáticamente a Firebase. No desplegar `DATA_MODE=demo` para entregar: ese modo usa un JSON y no satisface el requisito de SQL Server/Firebase ni garantiza persistencia en alojamiento efímero.

Para publicar manteniendo SQL Server, alojar el backend en Windows con acceso a una instancia SQL Server administrada, configurar `SQL_CONNECTION_STRING`, HTTPS y `NODE_ENV=production`. El servidor web debe permitir conexiones SSE sin almacenamiento en búfer. No basta con subir el frontend a GitHub Pages.

Referencias: [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup), [autenticación por contraseña](https://firebase.google.com/docs/auth/web/password-auth), [Node/Express en Render](https://render.com/docs/deploy-node-express-app).

## Pruebas

```powershell
npm test
node tests/sql-integration.mjs
node tests/browser.mjs
```

- `npm test`: prueba reglas de puja, privacidad, fechas, validación, autenticación, edición, concurrencia y recepción SSE sobre una instancia demo aislada y temporal.
- `sql-integration.mjs`: usa la base SQL Server de `.env`, crea un lote de prueba aislado, ejecuta pujas concurrentes, verifica el historial y elimina exclusivamente ese lote temporal al finalizar.
- `browser.mjs`: requiere Microsoft Edge y el servidor en puerto 3000. Prueba inventario, login, detalle, filtros, móvil y ausencia de errores JavaScript. Capturas en `test-results/`.

Para modificar la interfaz, ejecutar `npm run build` después de los cambios. `npm run dev` observa cambios del backend.

## Archivos principales

- `src/main.js`, `src/style.css`: SPA y estilos adaptables.
- `server/index.js`: API, autenticación y SSE.
- `server/domain.js`: reglas de negocio y privacidad.
- `server/sql-store.js`: persistencia y transacciones SQL Server.
- `database/schema.sql`: creación de base y tablas.
- `database.rules.json`: reglas del adaptador Firebase.
- `public/media/`: copias locales de fotografías ilustrativas de Unsplash.
- `.env.example`, `render.yaml`: configuración de ejecución y despliegue.

`.env`, datos locales, credenciales, dependencias, compilaciones y capturas están excluidos de Git.
