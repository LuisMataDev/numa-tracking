// Vehiculos.js
document.addEventListener('DOMContentLoaded', () => {
    // Referencias a los elementos del DOM
    const vehicleListElement = document.getElementById('vehiculo-items');
    const vehicleDetailElement = document.getElementById('vehiculo-detail');
    const btnNewVehiculo = document.getElementById('btn-new-vehiculo');
    const searchInput = document.getElementById('search-vehicle');
    const formTemplate = document.getElementById('vehicle-form-template');

    // Almacenamos los vehículos en variable de estado
    let vehicles = [];

    function showVehicleSkeletonLoader(count = 8) {
    vehicleListElement.innerHTML = ''; // Limpia la lista actual
    for (let i = 0; i < count; i++) {
        const li = document.createElement('li');
        li.className = 'skeleton-item'; // Usamos la nueva clase CSS
        li.innerHTML = `
            <div class="skeleton-icon"></div>
            <div class="skeleton-info">
                <div class="skeleton-text title"></div>
                <div class="skeleton-text subtitle"></div>
            </div>
        `;
        vehicleListElement.appendChild(li);
    }
}

    // Función principal para obtener datos de la API
    async function fetchData() {
        showVehicleSkeletonLoader(); // <-- AÑADE ESTA LÍNEA AQUÍ
        try {
            const vehiclesResponse = await fetch('/api/vehicles');
            vehicles = await vehiclesResponse.json();
            renderVehiclesList();
        } catch (error) {
            console.error('Error al cargar datos:', error);
            vehicleListElement.innerHTML = '<li class="no-results">Error al cargar datos.</li>';
        }
    }

    // Función para renderizar la lista de vehículos (ya no mostramos chofer)
    function renderVehiclesList(vehiclesToRender = vehicles) {
        vehicleListElement.innerHTML = '';
        if (vehiclesToRender.length === 0) {
            vehicleListElement.innerHTML = '<li class="no-results">No hay vehículos registrados.</li>';
            return;
        }

        vehiclesToRender.forEach(vehicle => {
            const li = document.createElement('li');
            li.className = 'vehiculo-item';
            li.setAttribute('data-id', vehicle.id);
            li.innerHTML = `
                <div class="vehiculo-icon">
                    <i class="fa-solid fa-truck"></i>
                </div>
                <div class="vehiculo-info">
                    <h3 class="vehiculo-name">${vehicle.alias || vehicle.marca + ' ' + vehicle.modelo}</h3>
                    <p class="vehiculo-meta">
                        Placa: ${vehicle.id}
                    </p>
                </div>
            `;
            li.addEventListener('click', () => {
                showVehicleDetails(vehicle);
                document.querySelectorAll('.vehiculo-item').forEach(item => item.classList.remove('active'));
                li.classList.add('active');
            });
            vehicleListElement.appendChild(li);
        });
    }

    // Función para mostrar los detalles de un vehículo (sin chofer)
    function showVehicleDetails(vehicle) {
        vehicleDetailElement.innerHTML = `
            <h2>${vehicle.alias || vehicle.marca + ' ' + vehicle.modelo}</h2>
            <div class="details-body" style="border-left:4px solid #6c8cff; padding:12px;">
                <p><strong>Placa:</strong> ${vehicle.id}</p>
                <p><strong>Marca:</strong> ${vehicle.marca}</p>
                <p><strong>Modelo:</strong> ${vehicle.modelo}</p>
                <p><strong>Año:</strong> ${vehicle.año}</p>
            </div>
            <div class="details-actions">
                <button style="background: #6c8cff; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 700;" id="btn-edit-vehiculo" class="btn-edit">Editar</button>
                <button style="background: #6c8cff; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 700;" id="btn-delete-vehiculo" class="btn-delete">Eliminar</button>
            </div>
        `;
        
        document.getElementById('btn-edit-vehiculo').addEventListener('click', () => {
            showVehicleForm('edit', vehicle);
        });
        document.getElementById('btn-delete-vehiculo').addEventListener('click', async () => {
            if (confirm(`¿Estás seguro de que quieres eliminar el vehículo con placa ${vehicle.id}?`)) {
                await deleteVehicle(vehicle.id);
            }
        });
    }

    // Formulario de registro/edición (YA NO incluye selección de chofer)
    function showVehicleForm(mode = 'create', vehicle = {}) {
        const clonedForm = formTemplate.content.cloneNode(true);
        const formElement = clonedForm.querySelector('form');
        const formTitle = clonedForm.querySelector('#form-title');
        const submitButton = clonedForm.querySelector('button[type="submit"]');
        const cancelButton = clonedForm.querySelector('#btn-cancel-form');

        // Si es 'edit', prellenar campos
        if (mode === 'edit') {
            formTitle.textContent = 'Editar Vehículo';
            submitButton.textContent = 'Guardar Cambios';
            formElement.querySelector('#vehicle-id').value = vehicle.id;
            formElement.querySelector('#vehicle-id').readOnly = true;
            formElement.querySelector('#vehicle-alias').value = vehicle.alias || '';
            formElement.querySelector('#vehicle-marca').value = vehicle.marca || '';
            formElement.querySelector('#vehicle-modelo').value = vehicle.modelo || '';
            formElement.querySelector('#vehicle-year').value = vehicle.año || '';
        } else { // 'create' mode
            const currentYear = new Date().getFullYear();
            formElement.querySelector('#vehicle-year').value = currentYear;
        }

        // Reemplazar el contenido actual del panel de detalles
        vehicleDetailElement.innerHTML = '';
        vehicleDetailElement.appendChild(clonedForm);

        // Submit: enviar datos del vehículo (SIN chofer)
        formElement.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = {
                id: formElement.querySelector('#vehicle-id').value,
                alias: formElement.querySelector('#vehicle-alias').value,
                marca: formElement.querySelector('#vehicle-marca').value,
                modelo: formElement.querySelector('#vehicle-modelo').value,
                año: parseInt(formElement.querySelector('#vehicle-year').value, 10)
            };

            const url = mode === 'create' ? '/api/vehicles' : `/api/vehicles/${vehicle.id}`;
            const method = mode === 'create' ? 'POST' : 'PUT';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                if (response.ok) {
                    await fetchData();
                    showVehicleDetails(formData);
                } else {
                    const error = await response.json().catch(()=>({error:'Error'}));
                    alert(`Error: ${error.error || 'Error al guardar vehículo'}`);
                }
            } catch (error) {
                console.error('Error en la solicitud:', error);
                alert('Ocurrió un error al procesar la solicitud.');
            }
        });

        cancelButton.addEventListener('click', () => {
            vehicleDetailElement.innerHTML = '<p id="initial-message">Selecciona un vehículo para ver sus detalles.</p>';
        });
    }

    // Lógica para eliminar un vehículo
    async function deleteVehicle(vehicleId) {
        try {
            const response = await fetch(`/api/vehicles/${vehicleId}`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error('No se pudo eliminar el vehículo.');
            }
            await fetchData();
            vehicleDetailElement.innerHTML = '<p id="initial-message">Selecciona un vehículo para ver sus detalles.</p>';
        } catch (error) {
            console.error('Error al eliminar vehículo:', error);
            alert('No se pudo eliminar el vehículo.');
        }
    }

    // Lógica para el botón "Nuevo"
    btnNewVehiculo.addEventListener('click', () => {
        showVehicleForm('create');
    });

    // Lógica para el campo de búsqueda
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filteredVehicles = vehicles.filter(vehicle =>
            (vehicle.id && vehicle.id.toLowerCase().includes(query)) ||
            (vehicle.alias && vehicle.alias.toLowerCase().includes(query)) ||
            (vehicle.marca && vehicle.marca.toLowerCase().includes(query)) ||
            (vehicle.modelo && vehicle.modelo.toLowerCase().includes(query))
        );
        renderVehiclesList(filteredVehicles);
    });

    // Inicializar la vista al cargar la página
    fetchData();
});