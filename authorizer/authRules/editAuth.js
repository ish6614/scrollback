var SbError = require('../../lib/SbError.js');
module.exports = function (core) {
	core.on('edit', function (action, callback) {
		if (action.user.role === "none") {
			if (/^guest-/.test(action.user.id)) {
				action.user.role = "guest";
			} else {
				action.user.role = "registered";
			}
		}
		if (action.user.role === "guest") return callback(new SbError({
			message: 'ERR_NOT_ALLOWED',
			info: {
				origin: "Authorizer",
				action: 'edit',
				requiredRole: 'follower',
				currentRole: 'guest'
			}
		}));
		if (action.user.role === "moderator" || action.user.role === "owner" || action.user.role === "su") return callback();
		else if (action.user.role === "follower" || action.user.role === "registered") {
			if (action.from === action.old.from && action.from === action.old.editInverse[action.old.editInverse.length - 1].from) return callback();
		}
		return callback(new SbError({
			message: 'ERR_NOT_ALLOWED',
			info: {
				origin: "Authorizer",
				action: 'edit',
				requiredRole: 'follower',
				currentRole: 'guest'
			}
		}));
	}, "authorization");
};