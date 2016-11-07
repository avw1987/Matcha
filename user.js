module.exports = {
    add: add,
	modify: modify,
    listAll: users,
    login: login,
    find: find,
    get: get,
    checkUsername: checkUsername,
    checkEmail: checkEmail,
    confirmEmail: confirmEmail,
    sendReset: sendReset,
    confirmReset: confirmReset,
    setLocation: setLocation,
	getTags: getTags
};

var apoc = require('apoc');
var util = require('util');
var hash = require('./hashsalt');
var server = require('./database').server;
var email = require('./email');
var mongo = require('./myMongo');
var ObjectId = require('mongodb').ObjectId;


/**********************************************************
 * Tests input for add user and modify user               *
 * @method testInput                                      *
 * @param  {Object}   input    Object of the input        *
 * @param  {Function} callback Called if a function fails *
 * @return {Boolean}           true if failed             *
 **********************************************************/
function testInput(input, callback) {
    if (typeof input.username !== 'string' ||
        typeof input.firstname !== 'string' ||
        typeof input.lastname !== 'string' ||
        (typeof input.gender !== 'string' && input.gender.length() !== 1) ||
        typeof input.seeking !== 'object' ||
        typeof input.birthdate !== 'object' ||
        typeof input.email !== 'string' ||
        typeof input.password !== 'string' ||
        typeof input.birthdate.day !== 'number' ||
        typeof input.birthdate.month !== 'number' ||
        typeof input.birthdate.year !== 'number' ||
        typeof input.seeking.male !== 'boolean' ||
        typeof input.seeking.female !== 'boolean' ||
        typeof input.seeking.other !== 'boolean') {
        callback('field of incorrect type');
		console.log('Input error');
		console.log(input);
        return true;
    }
    return false;
}

/*******************************************************************************************************************************
 * Adds a new user to the database, all parameters are required                                                                *
 * @param   {string}    username    User's username                                                                            *
 * @param   {string}    firstname   User's firstname                                                                           *
 * @param   {string}    lastname    User's lastname                                                                            *
 * @param   {char}      gender      User's gender, 'M', 'F', 'O' accepted                                                      *
 * @param   {array}     seeking     User's sexual attraction, array: {male: true|false, female: true|false, other: true|false} *
 * @param   {array}     birthdate   User's birthdate, array: {day: [1-31], month: [1-12], year: [0-9]{4}}                      *
 * @param   {string}    email       User's email address                                                                       *
 * @param   {string}    password    User's password                                                                            *
 * @param   {Function}  callback    Callback function for when the database returns                                            *
 *******************************************************************************************************************************/
function add(username, firstname, lastname, gender, seeking, birthdate, email, password, callback) {
    if (testInput({
            username: username,
            firstname: firstname,
            lastname: lastname,
            gender: gender,
            seeking: seeking,
            birthdate: birthdate,
            email: email,
            password: password
        }, callback)) {
        return true;
    }

    /*****************************************************************
     * Converts birthdate in year, month, date array into epoch time *
     *****************************************************************/
    birthdate = parseInt(new Date(birthdate.year, birthdate.month, birthdate.day).getTime() / 1000);

    /*************************
     * Adds user to database *
     *************************/
    var id = null;
    mongo.insertUser({
        username: username,
        firstname: firstname,
        lastname: lastname,
        birthdate: birthdate,
        email: email,
        password: hash.createHash(password)
    }, function(result) {
        if (result.ok === true) {
            id = result.id;
            /*********************************************************************************
             * First, the user's node gets created, the relationships to the genders need    *
             *  to be created                                                                *
             *                                                                               *
             * For the SEEKING relationship, a node is first MERGEd (so found if exists or   *
             *  created if not exists).                                                      *
             * The node is matched and the relationship created seperately because neo4j     *
             *  handles a merge specifying a node and a relationship as unique in each case, *
             *  and a new node is created. Matching separatly solves this issue.             *
             * Then the relationship is created with another MERGE. The relationships are    *
             *  made with MERGEs so that there's no accidental possibiility to make multiple *
             *  relationships of the same kind.                                              *
             *********************************************************************************/
            var query = "CREATE (a:Person {id: '`id`', username: '`username`'}) MERGE (g:Gender {gender: '`gender`'}) MERGE (a)-[:GENDER]->(g)";
            if (seeking.male === true) {
                query += " MERGE (m:Gender {gender: 'M'}) MERGE (a)-[:SEEKING]->(m)";
            }
            if (seeking.female === true) {
                query += " MERGE (f:Gender {gender: 'F'}) MERGE (a)-[:SEEKING]->(f)";
            }
            if (seeking.other === true) {
                query += " MERGE (o:Gender {gender: 'O'}) MERGE (a)-[:SEEKING]->(o)";
            }
            apoc.query(query, {}, {
                    id: id,
					username: username,
                    gender: gender
                })
                .exec(server)
                .then(function(result) {
                    callback(true);
                    return false;
                }, function(fail) {
                    console.log(fail);
                    callback(fail);
                    return true;
                });
        } else {
            console.log('Error creating user in Mongo: ' + result.err);
			callback(result.err);
        }
    });
}

