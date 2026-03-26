const userStorageKey = "cricketDashboardUsers";
const sessionStorageKey = "cricketDashboardActiveSessions";
const matchStorageKey = "cricketDashboardSavedMatch";
const adminPassword = "Rukesh1357$";

const defaultUsers = [
    { name: "rukesh", role: "admin", password: adminPassword },
    { name: "naveen", role: "user", password: "" },
    { name: "subbuk", role: "user", password: "" },
    { name: "subbup", role: "user", password: "" },
    { name: "jagan", role: "user", password: "" },
    { name: "aravind", role: "user", password: "" }
];

const scoringEvents = {
    dot: { label: "0", runs: 0, wicket: false, legal: true, commentary: "Dot ball. Tight control from the fielding side." },
    "1": { label: "1", runs: 1, wicket: false, legal: true, commentary: "Worked into the gap for a single." },
    "2": { label: "2", runs: 2, wicket: false, legal: true, commentary: "Placed nicely. They come back for two." },
    "3": { label: "3", runs: 3, wicket: false, legal: true, commentary: "Excellent running between the wickets. Three taken." },
    "4": { label: "4", runs: 4, wicket: false, legal: true, commentary: "Cracked away. That races to the boundary for four." },
    "6": { label: "6", runs: 6, wicket: false, legal: true, commentary: "Clean strike. That has gone all the way for six." },
    wd: { label: "Wd", runs: 1, wicket: false, legal: false, commentary: "Wide called. Extra run added and the ball must be re-bowled." },
    w: { label: "W", runs: 0, wicket: true, legal: true, commentary: "Wicket. Big breakthrough in the innings." }
};

const matchState = {
    teamA: "",
    teamB: "",
    venue: "",
    totalOvers: 20,
    currentTeam: "",
    innings: 1,
    score: 0,
    wickets: 0,
    balls: 0,
    firstInningsScore: null,
    target: null,
    recentBalls: [],
    feedEntries: [],
    commentaryEntries: [],
    inningsClosed: false,
    result: "Match in progress",
    viewer: "",
    role: "user",
    loginRole: "admin",
    history: [],
    adminFeedEntries: [],
    controller: "rukesh",
    commentaryVisible: false
};

initializeAccess();

function initializeAccess() {
    if (!localStorage.getItem(userStorageKey)) {
        localStorage.setItem(userStorageKey, JSON.stringify(defaultUsers));
    }
}

function getUsers() {
    try {
        const stored = JSON.parse(localStorage.getItem(userStorageKey));
        return Array.isArray(stored) ? stored : [...defaultUsers];
    } catch (error) {
        return [...defaultUsers];
    }
}

function saveUsers(users) {
    localStorage.setItem(userStorageKey, JSON.stringify(users));
}

function getActiveSessions() {
    try {
        const stored = JSON.parse(localStorage.getItem(sessionStorageKey));
        return Array.isArray(stored) ? stored : [];
    } catch (error) {
        return [];
    }
}

function saveActiveSessions(sessions) {
    localStorage.setItem(sessionStorageKey, JSON.stringify(sessions));
}

function loadSavedMatch() {
    try {
        const stored = JSON.parse(localStorage.getItem(matchStorageKey));
        return stored && stored.teamA ? stored : null;
    } catch (error) {
        return null;
    }
}

function saveMatchState() {
    if (!matchState.teamA) {
        return;
    }

    localStorage.setItem(matchStorageKey, JSON.stringify({
        teamA: matchState.teamA,
        teamB: matchState.teamB,
        venue: matchState.venue,
        totalOvers: matchState.totalOvers,
        currentTeam: matchState.currentTeam,
        innings: matchState.innings,
        score: matchState.score,
        wickets: matchState.wickets,
        balls: matchState.balls,
        firstInningsScore: matchState.firstInningsScore,
        target: matchState.target,
        recentBalls: matchState.recentBalls,
        feedEntries: matchState.feedEntries,
        commentaryEntries: matchState.commentaryEntries,
        inningsClosed: matchState.inningsClosed,
        result: matchState.result,
        history: matchState.history,
        adminFeedEntries: matchState.adminFeedEntries,
        controller: matchState.controller,
        commentaryVisible: matchState.commentaryVisible
    }));
}

