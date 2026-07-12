# Load Windows.Forms assembly
Add-Type -AssemblyName System.Windows.Forms

# Beep liên tục trong background
$beepJob = Start-Job {
    while($true) {
        [console]::Beep(1000, 200)
        Start-Sleep -Milliseconds 400
    }
}

# Hiển thị popup
$response = [System.Windows.Forms.MessageBox]::Show(
    "Claude đã hoàn thành câu trả lời!",
    "Thông báo",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
)

# Dừng beep khi user click OK
Stop-Job $beepJob | Out-Null
Remove-Job $beepJob -Force | Out-Null
