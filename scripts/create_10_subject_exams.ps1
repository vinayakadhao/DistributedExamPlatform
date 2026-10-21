$ErrorActionPreference = "Stop"
Set-Location "C:\DistributedExamPlatform"

$email = Read-Host "Teacher email [vinayak.s.adhao@gmail.com]"
if ([string]::IsNullOrWhiteSpace($email)) {
    $email = "vinayak.s.adhao@gmail.com"
}
$email = $email.Trim()

$securePassword = Read-Host "Teacher password" -AsSecureString
$pointer = [IntPtr]::Zero
$plainPassword = $null

try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $loginBody = @{
        email = $email
        password = $plainPassword
    } | ConvertTo-Json

    $login = Invoke-RestMethod -Method Post `
        -Uri "http://localhost:8000/api/auth/login" `
        -ContentType "application/json" -Body $loginBody
}
finally {
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    $plainPassword = $null
    $loginBody = $null
    $securePassword = $null
}

$token = [string]$login.access_token
if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Login did not return an access token."
}

$parts = $token.Split(".")
$payload = $parts[1].Replace("-", "+").Replace("_", "/")
switch ($payload.Length % 4) {
    2 { $payload += "==" }
    3 { $payload += "=" }
}
$claims = [Text.Encoding]::UTF8.GetString(
    [Convert]::FromBase64String($payload)
) | ConvertFrom-Json

if ($claims.role -ne "teacher") {
    throw "This account is not a teacher. No exams were created."
}

$headers = @{ Authorization = "Bearer $token" }
Write-Host "`nTeacher login verified."