/**************************************************************************
 * Updates user profile                                                   *
 * @method modify                                                         *
 * @param  {Object}   update   Contains all the data that needs updating  *
 * @param  {Function} callback Called when the update is complete         *
 * @return {Boolean}           true if error occured, false if successful *
 **************************************************************************/
function modify(update, callback) {
    if (testInput(update, callback)) {
        return true;
    }

	update.birthdate = parseInt(new Date(update.birthdate.year, update.birthdate.month, update.birthdate.day).getTime() / 1000);

    var id = null;
	var set = {
		username: update.username,
		firstname: update.firstname,
		lastname: update.lastname,
		birthdate: update.birthdate,
		email: update.email,
		bio: update.bio
	};
	if (update.password !== undefined) {
		set.password = hash.createHash(update.password);
	}
    mongo.update('users', {_id: new ObjectId(update.id)}, {$set: set}, function(result) {
        if (result === true) {
            var query = "MATCH (a:Person {id: '`id`'}) MATCH (a)-[g:GENDER]->(:Gender) MATCH (a)-[s:SEEKING]->(:Gender) MATCH (a)-[t:TAG]->(:Tag) DELETE g, s, t SET a.username = '`username`'";
			query += " MERGE (n:Gender {gender: '`gender`'}) MERGE (a)-[:GENDER]->(n)";
            if (update.seeking.male === true) {
                query += " MERGE (m:Gender {gender: 'M'}) MERGE (a)-[:SEEKING]->(m)";
            }
            if (update.seeking.female === true) {
                query += " MERGE (f:Gender {gender: 'F'}) MERGE (a)-[:SEEKING]->(f)";
            }
            if (update.seeking.other === true) {
                query += " MERGE (o:Gender {gender: 'O'}) MERGE (a)-[:SEEKING]->(o)";
            }
			update.tags.forEach(function(tag, index) {
				var name = JSON.stringify(String(tag.name));
				name = name.substring(1, name.length - 1);
				var type = JSON.stringify(String(tag.type));
				type = type.substring(1, type.length - 1);
				query += ` MERGE (t${index}:Tag {name: '${name}', type: '${type}'}) MERGE (a)-[:TAG]->(t${index})`;
			});
			console.log(query);
            apoc.query(query, {}, {
                    id: update.id,
					username: update.username,
                    gender: update.gender
                })
                .exec(server)
                .then(function(result) {
                    callback(true);
                    return false;
                }, function(fail) {
                    console.log(fail);
                    callback(fail);
                    return true;
                });
        } else {
            console.log('Error creating user in Mongo: ' + result.err);
			callback('Mongo error');
        }
    });
}

/**************************************************************************************************
 * Returns full details of all the nodes in the database of type Person (For debug purposes only) *
 * @return {null}                                                                                 *
 **************************************************************************************************/
function users() {
    mongo.find('users', {}, function(result) {
        console.log(util.inspect(result, {
            depth: null
        }));
    });
}

/**************************************************************************************
 * Attemps to login with the provided credentials                                     *
 * @param   {string}    username    Username crediential                              *
 * @param   {string}    password    Password crediential                              *
 * @param   {Function}  callback    Callback function called when database returns    *
 * @return  {null}                                                                    *
 **************************************************************************************/
function login(username, password, callback) {
    mongo.find('users', {
        username: username
    }, function(result) {
        if (result.length === 1) {
			if (result[0].token.email === null) {
				if (hash.checkHash(result[0].password, password)) {
	                callback({
	                    id: result[0]._id,
	                    username: result[0].username
	                });
	            } else {
	                callback('Incorrect username or Password');
	            }
			} else {
				callback('You need to verify your email address before you can log in');
			}
        } else {
            callback('Incorrect Username or password');
        }
    });
}

/**************************************************************************
 * Finds a user and returns their information in the same format as login *
 * @method find                                                           *
 * @param  {String}   id       Database ID of the user                    *
 * @param  {Function} callback Called when the database returns           *
 * @return {null}                                                         *
 **************************************************************************/
function find(id, callback) {
    mongo.find('users', {
        _id: new ObjectId(id)
    }, function(result) {
        if (result.length === 1) {
            callback({
                id: result._id,
                username: result.username
            });
        } else {
            callback(false);
        }
    });
}

/**************************************************************************
 * Gets a user all their information apart from the password              *
 * @method get                                                            *
 * @param  {String}   id       Database ID of the user                    *
 * @param  {Function} callback Called when the database returns           *
 * @return {null}                                                         *
 **************************************************************************/
