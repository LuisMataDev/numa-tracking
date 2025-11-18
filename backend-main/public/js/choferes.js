// Dentro de choferes.js
document.addEventListener('DOMContentLoaded', () => {
    // Referencias a los elementos del DOM
    const driverListElement = document.getElementById('chofer-items');
    const driverDetailElement = document.getElementById('chofer-detail');
    const btnNewChofer = document.getElementById('btn-new-chofer');
    const searchInput = document.getElementById('search-driver');

    // Almacenamos los choferes en una variable de estado global
    let drivers = [];

    /**
     * Muestra un loader de tipo "skeleton" en la lista de choferes.
     * @param {number} count - El número de elementos skeleton a mostrar.
     */
    function showDriverSkeletonLoader(count = 8) {
        driverListElement.innerHTML = ''; // Limpia la lista actual
        for (let i = 0; i < count; i++) {
            const li = document.createElement('li');
            li.className = 'skeleton-driver-item'; // Usamos la nueva clase CSS
            li.innerHTML = `
            <div class="skeleton-icon"></div>
            <div class="skeleton-driver-info">
                <div class="skeleton-text title"></div>
                <div class="skeleton-text subtitle"></div>
            </div>
        `;
            driverListElement.appendChild(li);
        }
    }



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


    // Función para obtener los choferes de la API
    async function fetchDrivers() {
        showDriverSkeletonLoader(); // <-- AÑADE ESTA LÍNEA AQUÍ
        try {
            const response = await fetch('/api/drivers');
            if (!response.ok) {
                throw new Error('No se pudo obtener la lista de choferes.');
            }
            drivers = await response.json();
            renderDriversList();
        } catch (error) {
            console.error('Error al cargar choferes:', error);
            driverListElement.innerHTML = '<li class="no-results">Error al cargar choferes.</li>';
        }
    }

    // Función para renderizar la lista de choferes
    function renderDriversList(driversToRender = drivers) {
        driverListElement.innerHTML = '';

        if (driversToRender.length === 0) {
            driverListElement.innerHTML = '<li class="no-results">No hay choferes registrados.</li>';
            return;
        }

        driversToRender.forEach(driver => {
            const li = document.createElement('li');
            li.className = 'chofer-item';
            li.setAttribute('data-id', driver.id);
            li.innerHTML = `
                 <div class="chofer-icon">
                    <i class="fa-solid fa-user-tie"></i>
                </div>
                <div class="chofer-info">
                    <h3>${driver.name}</h3>
                    <small>${driver.id}</small>
                </div>
            `;
            li.addEventListener('click', () => {
                showDriverDetails(driver);
                document.querySelectorAll('.chofer-item').forEach(item => item.classList.remove('active'));
                li.classList.add('active');
            });
            driverListElement.appendChild(li);
        });
    }

    // Función para mostrar los detalles de un chofer en el panel derecho
    function showDriverDetails(driver) {
        driverDetailElement.innerHTML = `
            <h2>${driver.name}</h2>
            <div class="details-body" style="border-left:4px solid #6c8cff; padding:12px;">
                <p><strong>ID:</strong> ${driver.id}</p>
                <p><strong>Licencia:</strong> ${driver.license}</p>
                <p><strong>Teléfono:</strong> ${driver.phone}</p>
                <p><strong>Correo Electrónico:</strong> ${driver.email}</p>
            </div>
            <div class="details-actions">
                <button style = "background: #6c8cff; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 700;" id="btn-edit-chofer" class="btn-edit">Editar</button>
                <button style = "background: #6c8cff; color: #fff; border: 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-weight: 700;" id="btn-delete-chofer" class="btn-delete">Eliminar</button>
            </div>
        `;

        document.getElementById('btn-edit-chofer').addEventListener('click', () => {
            showDriverForm('edit', driver);
        });
        document.getElementById('btn-delete-chofer').addEventListener('click', async () => {
            if (confirm(`¿Estás seguro de que quieres eliminar a ${driver.name}?`)) {
                await deleteDriver(driver.id);
            }
        });
    }

    // Función para mostrar el formulario de registro/edición
    function showDriverForm(mode = 'create', driver = null) {
        driverDetailElement.innerHTML = `
            <form id="driver-form">
                <h2>${mode === 'create' ? 'Nuevo Chofer' : 'Editar Chofer'}</h2>
                <label for="chofer-id">ID</label>
                <input type="text" id="chofer-id" placeholder="CH123" value="${driver ? driver.id : ''}" ${mode === 'edit' ? 'readonly' : ''} required />

                <label for="chofer-name">Nombre</label>
                <input type="text" id="chofer-name" placeholder="Luis Mata" value="${driver ? driver.name : ''}" required />

                <label for="chofer-license">Licencia</label>
                <input type="text" id="chofer-license" placeholder="11A122B23C" value="${driver ? driver.license : ''}" required />

                <label for="chofer-phone">Teléfono</label>
                <input type="text" id="chofer-phone" placeholder="1234567890" value="${driver ? driver.phone : ''}" />

                <label for="chofer-email">Correo Electrónico</label>
                <input type="email" id="chofer-email" placeholder="chofer@123@gmail.com" value="${driver ? driver.email : ''}" />
                
                <div class="form-actions">
                    <button type="submit" class="primary-btn">${mode === 'create' ? 'Registrar' : 'Guardar Cambios'}</button>
                    <button type="button" id="btn-cancel-form" class="secondary-btn">Cancelar</button>
                </div>
            </form>
        `;

        const driverForm = document.getElementById('driver-form');
        const cancelButton = document.getElementById('btn-cancel-form');

        driverForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                id: document.getElementById('chofer-id').value,
                name: document.getElementById('chofer-name').value,
                license: document.getElementById('chofer-license').value,
                phone: document.getElementById('chofer-phone').value,
                email: document.getElementById('chofer-email').value,
            };

            let response;
            if (mode === 'create') {
                response = await fetch('/api/drivers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
            } else { // 'edit' mode
                response = await fetch(`/api/drivers/${driver.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
            }

            if (response.ok) {
                // Si la operación es exitosa, volvemos a cargar los datos de la DB
                await fetchDrivers();
                showDriverDetails(formData);
            } else {
                const error = await response.json();
                alert(`Error: ${error.error}`);
            }
        });

        cancelButton.addEventListener('click', () => {
            if (driver) {
                showDriverDetails(driver);
            } else {
                driverDetailElement.innerHTML = '<p>Selecciona un chofer para ver sus detalles.</p>';
            }
        });
    }

    // Lógica para eliminar un chofer
    async function deleteDriver(driverId) {
        try {
            const response = await fetch(`/api/drivers/${driverId}`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error('No se pudo eliminar el chofer.');
            }
            await fetchDrivers();
            driverDetailElement.innerHTML = '<p>Selecciona un chofer para ver sus detalles.</p>';
        } catch (error) {
            console.error('Error al eliminar chofer:', error);
            alert('No se pudo eliminar el chofer.');
        }
    }

    // Lógica para el botón "Nuevo"
    btnNewChofer.addEventListener('click', () => {
        showDriverForm('create');
    });

    // Lógica para el campo de búsqueda
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filteredDrivers = drivers.filter(driver =>
            driver.name.toLowerCase().includes(query) ||
            driver.id.toLowerCase().includes(query) ||
            driver.email.toLowerCase().includes(query) ||
            driver.license.toLowerCase().includes(query)
        );
        renderDriversList(filteredDrivers);
    });

    // Inicializar la vista al cargar la página
    fetchDrivers();
});