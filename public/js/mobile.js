(async function(){
  // Leer datos guardados por login.html
  const storedRoute = (sessionStorage.getItem('currentRoute') || '{}');
  const storedDriver = (sessionStorage.getItem('currentDriver') || '{}');
  let route, driver;

  try { route = JSON.parse(storedRoute || '{}'); } catch(e){ route = {}; }
  try { driver = JSON.parse(storedDriver || '{}'); } catch(e){ driver = {}; }

  // Fallback: si no hay route en sessionStorage, pedir login directo
  if (!route || (!route.id && !route._id)) {
    // Redirigir a login si no hay ruta
    window.location.href = '/login.html';
    return;
  }

  const routeId = route.id || route._id || route._idstr || null;

  // Inicializar mapa
// Inicializar mapa: usar centro de la ruta si existe, sino coords por defecto
const defaultCenter = [19.7677724, -104.3686507];
let initialCenter = defaultCenter;
if (Array.isArray(routeCoords) && routeCoords.length > 0) {
  initialCenter = routeCoords[Math.floor(routeCoords.length / 2)]; // centro aproximado
} else if (route && Array.isArray(route.coords) && route.coords.length > 0) {
  initialCenter = [Number(route.coords[0][0]), Number(route.coords[0][1])];
}
const map = L.map('map', { zoomControl: false }).setView(initialCenter, 13);

  // Dibujar ruta en gris (si trae coords)
  let routePolyline = null;
  let routeCoords = []; // [[lat,lng], ...] en formato usable
  if (Array.isArray(route.coords) && route.coords.length > 0) {
    routeCoords = route.coords.map(p => [Number(p[0]), Number(p[1])]);
    routePolyline = L.polyline(routeCoords, { color: '#5f5959ff', weight: 5 }).addTo(map);
    map.fitBounds(routePolyline.getBounds(), { padding: [20,20] });
  }

  // UI elements
  const routeNameEl = document.getElementById('route-name');
  const driverEl = document.getElementById('driver-name');
  const statusEl = document.getElementById('route-status');
  const coordsEl = document.getElementById('coords');
  const btnRequest = document.getElementById('btn-request');
  const btnText = document.getElementById('btn-text');
  const toast = document.getElementById('toast');

  routeNameEl.textContent = route.name || route.nombre || 'Ruta';
  driverEl.textContent = driver.name || driver.email || 'Chofer';

  function showToast(text, ms=1800){
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(()=> toast.classList.remove('show'), ms);
  }

  // Socket
  const socket = io();

  // Unirnos a la sala de la ruta (para que PC que está suscrito reciba updates)
  socket.emit('joinRoute', { routeId: routeId, driverId: (driver && driver.id) ? driver.id : null });

  // Handler de respuesta de servidor (opcional)
  socket.on('connect', () => {
    console.log('socket conectado', socket.id);
  });

  // Variables para geolocalización y trazado
  let marker = null;
  let watchId = null;
  let progressLine = null;
  let tracingActive = false;
  const TOLERANCE = 10; // metros para considerar que alcanzó un punto de la ruta

  // Función que inicia watchPosition (llamar en cuanto el chofer inicie sesión)
  // Reemplaza tu startGeolocation() por esta versión de diagnóstico y fallback
function startGeolocation() {
  console.log('[GEO] startGeolocation() called');

  if (!('geolocation' in navigator)) {
    console.error('[GEO] API de geolocalización NO disponible en este navegador');
    alert('Geolocalización no soportada por el navegador.');
    return;
  }

  // Informar estado de permisos (si la API Permissions está disponible)
  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    navigator.permissions.query({ name: 'geolocation' }).then((perm) => {
      console.log('[GEO] permiso status:', perm.state);
      perm.onchange = () => console.log('[GEO] permiso cambió a', perm.state);
    }).catch((err) => {
      console.warn('[GEO] no se pudo consultar permisos:', err);
    });
  } else {
    console.log('[GEO] navigator.permissions no disponible en este navegador');
  }

  // Evitar múltiples watch
  if (watchId !== null) {
    console.log('[GEO] watchId ya existe, saltando nueva petición');
    return;
  }

  const options = { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 };

  try {
    console.log('[GEO] llamando navigator.geolocation.watchPosition(...)');
    watchId = navigator.geolocation.watchPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;

      console.log('[GEO] watchPosition callback — lat:', lat, 'lng:', lng, 'accuracy:', acc, 'timestamp:', pos.timestamp);

      // UI update
      coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} (±${Math.round(acc)}m)`;

      // ensure marker exists and update
      if (!marker) {
        marker = L.marker([lat, lng]).addTo(map).bindPopup('Tu ubicación');
      } else {
        marker.setLatLng([lat, lng]);
      }

      // pan map a la nueva posición
      map.panTo([lat, lng]);

      // emitimos al servidor (evento driverLocation)
      const payload = {
        lat, lng, timestamp: pos.timestamp || Date.now(),
        routeId: routeId, driverId: (driver && driver.id) ? driver.id : null
      };
      try {
        socket.emit('driverLocation', payload);
        console.log('[GEO] emit driverLocation', payload);
      } catch (e) {
        console.error('[GEO] error emitiendo driverLocation', e);
      }

      // si tracing activo, actualizar progress
      if (tracingActive && Array.isArray(routeCoords) && routeCoords.length > 0) {
        updateProgressLine([lat, lng]);
      }
    }, (err) => {
      console.warn('[GEO] watchPosition error:', err);
      showToast('Error geolocalización: ' + (err && err.message ? err.message : String(err)), 3000);

      // Si el código es PERMISSION_DENIED, instruir al usuario
      if (err && err.code === 1) {
        console.error('[GEO] Permiso denegado por usuario (code 1)');
      }

      // Si watch failed, probar fallback con getCurrentPosition (único intento)
      try {
        console.log('[GEO] intentando fallback getCurrentPosition()');
        navigator.geolocation.getCurrentPosition((pos2) => {
          console.log('[GEO] fallback getCurrentPosition success:', pos2.coords);
          // reusar la misma lógica de update
          const lat = pos2.coords.latitude;
          const lng = pos2.coords.longitude;
          coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          if (!marker) marker = L.marker([lat, lng]).addTo(map).bindPopup('Tu ubicación');
          else marker.setLatLng([lat, lng]);
          socket.emit('driverLocation', { lat, lng, timestamp: pos2.timestamp || Date.now(), routeId, driverId: (driver && driver.id) ? driver.id : null });
        }, (err2) => {
          console.warn('[GEO] fallback getCurrentPosition error:', err2);
        }, { enableHighAccuracy: true, timeout: 10000 });
      } catch (e) {
        console.error('[GEO] fallback getCurrentPosition threw:', e);
      }
    }, options);

    // Si después de X segundos no hay callback, empezamos un polling cada 5s (fallback adicional)
    setTimeout(() => {
      if (watchId === null) return; // no hacer nada si watch no iniciado
      // si no hemos recibido N logs, hacemos polling
      const noMovement = false; // (podrías implementar contador si quieres)
      // iniciar polling solo si watch parece no entregar posiciones (esto es opcional)
      // aquí no iniciamos por defecto, lo dejo comentado como opción:
      // startPollingFallback();
    }, 5000);

    // exposicion global para debugging
    window.__geoWatchId = watchId;
    console.log('[GEO] watchPosition iniciado con id', watchId);

  } catch (e) {
    console.error('[GEO] excepción al iniciar watchPosition:', e);
  }
}

  // Crear la línea de progreso (color de la ruta si existe)
  function createProgressLine() {
    if (progressLine) return;
    const color = (route.color && typeof route.color === 'string') ? route.color : '#f357a1';
    progressLine = L.polyline([], { color, weight: 6 }).addTo(map);
  }

  // Función que calcula el índice más cercano de routeCoords y actualiza la línea de progreso
  function updateProgressLine(currentLatLng) {
    // currentLatLng: [lat, lng]
    let maxIndex = -1;
    for (let i = 0; i < routeCoords.length; i++) {
      const pt = routeCoords[i];
      const dist = map.distance(currentLatLng, pt); // en metros
      if (dist <= TOLERANCE) {
        maxIndex = i;
      } else {
        // También tomamos el punto más cercano aunque exceda TOLERANCE (para seguir progreso)
        // si no encontramos ninguno dentro de la tolerancia, podemos elegir el punto más cercano:
        // (sin romper el primer hallazgo dentro de la tolerancia)
      }
    }

    // Si no encontramos un punto dentro de la tolerancia, intentar localizar el índice del punto más cercano
    if (maxIndex < 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < routeCoords.length; i++) {
        const d = map.distance(currentLatLng, routeCoords[i]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      // Solo avanzar el progreso si estamos relativamente cerca (por ejemplo <200m) - evita saltos raros
      if (bestDist < 200) {
        maxIndex = bestIdx;
      }
    }

    if (maxIndex >= 0) {
      const coloredCoords = routeCoords.slice(0, maxIndex + 1);
      progressLine.setLatLngs(coloredCoords);
    } else {
      // si no hay un índice válido, opcionalmente añadir la posición actual para visualizar movimiento
      const existing = progressLine.getLatLngs();
      const last = existing.length ? existing[existing.length - 1] : null;
      const cur = L.latLng(currentLatLng[0], currentLatLng[1]);
      if (!last || last.distanceTo(cur) > 5) { // pequeño umbral para evitar ruido
        const next = existing.concat([cur]);
        progressLine.setLatLngs(next);
      }
    }
  }

  // Llamar al endpoint de login de chofer si driver existe y tiene id
  if (driver && driver.id) {
    try {
      const res = await fetch(`/api/drivers/${encodeURIComponent(driver.id)}/login`, { method: 'POST' });
      if (res.ok) {
        // Notificar UI
        statusEl.textContent = 'Listo (activo)';
        statusEl.className = 'status ok';
        showToast('Estado: activo — listo');

        // En cuanto marcamos activo, comenzamos a tomar la ubicación
        startGeolocation();
      } else {
        // Si el backend devolvió error, mostrar mensaje y aún así iniciar geolocalización si quieres
        console.warn('Login driver devolvió error', await res.text());
        statusEl.textContent = 'Error al activar';
        statusEl.className = 'status bad';
        // Aun así iniciamos geolocalización para que el chofer pueda enviar ubicación incluso si no está registrado
        startGeolocation();
      }
    } catch (e) {
      console.warn('No se pudo marcar login del driver:', e);
      // iniciar ubicación igualmente
      startGeolocation();
    }
  } else {
    // No hay driver asignado; permitimos que la app también registre ubicación (guest)
    statusEl.textContent = 'Sin chofer asignado';
    statusEl.className = 'status bad';
    startGeolocation();
  }

  // Escuchar cambios de estado de la ruta desde el servidor
  socket.on('routeStatusChanged', (updated) => {
    try {
      // Tu servidor envía la ruta actualizada; validamos que sea la misma routeId
      const updatedId = updated.id || updated._id || updated.id;
      const estado = (updated.estado || updated.status || '').toLowerCase();

      if (!updatedId) return;
      // comparar con routeId — soportamos _id y id
      const same = (String(updatedId) === String(routeId) || String(updatedId) === String(route.id) || String(updatedId) === String(route._id));
      if (!same) return;

      // Si la ruta pasa a 'en curso' -> iniciar trazado
      if (estado === 'en curso') {
        tracingActive = true;
        createProgressLine();
        statusEl.textContent = 'En curso';
        statusEl.className = 'status ok';
        showToast('Ruta iniciada — trazado activo');

        // Si ya tenemos marker (posición actual), actualizar inmediatamente el progreso
        if (marker) updateProgressLine([marker.getLatLng().lat, marker.getLatLng().lng]);
      } else if (estado === 'finalizada' || estado === 'cancelada') {
        tracingActive = false;
        statusEl.textContent = (estado === 'finalizada') ? 'Finalizada' : 'Cancelada';
        statusEl.className = 'status done';
        showToast(`Ruta ${estado}`);

        // opcional: limpiar progressLine o dejarla como historial
        // if (progressLine) { progressLine.setLatLngs([]); }
      } else if (estado === 'pendiente') {
        tracingActive = false;
        statusEl.textContent = 'Pendiente';
        statusEl.className = 'status bad';
      }
    } catch (e) {
      console.error('Error manejando routeStatusChanged', e);
    }
  });

  // Botón "Solicitar inicio" (solo UI, puedes mapearlo a una petición real si quieres)
  btnRequest.addEventListener('click', async () => {
    btnRequest.disabled = true;
    btnText.textContent = 'Solicado';
    showToast('Solicitud enviada al despachador');
    statusEl.textContent = 'Solicitud enviada';
    statusEl.className = 'status pending';

    // Ejemplo: pedir al servidor iniciar la ruta (opcional)
    // try {
    //   await fetch(`/api/routes/${routeId}/status`, {
    //     method: 'PATCH',
    //     headers: {'Content-Type':'application/json'},
    //     body: JSON.stringify({ estado: 'en curso' })
    //   });
    // } catch(e) { console.error(e) }
  });

  // Logout / limpiar (si tienes botón)
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      // detener geolocalización
      stopGeolocation();

      // marcar logout del chofer en backend si existe
      if (driver && driver.id) {
        await fetch(`/api/drivers/${encodeURIComponent(driver.id)}/logout`, { method: 'POST' }).catch(()=>{});
      }

      // desconectar socket
      socket.disconnect();

      // limpiar session y volver a login
      sessionStorage.removeItem('currentRoute');
      sessionStorage.removeItem('currentDriver');
      window.location.href = '/login.html';
    });
  }
     setTimeout(() => map.invalidateSize(), 300);
})();