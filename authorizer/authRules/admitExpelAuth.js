var SbError = require('../../lib/SbError.js');
module.exports = function (core) {
	core.on('admit', function (action, callback) {
		if (action.room.guides.authorizer && action.room.guides.authorizer.openFollow === undefined) {
			action.room.guides.authorizer.openFollow = true;
		}
		if (action.role === "guest") return callback(new SbError({
			message: 'ERR_NOT_ALLOWED',
			info: {
				origin: "Authorizer",
				action: 'admit',
				requiredRole: 'follower',
				currentRole: 'guest'
			}
		}));
		else if (action.role === "owner" || action.role === "su") return callback();
		else if (action.role === "moderator" && action.victim.invitedRole !== "owner" && action.victim.invitedRole !== "moderator") return callback();
		else if (action.role === "follower" && action.victim.role === "registered" && action.room.guides.authorizer.openFollow) return callback();
		else if (action.role !== "gagged" && action.role !== "banned" && action.role !== "registered" && action.role !== "guest") {
			if (action.victim.requestedRole && action.victim.requestedRole === action.role) return callback();
			else {
				action.victim.invitedRole = action.role;
				return callback();
			}
		} else {
			return callback(new SbError({
				message: 'ERR_NOT_ALLOWED',
				info: {
					origin: "Authorizer",
					action: 'admit',
					requiredRole: 'follower',
					currentRole: 'guest'
				}
			}));
		}
	}, "authorization");

	core.on('expel', function (action, callback) {
		if (action.role === "guest") return callback(new SbError({
			message: 'ERR_NOT_ALLOWED',
			info: {
				origin: "Authorizer",
				action: 'expel',
				requiredRole: 'follower',
				currentRole: 'guest'
			}
		}));
		if (action.role === "owner" || action.role === "su") return callback();
		else if (action.role === "moderator" && action.victim.role !== "moderator" && action.victim.role !== "owner") {
			return callback();
		}
		return callback(new SbError({
			message: 'ERR_NOT_ALLOWED',
			info: {
				origin: "Authorizer",
				action: 'expel',
				requiredRole: 'follower',
				currentRole: 'guest'
			}
		}));
	}, "authorization");
};