function selectLoginRole(role, button) {
    matchState.loginRole = role;
    document.querySelectorAll(".role-option").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.getElementById("passwordField").style.display = role === "admin" ? "block" : "none";
}

function grantAccess() {
    const input = document.getElementById("viewerName");
    const passwordInput = document.getElementById("viewerPassword");
    const accessMessage = document.getElementById("accessMessage");
    const requestedName = input.value.trim().toLowerCase();
    const name = matchState.loginRole === "admin" && !requestedName ? "rukesh" : requestedName;
    const password = passwordInput.value;
    const users = getUsers();
    const user = users.find((item) => item.name === name);

    if (!user) {
        accessMessage.innerText = "Access denied. Admin must add the username first.";
        accessMessage.className = "access-message denied";
        return;
    }

    if (matchState.loginRole === "admin" && user.role !== "admin") {
        accessMessage.innerText = "This user is not an admin.";
        accessMessage.className = "access-message denied";
        return;
    }

    if (matchState.loginRole === "admin" && password !== adminPassword) {
        accessMessage.innerText = "Incorrect admin password.";
        accessMessage.className = "access-message denied";
        return;
    }

    if (matchState.loginRole === "user" && user.role === "admin") {
        accessMessage.innerText = "Admin should use admin login.";
        accessMessage.className = "access-message denied";
        return;
    }

    matchState.viewer = user.name;
    matchState.role = user.role;
    matchState.adminFeedEntries = loadSavedMatch()?.adminFeedEntries || [];
    matchState.controller = loadSavedMatch()?.controller || "rukesh";

    registerViewerSession(user.name);
    addAdminFeedEntry(`${user.name} logged in as ${user.role}.`, "system");

    document.getElementById("accessPanel").style.display = "none";
    document.getElementById("adminPanel").style.display = user.role === "admin" ? "block" : "none";
    updateSessionControls();
    passwordInput.value = "";
    restoreSavedMatchOrSetup();
}

function registerViewerSession(name) {
    const sessions = getActiveSessions().filter((session) => session.name !== name);
    sessions.push({
        name,
        role: matchState.role,
        lastAction: "Logged in"
    });
    saveActiveSessions(sessions);
}

function updateViewerAction(action) {
    if (!matchState.viewer) {
        return;
    }

    const sessions = getActiveSessions();
    const session = sessions.find((item) => item.name === matchState.viewer);
    if (session) {
        session.lastAction = action;
    }
    saveActiveSessions(sessions);

    addAdminFeedEntry(`${matchState.viewer}: ${action}`, "viewer");
    updateAdminPanel();
}

function addAllowedViewer() {
    if (matchState.role !== "admin") {
        return;
    }

    const input = document.getElementById("newViewerName");
    const passwordInput = document.getElementById("newViewerPassword");
    const name = input.value.trim().toLowerCase();
    const password = passwordInput.value.trim();
    if (!name) {
        return;
    }

    const users = getUsers();
    if (!users.some((item) => item.name === name)) {
        users.push({ name, role: "user", password });
        saveUsers(users);
        addAdminFeedEntry(`Admin added scoring user ${name}.`, "system");
    }

    input.value = "";
    passwordInput.value = "";
    renderAllowedUsers();
    renderTransferList();
    updateAdminPanel();
}

function removeAllowedViewer(name) {
    if (matchState.role !== "admin" || name === "rukesh") {
        return;
    }

    const users = getUsers().filter((item) => item.name !== name);
    saveUsers(users);

    if (matchState.controller === name) {
        matchState.controller = "rukesh";
    }

    addAdminFeedEntry(`Admin removed user ${name}.`, "system");
    renderAllowedUsers();
    renderTransferList();
    updateUI();
}

