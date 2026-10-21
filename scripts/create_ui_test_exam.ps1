$ErrorActionPreference = "Stop"
Set-Location "C:\DistributedExamPlatform"

function Get-JwtPayload {
    param([string]$Token)

    $parts = $Token.Split(".")
    if ($parts.Length -lt 2) {
        throw "The login response did not contain a valid JWT."
    }

    $payload = $parts[1].Replace("-", "+").Replace("_", "/")
    switch ($payload.Length % 4) {
        2 { $payload += "==" }
        3 { $payload += "=" }
    }

    $json = [System.Text.Encoding]::UTF8.GetString(
        [Convert]::FromBase64String($payload)
    )

    return ($json | ConvertFrom-Json)
}

# Authenticate afresh. Never reuse the earlier teacher token.
$emailInput = Read-Host "Teacher email [teacher361229@example.com]"
$teacherLoginEmail = $emailInput.Trim()

if ([string]::IsNullOrWhiteSpace($teacherLoginEmail)) {
    $teacherLoginEmail = "teacher361229@example.com"
}

$securePassword = Read-Host "Teacher password" -AsSecureString
$pointer = [IntPtr]::Zero
$teacherPlainPassword = $null

try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
        $securePassword
    )
    $teacherPlainPassword =
        [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

    $loginBody = @{
        email    = $teacherLoginEmail
        password = $teacherPlainPassword
    } | ConvertTo-Json

    $teacherLogin = Invoke-RestMethod `
        -Method Post `
        -Uri "http://localhost:8000/api/auth/login" `
        -ContentType "application/json" `
        -Body $loginBody
}
finally {
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    $teacherPlainPassword = $null
    $loginBody = $null
    $securePassword = $null
}

$teacherAuthToken = [string]$teacherLogin.access_token

if ([string]::IsNullOrWhiteSpace($teacherAuthToken)) {
    throw "Login returned no access token."
}

$claims = Get-JwtPayload $teacherAuthToken
if ($claims.role -ne "teacher") {
    throw "This account is not a teacher. No exam was created."
}

