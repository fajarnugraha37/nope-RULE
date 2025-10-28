# PowerShell script to copy non-TS/JS files from src to dist directories
# Usage: .\copy-files.ps1

Write-Host "Copying non-TS/JS files from src to dist directories..."

# Create destination directories
New-Item -ItemType Directory -Force -Path "dist\cjs", "dist\esm" | Out-Null

# Get all files from src that are NOT .ts, .js, .tsx, or .jsx
$sourceFiles = Get-ChildItem -Path "src" -Recurse -File | 
    Where-Object { $_.Extension -notin @('.ts', '.js', '.tsx', '.jsx') }

foreach ($file in $sourceFiles) {
    # Calculate relative path from src
    $relativePath = $file.FullName.Substring((Get-Item "src").FullName.Length + 1)
    
    # Define destination paths
    $cjsDestination = Join-Path "dist\cjs" $relativePath
    $esmDestination = Join-Path "dist\esm" $relativePath
    
    # Create destination directories if they don't exist
    $cjsDir = Split-Path $cjsDestination -Parent
    $esmDir = Split-Path $esmDestination -Parent
    
    if (-not (Test-Path $cjsDir)) {
        New-Item -ItemType Directory -Force -Path $cjsDir | Out-Null
    }
    if (-not (Test-Path $esmDir)) {
        New-Item -ItemType Directory -Force -Path $esmDir | Out-Null
    }
    
    # Copy files
    Copy-Item $file.FullName $cjsDestination -Force
    Copy-Item $file.FullName $esmDestination -Force
    
    Write-Host "✓ Copied: $relativePath"
}

Write-Host "✅ Finished copying non-TS/JS files to dist/cjs and dist/esm" -ForegroundColor Green