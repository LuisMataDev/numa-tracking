// script.js (Versión Final y Completa)
globalThis.L = L;

let map;
let socket;
let routeLayers = {};
let driverMarkers = {}; // Usar un objeto global para los marcadores de los choferes
let activeRouteId = null;
const TOLERANCE = 15; // Un valor más realista para la tolerancia en metros
let lastKnownLocations = {};

// --- Variables Globales de Datos ---
let routes = [];
let vehicles = [];
let drivers = [];

async function initMap() {
    const defaultLat = 19.7677724;
    const defaultLng = -104.3686507;
    map = L.map('draw-map').setView([defaultLat, defaultLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const truckIcon = L.icon({
        iconUrl: '/html/img/logo.png',
        iconSize: [12, 12],
        iconAnchor: [19, 38],
        popupAnchor: [0, -40]
    });

    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                map.setView([position.coords.latitude, position.coords.longitude], 16);
                L.marker([position.coords.latitude, position.coords.longitude], { icon: truckIcon }).addTo(map).bindPopup('<b>📍 Tu ubicación actual</b>').openPopup();
                if (document.getElementById('status')) document.getElementById('status').textContent = 'Mostrando tu ubicación actual.';
            },
            (error) => console.warn(`Error de geolocalización (${error.code}): ${error.message}`)
        );
    }

    socket = io();

    document.addEventListener('DOMContentLoaded', () => {

    // 1. Encuentra el enlace para "Cerrar sesión"
    const logoutButton = document.querySelector('a[href="#sing-out"]');

    if (logoutButton) {
        // 2. Agrega un "escuchador" de clics
        logoutButton.addEventListener('click', async (event) => {
            // Previene que el navegador salte al hash #sing-out
            event.preventDefault(); 

            try {
                // 3. Envía la petición POST a tu API
                const response = await fetch('/api/admin/logout', {
                    method: 'POST'
                });

                if (response.ok) {
                    // 4. Si el servidor dice OK, redirige al login
                    console.log('Sesión cerrada exitosamente.');
                    // ¡IMPORTANTE! Cambia 'login.html' por la ruta real de tu login
                    window.location.href = 'login.html'; 
                } else {
                    // Maneja un posible error del servidor
                    alert('Error al intentar cerrar la sesión.');
                }
            } catch (error) {
                // Maneja errores de red
                console.error('Error de red:', error);
                alert('Error de red al intentar cerrar la sesión.');
            }
        });
    }
});

    // --- MANEJADORES DE EVENTOS DE SOCKET ---
    socket.on('locationUpdate', (data) => {
        if (!data || typeof data.lat === 'undefined' || typeof data.lng === 'undefined') return;
        const latNum = Number(data.lat), lngNum = Number(data.lng);
        if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return;
        const coordsLatLng = L.latLng(latNum, lngNum);
        const { routeId, driverId } = data;

        if (!driverMarkers[driverId]) {
            driverMarkers[driverId] = L.marker(coordsLatLng).addTo(map).bindPopup(`Chofer: ${driverId || '—'}`);
        } else {
            driverMarkers[driverId].setLatLng(coordsLatLng);
        }

        const routeInfo = routeId ? routeLayers[routeId] : null;
        if (routeInfo && routeInfo.progressLine && !routeInfo.route.isTraceFree) {
            const routeCoords = routeInfo.route.coords || [];
            let currentIndex = -1;
            // ... (el resto de tu lógica `for` para calcular el progreso no cambia) ...
            for (let i = 0; i < routeCoords.length; i++) {
                const pt = routeCoords[i];
                const ptLatLng = L.latLng(Number(pt[0]), Number(pt[1]));
                if (map.distance(coordsLatLng, ptLatLng) <= TOLERANCE) {
                    currentIndex = i;
                }
            }
            if (currentIndex > routeInfo.maxProgressIndex) {
                routeInfo.maxProgressIndex = currentIndex;
            }
            if (routeInfo.maxProgressIndex !== -1) {
                routeInfo.progressLine.setLatLngs(routeCoords.slice(0, routeInfo.maxProgressIndex + 1));
            }
        }

        if (driverId) {
            lastKnownLocations[driverId] = { lat: data.lat, lng: data.lng, timestamp: data.timestamp || Date.now() };
        }
    });

    socket.on('routeStatusChanged', updateAll);
    socket.on('driversUpdated', updateAll);
    socket.on('vehiclesUpdated', updateAll);

    // --- Lógica de Notificación CORREGIDA Y ROBUSTA ---
    socket.on('finishRouteRequested', ({ routeId, driverId, routeName }) => {
        const notificationContainer = document.getElementById('notification-container');
        const notificationText = document.getElementById('notification-text');
        let btnAccept = document.getElementById('btn-accept-finish');
        let btnDecline = document.getElementById('btn-decline-finish');

        const driver = drivers.find(d => d.id === driverId);
        const driverNameToDisplay = driver ? driver.name : (driverId || 'Desconocido');
        notificationText.innerHTML = `El chofer <strong>${driverNameToDisplay}</strong> ha solicitado finalizar la ruta "<strong>${routeName}</strong>". ¿Deseas aprobarlo?`;

        // <<--- CAMBIO CLAVE: Clonamos los botones para eliminar listeners viejos
        const newBtnAccept = btnAccept.cloneNode(true);
        btnAccept.parentNode.replaceChild(newBtnAccept, btnAccept);
        btnAccept = newBtnAccept;

        const newBtnDecline = btnDecline.cloneNode(true);
        btnDecline.parentNode.replaceChild(newBtnDecline, btnDecline);
        btnDecline = newBtnDecline;

        // Asignamos el evento al nuevo botón con la información correcta
        btnAccept.addEventListener('click', () => {
            socket.emit('resolveFinishRequest', { routeId, driverId, accepted: true });
            notificationContainer.style.display = 'none';
        });

        btnDecline.addEventListener('click', () => {
            socket.emit('resolveFinishRequest', { routeId, driverId, accepted: false });
            notificationContainer.style.display = 'none';
        });

        notificationContainer.style.display = 'block';
    });

    await updateAll();
}

