const { run } = require("../server");

module.exports = (req, res) => {
  req.url = "/api/scan";
  return run(req, res);
};
