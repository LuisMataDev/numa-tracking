document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const errorMsg = document.getElementById('error-msg');
  const togglePwBtn = document.getElementById('toggle-pw');
  const pwInput = document.getElementById('route-pass');

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página se recargue
    errorMsg.textContent = ''; // Limpia errores anteriores

    const email = form.email.value;
    const password = form.password.value;
    const loginButton = document.getElementById('btn-login');

    // Deshabilita el botón para evitar múltiples envíos
    loginButton.disabled = true;
    loginButton.textContent = 'Ingresando...';

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        // --- ¡ACCIÓN CLAVE! ---
        // Si el login fue exitoso, redirige el navegador a la página principal.
        window.location.href = '/'; 
      } else {
        const data = await response.json();
        errorMsg.textContent = data.error || 'Ocurrió un error inesperado.';
        // Vuelve a habilitar el botón si hay un error
        loginButton.disabled = false;
        loginButton.textContent = 'Entrar';
      }
    } catch (err) {
      errorMsg.textContent = 'No se pudo conectar con el servidor.';
      console.error('Error de red al intentar iniciar sesión:', err);
      // Vuelve a habilitar el botón si hay un error de red
      loginButton.disabled = false;
      loginButton.textContent = 'Entrar';
    }
  });

  // Lógica para mostrar/ocultar la contraseña
  togglePwBtn.addEventListener('click', () => {
    const isPassword = pwInput.type === 'password';
    pwInput.type = isPassword ? 'text' : 'password';
    togglePwBtn.setAttribute('aria-pressed', String(!isPassword));
  });
});