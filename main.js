import { createServer } from "node:http";
import { readdir, readFile, access } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { constants } from "node:fs";

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function processMarkdown(markdown) {
  const firstEscape = escapeHtml(markdown);
  const secondEscape = firstEscape.replace(/&/g, "&amp;");
  return secondEscape;
}

async function listDirectory(path) {
  const items = [];
  const entries = await readdir(path, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      items.push({ name: entry.name, isDirectory: true });
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      items.push({ name: entry.name, isDirectory: false });
    }
  }

  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  return items;
}

function generateDirectoryHtml(items, currentPath) {
  let html = "<html><head><title>Markdown Browser</title></head><body>";
  html += `<h1>Directory: ${currentPath || "/"}</h1>`;
  html += "<ul>";

  if (currentPath) {
    const parentPath = currentPath.split("/").slice(0, -1).join("/");
    html += `<li><a href="/?path=${encodeURIComponent(parentPath)}">..</a></li>`;
  }

  for (const item of items) {
    const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;
    if (item.isDirectory) {
      html += `<li><a href="/?path=${encodeURIComponent(itemPath)}">${item.name}/</a></li>`;
    } else {
      html += `<li><a href="/?file=${encodeURIComponent(itemPath)}">${item.name}</a></li>`;
    }
  }
  html += "</ul></body></html>";

  return html;
}

function generateMarkdownHtml(content, filePath) {
  const processed = processMarkdown(content);
  const parentPath = filePath.split("/").slice(0, -1).join("/");
  const backLink = parentPath ? `/?path=${encodeURIComponent(parentPath)}` : "/";

  let html = "<html><head><title>" + filePath + "</title></head><body>";
  html += `<h2>${filePath}</h2>`;
  html += "<ul>";
  html += `<li><a href="${backLink}">Back to directory</a></li>`;
  html += "</ul>";
  html += "<hr>";
  html += `<pre>${processed}</pre>`;
  html += "</body></html>";

  return html;
}

const rootDir = process.argv[2] || process.cwd();
const basePath = isAbsolute(rootDir) ? rootDir : resolve(process.cwd(), rootDir);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParam = url.searchParams.get("path");
  const fileParam = url.searchParams.get("file");

  try {
    if (fileParam) {
      const filePath = join(basePath, fileParam);

      try {
        await access(filePath, constants.R_OK);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
        return;
      }

      const content = await readFile(filePath, "utf-8");
      const html = generateMarkdownHtml(content, fileParam);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    const currentPath = pathParam || "";
    const fullPath = join(basePath, currentPath);

    if (!fullPath.startsWith(basePath)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: Cannot access parent directory");
      return;
    }

    try {
      await access(fullPath, constants.R_OK);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    const items = await listDirectory(fullPath);
    const html = generateDirectoryHtml(items, currentPath);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`Error: ${message}`);
  }
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Root directory: ${basePath}`);
});