async function fetchDrivers() {
    try {
        const res = await fetch('/api/drivers');
        if (!res.ok) throw new Error('Error al cargar choferes');
        drivers = await res.json();
    } catch (err) {
        console.error('Error al obtener la lista de choferes:', err);
        drivers = [];
    }
}

async function updateAll() {
    showKpiSkeletonLoader();
    console.log("Actualizando todos los datos...");
    await fetchDrivers();
    await updateKPIs();
    await fetchAndDrawRoutes();
}

function showKpiSkeletonLoader() {
    const kpiContainer = document.querySelector('.kpi-container');
    if (!kpiContainer) return;

    kpiContainer.innerHTML = ''; // Limpia el contenido actual

    for (let i = 0; i < 4; i++) { // Creamos 4 esqueletos
        const skeletonCard = document.createElement('div');
        skeletonCard.className = 'kpi-card skeleton-card'; // Usamos ambas clases
        skeletonCard.innerHTML = `
            <div class="skeleton-icon"></div>
            <div>
                <div class="skeleton-text value"></div>
                <div class="skeleton-text label"></div>
            </div>
        `;
        kpiContainer.appendChild(skeletonCard);
    }
}

async function updateKPIs() {
    try {
        const res = await fetch('/api/routes');
        const cho = await fetch('/api/drivers');
        if (!res.ok) throw new Error('Error al cargar rutas');
        const routesData = await res.json();
        const driversData = await cho.json();

        // --- INICIO DE LA MODIFICACIÓN ---
        // 1. Reconstruye el HTML de las tarjetas de KPIs
        const kpiContainer = document.querySelector('.kpi-container');
        if (kpiContainer) {
            kpiContainer.innerHTML = `
                <div class="kpi-card">
                    <i class="fa-solid fa-truck-moving"></i>
                    <div>
                        <span class="kpi-value" id="kpi-activos">0</span>
                        <span class="kpi-label">Rutas pendientes</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <i class="fa-solid fa-route"></i>
                    <div>
                        <span class="kpi-value" id="kpi-rutas">0</span>
                        <span class="kpi-label">Rutas en curso</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <i class="fa-solid fa-font-awesome"></i>
                    <div>
                        <span class="kpi-value" id="kpi-alertas">0</span>
                        <span class="kpi-label">Rutas finalizadas</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <i class="fa fa-users" aria-hidden="true"></i>
                    <div>
                        <span class="kpi-value" id="kpi-distancia">0</span>
                        <span class="kpi-label">Choferes activos</span>
                    </div>
                </div>
            `;
        }
        // --- FIN DE LA MODIFICACIÓN ---

        // 2. Calcula y actualiza los valores (esta parte es la misma que ya tenías)
        const pendingCount = routesData.filter(r => r.estado === 'pendiente').length;
        const inProgressCount = routesData.filter(r => r.estado === 'en curso').length;
        const completedCount = routesData.filter(r => r.estado === 'finalizada').length;
        const driversOnActive = driversData.filter(d => d.status === 'active-ocupado').length; // Corregido para usar `status` de driver

        document.getElementById('kpi-activos').textContent = pendingCount;
        document.getElementById('kpi-rutas').textContent = inProgressCount;
        document.getElementById('kpi-alertas').textContent = completedCount;
        document.getElementById('kpi-distancia').textContent = driversOnActive;

    } catch (err) {
        console.error('Error al actualizar KPIs:', err);
        // Opcional: Mostrar un mensaje de error en lugar de los KPIs
        const kpiContainer = document.querySelector('.kpi-container');
        if (kpiContainer) kpiContainer.innerHTML = '<p class="muted">No se pudieron cargar los indicadores.</p>';
    }
}