function renderAllowedUsers() {
    const container = document.getElementById("allowedUsersList");
    if (!container) {
        return;
    }

    container.innerHTML = getUsers()
        .map((user) => `
                <div class="admin-user-chip">
                    <div>
                        <strong>${user.name}${user.role === "admin" ? " (admin)" : ""}</strong>
                </div>
                <div class="user-actions">
                    ${user.role === "admin" ? "" : `<button type="button" class="mini-btn" onclick="removeAllowedViewer('${user.name}')">Remove</button>`}
                </div>
            </div>
        `)
        .join("");
}

function startMatch() {
    const teamA = document.getElementById("teamA").value.trim();
    const teamB = document.getElementById("teamB").value.trim();
    const overs = Number(document.getElementById("overs").value);
    const venue = document.getElementById("venue").value.trim() || "Venue not specified";

    if (!teamA || !teamB || !overs || overs < 1) {
        alert("Enter both team names and a valid number of overs.");
        return;
    }

    matchState.teamA = teamA;
    matchState.teamB = teamB;
    matchState.venue = venue;
    matchState.totalOvers = overs;
    matchState.currentTeam = teamA;
    matchState.innings = 1;
    matchState.score = 0;
    matchState.wickets = 0;
    matchState.balls = 0;
    matchState.firstInningsScore = null;
    matchState.target = null;
    matchState.recentBalls = [];
    matchState.feedEntries = [];
    matchState.commentaryEntries = [];
    matchState.inningsClosed = false;
    matchState.result = "Match in progress";
    matchState.history = [];
    matchState.controller = matchState.controller || "rukesh";

    document.getElementById("setupPanel").style.display = "none";
    document.getElementById("matchArea").style.display = "grid";
    document.getElementById("inningsAction").disabled = false;
    document.getElementById("inningsAction").innerText = "End 1st Innings";

    addFeedEntry(`${teamA} started batting.`, "system");
    addCommentaryEntry("The innings is underway.");
    updateViewerAction("Started the match");
    updateUI();
}

function recordBall(eventKey, buttonId) {
    const event = scoringEvents[eventKey];
    if (!event || matchState.inningsClosed || !canScore()) {
        return;
    }

    pushHistory();
    matchState.score += event.runs;

    if (event.wicket) {
        matchState.wickets += 1;
    }

    if (event.legal) {
        matchState.balls += 1;
    }

    matchState.recentBalls.push(event.label);
    if (matchState.recentBalls.length > 6) {
        matchState.recentBalls.shift();
    }

    animateSignal(buttonId);
    addFeedEntry(formatEventFeed(eventKey), event.wicket ? "wicket" : event.runs >= 4 ? "boundary" : "score");
    addCommentaryEntry(formatCommentary(eventKey));
    updateViewerAction(`Scored ${event.label}`);
    spawnScorePop(event.label, event.wicket ? "wicket-pop" : event.runs >= 4 ? "boundary-pop" : "six-pop");

    if (event.wicket && matchState.wickets >= 10) {
        closeInnings("All out");
    } else if (matchState.balls >= matchState.totalOvers * 6) {
        closeInnings("Overs completed");
    } else if (matchState.innings === 2 && matchState.target && matchState.score >= matchState.target) {
        endMatch(`${matchState.currentTeam} won by ${10 - matchState.wickets} wickets`);
    }

    updateUI();
}

function pushHistory() {
    matchState.history.push(JSON.stringify({
        score: matchState.score,
        wickets: matchState.wickets,
        balls: matchState.balls,
        innings: matchState.innings,
        currentTeam: matchState.currentTeam,
        firstInningsScore: matchState.firstInningsScore,
        target: matchState.target,
        recentBalls: [...matchState.recentBalls],
        feedEntries: [...matchState.feedEntries],
        commentaryEntries: [...matchState.commentaryEntries],
        inningsClosed: matchState.inningsClosed,
        result: matchState.result,
        controller: matchState.controller
    }));
}

