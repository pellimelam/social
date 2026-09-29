const fs = require("fs-extra");
const path = require("path");
const { minify: terserMinify } = require("terser");
const JavaScriptObfuscator = require("javascript-obfuscator");
const { minify: minifyHtml } = require("html-minifier-terser");
const CleanCSS = require("clean-css");

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");

/*
 * ==========================================================
 * VIDHWAAN FRONTEND PROTECTION
 * ==========================================================
 *
 * IMPORTANT:
 *
 * SOURCE FILES ARE NEVER MODIFIED.
 *
 * SOURCE:
 *   index.html
 *   main.css
 *   app.js
 *   sw.js
 *   *.json
 *   images
 *   icons
 *   fonts
 *   videos
 *   other deployable assets
 *
 * OUTPUT:
 *   public/
 *
 * Every workflow run completely rebuilds public/.
 *
 * HTML:
 *   Minified
 *
 * CSS:
 *   Minified
 *
 * JavaScript:
 *   Terser + Obfuscator
 *
 * sw.js:
 *   Terser only
 *
 * JSON:
 *   Parsed + JSON.stringify()
 *
 * Other files:
 *   Copied unchanged
 *
 * Internal repository files are NOT copied:
 *   .git
 *   .github
 *   node_modules
 *   scripts
 *   public
 *   template.html
 *   package.json
 *   package-lock.json
 *   npm-shrinkwrap.json
 */

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".github",
  "node_modules",
  "scripts",
  "public"
]);

const EXCLUDED_FILES = new Set([
  "template.html",
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json"
]);

const PROCESSABLE_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".json"
]);

/*
 * ==========================================================
 * PATH HELPERS
 * ==========================================================
 */

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isExcludedFile(relativePath) {
  return EXCLUDED_FILES.has(relativePath);
}

/*
 * ==========================================================
 * FILE DISCOVERY
 * ==========================================================
 *
 * Discover every deployable file in the repository.
 *
 * Source files remain untouched.
 */

async function discoverRepositoryFiles() {
  const files = [];

  async function walk(currentDirectory) {
    const entries = await fs.readdir(currentDirectory, {
      withFileTypes: true
    });

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDirectory, entry.name);
      const relativePath = normalize(
        path.relative(ROOT, fullPath)
      );

      /*
       * Directories that must never enter public/.
       */
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) {
          continue;
        }

        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      /*
       * Excluded files.
       */
      if (isExcludedFile(relativePath)) {
        continue;
      }

      files.push(relativePath);
    }
  }

  await walk(ROOT);

  files.sort();

  return files;
}

/*
 * ==========================================================
 * ONE-LINE HELPER
 * ==========================================================
 *
 * HTML, CSS, JS and JSON output are required to be
 * physically one line.
 */

