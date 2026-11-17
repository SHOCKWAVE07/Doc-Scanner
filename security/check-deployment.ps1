param([string]$BaseUrl = 'https://docscannerme.netlify.app')
$ErrorActionPreference = 'Stop'
$base = [Uri]$BaseUrl
if ($base.Scheme -ne 'https') { throw 'Use the HTTPS deployment URL.' }
$paths = @('/', '/js/services/pdf-import-handler.js', '/js/app.js', '/js/services/security-policy.js', '/vendor/manifest.json')
$responses = @()
$contents = @{}
foreach ($path in $paths) {
    $uri = [Uri]::new($base, $path).AbsoluteUri
    try {
        $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
        $body = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }
        $contents[$path] = $body
        $headers = [ordered]@{}
        foreach ($name in @('Content-Type','Content-Security-Policy','Strict-Transport-Security','X-Content-Type-Options','Referrer-Policy','Permissions-Policy','X-Frame-Options','Cache-Control')) {
            $headers[$name] = $response.Headers[$name]
        }
        $hasher = [Security.Cryptography.SHA256]::Create()
        try { $digest = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))).Replace('-','').ToLowerInvariant() }
        finally { $hasher.Dispose() }
        $responses += @{ url=$uri; status=[int]$response.StatusCode; headers=$headers; decodedContentSha256=$digest }
    } catch {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
        $responses += @{ url=$uri; status=$status; error=$_.Exception.Message }
    }
}
$rootHeaders = $responses[0].headers
$pdf = [string]$contents['/js/services/pdf-import-handler.js']
$app = [string]$contents['/js/app.js']
$checks = [ordered]@{
    rootServed = $responses[0].status -eq 200
    cspResponseHeader = [bool]$rootHeaders['Content-Security-Policy']
    hstsResponseHeader = [bool]$rootHeaders['Strict-Transport-Security']
    nosniffResponseHeader = $rootHeaders['X-Content-Type-Options'] -eq 'nosniff'
    referrerPolicyResponseHeader = [bool]$rootHeaders['Referrer-Policy']
    permissionsPolicyResponseHeader = [bool]$rootHeaders['Permissions-Policy']
    frameRestrictionResponseHeader = [bool]$rootHeaders['X-Frame-Options'] -or ([string]$rootHeaders['Content-Security-Policy']).Contains('frame-ancestors')
    cspMetaTag = ([string]$contents['/']) -match 'http-equiv="Content-Security-Policy"'
    externalScriptTags = @([regex]::Matches([string]$contents['/'], '<script\b[^>]*src="(https?://[^"]+)"') | ForEach-Object { $_.Groups[1].Value })
    oldPdfJsReferenced = $pdf.Contains('pdf.js/3.11.174/')
    patchedPdfJsReferenced = $pdf.Contains('pdfjs-dist-6.5.438/')
    pdfEvaluationDisabled = $pdf -match 'isEvalSupported\s*:\s*false'
    completeSessionClearPresent = $app.Contains('function clearSensitiveState()')
    securityPolicyAvailable = $responses[3].status -eq 200 -and ([string]$contents['/js/services/security-policy.js']).Contains('SECURITY_LIMITS')
    vendorManifestAvailable = $responses[4].status -eq 200 -and ([string]$contents['/vendor/manifest.json']).Contains('archiveIntegrity')
}
$result = @{ checkedAtUtc=[DateTime]::UtcNow.ToString('o'); target=$base.AbsoluteUri; method='Read-only GET requests to public application files; no exploit or resource-exhaustion payloads'; responses=$responses; checks=$checks }
$result | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $PSScriptRoot 'live-deployment-results.json')
$checks | ConvertTo-Json -Depth 4
