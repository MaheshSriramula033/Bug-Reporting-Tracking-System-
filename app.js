// app.js
// Single-file Express + Mongoose app implementing the Bug Tracker

require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('express-flash');
const bcrypt = require('bcrypt');
const methodOverride = require('method-override');
const User = require('./models/User');
const Bug = require('./models/Bug');

const app = express();

// --- Config / env ---
const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_SECRET = process.env.SESSION_SECRET ;
const PORT = process.env.PORT || 3000;

// --- Connect to MongoDB ---
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// --- App setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGODB_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));
app.use(flash());

// --- Middleware helpers ---
app.use(async (req, res, next) => {
  res.locals.currentUser = req.session.userId ? {
    _id: req.session.userId,
    name: req.session.userName,
    role: req.session.userRole
  } : null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    req.flash('error', 'You must be logged in');
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.userRole !== 'admin') {
    req.flash('error','Admin access required');
    return res.redirect('/');
  }
  next();
}

// --- Routes ---
// Home
app.get('/', async (req, res) => {
  res.render('index');
});
// ---------- Auth: Register / Login / Logout ----------
app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      req.flash('error','Please fill all fields');
      return res.redirect('/register');
    }
    const existing = await User.findOne({ email });
    if (existing) {
      req.flash('error','Email already in use');
      return res.redirect('/register');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ name, email, passwordHash, role: role === 'admin' ? 'admin' : 'reporter' });
    await user.save();
    req.flash('success','Registered. Please login.');
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    req.flash('error','Registration failed');
    res.redirect('/register');
  }
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error','Please Register First!');
      return res.redirect('/register');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      req.flash('error','Invalid credentials');
      return res.redirect('/login');
    }
    // set session
    req.session.userId = user._id;
    req.session.userName = user.name;
    req.session.userRole = user.role;
    req.flash('success','Logged in');
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error','Login failed');
    res.redirect('/login');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// ---------- Bug routes ----------
// Show form to create bug
app.get('/bugs/new', requireLogin, (req, res) => {
  res.render('bugs/new');
});

// Create bug
app.post('/bugs', requireLogin, async (req, res) => {
  try {
    const { title, description, severity } = req.body;
    const bug = new Bug({
      title,
      description,
      severity,
      reporter: req.session.userId
    });
    await bug.save();
    req.flash('success','Bug reported');
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error','Failed to report bug');
    res.redirect('/bugs/new');
  }
});

// Dashboard: lists bugs with search/filter/pagination (basic)
app.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const { q, status, severity, page = 1 } = req.query;
    const limit = 10;
    const filter = {};

    // If reporter (not admin) show only their bugs
    if (req.session.userRole !== 'admin') {
      filter.reporter = req.session.userId;
    }

    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (q) filter.title = { $regex: q, $options: 'i' };

    const bugs = await Bug.find(filter)
      .populate('reporter', 'name email')
      .sort({ createdAt: -1 })
      .skip((page-1)*limit)
      .limit(limit)
      .exec();

    const total = await Bug.countDocuments(filter);

    res.render('dashboard', {
      bugs,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      filters: { q, status, severity }
    });
  } catch (err) {
    console.error(err);
    req.flash('error','Could not load dashboard');
    res.redirect('/');
  }
});

// View single bug
app.get('/bugs/:id', requireLogin, async (req, res) => {
  try {
    const bug = await Bug.findById(req.params.id).populate('reporter', 'name email');
    if (!bug) {
      req.flash('error','Bug not found');
      return res.redirect('/dashboard');
    }
    // permission: reporters can view only their own (unless admin)
    if (req.session.userRole !== 'admin' && String(bug.reporter._id) !== String(req.session.userId)) {
      req.flash('error','Not authorized to view this bug');
      return res.redirect('/dashboard');
    }
    res.render('bugs/show', { bug });
  } catch (err) {
    console.error(err);
    req.flash('error','Error loading bug');
    res.redirect('/dashboard');
  }
});

// Edit bug form
app.get('/bugs/:id/edit', requireLogin, async (req, res) => {
  try {
    const bug = await Bug.findById(req.params.id);
    if (!bug) { req.flash('error','Bug not found'); return res.redirect('/dashboard'); }
    if (req.session.userRole !== 'admin' && String(bug.reporter) !== String(req.session.userId)) {
      req.flash('error','Not authorized to edit this bug');
      return res.redirect('/dashboard');
    }
    res.render('bugs/edit', { bug ,
      userRole: req.session.userRole 
    });
  } catch (err) {
    console.error(err);
    req.flash('error','Error loading edit form');
    res.redirect('/dashboard');
  }
});

// Update bug (status/title/description/severity)
app.put('/bugs/:id', requireLogin, async (req, res) => {
  try {
    const { title, description, severity, status } = req.body;
    const bug = await Bug.findById(req.params.id);
    if (!bug) { req.flash('error','Bug not found'); return res.redirect('/dashboard'); }
    if (req.session.userRole !== 'admin' && String(bug.reporter) !== String(req.session.userId)) {
      req.flash('error','Not authorized to update this bug');
      return res.redirect('/dashboard');
    }
    // Update fields
    if (title) bug.title = title;
    if (description) bug.description = description;
    if (severity) bug.severity = severity;
    if (status) bug.status = status;
    await bug.save();
    req.flash('success','Bug updated');
    res.redirect('/bugs/' + req.params.id);
  } catch (err) {
    console.error(err);
    req.flash('error','Update failed');
    res.redirect('/dashboard');
  }
});

// Admin-only: list all users (simple view)
app.get('/admin/users', requireAdmin, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.render('admin/users', { users });
});

// Utility: seed an admin (call once, then remove or protect)
app.get('/setup/create-admin', async (req, res) => {
  try {
    const exists = await User.findOne({ email: 'admin@example.com' });
    if (exists) {
      return res.send('Admin already exists. Delete it and re-run if you want a fresh one.');
    }
    const passwordHash = await bcrypt.hash('adminpass', 10);
    const admin = new User({ name: 'Admin', email: 'admin@example.com', passwordHash, role: 'admin' });
    await admin.save();
    res.send('Admin created: admin@example.com / adminpass');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to create admin');
  }
});

// 404
app.use((req, res) => {
  res.status(404).render('404');
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
