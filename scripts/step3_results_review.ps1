$ErrorActionPreference = "Stop"
Set-Location "C:\DistributedExamPlatform"

$studentEmail = "vinayak.adhao23@pccoepune.org"
$securePassword = Read-Host "Enter your student account password" -AsSecureString
$pointer = [IntPtr]::Zero
$plainPassword = $null

try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

    $loginBody = @{
        email = $studentEmail
        password = $plainPassword
    } | ConvertTo-Json

    $login = Invoke-RestMethod `
        -Method Post `
        -Uri "http://localhost:8000/api/auth/login" `
        -ContentType "application/json" `
        -Body $loginBody
}
finally {
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    $plainPassword = $null
    $loginBody = $null
    $securePassword = $null
}

$studentHeaders = @{
    Authorization = "Bearer $($login.access_token)"
}

Write-Host "`n--- All your examination attempts ---"

$history = Invoke-RestMethod `
    -Uri "http://localhost:8000/api/attempts" `
    -Headers $studentHeaders

Write-Host "Total attempts: $($history.count)"

$history.attempts |
    Select-Object exam_title, status, score, exam_total_marks,
        evaluation_status, submitted_at, id |
    Format-Table -AutoSize -Wrap

$finishedAttempt = $history.attempts |
    Where-Object {
        $_.status -eq "evaluated" -and
        $_.evaluation_status -eq "completed"
    } |
    Select-Object -First 1

if ($null -ne $finishedAttempt) {
    Write-Host "`n--- Testing answer review ---"

    $review = Invoke-RestMethod `
        -Uri "http://localhost:8000/api/attempts/$($finishedAttempt.id)/review" `
        -Headers $studentHeaders

    Write-Host "Exam: $($review.attempt.exam_title)"
    Write-Host "Score: $($review.attempt.score) / $($review.attempt.exam_total_marks)"
    Write-Host "Questions available for review: $($review.count)"

    Write-Host "`n--- First reviewed question ---"
    $review.questions |
        Select-Object -First 1 question_text, selected_option,
            selected_answer, correct_option, correct_answer,
            is_correct, marks_awarded, explanation |
        Format-List
}

Write-Host "`nStep 3 verification completed."
