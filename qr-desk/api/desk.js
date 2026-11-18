const { run } = require("../server");

module.exports = (req, res) => {
  req.url = "/api/desk";
  return run(req, res);
};
