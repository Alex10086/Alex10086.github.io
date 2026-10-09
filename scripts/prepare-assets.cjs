const fs = require("node:fs");
for (const [from, to] of [["node_modules/sakana-widget/lib", "source/vendor/sakana"], ["node_modules/katex/dist", "source/vendor/katex"]]) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}
