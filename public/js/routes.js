
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

    const defaultCoords = [19.7677724, -104.3686507]; // Ubicación por si las moscas

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
        tempCoords.push([lat, lng]);
        L.circleMarker([lat, lng], {
            radius: 6,
            color: document.getElementById('route-color').value
        }).addTo(drawnItems);
        btnUndoPoint.disabled = false;
        btnAddFinalPoint.disabled = false;

      
        if (tempPolyline) {
            tempPolyline.setLatLngs(tempCoords);
        }

        btnUndoPoint.disabled = false;
        btnAddFinalPoint.disabled = false;
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

    // Helper: recalcula y actualiza el estado de un chofer según sus rutas
    async function computeAndSetDriverStatus(driverId) {
        if (!driverId) return null;

        // Buscar rutas asignadas a este chofer
        // Asumimos que en la ruta se guarda driver: { id, name }
        const assignedRoutes = await Route.find({ 'driver.id': driverId }).select('estado').lean();

        // Si hay alguna en curso -> ocupado
        const hasEnCurso = assignedRoutes.some(r => (r.estado || '').toLowerCase() === 'en curso');

        // Si no hay en curso pero hay pendientes -> desocupado (o si no hay rutas = desocupado cuando está activo)
        const hasPendiente = assignedRoutes.some(r => (r.estado || '').toLowerCase() === 'pendiente');

        // Decide nuevo estado: (si está logueado debería ser active-..., si no, lo dejamos como inactive)
        // Vamos a leer el chofer actual
        const driver = await Driver.findOne({ id: driverId });
        if (!driver) return null;

        let newStatus = 'inactive';
        // Suponemos que si el chofer ya no está logueado, su status puede permanecer 'inactive'.
        // Para simplificar: si driver.status === 'inactive' no lo activamos aquí automáticamente;
        // la activación por login la maneja /login. Aquí solo ajustamos entre desocupado/ocupado
        if (driver.status === 'inactive') {
            // No cambiamos automáticamente a active desde aquí (salvo que quieras)
            // Retornamos el driver tal cual.
            return driver;
        }

        // driver está activo => decidir entre ocupado / desocupado
        if (hasEnCurso) newStatus = 'active-ocupado';
        else newStatus = 'active-desocupado';

        if (driver.status !== newStatus) {
            driver.status = newStatus;
            await driver.save();
            // emitir evento socket para notificar cambio
            try { io.emit('driversUpdated', driver.toJSON()); } catch (e) { /* no bloquear */ }
        }

        return driver;
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

        // normalizar driver/chofer si existe
        const driver = raw.driver || raw.chofer || null;

        // <-- AÑADIDO: password si existe
        const password = raw.password || raw.pass || null;

        return { id, name, color, coords, puntos, estado, vehicle, driver, password };
    }



    // Añadir item a la lista de rutas
    function addListItem(route) {
        const li = document.createElement('li');
        li.className = 'route-item';
        li.dataset.id = route.id;
        li.innerHTML = `
            <div class="route-li-content">
                <div class="route-title">${route.name}</div>
                <div class="route-meta">
                    <span class="route-points">${route.puntos ?? 0} pts</span>
                    <span class="route-state">${route.estado}</span>
                    <span class="route-color" title="${route.color}" style="
                        display:inline-block;
                        width:12px;height:12px;border-radius:3px;
                        background:${route.color};margin-left:8px;vertical-align:middle;"></span>
                </div>
                
            </div>
        `;
        routeItems.appendChild(li);
        li.addEventListener('click', () => showRouteDetail(route.id));
    }

    // Cargar rutas, vehículos y choferes desde la API
    async function fetchData() {
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
            renderDriverOptions(); // --- poblar select de choferes
        } catch (err) {
            console.error('fetchData:', err);
            routeItems.innerHTML = '<li class="empty">No se pudieron cargar los datos.</li>';
        }
    }

    /**
     * Filtra las rutas basándose en una consulta y las renderiza en el panel.
     */
    function filterAndRenderRoutes(query) {
        routeItems.innerHTML = '';
        const lowerCaseQuery = query.toLowerCase();

        const filteredRoutes = routes.filter(route => {
            const vehicleInfo = route.vehicle && vehicles.find(v => v.id === route.vehicle.id);
            const vehicleAlias = vehicleInfo ? (vehicleInfo.alias || vehicleInfo.marca || '').toLowerCase() : '';
            const driverName = route.driver ? (route.driver.name || '').toLowerCase() : '';

            return (
                (route.name && route.name.toLowerCase().includes(lowerCaseQuery)) ||
                (route.id && route.id.toLowerCase().includes(lowerCaseQuery)) ||
                (route.estado && route.estado.toLowerCase().includes(lowerCaseQuery)) ||
                (vehicleAlias.includes(lowerCaseQuery)) ||
                (driverName.includes(lowerCaseQuery))
            );
        });

        if (filteredRoutes.length === 0) {
            routeItems.innerHTML = '<li class="empty">No se encontraron rutas que coincidan.</li>';
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
        if (tempCoords.length < 2) return alert('La ruta debe tener al menos dos puntos.');

        // --- AÑADE ESTA VALIDACIÓN ---
        if (!isFinalPointSet) {
            return alert('Es necesario indicar un punto final con el icono de la bansera');
        }
        // --- FIN DE LA VALIDACIÓN ---

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/routes/${id}` : '/api/routes';

        const bodyPayload = {
            name,
            color,
            coords: tempCoords,
            vehicle: vehicle ? { id: vehicle.id, alias: vehicle.alias, marca: vehicle.marca } : null,
            driver: driver ? { id: driver.id, name: driver.name } : null // --- incluir driver aquí
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

    // Mostrar detalle
    async function showRouteDetail(id) {
        document.querySelectorAll('#route-items li')
            .forEach(li => li.classList.toggle('active', li.dataset.id === id));

        let route = routes.find(r => r.id === id);
        if (!route) return;

        if (!route.coords || route.coords.length < 2) {
            try {
                const res = await fetch(`/api/routes/${id}`);
                if (res.ok) {
                    const full = await res.json();
                    const normalized = normalizeRoute(full);
                    const idx = routes.findIndex(r => r.id === id);
                    if (idx >= 0) routes[idx] = normalized;
                    route = normalized;
                }
            } catch (err) {
                console.warn('No se pudo obtener detalle de ruta:', err);
            }
        }

        // Render detalle (AHORA mostramos chofer desde route.driver)
        // ... busca estas líneas ...
        const vehicleInfo = route.vehicle ? vehicles.find(v => v.id === route.vehicle.id) : null;
        // --- REEMPLAZA LA LÓGICA DEL CHOFER POR ESTO ---
        let driverName = 'No asignado';
        let driverStatusHtml = '';

        if (route.driver && route.driver.id) {
            const driverData = drivers.find(d => d.id === route.driver.id);
            driverName = route.driver.name || 'No asignado';

            if (driverData) {
                const status = driverData.status || 'inactive';
                const { text, color } = driverStatusInfo[status] || defaultStatusInfo;
                driverStatusHtml = `<span style="color: ${color}; margin-left: 8px;">(${text})</span>`;
            }
        }
        const vehicleAlias = vehicleInfo ? (vehicleInfo.alias || vehicleInfo.marca) : 'No asignado';

        

        routeDetail.innerHTML = `
    <div class="route-card" style="border-left:4px solid ${route.color}; padding:12px;">
        <h3>${route.name}</h3>
        <p><strong>ID:</strong> ${route.id}</p>
        <p><strong>Puntos:</strong> ${route.puntos ?? (route.coords ? route.coords.length : 0)}</p>
        <p><strong>Estado:</strong> ${route.estado}</p>
        <p><strong>Vehículo:</strong> ${vehicleAlias}</p>
        <p><strong>Chofer:</strong> ${driverName}${driverStatusHtml}</p>
        <p><strong>Contraseña:</strong> <span id="route-password">${route.password ? route.password : 'No generada'}</span>
           ${route.password ? `<button id="btn-copy-password" style="background: #6c8cff; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 700;"">Copiar</button>
            <button id="btn-send-password" style="background: #6c8cff; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 700;"">Enviar</button>` : ''}
        </p>
        <p><strong>Color:</strong>
            <span style="
                display:inline-block;
                width:20px;height:20px;background:${route.color};
                border-radius:4px;vertical-align:middle;"></span>
        </p>
        <div style="margin-top:12px; display: flex; gap: 8px;">
            <button style="background: #6c8cff; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 700;" id="btn-edit-route" class="btn-edit">Editar</button>
            <button style="background: #6c8cff; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 700;" id="btn-delete-route" class="btn-delete">Eliminar</button>
            <button style="background: #6c8cff; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 700;" id="start-route" data-id="${route.id}" ${(!route.coords || route.coords.length < 2) ? 'disabled' : ''}>
                ${(!route.coords || route.coords.length < 2) ? 'Sin coordenadas' : 'Iniciar ruta'}
            </button>
        </div>
    </div>
`;
        const copyBtn = document.getElementById('btn-copy-password');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const pwd = document.getElementById('route-password')?.textContent || '';
                if (!pwd) return;
                navigator.clipboard?.writeText(pwd).then(() => {
                    copyBtn.textContent = 'Copiado';
                    setTimeout(() => copyBtn.textContent = 'Copiar', 1200);
                }).catch(() => {
                    alert('No se pudo copiar al portapapeles. Contraseña: ' + pwd);
                });
            });
        }
        document.getElementById('btn-edit-route').addEventListener('click', () => {
            editRoute(route.id);
        });
        document.getElementById('btn-delete-route').addEventListener('click', () => {
            deleteRoute(route.id);
        });
        document.getElementById('start-route').addEventListener('click', () => startRoute(route.id));
    }

    // Editar ruta
    async function editRoute(id) {
        const route = routes.find(r => r.id === id);
        if (!route) return alert('Ruta no encontrada para editar.');

        panelTitle.textContent = 'Editar ruta';
        submitButton.textContent = 'Guardar cambios';
        document.getElementById('route-id').value = route.id;
        document.getElementById('route-name').value = route.name;
        document.getElementById('route-color').value = route.color;

        if (route.vehicle) {
            routeVehicleSelect.value = route.vehicle.id;
        } else {
            routeVehicleSelect.value = "";
        }

        if (route.driver && routeDriverSelect) {
            routeDriverSelect.value = route.driver.id;
        } else if (routeDriverSelect) {
            routeDriverSelect.value = "";
        }

        // Cargar puntos en el mapa
        tempCoords = route.coords || [];
        drawnItems.clearLayers();
        tempCoords.forEach(coord => {
            L.circleMarker(coord, {
                radius: 6,
                color: route.color
            }).addTo(drawnItems);
        });

        panel.classList.add('open');
        disableDrawing();
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