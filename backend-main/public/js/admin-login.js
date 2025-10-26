// 1. La página de login es PÚBLICA
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
// También el JS y CSS del login deben ser públicos (express.static ya lo hace)

// 2. La ruta raíz ('/') ahora está PROTEGIDA
app.get('/', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html')); // Sirve tu panel de admin
});

// 3. ¡IMPORTANTE! Proteger TODAS tus rutas de API existentes con una sola línea
app.use('/api', isAuthenticated); 
// Este middleware se aplicará a todas las rutas que empiecen con /api, 
// EXCEPTO las que definimos ANTES de esta línea (como /api/admin/login).
// Por eso, la sección "Rutas de API para Administración" debe ir ANTES de esta línea.