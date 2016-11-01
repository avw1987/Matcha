var express = require('express');
var session = require('express-session');
var user = require('./user');
var router = express.Router();

var sess;

router.get('/partials/account', function(req, res) {
	sess = req.session;
	res.render('account', {
		user: sess.user
	});
});

router.get('/partials/home', function(req, res) {
    sess = req.session;
	if (sess.user) {
		res.render('home', {
			user: sess.user
		});
	} else {
		res.render('register');
	}
});

router.get('/partials/license', function(req, res) {
	res.render('license');
});

router.post('/api/login', function(req, res) {
    sess = req.session;
    user.login(req.body.username, req.body.password, function(result) {
		sess.user = result;
		console.log('session user: ' + sess.user);
		res.json(result);
	});
});

router.post('/api/logout', function(req, res) {
	req.session.user = null;
	res.json(true);
});

/**
 * Returns true if username is free, false if username exists
 */
router.post('/api/check_username', function(req, res) {
	if (req.body.username) {
		user.checkUsername(req.body.username, function(result) {
			res.json((result === 1) ? false : true);
		});
	} else {
		console.log('No username field');
		res.json(false);
	}
});

router.post('/api/check_email', function(req, res) {
	if (req.body.email) {
		user.checkEmail(req.body.email, function(result) {
			res.json((result === 1) ? false : true);
		});
	} else {
		console.log('No email field');
		res.json(false);
	}
});

router.post('/api/register', function(req, res) {
	console.log(req.body);
	var r = req.body;
	user.add(r.username, r.firstname, r.lastname, r.gender, r.lookingFor, r.birthdate, r.email, r.password, function(result) {
		res.json(result);
	});
});

router.post('/api/confirm', function(req, res) {
	console.log(req.body);
	user.confirm(req.body);
});

/**
 * Has to be last route. Do not put any code under this
 */
router.get('*', function(req, res) {
	res.render('index');
});

module.exports = router;