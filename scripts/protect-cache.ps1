param([Parameter(Mandatory = $true)][string]$CacheDirectory)
$ErrorActionPreference = 'Stop'
$resolvedCacheDirectory = [IO.Path]::GetFullPath($CacheDirectory)
if ([IO.Path]::GetPathRoot($resolvedCacheDirectory) -eq $resolvedCacheDirectory) {
    throw 'Нельзя использовать корень диска как папку кеша.'
}
if (Test-Path -LiteralPath $resolvedCacheDirectory) {
    $cacheItem = Get-Item -LiteralPath $resolvedCacheDirectory
    if (-not $cacheItem.PSIsContainer -or ($cacheItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Кеш должен находиться в обычной папке, а не по ссылке.'
    }
} else {
    New-Item -ItemType Directory -Path $resolvedCacheDirectory | Out-Null
}
$currentUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$cacheAcl = New-Object Security.AccessControl.DirectorySecurity
$cacheAcl.SetOwner($currentUserSid)
$cacheAcl.SetAccessRuleProtection($true, $false)
foreach ($principalSid in @($currentUserSid, $systemSid)) {
    $accessRule = New-Object Security.AccessControl.FileSystemAccessRule(
        $principalSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
    )
    $cacheAcl.AddAccessRule($accessRule)
}
Set-Acl -LiteralPath $resolvedCacheDirectory -AclObject $cacheAcl
$verifiedAcl = Get-Acl -LiteralPath $resolvedCacheDirectory
if (-not $verifiedAcl.AreAccessRulesProtected) { throw 'Не удалось отключить наследование прав.' }
Write-Output 'Папка кеша защищена: доступ разрешён текущему пользователю Windows и SYSTEM.'