function forceOneLine(content) {
  return String(content)
    .replace(/\r\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

/*
 * ==========================================================
 * PUBLIC OUTPUT WRITER
 * ==========================================================
 *
 * IMPORTANT:
 *
 * This writes ONLY to public/.
 *
 * The original source file is NEVER overwritten.
 */

async function writePublic(relativePath, content) {
  const destination = path.join(
    PUBLIC_DIR,
    relativePath
  );

  await fs.ensureDir(
    path.dirname(destination)
  );

  const tempFile =
    `${destination}.protect.tmp`;

  await fs.writeFile(
    tempFile,
    content,
    "utf8"
  );

  const stat = await fs.stat(tempFile);

  if (!stat.size) {
    throw new Error(
      `Generated empty file: ${relativePath}`
    );
  }

  await fs.move(
    tempFile,
    destination,
    {
      overwrite: true
    }
  );
}

/*
 * ==========================================================
 * COPY NON-SOURCE ASSET
 * ==========================================================
 *
 * Examples:
 *
 * PNG
 * JPG
 * JPEG
 * WEBP
 * SVG
 * ICO
 * GIF
 * MP4
 * WOFF
 * WOFF2
 * TTF
 * etc.
 */

async function copyBinary(relativePath) {
  const source = path.join(
    ROOT,
    relativePath
  );

  const destination = path.join(
    PUBLIC_DIR,
    relativePath
  );

  await fs.ensureDir(
    path.dirname(destination)
  );

  await fs.copyFile(
    source,
    destination
  );

  const stat = await fs.stat(destination);

  if (!stat.size) {
    throw new Error(
      `Copied empty asset: ${relativePath}`
    );
  }
}

/*
 * ==========================================================
 * JAVASCRIPT PROTECTION
 * ==========================================================
 */

async function protectJavaScript(relativePath) {
  const sourcePath = path.join(
    ROOT,
    relativePath
  );

  const fileName =
    path.basename(relativePath).toLowerCase();

  console.log(
    `JS     : ${relativePath}`
  );

  /*
   * Read SOURCE only.
   */
  const source = await fs.readFile(
    sourcePath,
    "utf8"
  );

  if (!source.trim()) {
    throw new Error(
      `JavaScript file is empty: ${relativePath}`
    );
  }

  /*
   * ========================================================
   * STEP 1 — TERSER
   * ========================================================
   */

  const terserResult =
    await terserMinify(
      source,
      {
        ecma: 2022,

        compress: {
          passes: 3,

          dead_code: true,
          drop_debugger: true,
          conditionals: true,
          evaluate: true,
          booleans: true,
          loops: true,
          unused: true,
          hoist_funs: true,
          if_return: true,
          join_vars: true,
          reduce_funcs: true,
          reduce_vars: true,
          sequences: true,
          side_effects: true,
          switches: true,
          typeofs: true,

          unsafe: false,
          unsafe_arrows: false,
          unsafe_comps: false,
          unsafe_Function: false,
          unsafe_math: false,
          unsafe_methods: false,
          unsafe_proto: false,
          unsafe_regexp: false,
          unsafe_undefined: false
        },

        mangle: {
          toplevel: false,
          keep_classnames: false,
          keep_fnames: false,
          safari10: false
        },

        format: {
          comments: false,
          beautify: false,
          semicolons: true
        },

        sourceMap: false
      }
    );

  if (!terserResult.code) {
    throw new Error(
      `Terser failed: ${relativePath}`
    );
  }

  /*
   * ========================================================
   * SERVICE WORKER
   * ========================================================
   *
   * sw.js is NOT obfuscated.
   *
   * Only Terser minification is applied.
   */

  if (fileName === "sw.js") {
    const finalCode =
      forceOneLine(
        terserResult.code
      );

    await writePublic(
      relativePath,
      finalCode
    );

    console.log(
      `MINIFIED SW: ${relativePath}`
    );

    return;
  }

  /*
   * ========================================================
   * STRONG JAVASCRIPT OBFUSCATION
   * ========================================================
   */

  const obfuscated =
    JavaScriptObfuscator.obfuscate(
      terserResult.code,
      {
        compact: true,
        simplify: true,

        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,

        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.20,

        identifierNamesGenerator:
          "hexadecimal",

        renameGlobals: false,

        stringArray: true,
        stringArrayCallsTransform: true,
        stringArrayCallsTransformThreshold:
          0.75,

        stringArrayEncoding: [
          "base64"
        ],

        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,

        stringArrayWrappersCount: 5,
        stringArrayWrappersChainedCalls: true,
        stringArrayWrappersParametersMaxCount: 5,
        stringArrayWrappersType: "variable",

        stringArrayThreshold: 1,

        splitStrings: true,
        splitStringsChunkLength: 8,

        transformObjectKeys: true,

        unicodeEscapeSequence: true,

        target: "browser",

        debugProtection: false,

        disableConsoleOutput: false,

        selfDefending: true,

        sourceMap: false
      }
    );

  const protectedCode =
    obfuscated.getObfuscatedCode();

  if (
    !protectedCode ||
    !protectedCode.trim()
  ) {
    throw new Error(
      `Obfuscator produced empty output: ${relativePath}`
    );
  }

  /*
   * Force one physical line.
   */

  const finalCode =
    forceOneLine(
      protectedCode
    );

  /*
   * IMPORTANT:
   *
   * Write to PUBLIC ONLY.
   *
   * SOURCE FILE IS UNTOUCHED.
   */

  await writePublic(
    relativePath,
    finalCode
  );

  console.log(
    `PROTECTED: ${relativePath}`
  );
}

/*
 * ==========================================================
 * CSS OPTIMIZATION
 * ==========================================================
 */

async function optimizeCSS(relativePath) {
  const sourcePath = path.join(
    ROOT,
    relativePath
  );

  console.log(
    `CSS    : ${relativePath}`
  );

  const source = await fs.readFile(
    sourcePath,
    "utf8"
  );

  if (!source.trim()) {
    throw new Error(
      `CSS file is empty: ${relativePath}`
    );
  }

  const result =
    new CleanCSS({
      level: {
        1: {
          all: true
        },

        2: {
          all: true
        }
      },

      rebase: false,

      sourceMap: false
    }).minify(source);

  if (result.errors.length) {
    throw new Error(
      `CSS optimization failed for ${relativePath}:\n` +
      result.errors.join("\n")
    );
  }

  if (
    !result.styles ||
    !result.styles.trim()
  ) {
    throw new Error(
      `CSS optimization produced empty output: ${relativePath}`
    );
  }

  const finalCSS =
    forceOneLine(
      result.styles
    );

  await writePublic(
    relativePath,
    finalCSS
  );

  console.log(
    `OPTIMIZED: ${relativePath}`
  );
}

/*
 * ==========================================================
 * HTML OPTIMIZATION
 * ==========================================================
 */

async function optimizeHTML(relativePath) {
  const sourcePath = path.join(
    ROOT,
    relativePath
  );

  console.log(
    `HTML   : ${relativePath}`
  );

  const source = await fs.readFile(
    sourcePath,
    "utf8"
  );

  if (!source.trim()) {
    throw new Error(
      `HTML file is empty: ${relativePath}`
    );
  }

  const output =
    await minifyHtml(
      source,
      {
        collapseWhitespace: true,

        collapseInlineTagWhitespace:
          true,

        removeComments: true,

        removeRedundantAttributes:
          true,

        removeScriptTypeAttributes:
          true,

        removeStyleLinkTypeAttributes:
          true,

        removeEmptyAttributes:
          true,

        useShortDoctype: true,

        minifyCSS: true,

        minifyJS: true,

        keepClosingSlash: true,

        removeOptionalTags: false,

        sortAttributes: false,

        sortClassName: false,

        caseSensitive: true,

        decodeEntities: false
      }
    );

  if (
    !output ||
    !output.trim()
  ) {
    throw new Error(
      `HTML optimization produced empty output: ${relativePath}`
    );
  }

  const finalHTML =
    forceOneLine(output);

  await writePublic(
    relativePath,
    finalHTML
  );

  console.log(
    `OPTIMIZED: ${relativePath}`
  );
}

/*
 * ==========================================================
 * JSON OPTIMIZATION
 * ==========================================================
 *
 * No data transformation.
 *
 * Only:
 *
 *   JSON.parse()
 *   JSON.stringify()
 *
 * This removes formatting whitespace.
 */

async function optimizeJSON(relativePath) {
  const sourcePath = path.join(
    ROOT,
    relativePath
  );

  console.log(
    `JSON   : ${relativePath}`
  );

  const source = await fs.readFile(
    sourcePath,
    "utf8"
  );

  if (!source.trim()) {
    throw new Error(
      `JSON file is empty: ${relativePath}`
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Invalid JSON: ${relativePath}\n${error.message}`
    );
  }

  let output;

  try {
    output = JSON.stringify(parsed);
  } catch (error) {
    throw new Error(
      `JSON compression failed for ${relativePath}\n${error.message}`
    );
  }

  if (
    !output ||
    !output.trim()
  ) {
    throw new Error(
      `JSON compression produced empty output: ${relativePath}`
    );
  }

  const finalJSON =
    forceOneLine(output);

  /*
   * Write compressed JSON
   * ONLY into public/.
   */

  await writePublic(
    relativePath,
    finalJSON
  );

  /*
   * Verify generated public JSON.
   */

  const finalSource =
    await fs.readFile(
      path.join(
        PUBLIC_DIR,
        relativePath
      ),
      "utf8"
    );

  if (
    finalSource.includes("\n") ||
    finalSource.includes("\r")
  ) {
    throw new Error(
      `Final JSON is not one line: ${relativePath}`
    );
  }

  try {
    JSON.parse(finalSource);
  } catch (error) {
    throw new Error(
      `Final JSON is invalid after compression: ${relativePath}\n${error.message}`
    );
  }

  console.log(
    `COMPRESSED: ${relativePath}`
  );
}

/*
 * ==========================================================
 * PROCESS ONE REPOSITORY FILE
 * ==========================================================
 */

async function processRepositoryFile(
  relativePath
) {
  const extension =
    path.extname(relativePath)
      .toLowerCase();

  if (extension === ".html") {
    await optimizeHTML(
      relativePath
    );

    return;
  }

  if (extension === ".css") {
    await optimizeCSS(
      relativePath
    );

    return;
  }

  if (extension === ".js") {
    await protectJavaScript(
      relativePath
    );

    return;
  }

  if (extension === ".json") {
    await optimizeJSON(
      relativePath
    );

    return;
  }

  /*
   * Everything else is copied unchanged.
   */

  await copyBinary(
    relativePath
  );

  console.log(
    `COPIED : ${relativePath}`
  );
}

/*
 * ==========================================================
 * FINAL PUBLIC VERIFICATION
 * ==========================================================
 */

async function verifyPublicOutput(
  repositoryFiles
) {
  console.log("");
  console.log(
    "Running PUBLIC output verification..."
  );
  console.log("");

  for (
    const relativePath
    of repositoryFiles
  ) {
    const destination =
      path.join(
        PUBLIC_DIR,
        relativePath
      );

    if (
      !(await fs.pathExists(
        destination
      ))
    ) {
      throw new Error(
        `Missing public output: ${relativePath}`
      );
    }

    const extension =
      path.extname(relativePath)
        .toLowerCase();

    /*
     * Binary assets only need existence
     * verification.
     */

    if (
      !PROCESSABLE_EXTENSIONS.has(
        extension
      )
    ) {
      continue;
    }

    const content =
      await fs.readFile(
        destination,
        "utf8"
      );

    if (!content.trim()) {
      throw new Error(
        `Empty public output: ${relativePath}`
      );
    }

    /*
     * All protected text assets
     * must be one physical line.
     */

    if (
      content.includes("\n") ||
      content.includes("\r")
    ) {
      throw new Error(
        `Public output is NOT one line: ${relativePath}`
      );
    }

    /*
     * Additional JSON validation.
     */

    if (extension === ".json") {
      try {
        JSON.parse(content);
      } catch (error) {
        throw new Error(
          `Public output is invalid JSON: ${relativePath}\n${error.message}`
        );
      }
    }
  }

  console.log(
    "PUBLIC output verification passed."
  );
}

/*
 * ==========================================================
 * MAIN
 * ==========================================================
 */

async function main() {
  console.log("");
  console.log(
    "================================================"
  );
  console.log(
    "      VIDHWAAN FRONTEND PROTECTION"
  );
  console.log(
    "================================================"
  );
  console.log("");

  console.log(
    "Discovering repository files..."
  );

  const repositoryFiles =
    await discoverRepositoryFiles();

  if (!repositoryFiles.length) {
    throw new Error(
      "No deployable repository files were found."
    );
  }

  console.log(
    `Deployable source files: ${repositoryFiles.length}`
  );

  console.log("");

  /*
   * ========================================================
   * REBUILD PUBLIC
   * ========================================================
   *
   * This is intentional.
   *
   * If a source file is deleted,
   * it must also disappear from public/.
   *
   * Therefore public/ is never allowed
   * to contain stale files.
   */

  console.log(
    "Rebuilding public/ directory..."
  );

  await fs.emptyDir(
    PUBLIC_DIR
  );

  /*
   * ========================================================
   * PROCESS ALL SOURCE FILES
   * ========================================================
   */

  for (
    const relativePath
    of repositoryFiles
  ) {
    await processRepositoryFile(
      relativePath
    );
  }

  /*
   * ========================================================
   * VERIFY PUBLIC
   * ========================================================
   */

  await verifyPublicOutput(
    repositoryFiles
  );

  /*
   * ========================================================
   * COMPLETE
   * ========================================================
   */

  console.log("");

  console.log(
    "================================================"
  );

  console.log(
    "       PROTECTION PIPELINE COMPLETE"
  );

  console.log(
    "================================================"
  );

  console.log("");

  console.log(
    `Source files preserved : ${repositoryFiles.length}`
  );

  console.log(
    "Protected output       : public/"
  );

  console.log(
    "Source files modified  : 0"
  );

  console.log("");

  console.log(
    "The repository source remains unchanged."
  );

  console.log(
    "The public/ directory is the protected deployment copy."
  );

  console.log("");
}

/*
 * ==========================================================
 * ERROR HANDLING
 * ==========================================================
 */

main().catch(error => {
  console.error("");

  console.error(
    "================================================"
  );

  console.error(
    "       FRONTEND PROTECTION FAILED"
  );

  console.error(
    "================================================"
  );

  console.error("");

  console.error(error);

  console.error("");

  process.exit(1);
});