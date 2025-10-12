(function () {
    const socket = io();

    // --- Constantes ---
    const DEVIATION_TOLERANCE = 25;
    const MOVEMENT_THRESHOLD = 10;

    // --- Referencias al DOM ---
    const routeNameEl = document.getElementById('route-name');
    const driverNameEl = document.getElementById('driver-name');
    const routeStatusEl = document.getElementById('route-status');
    const topSubEl = document.getElementById('top-sub');
    const coordsEl = document.getElementById('coords');
    const btnCenter = document.getElementById('btn-center');
    const btnZoom = document.getElementById('btn-zoom');
    const btnFinishRoute = document.getElementById('btn-finish-route');
    const fab = document.getElementById('fab-mypos');
    const toast = document.getElementById('toast');

    // --- Estado de la App ---
    let currentRoute = null;
    let currentDriver = null;
    let map, driverMarker, routeLayers = {};
    let lastDrawnPosition = null;
    let watchId = null;
    const progressSegments = L.featureGroup();

    // --- Funciones ---
    function showToast(text, ms = 2000) {
        if (!toast) return;
        toast.textContent = text;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), ms);
    }

    function showFinalizationOverlay(message) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(26, 32, 44, 0.95)', color: 'white',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            alignItems: 'center', zIndex: '9999', textAlign: 'center',
            fontFamily: 'system-ui, sans-serif', transition: 'opacity 0.5s ease'
        });
        overlay.innerHTML = `
            <img src="/img/logo.png" alt="Bandera de finalización" style="width: 96px; height: 96px; margin-bottom: 20px;">
            <h2 style="margin: 0; padding: 0 20px; font-size: 24px;">${message}</h2>
            <p style="margin-top: 10px; font-size: 16px; opacity: 0.8;">Serás redirigido en unos segundos...</p>`;
        document.body.appendChild(overlay);
    }

    function updateStatusUI(newStatus) {
        if (!newStatus) return;
        const statusText = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
        if (routeStatusEl) {
            routeStatusEl.textContent = statusText;
            routeStatusEl.className = 'status';
            if (newStatus === 'en curso') routeStatusEl.classList.add('good');
            else if (newStatus === 'pendiente') routeStatusEl.classList.add('bad');
            else routeStatusEl.classList.add('neutral');
        }
        if (topSubEl) topSubEl.textContent = statusText;
        if (btnFinishRoute) btnFinishRoute.disabled = (newStatus !== 'en curso');
    }

    // --- Inicialización ---
    try {
        currentRoute = JSON.parse(sessionStorage.getItem('currentRoute'));
        if (currentRoute && !currentRoute.id && currentRoute._id) {
            currentRoute.id = currentRoute._id;
        }
        currentDriver = JSON.parse(sessionStorage.getItem('currentDriver'));
    } catch (e) { /* Fallo silencioso */ }

    if (!currentRoute) {
        showToast('No hay ruta en sesión.', 3000);
        setTimeout(() => { window.location.href = 'mobile-login.html'; }, 1200);
        return;
    }

    if (routeNameEl) routeNameEl.textContent = currentRoute.name || '—';
    if (driverNameEl) driverNameEl.textContent = (currentDriver && currentDriver.name) || '—';
    updateStatusUI(currentRoute.estado);

    function initMap() {
        if (!currentRoute.coords || currentRoute.coords.length === 0) return;
        map = L.map('map').setView(currentRoute.coords[0], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        routeLayers.greyLine = L.polyline(currentRoute.coords, { color: '#5f5959ff', weight: 5, opacity: 0.8 }).addTo(map);
        progressSegments.addTo(map);
        map.fitBounds(routeLayers.greyLine.getBounds(), { padding: [50, 50] });
    }

    // --- Lógica de Sockets ---
    socket.on('connect', () => {
        showToast('Conectado al servidor');
        socket.emit('joinRoute', { routeId: currentRoute.id, driverId: currentDriver ? currentDriver.id : null });
    });

    // <<--- CAMBIO CLAVE: Aquí detectamos la finalización ---
    socket.on('routeStatusChanged', (payload) => {
        if (!payload || !currentRoute) return;

        const serverRouteId = String(payload.id || payload._id);
        const clientRouteId = String(currentRoute.id || currentRoute._id);

        if (serverRouteId === clientRouteId) {
            currentRoute = payload;
            updateStatusUI(payload.estado);
            showToast(`Estado actualizado a: ${payload.estado}`);

            // Si el nuevo estado es 'finalizada', activamos el cierre.
            if (payload.estado === 'finalizada') {
                if (watchId && navigator.geolocation) {
                    navigator.geolocation.clearWatch(watchId);
                    watchId = null;
                    console.log("Rastreo GPS detenido por finalización de ruta.");
                }
                showFinalizationOverlay('Ruta Finalizada');
                setTimeout(() => {
                    sessionStorage.clear();
                    window.location.href = 'mobile-login.html';
                }, 3500);
            }
        }
    });

    function startTracking() {
        if (!('geolocation' in navigator)) { return; }
        watchId = navigator.geolocation.watchPosition((pos) => {
            const { latitude: lat, longitude: lng, accuracy } = pos.coords;
            const currentPosition = [lat, lng];

            if (coordsEl) coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} (±${Math.round(accuracy)} m)`;
            if (map) {
                if (!driverMarker) driverMarker = L.marker(currentPosition).addTo(map);
                else driverMarker.setLatLng(currentPosition);
            }

            let minDistance = Infinity;
            if (map && currentRoute.coords) {
                currentRoute.coords.forEach(point => {
                    const distance = map.distance(currentPosition, point);
                    if (distance < minDistance) minDistance = distance;
                });
            }
            const isOffRoute = minDistance > DEVIATION_TOLERANCE;

            socket.emit('driverLocation', {
                lat, lng, accuracy, isOffRoute,
                timestamp: pos.timestamp || Date.now(),
                driverId: currentDriver ? currentDriver.id : null,
                routeId: currentRoute.id,
            });

            if (!lastDrawnPosition) {
                lastDrawnPosition = currentPosition;
                return;
            }
            const distanceFromLastDrawn = map.distance(currentPosition, lastDrawnPosition);
            if (distanceFromLastDrawn < MOVEMENT_THRESHOLD) return;

            const segmentColor = isOffRoute ? '#e74c3c' : (currentRoute.color || '#f357a1');
            L.polyline([lastDrawnPosition, currentPosition], { color: segmentColor, weight: 7 }).addTo(progressSegments);
            lastDrawnPosition = currentPosition;
        }, (err) => showToast('Error de GPS: ' + err.message, 1800), { enableHighAccuracy: true });
    }

    if (btnCenter) btnCenter.addEventListener('click', () => driverMarker && map.panTo(driverMarker.getLatLng()));
    if (btnZoom) btnZoom.addEventListener('click', () => routeLayers.greyLine && map.fitBounds(routeLayers.greyLine.getBounds(), { padding: [50, 50] }));
    if (fab) fab.addEventListener('click', () => driverMarker && map.panTo(driverMarker.getLatLng()));
    if (btnFinishRoute) {
        btnFinishRoute.addEventListener('click', () => {
            if (confirm('¿Estás seguro de que quieres solicitar la finalización de esta ruta?')) {
                socket.emit('requestFinishRoute', {
                    routeId: currentRoute.id,
                    driverId: currentDriver ? currentDriver.id : null,
                    routeName: currentRoute.name
                });
                showToast('Solicitud enviada al administrador.');
                btnFinishRoute.disabled = false;
            }
        });
    }

    initMap();
    startTracking();
})();