async function fetchAndDrawRoutes() {
    try {
        // Limpia las capas de rutas existentes del mapa
        for (const id in routeLayers) {
            if (routeLayers[id].layerGroup) {
                map.removeLayer(routeLayers[id].layerGroup);
            }
        }
        routeLayers = {};

        const res = await fetch('/api/routes');
        if (!res.ok) throw new Error('Error al cargar rutas');

        const allRoutes = await res.json();
        routes = allRoutes; // Actualiza el estado global de rutas

        const inProgressRoutes = allRoutes.filter(r => r.estado === 'en curso' && r.coords && r.coords.length > 0);

        if (inProgressRoutes.length === 0) {
            document.getElementById('status').textContent = 'No hay rutas en curso.';
            updateInfoPanel({});
            return;
        }

        document.getElementById('status').textContent = `Mostrando ${inProgressRoutes.length} rutas en curso.`;

        let bounds = new L.LatLngBounds();

        inProgressRoutes.forEach(route => {
            const layerGroup = new L.FeatureGroup().addTo(map); // Un grupo para todos los elementos de esta ruta
            const routeColor = route.color || '#f357a1';

            // --- CAMBIO CLAVE: Lógica de dibujo condicional ---
            if (route.isTraceFree) {
                // MODO SIN TRAZO: Dibuja solo inicio y fin
                const startPoint = route.coords[0];
                const endPoint = route.coords[route.coords.length - 1];

                L.marker(startPoint, {
                    icon: L.divIcon({ className: 'start-marker-icon', html: '<i class="fa-solid fa-location-dot" style="color:#2ecc71; font-size: 24px;"></i>' })
                }).addTo(layerGroup);

                L.marker(endPoint, {
                    icon: L.divIcon({ className: 'end-marker-icon', html: '<i class="fa-solid fa-flag-checkered" style="color:#d10000; font-size: 24px;"></i>' })
                }).addTo(layerGroup);

                // Guardamos la ruta sin líneas
                routeLayers[route.id] = { route, layerGroup, maxProgressIndex: -1 };

            } else {
                // MODO CON TRAZO: Dibuja la línea completa y la de progreso
                const greyLine = L.polyline(route.coords, { color: '#616142ff' }).addTo(layerGroup);
                const progressLine = L.polyline([], { color: routeColor, weight: 6 }).addTo(layerGroup);

                greyLine.on('click', () => {
                    activeRouteId = route.id;
                    updateInfoPanel(route);
                });

                // Guardamos la ruta con sus líneas
                routeLayers[route.id] = { route, layerGroup, greyLine, progressLine, maxProgressIndex: -1 };
            }

            bounds.extend(layerGroup.getBounds());
        });

        if (inProgressRoutes.length > 0 && bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }

    } catch (err) {
        console.error('Error al dibujar rutas en curso:', err);
        document.getElementById('status').textContent = 'Error al cargar las rutas en curso.';
    }
}

let vehiculoSeleccionado = null; 

// Suponemos que tienes una función que se ejecuta cuando se hace clic en un marcador de vehículo en el mapa
// Esta función DEBE actualizar la variable `vehiculoSeleccionado`.
// Por ejemplo:
function onVehiculoClick(vehiculoInfo) {
    console.log("Vehículo seleccionado:", vehiculoInfo);
    vehiculoSeleccionado = vehiculoInfo;
    
    // Opcional: Resalta el botón de servicios para indicar que se puede usar
    document.querySelector('.btn-services').style.border = '2px solid #3498db';
}

// Ejemplo de cómo la llamarías al crear un marcador en Leaflet:
// L.marker([lat, lng]).on('click', () => onVehiculoClick({ id: 'VW-01', lat: lat, lng: lng })).addTo(map);


// 2. Elementos del DOM
const btnServices = document.querySelector('.btn-services');
const servicesMenu = document.getElementById('services-menu');

// 3. Lógica para mostrar/ocultar el menú
btnServices.addEventListener('click', () => {
    if (!vehiculoSeleccionado) {
        alert("Por favor, selecciona primero un vehículo en el mapa.");
        return;
    }

    // Muestra u oculta el menú
    const isMenuVisible = servicesMenu.style.display === 'flex';
    servicesMenu.style.display = isMenuVisible ? 'none' : 'flex';
});

