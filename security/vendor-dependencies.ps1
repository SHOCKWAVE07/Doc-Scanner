$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$vendorRoot = Join-Path $projectRoot 'vendor'
$cacheRoot = Join-Path $PSScriptRoot '.vendor-cache'
New-Item -ItemType Directory -Force $vendorRoot, $cacheRoot | Out-Null
$manifestPath = Join-Path $vendorRoot 'manifest.json'
$previousManifest = if (Test-Path -LiteralPath $manifestPath) { Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json } else { $null }
$packages = @(
    @{ Name='pdfjs-dist'; Version='6.5.438'; Files=@('build/pdf.min.mjs','build/pdf.worker.min.mjs','wasm','cmaps','standard_fonts','iccs','LICENSE') },
    @{ Name='jscanify'; Version='1.4.3'; Files=@('src/jscanify.js','LICENSE') },
    @{ Name='jspdf'; Version='4.2.1'; Files=@('dist/jspdf.umd.min.js','LICENSE') },
    @{ Name='tesseract.js'; Version='5.1.1'; Files=@('dist/tesseract.min.js','dist/worker.min.js','LICENSE.md') },
    @{ Name='tesseract.js-core'; Version='5.1.1'; Files=@('tesseract-core-lstm.wasm.js','tesseract-core-lstm.wasm','tesseract-core-simd-lstm.wasm.js','tesseract-core-simd-lstm.wasm','LICENSE') },
    @{ Name='jszip'; Version='3.10.1'; Files=@('dist/jszip.min.js','LICENSE.markdown') }
)
$inventory = @()
foreach ($package in $packages) {
    $name = $package.Name
    $version = $package.Version
    $metadata = Invoke-WebRequest -UseBasicParsing -Uri "https://registry.npmjs.org/$name/$version" | Select-Object -ExpandProperty Content | ConvertFrom-Json
    $previousPackage = $previousManifest.packages | Where-Object { $_.name -eq $name -and $_.version -eq $version }
    if ($previousPackage -and $previousPackage.archiveIntegrity -ne $metadata.dist.integrity) {
        throw "Registry integrity changed for pinned package $name@$version. Review before updating."
    }
    $archive = Join-Path $cacheRoot "$name-$version.tgz"
    Invoke-WebRequest -UseBasicParsing -Uri $metadata.dist.tarball -OutFile $archive
    $hasher = [System.Security.Cryptography.SHA512]::Create()
    try { $actual = 'sha512-' + [Convert]::ToBase64String($hasher.ComputeHash([IO.File]::ReadAllBytes($archive))) }
    finally { $hasher.Dispose() }
    if ($actual -ne $metadata.dist.integrity) { throw "Integrity mismatch: $name@$version" }
    $destination = Join-Path $vendorRoot "$name-$version"
    New-Item -ItemType Directory -Force $destination | Out-Null
    $entries = @($package.Files | ForEach-Object { "package/$_" })
    & tar -xzf $archive -C $destination --strip-components=1 @entries
    if ($LASTEXITCODE -ne 0) { throw "Extraction failed: $name@$version" }
    $inventory += @{ name=$name; version=$version; source=$metadata.dist.tarball; archiveIntegrity=$actual }
    Write-Output "Verified and extracted $name@$version"
}
# OpenCV's project-hosted build and the OCR language file have no npm archive SRI.
# Their exact bytes are recorded in the checked-in asset manifest for future verification.
$extraAssets = @(
    @{ Name='opencv'; Version='4.7.0'; Source='https://docs.opencv.org/4.7.0/opencv.js'; File='opencv-4.7.0/opencv.js' },
    @{ Name='tessdata-eng'; Version='4.0.0'; Source='https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz'; File='tessdata/eng.traineddata.gz' },
    @{ Name='opencv-license'; Version='4.7.0'; Source='https://raw.githubusercontent.com/opencv/opencv/4.7.0/LICENSE'; File='opencv-4.7.0/LICENSE' },
    @{ Name='tessdata-license'; Version='Apache-2.0'; Source='https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/LICENSE'; File='tessdata/LICENSE' }
)
foreach ($asset in $extraAssets) {
    $destination = Join-Path $vendorRoot $asset.File
    New-Item -ItemType Directory -Force (Split-Path $destination -Parent) | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri $asset.Source -OutFile $destination
    $previousAsset = $previousManifest.assets | Where-Object { $_.path -eq $asset.File }
    if ($previousAsset -and $previousAsset.sha256 -ne (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()) {
        throw "Pinned asset changed: $($asset.File). Review before updating the manifest."
    }
    $inventory += @{ name=$asset.Name; version=$asset.Version; source=$asset.Source }
    Write-Output "Downloaded $($asset.Name)@$($asset.Version)"
}
$assets = @(Get-ChildItem -LiteralPath $vendorRoot -File -Recurse | Where-Object { $_.Name -ne 'manifest.json' } | ForEach-Object {
    @{ path=$_.FullName.Substring($vendorRoot.Length+1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
})
@{ packages=$inventory; assets=$assets } | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $vendorRoot 'manifest.json')
