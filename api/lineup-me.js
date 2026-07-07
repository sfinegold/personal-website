// /lineup/me — Sam's admin page. Thin wrapper over the shared handler.
const { handleAdmin } = require('./_lib/admin');

module.exports = async (req, res) => handleAdmin(req, res, 'me');
