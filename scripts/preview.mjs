import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.EGODIM_PREVIEW_PORT || 4174);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    const requestedPath =
      url.pathname === "/" ? "popup.html" : url.pathname.slice(1);
    const filePath = resolve(root, requestedPath);

    if (relative(root, filePath).startsWith("..")) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    let body = await readFile(filePath);
    if (filePath === resolve(root, "popup.html")) {
      body = Buffer.from(
        body
          .toString("utf8")
          .replace(
            '<script src="popup.js"></script>',
            '<script src="tests/fixtures/chrome-mock.js"></script>\n    <script src="popup.js"></script>',
          ),
      );
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": types[extname(filePath)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Ego Dimmer preview: http://127.0.0.1:${port}/`);
});
