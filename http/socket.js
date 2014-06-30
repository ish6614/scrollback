/*
	Scrollback: Beautiful text chat for your community.
	Copyright (c) 2014 Askabt Pte. Ltd.

This program is free software: you can redistribute it and/or modify it
under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or any
later version.

This program is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see http://www.gnu.org/licenses/agpl.txt
or write to the Free Software Foundation, Inc., 59 Temple Place, Suite 330,
Boston, MA 02111-1307 USA.
*/

/*
	Websockets gateway
*/

/* global require, exports, setTimeout */

var sockjs = require("sockjs"), core,
	// api = require("./api.js"),
	log = require("../lib/logger.js"),
	config = require("../config.js"),
	generate = require("../lib/generate.js");

var internalSession = Object.keys(config.whitelists)[0];

var rConns = {}, uConns = {}, sConns = {}, urConns = {};
var sock = sockjs.createServer();

sock.on('connection', function (socket) {
	var conn = { socket: socket };
	socket.on('data', function(d) {
		var e;
		try { d = JSON.parse(d); log ("Socket received ", d); }
		catch(e) { log("ERROR: Non-JSON data", d); return; }

		if (!d.type) return;
		d.returned = "yes";
		if(d.type == 'init' && d.session) {
			if(d.session == internalSession) return;
			conn.session = d.session; // Pin the session and resource.
			conn.resource  = d.resource;
			if (!sConns[d.session]) {
				sConns[d.session] = [];
				sConns[d.session].push(conn);
			} else {
				if(sConns[d.session].indexOf(conn) == -1) {
					sConns[d.session].push(conn);
				}
			}
		}
		else if (conn.session) {
			d.session = conn.session;
			d.resource  = conn.resource;
		}

		if(d.type == 'back') {
			//just need for back as storeBack will be called before actionValidator
			if(!d.to) {
				e = {type: 'error', id: d.id, message: "INVALID_ROOM"};
				conn.send(e);
				return;
			} else if(!d.from) {
				e = {type: 'error', id: d.id, message: "INVALID_USER"};
				conn.send(e);
				return;
			}
			if(!verifyBack(conn, d)){
				storeBack(conn, d);
				conn.send(d);
				return;
			}
		}
		core.emit(d.type, d, function(err, data) {
			var e, action;
			if(err) {
				e = {type: 'error', id: d.id, message: err.message};
				log("Sending Error: ", e);
				return conn.send(e);
			}
			if(data.type == 'back') {
				/* this is need because we dont have the connection object
				of the user in the rconn until storeBack is called*/
				conn.send(data);
				storeBack(conn, data);
				return;
			}
			if(data.type == 'room') {
				/* this is need because we dont have the connection object in the
				rconn until the room can be setup and a back message is sent.*/
				if(!data.old || !data.old.id) conn.send(data);
				// return;
			}
			if(data.type == 'away') storeAway(conn, data);
			if(data.type == 'init') {
				if(data.old){
					data.occupantOf.forEach(function(e) {
						var role, i,l;

						for(i=0,l=data.memberOf.length;i<l;i++) {
							if(data.memberOf[i].id ==e.id) {
								role = data.memberOf[i].role;
								break;
							}
						}
						
						data.user.role = role;
                        action = {id: generate.uid(), type: "back",to: e.id, from: data.user.id, session: data.session,user: data.user, room: e};
						emit({id: generate.uid(), type: "away", to: e.id, from: data.old.id, user: data.old, room: e});
                        
                        storeBack(conn, action);
                        if(verifyBack(conn, action)) emit(action);
					});	
				}
				storeInit(conn, data);
			}
			if(data.type == 'user') processUser(conn, data);
			if(['getUsers', 'getTexts', 'getRooms', 'getThreads'].indexOf(data.type)>=0){
				conn.send(data);
			}

			/* no need to send it back to the connection object when no error,
                emit function will take care of that.
				conn.send(data);
			 */
		});
	});

	conn.send = function(data) {
		socket.write(JSON.stringify(data));
	};
	socket.on('close', function() { handleClose(conn); });
});

function processUser(conn, user) {
	if(/^guest-/.test(user.from)) {
		core.emit("init",  {time: new Date().getTime(), to: 'me', session: conn.session, resource: conn.resource, type: "init"});
	}
}
function storeInit(conn, init) {
	if(!uConns[init.user.id]) uConns[init.user.id] = [];
	sConns[init.session].forEach(function(c) {
		var index;
		if(init.old && init.old.id && uConns[init.old.id]) {
			index = uConns[init.old.id].indexOf(c);
			uConns[init.old.id].splice(index, 1);
		}

		uConns[init.user.id].push(c);

		init.occupantOf.forEach(function(room) {
			if(init.old) {
				index = urConns[init.old.id+":"+room.id].indexOf(c);
				urConns[init.old.id+ ":"+ room.id].splice(index, 1);
			}
			if(!urConns[init.user.id+":"+room.id]) urConns[init.user.id+":"+room.id] = [];
			if(urConns[init.user.id+":"+room.id].indexOf(c)<0) urConns[init.user.id+":"+room.id].push(c);
		});
	});
}