if ($claims.exp -and
    [long]$claims.exp -le [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) {
    throw "The newly issued teacher token is already expired."
}

$teacherHeaders = @{
    Authorization = "Bearer $teacherAuthToken"
}

Write-Host "`nFresh teacher login successful."

$title = "ExamFlow Full-Screen UI Test - 10 Questions"

# Ten questions, worth two marks each.
$questionBank = @(
    @{
        question_text = "Which protocol is commonly used by REST APIs?"
        option_a = "FTP"
        option_b = "HTTP"
        option_c = "SMTP"
        option_d = "SSH"
        correct_option = "B"
        explanation = "REST APIs commonly use HTTP methods such as GET and POST."
    },
    @{
        question_text = "Which HTTP method is normally used to retrieve a resource?"
        option_a = "GET"
        option_b = "DELETE"
        option_c = "PATCH"
        option_d = "CONNECT"
        correct_option = "A"
        explanation = "GET is conventionally used to retrieve a resource."
    },
    @{
        question_text = "What is a primary purpose of a load balancer?"
        option_a = "Encrypt every database row"
        option_b = "Write application code"
        option_c = "Distribute incoming traffic across servers"
        option_d = "Replace all backups"
        correct_option = "C"
        explanation = "A load balancer distributes requests across available backend instances."
    },
    @{
        question_text = "What is a major benefit of a message queue such as RabbitMQ?"
        option_a = "It eliminates every network failure"
        option_b = "It supports asynchronous message delivery"
        option_c = "It replaces application authentication"
        option_d = "It makes every request synchronous"
        correct_option = "B"
        explanation = "Queues allow producers and consumers to communicate asynchronously."
    },
    @{
        question_text = "In a microservices architecture, each service should generally have what?"
        option_a = "A copy of every service's private database"
        option_b = "The same source code as every other service"
        option_c = "No defined responsibility"
        option_d = "A focused, well-defined responsibility"
        correct_option = "D"
        explanation = "A microservice should encapsulate a relatively focused business capability."
    },
    @{
        question_text = "Which ACID property means a transaction happens completely or not at all?"
        option_a = "Atomicity"
        option_b = "Isolation"
        option_c = "Durability"
        option_d = "Consistency"
        correct_option = "A"
        explanation = "Atomicity prevents a transaction from being applied only partially."
    },
    @{
        question_text = "What is a common purpose of a signed JWT in an application?"
        option_a = "Compressing video"
        option_b = "Creating database indexes"
        option_c = "Carrying verifiable claims, such as identity and role"
        option_d = "Replacing HTTPS"
        correct_option = "C"
        explanation = "A signed JWT can carry claims verified by a service."
    },
    @{
        question_text = "Why might an API use an idempotency key when submitting an exam?"
        option_a = "To increase the exam duration"
        option_b = "To help prevent duplicate effects when a request is retried"
        option_c = "To reveal correct answers"
        option_d = "To disable authentication"
        correct_option = "B"
        explanation = "Idempotency can help retries avoid creating duplicate operations."
    },
    @{
        question_text = "What does a Docker image normally contain?"
        option_a = "Only a running computer's RAM"
        option_b = "Only the user's browser history"
        option_c = "A physical network switch"
        option_d = "An application's packaged filesystem and dependencies"
        correct_option = "D"
        explanation = "An image packages an application's filesystem and required dependencies."
    },
    @{
        question_text = "What is the purpose of a service health endpoint?"
        option_a = "To report service health or availability"
        option_b = "To publish user passwords"
        option_c = "To create exam questions automatically"
        option_d = "To replace all application logs"
        correct_option = "A"
        explanation = "Health endpoints help check whether a service is operating."
    }
)

# Reuse the test exam if it already exists.
$examList = Invoke-RestMethod `
    -Uri "http://localhost:8000/api/exams" `
    -Headers $teacherHeaders

$exam = $examList.exams |
    Where-Object { $_.title -eq $title } |
    Select-Object -First 1

if ($null -eq $exam) {
    $now = [DateTimeOffset]::Now

    $examBody = @{
        title            = $title
        description      = "Full-screen examination UI test: navigation, saving, review, timer and automatic grading."
        duration_minutes = 15
        total_marks      = 20
        negative_marking = 0.25
        starts_at        = $now.AddMinutes(-2).ToString("o")
        ends_at          = $now.AddDays(7).ToString("o")
    }

    $exam = Invoke-RestMethod `
        -Method Post `
        -Uri "http://localhost:8000/api/exams" `
        -Headers $teacherHeaders `
        -ContentType "application/json" `
        -Body ($examBody | ConvertTo-Json -Depth 5)

    Write-Host "Created new test exam."
}
else {
    Write-Host "Found existing test exam; checking its questions."
}

$examId = [int]$exam.id

# Add any missing questions without duplicating previously created ones.
$questionResponse = Invoke-RestMethod `
    -Uri "http://localhost:8000/api/questions/exams/$examId/questions" `
    -Headers $teacherHeaders

$existingQuestions = @($questionResponse.questions)
$addedCount = 0

foreach ($q in $questionBank) {
    $match = $existingQuestions |
        Where-Object { $_.question_text -eq $q.question_text } |
        Select-Object -First 1

    if ($null -eq $match) {
        $questionBody = @{
            exam_id        = $examId
            question_text  = $q.question_text
            option_a       = $q.option_a
            option_b       = $q.option_b
            option_c       = $q.option_c
            option_d       = $q.option_d
            correct_option = $q.correct_option
            marks          = 2
            explanation    = $q.explanation
        }

        $saved = Invoke-RestMethod `
            -Method Post `
            -Uri "http://localhost:8000/api/questions" `
            -Headers $teacherHeaders `
            -ContentType "application/json" `
            -Body ($questionBody | ConvertTo-Json -Depth 5)

        $existingQuestions += $saved
        $addedCount++
        Write-Host "Added question $($addedCount): $($q.question_text)"
    }
}

# Verify what the database now returns.
$verified = Invoke-RestMethod `
    -Uri "http://localhost:8000/api/questions/exams/$examId/questions" `
    -Headers $teacherHeaders

$verifiedQuestions = @($verified.questions)
$testQuestionCount = @(
    $verifiedQuestions |
    Where-Object {
        $_.question_text -in @($questionBank | ForEach-Object { $_.question_text })
    }
).Count

Write-Host "`n--- Verification ---"
Write-Host "Exam ID: $examId"
Write-Host "Exam title: $($exam.title)"
Write-Host "Questions added this run: $addedCount"
Write-Host "Test questions verified: $testQuestionCount of 10"
Write-Host "Duration: $($exam.duration_minutes) minutes"
Write-Host "Total marks: $($exam.total_marks)"

if ($testQuestionCount -ne 10) {
    throw "Verification failed. The test exam does not yet contain all 10 questions."
}