# Each question is worth 2 marks. Every exam contains 5 questions.
$tests = @(

    @{
        Title = "Practice Test - Operating Systems"
        Description = "Processes, scheduling, deadlocks and memory management."
        Questions = @(
            @{ Text="What is a process?"; A="A file extension"; B="A program in execution"; C="A database"; D="A network"; Correct="B"; Explanation="A process is a program in execution." },
            @{ Text="Which condition is associated with deadlock?"; A="Compilation"; B="Indexing"; C="Circular wait"; D="Caching"; Correct="C"; Explanation="Circular wait is one of the classic necessary conditions for deadlock." },
            @{ Text="Which scheduling algorithm uses a time quantum?"; A="Round Robin"; B="FCFS only"; C="Static linking"; D="Binary search"; Correct="A"; Explanation="Round Robin allocates a time slice to each runnable process in turn." },
            @{ Text="What is a context switch?"; A="Renaming a file"; B="Deleting a process"; C="Changing a variable"; D="Saving one process state and restoring another"; Correct="D"; Explanation="A context switch changes which process or thread is executing on the CPU." },
            @{ Text="What is the purpose of virtual memory?"; A="To replace the CPU"; B="To provide an address space that can use secondary storage"; C="To remove all page faults"; D="To encrypt every file"; Correct="B"; Explanation="Virtual memory lets the operating system manage address spaces larger than available physical memory." }
        )
    },
    @{
        Title = "Practice Test - Database Management Systems"
        Description = "Keys, SQL, normalization, transactions and relationships."
        Questions = @(
            @{ Text="What is a primary key used for?"; A="Uniquely identifying a row"; B="Encrypting a table"; C="Sorting every query"; D="Storing duplicate IDs"; Correct="A"; Explanation="A primary key uniquely identifies a table row." },
            @{ Text="Which SQL command retrieves data?"; A="DROP"; B="SELECT"; C="ALTER"; D="GRANT"; Correct="B"; Explanation="SELECT retrieves rows from a database." },
            @{ Text="What is a major purpose of normalization?"; A="Increase duplication"; B="Remove all keys"; C="Reduce unwanted data redundancy"; D="Disable constraints"; Correct="C"; Explanation="Normalization organizes relations to reduce redundancy and update anomalies." },
            @{ Text="Which ACID property means all-or-nothing transaction execution?"; A="Isolation"; B="Durability"; C="Consistency"; D="Atomicity"; Correct="D"; Explanation="Atomicity means a transaction is applied completely or not at all." },
            @{ Text="What does a foreign key normally reference?"; A="A random file"; B="A key in another or the same table"; C="A network port"; D="A password"; Correct="B"; Explanation="A foreign key enforces a relationship with a referenced key." }
        )
    },
    @{
        Title = "Practice Test - Computer Networks"
        Description = "DNS, HTTPS, TCP, routers and HTTP status codes."
        Questions = @(
            @{ Text="What is DNS mainly used for?"; A="Compiling programs"; B="Compressing files"; C="Resolving domain names to DNS records"; D="Managing CPU scheduling"; Correct="C"; Explanation="DNS resolves domain names to records such as IP addresses." },
            @{ Text="What is the default HTTPS port?"; A="443"; B="21"; C="25"; D="110"; Correct="A"; Explanation="HTTPS conventionally uses TCP port 443." },
            @{ Text="Which transport protocol provides reliable, ordered byte-stream delivery?"; A="ARP"; B="DNS"; C="UDP"; D="TCP"; Correct="D"; Explanation="TCP provides ordered and reliable byte-stream delivery." },
            @{ Text="What does a router mainly do?"; A="Run SQL queries"; B="Forward packets between networks"; C="Compile source code"; D="Create passwords"; Correct="B"; Explanation="Routers forward packets between IP networks." },
            @{ Text="What does HTTP status 404 usually mean?"; A="Request succeeded"; B="Server is healthy"; C="Resource not found"; D="Authentication succeeded"; Correct="C"; Explanation="HTTP 404 indicates that the requested resource was not found." }
        )
    },
    @{
        Title = "Practice Test - Data Structures"
        Description = "Stacks, queues, linked lists, trees and search complexity."
        Questions = @(
            @{ Text="Which structure follows LIFO?"; A="Queue"; B="Stack"; C="Graph"; D="Hash table"; Correct="B"; Explanation="A stack removes the most recently added item first." },
            @{ Text="Which structure commonly follows FIFO?"; A="Queue"; B="Stack"; C="Call stack"; D="Recursive function"; Correct="A"; Explanation="A queue usually removes the earliest added item first." },
            @{ Text="What is the usual time complexity of binary search on a sorted array?"; A="O(n squared)"; B="O(n)"; C="O(log n)"; D="O(2 to the n)"; Correct="C"; Explanation="Binary search halves the search interval at each step." },
            @{ Text="What connects nodes in a typical linked list?"; A="Only a SQL statement"; B="A router"; C="A thread scheduler"; D="Links or pointers"; Correct="D"; Explanation="Linked-list nodes store links to other nodes." },
            @{ Text="Which data structure is commonly used in breadth-first search?"; A="Stack only"; B="Queue"; C="Single integer"; D="File extension"; Correct="B"; Explanation="BFS uses a queue to process vertices by distance from the source." }
        )
    },
    @{
        Title = "Practice Test - Algorithms"
        Description = "Complexity, sorting, searching, graph algorithms and greedy methods."
        Questions = @(
            @{ Text="What does Big O notation commonly describe?"; A="Growth of resource use as input size grows"; B="Source-code color"; C="Variable names"; D="Database passwords"; Correct="A"; Explanation="Big O describes an asymptotic upper bound on growth." },
            @{ Text="What is the typical time complexity of merge sort?"; A="O(1)"; B="O(n squared) in every case"; C="O(n log n)"; D="O(2 to the n)"; Correct="C"; Explanation="Merge sort usually runs in O(n log n) time." },
            @{ Text="Which graph algorithm finds shortest paths from a source with non-negative edge weights?"; A="Bubble sort"; B="Dijkstra's algorithm"; C="Binary insertion"; D="Depth-first traversal in all cases"; Correct="B"; Explanation="Dijkstra's algorithm finds shortest paths when edge weights are non-negative." },
            @{ Text="What does a greedy algorithm generally do?"; A="Always tries every possible solution"; B="Randomly discards input"; C="Never makes decisions"; D="Makes locally optimal choices at each step"; Correct="D"; Explanation="Greedy algorithms repeatedly select a locally optimal choice." },
            @{ Text="What is a common purpose of a base case in recursion?"; A="Make recursion infinite"; B="Create a network socket"; C="Stop recursive calls when a condition is reached"; D="Delete the input"; Correct="C"; Explanation="A base case provides a stopping condition for recursive calls." }
        )
    },
    @{
        Title = "Practice Test - Object-Oriented Programming"
        Description = "Inheritance, polymorphism, encapsulation, abstraction and constructors."
        Questions = @(
            @{ Text="What is inheritance?"; A="Sorting data"; B="Deriving a class from another class"; C="Deleting an object"; D="Creating a network route"; Correct="B"; Explanation="Inheritance allows a derived class to reuse or extend base-class behavior." },
            @{ Text="What does polymorphism support?"; A="Different implementations through a common interface"; B="Only one class in every program"; C="Removing all methods"; D="Encrypting files"; Correct="A"; Explanation="Polymorphism lets the same operation have different implementations." },
            @{ Text="What is encapsulation?"; A="Removing every method"; B="Converting code to SQL"; C="Grouping data with behavior and controlling access"; D="Scheduling processes"; Correct="C"; Explanation="Encapsulation bundles state and behavior while controlling access." },
            @{ Text="What is abstraction intended to do?"; A="Expose every internal detail"; B="Remove the public interface"; C="Disable reuse"; D="Present essential behavior while hiding implementation details"; Correct="D"; Explanation="Abstraction presents essential behavior and hides unnecessary implementation details." },
            @{ Text="What is a constructor commonly used for?"; A="Destroying a database"; B="Initializing a new object"; C="Routing packets"; D="Sorting all arrays"; Correct="B"; Explanation="A constructor initializes an object when it is created." }
        )
    },
    @{
        Title = "Practice Test - Cybersecurity"
        Description = "Password storage, phishing, least privilege, MFA and TLS."
        Questions = @(
            @{ Text="How should passwords be stored by an application?"; A="As plain text"; B="In a public file"; C="As salted, purpose-built password hashes"; D="Inside a URL"; Correct="C"; Explanation="Passwords should use a dedicated, slow password-hashing scheme with salts." },
            @{ Text="What is phishing?"; A="A deceptive attempt to obtain sensitive information"; B="A database join"; C="A CPU scheduling method"; D="A backup strategy"; Correct="A"; Explanation="Phishing uses deceptive messages or sites to steal information." },
            @{ Text="What does least privilege mean?"; A="Give everyone administrator access"; B="Disable all auditing"; C="Use no authentication"; D="Grant only the permissions needed for a task"; Correct="D"; Explanation="Least privilege limits access to what a user or service needs." },
            @{ Text="What does multi-factor authentication require?"; A="The same password twice"; B="Two or more different authentication factor types"; C="Only a username"; D="No verification"; Correct="B"; Explanation="MFA combines multiple different types of authentication factors." },
            @{ Text="What is TLS commonly used for?"; A="Sorting database rows"; B="Scheduling CPU tasks"; C="Protecting data in transit with cryptography"; D="Compiling Python"; Correct="C"; Explanation="TLS protects data in transit and authenticates endpoints where configured." }
        )
    },
    @{
        Title = "Practice Test - Cloud Computing"
        Description = "Elasticity, IaaS, SaaS, public cloud and containers."
        Questions = @(
            @{ Text="What does cloud elasticity mean?"; A="Resources can scale up or down with demand"; B="Resources cannot change"; C="Only physical servers are allowed"; D="Backups are unnecessary"; Correct="A"; Explanation="Elasticity adjusts resources in response to changing workload." },
            @{ Text="Which is an example of IaaS?"; A="A hosted email application only"; B="A virtual machine with configurable compute and networking"; C="A word-processing document"; D="A source-code comment"; Correct="B"; Explanation="Infrastructure as a Service provides configurable infrastructure resources." },
            @{ Text="What does SaaS typically provide?"; A="Raw physical disks only"; B="Only a compiler"; C="An application delivered as a service"; D="Only a network cable"; Correct="C"; Explanation="SaaS provides applications for users to access as a service." },
            @{ Text="What is a container intended to package?"; A="Only a CPU"; B="A physical datacenter"; C="A database password in public"; D="An application with its dependencies and runtime configuration"; Correct="D"; Explanation="Containers package applications and the dependencies needed to run them." },
            @{ Text="In a public cloud, infrastructure is generally operated by whom?"; A="Every customer individually"; B="A cloud provider offering services to multiple customers"; C="Only a local text editor"; D="A compiler"; Correct="B"; Explanation="Public-cloud resources are offered and operated by a cloud service provider." }
        )
    },
    @{
        Title = "Practice Test - Python Programming"
        Description = "Lists, dictionaries, len, indentation and tuples."
        Questions = @(
            @{ Text="Which Python collection is ordered and mutable?"; A="A list"; B="A string literal"; C="A tuple"; D="None"; Correct="A"; Explanation="Python lists are ordered and mutable." },
            @{ Text="What is a dictionary mainly used to store?"; A="Only sorted integers"; B="Key-value mappings"; C="Only file paths"; D="CPU processes"; Correct="B"; Explanation="Dictionaries map keys to values." },
            @{ Text="What does len([4, 7, 9]) return?"; A="2"; B="4"; C="3"; D="9"; Correct="C"; Explanation="The list contains three elements, so len returns 3." },
            @{ Text="What does indentation define in Python?"; A="Network ports"; B="Database indexes"; C="File permissions"; D="Code blocks"; Correct="D"; Explanation="Python uses indentation to define suites and code blocks." },
            @{ Text="What is a typical property of a tuple?"; A="It is always a database"; B="It is immutable after creation"; C="It can only contain strings"; D="It automatically sorts its values"; Correct="B"; Explanation="Tuples are immutable sequence objects." }
        )
    },
    @{
        Title = "Practice Test - Machine Learning"
        Description = "Supervised learning, classification, regression, overfitting and evaluation."
        Questions = @(
            @{ Text="What does supervised learning use for training?"; A="Only random labels"; B="No data"; C="Examples paired with target labels or values"; D="Only operating-system processes"; Correct="C"; Explanation="Supervised learning learns from examples associated with target labels or values." },
            @{ Text="Which task predicts a category such as spam or not spam?"; A="Classification"; B="Regression"; C="File compression"; D="Sorting only"; Correct="A"; Explanation="Classification predicts categorical labels." },
            @{ Text="Which task typically predicts a continuous numerical value?"; A="Classification only"; B="Routing"; C="Parsing"; D="Regression"; Correct="D"; Explanation="Regression predicts continuous numeric targets." },
            @{ Text="What is overfitting?"; A="A model that has no parameters"; B="A model that fits training data but generalizes poorly"; C="A perfectly tested network"; D="A database key"; Correct="B"; Explanation="Overfitting means a model captures training-specific patterns and performs poorly on unseen data." },
            @{ Text="Why use a held-out test set?"; A="To guarantee a perfect model"; B="To increase labels automatically"; C="To estimate performance on data not used for fitting"; D="To remove every prediction error"; Correct="C"; Explanation="A test set estimates model generalization on unseen examples." }
        )
    }
)

