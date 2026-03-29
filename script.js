import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getDatabase, get, onValue, ref, set } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const KEYS={sessions:"cricketDashboardActiveSessions",match:"cricketDashboardSavedMatch",history:"cricketDashboardHistory"};
const RTDB_PATHS={sessions:"activeSessions",match:"liveMatch",history:"matchHistory"};
const ADMIN_PASSWORD="admin123";
const MATCH_END_PASSWORD="2468";
const DEFAULT_ADMIN="ruana";
const CONFIG=window.CRICKET_APP_CONFIG||{};
const firebaseConfig=CONFIG.firebaseConfig||{
apiKey:"AIzaSyClEUkrLZxVYPjb_yUFgrwlzhVU-OtCQW0",
authDomain:"cricket-dashboard-23f1e.firebaseapp.com",
projectId:"cricket-dashboard-23f1e",
databaseURL:"https://cricket-dashboard-23f1e-default-rtdb.asia-southeast1.firebasedatabase.app",
storageBucket:"cricket-dashboard-23f1e.firebasestorage.app",
messagingSenderId:"149456600808",
appId:"1:149456600808:web:f6f3a42d02b972d6dad35d"
};
const dom={};
let renderQueued=false;
let firestoreDb=null;
let realtimeDb=null;
let stopLiveMatchSync=null;
let inactivityTimer=null;
const INACTIVITY_LIMIT_MS=30000;

try{
const app=initializeApp(firebaseConfig);
firestoreDb=getFirestore(app);
realtimeDb=getDatabase(app);
}catch(error){
console.error("Firebase initialization failed.",error);
}

const EVENTS={
dot:{label:"0",runs:0,wicket:false,legal:true,commentary:"Dot ball."},
"1":{label:"1",runs:1,wicket:false,legal:true,commentary:"1 run."},
"2":{label:"2",runs:2,wicket:false,legal:true,commentary:"2 runs."},
"3":{label:"3",runs:3,wicket:false,legal:true,commentary:"3 runs."},
"4":{label:"4",runs:4,wicket:false,legal:true,commentary:"4 runs."},
"6":{label:"6",runs:6,wicket:false,legal:true,commentary:"6 runs."},
wd:{label:"WD",runs:1,wicket:false,legal:false,commentary:"Wide ball. 1 extra run."},
nb:{label:"NB",runs:1,wicket:false,legal:false,commentary:"No ball. 1 extra run."},
w:{label:"W",runs:0,wicket:true,legal:true,commentary:"WICKET!"}
};

const defaultUsers=[
{name:DEFAULT_ADMIN,role:"admin",permission:"write",active:true},
{name:"hari",role:"scorer",permission:"write",active:true},
{name:"rukesh",role:"scorer",permission:"write",active:true},
{name:"naveen",role:"scorer",permission:"write",active:true},
{name:"subbuk",role:"scorer",permission:"write",active:true},
{name:"subbup",role:"scorer",permission:"write",active:true},
{name:"jagan",role:"scorer",permission:"write",active:true},
{name:"aravind",role:"scorer",permission:"write",active:true},
{name:"ravi",role:"scorer",permission:"write",active:true}
];

function emptyMatch(){
return{teamA:"",teamB:"",venue:"",totalOvers:20,maxWickets:10,lastManStanding:true,tossWinner:"",tossDecision:"",innings:1,battingTeam:"",bowlingTeam:"",score:0,wickets:0,balls:0,target:null,firstInnings:null,inningsClosed:false,isComplete:false,result:"Match in progress",controller:DEFAULT_ADMIN,controlRequest:null,recentBalls:[],feedEntries:[],commentaryEntries:[],adminFeedEntries:[],historyStack:[],overHistory:[]};
}

const state={users:[],sessions:[],matchHistory:[],match:emptyMatch(),viewer:"",role:"scorer",loginAsAdmin:false,commentaryVisible:true,storageMode:"local",ready:false,pendingSetup:null,awaitingLiveView:false};

function el(id){if(!dom[id]){dom[id]=document.getElementById(id)||null;}return dom[id];}
function txt(id,v){const n=el(id);if(n)n.textContent=v;}
function html(id,v){const n=el(id);if(n)n.innerHTML=v;}
function show(id,d="block"){const n=el(id);if(n)n.style.display=d;}
function hide(id){const n=el(id);if(n)n.style.display="none";}
function val(id){const n=el(id);return n?n.value.trim():"";}
function setVal(id,v){const n=el(id);if(n)n.value=v;}
function setClass(id,v){const n=el(id);if(n)n.className=v;}
function parse(raw,fallback){if(!raw)return fallback;try{return JSON.parse(raw)??fallback;}catch{return fallback;}}
function esc(v){return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");}
function stamp(){return new Date().toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});}
function oversText(balls){return `${Math.floor(balls/6)}.${balls%6}`;}
function runRate(score,balls){return balls?((score*6)/balls).toFixed(2):"0.00";}
function ballsLeft(){return Math.max(state.match.totalOvers*6-state.match.balls,0);}
function wicketsLeft(){return Math.max(state.match.maxWickets-state.match.wickets,0);}
function dismissalsDone(){return state.match.wickets>=state.match.maxWickets;}
function hasLiveMatch(){return Boolean(state.match.teamA&&!state.match.isComplete);}
function currentUser(){
if(state.role==="viewer"&&state.viewer)return {name:state.viewer,role:"viewer",permission:"read",active:true};
return getUser(state.viewer);
}
function canScore(){
const user=currentUser();
if(!user||!state.viewer||!hasLiveMatch())return false;
return user.active!==false&&state.viewer===state.match.controller;
}
function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render();});}

