require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middlewares
app.use(express.json());

app.use(express.json());

// 1. INICIALIZA LA SESIÓN. Es lo primero para que todas las rutas la puedan usar.
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret_peligroso',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));



app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Se requiere email y contraseña.' });
    }
    const admin = await SuperAdmin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }
    req.session.adminId = admin._id; // ¡Éxito! Creamos la sesión.
    res.status(200).json({ message: 'Login exitoso' });
  } catch (err) {
    console.error('Error en /api/admin/login', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
    }
    res.status(200).json({ message: 'Logout exitoso.' });
  });
});



// 3. La página principal (index) está PROTEGIDA
app.get('/', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.use(express.static(path.join(__dirname, 'public')));


// 4. AHORA SÍ, ponemos el guardia para el RESTO de la API
app.use('/api', isAuthenticated);



const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❗ Falta MONGODB_URI en .env');
  process.exit(1);
}

// Helper: convertir [r,g,b] -> '#rrggbb'
function rgbArrayToHex(arr) {
  if (!Array.isArray(arr) || arr.length < 3) return null;
  const clamp = (v) => Math.max(0, Math.min(255, Number(v) || 0));
  const hex = (v) => clamp(v).toString(16).padStart(2, '0');
  return `#${hex(arr[0])}${hex(arr[1])}${hex(arr[2])}`;
}
// Genera una contraseña legible y no ambigua (por defecto 8 caracteres)
function generatePassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // evita O,0,I,1 ambigüedades
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function isAuthenticated(req, res, next) {
  if (req.session.adminId) {
    return next(); // Si hay sesión, adelante.
  }
  // Si no hay sesión, y es una petición de API, devuelve error
  if (req.originalUrl.startsWith('/api/')) {
     return res.status(401).json({ error: 'No autorizado. Por favor, inicie sesión.' });
  }
  // Si no, redirige a la página de login
  res.redirect('/login.html');
}
// --- Schemas de la base de datos ---

const superAdminSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  password: { type: String, required: true }
}, { timestamps: true });

// Hook para hashear la contraseña ANTES de guardarla
superAdminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Método para comparar la contraseña ingresada con la hasheada
superAdminSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);

// Esquema para Choferes (añadir campo status)
const driverSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  license: { type: String, required: true },
  phone: { type: String },
  status: {
    type: String,
    enum: ['inactive', 'active-desocupado', 'active-ocupado'],
    default: 'inactive'
  }
}, { timestamps: true });