$allExams = Invoke-RestMethod -Uri "http://localhost:8000/api/exams" -Headers $headers
$results = @()
$now = [DateTimeOffset]::Now

foreach ($test in $tests) {
    Write-Host "`nProcessing: $($test.Title)"
    $exam = $allExams.exams |
        Where-Object { $_.title -eq $test.Title } |
        Select-Object -First 1

    if ($null -eq $exam) {
        $examBody = @{
            title = $test.Title
            description = $test.Description
            duration_minutes = 15
            total_marks = 10
            negative_marking = 0.25
            starts_at = $now.AddMinutes(-5).ToString("o")
            ends_at = $now.AddDays(7).ToString("o")
        }

        $exam = Invoke-RestMethod -Method Post `
            -Uri "http://localhost:8000/api/exams" `
            -Headers $headers `
            -ContentType "application/json" `
            -Body ($examBody | ConvertTo-Json -Depth 5)

        Write-Host "  Created exam ID $($exam.id)"
    }
    else {
        Write-Host "  Reusing exam ID $($exam.id)"
    }

    $examId = [int]$exam.id
    $existingResponse = Invoke-RestMethod `
        -Uri "http://localhost:8000/api/questions/exams/$examId/questions" `
        -Headers $headers

    $existingTexts = @($existingResponse.questions | ForEach-Object { $_.question_text })
    $added = 0

    foreach ($q in $test.Questions) {
        if ($existingTexts -notcontains $q.Text) {
            $questionBody = @{
                exam_id = $examId
                question_text = $q.Text
                option_a = $q.A
                option_b = $q.B
                option_c = $q.C
                option_d = $q.D
                correct_option = $q.Correct
                marks = 2
                explanation = $q.Explanation
            }

            Invoke-RestMethod -Method Post `
                -Uri "http://localhost:8000/api/questions" `
                -Headers $headers `
                -ContentType "application/json" `
                -Body ($questionBody | ConvertTo-Json -Depth 5) | Out-Null

            $existingTexts += $q.Text
            $added++
        }
    }

    $verify = Invoke-RestMethod `
        -Uri "http://localhost:8000/api/questions/exams/$examId/questions" `
        -Headers $headers

    $verifiedTexts = @($verify.questions | ForEach-Object { $_.question_text })
    $verified = @($test.Questions | Where-Object { $verifiedTexts -contains $_.Text }).Count

    Write-Host "  New questions added: $added"
    Write-Host "  Verified topic questions: $verified of 5"

    if ($verified -ne 5) {
        throw "Question verification failed for $($test.Title)."
    }

    $results += [PSCustomObject]@{
        ExamID = $examId
        Title = $test.Title
        Questions = $verified
        DurationMinutes = $exam.duration_minutes
        TotalMarks = $exam.total_marks
    }
}

Write-Host "`n--- All 10 subject exams verified ---"
$results | Format-Table -AutoSize -Wrap