function storeBack(conn, back) {
	if(!rConns[back.to]) rConns[back.to] = [];
	if(!sConns[back.session]) sConns[back.session] = [];
	if(!urConns[back.from+":"+back.to]) urConns[back.from+":"+back.to] = [];
	if(!uConns[back.from]) uConns[back.from] = [];
	if(rConns[back.to].indexOf(conn)<0) rConns[back.to].push(conn);
	if(urConns[back.from+":"+back.to].indexOf(conn)<0) urConns[back.from+":"+back.to].push(conn);
    if(!conn.listeningTo) conn.listeningTo = [];
    conn.listeningTo.push(back.to);
//    console.log("LOG:"+ back.from +" got back from :"+back.to);
}


function storeAway(conn, away) {
    var index;
	delete urConns[away.from+":"+away.to];
	if (sConns[away.session] && !sConns[away.session].length) {
		delete sConns[away.session];
	}
	if (uConns[away.session] && !uConns[away.session].length) {
		delete uConns[away.session];
	}
	if(urConns[away.from+":"+away.to]) delete urConns[away.from+":"+away.to];
    if(conn.listeningTo) {
        index = conn.listeningTo.indexOf(away.to);
        if(index>=0)conn.listeningTo.splice(index, 1);
    }
//    console.log("LOG: "+ away.from +"sending away to :"+away.to);
}

exports.initServer = function (server) {
	sock.installHandlers(server, {prefix: '/socket'});
};

exports.initCore = function(c) {
    core = c;
	// api(core);
	core.on('init', emit,"gateway");
	core.on('away', emit,"gateway");
	core.on('back', emit,"gateway");
	core.on('join', emit,"gateway");
	core.on('part', emit,"gateway");
	core.on('room', emit,"gateway");
	core.on('user', emit,"gateway");
	core.on('admit', emit,"gateway");
	core.on('expel', emit,"gateway");
	core.on('edit', emit,"gateway");
	core.on('text', emit,"gateway");
};

function emit(action, callback) {
    var outAction = {}, i, j;
    log("Sending out: ", action);
    function dispatch(conn, a) {conn.send(a); }
    
    if(action.type == 'init') {		
		if(sConns[action.session]) {
            sConns[action.session].forEach(function(conn) {
                conn.user = action.user;
                dispatch(conn, action);
            });
        }
        return callback();
	} else if(action.type == 'user') {
		uConns[action.from].forEach(function(e) {
            dispatch(e, action);
        });
        return callback();
	}
    
    for (i in action) {
        if(action.hasOwnProperty(i)) {
            if(i == "room" || i == "user") { 
                outAction[i] = {};
                for (j in action[i]) {
                    if(action[i].hasOwnProperty(j) && j !== "params") {
                        outAction[i][j] = action[i][j];
                    }
                }
            }else {
                outAction[i] = action[i];
            }
        }
    }
    
    delete outAction.session;
    delete outAction.user.identities;
    
    if(rConns[action.to]) {
        rConns[action.to].forEach(function(e) {
            if(e.session == action.session && action.type == "room") dispatch(e, action);
            else dispatch(e, outAction);
        });
    }
	if(callback) callback();
}

function handleClose(conn) {
	if(!conn.session) return;
	core.emit('getUsers', {ref: "me", session: conn.session}, function(err, sess) {
        
		if(err || !sess || !sess.results) {
			log("Couldn't find session to close.", err, sess);
			return;
		}
		var user = sess.results[0];
        // console.log("LOG: "+ user.id +" closed tab which had", conn.listeningTo.join(","), "open");
		setTimeout(function() {
            // console.log("LOG: "+ user.id +"30 seconds lated");
            if(!conn.listeningTo || !conn.listeningTo.length) return;
            
            conn.listeningTo.forEach(function(room) {
                var awayAction = {
                    from: user.id,
                    session: conn.session,
                    type:"away",
                    to: room,
                    time: new Date().getTime()
                };
                // console.log("LOG: "+user.id +"verifing away for", room);
                if(!verifyAway(conn, awayAction)) return;
                // console.log("LOG: "+ user.id +"sending away for", room);
                core.emit('away',awayAction , function(err, action) {
                    if(err) return;
                    storeAway(conn, action);
                });
                
            });
		}, 30*1000);
	});
}

function verifyAway(conn, away) {
	var index;
	if(rConns[away.to]) {
		index = rConns[away.to].indexOf(conn);
		if(index >=0) rConns[away.to].splice(index,1);
	}
	if(sConns[conn.session]) {
		index = sConns[conn.session].indexOf(conn);
		if(index >=0) sConns[conn.session].splice(index,1);
	}
	if(uConns[away.from]) {
		index = uConns[away.from].indexOf(conn);
		if(index >=0) uConns[away.from].splice(index,1);
	}
	if(urConns[away.from+":"+away.to]) {
		index = urConns[away.from+":"+away.to].indexOf(conn);
		if(index >=0) urConns[away.from+":"+away.to].splice(index,1);
        // console.log("LOG: "+ away.from +"Connections still available: ", urConns[away.from+":"+away.to].length);
		return (urConns[away.from+":"+away.to].length===0);
	}else{
		return true;
	}
}

function verifyBack(conn, back) {
	if(!urConns[back.from+":"+back.to]) return true;
	return (urConns[back.from+":"+back.to].length===0);
}
