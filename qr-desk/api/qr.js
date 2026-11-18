const { run } = require("../server");

module.exports = (req, res) => {
  req.url = "/qr.svg";
  return run(req, res);
};
