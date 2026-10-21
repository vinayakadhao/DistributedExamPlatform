(() => {
    "use strict";

    const $ = id => document.getElementById(id);
    let session = null;
    let overlay = null;
    let timerInterval = null;
    let launchNumber = 0;
    const originalTitle = document.title;

    const style = document.createElement("style");
    style.id = "real-exam-ui-styles";
    style.textContent = `
      #realExamOverlay {
        position:fixed; inset:0; z-index:2147483000; background:#f4f6fb;
        color:#192438; display:flex; flex-direction:column;
        font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
        overflow:hidden; font-size:14px;
      }
      #realExamOverlay * {box-sizing:border-box}
      #realExamOverlay button, #realExamOverlay input {font:inherit}
      #realExamOverlay button {cursor:pointer}
      #realExamOverlay button:focus-visible,
      #realExamOverlay input:focus-visible {outline:3px solid #a7b5ff;outline-offset:2px}
      #realExamOverlay .rx-hidden {display:none!important}
      #realExamOverlay .rx-header {
        min-height:76px;background:white;border-bottom:1px solid #e2e7f0;
        display:flex;align-items:center;justify-content:space-between;gap:20px;
        padding:12px 25px;flex-shrink:0
      }
      #realExamOverlay .rx-brand {display:flex;align-items:center;gap:12px;min-width:0}
      #realExamOverlay .rx-logo {width:40px;height:40px;border-radius:11px;background:#4968f2;
        color:white;font-weight:850;font-size:21px;display:grid;place-items:center;flex-shrink:0}
      #realExamOverlay .rx-brand small {display:block;font-size:9px;letter-spacing:.15em;color:#8290a5;font-weight:800}
      #realExamOverlay .rx-brand strong {display:block;font-size:15px;line-height:1.4;overflow-wrap:anywhere}
      #realExamOverlay .rx-clock {
        min-width:125px;padding:7px 16px;border:1px solid #f2d5d1;
        background:#fff5f3;border-radius:10px;text-align:center;flex-shrink:0
      }
      #realExamOverlay .rx-clock small {display:block;font-size:9px;font-weight:800;letter-spacing:.1em;color:#a65c50}
      #realExamOverlay .rx-clock strong {display:block;font-size:23px;line-height:1.35;color:#a63232;font-variant-numeric:tabular-nums}
      #realExamOverlay .rx-header-right {display:flex;align-items:center;justify-content:flex-end;gap:12px}
      #realExamOverlay .rx-save-status {font-size:11px;color:#21815f;max-width:170px;text-align:right}
      #realExamOverlay .rx-button {
        border:1px solid #dce2ec;background:#fff;color:#36445a;border-radius:8px;
        padding:10px 13px;min-height:40px;font-size:12px;font-weight:750;
        display:inline-flex;align-items:center;justify-content:center;gap:7px
      }
      #realExamOverlay .rx-button:hover {filter:brightness(.98);border-color:#aebbd2}
      #realExamOverlay .rx-button:disabled {opacity:.55;cursor:wait}
      #realExamOverlay .rx-primary {color:white;background:#4968f2;border-color:#4968f2}
      #realExamOverlay .rx-primary:hover {background:#3853d4}
      #realExamOverlay .rx-green {color:white;background:#198263;border-color:#198263}
      #realExamOverlay .rx-purple {color:#5942a2;background:#f0ebff;border-color:#ddd1ff}
      #realExamOverlay .rx-danger {color:#a73c42;background:white;border-color:#f0cfd1}
      #realExamOverlay .rx-fullscreen-warning {
        display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;
        padding:9px 15px;background:#fff1cb;color:#765312;font-size:12px;
        border-bottom:1px solid #ecd99b;flex-shrink:0
      }
      #realExamOverlay .rx-fullscreen-warning[hidden] {display:none!important}
      #realExamOverlay .rx-titlebar {
        display:flex;align-items:center;justify-content:space-between;gap:15px;
        padding:13px 25px;background:#f9faff;border-bottom:1px solid #e5e9f1;flex-shrink:0
      }
      #realExamOverlay .rx-titlebar strong {display:block;font-size:13px}
      #realExamOverlay .rx-titlebar small {display:block;color:#7b879b;font-size:10px;margin-top:3px}
      #realExamOverlay .rx-project-credit {display:block;color:#8b96a7;font-size:9px;margin-top:4px;line-height:1.4}
      #realExamOverlay .rx-question-count {color:#5267ce;font-size:11px;font-weight:800;white-space:nowrap}
      #realExamOverlay .rx-main {
        display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:16px;
        flex:1;min-height:0;padding:16px 20px 20px;overflow:hidden
      }
      #realExamOverlay .rx-question-column {display:flex;flex-direction:column;min-height:0;min-width:0}
      #realExamOverlay .rx-question-scroll {
        flex:1;min-height:0;overflow:auto;background:white;border:1px solid #e2e7f0;
        border-radius:13px;padding:clamp(18px,3vw,34px)
      }
      #realExamOverlay .rx-question-heading {
        display:flex;justify-content:space-between;gap:15px;align-items:center;
        margin-bottom:23px;padding-bottom:15px;border-bottom:1px solid #edf0f5
      }
      #realExamOverlay .rx-question-heading h2 {font-size:16px;margin:0}
      #realExamOverlay .rx-marks {
        white-space:nowrap;border:1px solid #dfe5f2;background:#f5f7fc;
        color:#57657b;padding:6px 9px;border-radius:7px;font-size:10px;font-weight:750
      }
      #realExamOverlay .rx-question-text {
        font-size:clamp(17px,2vw,21px);font-weight:650;line-height:1.65;
        margin:0 0 27px;overflow-wrap:anywhere
      }
      #realExamOverlay .rx-option-list {display:grid;gap:12px;max-width:900px}
      #realExamOverlay .rx-option {
        display:flex;align-items:flex-start;gap:13px;padding:14px 16px;
        border:1px solid #dfe5ee;border-radius:10px;background:white;
        cursor:pointer;line-height:1.55;transition:border-color .12s,background .12s
      }
      #realExamOverlay .rx-option:hover {border-color:#a8b6f8;background:#fbfbff}
      #realExamOverlay .rx-option:has(input:checked) {border-color:#7489f5;background:#f0f3ff}
      #realExamOverlay .rx-option input {
        accent-color:#4968f2;width:17px;height:17px;min-width:17px;margin:3px 0 0
      }
      #realExamOverlay .rx-option-letter {
        font-weight:800;color:#66748a;min-width:18px;flex-shrink:0
      }
      #realExamOverlay .rx-option-copy {font-size:14px;overflow-wrap:anywhere}
      #realExamOverlay .rx-question-help {margin-top:23px;color:#8b96a7;font-size:10px}
      #realExamOverlay .rx-actions {
        flex-shrink:0;display:flex;align-items:center;justify-content:space-between;
        gap:10px;flex-wrap:wrap;padding:13px 0 0
      }
      #realExamOverlay .rx-actions-left,#realExamOverlay .rx-actions-right {
        display:flex;align-items:center;gap:8px;flex-wrap:wrap
      }
      #realExamOverlay .rx-sidebar {
        min-height:0;overflow:auto;background:white;border:1px solid #e2e7f0;
        border-radius:13px;padding:18px;display:flex;flex-direction:column;gap:15px
      }
      #realExamOverlay .rx-sidebar h2 {margin:0;font-size:14px}
      #realExamOverlay .rx-sidebar-subtitle {margin:-10px 0 0;color:#8490a2;font-size:10px}
      #realExamOverlay .rx-palette {
        display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px
      }
      #realExamOverlay .rx-palette-btn {
        min-height:38px;border:1px solid #dfe5ee;border-radius:7px;background:#fff;
        color:#4d5b70;font-weight:800;font-size:11px;position:relative
      }
      #realExamOverlay .rx-palette-btn:hover {border-color:#8d9efa}
      #realExamOverlay .rx-palette-btn.answered {background:#e3f5ed;border-color:#bce6d5;color:#19734f}
      #realExamOverlay .rx-palette-btn.review {background:#f0eaff;border-color:#d7c8ff;color:#6643ad}
      #realExamOverlay .rx-palette-btn.current {outline:2px solid #4968f2;outline-offset:1px}
      #realExamOverlay .rx-palette-btn.dirty:after {
        content:"";position:absolute;right:4px;top:4px;width:5px;height:5px;
        background:#e39c30;border-radius:50%
      }
      #realExamOverlay .rx-legend {display:grid;grid-template-columns:1fr 1fr;gap:10px 8px}
      #realExamOverlay .rx-legend-item {display:flex;align-items:center;gap:7px;color:#657286;font-size:10px}
      #realExamOverlay .rx-legend-dot {width:11px;height:11px;border-radius:3px;border:1px solid #dfe5ee;background:#fff;flex-shrink:0}
      #realExamOverlay .rx-legend-dot.answered {background:#e3f5ed;border-color:#bce6d5}
      #realExamOverlay .rx-legend-dot.review {background:#f0eaff;border-color:#d7c8ff}
      #realExamOverlay .rx-summary {
        border-top:1px solid #edf0f5;border-bottom:1px solid #edf0f5;
        padding:13px 0;display:grid;grid-template-columns:1fr 1fr;gap:13px
      }
      #realExamOverlay .rx-summary small {display:block;color:#8490a2;font-size:10px}
      #realExamOverlay .rx-summary strong {display:block;font-size:20px;margin-top:3px;font-variant-numeric:tabular-nums}
      #realExamOverlay .rx-submit-button {width:100%;min-height:46px}
      #realExamOverlay .rx-sidebar-note {color:#8b96a7;font-size:10px;line-height:1.6;margin:0}
      #realExamOverlay .rx-loading,#realExamOverlay .rx-result-view {
        flex:1;min-height:0;display:flex;align-items:center;justify-content:center;
        padding:24px;overflow:auto
      }
      #realExamOverlay .rx-loading-card,#realExamOverlay .rx-result-card {
        width:min(100%,560px);text-align:center;padding:clamp(23px,5vw,45px);
        background:white;border:1px solid #e2e7f0;border-radius:17px;
        box-shadow:0 18px 55px #1b2b4d0c
      }
      #realExamOverlay .rx-loading-card h1,#realExamOverlay .rx-result-card h1 {font-size:23px;margin:15px 0 8px}
      #realExamOverlay .rx-loading-card p,#realExamOverlay .rx-result-card p {color:#778399;line-height:1.7;font-size:12px}
      #realExamOverlay .rx-spinner {
        width:34px;height:34px;border:3px solid #e3e9ff;border-top-color:#4968f2;
        border-radius:50%;margin:auto;animation:rx-spin .8s linear infinite
      }
      @keyframes rx-spin {to{transform:rotate(360deg)}}
      #realExamOverlay .rx-score {
        font-size:38px;font-weight:850;letter-spacing:-.04em;color:#197b58;margin:18px 0 8px
      }
      #realExamOverlay .rx-score-caption {font-size:10px;color:#7d899b}
      #realExamOverlay .rx-result-actions {margin-top:23px;display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
      #realExamOverlay .rx-banner-note {font-size:11px;color:#9b6820;margin-top:9px}
      @media(max-width:900px) {
        #realExamOverlay .rx-main {grid-template-columns:minmax(0,1fr) 245px;padding:12px;gap:12px}
        #realExamOverlay .rx-header {padding:10px 14px;gap:10px}
        #realExamOverlay .rx-titlebar {padding:10px 14px}
        #realExamOverlay .rx-sidebar {padding:13px}
        #realExamOverlay .rx-palette {grid-template-columns:repeat(4,minmax(0,1fr))}
        #realExamOverlay .rx-save-status {display:none}
      }
      @media(max-width:650px) {
        #realExamOverlay {overflow-y:auto}
        #realExamOverlay .rx-header {min-height:68px;flex-wrap:wrap}
        #realExamOverlay .rx-logo {width:32px;height:32px}
        #realExamOverlay .rx-brand strong {font-size:12px}
        #realExamOverlay .rx-brand small {font-size:8px}
        #realExamOverlay .rx-clock {min-width:88px;padding:5px 8px}
        #realExamOverlay .rx-clock strong {font-size:18px}
        #realExamOverlay .rx-header-right {gap:5px}
        #realExamOverlay .rx-header-right .rx-button {padding:8px;font-size:10px}
        #realExamOverlay .rx-titlebar {align-items:flex-start}
        #realExamOverlay .rx-main {display:flex;flex-direction:column;overflow:visible;min-height:auto}
        #realExamOverlay .rx-question-column {min-height:450px}
        #realExamOverlay .rx-question-scroll {overflow:visible;padding:17px}
        #realExamOverlay .rx-question-text {font-size:17px}
        #realExamOverlay .rx-option-copy {font-size:13px}
        #realExamOverlay .rx-actions {gap:8px}
        #realExamOverlay .rx-actions-left,#realExamOverlay .rx-actions-right {width:100%}
        #realExamOverlay .rx-actions .rx-button {flex:1}
        #realExamOverlay .rx-sidebar {overflow:visible}
        #realExamOverlay .rx-palette {grid-template-columns:repeat(6,minmax(0,1fr))}
      }
    `;
    document.head.appendChild(style);

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[ch]);
    }

    function setSaveMessage(message, color) {
        const target = $("rxSaveStatus");
        if (!target) return;
        target.textContent = message;
        target.style.color = color || "";
    }

    async function api(path, options = {}) {
        const token = localStorage.getItem("examflow_token");
        const headers = { ...(options.headers || {}) };
        if (token) headers.Authorization = `Bearer ${token}`;

        let body = options.body;
        if (body !== undefined && body !== null && typeof body !== "string") {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(body);
        }

        const response = await fetch(path, { ...options, headers, body });
        const raw = await response.text();
        let data = null;

        if (raw) {
            try { data = JSON.parse(raw); }
            catch { data = raw; }
        }

        if (!response.ok) {
            let detail = data?.detail || data?.message;
            if (Array.isArray(detail)) {
                detail = detail.map(item => item.msg || String(item)).join("; ");
            }
            throw new Error(typeof detail === "string" ? detail
                : `Request failed (${response.status})`);
        }
        return data;
    }

    function mountOverlay() {
        if (overlay) overlay.remove();

        overlay = document.createElement("section");
        overlay.id = "realExamOverlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "Examination workspace");

        overlay.innerHTML = `
          <div id="rxFullscreenWarning" class="rx-fullscreen-warning" hidden>
            Full-screen mode is off. Your exam is still active.
            <button class="rx-button" data-rx-action="fullscreen">Return to full screen</button>
          </div>
          <header class="rx-header">
            <div class="rx-brand">
              <div class="rx-logo">E</div>
              <div><small>EXAMFLOW · EXAM SESSION</small><strong id="rxExamTitle">Preparing examination…</strong></div>
            </div>
            <div class="rx-clock"><small>TIME REMAINING</small><strong id="rxTimer">--:--</strong></div>
            <div class="rx-header-right">
              <span id="rxSaveStatus" class="rx-save-status">Preparing your exam…</span>
              <button class="rx-button" data-rx-action="fullscreen" title="Return to browser full-screen mode">⛶ Full screen</button>
            </div>
          </header>
          <div id="rxLoading" class="rx-loading">
            <div class="rx-loading-card">
              <div class="rx-spinner"></div>
              <h1>Preparing your examination</h1>
              <p>Loading the questions and restoring any saved answers. Please keep this window open.</p>
            </div>
          </div>
          <div id="rxWorkspace" class="rx-hidden" style="flex:1;min-height:0;display:flex;flex-direction:column">
            <div class="rx-titlebar">
              <div><strong id="rxExamSubheading">Examination</strong><small id="rxExamInstructions">Choose the best answer for each question.</small><small class="rx-project-credit">Distributed Systems Mini Project by Vinayak Adhao (123B1B071) and Soham Kolte (123B1B291)</small></div>
              <div id="rxQuestionCount" class="rx-question-count">Question 1 of 1</div>
            </div>
            <div class="rx-main">
              <main class="rx-question-column">
                <div id="rxQuestionArea" class="rx-question-scroll"></div>
                <div class="rx-actions">
                  <div class="rx-actions-left">
                    <button class="rx-button" data-rx-action="previous">← Previous</button>
                    <button class="rx-button rx-danger" data-rx-action="clear">Clear response</button>
                  </div>
                  <div class="rx-actions-right">
                    <button class="rx-button" data-rx-action="save">Save answer</button>
                    <button class="rx-button rx-purple" data-rx-action="review-next">Mark for review</button>
                    <button class="rx-button rx-primary" data-rx-action="save-next">Save &amp; Next →</button>
                    <button class="rx-button" data-rx-action="next">Next →</button>
                  </div>
                </div>
              </main>
              <aside class="rx-sidebar">
                <h2>Question palette</h2>
                <p class="rx-sidebar-subtitle">Select a number to jump to a question.</p>
                <div id="rxPalette" class="rx-palette"></div>
                <div class="rx-legend">
                  <div class="rx-legend-item"><span class="rx-legend-dot answered"></span> Answered</div>
                  <div class="rx-legend-item"><span class="rx-legend-dot review"></span> Review</div>
                  <div class="rx-legend-item"><span class="rx-legend-dot"></span> Unanswered</div>
                  <div class="rx-legend-item"><span class="rx-legend-dot" style="border:2px solid #4968f2"></span> Current</div>
                </div>
                <div class="rx-summary">
                  <div><small>Answered</small><strong id="rxAnsweredCount">0</strong></div>
                  <div><small>For review</small><strong id="rxReviewCount">0</strong></div>
                  <div><small>Unanswered</small><strong id="rxUnansweredCount">0</strong></div>
                  <div><small>Total questions</small><strong id="rxTotalCount">0</strong></div>
                </div>
                <button class="rx-button rx-green rx-submit-button" data-rx-action="submit">Submit examination</button>
                <p class="rx-sidebar-note">Your selected options are saved to the server. Review the palette before submitting.</p>
              </aside>
            </div>
          </div>
          <div id="rxResultView" class="rx-result-view rx-hidden">
            <div class="rx-result-card">
              <div class="rx-logo" style="margin:auto">E</div>
              <h1 id="rxResultTitle">Submission received</h1>
              <p id="rxResultMessage">Your answers have been submitted.</p>
              <div id="rxScore" class="rx-score rx-hidden"></div>
              <div id="rxScoreCaption" class="rx-score-caption"></div>
              <div class="rx-result-actions">
                <button class="rx-button rx-primary" data-rx-action="done">Return to dashboard</button>
              </div>
            </div>
          </div>
        `;

        document.body.appendChild(overlay);
        document.title = "Exam in progress | ExamFlow";
    }

    function activeQuestion() {
        if (!session) return null;
        return session.questions[session.index] || null;
    }

    function answerFor(question) {
        return session.answers[String(question.id)] ?? null;
    }

    function isAnswered(question) {
        return ["A", "B", "C", "D"].includes(answerFor(question));
    }

    function updatePalette() {
        if (!session) return;

        const palette = $("rxPalette");
        palette.innerHTML = session.questions.map((question, index) => {
            const key = String(question.id);
            const answered = isAnswered(question);
            const review = session.review.has(key);
            const current = index === session.index;
            const dirty = session.dirty.has(key);
            const classes = [
                "rx-palette-btn",
                answered ? "answered" : "",
                review ? "review" : "",
                current ? "current" : "",
                dirty ? "dirty" : ""
            ].filter(Boolean).join(" ");

            const description = `Question ${index + 1}${answered ? ", answered" : ", unanswered"}${review ? ", marked for review" : ""}`;

            return `<button type="button" class="${classes}" data-rx-index="${index}" aria-label="${esc(description)}" title="${esc(description)}">${index + 1}</button>`;
        }).join("");

        const answered = session.questions.filter(isAnswered).length;
        $("rxAnsweredCount").textContent = answered;
        $("rxReviewCount").textContent = session.review.size;
        $("rxUnansweredCount").textContent = session.questions.length - answered;
        $("rxTotalCount").textContent = session.questions.length;

        const question = activeQuestion();
        $("rxQuestionCount").textContent =
            `Question ${session.index + 1} of ${session.questions.length}`;

        const previous = overlay.querySelector('[data-rx-action="previous"]');
        const next = overlay.querySelector('[data-rx-action="next"]');

        previous.disabled = session.index === 0;
        next.disabled = session.index === session.questions.length - 1;
    }

    function renderQuestion() {
        if (!session) return;

        const question = activeQuestion();
        if (!question) return;

        const key = String(question.id);
        session.visited.add(key);

        const options = [
            ["A", question.option_a],
            ["B", question.option_b],
            ["C", question.option_c],
            ["D", question.option_d]
        ];

        $("rxQuestionArea").innerHTML = `
          <div class="rx-question-heading">
            <h2>Question ${session.index + 1}</h2>
            <span class="rx-marks">${esc(question.marks)} marks</span>
          </div>
          <p class="rx-question-text">${esc(question.question_text)}</p>
          <div class="rx-option-list">
            ${options.map(([letter, value]) => `
              <label class="rx-option">
                <input type="radio" name="rxSelectedOption" value="${letter}"
                  data-rx-option="${letter}" ${answerFor(question) === letter ? "checked" : ""}>
                <span class="rx-option-letter">${letter}.</span>
                <span class="rx-option-copy">${esc(value)}</span>
              </label>
            `).join("")}
          </div>
          <p class="rx-question-help">Choose an option. Your answer is saved automatically; use Save answer to confirm it explicitly.</p>
        `;

        const reviewButton = overlay.querySelector('[data-rx-action="review-next"]');
        reviewButton.textContent = session.review.has(key) ?
             "Reviewed • Next →"
            : "Mark for review • Next →";

        updatePalette();
    }

    async function saveQuestion(questionId) {
        if (!session) throw new Error("No active exam.");
        const key = String(questionId);

        session.dirty.add(key);
        updatePalette();
        setSaveMessage("Saving answer…", "#9b6820");

        const previous = session.pending.get(key) || Promise.resolve();

        const job = previous.catch(() => {}).then(async () => {
            const value = session.answers[key] ?? null;

            await api(`/api/attempts/${session.attempt.id}/answers`, {
                method: "PUT",
                body: {
                    question_id: Number(questionId),
                    selected_option: value
                }
            });

            if ((session.answers[key] ?? null) === value) {
                session.dirty.delete(key);
            }

            updatePalette();

            if (session.dirty.size === 0) {
                setSaveMessage("All answers saved ✓", "#21815f");
            } else {
                setSaveMessage("Saving changes…", "#9b6820");
            }
        });

        session.pending.set(key, job);

        try {
            await job;
        } catch (error) {
            setSaveMessage("Save failed — retry", "#b3343e");
            throw error;
        } finally {
            if (session && session.pending.get(key) === job) {
                session.pending.delete(key);
            }
        }
    }

    async function saveCurrent() {
        const question = activeQuestion();
        if (!question) return;

        try {
            await saveQuestion(question.id);
            setSaveMessage("Answer saved ✓", "#21815f");
            notify("Answer saved.");
        } catch (error) {
            notify(`Could not save answer: ${error.message}`, true);
        }
    }

    async function goTo(index) {
        if (!session) return;

        const target = Math.max(0, Math.min(index, session.questions.length - 1));
        if (target === session.index) return;

        const current = activeQuestion();

        if (current && session.dirty.has(String(current.id))) {
            try {
                await saveQuestion(current.id);
            } catch (error) {
                notify(`The current answer has not saved yet: ${error.message}`, true);
                return;
            }
        }

        session.index = target;
        renderQuestion();
    }

    function notify(message, error = false) {
        let messageBox = $("rxToast");

        if (!messageBox) {
            messageBox = document.createElement("div");
            messageBox.id = "rxToast";
            messageBox.style.cssText =
                "position:fixed;z-index:2147483647;bottom:20px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 30px);background:#263349;color:white;padding:12px 18px;border-radius:9px;font-size:12px;box-shadow:0 8px 25px #10203b30";
            document.body.appendChild(messageBox);
        }

        messageBox.textContent = message;
        messageBox.style.background = error ? "#a63546" : "#263349";
        messageBox.style.display = "block";

        clearTimeout(messageBox._timer);
        messageBox._timer = setTimeout(() => {
            messageBox.style.display = "none";
        }, 3000);
    }

    async function selectOption(letter) {
        if (!session || session.submitting) return;

        const question = activeQuestion();
        if (!question) return;

        const key = String(question.id);
        session.answers[key] = letter;
        session.dirty.add(key);

        updatePalette();
        queueMicrotask(() => {
            const input = overlay.querySelector(`input[data-rx-option="${letter}"]`);
            if (input) input.checked = true;
        });

        try {
            await saveQuestion(question.id);
        } catch (error) {
            notify(`Your selection is still shown, but saving failed. Try Save answer.`, true);
        }
    }

    async function saveAndNext() {
        const question = activeQuestion();
        if (!question) return;

        try {
            await saveQuestion(question.id);
            if (session.index < session.questions.length - 1) {
                session.index++;
                renderQuestion();
            } else {
                notify("This is the last question. Check the palette and submit when ready.");
            }
        } catch (error) {
            notify(`Please retry saving before moving on: ${error.message}`, true);
        }
    }

    async function markAndNext() {
        const question = activeQuestion();
        if (!question) return;

        session.review.add(String(question.id));
        updatePalette();

        try {
            await saveQuestion(question.id);
        } catch {
            notify("Marked for review, but saving your answer failed. Retry Save answer.", true);
        }

        if (session.index < session.questions.length - 1) {
            session.index++;
            renderQuestion();
        } else {
            notify("Marked for review. You are on the last question.");
        }
    }

    async function clearCurrent() {
        const question = activeQuestion();
        if (!question) return;

        session.answers[String(question.id)] = null;
        session.dirty.add(String(question.id));
        renderQuestion();

        try {
            await saveQuestion(question.id);
            notify("Response cleared.");
        } catch (error) {
            notify(`Could not save the cleared response: ${error.message}`, true);
        }
    }

    function tickTimer() {
        if (!session || session.submitted || session.submitting) return;

        const remaining = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;

        $("rxTimer").textContent =
            `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

        if (remaining <= 300) {
            $("rxTimer").style.color = "#b3343e";
        }

        if (remaining <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            notify("Time is up. Submitting your examination…", true);
            submitExam(true);
        }
    }

    async function submitExam(automatic = false) {
        if (!session || session.submitted || session.submitting) return;

        const unanswered = session.questions.filter(question => !isAnswered(question)).length;
        const reviewCount = session.review.size;

        if (!automatic) {
            const message =
                `Submit your examination now\n\n` +
                `Answered: ${session.questions.length - unanswered}\n` +
                `Unanswered: ${unanswered}\n` +
                `Marked for review: ${reviewCount}\n\n` +
                `Your submission cannot be changed afterward.`;

            if (!window.confirm(message)) return;
        }

        session.submitting = true;

        overlay.querySelectorAll("#rxWorkspace button").forEach(button => { button.disabled = true; });

        $("rxResultView").classList.remove("rx-hidden");
        $("rxWorkspace").classList.add("rx-hidden");
        $("rxResultTitle").textContent = "Submitting your examination…";
        $("rxResultMessage").textContent =
            "Saving your answers and sending the submission for automatic evaluation.";
        $("rxScore").classList.add("rx-hidden");
        $("rxScoreCaption").textContent = "";

        try {
            await Promise.all(session.questions.map(question => saveQuestion(question.id)));

            const response = await api(`/api/attempts/${session.attempt.id}/submit`, {
                method: "POST"
            });

            session.submitted = true;
            session.submitting = false;
            localStorage.setItem("examflow_last_attempt", session.attempt.id);

            clearInterval(timerInterval);
            timerInterval = null;

            $("rxResultTitle").textContent = "Examination submitted";
            $("rxResultMessage").textContent =
                response?.message || "Your submission was accepted. Automatic evaluation is in progress.";

            pollResult(session.attempt.id);
        } catch (error) {
            session.submitting = false;
            $("rxResultTitle").textContent = "Submission needs attention";
            $("rxResultMessage").textContent =
                `The submission request failed: ${error.message}. Your answers are still available to retry.`;
            $("rxResultActions");
            const retry = document.createElement("button");
            retry.className = "rx-button rx-primary";
            retry.dataset.rxAction = "retry-submit";
            retry.textContent = "Retry submission";
            const actions = overlay.querySelector(".rx-result-actions");
            actions.prepend(retry);
            notify("Submission failed. Please retry.", true);
        }
    }

    async function pollResult(attemptId) {
        for (let i = 0; i < 40; i++) {
            await new Promise(resolve => setTimeout(resolve, 1500));

            try {
                const result = await api(`/api/attempts/${attemptId}`);

                if (result.evaluation_status === "completed" || result.status === "evaluated") {
                    $("rxResultTitle").textContent = "Examination evaluated";
                    $("rxResultMessage").textContent = "Your final score has been saved.";

                    if (result.score !== null && result.score !== undefined) {
                        $("rxScore").textContent =
                            `${Number(result.score).toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${Number(session.exam.total_marks).toLocaleString()}`;
                        $("rxScore").classList.remove("rx-hidden");
                        $("rxScoreCaption").textContent = "Final marks";
                    }

                    return;
                }

                if (result.evaluation_status === "failed") {
                    $("rxResultTitle").textContent = "Evaluation needs attention";
                    $("rxResultMessage").textContent =
                        "The submission was received, but evaluation failed. Please contact your teacher or administrator.";
                    return;
                }
            } catch {
                // A brief network interruption should not close the result screen.
            }
        }

        $("rxResultTitle").textContent = "Submission received";
        $("rxResultMessage").textContent =
            "Your answers were submitted. Evaluation is taking longer than expected. Return to your dashboard and check Results later.";
    }

    async function beginExam(examId) {
        const currentLaunch = ++launchNumber;
        mountOverlay();

        if (!localStorage.getItem("examflow_token")) {
            showLaunchError("Your sign-in session is missing. Return to the dashboard and sign in again.");
            return;
        }

        try {
            const exam = await api(`/api/exams/${examId}`);
            const questionResponse = await api(`/api/questions/exams/${examId}/questions`);
            const questions = Array.isArray(questionResponse) ?
                 questionResponse
                : questionResponse.questions || [];

            if (!questions.length) {
                throw new Error("This examination has no questions yet. Ask your teacher to add questions.");
            }

            const attempt = await api(`/api/attempts/${examId}/start`, {
                method: "POST"
            });

            const details = await api(`/api/attempts/${attempt.id}`);

            if (details.status !== "in_progress") {
                throw new Error("This attempt has already been submitted. Use a new exam or a fresh student account to practise again.");
            }

            if (currentLaunch !== launchNumber) return;

            session = {
                exam,
                questions,
                attempt: details,
                index: 0,
                answers: {},
                review: new Set(),
                visited: new Set(),
                dirty: new Set(),
                pending: new Map(),
                expiresAt: new Date(details.expires_at).getTime(),
                submitting: false,
                submitted: false
            };

            for (const answer of details.answers || []) {
                session.answers[String(answer.question_id)] = answer.selected_option || null;
            }

            if (!Number.isFinite(session.expiresAt)) {
                throw new Error("The attempt expiry time returned by the server is invalid.");
            }

            $("rxLoading").classList.add("rx-hidden");
            $("rxWorkspace").classList.remove("rx-hidden");
            $("rxExamTitle").textContent = exam.title || `Exam ${examId}`;
            $("rxExamSubheading").textContent = exam.title || `Exam ${examId}`;
            $("rxExamInstructions").textContent =
                `${exam.duration_minutes} minutes · ${exam.total_marks} marks · Choose one option per question.`;
            $("rxTotalCount").textContent = questions.length;

            renderQuestion();
            setSaveMessage("Answers ready", "#21815f");

            clearInterval(timerInterval);
            timerInterval = setInterval(tickTimer, 1000);
            tickTimer();
        } catch (error) {
            showLaunchError(error.message);
        }
    }

    function showLaunchError(message) {
        clearInterval(timerInterval);
        timerInterval = null;
        session = null;

        $("rxLoading").classList.remove("rx-hidden");
        $("rxLoading").innerHTML = `
          <div class="rx-loading-card">
            <div style="font-size:32px">!</div>
            <h1>Unable to start examination</h1>
            <p>${esc(message)}</p>
            <div class="rx-result-actions">
              <button class="rx-button rx-primary" data-rx-action="close">Return to dashboard</button>
            </div>
          </div>`;
    }

    async function closeExam() {
        launchNumber++;
        clearInterval(timerInterval);
        timerInterval = null;

        if (document.fullscreenElement && document.exitFullscreen) {
            try { await document.exitFullscreen(); }
            catch { /* The browser may already have left full-screen mode. */ }
        }

        if (overlay) overlay.remove();
        overlay = null;
        session = null;
        document.title = originalTitle;
    }

    document.addEventListener("click", event => {
        const startButton = event.target.closest("[data-start-exam]");

        if (startButton) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            // Request full-screen synchronously inside the user's click event.
            // Browsers may still decline or allow the user to exit with Esc.
            try {
                if (document.documentElement.requestFullscreen) {
                    const request = document.documentElement.requestFullscreen();
                    if (request && request.catch) request.catch(() => {});
                }
            } catch {
                // The exam remains usable if full-screen is unavailable.
            }

            beginExam(Number(startButton.dataset.startExam));
            return;
        }

        if (!overlay || !overlay.contains(event.target)) return;

        const paletteButton = event.target.closest("[data-rx-index]");

        if (paletteButton) {
            event.preventDefault();
            event.stopImmediatePropagation();
            goTo(Number(paletteButton.dataset.rxIndex));
            return;
        }

        const actionButton = event.target.closest("[data-rx-action]");
        if (!actionButton) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const action = actionButton.dataset.rxAction;

        if (action === "fullscreen") {
            try {
                if (document.documentElement.requestFullscreen) {
                    const request = document.documentElement.requestFullscreen();
                    if (request && request.catch) request.catch(() =>
                        notify("Full-screen was blocked by the browser.", true));
                } else {
                    notify("This browser does not support full-screen mode.", true);
                }
            } catch {
                notify("Could not enter full-screen mode.", true);
            }
        } else if (action === "previous" && session) {
            goTo(session.index - 1);
        } else if (action === "next" && session) {
            goTo(session.index + 1);
        } else if (action === "save" && session) {
            saveCurrent();
        } else if (action === "save-next" && session) {
            saveAndNext();
        } else if (action === "review-next" && session) {
            markAndNext();
        } else if (action === "clear" && session) {
            clearCurrent();
        } else if (action === "submit" && session) {
            submitExam(false);
        } else if (action === "retry-submit" && session) {
            submitExam(true);
        } else if (action === "done" || action === "close") {
            closeExam();
        }
    }, true);

    document.addEventListener("change", event => {
        if (!overlay || !overlay.contains(event.target)) return;
        const input = event.target.closest("[data-rx-option]");
        if (input && session) selectOption(input.value);
    }, true);

    document.addEventListener("fullscreenchange", () => {
        if (!overlay) return;
        const warning = $("rxFullscreenWarning");
        if (warning) warning.hidden = Boolean(document.fullscreenElement);
    });

    window.addEventListener("beforeunload", event => {
        if (session && !session.submitted) {
            event.preventDefault();
            event.returnValue = "";
        }
    });
})();