function storageAdapter(){
function safeLocalRead(key,fallback){try{return parse(localStorage.getItem(key),fallback);}catch{return fallback;}}
function safeLocalWrite(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
async function remoteRead(key,fallback){
if(!realtimeDb||!RTDB_PATHS[key])throw new Error(`Missing RTDB path for ${key}`);
const snapshot=await get(ref(realtimeDb,RTDB_PATHS[key]));
return snapshot.exists()?snapshot.val():fallback;
}
async function remoteWrite(key,value){
if(!realtimeDb||!RTDB_PATHS[key])throw new Error(`Missing RTDB path for ${key}`);
await set(ref(realtimeDb,RTDB_PATHS[key]),value);
}
return{
async read(key,fallback){
if(realtimeDb){try{state.storageMode="firebase";return await remoteRead(key,fallback);}catch(error){console.error(`Realtime Database read failed for ${key}.`,error);state.storageMode="local";}}
return safeLocalRead(key,fallback);
},
async write(key,value){
safeLocalWrite(key,value);
if(realtimeDb){try{state.storageMode="firebase";await remoteWrite(key,value);}catch(error){console.error(`Realtime Database write failed for ${key}.`,error);state.storageMode="local";}}
}
};
}
const store=storageAdapter();

function normalizeUsers(users){
const items=Array.isArray(users)&&users.length?users:[];
const mustReset=!items.length||!items.some((user)=>String(user?.name||"").trim().toLowerCase()===DEFAULT_ADMIN);
const source=mustReset?defaultUsers:items;
const seen=new Set();
const list=[];
source.forEach((user)=>{
const normalizedUser=normalizeUserRecord(user);
if(!normalizedUser||seen.has(normalizedUser.name))return;
seen.add(normalizedUser.name);
list.push(normalizedUser);
});
if(!seen.has(DEFAULT_ADMIN))list.unshift({name:DEFAULT_ADMIN,role:"admin",permission:"write",active:true});
return list;
}

function normalizeUserRecord(user){
const name=String(user?.name||"").trim().toLowerCase();
if(!name)return null;
const rawRole=String(user?.role||"").trim().toLowerCase();
const role=name===DEFAULT_ADMIN||rawRole==="admin"?"admin":"scorer";
const permission=role==="admin"?"write":user?.permission==="read"?"read":"write";
const active=user?.active!==false;
return {name,role,permission,active};
}

async function loadUsersFromFirestore(){
if(!firestoreDb)return normalizeUsers(defaultUsers);
const snapshot=await getDocs(collection(firestoreDb,"users"));
const users=snapshot.docs.map((entry)=>({name:entry.id,...entry.data()}));
return normalizeUsers(users);
}

async function fetchUserRecord(username){
if(!firestoreDb)throw new Error("Firestore is not available.");
const rawName=String(username||"").trim();
if(!rawName)return null;
const candidates=[rawName,rawName.toLowerCase(),rawName.toUpperCase()];
for(const candidate of [...new Set(candidates)]){
const snapshot=await getDoc(doc(firestoreDb,"users",candidate));
if(snapshot.exists())return normalizeUserRecord({name:snapshot.id,...snapshot.data()});
}
const allUsers=await loadUsersFromFirestore();
const matchedUser=allUsers.find((user)=>user.name===rawName.toLowerCase());
if(matchedUser)return matchedUser;
const cachedUser=state.users.find((user)=>user.name===rawName.toLowerCase());
return cachedUser||null;
}

function subscribeToLiveMatch(){
if(!realtimeDb)return;
if(stopLiveMatchSync){stopLiveMatchSync();stopLiveMatchSync=null;}
stopLiveMatchSync=onValue(ref(realtimeDb,RTDB_PATHS.match),(snapshot)=>{
const hadLiveMatch=hasLiveMatch();
const nextMatch=normalizeMatch(snapshot.val());
state.match=nextMatch;
if(state.viewer&&nextMatch.teamA&&!nextMatch.isComplete&&!hadLiveMatch){
state.awaitingLiveView=true;
setAccessMessage("Live match is in progress. Click View Live Match.","granted");
}
if(!nextMatch.teamA||nextMatch.isComplete)state.awaitingLiveView=false;
state.storageMode="firebase";
updateLiveMatchEntry();
if(state.ready)queueRender();
},(error)=>{
console.error("Live match subscription failed.",error);
state.storageMode="local";
updateStorageHint();
});
}

async function refreshLiveMatch(){
try{
const latestMatch=normalizeMatch(await store.read(KEYS.match,emptyMatch()));
state.match=latestMatch;
if(state.viewer&&latestMatch.teamA&&!latestMatch.isComplete&&state.awaitingLiveView){
setAccessMessage("Live match is in progress. Click View Live Match.","granted");
}
if(!latestMatch.teamA||latestMatch.isComplete)state.awaitingLiveView=false;
updateLiveMatchEntry();
queueRender();
}catch(error){
console.error("Manual refresh failed.",error);
setAccessMessage("Could not refresh the live match right now.","denied");
}
}

function normalizeMatch(raw){
if(!raw||typeof raw!=="object"||!raw.teamA||!raw.teamB)return emptyMatch();
const base=emptyMatch();
const totalOvers=Math.max(Number(raw.totalOvers)||base.totalOvers,1);
const maxWickets=Math.max(Number(raw.maxWickets)||base.maxWickets,2);
return{...base,...raw,totalOvers,maxWickets,lastManStanding:maxWickets<=6,tossWinner:String(raw.tossWinner||""),tossDecision:String(raw.tossDecision||""),innings:raw.innings===2?2:1,score:Number(raw.score)||0,wickets:Number(raw.wickets)||0,balls:Number(raw.balls)||0,target:raw.target?Number(raw.target):null,controlRequest:raw.controlRequest&&typeof raw.controlRequest==="object"?{requestedBy:String(raw.controlRequest.requestedBy||"").toLowerCase(),requestedAt:String(raw.controlRequest.requestedAt||"")}:null,recentBalls:Array.isArray(raw.recentBalls)?raw.recentBalls:[],feedEntries:Array.isArray(raw.feedEntries)?raw.feedEntries:[],commentaryEntries:Array.isArray(raw.commentaryEntries)?raw.commentaryEntries:[],adminFeedEntries:Array.isArray(raw.adminFeedEntries)?raw.adminFeedEntries:[],historyStack:Array.isArray(raw.historyStack)?raw.historyStack:[],overHistory:Array.isArray(raw.overHistory)?raw.overHistory:[]};
}

async function persistAll(){
try{
await Promise.all([
store.write(KEYS.sessions,state.sessions),
store.write(KEYS.match,state.match),
store.write(KEYS.history,state.matchHistory)
]);
}catch(error){
console.error("Persist failed.",error);
setAccessMessage("Sync failed. Local fallback is still active.","denied");
}
updateStorageHint();
}

async function hydrate(){
try{
state.users=await loadUsersFromFirestore();
}catch(error){
console.error("Failed to load users from Firestore.",error);
state.users=normalizeUsers(defaultUsers);
setAccessMessage("Firestore users could not be loaded. Local fallback is active.","denied");
}
state.sessions=await store.read(KEYS.sessions,[]);
state.match=normalizeMatch(await store.read(KEYS.match,emptyMatch()));
const historyItems=await store.read(KEYS.history,[]);
state.matchHistory=Array.isArray(historyItems)?historyItems.slice(0,20):[];
subscribeToLiveMatch();
bindInputs();
bindActivityTracking();
buildRunoutOptions();
buildByesOptions();
updateStorageHint();
updateLastManPreview();
state.ready=true;
queueRender();
}

function bindInputs(){
const wicketsField=el("wicketsInput");
if(wicketsField&&!wicketsField.dataset.bound){
wicketsField.dataset.bound="1";
wicketsField.addEventListener("input",updateLastManPreview);
}
}

function updateLastManPreview(){
const wickets=Math.max(Number(val("wicketsInput"))||0,0);
txt("lastManStatus",wickets>0&&wickets<=6?"ON":"OFF");
}

function setSetupDefaults(){
state.pendingSetup=null;
setVal("teamA","");
setVal("teamB","");
setVal("overs","");
setVal("wicketsInput","");
setVal("venue","");
const tossWinner=el("tossWinner");
const tossDecision=el("tossDecision");
if(tossWinner){
tossWinner.innerHTML='<option value="">Select toss winner</option><option value="teamA">Team A</option><option value="teamB">Team B</option>';
tossWinner.value="";
}
if(tossDecision)tossDecision.value="";
show("setupDetailsStage");
hide("tossStage");
updateLastManPreview();
}

function updateTossWinnerOptions(teamA,teamB){
const tossWinner=el("tossWinner");
if(!tossWinner)return;
tossWinner.innerHTML="";
const placeholder=document.createElement("option");
placeholder.value="";
placeholder.textContent="Select toss winner";
const teamAOption=document.createElement("option");
teamAOption.value="teamA";
teamAOption.textContent=teamA||"Team A";
const teamBOption=document.createElement("option");
teamBOption.value="teamB";
teamBOption.textContent=teamB||"Team B";
tossWinner.append(placeholder,teamAOption,teamBOption);
}

function updateStorageHint(){
txt("storageHint",state.storageMode==="firebase"?"Cloud sync active via Firebase Realtime Database.":"Firebase sync is unavailable right now. The app is using local fallback.");
}

function setAccessMessage(message,tone=""){
txt("accessMessage",message);
setClass("accessMessage",`access-message${tone?` ${tone}`:""}`);
}

function getUser(name){return state.users.find((user)=>user.name===name)||null;}
function validUsername(name){return /^[a-z0-9_-]{3,20}$/.test(name);}

function appendFeed(title,type="system"){
state.match.feedEntries.unshift({title,type,time:`${oversText(state.match.balls)} ov`});
state.match.feedEntries=state.match.feedEntries.slice(0,18);
}

function appendCommentary(message){
state.match.commentaryEntries.push({text:message,time:`${oversText(state.match.balls)} ov`});
state.match.commentaryEntries=state.match.commentaryEntries.slice(-40);
}

function appendAdminFeed(title,type="system"){
state.match.adminFeedEntries.unshift({title,type,time:stamp()});
state.match.adminFeedEntries=state.match.adminFeedEntries.slice(0,15);
}

async function updateSessionAction(action){
if(!state.viewer)return;
const existing=state.sessions.find((session)=>session.name===state.viewer);
if(existing){existing.lastAction=action;existing.role=state.role;}else{state.sessions.push({name:state.viewer,role:state.role,lastAction:action});}
appendAdminFeed(`${state.viewer}: ${action}`,"viewer");
await persistAll();
queueRender();
}

function toggleAdminLogin(){
state.loginAsAdmin=Boolean(el("adminToggle")?.checked);
if(state.loginAsAdmin){show("passwordField");}else{hide("passwordField");setVal("viewerPassword","");}
}

function updateLiveMatchEntry(){
const liveMatchButton=el("liveMatchButton");
if(!liveMatchButton)return;
const shouldShow=Boolean(state.viewer&&hasLiveMatch()&&state.awaitingLiveView);
liveMatchButton.style.display=shouldShow?"inline-flex":"none";
liveMatchButton.disabled=!shouldShow;
}

function clearInactivityTimer(){
if(inactivityTimer){clearTimeout(inactivityTimer);inactivityTimer=null;}
}

function scheduleInactivityLogout(){
clearInactivityTimer();
if(!state.viewer)return;
inactivityTimer=setTimeout(()=>{
if(state.viewer)void logoutUser("Logged out due to 30 seconds of inactivity.");
},INACTIVITY_LIMIT_MS);
}

function registerActivity(){
if(!state.viewer)return;
scheduleInactivityLogout();
}

function bindActivityTracking(){
["click","keydown","mousemove","touchstart","scroll"].forEach((eventName)=>{
window.addEventListener(eventName,registerActivity,{passive:true});
});
}

function viewLiveMatch(){
if(!state.viewer||!hasLiveMatch())return;
state.awaitingLiveView=false;
updateLiveMatchEntry();
queueRender();
}

async function requestControl(){
if(!state.viewer||!hasLiveMatch()||canScore()||state.match.isComplete)return;
if(state.match.controlRequest?.requestedBy===state.viewer){
setAccessMessage("Your control request is already pending.","granted");
return;
}
state.match.controlRequest={requestedBy:state.viewer,requestedAt:stamp()};
appendAdminFeed(`${state.viewer} requested scoring control from ${state.match.controller}.`,"viewer");
await persistAll();
setAccessMessage(`Control request sent to ${state.match.controller}.`,"granted");
queueRender();
}

async function approveControlRequest(){
if(!canScore()||!state.match.controlRequest?.requestedBy)return;
const nextController=state.match.controlRequest.requestedBy;
state.match.controller=nextController;
state.match.controlRequest=null;
appendAdminFeed(`Scoring control transferred to ${nextController}.`,"system");
appendCommentary(`${oversText(state.match.balls)}: Scoring control moved to ${nextController}.`);
await persistAll();
setAccessMessage(`Scoring control transferred to ${nextController}.`,"granted");
queueRender();
}

async function grantAccess(){
try{
const requested=val("viewerName");
const name=requested||(state.loginAsAdmin?DEFAULT_ADMIN:"");
const password=val("viewerPassword");
if(!name){setAccessMessage("Enter a username to continue.","denied");return;}
if(!validUsername(name.toLowerCase())){setAccessMessage("Use 3-20 letters, numbers, hyphen, or underscore.","denied");return;}
const user=await fetchUserRecord(name);
const loginUser=!state.loginAsAdmin&&(!user||user.active===false)?{name:name.toLowerCase(),role:"viewer",permission:"read",active:true,isAnonymous:true}:user;
if(!loginUser){setAccessMessage("User not allowed.","denied");return;}
if(user&&user.active===false&&state.loginAsAdmin){setAccessMessage("User not allowed.","denied");return;}
if(state.loginAsAdmin){
if(loginUser.role!=="admin"){setAccessMessage("This account is not an admin account.","denied");return;}
if(password!==ADMIN_PASSWORD){setAccessMessage("Incorrect admin password.","denied");return;}
}else{
if(loginUser.role==="admin"){setAccessMessage("Admin must use the admin checkbox and password.","denied");return;}
}
if(!loginUser.isAnonymous){
state.users=state.users.some((entry)=>entry.name===loginUser.name)?state.users.map((entry)=>entry.name===loginUser.name?loginUser:entry):normalizeUsers([...state.users,loginUser]);
}
const latestMatch=normalizeMatch(await store.read(KEYS.match,emptyMatch()));
if(latestMatch.teamA&&!latestMatch.isComplete)state.match=latestMatch;
state.viewer=loginUser.name;
state.role=loginUser.role;
state.awaitingLiveView=Boolean(latestMatch.teamA&&!latestMatch.isComplete);
updateLiveMatchEntry();
state.sessions=state.sessions.filter((session)=>session.name!==loginUser.name);
state.sessions.push({name:loginUser.name,role:loginUser.role,lastAction:"Logged in"});
appendAdminFeed(`${loginUser.name} logged in as ${loginUser.role}.`,"system");
setAccessMessage(state.awaitingLiveView?`Live match is in progress. Click View Live Match.`:`Welcome ${loginUser.name}.`,"granted");
setVal("viewerPassword","");
scheduleInactivityLogout();
await persistAll();
queueRender();
}catch(error){
console.error(error);
setAccessMessage("Login failed. The page recovered safely.","denied");
}
}

async function addAllowedViewer(){
try{
if(state.role!=="admin")return;
if(!firestoreDb){setAccessMessage("Firestore is not available right now.","denied");return;}
const name=val("newViewerName").toLowerCase();
const permission=el("newViewerPermission")?el("newViewerPermission").value:"write";
if(!name)return;
if(!validUsername(name)){setAccessMessage("Username must be 3-20 characters using letters, numbers, hyphen, or underscore.","denied");return;}
if(await fetchUserRecord(name)){setAccessMessage("That username already exists.","denied");return;}
await setDoc(doc(firestoreDb,"users",name),{role:"scorer",active:true,permission:permission==="read"?"read":"write"});
state.users=await loadUsersFromFirestore();
appendAdminFeed(`Admin created user ${name} with ${permission} permission.`,"system");
setVal("newViewerName","");
if(el("newViewerPermission"))el("newViewerPermission").value="write";
await persistAll();
queueRender();
}catch(error){
console.error("Failed to add user.",error);
setAccessMessage("Could not create the user right now.","denied");
}
}

async function removeAllowedViewer(name){
try{
if(state.role!=="admin"||name===DEFAULT_ADMIN)return;
if(!firestoreDb){setAccessMessage("Firestore is not available right now.","denied");return;}
await deleteDoc(doc(firestoreDb,"users",name));
state.users=state.users.filter((user)=>user.name!==name);
state.sessions=state.sessions.filter((session)=>session.name!==name);
if(state.match.controller===name)state.match.controller=DEFAULT_ADMIN;
appendAdminFeed(`Admin removed user ${name}.`,"system");
await persistAll();
queueRender();
}catch(error){
console.error(`Failed to remove user ${name}.`,error);
setAccessMessage("Could not remove the user right now.","denied");
}
}

async function updateUserPermission(name,permission){
try{
if(state.role!=="admin"||name===DEFAULT_ADMIN)return;
if(!firestoreDb){setAccessMessage("Firestore is not available right now.","denied");return;}
await updateDoc(doc(firestoreDb,"users",name),{permission:permission==="read"?"read":"write"});
state.users=state.users.map((user)=>user.name===name?{...user,permission:permission==="read"?"read":"write"}:user);
appendAdminFeed(`Admin updated ${name} to ${permission} permission.`,"system");
await persistAll();
queueRender();
}catch(error){
console.error(`Failed to update permission for ${name}.`,error);
setAccessMessage("Could not update the user right now.","denied");
}
}

function buildRunoutOptions(){
html("runoutOptions",Array.from({length:7},(_,runs)=>`<button type="button" class="ghost-btn runout-option" onclick="recordRunout(${runs})">${runs}+W</button>`).join(""));
}

function buildByesOptions(){
html("byesOptions",Array.from({length:4},(_,index)=>`<button type="button" class="ghost-btn runout-option" onclick="recordByes(${index+1})">Byes ${index+1}</button>`).join(""));
}

function saveSetupDetails(){
const teamA=val("teamA");
const teamB=val("teamB");
const totalOvers=Math.max(Number(val("overs"))||0,0);
const maxWickets=Math.max(Number(val("wicketsInput"))||0,0);
const venue=val("venue")||"Venue not specified";
if(!teamA||!teamB||totalOvers<1||maxWickets<2){showStatusModal("Invalid Setup","Enter team names, overs, wickets, and venue before moving to toss.","Validation");return;}
state.pendingSetup={teamA,teamB,totalOvers,maxWickets,venue,lastManStanding:maxWickets<=6};
updateTossWinnerOptions(teamA,teamB);
txt("pendingMatchSummary",`${teamA} vs ${teamB} | ${totalOvers} overs | ${maxWickets} wickets`);
hide("setupDetailsStage");
show("tossStage");
}

function backToSetupDetails(){
hide("tossStage");
show("setupDetailsStage");
}

function showStatusModal(title,message,eyebrow="Match Update"){
txt("modalEyebrow",eyebrow);
txt("modalTitle",title);
txt("modalMessage",message);
show("statusModal","flex");
}

function resetMatchForNewSetup(){
const retainedAdminFeed=Array.isArray(state.match.adminFeedEntries)?state.match.adminFeedEntries:[];
state.match={...emptyMatch(),adminFeedEntries:retainedAdminFeed,controller:DEFAULT_ADMIN};
setSetupDefaults();
persistAll();
}

function closeStatusModal(){
hide("statusModal");
if(state.match.isComplete){
resetMatchForNewSetup();
if(state.role==="admin"){
show("setupPanel");
hide("matchArea");
hide("accessPanel");
}else{
show("accessPanel");
hide("setupPanel");
hide("matchArea");
}
queueRender();
}
}
function openRunoutModal(){if(canScore())show("runoutModal","flex");}
function closeRunoutModal(){hide("runoutModal");}
function openByesModal(){if(canScore())show("byesModal","flex");}
function closeByesModal(){hide("byesModal");}
function openEndMatchModal(){
if(!state.viewer||!state.match.teamA||state.match.isComplete)return;
setVal("endMatchPassword","");
txt("endMatchMessage","");
setClass("endMatchMessage","access-message");
show("endMatchModal","flex");
}
function closeEndMatchModal(){hide("endMatchModal");}

function signal(buttonId){
const signalTrack=el("signalTrack");
const monitorCable=el("monitorCable");
const sourceButton=el(buttonId);
document.querySelectorAll(".buttons button").forEach((button)=>button.classList.remove("signal-origin"));
if(sourceButton){sourceButton.classList.remove("signal-origin");void sourceButton.offsetWidth;sourceButton.classList.add("signal-origin");}
if(signalTrack){signalTrack.classList.remove("active");void signalTrack.offsetWidth;signalTrack.classList.add("active");}
if(monitorCable){monitorCable.classList.remove("active");void monitorCable.offsetWidth;monitorCable.classList.add("active");}
}

function pulseBoard(){
const card=document.querySelector(".scoreboard-card");
if(!card)return;
card.classList.remove("score-pulse");
void card.offsetWidth;
card.classList.add("score-pulse");
const scanline=el("scoreScanline");
if(scanline){scanline.classList.remove("active");void scanline.offsetWidth;scanline.classList.add("active");}
}

function scorePop(textValue,className){
const layer=el("scorePopLayer");
if(!layer)return;
const pop=document.createElement("span");
pop.className=`score-pop ${className}`;
pop.textContent=textValue;
pop.style.left=`${16+Math.random()*62}%`;
pop.style.top=`${26+Math.random()*30}%`;
layer.appendChild(pop);
setTimeout(()=>pop.remove(),1200);
}

function celebrate(type){
const layer=el("celebrationLayer");
if(!layer)return;
layer.innerHTML="";
if(type==="six"){
const flame=document.createElement("div");
flame.className="flame-burst";
flame.innerHTML='<span></span><span></span><span></span><span></span><span></span>';
layer.appendChild(flame);
setTimeout(()=>flame.remove(),1400);
return;
}
Array.from({length:10}).forEach((_,index)=>{
const balloon=document.createElement("span");
balloon.className=`balloon balloon-${index%2===0?"left":"right"}`;
balloon.style.setProperty("--delay",`${index*60}ms`);
if(index%2===0){balloon.style.left=`${6+index*3}%`;}else{balloon.style.right=`${6+index*3}%`;}
layer.appendChild(balloon);
setTimeout(()=>balloon.remove(),1800);
});
}

function historySnapshot(){
state.match.historyStack.push(JSON.parse(JSON.stringify({
score:state.match.score,
wickets:state.match.wickets,
balls:state.match.balls,
innings:state.match.innings,
battingTeam:state.match.battingTeam,
bowlingTeam:state.match.bowlingTeam,
target:state.match.target,
firstInnings:state.match.firstInnings,
inningsClosed:state.match.inningsClosed,
isComplete:state.match.isComplete,
result:state.match.result,
recentBalls:state.match.recentBalls,
feedEntries:state.match.feedEntries,
commentaryEntries:state.match.commentaryEntries,
overHistory:state.match.overHistory
})));
}

function restoreSnapshot(snapshot){if(snapshot)state.match={...state.match,...snapshot};}

function ballChipTone(label){
if(String(label).includes("W"))return "wicket";
if(label==="4"||label==="6")return "boundary";
if(label==="NB"||label==="WD")return "extra";
if(label==="0")return "dot";
return "single";
}

function updateOverHistory(event){
const overNumber=Math.floor((Math.max(state.match.balls-(event.legal?1:0),0))/6)+1;
let currentOver=state.match.overHistory[state.match.overHistory.length-1];
if(!currentOver||currentOver.number!==overNumber){
currentOver={number:overNumber,balls:[],runs:0};
state.match.overHistory.push(currentOver);
}
currentOver.balls.push({label:event.label,tone:ballChipTone(event.label)});
currentOver.runs+=event.runs;
}

async function startMatch(){
const setup=state.pendingSetup;
const tossWinnerValue=el("tossWinner")?el("tossWinner").value:"";
const tossDecision=el("tossDecision")?el("tossDecision").value:"";
if(!setup||!tossWinnerValue||!tossDecision){showStatusModal("Invalid Toss","Save match details first, then choose toss winner and bat or bowl.","Validation");return;}
const {teamA,teamB,totalOvers,maxWickets,venue}=setup;
const tossWinner=tossWinnerValue==="teamA"?teamA:teamB;
const otherTeam=tossWinner===teamA?teamB:teamA;
const battingTeam=tossDecision==="bat"?tossWinner:otherTeam;
const bowlingTeam=battingTeam===teamA?teamB:teamA;
state.match={...emptyMatch(),teamA,teamB,venue,totalOvers,maxWickets,lastManStanding:maxWickets<=6,tossWinner,tossDecision,battingTeam,bowlingTeam,controller:state.viewer||DEFAULT_ADMIN,adminFeedEntries:state.match.adminFeedEntries||[]};
state.pendingSetup=null;
appendFeed(`${tossWinner} won the toss and chose to ${tossDecision}. ${battingTeam} started batting.`,"system");
appendCommentary("0.0: Innings begins.");
appendAdminFeed(`${state.viewer} started a new match.`,"system");
await updateSessionAction("Started the match");
}

function feedText(eventKey,event){
if(eventKey==="w")return `${state.match.battingTeam} lose a wicket.`;
if(eventKey==="nb")return `${state.match.battingTeam} get a no ball extra.`;
if(eventKey==="wd")return `${state.match.battingTeam} get a wide extra.`;
if(eventKey==="dot")return `${state.match.battingTeam} play out a dot ball.`;
return `${state.match.battingTeam} score ${event.runs}.`;
}

function runoutCommentary(runs){return runs?`Runout! ${runs} run${runs===1?"":"s"} completed before the wicket.`:"Runout! No run completed.";}

async function recordRunout(runs){
closeRunoutModal();
await applyEvent({label:`${runs}+W`,runs,wicket:true,legal:true,commentary:runoutCommentary(runs),feedText:`${state.match.battingTeam} lose a batter to a runout after ${runs} run${runs===1?"":"s"}.`},"btn-runout");
}

async function recordByes(runs){
closeByesModal();
await applyEvent({label:`B${runs}`,runs,wicket:false,legal:true,commentary:`Byes taken. ${runs} run${runs===1?"":"s"} added as extras.`,feedText:`${state.match.battingTeam} collect ${runs} bye${runs===1?"":"s"}.`},"btn-byes");
}

async function recordBall(eventKey,buttonId){
const event=EVENTS[eventKey];
if(!event)return;
await applyEvent({...event,feedText:feedText(eventKey,event)},buttonId);
}

async function applyEvent(event,buttonId){
if(!state.match.teamA||state.match.inningsClosed||!canScore())return;
historySnapshot();
state.match.score+=event.runs;
if(event.wicket)state.match.wickets+=1;
if(event.legal)state.match.balls+=1;
state.match.recentBalls.push(event.label);
state.match.recentBalls=state.match.recentBalls.slice(-6);
updateOverHistory(event);
appendFeed(event.feedText,event.wicket?"wicket":event.runs>=4?"boundary":"score");
appendCommentary(`${oversText(state.match.balls)}: ${event.commentary}`);
signal(buttonId);
pulseBoard();
scorePop(event.label,event.wicket?"wicket-pop":event.runs>=4?"boundary-pop":"six-pop");
if(event.runs===4)celebrate("four");
if(event.runs===6)celebrate("six");
if(state.match.lastManStanding&&wicketsLeft()===1&&!state.match.isComplete)appendCommentary(`${oversText(state.match.balls)}: Last batter standing is now active.`);
await updateSessionAction(`Scored ${event.label}`);
await evaluateProgress();
}

async function evaluateProgress(){
if(state.match.innings===1){
if(dismissalsDone()){await closeFirstInnings("All wickets down");return;}
if(state.match.balls>=state.match.totalOvers*6){await closeFirstInnings("Overs completed");return;}
}
if(state.match.innings===2){
if(state.match.target&&state.match.score>=state.match.target){const margin=wicketsLeft();await finishMatch(`${state.match.battingTeam} won by ${margin} wicket${margin===1?"":"s"}`);return;}
if(dismissalsDone()){await finishMatch(`${state.match.bowlingTeam} won by ${Math.max((state.match.target||1)-state.match.score-1,0)} runs`);return;}
if(state.match.balls>=state.match.totalOvers*6){
const margin=Math.max((state.match.target||1)-state.match.score-1,0);
await finishMatch(margin===0?"Match tied":`${state.match.bowlingTeam} won by ${margin} runs`);
return;
}
}
await persistAll();
queueRender();
}

async function closeFirstInnings(reason){
state.match.inningsClosed=true;
state.match.firstInnings={team:state.match.battingTeam,score:state.match.score,wickets:state.match.wickets};
state.match.target=state.match.score+1;
state.match.result=`${state.match.battingTeam} finished on ${state.match.score}/${state.match.wickets}`;
appendFeed("Innings Completed","result");
appendCommentary(`${oversText(state.match.balls)}: Innings Completed.`);
await persistAll();
queueRender();
showStatusModal("Innings Completed",`${state.match.battingTeam} posted ${state.match.score}/${state.match.wickets}. Target is ${state.match.target}.`,reason);
setTimeout(async()=>{
if(state.match.innings===1&&state.match.inningsClosed&&!state.match.isComplete){
closeStatusModal();
await beginSecondInnings();
}
},1400);
}

async function beginSecondInnings(){
const nextBatting=state.match.firstInnings?.team===state.match.teamA?state.match.teamB:state.match.teamA;
const nextBowling=nextBatting===state.match.teamA?state.match.teamB:state.match.teamA;
state.match.innings=2;
state.match.score=0;
state.match.wickets=0;
state.match.balls=0;
state.match.inningsClosed=false;
state.match.battingTeam=nextBatting;
state.match.bowlingTeam=nextBowling;
state.match.recentBalls=[];
state.match.result="Match in progress";
state.match.historyStack=[];
state.match.overHistory=[];
appendFeed(`${state.match.battingTeam} started the chase.`,"system");
appendCommentary("0.0: Second innings begins.");
await updateSessionAction("2nd innings started automatically");
}

async function finishMatch(resultText){
state.match.inningsClosed=true;
state.match.isComplete=true;
state.match.result=resultText;
appendFeed(`Result: ${resultText}`,"result");
appendCommentary(`${oversText(state.match.balls)}: ${resultText}`);
appendAdminFeed(`Match completed: ${resultText}`,"system");
state.matchHistory.unshift({fixture:`${state.match.teamA} vs ${state.match.teamB}`,winner:resultText,completedAt:stamp(),venue:state.match.venue});
state.matchHistory=state.matchHistory.slice(0,20);
await updateSessionAction(`Completed match | ${resultText}`);
await persistAll();
queueRender();
showStatusModal("Match Result",resultText,"Completed");
}

async function confirmEndMatch(){
const password=val("endMatchPassword");
if(password!==MATCH_END_PASSWORD){
txt("endMatchMessage","Incorrect match ending password.");
setClass("endMatchMessage","access-message denied");
return;
}
closeEndMatchModal();
await finishMatch("Match ended manually");
}

function canScheduleMatch(){
const user=currentUser();
return Boolean(user&&(user.role==="admin"||user.permission==="write")&&!hasLiveMatch());
}

function startNewMatch(){
if(!state.viewer||!canScheduleMatch()||hasLiveMatch())return;
appendAdminFeed(`${state.viewer} abandoned the current match and opened new match setup.`,"system");
state.match={...emptyMatch(),adminFeedEntries:state.match.adminFeedEntries||[],controller:DEFAULT_ADMIN};
setSetupDefaults();
persistAll();
show("setupPanel");
hide("matchArea");
hide("accessPanel");
queueRender();
}

function switchToAdminLogin(){
const leavingUser=state.viewer;
state.match={...emptyMatch(),adminFeedEntries:state.match.adminFeedEntries||[],controller:DEFAULT_ADMIN};
state.pendingSetup=null;
state.viewer="";
state.role="scorer";
state.awaitingLiveView=false;
updateLiveMatchEntry();
state.loginAsAdmin=true;
state.sessions=state.sessions.filter((session)=>session.name!==leavingUser);
setSetupDefaults();
if(el("adminToggle"))el("adminToggle").checked=true;
show("passwordField");
setVal("viewerName",DEFAULT_ADMIN);
setVal("viewerPassword","");
setAccessMessage("Current match abandoned. Admin can log in to continue.","granted");
hide("setupPanel");
hide("matchArea");
show("accessPanel");
persistAll();
queueRender();
}

async function changeInnings(){
if(!canScore()||state.match.isComplete||!state.match.teamA)return;
if(state.match.innings===1&&!state.match.inningsClosed){await closeFirstInnings("Ended by scorer");return;}
if(state.match.innings===1&&state.match.inningsClosed){closeStatusModal();await beginSecondInnings();}
}

async function undoLastAction(){
if(!canScore()||!state.match.historyStack.length)return;
restoreSnapshot(state.match.historyStack.pop());
appendFeed("Last action undone.","system");
appendCommentary(`${oversText(state.match.balls)}: Previous ball removed.`);
await updateSessionAction("Used Undo");
}

function toggleCommentary(){state.commentaryVisible=!state.commentaryVisible;queueRender();}

async function logoutUser(message=""){
if(!state.viewer)return;
const leaving=state.viewer;
const leavingRole=state.role;
clearInactivityTimer();
state.sessions=state.sessions.filter((session)=>session.name!==state.viewer);
state.viewer="";
state.role="scorer";
state.awaitingLiveView=false;
updateLiveMatchEntry();
state.loginAsAdmin=false;
if(el("adminToggle"))el("adminToggle").checked=false;
hide("passwordField");
hide("setupPanel");
hide("matchArea");
show("accessPanel");
setVal("viewerName","");
setVal("viewerPassword","");
setAccessMessage(message);
appendAdminFeed(`${leaving} logged out.${leavingRole==="viewer"?" (viewer)":""}`,"system");
await persistAll();
queueRender();
}

function goBack(){
switchToAdminLogin();
}

function renderRecentBalls(){
if(!state.match.recentBalls.length){html("recentBalls",'<span class="ball-chip empty">No deliveries yet</span>');txt("overSummary","This over: yet to start");return;}
html("recentBalls",state.match.recentBalls.map((ball)=>`<span class="ball-chip ${String(ball).includes("W")?"wicket":""}">${esc(ball)}</span>`).join(""));
txt("overSummary",`This over: ${state.match.recentBalls.join("  ")}`);
}

function renderLiveFeed(){
if(!state.match.overHistory.length){html("liveFeed",'<div class="feed-line empty">Overs will appear here once scoring starts.</div>');txt("feedStatus","Waiting for first over");return;}
html("liveFeed",state.match.overHistory.map((over)=>`<article class="over-card"><div class="over-card-head"><strong>Over ${over.number}</strong><span>Runs: ${over.runs}</span></div><div class="over-ball-row">${over.balls.map((ball)=>`<span class="over-ball ${esc(ball.tone)}">${esc(ball.label)}</span>`).join("")}</div></article>`).join(""));
const latest=state.match.overHistory[state.match.overHistory.length-1];
txt("feedStatus",latest?`Over ${latest.number} | Runs ${latest.runs}`:"Waiting for first over");
}

function renderCommentary(){
const panel=el("commentaryPanel");
if(panel)panel.style.display=state.commentaryVisible?"block":"none";
if(!state.match.commentaryEntries.length){html("commentaryFeed",'<div class="feed-line empty">Commentary will appear when the innings starts.</div>');return;}
html("commentaryFeed",state.match.commentaryEntries.map((entry)=>`<div class="feed-line commentary"><span class="feed-time">${esc(entry.time)}</span><strong>${esc(entry.text)}</strong></div>`).join(""));
const feed=el("commentaryFeed");
if(feed)feed.scrollTop=feed.scrollHeight;
}

function renderAllowedUsers(){
html("allowedUsersList",state.users.length?state.users.map((user)=>`<div class="admin-user-chip"><div><strong>${esc(user.name)}${user.role==="admin"?" (admin)":user.active===false?" (inactive)":""}</strong><div class="user-permission">${user.role==="admin"?"admin":`${esc(user.role||"scorer")} | ${esc(user.permission||"write")}`}</div></div><div class="user-actions">${user.role==="admin"?"":`<button type="button" class="mini-btn" onclick="updateUserPermission('${esc(user.name)}','${user.permission==="write"?"read":"write"}')">${user.permission==="write"?"Set Read":"Set Write"}</button><button type="button" class="mini-btn" onclick="removeAllowedViewer('${esc(user.name)}')">Remove</button>`}</div></div>`).join(""):'<div class="feed-line empty">No users added yet.</div>');
}

function renderAdminPanel(){
if(state.role!=="admin"){hide("adminPanel");return;}
show("adminPanel");
txt("onlineUsersCount",`${state.sessions.length} users logged in`);
txt("loggedInUsers",state.sessions.length?state.sessions.map((session)=>`${session.name} (${session.lastAction})`).join(", "):"No active users");
txt("currentController",state.match.controller||DEFAULT_ADMIN);
txt("dashboardUsers",state.users.map((user)=>`${user.name} (${user.role==="admin"?"admin":`${user.role}/${user.permission}`})`).join(", "));
html("adminFeed",state.match.adminFeedEntries.length?state.match.adminFeedEntries.map((entry)=>`<div class="feed-line ${esc(entry.type)}"><span class="feed-time">${esc(entry.time)}</span><strong>${esc(entry.title)}</strong></div>`).join(""):'<div class="feed-line empty">Admin activity will appear here.</div>');
renderAllowedUsers();
}

function renderRoleView(hasMatch){
    const isAdmin=state.role==="admin";
    const historyPanel=document.querySelector(".history-panel");
    const liveFeedPanel=document.querySelector(".live-feed-panel");
    const newMatchButton=el("newMatchButton");
    const requestControlButton=el("requestControlButton");
    const transferControlButton=el("transferControlButton");
    const controlRequestStatus=el("controlRequestStatus");

    if(historyPanel)historyPanel.style.display=isAdmin||hasMatch?"block":"none";
    if(liveFeedPanel)liveFeedPanel.style.order=isAdmin?"0":"3";
    updateLiveMatchEntry();
    if(newMatchButton)newMatchButton.style.display=hasMatch&&!state.match.isComplete?"none":"inline-flex";
    if(requestControlButton)requestControlButton.style.display=state.viewer&&state.role==="scorer"&&hasMatch&&!state.match.isComplete&&!canScore()?"inline-flex":"none";
    if(transferControlButton)transferControlButton.style.display=canScore()&&state.match.controlRequest?.requestedBy?"inline-flex":"none";
    if(controlRequestStatus){
        const requestText=state.match.controlRequest?.requestedBy?`Request: ${state.match.controlRequest.requestedBy}`:canScore()&&hasMatch?`Controller: ${state.match.controller}`:"View only";
        controlRequestStatus.textContent=requestText;
        controlRequestStatus.style.display=hasMatch?"inline-flex":"none";
    }

    txt("viewerChip",state.viewer?`${isAdmin?"Admin":state.role==="viewer"?"Viewer":"Scorer"} | ${state.viewer}`:"Guest");
}

function renderHistory(){
txt("historyCount",`${state.matchHistory.length} completed`);
html("historyList",state.matchHistory.length?state.matchHistory.map((item)=>`<div class="history-item"><strong>${esc(item.fixture)}</strong><span>${esc(item.winner)}</span><small>${esc(item.venue||"Venue not specified")} | ${esc(item.completedAt)}</small></div>`).join(""):'<div class="feed-line empty">Completed matches will appear here.</div>');
}

function updateScoringAvailability(){
const allowed=canScore();
document.querySelectorAll(".buttons button").forEach((button)=>{button.disabled=!allowed;});
const inningsAction=el("inningsAction");
if(inningsAction){
inningsAction.disabled=!allowed||state.match.isComplete;
inningsAction.textContent=state.match.isComplete?"Match Finished":state.match.innings===1&&!state.match.inningsClosed?"End 1st Innings":state.match.innings===1?"Start 2nd Innings":"2nd Innings Live";
}
const endMatchButton=el("endMatchButton");
if(endMatchButton)endMatchButton.disabled=!allowed||state.match.isComplete;
}

function render(){
if(!state.ready)return;
updateStorageHint();
const hasViewer=Boolean(state.viewer);
const hasMatch=Boolean(state.match.teamA);
const user=currentUser();
const canSchedule=Boolean(user&&(user.role==="admin"||user.permission==="write"));
if(!hasViewer){show("accessPanel");hide("setupPanel");hide("matchArea");}
else if(state.awaitingLiveView&&hasMatch){show("accessPanel");hide("setupPanel");hide("matchArea");}
else if(hasMatch){hide("accessPanel");hide("setupPanel");show("matchArea","grid");}
else if(canSchedule){hide("accessPanel");show("setupPanel");hide("matchArea");}
else{hide("accessPanel");hide("setupPanel");show("matchArea","grid");}

txt("fixtureTitle",hasMatch?`${state.match.teamA} vs ${state.match.teamB}`:"Team A vs Team B");
txt("matchMeta",hasMatch?`${state.match.venue} | ${state.match.totalOvers} overs | ${state.match.maxWickets} wickets | Toss: ${state.match.tossWinner||"-"} chose ${state.match.tossDecision||"-"}`:"Venue | 20 overs");
txt("battingTeam",state.match.battingTeam||"Team A");
txt("inningLabel",`Innings ${state.match.innings}`);
txt("score",`${state.match.score}/${state.match.wickets}`);
txt("oversDisplay",oversText(state.match.balls));
txt("runRate",runRate(state.match.score,state.match.balls));
txt("targetDisplay",state.match.target?`${state.match.target} to win`:"Set after 1st innings");
txt("liveLastManStatus",state.match.lastManStanding?"ON":"OFF");
txt("ballsLeft",`${ballsLeft()}`);
txt("resultText",state.match.result);
txt("firstInningsScore",state.match.firstInnings?`${state.match.firstInnings.team}: ${state.match.firstInnings.score}/${state.match.firstInnings.wickets}`:"Not started");
if(!state.match.target||state.match.innings===1){txt("requiredRate","-");txt("chaseEquation","Waiting for target");}
else{
const needed=Math.max(state.match.target-state.match.score,0);
txt("requiredRate",ballsLeft()?((needed*6)/ballsLeft()).toFixed(2):"0.00");
txt("chaseEquation",needed>0?`${state.match.battingTeam} need ${needed} from ${ballsLeft()} balls`:"Target achieved");
}
txt("inningsMessage",!hasMatch?"Waiting for an admin to create or resume a match.":state.match.isComplete?state.match.result:state.match.innings===1?`${state.match.battingTeam||"Team A"} are setting the target.`:`${state.match.battingTeam||"Team B"} are chasing ${state.match.target||"-"}.`);
txt("matchStatus",!hasMatch?"Waiting for match":state.match.isComplete?"Match Complete":state.match.inningsClosed?"Innings Break":state.match.innings===1?"1st Innings Live":"2nd Innings Live");
renderRecentBalls();
renderLiveFeed();
renderCommentary();
renderAdminPanel();
renderHistory();
renderRoleView(hasMatch);
updateScoringAvailability();
}

window.toggleAdminLogin=toggleAdminLogin;
window.grantAccess=grantAccess;
window.addAllowedViewer=addAllowedViewer;
window.removeAllowedViewer=removeAllowedViewer;
window.updateUserPermission=updateUserPermission;
window.saveSetupDetails=saveSetupDetails;
window.backToSetupDetails=backToSetupDetails;
window.startMatch=startMatch;
window.recordBall=recordBall;
window.recordRunout=recordRunout;
window.undoLastAction=undoLastAction;
window.changeInnings=changeInnings;
window.startNewMatch=startNewMatch;
window.toggleCommentary=toggleCommentary;
window.logoutUser=logoutUser;
window.goBack=goBack;
window.viewLiveMatch=viewLiveMatch;
window.refreshLiveMatch=refreshLiveMatch;
window.requestControl=requestControl;
window.approveControlRequest=approveControlRequest;
window.openRunoutModal=openRunoutModal;
window.closeRunoutModal=closeRunoutModal;
window.openByesModal=openByesModal;
window.closeByesModal=closeByesModal;
window.closeStatusModal=closeStatusModal;
window.openEndMatchModal=openEndMatchModal;
window.closeEndMatchModal=closeEndMatchModal;
window.confirmEndMatch=confirmEndMatch;
window.recordByes=recordByes;

void hydrate();

