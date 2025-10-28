export async function readRelativeFile<T>(pathParts: string[]): Promise<T> {
  // detect whether we are in esm or cjs and call the appropriate file
  const isESM = typeof __filename === "undefined";
  if (isESM) {
    const { readRelativeFile } = await import("./read-relative-file.esm.js");
    return readRelativeFile<T>(["esm", ...(pathParts || [])]);
  } else {
    const { readRelativeFile } = require("./read-relative-file.cjs.js");
    // @ts-ignore
    return readRelativeFile<T>(["cjs", ...(pathParts || [])]);
  }
}
