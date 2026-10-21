(() => {
    "use strict";

    const $ = id => document.getElementById(id);

    const state = {
        token: localStorage.getItem("examflow_token") || "",
        email: localStorage.getItem("examflow_email") || "",
        role: localStorage.getItem("examflow_role") || "",
        exams: [],
        attempts: [],
        authMode: "login"
    };

    let toastTimer;

    function escapeHtml(value) {
        const chars = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        let text = String(value);
        return text.replace(/[&<>"']/g, ch => chars[ch]);
    }

    function errorMessage(error) {
        if (error && error.message) return error.message;
        return String(error);
    }

    function showToast(message, type) {
        const toast = $("toast");
        toast.textContent = String(message);
        toast.className = "toast show";

        if (type === "error") toast.classList.add("error");
        if (type === "success") toast.classList.add("success");

        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
            toast.className = "toast";
        }, 4000);
    }

    async function api(path, options) {
        const settings = options || {};
        const headers = Object.assign({}, settings.headers || {});

        if (state.token) {
            headers.Authorization = "Bearer " + state.token;
        }

        let body = settings.body;

        if (body !== undefined && body !== null && typeof body !== "string") {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(body);
        }

        const response = await fetch(path, Object.assign({}, settings, {
            headers,
            body
        }));

        const raw = await response.text();
        let data = null;

        if (raw) {
            try {
                data = JSON.parse(raw);
            } catch {
                data = raw;
            }
        }

        if (!response.ok) {
            let detail = "";

            if (data && typeof data === "object") {
                if (typeof data.detail === "string") detail = data.detail;
                if (!detail && typeof data.message === "string") detail = data.message;

                if (Array.isArray(data.detail)) {
                    detail = data.detail.map(item => item.msg || String(item)).join("; ");
                }
            }

            if (!detail && typeof data === "string") detail = data;
            if (!detail) detail = "Request failed with HTTP " + response.status;

            throw new Error(detail);
        }

        return data;
    }

    function decodeToken(token) {
        try {
            const parts = token.split(".");
            if (parts.length < 2) return {};

            let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");

            while (payload.length % 4 !== 0) payload += "=";

            return JSON.parse(atob(payload));
        } catch {
            return {};
        }
    }

    function saveSession(token, email, role) {
        state.token = token;
        state.email = email;
        state.role = String(role).toLowerCase();

        localStorage.setItem("examflow_token", token);
        localStorage.setItem("examflow_email", email);
        localStorage.setItem("examflow_role", state.role);
    }

    function clearSession() {
        state.token = "";
        state.email = "";
        state.role = "";

        localStorage.removeItem("examflow_token");
        localStorage.removeItem("examflow_email");
        localStorage.removeItem("examflow_role");
    }

    function setAuthMode(mode) {
        state.authMode = mode;

        const registering = mode === "register";

        $("authTitle").textContent = registering
            ? "Create your account"
            : "Sign in to your account";

        $("authDescription").textContent = registering
            ? "Set up your ExamFlow account to get started."
            : "Enter your credentials to continue.";

        $("authSubmit").textContent = registering ? "Create account" : "Sign in";
        $("authSwitchText").textContent = registering
            ? "Already have an account"
            : "New to ExamFlow";

        $("authSwitch").textContent = registering ? "Sign in" : "Create account";
        $("nameGroup").classList.toggle("hidden", !registering);
        $("roleGroup").classList.toggle("hidden", !registering);
        $("authName").required = registering;
        $("authPassword").autocomplete = registering ? "new-password" : "current-password";
    }

    function logout(message) {
        clearSession();
        $("appView").classList.add("hidden");
        $("authView").classList.remove("hidden");
        setAuthMode("login");

        if (message) showToast(message, "error");
    }

    function formatDate(value) {
        if (!value) return "Not specified";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);

        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function formatNumber(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return "Not available";
        return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    function extractItems(data, key) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data[key])) return data[key];
        return [];
    }

    function setDefaultDates() {
        const startInput = $("examStarts");
        const endInput = $("examEnds");

        if (startInput.value || endInput.value) return;

        const now = new Date();
        const start = new Date(now.getTime() + 5 * 60000);
        const end = new Date(now.getTime() + 7 * 86400000);

        const localInputDate = date => {
            const offset = date.getTimezoneOffset() * 60000;
            return new Date(date.getTime() - offset).toISOString().slice(0, 16);
        };

        startInput.value = localInputDate(start);
        endInput.value = localInputDate(end);
    }

    function showView(view) {
        const views = ["overview", "exams", "results"];

        views.forEach(name => {
            $(name + "Panel").classList.toggle("hidden", name !== view);
        });

        const titles = {
            overview: "Overview",
            exams: "Examinations",
            results: "Results and activity"
        };

        $("pageTitle").textContent = titles[view] || "Overview";
        $("breadcrumbCurrent").textContent = titles[view] || "Overview";

        document.querySelectorAll(".nav-item[data-view]").forEach(button => {
            button.classList.toggle("active", button.dataset.view === view);
        });

        if (view === "exams") {
            loadExams(false).catch(error => showToast(errorMessage(error), "error"));
        }

        if (view === "results") {
            loadResults().catch(error => showToast(errorMessage(error), "error"));
        }
    }

    function openDashboard() {
        if (!state.token || !state.role) {
            logout("Please sign in again.");
            return;
        }

        const teacher = state.role === "teacher";
        const roleLabel = teacher ? "Teacher" : "Student";

        $("authView").classList.add("hidden");
        $("appView").classList.remove("hidden");

        $("profileEmail").textContent = state.email || "Signed-in user";
        $("profileRole").textContent = roleLabel;
        $("profileAvatar").textContent = (state.email || roleLabel).charAt(0).toUpperCase();

        $("welcomeTitle").textContent = "Welcome back, " + roleLabel;
        $("welcomeText").textContent = teacher
            ? "Manage examinations, questions and your teaching workspace."
            : "Find examinations, complete assessments and review results.";

        $("statSecondLabel").textContent = "Your role";
        $("statSecond").textContent = roleLabel;
        $("statSecondFoot").textContent = "Authenticated workspace";

        $("actionPrimaryTitle").textContent = teacher
            ? "Manage examinations"
            : "Explore examinations";

        $("actionPrimaryText").textContent = teacher
            ? "Create exams and manage questions."
            : "Find available exams and take assessments.";

        $("actionSecondaryTitle").textContent = teacher
            ? "Exam activity"
            : "View results";

        $("actionSecondaryText").textContent = teacher
            ? "Review your examination workspace."
            : "View your complete attempt history and scores.";

        $("examsHeading").textContent = teacher
            ? "Exam management"
            : "Examinations";

        $("examsDescription").textContent = teacher
            ? "Create examinations and add questions."
            : "Available, submitted and expired examinations.";

        $("createExamCard").classList.toggle("hidden", !teacher);
        $("createQuestionCard").classList.toggle("hidden", !teacher);

        setDefaultDates();
        showView("overview");
        loadExams(false).catch(error => showToast(errorMessage(error), "error"));
    }

    function examAttemptMap() {
        const map = new Map();

        state.attempts.forEach(attempt => {
            const key = String(attempt.exam_id);
            const previous = map.get(key);

            if (!previous) {
                map.set(key, attempt);
                return;
            }

            const newDate = new Date(attempt.started_at || 0).getTime();
            const oldDate = new Date(previous.started_at || 0).getTime();

            if (newDate >= oldDate) map.set(key, attempt);
        });

        return map;
    }

    function renderExamCard(exam, category, attempt) {
        const title = escapeHtml(exam.title || ("Exam " + exam.id));
        const description = escapeHtml(exam.description || "No description provided.");
        const id = Number(exam.id);

        const duration = escapeHtml(exam.duration_minutes);
        const total = escapeHtml(exam.total_marks);
        const starts = escapeHtml(formatDate(exam.starts_at));
        const ends = escapeHtml(formatDate(exam.ends_at));
        const penalty = escapeHtml(exam.negative_marking || 0);

        let action = "";
        let badge = "AVAILABLE";
        let badgeClass = "";

        if (state.role === "teacher") {
            badge = "MANAGE";
            action = `<button class="button secondary" type="button" data-manage-questions="${id}">Add question</button>`;
        } else if (category === "submitted") {
            const completed = Boolean(
                attempt &&
                (attempt.status === "evaluated" || attempt.evaluation_status === "completed")
            );

            badge = completed ? "EVALUATED" : "SUBMITTED";
            badgeClass = completed ? "complete" : "pending";
            action = '<button class="button secondary" type="button" data-view="results">View results</button>';
        } else if (category === "expired") {
            badge = "EXPIRED";
            badgeClass = "pending";
            action = '<button class="button secondary" type="button" disabled>Exam expired</button>';
        } else {
            const startTime = new Date(exam.starts_at).getTime();

            if (Number.isFinite(startTime) && startTime > Date.now()) {
                badge = "UPCOMING";
                badgeClass = "pending";
                action = `<button class="button secondary" type="button" disabled>Opens ${starts}</button>`;
            } else {
                action = `<button class="button primary" type="button" data-start-exam="${id}">Start examination</button>`;
            }
        }

        return `
          <article class="exam-card">
            <div class="exam-card-top">
              <h3>${title}</h3>
              <span class="status-tag ${badgeClass}">${badge}</span>
            </div>
            <p class="exam-description">${description}</p>
            <div class="exam-meta">
              <span>${duration} min</span>
              <span>${total} marks</span>
              <span>Penalty ${penalty}</span>
            </div>
            <div class="exam-meta"><span>Starts: ${starts}</span></div>
            <div class="exam-meta"><span>Ends: ${ends}</span></div>
            ${action}
          </article>`;
    }

    function sectionHtml(title, description, exams, category, attempts) {
        let cards = "";

        if (exams.length === 0) {
            let emptyText = "No exams in this section.";
            if (category === "available") emptyText = "No exams are open right now.";
            if (category === "submitted") emptyText = "No submitted exams yet.";
            if (category === "expired") emptyText = "No expired exams.";

            cards = `<div class="exam-section-empty">${escapeHtml(emptyText)}</div>`;
        } else {
            cards = '<div class="exam-grid">' + exams.map(exam => {
                return renderExamCard(exam, category, attempts.get(String(exam.id)));
            }).join("") + "</div>";
        }

        return `
          <section class="exam-section">
            <div class="exam-section-heading">
              <div>
                <h2>${escapeHtml(title)} <span class="exam-section-count">${exams.length}</span></h2>
                <p>${escapeHtml(description)}</p>
              </div>
            </div>
            ${cards}
          </section>`;
    }

    async function loadExams(showMessage) {
        const data = await api("/api/exams");
        state.exams = extractItems(data, "exams");

        if (state.role === "student") {
            const history = await api("/api/attempts");
            state.attempts = extractItems(history, "attempts");
        } else {
            state.attempts = [];
        }

        $("statExams").textContent = String(state.exams.length);
        renderExams();

        if (showMessage) showToast("Examinations refreshed.", "success");
    }

    function renderExams() {
        const list = $("examList");
        const teacher = state.role === "teacher";

        $("examEmpty").classList.toggle("hidden", state.exams.length > 0);

        if (state.exams.length === 0) {
            list.innerHTML = "";
            return;
        }

        if (teacher) {
            list.innerHTML = sectionHtml(
                "Exam management",
                "Create examinations and manage questions.",
                state.exams,
                "manage",
                new Map()
            );
            return;
        }

        const attempts = examAttemptMap();
        const now = Date.now();
        const available = [];
        const submitted = [];
        const expired = [];

        state.exams.forEach(exam => {
            const attempt = attempts.get(String(exam.id));

            let isSubmitted = false;
            if (attempt) {
                if (attempt.status === "submitted" || attempt.status === "evaluated") {
                    isSubmitted = true;
                }
                if (["queued", "completed", "failed"].includes(attempt.evaluation_status)) {
                    isSubmitted = true;
                }
            }

            if (isSubmitted) {
                submitted.push(exam);
                return;
            }

            const endTime = new Date(exam.ends_at).getTime();

            if (Number.isFinite(endTime) && endTime <= now) {
                expired.push(exam);
            } else {
                available.push(exam);
            }
        });

        list.innerHTML =
            sectionHtml(
                "Available",
                "Exams you can start now or that open at a scheduled time.",
                available,
                "available",
                attempts
            ) +
            sectionHtml(
                "Submitted",
                "Exams you have handed in, including those awaiting evaluation.",
                submitted,
                "submitted",
                attempts
            ) +
            sectionHtml(
                "Expired",
                "Exams whose deadline passed without submission.",
                expired,
                "expired",
                attempts
            );

        const select = $("questionExam");
        const previousValue = select.value;

        select.innerHTML = '<option value="">Select an examination</option>';
        state.exams.forEach(exam => {
            const option = document.createElement("option");
            option.value = String(exam.id);
            option.textContent = exam.title || ("Exam " + exam.id);
            select.appendChild(option);
        });

        if (state.exams.some(exam => String(exam.id) === previousValue)) {
            select.value = previousValue;
        }
    }

    async function showAttemptReview(attemptId) {
        const list = $("resultsList");
        list.innerHTML = '<article class="content-card"><p class="muted">Loading reviewed answers...</p></article>';

        try {
            const data = await api("/api/attempts/" + encodeURIComponent(attemptId) + "/review");
            const attempt = data.attempt;
            const questions = Array.isArray(data.questions) ? data.questions : [];

            let html = `
              <article class="content-card review-container">
                <div class="section-heading review-heading">
                  <div>
                    <span class="eyebrow">ANSWER REVIEW</span>
                    <h2>${escapeHtml(attempt.exam_title || "Exam review")}</h2>
                    <p>Score: ${escapeHtml(formatNumber(attempt.score))} / ${escapeHtml(formatNumber(attempt.exam_total_marks))}</p>
                  </div>
                  <button type="button" class="button secondary" data-back-results>Back to results</button>
                </div>
                <p class="muted">Correct answers are shown after evaluation is completed.</p>`;

            questions.forEach((question, index) => {
                let status = "Incorrect";
                let statusClass = "pending";

                if (question.is_correct) {
                    status = "Correct";
                    statusClass = "complete";
                } else if (!question.selected_option) {
                    status = "Unanswered";
                }

                let selected = "Not answered";
                if (question.selected_option) {
                    selected = "Option " + question.selected_option + " - " + (question.selected_answer || "");
                }

                const correct = "Option " + question.correct_option + " - " + (question.correct_answer || "");

                html += `
                  <article class="review-question-card">
                    <div class="review-q-header">
                      <strong>Question ${index + 1}</strong>
                      <span class="status-tag ${statusClass}">${status}</span>
                    </div>
                    <h3>${escapeHtml(question.question_text)}</h3>
                    <p><strong>Your answer:</strong> ${escapeHtml(selected)}</p>
                    <p><strong>Correct answer:</strong> ${escapeHtml(correct)}</p>
                    <p><strong>Marks awarded:</strong> ${escapeHtml(formatNumber(question.marks_awarded))} / ${escapeHtml(formatNumber(question.marks))}</p>
                    <p><strong>Explanation:</strong> ${escapeHtml(question.explanation || "No explanation provided.")}</p>
                  </article>`;
            });

            html += '<button type="button" class="button secondary" data-back-results>Back to results</button></article>';
            list.innerHTML = html;
            list.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            list.innerHTML = `
              <article class="content-card">
                <h3>Answer review unavailable</h3>
                <p class="muted">${escapeHtml(errorMessage(error))}</p>
                <button type="button" class="button secondary" data-back-results>Back to results</button>
              </article>`;
        }
    }

    async function loadResults() {
        const list = $("resultsList");
        const empty = $("resultsEmpty");

        empty.classList.add("hidden");
        list.innerHTML = '<article class="content-card"><p class="muted">Loading attempt history...</p></article>';

        try {
            const data = await api("/api/attempts");
            const attempts = extractItems(data, "attempts");

            if (!attempts.length) {
                list.innerHTML = "";
                empty.classList.remove("hidden");
                return;
            }

            list.innerHTML = attempts.map(attempt => {
                const title = escapeHtml(attempt.exam_title || ("Exam " + attempt.exam_id));
                const status = String(attempt.status || "unknown").toLowerCase();
                const evaluation = String(attempt.evaluation_status || "pending").toLowerCase();

                let score = "Pending";
                if (attempt.score !== null && attempt.score !== undefined) {
                    score = formatNumber(attempt.score) + " / " + formatNumber(attempt.exam_total_marks);
                }

                let action = '<span class="status-tag pending">Evaluation pending</span>';

                if (status === "evaluated" && evaluation === "completed") {
                    action = `<button type="button" class="button primary" data-review-attempt="${escapeHtml(attempt.id)}">Review answers</button>`;
                } else if (status === "in_progress") {
                    action = '<span class="status-tag">In progress</span>';
                } else if (status !== "submitted" && evaluation !== "queued") {
                    action = `<span class="status-tag">${escapeHtml(status)}</span>`;
                }

                return `
                  <article class="result-history-card">
                    <div class="result-history-main">
                      <div class="result-history-title">
                        <h3>${title}</h3>
                        <span class="status-tag">${escapeHtml(status.replace(/_/g, " "))}</span>
                      </div>
                      <p>Attempt ID: ${escapeHtml(attempt.id)}</p>
                      <p>Submitted: ${escapeHtml(formatDate(attempt.submitted_at))}</p>
                      <p>Evaluation: ${escapeHtml(evaluation)}</p>
                    </div>
                    <div class="result-history-side">
                      <div class="result-score">${escapeHtml(score)}<small>Score / total marks</small></div>
                      ${action}
                    </div>
                  </article>`;
            }).join("");
        } catch (error) {
            list.innerHTML = `
              <article class="content-card">
                <h3>Could not load result history</h3>
                <p class="muted">${escapeHtml(errorMessage(error))}</p>
              </article>`;
        }
    }

    $("authSwitch").addEventListener("click", () => {
        if (state.authMode === "login") setAuthMode("register");
        else setAuthMode("login");
    });

    $("authForm").addEventListener("submit", async event => {
        event.preventDefault();

        const button = $("authSubmit");
        button.disabled = true;

        const email = $("authEmail").value.trim().toLowerCase();
        const password = $("authPassword").value;

        try {
            let response;

            if (state.authMode === "register") {
                response = await api("/api/auth/register", {
                    method: "POST",
                    body: {
                        email,
                        password,
                        role: $("authRole").value,
                        name: $("authName").value.trim()
                    }
                });

                let token = "";
                if (response && response.access_token) token = response.access_token;
                if (response && response.token) token = response.token;

                if (!token) {
                    $("authEmail").value = email;
                    $("authPassword").value = "";
                    setAuthMode("login");
                    showToast("Account created. Sign in to continue.", "success");
                    return;
                }
            } else {
                response = await api("/api/auth/login", {
                    method: "POST",
                    body: { email, password }
                });
            }

            let token = "";
            if (response && response.access_token) token = response.access_token;
            if (!token && response && response.token) token = response.token;

            if (!token) {
                throw new Error("The authentication response did not contain an access token.");
            }

            const claims = decodeToken(token);
            let role = "";

            if (response && response.user && response.user.role) role = response.user.role;
            if (!role && response && response.role) role = response.role;
            if (!role && claims.role) role = claims.role;

            if (!role) throw new Error("The login response did not include a user role.");

            saveSession(token, email, role);
            openDashboard();
            showToast("Signed in successfully.", "success");
        } catch (error) {
            showToast(errorMessage(error), "error");
        } finally {
            button.disabled = false;
        }
    });

    $("logoutButton").addEventListener("click", () => logout(""));

    $("refreshExams").addEventListener("click", () => {
        loadExams(true).catch(error => showToast(errorMessage(error), "error"));
    });

    $("refreshResults").addEventListener("click", () => {
        loadResults().catch(error => showToast(errorMessage(error), "error"));
    });

    $("createExamForm").addEventListener("submit", async event => {
        event.preventDefault();

        const button = event.submitter;
        if (button) button.disabled = true;

        try {
            const starts = new Date($("examStarts").value);
            const ends = new Date($("examEnds").value);

            if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
                throw new Error("Please provide valid exam start and end dates.");
            }

            if (ends <= starts) {
                throw new Error("The end date must be later than the start date.");
            }

            const body = {
                title: $("examTitle").value.trim(),
                description: $("examDescription").value.trim(),
                duration_minutes: Number($("examDuration").value),
                total_marks: Number($("examTotalMarks").value),
                negative_marking: Number($("examPenalty").value),
                starts_at: starts.toISOString(),
                ends_at: ends.toISOString()
            };

            await api("/api/exams", { method: "POST", body });
            $("createExamForm").reset();
            setDefaultDates();
            showToast("Exam created successfully.", "success");
            await loadExams(false);
        } catch (error) {
            showToast(errorMessage(error), "error");
        } finally {
            if (button) button.disabled = false;
        }
    });

    $("createQuestionForm").addEventListener("submit", async event => {
        event.preventDefault();

        const button = event.submitter;
        if (button) button.disabled = true;

        try {
            const examId = Number($("questionExam").value);
            if (!examId) throw new Error("Select an exam first.");

            const body = {
                exam_id: examId,
                question_text: $("questionText").value.trim(),
                option_a: $("optionA").value.trim(),
                option_b: $("optionB").value.trim(),
                option_c: $("optionC").value.trim(),
                option_d: $("optionD").value.trim(),
                correct_option: $("correctOption").value,
                marks: Number($("questionMarks").value),
                explanation: $("questionExplanation").value.trim()
            };

            await api("/api/questions", { method: "POST", body });

            $("createQuestionForm").reset();
            $("questionExam").value = String(examId);
            $("questionMarks").value = "2";
            showToast("Question saved successfully.", "success");
        } catch (error) {
            showToast(errorMessage(error), "error");
        } finally {
            if (button) button.disabled = false;
        }
    });

    document.addEventListener("click", event => {
        const reviewButton = event.target.closest("[data-review-attempt]");
        if (reviewButton) {
            event.preventDefault();
            showAttemptReview(reviewButton.dataset.reviewAttempt);
            return;
        }

        const backButton = event.target.closest("[data-back-results]");
        if (backButton) {
            event.preventDefault();
            loadResults().catch(error => showToast(errorMessage(error), "error"));
            return;
        }

        const viewButton = event.target.closest("[data-view]");
        if (viewButton) {
            event.preventDefault();
            const view = viewButton.dataset.view;

            if (view === "exams") {
                $("attemptPanel").classList.add("hidden");
                $("resultPanel").classList.add("hidden");
                $("examList").classList.remove("hidden");
                $("createExamCard").classList.toggle("hidden", state.role !== "teacher");
                $("createQuestionCard").classList.toggle("hidden", state.role !== "teacher");
            }

            showView(view);
            return;
        }

        const manageButton = event.target.closest("[data-manage-questions]");
        if (manageButton) {
            $("questionExam").value = String(manageButton.dataset.manageQuestions);
            $("createQuestionCard").scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });

    // Restore the current session if a valid, unexpired token remains.
    if (state.token) {
        const claims = decodeToken(state.token);
        const expired = claims.exp && claims.exp * 1000 <= Date.now();

        if (expired) {
            logout("Your session expired. Sign in again.");
        } else {
            if (!state.role && claims.role) state.role = claims.role;
            if (!state.email && claims.email) state.email = claims.email;

            if (state.role) openDashboard();
            else logout("Please sign in again.");
        }
    } else {
        setAuthMode("login");
    }
})();
