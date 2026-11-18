const fs = require("fs");
const path = require("path");

const DATA_FILE = process.env.DESK_DATA_FILE || path.join(__dirname, "data.json");
const BLOB_PATH = "desk/data.json";

function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function emptyData() {
  return { ids: [] };
}

function asDesk(parsed) {
  if (!parsed || !Array.isArray(parsed.ids)) return emptyData();
  return parsed;
}

function readFile() {
  try {
    return asDesk(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
  } catch (error) {
    return emptyData();
  }
}

function isConflict(error) {
  if (!error) return false;
  if (error.name === "BlobPreconditionFailedError") return true;
  const detail = `${error.code || ""} ${error.message || ""}`;
  return /already exists|precondition|etag mismatch|blob_already_exists/i.test(detail);
}

async function readBlobText(result) {
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).text();
}

async function loadState() {
  if (!blobConfigured()) {
    return { data: readFile(), etag: null };
  }

  const { get } = require("@vercel/blob");
  const result = await get(BLOB_PATH, { access: "private", useCache: false });
  const text = await readBlobText(result);
  if (text == null) return { data: readFile(), etag: null };
  return { data: asDesk(JSON.parse(text)), etag: result.blob.etag || null };
}

async function commit(data, etag) {
  if (!blobConfigured()) {
    if (process.env.VERCEL) {
      const error = new Error(
        "Create a private Blob store in this Vercel project's Storage tab and connect it."
      );
      error.status = 503;
      throw error;
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  }

  const { put } = require("@vercel/blob");
  const options = {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
  };
  if (etag) options.ifMatch = etag;
  else options.allowOverwrite = false;

  try {
    await put(BLOB_PATH, JSON.stringify(data), options);
    return true;
  } catch (error) {
    if (isConflict(error)) return false;
    throw error;
  }
}

module.exports = {
  loadState,
  commit,
  blobConfigured,
};
