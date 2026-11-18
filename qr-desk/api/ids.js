const { run } = require("../server");

module.exports = (req, res) => {
  req.url = "/api/ids";
  return run(req, res);
};
