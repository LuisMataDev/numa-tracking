// Dentro de choferes.js
document.addEventListener('DOMContentLoaded', () => {
    // Referencias a los elementos del DOM
    const driverListElement = document.getElementById('chofer-items');
    const driverDetailElement = document.getElementById('chofer-detail');
    const btnNewChofer = document.getElementById('btn-new-chofer');
    const searchInput = document.getElementById('search-driver');

    // Almacenamos los choferes en una variable de estado global
    let drivers = [];

    // Función para obtener los choferes de la API
    async function fetchDrivers() {
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
                <input type="text" id="chofer-id" value="${driver ? driver.id : ''}" ${mode === 'edit' ? 'readonly' : ''} required />

                <label for="chofer-name">Nombre</label>
                <input type="text" id="chofer-name" value="${driver ? driver.name : ''}" required />

                <label for="chofer-license">Licencia</label>
                <input type="text" id="chofer-license" value="${driver ? driver.license : ''}" required />

                <label for="chofer-phone">Teléfono</label>
                <input type="text" id="chofer-phone" value="${driver ? driver.phone : ''}" />

                <label for="chofer-email">Correo Electrónico</label>
                <input type="email" id="chofer-email" value="${driver ? driver.email : ''}" />
                
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