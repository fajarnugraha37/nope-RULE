#!/bin/bash

# Copy everything from ./src to ./dist/cjs and ./dist/esm for non-ts/js files
# preserving the folder structure

# Enable extended globbing for pattern matching
shopt -s extglob globstar

# Create destination directories
mkdir -p dist/cjs dist/esm

# Method 1: Using rsync (recommended if available)
if command -v rsync >/dev/null 2>&1; then
    echo "Using rsync to copy non-TS/JS files..."
    rsync -av --exclude="*.ts" --exclude="*.js" --exclude="*.tsx" --exclude="*.jsx" src/ dist/cjs/
    rsync -av --exclude="*.ts" --exclude="*.js" --exclude="*.tsx" --exclude="*.jsx" src/ dist/esm/
else
    # Method 2: Using find and cp (fallback)
    echo "Using find to copy non-TS/JS files..."
    
    # Copy directory structure first
    find src -type d -exec mkdir -p dist/cjs/{} \; 2>/dev/null
    find src -type d -exec mkdir -p dist/esm/{} \; 2>/dev/null
    
    # Copy non-TS/JS files
    find src -type f \! -name "*.ts" \! -name "*.js" \! -name "*.tsx" \! -name "*.jsx" -exec sh -c '
        for file; do
            rel_path="${file#src/}"
            cp "$file" "dist/cjs/$rel_path"
            cp "$file" "dist/esm/$rel_path"
        done
    ' _ {} +
fi

echo "✅ Copied non-TS/JS files to dist/cjs and dist/esm"

# Extract metadata from main package.json using grep and sed
PACKAGE_NAME=$(grep '"name"' package.json | sed 's/.*"name": *"\([^"]*\)".*/\1/')
PACKAGE_VERSION=$(grep '"version"' package.json | sed 's/.*"version": *"\([^"]*\)".*/\1/')
PACKAGE_AUTHOR=$(grep '"author"' package.json | sed 's/.*"author": *"\([^"]*\)".*/\1/')
PACKAGE_LICENSE=$(grep '"license"' package.json | sed 's/.*"license": *"\([^"]*\)".*/\1/')

# Create package.json for CommonJS build
echo "Creating package.json for CommonJS build..."
cat > dist/cjs/package.json << EOF
{
  "name": "$PACKAGE_NAME",
  "version": "$PACKAGE_VERSION",
  "author": "$PACKAGE_AUTHOR",
  "license": "$PACKAGE_LICENSE",
  "type": "commonjs",
  "main": "index.js",
  "types": "index.d.ts"
}
EOF

# Create package.json for ES Module build
echo "Creating package.json for ES Module build..."
cat > dist/esm/package.json << EOF
{
  "name": "$PACKAGE_NAME",
  "version": "$PACKAGE_VERSION",
  "author": "$PACKAGE_AUTHOR",
  "license": "$PACKAGE_LICENSE",
  "type": "module",
  "main": "index.js",
  "types": "index.d.ts"
}
EOF

echo "✅ Created package.json files for both CJS and ESM builds"