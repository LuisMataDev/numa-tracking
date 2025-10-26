require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const bcrypt = require('bcrypt');

// Re-usa el schema que ya definiste en tu server.js
const superAdminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }
}, { timestamps: true });

superAdminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) { next(err); }
});

const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);

const MONGODB_URI = process.env.MONGODB_URI;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const createAdmin = async () => {
  if (!MONGODB_URI) {
    console.error('❗ Falta MONGODB_URI en .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB para crear admin.');

    rl.question('Introduce el email del administrador: ', (email) => {
      rl.question('Introduce la contraseña del administrador: ', async (password) => {
        if (!email || !password || password.length < 8) {
          console.error('❌ Email y contraseña son requeridos (mínimo 8 caracteres para la contraseña).');
          rl.close();
          process.exit(1);
        }
        
        try {
          const existingAdmin = await SuperAdmin.findOne({ email: email.toLowerCase() });
          if (existingAdmin) {
            console.warn('⚠️  Ya existe un administrador con ese email.');
            rl.close();
            process.exit(0);
          }

          const newAdmin = new SuperAdmin({ email, password });
          await newAdmin.save();
          console.log(`✅ ¡Administrador "${email}" creado exitosamente!`);
        } catch (dbError) {
          console.error('❌ Error al guardar el administrador:', dbError);
        } finally {
          rl.close();
          await mongoose.disconnect();
          process.exit(0);
        }
      });
    });
  } catch (connectError) {
    console.error('❌ Error conectando a MongoDB:', connectError);
    process.exit(1);
  }
};

createAdmin();