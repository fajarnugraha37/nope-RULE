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