function undoLastAction() {
    if (!matchState.history.length || !canScore()) {
        return;
    }

    const previous = JSON.parse(matchState.history.pop());
    matchState.score = previous.score;
    matchState.wickets = previous.wickets;
    matchState.balls = previous.balls;
    matchState.innings = previous.innings;
    matchState.currentTeam = previous.currentTeam;
    matchState.firstInningsScore = previous.firstInningsScore;
    matchState.target = previous.target;
    matchState.recentBalls = previous.recentBalls;
    matchState.feedEntries = previous.feedEntries;
    matchState.commentaryEntries = previous.commentaryEntries;
    matchState.inningsClosed = previous.inningsClosed;
    matchState.result = previous.result;
    matchState.controller = previous.controller || matchState.controller;

    addFeedEntry("Last action undone.", "system");
    addCommentaryEntry("The scorer corrected the previous entry.");
    updateViewerAction("Used Undo");
    updateUI();
}

function closeInnings(reason) {
    matchState.inningsClosed = true;

    if (matchState.innings === 1) {
        matchState.firstInningsScore = matchState.score;
        matchState.target = matchState.score + 1;
        matchState.result = `${matchState.currentTeam} finished on ${matchState.score}/${matchState.wickets}`;
        addFeedEntry(`${matchState.currentTeam} ended the 1st innings on ${matchState.score}/${matchState.wickets}.`, "system");
        addCommentaryEntry(`${matchState.currentTeam} close the innings. Target is ${matchState.target}.`);
        document.getElementById("inningsAction").disabled = false;
        document.getElementById("inningsAction").innerText = "Start 2nd Innings";
        document.getElementById("matchStatus").innerText = `Break | ${reason}`;
    } else {
        const defendingTeam = matchState.currentTeam === matchState.teamA ? matchState.teamB : matchState.teamA;
        const margin = (matchState.target - 1) - matchState.score;
        endMatch(margin === 0 ? "Match tied" : `${defendingTeam} won by ${margin} runs`);
    }
}

function changeInnings() {
    if (matchState.innings !== 1 || !canScore()) {
        return;
    }

    if (!matchState.inningsClosed) {
        pushHistory();
        closeInnings("Ended by scorer");
        updateUI();
        return;
    }

    pushHistory();
    matchState.innings = 2;
    matchState.currentTeam = matchState.teamB;
    matchState.score = 0;
    matchState.wickets = 0;
    matchState.balls = 0;
    matchState.recentBalls = [];
    matchState.inningsClosed = false;
    matchState.result = "Match in progress";

    addFeedEntry(`${matchState.currentTeam} began the chase. Target: ${matchState.target}.`, "system");
    addCommentaryEntry(`${matchState.currentTeam} start the chase.`);
    updateViewerAction("Started 2nd innings");

    const inningsAction = document.getElementById("inningsAction");
    inningsAction.disabled = true;
    inningsAction.innerText = "2nd Innings Live";

    updateUI();
}

function endMatch(resultText) {
    matchState.inningsClosed = true;
    matchState.result = resultText;
    addFeedEntry(`Result: ${resultText}`, "result");
    addCommentaryEntry(resultText);
    updateViewerAction(`Completed match | ${resultText}`);
    document.getElementById("matchStatus").innerText = "Match Complete";
    document.getElementById("inningsAction").disabled = true;
    document.getElementById("inningsAction").innerText = "Match Finished";
}

function toggleCommentary() {
    matchState.commentaryVisible = !matchState.commentaryVisible;
    document.getElementById("commentaryPanel").style.display = matchState.commentaryVisible ? "block" : "none";
    saveMatchState();
}

