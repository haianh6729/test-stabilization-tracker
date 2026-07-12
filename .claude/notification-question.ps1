# Load Windows.Forms assembly
Add-Type -AssemblyName System.Windows.Forms

# Beep liên tục trong background (tần số khác để phân biệt)
$beepJob = Start-Job {
    while($true) {
        [console]::Beep(800, 150)
        Start-Sleep -Milliseconds 200
        [console]::Beep(800, 150)
        Start-Sleep -Milliseconds 400
    }
}

# Hiển thị popup
$response = [System.Windows.Forms.MessageBox]::Show(
    "Claude cần câu trả lời từ bạn!",
    "Câu hỏi",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Question
)

# Dừng beep khi user click OK
Stop-Job $beepJob | Out-Null
Remove-Job $beepJob -Force | Out-Null