driverSchema.set('toJSON', {
  transform: (doc, ret) => {
    if (!ret.id && ret._id) ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const Driver = mongoose.model('Driver', driverSchema);

// Esquema para Vehículos
const vehicleSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  alias: { type: String },
  marca: { type: String, required: true },
  modelo: { type: String, required: true },
  año: { type: Number, default: new Date().getFullYear() },
  chofer: {
    id: { type: String, ref: 'Driver' },
    name: { type: String }
  }
}, { timestamps: true });

vehicleSchema.set('toJSON', {
  transform: (doc, ret) => {
    if (!ret.id && ret._id) {
      ret.id = ret._id.toString();
    }
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

// Esquema para Rutas
const routeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  color: { type: String, default: '#3b82f6' },
  coords: { type: [[Number]] },
  isTraceFree: { type: Boolean, default: false },
  puntos: { type: Number },
  estado: {
    type: String,
    // --- CAMBIO AQUÍ: Añadimos 'lista para iniciar' ---
    enum: ['pendiente', 'lista para iniciar', 'en curso', 'finalizada', 'cancelada'],
    default: 'pendiente'
  },
  vehicle: {
    id: { type: String, ref: 'Vehicle' },
    alias: { type: String },
    marca: { type: String }
  },
  driver: {
    id: { type: String, ref: 'Driver' },
    name: { type: String }
  },
  password: { type: String }
}, { timestamps: true });

routeSchema.set('toJSON', {
  transform: (doc, ret) => {
    if (ret._id) ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    if (Array.isArray(ret.color)) {
      const hex = rgbArrayToHex(ret.color);
      ret.color = hex || '#3b82f6';
    }
    if (!ret.name && ret.nombre) {
      ret.name = ret.nombre;
      delete ret.nombre;
    }
    return ret;
  }
});

const Route = mongoose.model('Route', routeSchema);

// Helper para estado de chofer
async function computeAndSetDriverStatus(driverId) {
  if (!driverId) return null;
  const driver = await Driver.findOne({ id: driverId });
  if (!driver) return null;
  const assignedRoutes = await Route.find({ 'driver.id': driverId }).select('estado').lean();
  const hasEnCurso = assignedRoutes.some(r => (r.estado || '').toLowerCase() === 'en curso');
  let newStatus = driver.status;
  if (driver.status === 'inactive') return driver;
  if (hasEnCurso) newStatus = 'active-ocupado';
  else newStatus = 'active-desocupado';
  if (driver.status !== newStatus) {
    driver.status = newStatus;
    await driver.save();
    io.emit('driversUpdated', driver.toJSON());
  }
  return driver;
}

// --- Rutas de la API para Choferes ---

app.get('/api/drivers', async (req, res) => {
  try {
    const drivers = await Driver.find().sort({ createdAt: -1 });
    res.json(drivers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener choferes' });
  }
});

app.post('/api/drivers', async (req, res) => {
  try {
    const { id, name, email, license, phone } = req.body;
    if (!id || !name || !email || !license) {
      return res.status(400).json({ error: 'Se requiere id, nombre, email y licencia.' });
    }

    const newDriver = await Driver.create({ id, name, email, license, phone });
    io.emit('driversUpdated', newDriver.toJSON());
    res.status(201).json(newDriver);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el chofer' });
  }
});

app.put('/api/drivers/:id', async (req, res) => {
  try {
    const { name, email, license, phone } = req.body;
    const updatedDriver = await Driver.findOneAndUpdate(
      { id: req.params.id },
      { name, email, license, phone },
      { new: true, runValidators: true }
    );
    if (!updatedDriver) {
      return res.status(404).json({ error: 'Chofer no encontrado' });
    }
    io.emit('driversUpdated', updatedDriver.toJSON());
    res.json(updatedDriver);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el chofer' });
  }
});

app.delete('/api/drivers/:id', async (req, res) => {
  try {
    const deletedDriver = await Driver.findOneAndDelete({ id: req.params.id });
    if (!deletedDriver) {
      return res.status(404).json({ error: 'Chofer no encontrado' });
    }
    io.emit('driversUpdated', { deletedId: req.params.id });
    res.json({ message: 'Chofer eliminado exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el chofer' });
  }
});

// Login / Logout (endpoints simples para móvil)
// Login: marca como active-desocupado (luego compute ajusta a ocupado si corresponde)
app.post('/api/drivers/:id/login', async (req, res) => {
  try {
    const driverId = req.params.id;
    const driver = await Driver.findOne({ id: driverId });
    if (!driver) return res.status(404).json({ error: 'Chofer no encontrado' });

    driver.status = 'active-desocupado';
    await driver.save();

    await computeAndSetDriverStatus(driverId); // ajusta a occupied si ya tiene ruta en curso

    const updated = await Driver.findOne({ id: driverId });
    io.emit('driversUpdated', updated.toJSON());
    res.json(updated);
  } catch (err) {
    console.error('POST /api/drivers/:id/login', err);
    res.status(500).json({ error: 'Error en login del chofer' });
  }
});

// Logout: marca inactive
app.post('/api/drivers/:id/logout', async (req, res) => {
  try {
    const driverId = req.params.id;
    const driver = await Driver.findOneAndUpdate({ id: driverId }, { status: 'inactive' }, { new: true });
    if (!driver) return res.status(404).json({ error: 'Chofer no encontrado' });
    io.emit('driversUpdated', driver.toJSON());
    res.json({ message: 'Logout exitoso', driver });
  } catch (err) {
    console.error('POST /api/drivers/:id/logout', err);
    res.status(500).json({ error: 'Error en logout del chofer' });
  }
});

// --- Rutas de la API para Vehículos ---

app.get('/api/vehicles', async (req, res) => {
  try {
    const vehicles = await Vehicle.find().sort({ createdAt: -1 });
    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener vehículos' });
  }
});

app.post('/api/vehicles', async (req, res) => {
  try {
    const { id, alias, marca, modelo, año, chofer } = req.body;
    if (!id || !marca || !modelo) {
      return res.status(400).json({ error: 'Se requiere id (placa), marca y modelo.' });
    }
    const newVehicle = await Vehicle.create({ id, alias, marca, modelo, año, chofer });
    io.emit('vehiclesUpdated', newVehicle.toJSON());
    res.status(201).json(newVehicle);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el vehículo' });
  }
});

app.put('/api/vehicles/:id', async (req, res) => {
  try {
    const { alias, marca, modelo, año, chofer } = req.body;
    const updatedVehicle = await Vehicle.findOneAndUpdate(
      { id: req.params.id },
      { alias, marca, modelo, año, chofer },
      { new: true, runValidators: true }
    );
    if (!updatedVehicle) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    io.emit('vehiclesUpdated', updatedVehicle.toJSON());
    res.json(updatedVehicle);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el vehículo' });
  }
});

app.delete('/api/vehicles/:id', async (req, res) => {
  try {
    const deletedVehicle = await Vehicle.findOneAndDelete({ id: req.params.id });
    if (!deletedVehicle) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    io.emit('vehiclesUpdated', { deletedId: req.params.id });
    res.json({ message: 'Vehículo eliminado exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el vehículo' });
  }
});

// --- Rutas de la API para Rutas ---

// Listar rutas
app.get('/api/routes', async (req, res) => {
  try {
    const routes = await Route.find().sort({ createdAt: -1 });
    res.json(routes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener rutas' });
  }
});

// Detalle de una ruta
app.get('/api/routes/:id', async (req, res) => {
  try {
    const r = await Route.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Ruta no encontrada' });
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener la ruta' });
  }
});

// Crear una ruta
app.post('/api/routes', async (req, res) => {
  try {
    const name = req.body.name || req.body.nombre;
    const coords = req.body.coords || req.body.coordenadas;
    const rawColor = req.body.color || req.body.colorArray || req.body.color_rgb;
    const vehicle = req.body.vehicle;
    const driver = req.body.driver || null;
    // --- 1. Recibe el nuevo campo ---
    const isTraceFree = req.body.isTraceFree || false;

    if (!name || !coords || !Array.isArray(coords) || coords.length < 2) {
      return res.status(400).json({ error: 'Datos de ruta inválidos: se requiere nombre y al menos 2 coordenadas' });
    }

    let color = '#3b82f6';
    if (Array.isArray(rawColor)) { /* ... tu lógica de color ... */ }

    const password = (req.body.password && String(req.body.password).trim()) ? String(req.body.password).trim() : generatePassword(8);

    // --- 2. Añade el campo al crear el documento ---
    const newRoute = await Route.create({ name, color, coords, vehicle, driver, password, isTraceFree });

    io.emit('routesUpdated', newRoute.toJSON());

    if (driver && driver.id) {
      await computeAndSetDriverStatus(driver.id);
    }

    res.status(201).json(newRoute);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear ruta' });
  }
});

// Actualizar una ruta
app.put('/api/routes/:id', async (req, res) => {
  try {
    // --- 1. Recibe el nuevo campo 'isTraceFree' ---
    const { name, color, coords, vehicle, driver, isTraceFree } = req.body;

    // Construir objeto de actualización
    // --- 2. Añádelo al objeto de actualización ---
    const update = { name, color, coords, vehicle, driver, isTraceFree };

    if (req.body.password !== undefined) {
      update.password = String(req.body.password);
    }

    const updatedRoute = await Route.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!updatedRoute) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }
    io.emit('routesUpdated', updatedRoute.toJSON());

    if (updatedRoute.driver && updatedRoute.driver.id) {
      await computeAndSetDriverStatus(updatedRoute.driver.id);
    }

    res.json(updatedRoute);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la ruta' });
  }
});

// Eliminar una ruta
app.delete('/api/routes/:id', async (req, res) => {
  try {
    const deletedRoute = await Route.findByIdAndDelete(req.params.id);
    if (!deletedRoute) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }
    io.emit('routesUpdated', { deletedId: req.params.id });
    // si tenía driver, recalcular su estado asíncronamente
    if (deletedRoute.driver && deletedRoute.driver.id) {
      // no await para no bloquear la respuesta
      computeAndSetDriverStatus(deletedRoute.driver.id).catch(e => console.error(e));
    }
    res.json({ message: 'Ruta eliminada exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la ruta' });
  }
});

// PATCH /api/routes/:id/status 
app.patch('/api/routes/:id/status', async (req, res) => {
  try {
    const id = req.params.id;
    const estado = (req.body.estado !== undefined && req.body.estado !== null)
      ? String(req.body.estado)
      : (req.body.status !== undefined && req.body.status !== null)
        ? String(req.body.status)
        : '';

    if (!estado) {
      return res.status(400).json({ error: 'Se requiere campo "estado".' });
    }

    // --- CAMBIO 1: Añadir 'lista para iniciar' a los estados permitidos ---
    const ALLOWED = ['pendiente', 'lista para iniciar', 'en curso', 'finalizada', 'cancelada'];
    if (!ALLOWED.includes(estado)) {
      return res.status(400).json({ error: 'Estado no permitido', allowed: ALLOWED });
    }

    const route = await Route.findById(id);
    if (!route) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    if (estado === 'en curso') {
      // --- CAMBIO 2: VALIDACIÓN DE SEGURIDAD CLAVE ---
      // Solo se puede iniciar una ruta si el chofer ya se autenticó para ella.
      if (route.estado !== 'lista para iniciar') {
        return res.status(400).json({
          error: 'La ruta no puede ser iniciada. El chofer debe iniciar sesión en la app primero para que la ruta esté "Lista para iniciar".'
        });
      }
      // --- Fin de la nueva validación ---

      // Las validaciones originales siguen siendo importantes
      if (!route.driver || !route.driver.id) {
        return res.status(400).json({ error: 'No hay chofer asignado a la ruta. Asigna un chofer antes de iniciar la ruta.' });
      }
      const driver = await Driver.findOne({ id: route.driver.id });
      if (!driver) {
        return res.status(400).json({ error: 'Chofer asignado no existe.' });
      }
      if (driver.status !== 'active-desocupado') {
        return res.status(400).json({ error: `Chofer no disponible. Estado actual: ${driver.status}` });
      }
    }

    // Si todas las validaciones pasan, se actualiza el estado
    const updated = await Route.findByIdAndUpdate(id, { estado }, { new: true, runValidators: true });
    if (!updated) {
      return res.status(404).json({ error: 'Ruta no encontrada durante la actualización' });
    }

    // Lógica para actualizar el estado del chofer
    if (estado === 'en curso' && updated.driver && updated.driver.id) {
      const driver = await Driver.findOne({ id: updated.driver.id });
      if (driver) {
        driver.status = 'active-ocupado';
        await driver.save();
        io.emit('driversUpdated', driver.toJSON());
      }
    } else if (updated.driver && updated.driver.id) {
      // Si el estado cambia a finalizada, cancelada, etc., recalcular el estado del chofer
      await computeAndSetDriverStatus(updated.driver.id);
    }

    // Notificar a los clientes sobre el cambio de estado de la ruta
    io.emit('routeStatusChanged', updated.toJSON());
    res.json(updated);

  } catch (err) {
    console.error('PATCH /api/routes/:id/status', err);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

// --- Endpoint de Login de Ruta CORREGIDO ---
app.post('/api/routes/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Se requiere email y password' });

    const routeDoc = await Route.findOne({ password: String(password).trim() });
    if (!routeDoc) return res.status(404).json({ error: 'Ruta no encontrada (password inválida)' });

    // Validación adicional: Solo se puede loguear en rutas pendientes.
    if (routeDoc.estado !== 'pendiente') {
      return res.status(403).json({ error: `La ruta ya no está pendiente. Estado actual: ${routeDoc.estado}` });
    }

    let driver = null;
    if (routeDoc.driver && routeDoc.driver.id) {
      driver = await Driver.findOne({ id: routeDoc.driver.id });
      if (driver && driver.email && driver.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(403).json({ error: 'Email no corresponde al chofer asignado a esa ruta' });
      }
    } else {
      driver = await Driver.findOne({ email: email.toLowerCase() });
    }

    if (!driver) {
      return res.status(404).json({ error: 'Chofer no encontrado con ese email.' });
    }

    // --- CAMBIO CLAVE: Actualizar el estado de la RUTA ---
    routeDoc.estado = 'lista para iniciar';
    // Si la ruta no tenía chofer, se lo asignamos ahora
    if (!routeDoc.driver || !routeDoc.driver.id) {
      routeDoc.driver = { id: driver.id, name: driver.name };
    }
    await routeDoc.save();
    // Notificamos al panel de administración que el estado de la ruta cambió
    io.emit('routeStatusChanged', routeDoc.toJSON());
    // --- FIN DEL CAMBIO CLAVE ---

    // Ahora, actualizamos el estado del chofer a 'disponible'
    driver.status = 'active-desocupado';
    await driver.save();
    io.emit('driversUpdated', driver.toJSON());

    return res.json({ route: routeDoc.toJSON(), driver: driver.toJSON() });

  } catch (err) {
    console.error('POST /api/routes/login', err);
    res.status(500).json({ error: 'Error en login de ruta' });
  }
});