function updateUI() {
    const remainingBalls = Math.max(matchState.totalOvers * 6 - matchState.balls, 0);

    document.getElementById("fixtureTitle").innerText = `${matchState.teamA} vs ${matchState.teamB}`;
    document.getElementById("matchMeta").innerText = `${matchState.venue} | ${matchState.totalOvers} overs`;
    document.getElementById("battingTeam").innerText = matchState.currentTeam;
    document.getElementById("inningLabel").innerText = `Innings ${matchState.innings}`;
    document.getElementById("score").innerText = `${matchState.score}/${matchState.wickets}`;
    document.getElementById("oversDisplay").innerText = formatOvers(matchState.balls);
    document.getElementById("runRate").innerText = calculateRunRate(matchState.score, matchState.balls);
    document.getElementById("ballsLeft").innerText = remainingBalls;
    document.getElementById("firstInningsScore").innerText =
        matchState.firstInningsScore === null ? "Not started" : `${matchState.teamA}: ${matchState.firstInningsScore}`;
    document.getElementById("resultText").innerText = matchState.result;
    document.getElementById("controllerChip").innerText = `Controller | ${matchState.controller || "rukesh"}`;

    if (!matchState.inningsClosed) {
        document.getElementById("matchStatus").innerText =
            matchState.innings === 1 ? "1st Innings Live" : "2nd Innings Live";
    }

    if (matchState.innings === 1) {
        document.getElementById("targetDisplay").innerText = "Set after 1st innings";
        document.getElementById("requiredRate").innerText = "-";
        document.getElementById("chaseEquation").innerText = "Waiting for target";
        document.getElementById("inningsMessage").innerText = matchState.inningsClosed
            ? `${matchState.currentTeam} closed on ${matchState.score}/${matchState.wickets}. Target: ${matchState.target}.`
            : `${matchState.currentTeam} are building their first-innings total.`;
    } else {
        const runsNeeded = Math.max(matchState.target - matchState.score, 0);
        const requiredRate = remainingBalls > 0 ? ((runsNeeded * 6) / remainingBalls).toFixed(2) : "0.00";

        document.getElementById("targetDisplay").innerText = `${matchState.target} to win`;
        document.getElementById("requiredRate").innerText = runsNeeded > 0 ? requiredRate : "0.00";
        document.getElementById("chaseEquation").innerText =
            runsNeeded > 0 ? `${matchState.currentTeam} need ${runsNeeded} from ${remainingBalls} balls` : "Target achieved";
        document.getElementById("inningsMessage").innerText = matchState.inningsClosed
            ? matchState.result
            : `${matchState.currentTeam} need ${runsNeeded} runs from ${remainingBalls} balls.`;
    }

    updateRecentBalls();
    updateLiveFeed();
    updateCommentaryFeed();
    updateAdminPanel();
    updateSessionControls();
    updateScoringAvailability();
    pulseScoreboard();
    animateScanline();
    document.getElementById("commentaryPanel").style.display = matchState.commentaryVisible ? "block" : "none";
    saveMatchState();
}

function updateRecentBalls() {
    const container = document.getElementById("recentBalls");
    if (!matchState.recentBalls.length) {
        container.innerHTML = '<span class="ball-chip empty">No deliveries yet</span>';
        document.getElementById("overSummary").innerText = "This over: yet to start";
        return;
    }

    container.innerHTML = matchState.recentBalls
        .map((ball) => `<span class="ball-chip ${ball === "W" ? "wicket" : ""}">${ball}</span>`)
        .join("");
    document.getElementById("overSummary").innerText = `This over: ${matchState.recentBalls.join("  ")}`;
}

function updateLiveFeed() {
    const liveFeed = document.getElementById("liveFeed");
    const feedStatus = document.getElementById("feedStatus");

    if (!matchState.feedEntries.length) {
        liveFeed.innerHTML = '<div class="feed-line empty">Score updates will appear here ball by ball.</div>';
        feedStatus.innerText = "Waiting for first ball";
        return;
    }

    liveFeed.innerHTML = matchState.feedEntries
        .map((entry, index) => `
            <div class="feed-line ${entry.type} ${index === 0 ? "flash" : ""}">
                <span class="feed-time">${entry.time}</span>
                <strong>${entry.title}</strong>
            </div>
        `)
        .join("");

    feedStatus.innerText = matchState.feedEntries[0].title;
}

function updateCommentaryFeed() {
    const commentaryFeed = document.getElementById("commentaryFeed");

    if (!matchState.commentaryEntries.length) {
        commentaryFeed.innerHTML = '<div class="feed-line empty">Commentary will appear when the button is enabled.</div>';
        return;
    }

    commentaryFeed.innerHTML = matchState.commentaryEntries
        .map((entry, index) => `
            <div class="feed-line commentary ${index === 0 ? "flash" : ""}">
                <span class="feed-time">${entry.time}</span>
                <strong>${entry.text}</strong>
            </div>
        `)
        .join("");
}

