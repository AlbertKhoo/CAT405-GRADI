const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'gradi_secret123',
    resave: false,
    saveUninitialized: true
}));

// Routes
const indexRoutes = require('./routes/index');
app.use('/', indexRoutes);

app.listen(PORT, () => {
    console.log(`GRADI Web App running on http://localhost:${PORT}`);
});
