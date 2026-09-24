<#
.SYNOPSIS
    Đồng bộ dữ liệu thiết kế từ ..\ting\design sang ting-demo.

.DESCRIPTION
    Sử dụng Windows Robocopy để đồng bộ nhanh, bảo toàn thư mục .git
    và các file script điều khiển.

.PARAMETER Source
    Đường dẫn thư mục nguồn. Mặc định: "..\ting\design".

.PARAMETER Destination
    Đường dẫn thư mục đích. Mặc định: thư mục chứa script này (ting-demo).

.PARAMETER DryRun
    Chạy thử nghiệm (xem trước các file sẽ được copy/xóa mà không thay đổi thực tế).

.PARAMETER NoDelete
    Chỉ copy các file mới/thay đổi, không xóa các file thừa ở thư mục đích.

.PARAMETER NoGitStatus
    Không hiển thị trạng thái git status sau khi sync.

.EXAMPLE
    .\sync.ps1
    # Đồng bộ toàn bộ (mirror)

.EXAMPLE
    .\sync.ps1 -DryRun
    # Xem trước danh sách thay đổi

.EXAMPLE
    .\sync.ps1 -NoDelete
    # Copy cập nhật, không xóa file cũ
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Source,

    [Parameter(Position = 1)]
    [string]$Destination,

    [Parameter()]
    [switch]$DryRun,

    [Parameter()]
    [switch]$NoDelete,

    [Parameter()]
    [switch]$NoGitStatus
)

# Đảm bảo UTF-8 cho tên file tiếng Việt
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
    $scriptDir = (Get-Location).Path
}

# Xác định đường dẫn nguồn
if (-not $Source) {
    $Source = Join-Path $scriptDir "..\ting\design"
}

# Xác định đường dẫn đích
if (-not $Destination) {
    $Destination = $scriptDir
}

# Chuẩn hóa đường dẫn tuyệt đối
$sourcePath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Source)
if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
    Write-Host "[LỖI] Không tìm thấy thư mục nguồn: '$sourcePath'" -ForegroundColor Red
    exit 1
}
$sourcePath = (Get-Item -LiteralPath $sourcePath).FullName.TrimEnd('\', '/')

$destPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Destination)
if (-not (Test-Path -LiteralPath $destPath -PathType Container)) {
    Write-Host "[LỖI] Không tìm thấy thư mục đích: '$destPath'" -ForegroundColor Red
    exit 1
}
$destPath = (Get-Item -LiteralPath $destPath).FullName.TrimEnd('\', '/')

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ĐỒNG BỘ THIẾT KẾ: ting\design -> ting-demo" -ForegroundColor Cyan
Write-Host "  Nguồn: $sourcePath" -ForegroundColor DarkGray
Write-Host "  Đích : $destPath" -ForegroundColor DarkGray
if ($DryRun) {
    Write-Host "  Chế độ: [XEM TRƯỚC - DRY RUN] (Không ghi file)" -ForegroundColor Yellow
} elseif ($NoDelete) {
    Write-Host "  Chế độ: [CẬP NHẬT] (Không xóa file thừa)" -ForegroundColor Yellow
} else {
    Write-Host "  Chế độ: [MIRROR] (Đồng bộ chính xác 100%)" -ForegroundColor Green
}
Write-Host "==================================================" -ForegroundColor Cyan

# Tham số Robocopy
$robocopyArgs = @(
    $sourcePath,
    $destPath,
    "*.*"
)

if ($NoDelete) {
    $robocopyArgs += "/E"
} else {
    $robocopyArgs += "/MIR"
}

# Loại trừ các thư mục và file hệ thống/git/script
$robocopyArgs += @(
    "/XD", ".git", ".github", ".vscode", ".idea", "node_modules",
    "/XF", "sync.ps1", "sync.bat", "sync.cmd", "sync.sh", ".gitignore",
    "/NDL",
    "/NP",
    "/MT:8",
    "/R:2",
    "/W:1"
)

if ($DryRun) {
    $robocopyArgs += "/L"
}

# Thực thi Robocopy
& robocopy @robocopyArgs
$exitCode = $LASTEXITCODE

# Mã thoát của Robocopy:
# 0: Không có file nào thay đổi
# 1: Đã copy thành công các file mới/cập nhật
# 2: Phát hiện file thừa (extras)
# 3: Đã copy file mới và phát hiện file thừa
# 4-7: Có file mismatch nhưng không có lỗi nghiêm trọng
# >= 8: Thất bại / có lỗi copy
if ($exitCode -ge 8) {
    Write-Host "`n[LỖI] Đồng bộ thất bại (Robocopy Exit Code: $exitCode)." -ForegroundColor Red
    exit $exitCode
} else {
    if ($exitCode -eq 0) {
        Write-Host "`n[HOÀN TẤT] Thư mục đã đồng bộ hoàn toàn (không có file thay đổi)." -ForegroundColor Green
    } else {
        Write-Host "`n[HOÀN TẤT] Đồng bộ thành công!" -ForegroundColor Green
    }
}

# Hiển thị trạng thái git nếu có thay đổi
if (-not $NoGitStatus -and -not $DryRun -and (Get-Command git -ErrorAction SilentlyContinue)) {
    if (Test-Path -LiteralPath (Join-Path $destPath ".git")) {
        $gitStatus = git -C $destPath status --short
        Write-Host "`nTrạng thái Git sau khi đồng bộ:" -ForegroundColor Cyan
        if ($gitStatus) {
            $gitStatus | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
        } else {
            Write-Host "  (Không có thay đổi trong Git working tree)" -ForegroundColor DarkGray
        }
    }
}

exit 0
