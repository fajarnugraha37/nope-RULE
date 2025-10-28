#!/bin/bash

# Copy everything from ./src to ./dist/cjs and ./dist/esm for non-ts/js files
# preserving the folder structure

# Enable extended globbing for pattern matching
shopt -s extglob globstar

# Create destination directories
mkdir -p dist/cjs dist/esm

# Fast copy method optimized for Windows
echo "Copying non-TS/JS files (optimized for Windows)..."

# Create a temporary list of files to copy
temp_file_list=$(mktemp)
find src -type f \! -name "*.ts" \! -name "*.js" \! -name "*.tsx" \! -name "*.jsx" > "$temp_file_list"

if [ -s "$temp_file_list" ]; then
    # Copy files in parallel using xargs for speed
    cat "$temp_file_list" | while IFS= read -r file; do
        rel_path="${file#src/}"
        target_dir_cjs="dist/cjs/$(dirname "$rel_path")"
        target_dir_esm="dist/esm/$(dirname "$rel_path")"
        
        # Create directories only if they don't exist
        [ ! -d "$target_dir_cjs" ] && mkdir -p "$target_dir_cjs"
        [ ! -d "$target_dir_esm" ] && mkdir -p "$target_dir_esm"
        
        # Copy files
        cp "$file" "dist/cjs/$rel_path" &
        cp "$file" "dist/esm/$rel_path" &
    done
    
    # Wait for all background copy operations to complete
    wait
    
    echo "✓ Copied $(wc -l < "$temp_file_list") non-TS/JS files"
else
    echo "✓ No non-TS/JS files found to copy"
fi

# Clean up
rm -f "$temp_file_list"

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