function get(id, callback) {
    mongo.find('users', {
        _id: new ObjectId(id)
    }, function(user) {
        if (user.length === 1) {
            user = user[0];
            user.id = user._id;
            delete user._id;
            delete user.password;
            delete user.token;
            apoc.query("MATCH (p:Person {id: '`id`'}) MATCH (p)-[:GENDER]->(g:Gender) MATCH (p)-[:SEEKING]->(s:Gender) RETURN g.gender, COLLECT(s.gender)", {}, {
                    id: user.id
                })
                .exec(server)
                .then(function(gender) {
					console.log(require('util').inspect(gender, { depth: null }));
                    gender = gender[0].data[0].row;
                    user.gender = gender[0];
                    user.seeking = {
                        male: false,
                        female: false,
                        other: false
                    };
                    gender[1].forEach(function(value) {
                        switch (value) {
                            case 'M':
                                user.seeking.male = true;
                                break;
                            case 'F':
                                user.seeking.female = true;
                                break;
                            case 'O':
                                user.seeking.other = true;
                        }
                    });
					console.log(`USER: ${user}`);
                    callback(user);
                }, function(fail) {
                    console.log(fail);
                    callback(fail);
                });
        } else {
            callback(false);
        }
    });
}

/*******************************************************************************
 * Sets the location of the user in the database                               *
 * @method setLocation                                                         *
 * @param  {Object}    coordinates {latitude: {Number}, longitude: {Number}}   *
 * @param  {String}    username    Username of the user to add the location to *
 * @param  {Function}  callback    Returns the vaue from the update function   *
 *******************************************************************************/
function setLocation(coordinates, username, callback) {
    mongo.update('users', {
        username: username
    }, {
        $set: {
            location: coordinates
        }
    }, callback);
}

/*************************************************************************************************************
 * Checks if the username exists in the database                                                             *
 * @param   {string}    username    The username needed checking                                             *
 * @param   {Function}  callback    Function to call when the database returns                               *
 * @return  {int}                   Returns the number of nodes containing the username, should be 1 or 0    *
 *************************************************************************************************************/
function checkUsername(username, callback) {
    mongo.find('users', {
        username: username
    }, function(result) {
        callback((result.length === 0));
    });
}

/**********************************************************************************************************
 * Checks if the email address exists in the database                                                     *
 * @param   {string}    email       The email address needed checking                                     *
 * @param   {Function}  callback    Function to call when the database returns                            *
 * @return  {int}                   Returns the number of nodes containing the email, should be 1 or 0    *
 **********************************************************************************************************/
function checkEmail(email, callback) {
    mongo.find('users', {
        email: email
    }, function(result) {
        callback((result.length === 0));
    });
}

/*******************************************************************************************
 * Gets the link from the confirmation email and removes the restriction from the database *
 * @method confirmEmail                                                                    *
 * @param  {String}     link     The link sent in the email                                *
 * @param  {Function}   callback Called when the database returns, true|false              *
 * @return {null}                                                                          *
 *******************************************************************************************/
function confirmEmail(link, callback) {
    mongo.update('users', {
        'token.email': link
    }, {
        $set: {
            'token.email': null
        }
    }, callback);
}

/**************************************************************************
 * Sends the password reset email                                         *
 * @method sendReset                                                      *
 * @param  {String}   usernameEmail Username or email address of the user *
 * @param  {Function} callback      Called when the email is sent         *
 **************************************************************************/
function sendReset(usernameEmail, callback) {
    var token = hash.saltGen(16);
    mongo.update('users', {
        $or: [{
            username: usernameEmail
        }, {
            email: usernameEmail
        }]
    }, {
        $set: {
            'token.reset': token
        }
    }, function(result) {
        if (result) {
            mongo.find('users', {
                $or: [{
                    username: usernameEmail
                }, {
                    email: usernameEmail
                }]
            }, function(findRes) {
                email.sendReset(findRes[0].email, findRes[0].username, `http://localhost:8080/reset/${token}`, callback);
            });
        } else {
            callback(false);
        }
    });
}

/*************************************************************************************
 * Confirms the password reset request                                               *
 * @method confirmReset                                                              *
 * @param  {String}     link     Link sent in the email to reset the user's password *
 * @param  {Function}   callback called when the database returns                    *
 *************************************************************************************/
function confirmReset(link, password, callback) {
    mongo.update('users', {
        'token.reset': link
    }, {
        $set: {
            'token.reset': null,
            password: hash.createHash(password)
        }
    }, callback);
}

function getTags(id, callback) {
	if (id === undefined || id === null) {
		id = '123abc'; // ID that does not exist
	}
	apoc.query("MATCH (:Person {id: '`id`'})-[:TAG]->(m:Tag) WITH COLLECT(m) AS m MATCH (t:Tag) RETURN COLLECT(t), m", {}, {
		id: id
	})
	.exec(server)
	.then(function(result) {
		console.log(require('util').inspect(result, { depth: null }));
		callback(result[0].data[0].row);
	}, function(fail) {
		console.log(fail);
		callback(fail);
	});
}