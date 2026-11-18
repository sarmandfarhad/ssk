const { run } = require("../../server");

function numberFrom(req) {
  if (req.query && req.query.number != null && String(req.query.number) !== "") {
    return String(req.query.number);
  }
  const path = String(req.url || "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

module.exports = (req, res) => {
  req.url = `/api/ids/${encodeURIComponent(numberFrom(req))}`;
  return run(req, res);
};
