<#
.SYNOPSIS
    Đồng bộ dữ liệu thiết kế từ ..\ting\design sang ting-demo,
    tự động commit và push lên Git master.

.DESCRIPTION
    Sử dụng Windows Robocopy để đồng bộ nhanh, bảo toàn thư mục .git
    và tự động tạo git commit + push lên master khi có thay đổi.

.PARAMETER Source
    Đường dẫn thư mục nguồn. Mặc định: "..\ting\design".

.PARAMETER Destination
    Đường dẫn thư mục đích. Mặc định: thư mục chứa script này (ting-demo).

.PARAMETER Message
    Nội dung commit message. Mặc định: "feat: sync design from ting (yyyy-MM-dd HH:mm)".

.PARAMETER Branch
    Tên nhánh Git cần push. Mặc định: "master" (hoặc nhánh hiện tại).

.PARAMETER DryRun
    Chạy thử nghiệm (xem trước các file sẽ được copy/xóa mà không thay đổi thực tế).

.PARAMETER NoDelete
    Chỉ copy các file mới/thay đổi, không xóa các file thừa ở thư mục đích.

.PARAMETER NoCommit
    Chỉ đồng bộ file, không tạo commit và không push.

.PARAMETER NoPush
    Có commit nhưng không push lên remote.

.EXAMPLE
    .\sync.ps1
    # Đồng bộ, tự động commit và push lên master

.EXAMPLE
    .\sync.ps1 -DryRun
    # Xem trước danh sách thay đổi

.EXAMPLE
    .\sync.ps1 -Message "feat: update menu layout"
    # Đồng bộ với commit message tùy chỉnh
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Source,

    [Parameter(Position = 1)]
    [string]$Destination,

    [Parameter()]
    [string]$Message,

    [Parameter()]
    [string]$Branch = "master",

    [Parameter()]
    [switch]$DryRun,

    [Parameter()]
    [switch]$NoDelete,

    [Parameter()]
    [switch]$NoCommit,

    [Parameter()]
    [switch]$NoPush
)

# Đảm bảo UTF-8 cho tên file tiếng Việt và Git
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
# 0-7: Thành công (0 = không thay đổi, 1 = có file mới/cập nhật, 2 = có file thừa,...)
# >= 8: Thất bại / có lỗi copy
if ($exitCode -ge 8) {
    Write-Host "`n[LỖI] Đồng bộ thất bại (Robocopy Exit Code: $exitCode)." -ForegroundColor Red
    exit $exitCode
} else {
    if ($exitCode -eq 0) {
        Write-Host "`n[HOÀN TẤT] File đã đồng bộ hoàn toàn." -ForegroundColor Green
    } else {
        Write-Host "`n[HOÀN TẤT] Đồng bộ file thành công!" -ForegroundColor Green
    }
}

# Tự động commit và push nếu có thay đổi và không chạy DryRun
if (-not $DryRun -and -not $NoCommit -and (Get-Command git -ErrorAction SilentlyContinue)) {
    if (Test-Path -LiteralPath (Join-Path $destPath ".git")) {
        $gitStatus = git -C $destPath status --porcelain
        if ($gitStatus) {
            Write-Host "`nTrạng thái Git phát hiện thay đổi:" -ForegroundColor Cyan
            git -C $destPath status --short | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }

            # Lấy tên nhánh hiện tại
            $currentBranch = (git -C $destPath branch --show-current).Trim()
            if (-not $currentBranch) {
                $currentBranch = $Branch
            }

            # Tạo commit message mặc định nếu chưa truyền
            $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm")
            $commitMsg = if ($Message) { $Message } else { "feat: sync design from ting ($timestamp)" }

            Write-Host "`n>> Đang tạo commit: '$commitMsg'..." -ForegroundColor Cyan
            git -C $destPath add -A
            git -C $destPath commit -m $commitMsg

            if ($LASTEXITCODE -eq 0) {
                if (-not $NoPush) {
                    Write-Host ">> Đang push lên origin/$currentBranch..." -ForegroundColor Cyan
                    git -C $destPath push origin $currentBranch
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "[THÀNH CÔNG] Đã commit và push lên origin/$currentBranch thành công!" -ForegroundColor Green
                    } else {
                        Write-Host "[CẢNH BÁO] Push lên origin thất bại (Exit Code: $LASTEXITCODE)." -ForegroundColor Red
                    }
                } else {
                    Write-Host "[HOÀN TẤT] Đã commit cục bộ (bỏ qua push do -NoPush)." -ForegroundColor Green
                }
            } else {
                Write-Host "[CẢNH BÁO] Không thể tạo commit Git." -ForegroundColor Yellow
            }
        } else {
            Write-Host "`n[GIT] Working tree sạch sẽ, không có thay đổi nào để commit & push." -ForegroundColor DarkGray
        }
    }
}

exit 0