function addFeedEntry(title, type) {
    matchState.feedEntries.unshift({
        title,
        type,
        time: `${formatOvers(matchState.balls)} ov`
    });

    if (matchState.feedEntries.length > 8) {
        matchState.feedEntries.pop();
    }
}

function addCommentaryEntry(text) {
    matchState.commentaryEntries.unshift({
        text,
        time: `${formatOvers(matchState.balls)} ov`
    });

    if (matchState.commentaryEntries.length > 10) {
        matchState.commentaryEntries.pop();
    }
}

function addAdminFeedEntry(title, type) {
    matchState.adminFeedEntries.unshift({
        title,
        type,
        time: new Date().toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit"
        })
    });

    if (matchState.adminFeedEntries.length > 10) {
        matchState.adminFeedEntries.pop();
    }
}

function updateAdminPanel() {
    if (matchState.role !== "admin") {
        return;
    }

    const sessions = getActiveSessions();
    document.getElementById("onlineUsersCount").innerText = `${sessions.length} users logged in`;
    document.getElementById("loggedInUsers").innerText = sessions.length
        ? sessions.map((session) => `${session.name} (${session.lastAction})`).join(", ")
        : "No active users";
    document.getElementById("currentController").innerText = matchState.controller || "rukesh";
    document.getElementById("dashboardUsers").innerText = getUsers().map((user) => user.name).join(", ");

    const feed = document.getElementById("adminFeed");
    if (!matchState.adminFeedEntries.length) {
        feed.innerHTML = '<div class="feed-line empty">Admin activity will appear here.</div>';
    } else {
        feed.innerHTML = matchState.adminFeedEntries
            .map((entry, index) => `
                <div class="feed-line ${entry.type} ${index === 0 ? "flash" : ""}">
                    <span class="feed-time">${entry.time}</span>
                    <strong>${entry.title}</strong>
                </div>
            `)
            .join("");
    }

    renderAllowedUsers();
    renderTransferList();
}

function updateSessionControls() {
    document.getElementById("viewerChip").innerText =
        matchState.role === "admin" ? `Admin | ${matchState.viewer}` : `User | ${matchState.viewer}`;
}

