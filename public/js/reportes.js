document.addEventListener('DOMContentLoaded', () => {

    // --- 1. REFERENCIAS AL DOM ---
    const filters = {
        type: document.getElementById('filter-type'),
        value: document.getElementById('filter-value'),
        // Selecciona solo los botones, no el input de mes
        dateButtons: document.querySelectorAll('.date-filter-btn[data-period="day"], .date-filter-btn[data-period="week"]'),
        monthInput: document.getElementById('month-filter-input') // <-- AÑADIDO
    };
    const reportTitle = document.getElementById('report-title');
    const resultsGrid = document.getElementById('report-results');
    const previewButton = document.getElementById('btn-preview-pdf');
    const modal = {
        overlay: document.getElementById('pdf-modal-overlay'),
        container: document.getElementById('pdf-modal'),
        closeButton: document.getElementById('btn-close-modal'),
        exportButton: document.getElementById('btn-export-pdf'),
        contentArea: document.querySelector('.pdf-preview-page')
    };

    // --- 2. ESTADO DE LA APLICACIÓN ---
    let state = {
        routes: [],
        drivers: [],
        vehicles: [],
        filteredRoutes: [],
        activeDateFilter: 'month' // <-- CAMBIO: El filtro inicial ahora es el de mes
    };

    // --- 3. CARGA DE DATOS INICIAL ---
    async function fetchData() {
        try {
            const [routesRes, driversRes, vehiclesRes] = await Promise.all([
                fetch('/api/routes'),
                fetch('/api/drivers'),
                fetch('/api/vehicles')
            ]);
            
            const allRoutes = await routesRes.json();
            state.routes = allRoutes.filter(route => route.estado === 'finalizada');
            
            state.drivers = await driversRes.json();
            state.vehicles = await vehiclesRes.json();

            // Llama a la nueva función para establecer el mes por defecto
            setDefaultMonth();
            // Aplica el filtro inicial
            filterAndRender();

        } catch (error) {
            console.error("Error al cargar datos:", error);
            resultsGrid.innerHTML = `<p class="empty-state">No se pudieron cargar los datos del servidor.</p>`;
        }
    }
    
    // --- 4. LÓGICA DE FILTRADO ---
    function filterAndRender() {
        let result = [...state.routes];
        const now = new Date();
        
        if (state.activeDateFilter === 'day') {
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            result = result.filter(route => new Date(route.updatedAt) >= startOfToday);
            reportTitle.textContent = 'Reporte de Hoy';
        } else if (state.activeDateFilter === 'week') {
            const dayOfWeek = now.getDay();
            const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
            result = result.filter(route => new Date(route.updatedAt) >= startOfWeek);
            reportTitle.textContent = 'Reporte de la Semana';
        
        // --- BLOQUE DE FILTRO POR MES MEJORADO ---
        } else if (state.activeDateFilter === 'month') {
            const monthValue = filters.monthInput.value;
            if (monthValue) {
                const [year, month] = monthValue.split('-').map(Number);
                const startDate = new Date(year, month - 1, 1);
                const endDate = new Date(year, month, 1);

                result = result.filter(route => {
                    const routeDate = new Date(route.updatedAt);
                    return routeDate >= startDate && routeDate < endDate;
                });
                
                const monthName = startDate.toLocaleString('es-ES', { month: 'long' });
                reportTitle.textContent = `Reporte de ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
            }
        }

        const filterType = filters.type.value;
        const filterValue = filters.value.value;
        if (filterType !== 'all' && filterValue) {
            if (filterType === 'driver') {
                result = result.filter(route => route.driver && route.driver.id === filterValue);
            } else if (filterType === 'vehicle') {
                result = result.filter(route => route.vehicle && route.vehicle.id === filterValue);
            }
        }
        
        state.filteredRoutes = result;
        renderResults(result);
    }
    
    // --- 5. LÓGICA DE RENDERIZADO (sin cambios) ---
    function populateFilterValues() {
        const filterType = filters.type.value;
        filters.value.innerHTML = '';
        filters.value.disabled = true;

        if (filterType === 'all') {
            filters.value.innerHTML = `<option value="">-- Elige un tipo de filtro --</option>`;
            return;
        }

        const data = filterType === 'driver' ? state.drivers : state.vehicles;
        const defaultText = filterType === 'driver' ? 'Todos los choferes' : 'Todos los vehículos';

        filters.value.innerHTML = `<option value="">${defaultText}</option>`;
        data.forEach(item => {
            const name = item.name || item.alias || `${item.marca} ${item.modelo}`;
            filters.value.innerHTML += `<option value="${item.id}">${name}</option>`;
        });
        filters.value.disabled = false;
    }

    function renderResults(routesToRender) {
        resultsGrid.innerHTML = '';
        if (routesToRender.length === 0) {
            resultsGrid.innerHTML = `<p class="empty-state">No se encontraron rutas finalizadas para los filtros seleccionados.</p>`;
            return;
        }

        routesToRender.forEach(route => {
            const driver = state.drivers.find(d => d.id === (route.driver && route.driver.id)) || { name: 'No asignado' };
            const vehicle = state.vehicles.find(v => v.id === (route.vehicle && route.vehicle.id)) || { alias: 'No asignado' };

            const card = document.createElement('div');
            card.className = 'report-card';
            card.innerHTML = `
                <div class="card-header">
                    <h3 class="route-name">${route.name}</h3>
                    <span class="completion-date">Finalizada: ${new Date(route.updatedAt).toLocaleString()}</span>
                </div>
                <div class="card-body">
                    <p><strong><i class="fa-solid fa-user"></i> Chofer:</strong> ${driver.name}</p>
                    <p><strong><i class="fa-solid fa-truck"></i> Vehículo:</strong> ${vehicle.alias || vehicle.marca}</p>
                    <p><strong><i class="fa-solid fa-flag-checkered"></i> Puntos:</strong> ${route.coords ? route.coords.length : 0}</p>
                </div>
                <div class="card-footer">
                    <button class="btn-details">Ver Detalles</button>
                </div>
            `;
            resultsGrid.appendChild(card);
        });
    }

    // --- 6. LÓGICA DEL MODAL Y PDF (sin cambios) ---
    function showPdfPreview() {
        const routes = state.filteredRoutes;
        const periodText = reportTitle.textContent;
        let tableRows = '';
        routes.forEach(route => {
            const driverName = (state.drivers.find(d => d.id === (route.driver && route.driver.id)) || {}).name || 'N/A';
            const vehicleName = (state.vehicles.find(v => v.id === (route.vehicle && route.vehicle.id)) || {}).alias || 'N/A';
            tableRows += `
            <div class="pdf-route-item">
                <div class="pdf-route-header">
                    <h3>Ruta: ${route.name}</h3>
                    <span>Chofer: ${driverName} | Vehículo: ${vehicleName}</span>
                </div>
                <div class="pdf-route-body">
                    <div class="pdf-route-times">
                        <p><strong>Inicio:</strong> ${new Date(route.createdAt).toLocaleString()}</p>
                        <p><strong>Finalización:</strong> ${new Date(route.updatedAt).toLocaleString()}</p>
                    </div>
                </div>
            </div>`;
        });

        modal.contentArea.innerHTML = `
            <div class="pdf-header">
                <img src="html/img/logo.png" alt="Logo" class="pdf-logo">
                <div class="pdf-header-text">
                    <h1>Reporte de Rutas Finalizadas</h1>
                    <p>Periodo: ${periodText}</p>
                </div>
            </div>
            <div class="pdf-content-body">
                ${routes.length > 0 ? tableRows : '<p style="text-align:center;">No hay rutas para mostrar.</p>'}
            </div>
            <div class="pdf-footer">
                <p>Reporte generado el ${new Date().toLocaleDateString()}</p>
            </div>`;
        document.body.classList.add('modal-open');
    }

    function closePdfModal() {
        document.body.classList.remove('modal-open');
    }

    function exportToPdf() {
        const element = modal.contentArea;
        const opt = {
            margin: 0.5,
            filename: `reporte_rutas_${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save();
    }
    
    // --- 7. INICIALIZACIÓN (EVENT LISTENERS) ---
    // NUEVA FUNCIÓN para establecer el mes actual
    function setDefaultMonth() {
        if (!filters.monthInput) return;
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        filters.monthInput.value = `${year}-${month}`;
    }

    filters.dateButtons.forEach(button => {
        button.addEventListener('click', () => {
            filters.dateButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            state.activeDateFilter = button.dataset.period;
            filterAndRender();
        });
    });

    // NUEVO LISTENER para el input de mes
    if (filters.monthInput) {
        filters.monthInput.addEventListener('change', () => {
            filters.dateButtons.forEach(btn => btn.classList.remove('active'));
            state.activeDateFilter = 'month';
            filterAndRender();
        });
    }

    filters.type.addEventListener('change', () => {
        populateFilterValues();
        filterAndRender();
    });
    filters.value.addEventListener('change', filterAndRender);
    
    previewButton.addEventListener('click', showPdfPreview);
    modal.closeButton.addEventListener('click', closePdfModal);
    modal.overlay.addEventListener('click', closePdfModal);
    modal.exportButton.addEventListener('click', exportToPdf);

    // Iniciar la aplicación
    fetchData();
});