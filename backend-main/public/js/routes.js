
globalThis.L = L;

document.addEventListener('DOMContentLoaded', async () => {

    const socketIoScript = document.createElement('script');
    socketIoScript.src = '/socket.io/socket.io.js';
    document.head.appendChild(socketIoScript);


    await new Promise(resolve => {
        socketIoScript.onload = () => resolve();
    });

    document.getElementById('route-color').addEventListener('input', (e) => {
        if (drawing && tempPolyline) {
            tempPolyline.setStyle({
                color: e.target.value
            });
        }
    });

    // Referencias
    const btnStartDraw = document.getElementById('btn-start-draw');
    const btnStopDraw = document.getElementById('btn-stop-draw');
    const btnUndoPoint = document.getElementById('btn-undo-point');
    const btnAddFinalPoint = document.getElementById('btn-add-final-point');
    const panel = document.getElementById('new-route-panel');
    const btnClose = document.getElementById('close-panel');
    const formNewRoute = document.getElementById('form-new-route');
    const routeItems = document.getElementById('route-items');
    const routeDetail = document.getElementById('route-detail');
    const panelTitle = document.getElementById('panel-title');
    const submitButton = document.getElementById('submit-route');
    const routeVehicleSelect = document.getElementById('route-vehicle');
    const routeDriverSelect = document.getElementById('route-driver');
    const searchInput = document.getElementById('search-route');
    let isFinalPointSet = false;
    const traceFreeSwitch = document.getElementById('trace-free-switch');
    const drawHelperText = document.getElementById('draw-helper-text');

    const btnToggleFilters = document.getElementById('btn-toggle-filters');
    const filterPopup = document.getElementById('filter-popup');
    const statusFilter = document.getElementById('status-filter');
    const vehicleFilter = document.getElementById('vehicle-filter');
    const driverFilter = document.getElementById('driver-filter');
    const btnResetFilters = document.getElementById('btn-reset-filters');

    let isTraceFreeMode = false;

    const defaultCoords = [19.7677724, -104.3686507]; // Ubicación por si las moscas

     document.addEventListener('DOMContentLoaded', () => {

    // 1. Encuentra el enlace para "Cerrar sesión"
    const logoutButton = document.querySelector('a[href="#sing-out"]');

    if (logoutButton) {
        // 2. Agrega un "escuchador" de clics
        logoutButton.addEventListener('click', async (event) => {
            // Previene que el navegador salte al hash #sing-out
            event.preventDefault();

            // --- INICIO DEL CAMBIO ---
            // 3. Muestra la confirmación nativa
            const wantsToLogout = window.confirm("¿Estás seguro de que deseas cerrar la sesión?");

            // 4. Solo continúa si el usuario hizo clic en "Aceptar"
            if (wantsToLogout) {
                try {
                    // 5. Envía la petición POST a tu API
                    const response = await fetch('/api/admin/logout', {
                        method: 'POST'
                    });

                    if (response.ok) {
                        // 6. Si el servidor dice OK, redirige al login
                        console.log('Sesión cerrada exitosamente.');
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
            }
            // Si el usuario presiona "Cancelar", no se hace nada.
            // --- FIN DEL CAMBIO ---
        });
    }
});

    btnToggleFilters.addEventListener('click', () => {
        filterPopup.classList.toggle('hidden');
    });

    // Opcional: Cerrar el popup si se hace clic fuera
    document.addEventListener('click', (e) => {
        if (!filterPopup.classList.contains('hidden') && !e.target.closest('.search-filter-container')) {
            filterPopup.classList.add('hidden');
        }
    });

    // --- AÑADIR LISTENERS A LOS NUEVOS FILTROS ---
    statusFilter.addEventListener('change', filterAndRenderRoutes);
    vehicleFilter.addEventListener('change', filterAndRenderRoutes);
    driverFilter.addEventListener('change', filterAndRenderRoutes);
    btnResetFilters.addEventListener('click', () => {
        statusFilter.value = 'pendiente';
        vehicleFilter.value = '';
        driverFilter.value = '';
        searchInput.value = '';
        filterAndRenderRoutes();
        filterPopup.classList.add('hidden');
    });

    // El listener del searchInput sigue igual
    searchInput.addEventListener('input', filterAndRenderRoutes);

    function populateStatusFilter() {
        const statuses = {
            '': 'Todos los estados',
            'pendiente': 'Pendiente',
            'lista para iniciar': 'Lista para Iniciar',
            'en curso': 'En Curso',
            'finalizada': 'Finalizada',
            'cancelada': 'Cancelada'
        };

        // Referencia al elemento select del panel de filtros
        const statusFilter = document.getElementById('status-filter');

        statusFilter.innerHTML = ''; // Limpiar opciones por si acaso
        for (const value in statuses) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = statuses[value];
            statusFilter.appendChild(option);
        }

        // --- CAMBIO CLAVE: Establecer "Pendiente" como valor por defecto ---
        statusFilter.value = 'pendiente';
    }

    function populateVehicleFilter() {
        vehicleFilter.innerHTML = '<option value="">-- Todos --</option>';
        vehicles.forEach(v => {
            const option = document.createElement('option');
            option.value = v.id;
            option.textContent = `${v.alias || v.marca} (${v.id})`;
            vehicleFilter.appendChild(option);
        });
    }

    function populateDriverFilter() {
        driverFilter.innerHTML = '<option value="">-- Todos --</option>';
        drivers.forEach(d => {
            const option = document.createElement('option');
            option.value = d.id;
            option.textContent = d.name;
            driverFilter.appendChild(option);
        });
    }

    // Inicializa el mapa con la vista por defecto. Se moverá si la geolocalización tiene éxito.
    const drawMap = L.map('draw-map').setView(defaultCoords, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(drawMap);


    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {

                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                const accuracy = position.coords.accuracy;

                drawMap.setView([userLat, userLng], 16); // Zoom

                // Dibuja el círculo de precisión
                L.circle([userLat, userLng], { radius: accuracy }).addTo(drawMap);


                L.marker([userLat, userLng])
                    .addTo(drawMap)
                    .bindPopup(`<b>Tu ubicación (precisión: ${Math.round(accuracy)}m)</b>`)
                    .openPopup();
            },
            (error) => {

                console.warn(`Error de geolocalización (${error.code}): ${error.message}`);

            },
            { enableHighAccuracy: true }
        );
    } else {
        console.error('Geolocalización no disponible en este navegador.');
    }

    const drawnItems = new L.FeatureGroup().addTo(drawMap);
    let tempCoords = [];
    let tempPolyline = null;
    let drawing = false;

    // Estado local de datos
    let routes = [];
    let vehicles = [];
    let drivers = [];
    const driverStatusInfo = {
        'active-desocupado': { text: 'Disponible', color: '#2ecc71' },
        'active-ocupado': { text: 'En Ruta', color: '#f39c12' },
        'inactive': { text: 'Inactivo', color: '#95a5a6' }
    };
    const defaultStatusInfo = { text: 'Desconocido', color: '#34495e' };
    // Funciones del mapa
    function addPoint(e) {
        if (!drawing) return;
        const { lat, lng } = e.latlng;

        if (isTraceFreeMode) {
            // --- Lógica para MODO SIN TRAZO ---
            if (tempCoords.length >= 2) {
                alert('Ya has establecido un punto de inicio y fin.');
                return;
            }

            tempCoords.push([lat, lng]);

            if (tempCoords.length === 1) {
                // Es el punto de INICIO
                L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'start-marker-icon',
                        html: '<i class="fa-solid fa-location-dot" style="color:#2ecc71; font-size: 24px;"></i>'
                    })
                }).addTo(drawnItems);
                drawHelperText.textContent = '¡Excelente! Ahora haz clic para marcar el punto final.';

            } else if (tempCoords.length === 2) {
                // Es el punto FINAL
                L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'end-marker-icon',
                        html: '<i class="fa-solid fa-flag-checkered" style="color:#d10000; font-size: 24px;"></i>'
                    })
                }).addTo(drawnItems);

                // Opcional: Dibuja una línea punteada para conectar los puntos en el panel
                L.polyline(tempCoords, { color: '#6c8cff', weight: 4, dashArray: '10, 10' }).addTo(drawnItems);

                drawHelperText.textContent = 'Puntos de inicio y fin establecidos.';
                disableDrawing(); // Detiene el dibujo automáticamente
            }

        } else {
            // --- Lógica ORIGINAL para trazar la ruta ---
            tempCoords.push([lat, lng]);
            L.circleMarker([lat, lng], {
                radius: 6,
                color: document.getElementById('route-color').value
            }).addTo(drawnItems);

            if (tempPolyline) {
                tempPolyline.setLatLngs(tempCoords);
            }

            btnUndoPoint.disabled = false;
            btnAddFinalPoint.disabled = false;
        }
    }

    function removeLastPoint() {
        if (tempCoords.length === 0) return;
        isFinalPointSet = false;
        tempCoords.pop();
        drawnItems.clearLayers();


        tempPolyline = L.polyline(tempCoords, {
            color: document.getElementById('route-color').value,
            weight: 5
        }).addTo(drawnItems);


        tempCoords.forEach(coord => {
            L.circleMarker(coord, {
                radius: 6,
                color: document.getElementById('route-color').value
            }).addTo(drawnItems);
        });

        if (tempCoords.length === 0) {
            btnUndoPoint.disabled = true;
            btnAddFinalPoint.disabled = true;
        }
    }

    function addFinalPoint() {
        if (tempCoords.length === 0) return;
        disableDrawing();
        const lastCoord = tempCoords[tempCoords.length - 1];
        L.marker(lastCoord, {
            icon: L.divIcon({
                className: 'end-marker-icon',
                html: '<i class="fa-solid fa-flag-checkered" style="color:#d10000; font-size: 24px;"></i>'
            })
        }).addTo(drawnItems);

        isFinalPointSet = true; // <-- AÑADE ESTA LÍNEA
    }
    function updateDrawUI() {
        if (isTraceFreeMode) {
            btnStartDraw.innerHTML = '<i class="fa-solid fa-map-pin"></i> Colocar Puntos';

            // --- INICIO DE CORRECCIÓN ---
            if (drawHelperText) {
                drawHelperText.textContent = 'Haz clic en el mapa para marcar el inicio y luego el fin de la ruta.';
            }
            // --- FIN DE CORRECCIÓN ---

            // En modo sin trazo, estos botones no tienen sentido
            btnUndoPoint.style.display = 'none';
            btnAddFinalPoint.style.display = 'none';
            btnStopDraw.style.display = 'none';
        } else {
            btnStartDraw.innerHTML = '📍';
            btnStartDraw.title = 'Iniciar trazo';

            // --- INICIO DE CORRECCIÓN ---
            if (drawHelperText) {
                drawHelperText.textContent = 'Haz clic en "Iniciar trazo" y luego en el mapa para añadir puntos.';

            }
            // --- FIN DE CORRECCIÓN ---

            // Mostramos los botones de nuevo
            btnUndoPoint.style.display = 'inline-block';
            btnAddFinalPoint.style.display = 'inline-block';
            btnStopDraw.style.display = 'inline-block';
        }
    }

    function enableDrawing() {
        drawing = true;
        btnStartDraw.disabled = true;
        btnStopDraw.disabled = false;
        drawMap.on('click', addPoint);
        drawnItems.clearLayers();
        tempCoords = [];
        isFinalPointSet = false;


        tempPolyline = L.polyline([], {
            color: document.getElementById('route-color').value,
            weight: 5
        }).addTo(drawnItems);
    }

    function disableDrawing() {
        drawing = false;
        btnStartDraw.disabled = false;
        btnStopDraw.disabled = true;
        drawMap.off('click', addPoint);
    }


    btnStartDraw.addEventListener('click', enableDrawing);
    btnStopDraw.addEventListener('click', disableDrawing);
    btnUndoPoint.addEventListener('click', removeLastPoint);
    btnAddFinalPoint.addEventListener('click', addFinalPoint);
    disableDrawing();


    function rgbArrayToHex(arr) {
        if (!Array.isArray(arr) || arr.length < 3) return null;
        const [r, g, b] = arr.map(n => Math.max(0, Math.min(255, Number(n) || 0)));
        const hex = (v) => v.toString(16).padStart(2, '0');
        return `#${hex(r)}${hex(g)}${hex(b)}`;
    }

    // Normalizar ruta recibida desde API/BD a nuestro formato de cliente
    function normalizeRoute(raw) {
        const id = raw._id ? raw._id.toString() : raw.id;
        const name = raw.name || raw.nombre || 'Sin nombre';

        // normalizar color (acepta '#rrggbb' o [r,g,b])
        let color = raw.color || '#f357a1';
        if (Array.isArray(color)) {
            const hex = rgbArrayToHex(color);
            if (hex) color = hex;
        }
        const coords = Array.isArray(raw.coords) && raw.coords.length ? raw.coords : null;
        const puntos = raw.puntos || (coords ? coords.length : 0);
        const estado = raw.estado || 'pendiente';
        const vehicle = raw.vehicle || null;
        const driver = raw.driver || raw.chofer || null;
        const password = raw.password || raw.pass || null;
        const isTraceFree = raw.isTraceFree || false;
        const createdAt = raw.createdAt || new Date().toISOString(); // Añade la fecha de creación

        return {
            id, name, color, coords, puntos, estado, vehicle, driver, password, isTraceFree,
            createdAt
        };
    }



    // Añadir item a la lista de rutas
    function addListItem(route) {
        const li = document.createElement('li');
        li.className = 'route-item';
        li.dataset.id = route.id;

        const traceFreeIcon = route.isTraceFree
            ? `<i class="fa fa-flag" aria-hidden="true" title="Ruta sin trazo" style="margin-left: 8px; color: ${route.color}; font-size: 0.9em;"></i>`
            : '';

        const statusStyle = route.estado === 'lista para iniciar' ? 'style="color: #3498db"' : '';

        // --- 1. FORMATEAR LA HORA ---
        let formattedTime = '';
        if (route.createdAt) {
            const createdAt = new Date(route.createdAt);
            // Formato: "9 nov, 17:09" (Ajusta 'es-MX' a tu zona si es necesario)
            formattedTime = createdAt.toLocaleString('es-MX', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        // --- 2. HTML ACTUALIZADO CON FLEXBOX ---
        // Usamos flexbox para alinear la hora a la derecha
        li.innerHTML = `
        <div class="route-li-content" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div class="route-info-left">
            <div class="route-title">${route.name} ${traceFreeIcon}</div>
            <div class="route-meta">
            <span class="route-state" ${statusStyle}>
            ${route.estado}
            </span>
            <span class="route-points">${route.puntos ?? 0} pts</span>
            <span class="route-color" title="${route.color}" style="
            display:inline-block;
            width:12px;height:12px;border-radius:3px;
            background:${route.color};margin-left:8px;vertical-align:middle;"></span>
            </div>
            </div>

            <div class="route-time" style="font-size: 0.85em; color: #555; white-space: nowrap; margin-left: 10px;">
            ${formattedTime}
            </div>

        </div>`;
        routeItems.appendChild(li);
        li.addEventListener('click', () => showRouteDetail(route.id));
    }

    // Cargar rutas, vehículos y choferes desde la API
    async function fetchData() {
        showSkeletonLoader(); // <-- AÑADE ESTA LÍNEA AQUÍ
        try {
            const [routesRes, vehiclesRes, driversRes] = await Promise.all([
                fetch('/api/routes'),
                fetch('/api/vehicles'),
                fetch('/api/drivers') // --- nueva petición
            ]);

            if (!routesRes.ok) throw new Error('Error al cargar rutas');
            if (!vehiclesRes.ok) throw new Error('Error al cargar vehículos');
            if (!driversRes.ok) throw new Error('Error al cargar choferes');

            const rawRoutes = await routesRes.json();
            const rawVehicles = await vehiclesRes.json();
            const rawDrivers = await driversRes.json();

            routes = (Array.isArray(rawRoutes) ? rawRoutes : rawRoutes.routes || []).map(normalizeRoute);
            vehicles = rawVehicles;
            drivers = rawDrivers; // --- guardar choferes

            filterAndRenderRoutes('');
            renderVehicleOptions();
            renderDriverOptions(); // --- poblar select de 

            // --- LLAMAR A LAS FUNCIONES DE POBLADO ---
            populateStatusFilter();
            populateVehicleFilter();
            populateDriverFilter();
            filterAndRenderRoutes();

        } catch (err) {
            console.error('fetchData:', err);
            routeItems.innerHTML = '<li class="empty">No se pudieron cargar los datos.</li>';
        }
    }

    /**
 * Muestra un loader de tipo "skeleton" en la lista de rutas.
 * @param {number} count - El número de elementos skeleton a mostrar.
 */
    function showSkeletonLoader(count = 6) {
        routeItems.innerHTML = ''; // Limpia la lista actual
        for (let i = 0; i < count; i++) {
            const li = document.createElement('li');
            li.className = 'skeleton-item';
            li.innerHTML = `
            <div class="skeleton-content">
                <div class="skeleton-info">
                    <div class="skeleton-text title"></div>
                    <div class="skeleton-text meta"></div>
                </div>
                <div class="skeleton-color-box"></div>
            </div>
        `;
            routeItems.appendChild(li);
        }
    }
    /**
     * Filtra las rutas basándose en una consulta y las renderiza en el panel.
     */
    function filterAndRenderRoutes() {
        routeItems.innerHTML = '';

        // 1. Obtener los valores de todos los filtros activos
        const query = searchInput.value.toLowerCase();
        const selectedStatus = document.getElementById('status-filter').value;
        const selectedVehicleId = document.getElementById('vehicle-filter').value;
        const selectedDriverId = document.getElementById('driver-filter').value;

        const filteredRoutes = routes.filter(route => {
            // 2. Comprobar cada filtro de tipo <select>
            // La ruta debe coincidir con todos los filtros seleccionados.
            // Si un filtro está vacío ("-- Todos --"), se considera una coincidencia.
            const statusMatch = !selectedStatus || route.estado === selectedStatus;
            const vehicleMatch = !selectedVehicleId || (route.vehicle && route.vehicle.id === selectedVehicleId);
            const driverMatch = !selectedDriverId || (route.driver && route.driver.id === selectedDriverId);

            // Si no cumple con alguno de los filtros de selección, la descartamos inmediatamente.
            if (!statusMatch || !vehicleMatch || !driverMatch) {
                return false;
            }

            // 3. Si pasó los filtros de selección, ahora comprobamos el filtro de texto.
            // Si no hay texto en la barra de búsqueda, la ruta es válida.
            if (query === '') {
                return true;
            }

            // Si hay texto, aplicamos la misma lógica de búsqueda que ya tenías.
            const vehicleInfo = route.vehicle && vehicles.find(v => v.id === route.vehicle.id);
            const vehicleAlias = vehicleInfo ? (vehicleInfo.alias || vehicleInfo.marca || '').toLowerCase() : '';
            const driverName = route.driver ? (route.driver.name || '').toLowerCase() : '';

            return (
                (route.name && route.name.toLowerCase().includes(query)) ||
                (route.id && route.id.toLowerCase().includes(query)) ||
                (route.estado && route.estado.toLowerCase().includes(query)) ||
                (vehicleAlias.includes(query)) ||
                (driverName.includes(query))
            );
        });

        // 4. Renderizar el resultado
        if (filteredRoutes.length === 0) {
            // Mensaje actualizado para reflejar los nuevos filtros
            routeItems.innerHTML = '<li class="empty">No se encontraron rutas con los filtros aplicados.</li>';
        } else {
            filteredRoutes.forEach(addListItem);
        }
    }

    function renderVehicleOptions() {
        routeVehicleSelect.innerHTML = '<option value="">-- Sin asignar --</option>';
        vehicles.forEach(v => {
            const option = document.createElement('option');
            option.value = v.id;
            option.textContent = `${v.alias || v.marca + ' ' + v.modelo} (${v.id})`;
            routeVehicleSelect.appendChild(option);
        });
    }

    // --- renderizar opciones de choferes para el formulario de ruta
    function renderDriverOptions() {
        if (!routeDriverSelect) return;
        const selectedValue = routeDriverSelect.value; // Guarda el valor seleccionado actualmente
        routeDriverSelect.innerHTML = '<option value="">-- Sin asignar --</option>';

        drivers.forEach(d => {
            const status = d.status || 'inactive';
            const { text, color } = driverStatusInfo[status] || defaultStatusInfo;

            const option = document.createElement('option');
            option.value = d.id;
            option.textContent = `${d.name}`;


            // --- LÍNEA CORREGIDA ---
            // Ahora solo se deshabilita si el chofer está 'En Ruta' (ocupado).
            // Los choferes 'Inactivos' y 'Disponibles' se podrán seleccionar.
            if (status === 'active-ocupado') {
                option.disabled = false;
            }

            routeDriverSelect.appendChild(option);
        });

        // Esta lógica sigue siendo importante para cuando editas una ruta
        // y el chofer asignado está (correctamente) ocupado con esa misma ruta.
        if (selectedValue) {
            const selectedOption = routeDriverSelect.querySelector(`option[value="${selectedValue}"]`);
            if (selectedOption) {
                selectedOption.disabled = false; // Asegura que el chofer asignado sea visible
                routeDriverSelect.value = selectedValue; // Restaura la selección
            }
        }


        // Si había un chofer seleccionado (al editar), y ese chofer ahora está ocupado,
        // lo habilitamos temporalmente para que se pueda mostrar que está asignado.
        if (selectedValue) {
            const selectedOption = routeDriverSelect.querySelector(`option[value="${selectedValue}"]`);
            if (selectedOption) {
                selectedOption.disabled = false; // Asegura que el chofer asignado sea visible
                routeDriverSelect.value = selectedValue; // Restaura la selección
            }
        }
    }
    // Nueva ruta -> abrir panel
    const btnNewRoute = document.getElementById('btn-new-route');
    btnNewRoute.addEventListener('click', () => {
        panelTitle.textContent = 'Nueva ruta';
        submitButton.textContent = 'Crear ruta';
        document.getElementById('route-id').value = '';
        formNewRoute.reset();
        tempCoords = [];
        drawnItems.clearLayers();
        disableDrawing();
        panel.classList.add('open');
    });
    btnClose.addEventListener('click', () => panel.classList.remove('open'));

    // Enviar formulario: POST o PUT (AHORA incluye driver)
    formNewRoute.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('route-id').value;
        const name = document.getElementById('route-name').value.trim();
        const color = document.getElementById('route-color').value;
        const vehicleId = routeVehicleSelect.value;
        const vehicle = vehicleId ? vehicles.find(v => v.id === vehicleId) : null;
        const driverId = routeDriverSelect ? routeDriverSelect.value : '';
        const driver = driverId ? drivers.find(d => d.id === driverId) : null;

        if (!name) return alert('Pon un nombre a la ruta.');
        if (isTraceFreeMode) {
            if (tempCoords.length !== 2) {
                return alert('Para una ruta sin trazo, debes establecer exactamente un punto de inicio y uno de fin.');
            }
        } else {
            if (tempCoords.length < 2) return alert('La ruta debe tener al menos dos puntos.');
            if (!isFinalPointSet) {
                return alert('Es necesario indicar un punto final con el icono de la bandera.');
            }
        }
        // --- FIN DE LA VALIDACIÓN ---

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/routes/${id}` : '/api/routes';

        const bodyPayload = {
            name,
            color,
            coords: tempCoords,
            vehicle: vehicle ? { id: vehicle.id, alias: vehicle.alias, marca: vehicle.marca } : null,
            driver: driver ? { id: driver.id, name: driver.name } : null,
            isTraceFree: document.getElementById('trace-free-switch').checked
        };

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Error' }));
                throw new Error(err.error || 'Error al guardar ruta');
            }

            await fetchData();
            panel.classList.remove('open');
        } catch (err) {
            console.error(err);
            alert('No se pudo guardar la ruta. Revisa la consola.');
        }
    });

    traceFreeSwitch.addEventListener('change', (e) => {
        isTraceFreeMode = e.target.checked;

        // Reinicia el estado de dibujo para evitar confusiones
        tempCoords = [];
        drawnItems.clearLayers();
        disableDrawing();
        isFinalPointSet = false;

        updateDrawUI(); // Actualiza la interfaz
    });

    // Modifica el listener del botón "Nueva Ruta"
    btnNewRoute.addEventListener('click', () => {
        panelTitle.textContent = 'Nueva ruta';
        submitButton.textContent = 'Crear ruta';
        document.getElementById('route-id').value = '';
        formNewRoute.reset();

        // --- Reinicio del estado del switch ---
        traceFreeSwitch.checked = false;
        isTraceFreeMode = false;
        updateDrawUI();
        // ------------------------------------

        tempCoords = [];
        drawnItems.clearLayers();
        disableDrawing();
        panel.classList.add('open');
    });

    // Mostrar detalle
    async function showRouteDetail(id) {
        // 1. Resalta el elemento activo en la lista
        document.querySelectorAll('#route-items li')
            .forEach(li => li.classList.toggle('active', li.dataset.id === id));

        let route = routes.find(r => r.id === id);
        if (!route) return;

        // 2. Si faltan detalles (coordenadas), búscalos en el servidor
        if (!route.coords) {
            try {
                const res = await fetch(`/api/routes/${id}`);
                if (res.ok) {
                    const fullRouteData = await res.json();
                    const normalized = normalizeRoute(fullRouteData);
                    const idx = routes.findIndex(r => r.id === id);
                    if (idx !== -1) routes[idx] = normalized;
                    route = normalized;
                }
            } catch (err) {
                console.warn('No se pudo obtener el detalle completo de la ruta:', err);
            }
        }

        // 3. Prepara las variables para la plantilla
        const vehicleInfo = route.vehicle ? vehicles.find(v => v.id === route.vehicle.id) : null;
        const driverData = route.driver ? drivers.find(d => d.id === route.driver.id) : null;
        const vehicleAlias = vehicleInfo ? (vehicleInfo.alias || vehicleInfo.marca) : 'No asignado';
        const driverName = route.driver ? route.driver.name : 'No asignado';
        let driverStatusHtml = '';
        if (driverData) {
            const { text, color } = driverStatusInfo[driverData.status] || defaultStatusInfo;
            driverStatusHtml = `<span style="color: ${color}; margin-left: 8px;">(${text})</span>`;
        }

        // --- LÓGICA CENTRALIZADA DE ESTADOS Y COLORES ---
        const routeStatus = route.estado;
        const canStart = route.coords && route.coords.length >= 2;

        // Reglas de negocio
        const isEditable = routeStatus === 'pendiente'; // Solo se puede editar o eliminar en 'pendiente'
        const isCancelable = routeStatus === 'en curso'; // Solo se puede cancelar en 'en curso'
        const isActionable = ['pendiente', 'lista para iniciar', 'en curso'].includes(routeStatus);

        // Colores base
        const blue = '#6c8cff';
        const green = '#2ecc71';
        const red = '#e74c3c';
        const grey = '#95a5a6';

        // Determina colores y estados de los botones
        const cardBorderColor = routeStatus === 'cancelada' ? red : route.color;
        const editDeleteButtonColor = isEditable ? blue : grey;

        let actionButtonColor = grey;
        let actionButtonText = routeStatus.charAt(0).toUpperCase() + routeStatus.slice(1);
        let actionButtonDisabled = true;

        if (routeStatus === 'pendiente') {
            actionButtonColor = blue;
            actionButtonText = canStart ? 'Iniciar Ruta' : 'Sin coordenadas';
            actionButtonDisabled = !canStart;
        } else if (routeStatus === 'lista para iniciar') {
            actionButtonColor = green;
            actionButtonText = canStart ? 'Iniciar Ruta' : 'Sin coordenadas';
            actionButtonDisabled = !canStart;
        } else if (isCancelable) {
            actionButtonColor = red;
            actionButtonText = 'Cancelar Ruta';
            actionButtonDisabled = false;
        }

        // 4. Construye el HTML final (se eliminó el párrafo de estado duplicado)
        routeDetail.innerHTML = `
        <div class="route-card" style="border-left: 4px solid ${cardBorderColor}; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px;">
                <h3 style="margin: 0; line-height: 1.2;">${route.name}</h3>
                <i id="btn-clone-route" class="fa fa-clone" aria-hidden="true" 
                style="font-size: 1.3em; color: #6c8cff; cursor: pointer; padding: 3px; margin-left: 10px;" 
                title="Clonar esta ruta"></i>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px;">
                <div>
                    <strong style="font-size: 0.9em; color: #555; display: block; margin-bottom: 2px;">Estado:</strong>
                    <span style="font-weight: bold; text-transform: capitalize;">${route.estado}</span>
                </div>
                <div>
                    <strong style="font-size: 0.9em; color: #555; display: block; margin-bottom: 2px;">Puntos:</strong>
                    <span>${route.puntos ?? (route.coords ? route.coords.length : 0)}</span>
                </div>
                <div>
                    <strong style="font-size: 0.9em; color: #555; display: block; margin-bottom: 2px;">Vehículo:</strong>
                    <span>${vehicleAlias}</span>
                </div>
                <div>
                    <strong style="font-size: 0.9em; color: #555; display: block; margin-bottom: 2px;">Chofer:</strong>
                    <span>${driverName}${driverStatusHtml}</span>
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-top: 1px solid #eee; padding-top: 15px;">
                <div >
                    <strong style="font-size: 0.9em; color: #555;">Contraseña:</strong>
                    <p id="route-password" style="margin: 2px 0 0 0; font-weight: bold; color: #333;">${route.password || 'No generada'}</p>
                </div>
                ${route.password ? `
                <button id="btn-copy-password" style="background: ${blue}; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer;">Copiar</button>
                ` : ''}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <div style="display: flex; gap: 8px;">
                    <button id="btn-edit-route" style="background: ${editDeleteButtonColor}; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer;" ${!isEditable ? 'disabled' : ''}>
                        Editar
                    </button>
                    <button id="btn-delete-route" style="background: ${editDeleteButtonColor}; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer;" ${!isEditable ? 'disabled' : ''}>
                        Eliminar
                    </button>
                </div>
                    <button id="start-cancel-route" style="background: ${actionButtonColor}; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer;" ${actionButtonDisabled ? 'disabled' : ''}>
                    ${actionButtonText}
                    </button>
                </div>
            </div> `;

        // 5. Asigna los event listeners de forma segura para evitar duplicados
        if (isEditable) {
            document.getElementById('btn-edit-route').addEventListener('click', () => editRoute(route.id));
            document.getElementById('btn-delete-route').addEventListener('click', () => deleteRoute(route.id));
        }

        if (isActionable) {
            document.getElementById('start-cancel-route').addEventListener('click', () => {
                if (route.estado === 'en curso') {
                    cancelRoute(route.id);
                } else {
                    startRoute(route.id);
                }
            });
        }
        document.getElementById('btn-clone-route').addEventListener('click', () => cloneRoute(route.id));
        const copyBtn = document.getElementById('btn-copy-password');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const pwd = document.getElementById('route-password')?.textContent || '';
                if (!pwd || pwd === 'No generada') return;
                navigator.clipboard.writeText(pwd).then(() => {
                    copyBtn.textContent = 'Copiado';
                    setTimeout(() => copyBtn.textContent = 'Copiar', 1200);
                });
            });
        }
    }

    // Editar ruta (VERSIÓN CORREGIDA #3 - A PRUEBA DE CACHÉ)
    async function editRoute(id) {

        // --- 1. OBTENER DATOS COMPLETOS DE LA RUTA ---
        let route;
        try {
            // Primero, intenta obtener la ruta del caché
            const cachedRoute = routes.find(r => r.id === id);

            // Si el caché no tiene coordenadas O (ahora) no tiene isTraceFree, lo volvemos a buscar
            if (!cachedRoute || !cachedRoute.coords || cachedRoute.isTraceFree === undefined) {
                const res = await fetch(`/api/routes/${id}`);
                if (!res.ok) throw new Error('Ruta no encontrada en el servidor');
                const fullRouteData = await res.json();
                route = normalizeRoute(fullRouteData); // Normaliza los datos frescos

                // Actualiza el caché local
                const idx = routes.findIndex(r => r.id === id);
                if (idx !== -1) routes[idx] = route;
            } else {
                route = cachedRoute; // El caché es bueno, úsalo
            }
        } catch (err) {
            console.error("Error al obtener detalles completos de la ruta:", err);
            return alert('No se pudo cargar la ruta para editar.');
        }

        // --- 2. LLENA EL FORMULARIO (AHORA CON DATOS COMPLETOS) ---
        panelTitle.textContent = 'Editar ruta';
        submitButton.textContent = 'Guardar cambios';
        document.getElementById('route-id').value = route.id;
        document.getElementById('route-name').value = route.name;
        document.getElementById('route-color').value = route.color;

        routeVehicleSelect.value = route.vehicle ? route.vehicle.id : "";
        if (routeDriverSelect) {
            routeDriverSelect.value = route.driver ? route.driver.id : "";
        }

        // --- ESTO AHORA FUNCIONARÁ ---
        traceFreeSwitch.checked = route.isTraceFree || false;
        isTraceFreeMode = route.isTraceFree || false;
        updateDrawUI(); // Actualiza los botones

        // --- 3. ABRE EL PANEL ---
        panel.classList.add('open');

        // --- 4. DIBUJA EL MAPA (AHORA CON COORDENADAS) ---
        try {
            tempCoords = route.coords || [];
            drawnItems.clearLayers();
            isFinalPointSet = false; // Resetea

            if (isTraceFreeMode) {
                // Es una ruta SIN TRAZO
                if (tempCoords.length >= 1) {
                    L.marker(tempCoords[0], {
                        icon: L.divIcon({ className: 'start-marker-icon', html: '<i class="fa-solid fa-location-dot" style="color:#2ecc71; font-size: 24px;"></i>' })
                    }).addTo(drawnItems);
                }
                if (tempCoords.length >= 2) {
                    L.marker(tempCoords[1], {
                        icon: L.divIcon({ className: 'end-marker-icon', html: '<i class="fa-solid fa-flag-checkered" style="color:#d10000; font-size: 24px;"></i>' })
                    }).addTo(drawnItems);
                    L.polyline(tempCoords, { color: '#6c8cff', weight: 4, dashArray: '10, 10' }).addTo(drawnItems);
                }
            } else if (tempCoords.length > 0) {
                // Es una ruta CON TRAZO (normal)
                tempPolyline = L.polyline(tempCoords, {
                    color: route.color, weight: 5
                }).addTo(drawnItems);

                tempCoords.forEach(coord => {
                    L.circleMarker(coord, { radius: 6, color: route.color }).addTo(drawnItems);
                });

                const lastCoord = tempCoords[tempCoords.length - 1];
                L.marker(lastCoord, {
                    icon: L.divIcon({ className: 'end-marker-icon', html: '<i class="fa-solid fa-flag-checkered" style="color:#d10000; font-size: 24px;"></i>' })
                }).addTo(drawnItems);

                isFinalPointSet = true;
            }

            disableDrawing();

        } catch (err) {
            console.error("Error al dibujar la ruta para edición:", err);
            alert("Error al cargar las coordenadas de la ruta. Revisa la consola.");
            drawnItems.clearLayers();
            tempCoords = [];
            isFinalPointSet = false;
        }
    }

    // Clonar ruta (NUEVA FUNCIÓN)
    async function cloneRoute(id) {

        // --- 1. OBTENER DATOS COMPLETOS DE LA RUTA ---
        let route;
        try {
            const res = await fetch(`/api/routes/${id}`);
            if (!res.ok) throw new Error('Ruta no encontrada en el servidor');
            const fullRouteData = await res.json();
            route = normalizeRoute(fullRouteData);
        } catch (err) {
            console.error("Error al obtener detalles completos de la ruta:", err);
            return alert('No se pudo cargar la ruta para clonar.');
        }

        // --- 2. LLENA EL FORMULARIO (MODO CLONAR) ---
        panelTitle.textContent = 'Clonar Ruta';
        submitButton.textContent = 'Crear ruta'; // O 'Crear clon' si prefieres

        // --- !! IMPORTANTE !! ---
        // El ID debe estar VACÍO para forzar una CREACIÓN (POST)
        document.getElementById('route-id').value = '';

        // Añadimos "(Copia)" al nombre para diferenciarla
        document.getElementById('route-name').value = `${route.name} (Copia)`;
        document.getElementById('route-color').value = route.color;

        routeVehicleSelect.value = route.vehicle ? route.vehicle.id : "";
        if (routeDriverSelect) {
            routeDriverSelect.value = route.driver ? route.driver.id : "";
        }

        traceFreeSwitch.checked = route.isTraceFree || false;
        isTraceFreeMode = route.isTraceFree || false;
        updateDrawUI();

        // --- 3. ABRE EL PANEL ---
        panel.classList.add('open');

        // --- 4. DIBUJA EL MAPA (IDÉNTICO A EDITAR) ---
        try {
            tempCoords = route.coords || [];
            drawnItems.clearLayers();
            isFinalPointSet = false;

            if (isTraceFreeMode) {
                if (tempCoords.length >= 1) {
                    L.marker(tempCoords[0], {
                        icon: L.divIcon({ className: 'start-marker-icon', html: '<i class="fa-solid fa-location-dot" style="color:#2ecc71; font-size: 24px;"></i>' })
                    }).addTo(drawnItems);
                }
                if (tempCoords.length >= 2) {
                    L.marker(tempCoords[1], {
                        icon: L.divIcon({ className: 'end-marker-icon', html: '<i class="fa-solid fa-flag-checkered" style="color:#d10000; font-size: 24px;"></i>' })
                    }).addTo(drawnItems);
                    L.polyline(tempCoords, { color: '#6c8cff', weight: 4, dashArray: '10, 10' }).addTo(drawnItems);
                }
            } else if (tempCoords.length > 0) {
                tempPolyline = L.polyline(tempCoords, {
                    color: route.color, weight: 5
                }).addTo(drawnItems);

                tempCoords.forEach(coord => {
                    L.circleMarker(coord, { radius: 6, color: route.color }).addTo(drawnItems);
                });

                const lastCoord = tempCoords[tempCoords.length - 1];
                L.marker(lastCoord, {
                    icon: L.divIcon({ className: 'end-marker-icon', html: '<i class="fa-solid fa-flag-checkered" style="color:#d10000; font-size: 24px;"></i>' })
                }).addTo(drawnItems);

                isFinalPointSet = true;
            }

            disableDrawing();

        } catch (err) {
            console.error("Error al dibujar la ruta para clonar:", err);
            alert("Error al cargar las coordenadas de la ruta. Revisa la consola.");
            drawnItems.clearLayers();
            tempCoords = [];
            isFinalPointSet = false;
        }
    }

    // Eliminar ruta
    async function deleteRoute(id) {
        if (!confirm('¿Estás seguro de que quieres eliminar esta ruta?')) return;

        try {
            const res = await fetch(`/api/routes/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Error' }));
                throw new Error(err.error || 'Error al eliminar ruta');
            }

            routes = routes.filter(r => r.id !== id);
            filterAndRenderRoutes(searchInput.value);
            routeDetail.innerHTML = '<p>Selecciona una ruta para ver detalles.</p>';
        } catch (err) {
            console.error(err);
            alert('No se pudo eliminar la ruta.');
        }
    }

    async function startRoute(id) {
        const route = routes.find(r => r.id === id);
        if (!route) return alert('Ruta no encontrada.');
        if (!route.coords || route.coords.length < 2) {
            return alert('Esta ruta no tiene coordenadas para iniciar. Intenta obtener el detalle de la ruta en el servidor.');
        }

        try {
            const res = await fetch(`/api/routes/${encodeURIComponent(id)}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'en curso' })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Error' }));
                throw new Error(err.error || 'Error al actualizar estado');
            }

            const updatedRaw = await res.json();
            const updated = normalizeRoute(updatedRaw);

            const idx = routes.findIndex(r => r.id === id);
            if (idx >= 0) routes[idx] = { ...routes[idx], ...updated };

            filterAndRenderRoutes(searchInput.value);

            const activeRoute = routes.find(r => r.id === id) ?? updated;
            localStorage.setItem('activeRoute', JSON.stringify(activeRoute));

            window.location.href = 'index.html';


        } catch (err) {
            console.error('startRoute:', err);
            alert('No se pudo iniciar la ruta. Intenta nuevamenteee.');
        }
    }

    // Inicializar Socket.IO después de que el script se cargue
    const socket = io();
    socket.on('routesUpdated', (data) => {
        if (data.deletedId) {
            routes = routes.filter(r => r.id !== data.deletedId);
        } else {
            const route = normalizeRoute(data);
            const existingIndex = routes.findIndex(r => r.id === route.id);
            if (existingIndex > -1) {
                routes[existingIndex] = route;
            } else {
                routes.unshift(route);
            }
        }
        filterAndRenderRoutes(searchInput.value);
        routeDetail.innerHTML = '<p>Selecciona una ruta para ver detalles.</p>';
    });

    socket.on('routeStatusChanged', (raw) => {
        const updated = normalizeRoute(raw);
        const idx = routes.findIndex(r => r.id === updated.id);
        if (idx >= 0) {
            routes[idx] = { ...routes[idx], ...updated };
            filterAndRenderRoutes(searchInput.value);

            const shownLi = document.querySelector('#route-items li.active');
            if (shownLi && shownLi.dataset.id === updated.id) {
                showRouteDetail(updated.id);
            }
        }
    });

    // Socket: recibir actualizaciones de vehículos
    socket.on('vehiclesUpdated', (data) => {
        if (data.deletedId) {
            vehicles = vehicles.filter(v => v.id !== data.deletedId);
        } else {
            const existingIndex = vehicles.findIndex(v => v.id === data.id);
            if (existingIndex > -1) {
                vehicles[existingIndex] = data;
            } else {
                vehicles.unshift(data);
            }
        }
        renderVehicleOptions();
    });

    // Socket: recibir actualizaciones de choferes (si tu backend emite este evento, opcional)
    socket.on('driversUpdated', (data) => {
        if (data.deletedId) {
            drivers = drivers.filter(d => d.id !== data.deletedId);
        } else {
            const existingIndex = drivers.findIndex(d => d.id === data.id);
            if (existingIndex > -1) {
                drivers[existingIndex] = data;
            } else {
                drivers.unshift(data);
            }
        }
        renderDriverOptions();
    });

    // Lógica para el campo de búsqueda
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        filterAndRenderRoutes(query);
    });

    // Carga inicial de datos
    fetchData();
});