function openTransferPanel() {
    const panel = document.getElementById("transferPanel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
    renderTransferList();
}

function renderTransferList() {
    const sessions = getActiveSessions();
    const allowedUsers = new Set(getUsers().map((user) => user.name));
    const eligible = sessions.filter((session) => allowedUsers.has(session.name));

    document.getElementById("switchList").innerHTML = eligible.length
        ? eligible.map((session) => `
            <button type="button" class="switch-user-btn ${session.name === matchState.controller ? "active" : ""}" onclick="transferControl('${session.name}')">
                ${session.name}${session.name === "rukesh" ? " (admin)" : ""}
            </button>
        `).join("")
        : '<div class="feed-line empty">No logged-in users available for transfer.</div>';
}

function transferControl(userName) {
    const users = getUsers();
    if (!users.some((user) => user.name === userName)) {
        return;
    }

    matchState.controller = userName || "rukesh";
    addAdminFeedEntry(`${matchState.viewer} transferred control to ${userName}.`, "system");
    updateViewerAction(`Transferred control to ${userName}`);
    document.getElementById("transferPanel").style.display = "none";
    updateUI();
}

function logoutUser() {
    if (!matchState.viewer) {
        return;
    }

    saveActiveSessions(getActiveSessions().filter((session) => session.name !== matchState.viewer));
    saveMatchState();

    matchState.viewer = "";
    matchState.role = "user";
    matchState.history = [];
    matchState.adminFeedEntries = [];

    document.getElementById("matchArea").style.display = "none";
    document.getElementById("setupPanel").style.display = "none";
    document.getElementById("adminPanel").style.display = "none";
    document.getElementById("transferPanel").style.display = "none";
    document.getElementById("accessPanel").style.display = "block";
    document.getElementById("viewerName").value = "";
    document.getElementById("viewerPassword").value = "";
    document.getElementById("accessMessage").innerText = "";
}

function restoreSavedMatchOrSetup() {
    const saved = loadSavedMatch();

    if (!saved) {
        document.getElementById("setupPanel").style.display = matchState.role === "admin" ? "block" : "none";
        document.getElementById("matchArea").style.display = "none";
        return;
    }

    matchState.teamA = saved.teamA;
    matchState.teamB = saved.teamB;
    matchState.venue = saved.venue;
    matchState.totalOvers = saved.totalOvers;
    matchState.currentTeam = saved.currentTeam;
    matchState.innings = saved.innings;
    matchState.score = saved.score;
    matchState.wickets = saved.wickets;
    matchState.balls = saved.balls;
    matchState.firstInningsScore = saved.firstInningsScore;
    matchState.target = saved.target;
    matchState.recentBalls = saved.recentBalls || [];
    matchState.feedEntries = saved.feedEntries || [];
    matchState.commentaryEntries = saved.commentaryEntries || [];
    matchState.inningsClosed = saved.inningsClosed;
    matchState.result = saved.result;
    matchState.history = saved.history || [];
    matchState.adminFeedEntries = saved.adminFeedEntries || [];
    matchState.controller = saved.controller || "rukesh";
    matchState.commentaryVisible = saved.commentaryVisible || false;

    document.getElementById("setupPanel").style.display = "none";
    document.getElementById("matchArea").style.display = "grid";
    addAdminFeedEntry(`${matchState.viewer} resumed the saved match.`, "system");
    updateUI();
}

function canScore() {
    return matchState.role === "admin" || matchState.controller === matchState.viewer;
}

function updateScoringAvailability() {
    const allowed = canScore();
    document.querySelectorAll(".buttons button").forEach((button) => {
        button.disabled = !allowed;
    });

    document.getElementById("inningsAction").disabled = !allowed && document.getElementById("inningsAction").innerText !== "Match Finished";
}

function animateSignal(buttonId) {
    const signalTrack = document.getElementById("signalTrack");
    const monitorCable = document.getElementById("monitorCable");
    const sourceButton = document.getElementById(buttonId);

    document.querySelectorAll(".buttons button").forEach((button) => button.classList.remove("signal-origin"));
    sourceButton.classList.remove("signal-origin");
    void sourceButton.offsetWidth;
    sourceButton.classList.add("signal-origin");

    signalTrack.classList.remove("active");
    monitorCable.classList.remove("active");
    void signalTrack.offsetWidth;
    signalTrack.classList.add("active");
    monitorCable.classList.add("active");
}

function spawnScorePop(text, className) {
    const layer = document.getElementById("scorePopLayer");
    const pop = document.createElement("span");
    pop.className = `score-pop ${className}`;
    pop.innerText = text;
    pop.style.left = `${16 + Math.random() * 62}%`;
    pop.style.top = `${26 + Math.random() * 30}%`;
    layer.appendChild(pop);
    setTimeout(() => pop.remove(), 1200);
}

function pulseScoreboard() {
    const card = document.querySelector(".scoreboard-card");
    card.classList.remove("score-pulse");
    void card.offsetWidth;
    card.classList.add("score-pulse");
}

function animateScanline() {
    const scanline = document.getElementById("scoreScanline");
    scanline.classList.remove("active");
    void scanline.offsetWidth;
    scanline.classList.add("active");
}

function formatEventFeed(eventKey) {
    const event = scoringEvents[eventKey];
    if (eventKey === "w") {
        return `${matchState.currentTeam} lose a wicket.`;
    }
    if (eventKey === "wd") {
        return `${matchState.currentTeam} get a wide.`;
    }
    return `${matchState.currentTeam} score ${event.label}.`;
}

function formatCommentary(eventKey) {
    const event = scoringEvents[eventKey];
    const overText = formatOvers(matchState.balls);
    return `${overText}: ${event.commentary}`;
}

function formatOvers(totalBalls) {
    const over = Math.floor(totalBalls / 6);
    const ball = totalBalls % 6;
    return `${over}.${ball}`;
}

function calculateRunRate(score, totalBalls) {
    if (totalBalls === 0) {
        return "0.00";
    }

    return ((score * 6) / totalBalls).toFixed(2);
}