// 4. Lógica para manejar la selección de un servicio
servicesMenu.addEventListener('click', (event) => {
    // Usamos delegación de eventos para no añadir un listener a cada botón
    const targetButton = event.target.closest('.service-option');
    
    if (targetButton) {
        const servicio = targetButton.dataset.service;
        
        console.log(`Solicitando servicio de '${servicio}' para el vehículo '${vehiculoSeleccionado.id}'`);
        
        // Llama a la función que enviará los datos al servidor
        enviarSolicitudDeServicio(servicio, vehiculoSeleccionado);
        
        // Oculta el menú después de seleccionar una opción
        servicesMenu.style.display = 'none';
    }
});


// 5. Función que se comunica con el Back-End 📡
async function enviarSolicitudDeServicio(tipoServicio, vehiculo) {
    // Aquí es donde te comunicas con tu servidor
    console.log("Enviando al backend:", {
        idVehiculo: vehiculo.id,
        servicio: tipoServicio,
        ubicacion: {
            lat: vehiculo.lat,
            lng: vehiculo.lng
        }
    });

    // Ejemplo usando la API fetch para enviar los datos a tu servidor
    try {
        const response = await fetch('/api/solicitar-servicio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                idVehiculo: vehiculo.id,
                servicio: tipoServicio,
                ubicacion: {
                    lat: vehiculo.lat, // Asumiendo que guardas la última ubicación
                    lng: vehiculo.lng
                }
            })
        });

        if (response.ok) {
            const resultado = await response.json();
            alert(`Solicitud de ${tipoServicio} enviada con éxito. ID de ticket: ${resultado.ticketId}`);
        } else {
            alert("Error al enviar la solicitud.");
        }
    } catch (error) {
        console.error("Error de red:", error);
        alert("Error de conexión al enviar la solicitud.");
    }
}

function updateInfoPanel(route) {
    document.getElementById('route-name-display').textContent = route.name || 'Sin asignar';
    document.getElementById('route-id-display').textContent = route.id || 'Sin asignar';

    const routeTypeDisplay = document.createElement('p'); // Creamos un elemento para esto
    // Insertamos el tipo de ruta después del ID
    const routeIdEl = document.getElementById('route-id-display');
    if (routeIdEl.nextSibling) {
        routeIdEl.parentNode.insertBefore(routeTypeDisplay, routeIdEl.nextSibling);
    } else {
        routeIdEl.parentNode.appendChild(routeTypeDisplay);
    }

    let vehicle = { alias: 'Sin asignar', marca: '', id: '' };
    let driver = { name: 'Sin asignar', id: '' };
    if (route.driver) {
        if (typeof route.driver === 'object') {
            driver.id = route.driver.id || '';
            driver.name = route.driver.name || 'Sin asignar';
        } else if (typeof route.driver === 'string') {
            const driverResolved = (typeof drivers !== 'undefined' && Array.isArray(drivers)) ? drivers.find(d => d.id === route.driver) : null;
            if (driverResolved) { driver = driverResolved; }
            else { driver.id = route.driver; }
        }
    }
    if (route.vehicle && route.vehicle.id) {
        const fullVehicle = (typeof vehicles !== 'undefined' && Array.isArray(vehicles)) ? vehicles.find(v => v.id === route.vehicle.id) : null;
        if (fullVehicle) {
            vehicle = fullVehicle;
            if ((!route.driver || !route.driver.id) && fullVehicle.chofer) { driver = fullVehicle.chofer; }
        } else {
            vehicle.alias = route.vehicle.alias || 'Sin asignar';
            vehicle.marca = route.vehicle.marca || '';
            vehicle.id = route.vehicle.id;
        }
    }
    const choferNameEl = document.getElementById('chofer-name-display');
    const choferIdEl = document.getElementById('chofer-id-display');
    const vehiculoNameEl = document.getElementById('vehiculo-name-display');
    const vehiculoIdEl = document.getElementById('vehiculo-id-display');
    if (choferNameEl) choferNameEl.textContent = driver.name || 'Sin asignar';
    if (choferIdEl) choferIdEl.textContent = driver.id || '';
    if (vehiculoNameEl) vehiculoNameEl.textContent = vehicle.alias || vehicle.marca || 'Sin asignar';
    if (vehiculoIdEl) vehiculoIdEl.textContent = vehicle.id || '';
    const coordsDisplayEl = document.getElementById('coords-display');
    const coordsStatusEl = document.getElementById('coords-status-display');
    const lastLocation = lastKnownLocations[driver.id];
    if (lastLocation) {
        const timeString = new Date(lastLocation.timestamp).toLocaleTimeString();
        const lat = Number(lastLocation.lat).toFixed(6);
        const lng = Number(lastLocation.lng).toFixed(6);
        coordsDisplayEl.textContent = `${lat}, ${lng}`;
        coordsStatusEl.textContent = `Última actualización: ${timeString}`;
    } else {
        coordsDisplayEl.textContent = 'Sin datos';
        coordsStatusEl.textContent = 'Aún no hay actualizaciones';
    }
}

document.addEventListener('DOMContentLoaded', initMap);
