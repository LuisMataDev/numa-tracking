document.addEventListener('DOMContentLoaded', () => {
    console.log('¡Hola Mundo! El script admin-login.js se está ejecutando.'); // <--- AÑADE ESTA LÍNEA

    const form = document.getElementById('login-form');
    const errorMsg = document.getElementById('error-msg');
    const togglePwBtn = document.getElementById('toggle-pw');



    // --- CAMBIO CLAVE AQUÍ ---
    // Antes buscaba 'route-pass', ahora busca el nuevo id 'password'
    const pwInput = document.getElementById('password');

    const loginButton = document.getElementById('btn-login');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMsg.textContent = '';

        const email = form.email.value;
        const password = form.password.value;

        loginButton.disabled = true;
        loginButton.textContent = 'Ingresando...';

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin', // <--- importante
                body: JSON.stringify({ email, password }),
            });

            if (response.ok) {
                window.location.href = '/';
            } else {
                const data = await response.json();
                errorMsg.textContent = data.error || 'Ocurrió un error inesperado.';
                loginButton.disabled = false;
                loginButton.textContent = 'Entrar';
            }
        } catch (err) {
            errorMsg.textContent = 'No se pudo conectar con el servidor.';
            console.error('Error de red al intentar iniciar sesión:', err);
            loginButton.disabled = false;
            loginButton.textContent = 'Entrar';
        }
    });

    // Esta lógica para mostrar/ocultar contraseña ya funciona con los cambios
    if (togglePwBtn && pwInput) {
        togglePwBtn.addEventListener('click', () => {
            const isPassword = pwInput.type === 'password';
            pwInput.type = isPassword ? 'text' : 'password';
            togglePwBtn.setAttribute('aria-pressed', String(!isPassword));
        });
    }
});