// --- Lógica de Socket.IO ---
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);

  socket.on('joinRoute', ({ routeId, driverId }) => {
    if (routeId) {
      socket.join(String(routeId));
      console.log(`Driver socket ${socket.id} se unió a route:${routeId}`);
    }
  });

  // <<--- CAMBIO CLAVE: Se emite a todos los clientes (global)
  socket.on('driverLocation', (data) => {
    // Reenviamos la actualización de ubicación a TODOS los clientes conectados (paneles de admin)
    io.emit('locationUpdate', data);
  });

  socket.on('requestFinishRoute', (data) => {
    console.log(`[Servidor] Solicitud de finalización recibida para ruta ${data.routeId}. Reenviando al admin.`);
    io.emit('finishRouteRequested', data);
  });

  socket.on('resolveFinishRequest', async ({ routeId, driverId, accepted }) => {
    console.log(`[Servidor] Recibida respuesta del admin para ruta ${routeId}. Decisión: ${accepted ? 'ACEPTADA' : 'RECHAZADA'}`);
    if (accepted) {
      try {
        const route = await Route.findByIdAndUpdate(routeId, {
          estado: 'finalizada',
          password: null
        }, { new: true });

        if (route) {
          console.log(`[Servidor] Ruta ${routeId} marcada como finalizada.`);
          io.emit('routeStatusChanged', route.toJSON());
          io.to(String(routeId)).emit('routeHasFinished');
        } else {
          console.log(`[Servidor] No se encontró la ruta ${routeId} para finalizar.`);
        }

        if (driverId) {
          const driver = await Driver.findOneAndUpdate({ id: driverId }, { status: 'inactive' }, { new: true });
          if (driver) {
            console.log(`[Servidor] Chofer ${driverId} marcado como inactivo.`);
            io.emit('driversUpdated', driver.toJSON());
          }
        }
      } catch (err) {
        console.error(`[Servidor] Error al finalizar ruta ${routeId}:`, err);
      }
    } else {
      io.to(String(routeId)).emit('finishRequestDenied', { message: 'El administrador ha rechazado la solicitud.' });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado:', socket.id);
  });
});


// Conectar a Mongo y arrancar servidor
async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => console.log(`🌐 Servidor escuchando en http://localhost:${PORT}`));
  } catch (err) {
    console.error('❌ Error conectando a MongoDB', err);
    process.exit(1);
  }
}

start();

