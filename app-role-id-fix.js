/* Attendly client. Database authorization is enforced by Supabase RLS, not just UI roles. */
(function () {
  "use strict";
  const SUPABASE_URL = "https://ysgiqxzexvbmwuzuywmc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_zhL5wtEyFOhDl61_XAB85A_hsxUbsZ8";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyB-icF6zYcvQLKM6ne9OtyzlAOKwbDWMAY",
    authDomain: "attendly-web-68887.firebaseapp.com",
    projectId: "attendly-web-68887",
    storageBucket: "attendly-web-68887.firebasestorage.app",
    messagingSenderId: "516599149981",
    appId: "1:516599149981:web:b2761faa72d946116c2b74",
    measurementId: "G-T7DGBFPP64"
  };
  const FCM_VAPID_PUBLIC_KEY = "BBgAL81ytb2NgcWpuyTZIyxaKpIU-lzT7FJ2kwjCM9YDXKds6hwkFy_pUkG60lxSNf-wudR_WpT8yBZS2CeBhFk";
  let fcmMessaging = null;
  try { if (window.firebase && !window.firebase.apps.length) window.firebase.initializeApp(FIREBASE_CONFIG); if (window.firebase && window.firebase.messaging.isSupported()) fcmMessaging = window.firebase.messaging(); } catch (e) { console.warn("FCM unavailable", e); }
  async function enablePushNotifications() {
    if (!state.user) throw new Error("Sign in first to enable notifications.");
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !fcmMessaging) throw new Error("Push notifications are not supported in this browser. Try Chrome on Android.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted.");
    const registration = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
    const token = await fcmMessaging.getToken({ vapidKey: FCM_VAPID_PUBLIC_KEY, serviceWorkerRegistration: registration });
    if (!token) throw new Error("Firebase did not return a device token.");
    const tokenRow = { user_id: state.user.id, token, platform: "web", updated_at: new Date().toISOString() };
    const { error } = await sb.from("fcm_device_tokens").upsert(tokenRow, { onConflict: "user_id,token" });
    if (error) throw error;
    toast("Notifications enabled on this device.");
  }

  const $ = (id) => document.getElementById(id);
  const state = { user: null, profile: null, view: "overview", cache: { people: [], classes: [], subjects: [], assignments: [], enrollments: [], records: [] }, authMode: "login", reportRows: [], chartEvents: [] };
  const escapeHtml = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  const fmtDate = (v) => v ? new Date(v + "T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "—";
  const initials = (s) => String(s || "A").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();
  const toast = (message, type="success") => { const n=document.createElement("div"); n.className="toast "+type; n.textContent=message; $("toast-region").append(n); setTimeout(()=>n.remove(),4500); };
  const alertBox = (message,type="info") => { $("page-alert").innerHTML=message?`<div class="alert alert-${type}">${escapeHtml(message)}</div>`:""; };
  const panel = (title, subtitle, inner, right="") => `<section class="panel"><div class="panel-header"><div><h2 class="panel-title">${title}</h2>${subtitle?`<p class="panel-subtitle">${subtitle}</p>`:""}</div>${right}</div>${inner}</section>`;
  const button = (label, action, cls="button button-primary", attrs="") => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
  const empty = (title, detail, icon="◷") => `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
  const badge = (status) => `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
  const table = (headers, rows, emptyTitle="No records yet", emptyText="Records will appear here when you add them.") => `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.length?rows.join(""):`<tr><td colspan="${headers.length}">${empty(emptyTitle,emptyText)}</td></tr>`}</tbody></table></div>`;
  const stat = (label, value, note, icon) => `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${note}</div></article>`;
  const field = (id,label,type="text",placeholder="",required=true,value="") => `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" placeholder="${placeholder}" ${required?"required":""} value="${escapeHtml(value)}"></div>`;
  const select = (id,label,options,placeholder="Choose an option",value="") => `<div class="field"><label for="${id}">${label}</label><select id="${id}" name="${id}" ${value===""?"required":""}><option value="">${placeholder}</option>${options.map(o=>`<option value="${escapeHtml(o.value)}" ${String(o.value)===String(value)?"selected":""}>${escapeHtml(o.label)}</option>`).join("")}</select></div>`;
  function showAuth(message="") { $("auth-screen").classList.remove("hidden");$("app-screen").classList.add("hidden");if(message)toast(message,"error"); }
  function showApp() { $("public-home")?.classList.add("hidden");$("auth-screen").classList.add("hidden");$("app-screen").classList.remove("hidden"); }
  function setView(view) {
    const role=state.profile?.role || "student";
    if (["people","academics","governance","deleted-accounts"].includes(view) && role!=="admin") view="overview";
    if (view==="hod" && state.profile?.institutional_role!=="hod") view="overview";
    if (view==="people" && role!=="admin") view="overview";
    state.view=view;
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
    $("sidebar").classList.remove("mobile-open");$("sidebar-scrim").classList.remove("visible");
    renderView().catch(e=>{console.error(e);alertBox(e.message||"Could not load this page.","error");});
  }
  function setHeading(title,desc,eyebrow="YOUR SCHOOL AT A GLANCE",actions="") {
    $("page-title").textContent=title;$("page-description").textContent=desc;$("page-eyebrow").textContent=eyebrow;
    $("breadcrumb-current").textContent=title;$("heading-actions").innerHTML=actions;
  }
  function person(id) { return state.cache.people.find(p=>p.id===id); }
  function personName(id) { const p=person(id); return p?.full_name || p?.email || "Unknown user"; }
  function classById(id) { return state.cache.classes.find(c=>c.id===id); }
  function className(id) { const c=classById(id); return c ? `${c.name}${c.section?` · ${c.section}`:""}` : "Class unavailable"; }
  function subjectName(id) { return state.cache.subjects.find(s=>s.id===id)?.name || "Subject unavailable"; }
  function assignment(id) { return state.cache.assignments.find(a=>a.id===id); }
  function assignedClassSubject(id) { const a=assignment(id);return a?`${className(a.class_id)} · ${subjectName(a.subject_id)}`:"Unknown subject"; }
  function dateLabel() { $("today-label").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}); }
  async function loadCache() {
    const role=state.profile.role, uid=state.user.id;
    const [classes,subjects,assignments,enrollments,people,records,courses,courseSubjects]=await Promise.all([
      sb.from("classes").select("*").order("name"),
      sb.from("subjects").select("*").order("name"),
      sb.from("class_subjects").select("*"),
      sb.from("enrollments").select("*"),
      sb.from("profiles").select("*").order("full_name"),
      sb.from("attendance_records").select("*").order("attendance_date",{ascending:false}).limit(1500),
      sb.from("courses").select("id,name,code,department,duration_years,active").eq("active",true).order("name"),
      sb.from("course_subjects").select("id,course_id,subject_id,semester")
    ]);
    const errors=[classes,subjects,assignments,enrollments,people,records,courses,courseSubjects].filter(x=>x.error);
    if(errors.length) throw new Error(errors.map(x=>x.error.message).join(" · "));
    state.cache={classes:classes.data||[],subjects:subjects.data||[],assignments:assignments.data||[],enrollments:enrollments.data||[],people:people.data||[],records:records.data||[],courses:courses.data||[],courseSubjects:courseSubjects.data||[]};
    if(role==="student" && state.profile.institutional_role!=="hod") {
      state.cache.people=state.cache.people.filter(p=>p.id===uid);
    } else if(role==="teacher" && state.profile.institutional_role!=="hod") {
      const assignedClassIds=new Set(state.cache.assignments.filter(a=>a.teacher_id===uid).map(a=>a.class_id));
      const relevantStudentIds=new Set(state.cache.enrollments.filter(e=>assignedClassIds.has(e.class_id)).map(e=>e.student_id));
      state.cache.people=state.cache.people.filter(p=>p.id===uid || (p.role==="student" && relevantStudentIds.has(p.id)));
    }
    if(role==="student" && state.profile.institutional_role!=="hod") {
      const enrolledClassIds=new Set(state.cache.enrollments.filter(e=>e.student_id===uid).map(e=>e.class_id));
      state.cache.assignments=state.cache.assignments.filter(a=>enrolledClassIds.has(a.class_id));
      state.cache.classes=state.cache.classes.filter(c=>enrolledClassIds.has(c.id));
      const matchedCourse=(state.cache.courses||[]).find(course=>(state.profile.course_id&&course.id===state.profile.course_id)||(!state.profile.course_id&&state.profile.course_name&&String(course.name).trim().toLowerCase()===String(state.profile.course_name).trim().toLowerCase()));
      const courseSubjectIds=(state.cache.courseSubjects||[]).filter(cs=>matchedCourse&&cs.course_id===matchedCourse.id&&(state.profile.semester==null||cs.semester===state.profile.semester)).map(cs=>cs.subject_id);
      const subjectIds=new Set([...state.cache.assignments.map(a=>a.subject_id),...courseSubjectIds]);
      state.cache.subjects=state.cache.subjects.filter(s=>subjectIds.has(s.id));
      state.cache.enrollments=state.cache.enrollments.filter(e=>e.student_id===uid);
      state.cache.records=state.cache.records.filter(r=>r.student_id===uid);
    } else if(role==="teacher") {
      const assignedIds=new Set(state.cache.assignments.filter(a=>a.teacher_id===uid).map(a=>a.id));
      state.cache.assignments=state.cache.assignments.filter(a=>a.teacher_id===uid);
      const assignedClasses=new Set(state.cache.assignments.map(a=>a.class_id));
      state.cache.classes=state.cache.classes.filter(c=>assignedClasses.has(c.id));
      const subjectIds=new Set(state.cache.assignments.map(a=>a.subject_id));
      state.cache.subjects=state.cache.subjects.filter(s=>subjectIds.has(s.id));
      state.cache.enrollments=state.cache.enrollments.filter(e=>assignedClasses.has(e.class_id));
      state.cache.records=state.cache.records.filter(r=>assignedIds.has(r.class_subject_id));
    }
  }
  function profileLoaded(p) {
    state.profile=p;
    const display=p.full_name||state.user.email.split("@")[0];
    const displayRole=p.role==="admin"?"Admin":p.institutional_role==="hod"?"HOD":p.role==="teacher"?"Teacher":"Student";
    $("side-name").textContent=display;$("side-role").textContent=displayRole;$("side-avatar").textContent=initials(display);$("top-name").textContent=display;$("top-role").textContent=displayRole;$("top-avatar").textContent=initials(display);dateLabel();
    document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",p.role!=="admin"));
    document.querySelectorAll(".hod-only").forEach(el=>el.classList.toggle("hidden",p.institutional_role!=="hod"));
    const role=String(p.role||"").trim().toLowerCase();
    const institutionalRole=String(p.institutional_role||"").trim().toLowerCase();
    document.querySelectorAll(".student-only").forEach(el=>el.classList.toggle("hidden",role!=="student"));
    document.querySelectorAll(".certificate-review-only").forEach(el=>el.classList.toggle("hidden",!(role==="admin"||institutionalRole==="hod")));
    // Role-specific workspace navigation: admin gets institution modules; teachers and students get their own views.
    document.querySelectorAll(".nav-item[data-view]").forEach(el=>{
      const view=el.dataset.view;
      const role=String(p.role||"").trim().toLowerCase();
      const institutionalRole=String(p.institutional_role||"").trim().toLowerCase();
      const allowed=role==="admin"
        ? ["overview","attendance","people","deleted-accounts","academics","governance","reports","complaints","certificate-requests-admin"].includes(view)
        : institutionalRole==="hod"
          ? ["overview","attendance","reports","complaints","hod","certificate-requests-hod"].includes(view)
          : (role==="teacher" || role==="student")
            && ["overview","attendance","reports","complaints",...(role==="student"?["services"]:[])].includes(view);
      el.classList.toggle("hidden",!allowed);
    });
    showApp();
  }
  async function loadSession(user) {
    state.user=user;
    const {data,error}=await sb.from("profiles").select("*").eq("id",user.id).maybeSingle();
    if(error) { showAuth("Could not load your profile: "+error.message);return; }
    if(!data) { showAuth("Your profile was not found. Confirm your email or ask an administrator to check your account.");return; }
    if(data.is_active===false) { state.user=null; state.profile=null; await sb.auth.signOut(); showAuth("This account is inactive. Contact an administrator."); return; }
    if(data.role==="student" && data.enrollment_status!=="approved") { await sb.auth.signOut(); showAuth("Your student account is "+(data.enrollment_status==="rejected"?"not approved. Contact your HOD.":"waiting for HOD course-enrollment approval.")+" You can log in after approval."); return; }
    profileLoaded(data);
    try { await loadCache(); setView(state.view); }
    catch(err) { console.error(err); showApp(); alertBox("Database error: "+err.message,"error"); }
  }
  async function renderHodDashboard() {
    const role=state.profile.role, institutional=state.profile.institutional_role;
    if(institutional!=="hod"){setView("overview");return;}
    setHeading("HOD Department Dashboard","Department attendance, faculty coverage and academic approvals.","HEAD OF DEPARTMENT");
    const dept=state.profile.department||"Department not assigned";
    const allAssignments=state.cache.assignments;
    const deptAssignments=allAssignments.filter(a=>!state.profile.department||!a.department||a.department===state.profile.department);
    const relevantIds=new Set(deptAssignments.map(a=>a.id));
    const records=state.cache.records.filter(r=>relevantIds.has(r.class_subject_id));
    const students=new Set(state.cache.enrollments.filter(e=>deptAssignments.some(a=>a.class_id===e.class_id)).map(e=>e.student_id));
    const present=records.filter(r=>r.status==="present"||r.status==="late").length;
    const pct=records.length?Math.round(present/records.length*100):0;
    const low=[];
    for(const sid of students){
      const sr=records.filter(r=>r.student_id===sid);
      if(sr.length){const attended=sr.filter(r=>r.status==="present"||r.status==="late").length;const p=Math.round(attended/sr.length*100);if(p<75)low.push({sid,p,total:sr.length});}
    }
    const [{data:condonations,error:condonationError},{data:leaves,error:leaveError},{data:applications,error:applicationError},{data:legacyReviews,error:legacyReviewError},{data:courses,error:coursesError}]=await Promise.all([
      sb.from("condonation_requests").select("id,student_id,class_subject_id,request_type,from_date,to_date,reason,status,created_at").eq("status","pending").order("created_at",{ascending:false}).limit(100),
      sb.from("leave_requests").select("id,student_id,class_id,from_date,to_date,reason,status,created_at").eq("status","pending").order("created_at",{ascending:false}).limit(100),
      sb.from("course_enrollment_applications").select("id,student_id,course_id,requested_semester,created_at").eq("status","pending").order("created_at",{ascending:false}).limit(100),
      sb.rpc("list_department_enrollment_reviews"),
      sb.from("courses").select("id,name,code,department,duration_years,active").order("name")
    ]);
    if(condonationError)console.warn("HOD condonation requests:",condonationError.message);
    if(leaveError)console.warn("HOD leave requests:",leaveError.message);
    const pendingCondonations=(condonations||[]).filter(x=>deptAssignments.some(a=>a.id===x.class_subject_id));
    const deptClassIds=new Set(deptAssignments.map(a=>a.class_id));
    const pendingLeaves=(leaves||[]).filter(x=>deptClassIds.has(x.class_id));
    const approvalRows=[
      ...pendingCondonations.map(x=>'<tr><td>Condonation · '+escapeHtml(x.request_type)+'</td><td>'+escapeHtml(personName(x.student_id))+'</td><td>'+escapeHtml(x.from_date+' – '+x.to_date)+'</td><td>'+escapeHtml(x.reason)+'</td><td><button class="button button-small" data-action="hod-approval" data-kind="condonation" data-id="'+x.id+'" data-status="approved">Approve</button> <button class="button button-small button-secondary" data-action="hod-approval" data-kind="condonation" data-id="'+x.id+'" data-status="rejected">Reject</button></td></tr>'),
      ...pendingLeaves.map(x=>'<tr><td>Leave request</td><td>'+escapeHtml(personName(x.student_id))+'</td><td>'+escapeHtml(x.from_date+' – '+x.to_date)+'</td><td>'+escapeHtml(x.reason)+'</td><td><button class="button button-small" data-action="hod-approval" data-kind="leave" data-id="'+x.id+'" data-status="approved">Approve</button> <button class="button button-small button-secondary" data-action="hod-approval" data-kind="leave" data-id="'+x.id+'" data-status="rejected">Reject</button></td></tr>')
    ];
    if(applicationError)console.warn("Course applications:",applicationError.message);
    if(legacyReviewError)console.warn("Department enrollment reviews:",legacyReviewError.message);
    if(coursesError)console.warn("Courses:",coursesError.message);
    const normalizeDept=value=>String(value||"").trim().toLowerCase().replace(/[^a-z0-9]+/g," ");
    const deptCourses=(courses||[]).filter(x=>state.profile.role==="admin"||normalizeDept(x.department)===normalizeDept(dept));
    const pendingApps=(applications||[]).filter(x=>deptCourses.some(y=>y.id===x.course_id));
    const legacyRows=(legacyReviews||[]).map(x=>{const status=x.enrollment_status||"pending";const decision=status==="approved"?'<span class="badge badge-present">Approved — login enabled</span>':'<button class="button button-small" data-action="legacy-enrollment-review" data-id="'+x.student_id+'" data-status="approved">Approve login</button> <button class="button button-small button-secondary" data-action="legacy-enrollment-review" data-id="'+x.student_id+'" data-status="rejected">Reject</button>';return '<tr><td>'+escapeHtml(x.full_name||x.email||"Student")+'</td><td>'+escapeHtml(x.course_name||"Course not assigned")+'</td><td>'+escapeHtml(String(x.requested_semester||"—"))+'</td><td>'+escapeHtml(status)+'</td><td>'+decision+'</td></tr>';});
    const approvedStudentRows=(legacyReviews||[]).filter(x=>(x.enrollment_status||"pending")==="approved").map(x=>'<tr><td>'+escapeHtml(x.full_name||"Student")+'</td><td>'+escapeHtml(x.email||"—")+'</td><td>'+escapeHtml(x.course_name||"Course not assigned")+'</td><td>'+escapeHtml(String(x.requested_semester||"—"))+'</td><td><span class="badge badge-present">Approved — login enabled</span></td></tr>');
    const appRows=pendingApps.map(x=>{const course=deptCourses.find(y=>y.id===x.course_id);return '<tr><td>'+escapeHtml(personName(x.student_id))+'</td><td>'+escapeHtml(course?.name||"Course")+'</td><td>'+x.requested_semester+'</td><td><button class="button button-small" data-action="course-application-review" data-id="'+x.id+'" data-status="approved">Approve login</button> <button class="button button-small button-secondary" data-action="course-application-review" data-id="'+x.id+'" data-status="rejected">Reject</button></td></tr>';});
    const deptCourseRows=deptCourses.map(x=>'<tr><td>'+escapeHtml(x.name)+'</td><td>'+escapeHtml(x.code)+'</td><td>'+escapeHtml(x.department)+'</td><td>'+x.duration_years+'</td><td><span class="badge badge-'+(x.active?'present':'absent')+'">'+(x.active?'Active':'Closed')+'</span><div style="margin-top:6px"><button class="button button-small '+(x.active?'button-secondary':'button-outline')+'" data-action="hod-course-active" data-id="'+x.id+'" data-active="'+(x.active?'true':'false')+'">'+(x.active?'Close course':'Reopen course')+'</button></div></td></tr>');
    const {data:courseSubjectData,error:courseSubjectError}=await sb.rpc("hod_list_course_subjects");
    if(courseSubjectError) console.warn("Course subjects:",courseSubjectError.message);
    const courseSubjectRows=(courseSubjectData||[]).filter(x=>deptCourses.some(c=>c.id===x.course_id)).map(x=>'<tr><td>'+escapeHtml(x.course_name)+' ('+escapeHtml(x.course_code)+')</td><td>'+escapeHtml(String(x.semester))+'</td><td>'+escapeHtml(x.subject_name)+'</td><td>'+escapeHtml(x.subject_code)+'</td></tr>');
    const subjectCourseOptions=deptCourses.filter(c=>c.active!==false).map(c=>'<option value="'+c.id+'">'+escapeHtml(c.name)+' ('+escapeHtml(c.code)+')</option>').join("");
    const courseSubjectForm='<form id="hod-course-subject-form" class="form-grid"><label>Course<select name="course_id" required><option value="">Choose course</option>'+subjectCourseOptions+'</select></label><label>Subject name<input name="subject_name" required maxlength="120" placeholder="e.g. Data Structures"></label><label>Subject code<input name="subject_code" required maxlength="20" placeholder="e.g. BCA201"></label><label>Semester<input name="semester" type="number" min="1" max="12" value="1" required></label><button class="button button-primary" type="submit" '+(subjectCourseOptions?'':'disabled')+'>Add subject to course</button></form>';
    const assignableCourses=deptCourses.filter(c=>c.active!==false);
    const {data:assignableData,error:assignableError}=await sb.rpc("hod_list_assignable_students");
    if(assignableError) console.error("HOD assignable students RPC failed:",assignableError.message);
    const assignableStudents=(assignableError ? (state.cache.people||[]).filter(p=>String(p.role||"").trim().toLowerCase()==="student" && (!p.department || !String(p.department).trim() || String(p.department).trim().toLowerCase()===String(dept||"").trim().toLowerCase() || !p.course_id || !assignableCourses.some(c=>String(c.id)===String(p.course_id)))) : (assignableData||[])).sort((x,y)=>(x.full_name||"").localeCompare(y.full_name||""));
    const assignmentRows=assignableStudents.map(p=>{const opts='<option value="">Choose course</option>'+assignableCourses.map(c=>'<option value="'+c.id+'" '+(p.course_id===c.id?'selected':'')+'>'+escapeHtml(c.name)+' ('+escapeHtml(c.code)+')</option>').join("");return '<tr><td>'+escapeHtml(p.full_name||p.email||"Student")+'<small style="display:block">'+escapeHtml(p.student_number||"")+'</small></td><td>'+escapeHtml(p.department||"Not assigned")+'</td><td>'+escapeHtml(p.course_name||"Not assigned")+'</td><td><select class="inline-select" data-course-for="'+p.id+'">'+opts+'</select></td><td><input class="inline-select" style="width:75px" type="number" min="1" max="12" value="'+escapeHtml(String(p.semester||1))+'" data-semester-for="'+p.id+'" aria-label="Semester"></td><td><button class="button button-small" data-action="hod-assign-student" data-id="'+p.id+'">Assign</button></td></tr>';});
    const courseForm='<form id="hod-course-form" class="form-grid"><label>Course name<input name="name" required maxlength="120" placeholder="Bachelor of Computer Applications"></label><label>Course code<input name="code" required maxlength="20" placeholder="BCA"></label><label>Department<input name="department" required maxlength="100" value="'+escapeHtml(dept==="Department not assigned"?"":dept)+'" readonly></label><label>Duration in years<input name="duration_years" type="number" min="1" max="8" value="3" required></label><button class="button" type="submit">Create course</button></form>';
    const cards=[stat("Students",students.size,"In department enrollments","♙"),stat("Courses",deptAssignments.length,"Assigned course subjects","▤"),stat("Attendance",records.length?pct+"%":"—",records.length+" recorded entries","◷"),stat("Below 75%",low.length,"Students needing review","!")].join("");
    const lowRows=low.sort((a,b)=>a.p-b.p).slice(0,25).map(x=>'<tr><td>'+escapeHtml(personName(x.sid))+'</td><td>'+escapeHtml(person(x.sid)?.student_number||"—")+'</td><td>'+x.p+'%</td><td>'+x.total+'</td><td><span class="badge badge-absent">Review</span></td></tr>');
    const courseRows=deptAssignments.map(a=>{const rr=records.filter(r=>r.class_subject_id===a.id);const att=rr.filter(r=>r.status==="present"||r.status==="late").length;return '<tr><td>'+escapeHtml(className(a.class_id))+'</td><td>'+escapeHtml(subjectName(a.subject_id))+'</td><td>'+escapeHtml(personName(a.teacher_id))+'</td><td>'+rr.length+'</td><td>'+(rr.length?Math.round(att/rr.length*100)+"%":"—")+'</td></tr>';});
    $("page-content").innerHTML='<div class="stats-grid">'+cards+'</div>'
      +panel("Course enrollment requests","New course applications waiting for a decision",table(["STUDENT","COURSE","SEMESTER","DECISION"],appRows,"No pending applications","No new course applications for this department."))
      +panel("Student account enrollment review","Review students awaiting approval or previously rejected.",table(["STUDENT","COURSE","SEMESTER","STATUS / DECISION"],legacyRows,"No pending student reviews","No students are waiting for a decision."))
      +panel("Approved students","Students whose department enrollment has been approved and can log in.",table(["STUDENT","EMAIL","COURSE","SEMESTER","LOGIN STATUS"],approvedStudentRows,"No approved students","Approved student accounts will appear here."))
      +panel("Assign student department & course","Assign students only within your HOD department: "+escapeHtml(dept),table(["STUDENT","CURRENT DEPARTMENT","CURRENT COURSE","ASSIGN COURSE","SEMESTER","ACTION"],assignmentRows,"No students to assign","Students already assigned to another department are not shown."))
      +panel("Create course","Publish a course for student registration",courseForm)
      +panel("Department courses","Courses available for student registration. HOD can close or reopen courses here.",table(["COURSE","CODE","DEPARTMENT","YEARS","STATUS / ACTION"],deptCourseRows,"No courses","Create courses through the course management workflow."))
      +panel("Course-wise subjects","Add and view subjects separately for each course and semester.",courseSubjectForm+table(["COURSE","SEMESTER","SUBJECT","SUBJECT CODE"],courseSubjectRows,"No subjects added","Choose a course and add its first subject above."))
      +panel("Pending approvals","Department leave and condonation requests",table(["REQUEST","STUDENT","DATES","REASON","DECISION"],approvalRows,"No pending requests","There are no pending requests right now."))
      +panel("Attendance shortage watchlist","Students below the default 75% threshold",table(["STUDENT","ROLL NO.","ATTENDANCE","RECORDS","STATUS"],lowRows,"No shortage records","No students currently fall below the threshold based on available records."))
      +panel("Course & faculty monitoring","Attendance coverage by assigned class subject",table(["CLASS","SUBJECT","FACULTY","ENTRIES","PRESENT RATE"],courseRows,"No course assignments","Ask an administrator to assign class subjects and faculty."));
  }
  async function renderGovernance() {
    if(state.profile.role!=="admin"){setView("overview");return;}
    setHeading("Governance & compliance","Review audit events, attendance anomalies, duty-leave batches and alert policies.","ENTERPRISE CONTROL CENTER");
    $("page-content").innerHTML=empty("Loading governance data","Fetching protected compliance records.","◈");
    const results=await Promise.all([
      sb.from("governance_audit_events").select("*").order("occurred_at",{ascending:false}).limit(30),
      sb.from("attendance_anomaly_flags").select("*").order("created_at",{ascending:false}).limit(30),
      sb.from("duty_leave_batches").select("*").order("created_at",{ascending:false}).limit(20),
      sb.from("attendance_alert_rules").select("*").order("created_at",{ascending:false}).limit(20),
      sb.from("role_permissions").select("*").order("institutional_role")
    ]);
    const labels=["Audit events","Anomaly flags","Duty leave batches","Alert rules","Role permissions"];
    const errors=results.map((r,i)=>r.error?labels[i]+": "+r.error.message:null).filter(Boolean);
    const [audit,anomalies,duty,rules,perms]=results.map(r=>r.data||[]);
    const cards=[stat("Audit events",audit.length,"Latest 30 shown","◷"),stat("Open anomalies",anomalies.filter(x=>x.status==="open"||x.status==="investigating").length,"Need review","!"),stat("Pending duty leave",duty.filter(x=>x.status==="pending").length,"Awaiting approval","▣"),stat("Enabled alert rules",rules.filter(x=>x.enabled).length,"Configured rules","↗")].join("");
    const auditRows=audit.map(x=>'<tr><td>'+escapeHtml((x.occurred_at||"").replace("T"," ").slice(0,19))+'</td><td>'+escapeHtml(x.table_name)+'</td><td>'+escapeHtml(x.operation)+'</td><td>'+escapeHtml(personName(x.actor_id))+'</td><td>'+escapeHtml(x.actor_role||"—")+'</td><td>'+escapeHtml(x.record_id)+'</td></tr>');
    const anomalyRows=anomalies.map(x=>'<tr><td>'+escapeHtml(x.anomaly_type)+'</td><td>'+escapeHtml(x.severity)+'</td><td>'+escapeHtml(personName(x.student_id))+'</td><td>'+escapeHtml(x.status)+'</td><td>'+escapeHtml(JSON.stringify(x.details||{}).slice(0,180))+'</td><td>'+(x.status==="open"||x.status==="investigating"?'<button class="button button-outline" data-action="anomaly-status" data-id="'+escapeHtml(x.id)+'" data-status="'+(x.status==="open"?"investigating":"resolved")+'">'+(x.status==="open"?"Investigate":"Resolve")+'</button>':"—")+'</td></tr>');
    const dutyRows=duty.map(x=>'<tr><td>'+escapeHtml(x.title)+'</td><td>'+escapeHtml(x.event_type)+'</td><td>'+escapeHtml(x.start_date)+' – '+escapeHtml(x.end_date)+'</td><td>'+escapeHtml(x.status)+'</td><td>'+escapeHtml(String((x.student_ids||[]).length))+'</td><td>'+(x.status==="pending"?'<button class="button button-outline" data-action="duty-status" data-id="'+escapeHtml(x.id)+'" data-status="approved">Approve</button> <button class="button button-outline" data-action="duty-status" data-id="'+escapeHtml(x.id)+'" data-status="rejected">Reject</button>':"—")+'</td></tr>');
    const ruleRows=rules.map(x=>'<tr><td>'+escapeHtml(x.name)+'</td><td>'+escapeHtml(x.threshold_percentage)+'%</td><td>'+escapeHtml(x.channel)+'</td><td>'+escapeHtml(x.audience)+'</td><td>'+escapeHtml(x.action_key)+'</td><td>'+(x.enabled?"Yes":"No")+'</td></tr>');
    const permRows=perms.map(x=>'<tr><td>'+escapeHtml(x.institutional_role)+'</td><td>'+escapeHtml(x.permission_key)+'</td><td>'+(x.enabled?"Enabled":"Disabled")+'</td></tr>');
    $("page-content").innerHTML='<div class="stats-grid">'+cards+'</div>'+(errors.length?'<div class="alert alert-error">'+errors.map(escapeHtml).join(" · ")+'</div>':"")
      +panel("Audit trail","Database-triggered record of attendance and enrollment changes",table(["TIMESTAMP","TABLE","ACTION","ACTOR","ROLE","RECORD"],auditRows,"No audit events yet","New attendance or enrollment changes will appear here."))
      +panel("Attendance anomaly review","Flags must be generated by a trusted workflow or integration",table(["TYPE","SEVERITY","STUDENT","STATUS","DETAILS","ACTION"],anomalyRows,"No anomalies","No flags have been recorded."))
      +panel("Group duty leave / OD","Review batch requests for placements, sports and official duties",table(["EVENT","TYPE","DATES","STATUS","STUDENTS","REVIEW"],dutyRows,"No duty-leave batches","Batch requests will appear here."))
      +panel("Escalation & alert rules","Actual email/SMS/push delivery requires a provider and server-side worker",table(["RULE","THRESHOLD","CHANNEL","AUDIENCE","ACTION","ENABLED"],ruleRows,"No alert rules","No alert policies configured."))
      +panel("Role permission matrix","Permission catalog; backend enforcement still needs role-by-role RLS policies",table(["INSTITUTION ROLE","PERMISSION","STATUS"],permRows,"No permissions configured","Role permissions will appear here."));
  }
  async function renderDeletedAccounts() {
    if(state.profile.role!=="admin"){setView("overview");return;}
    setHeading("Deleted Accounts","Archived accounts are hidden from the active directory. Only the stored name and role are shown here.","ADMINISTRATION");
    const {data,error}=await sb.from("account_deletion_archive").select("original_name,original_role,archived_at").order("archived_at",{ascending:false});
    if(error) throw error;
    const studentArchives=(data||[]).filter(p=>String(p.original_role||"").toLowerCase()==="student");
    const rows=studentArchives.map(p=>`<tr><td>${escapeHtml(p.original_name||"Name unavailable")}</td><td>Student</td></tr>`);
    $("page-content").innerHTML=panel("Deleted accounts","Historical attendance and academic records are not deleted by this view.",table(["NAME","ROLE"],rows,"No archived accounts","Accounts appear here after an administrator archives them."));
  }
  const CERTIFICATE_TYPES = ["General Certificate","Bonafide Certificate","Railway Concession"];
  async function renderServices() {
    if(state.profile?.role!=="student"){setView("overview");return;}
    setHeading("Services","Apply for college certificates and track both required approvals.","STUDENT SERVICES");
    const {data,error}=await sb.from("certificate_requests").select("*").eq("student_id",state.user.id).order("created_at",{ascending:false});
    if(error) throw error;
    const rows=(data||[]).map(r=>`<tr><td><strong>${escapeHtml(r.certificate_type)}</strong><small>${escapeHtml(r.purpose||"No purpose supplied")}</small></td><td>${fmtDate(String(r.created_at||"").slice(0,10))}</td><td>${badge(r.status)}${r.status==="approved"&&r.pdf_status!=="ready"?`<br><small>${r.pdf_status==="failed"?"PDF generation failed":"PDF generating…"}</small>`:""}</td><td>${r.hod_approved?"✓ Approved":"Pending"}<br><small>HOD</small></td><td>${r.admin_approved?"✓ Approved":"Pending"}<br><small>Admin</small></td><td>${r.status==="approved"&&r.pdf_status==="ready"?'<button class="button button-primary button-small" data-action="download-certificate" data-id="'+r.id+'">Download PDF</button>':r.status==="approved"?'<button class="button button-secondary button-small" data-action="refresh-certificates">Refresh status</button>':"—"}</td></tr>`).join("");
    const cards=CERTIFICATE_TYPES.map((t,i)=>`<button class="service-card" data-action="new-certificate-request" data-type="${escapeHtml(t)}"><span class="service-icon">${["✓","▣","🚆"][i]}</span><strong>${escapeHtml(t)}</strong><small>Apply now →</small></button>`).join("");
    $("page-content").innerHTML=`<div class="service-grid">${cards}</div>${panel("My certificate requests","Your certificate becomes downloadable after HOD and Admin both approve it.",`<div class="table-wrap"><table><thead><tr><th>SERVICE / PURPOSE</th><th>REQUESTED</th><th>STATUS</th><th>HOD</th><th>ADMIN</th><th>DOCUMENT</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty-state">No certificate requests yet. Choose a service above to apply.</td></tr>'}</tbody></table></div>`) }`;
  }
  async function renderCertificateRequests() {
    const reviewRole=state.view==="certificate-requests-admin"?"admin":"hod";
    if(!(reviewRole==="admin"?state.profile?.role==="admin":state.profile?.institutional_role==="hod")){setView("overview");return;}
    setHeading(reviewRole==="admin"?"Admin Certificate Approvals":"HOD Certificate Approvals",
      reviewRole==="admin"?"Review student requests in the Admin approval queue.":"Review student requests in the HOD approval queue.",
      reviewRole==="admin"?"ADMIN SERVICES":"HOD SERVICES");
    const {data,error}=await sb.from("certificate_requests").select("*,student:profiles!certificate_requests_student_id_fkey(full_name,email,student_number,department,course_name,semester)").order("created_at",{ascending:false});
    if(error) throw error;
    const rows=(data||[]).map(r=>{
      const p=r.student||{};
      const own=reviewRole;
      const approved=own==="admin"?r.admin_approved:r.hod_approved;
      const canReview=r.status==="pending"&&!approved;
      return `<tr><td><strong>${escapeHtml(p.full_name||p.email||"Student")}</strong><small>${escapeHtml(p.student_number||"")}</small></td><td>${escapeHtml(p.department||"—")}<small>${escapeHtml(p.course_name||"")}</small></td><td><strong>${escapeHtml(r.certificate_type)}</strong><small>${escapeHtml(r.purpose||"—")}</small></td><td>${fmtDate(String(r.created_at||"").slice(0,10))}</td><td>${r.hod_approved?"Approved":"Pending"}</td><td>${r.admin_approved?"Approved":"Pending"}</td><td>${badge(r.status)}${r.rejection_reason?'<small>'+escapeHtml(r.rejection_reason)+'</small>':""}</td><td>${canReview?`<button class="button button-primary button-small" data-action="approve-certificate" data-id="${r.id}">Approve</button> <button class="button button-outline button-small" data-action="reject-certificate" data-id="${r.id}">Reject</button>`:r.status==="approved"?(r.pdf_status==="ready"?'<span class="text-muted">PDF ready</span>':r.pdf_status==="failed"?'<span class="text-muted">PDF failed</span>':'<span class="text-muted">PDF generating…</span>'):approved?"Approved by you":"—"}</td></tr>`;
    }).join("");
    $("page-content").innerHTML=panel("All certificate requests","Approving here records only your role's approval. The PDF is generated when both approvals are complete.",`<div class="table-wrap"><table><thead><tr><th>STUDENT</th><th>DEPARTMENT / COURSE</th><th>SERVICE / PURPOSE</th><th>REQUESTED</th><th>HOD</th><th>ADMIN</th><th>STATUS</th><th>YOUR ACTION</th></tr></thead><tbody>${rows||'<tr><td colspan="8" class="empty-state">No student certificate requests have been submitted.</td></tr>'}</tbody></table></div>`);
  }
  function openCertificateRequest(type) {
    if(state.profile?.role!=="student"||!CERTIFICATE_TYPES.includes(type)) throw new Error("Only students can apply for an available certificate service.");
    showModal("Apply for "+type,"STUDENT SERVICES",`<form class="certificate-request-form"><div class="certificate-request-summary"><span class="certificate-request-icon">${type==="General Certificate"?"✓":type==="Bonafide Certificate"?"✦":"▣"}</span><div><span class="certificate-summary-label">SELECTED SERVICE</span><strong>${escapeHtml(type)}</strong><small>College student service request</small></div></div><label class="certificate-purpose-field" for="certificate-purpose"><span>Purpose of request</span><small>Tell us where you need this certificate and why.</small><textarea id="certificate-purpose" maxlength="1000" rows="4" placeholder="Example: I need this certificate for scholarship / railway concession / official verification." required></textarea><small class="certificate-character-hint">Please provide a clear reason (up to 1,000 characters).</small></label><div class="certificate-approval-note"><span aria-hidden="true">ⓘ</span><p>Your request will be reviewed separately by your HOD and Admin. The PDF download becomes available after both approvals.</p></div><div class="form-actions certificate-form-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button type="submit" class="button button-primary">Submit request <span aria-hidden="true">→</span></button></div></form>`,async()=>{
      const purpose=$("certificate-purpose").value.trim();
      if(!purpose) throw new Error("Enter the purpose for this certificate.");
      const {error}=await sb.from("certificate_requests").insert({student_id:state.user.id,certificate_type:type,purpose});
      if(error) throw error;
      toast("Certificate request submitted.");
      await renderServices();
    });
  }
  async function downloadCertificate(id) {
    if(state.profile?.role!=="student") throw new Error("Only the owning student can download the certificate.");
    const {data:r,error}=await sb.from("certificate_requests").select("id,student_id,status,hod_approved,admin_approved,pdf_status").eq("id",id).eq("student_id",state.user.id).single();
    if(error) throw error;
    if(r.status!=="approved"||!r.hod_approved||!r.admin_approved) throw new Error("Certificate is available only after HOD and Admin approval.");
    if(r.pdf_status!=="ready") throw new Error("Your certificate PDF is still being generated. Refresh the status in a few seconds.");
    // Open a blank tab synchronously so mobile browsers do not block the download popup.
    const downloadTab=window.open("about:blank","_blank");
    try {
      const {data,error:fnError}=await sb.functions.invoke("certificate-pdf",{body:{action:"signed-url",request_id:id}});
      if(fnError) {
        const details=fnError.context && typeof fnError.context.json==="function" ? await fnError.context.clone().json().catch(()=>null) : null;
        throw new Error(details?.error || fnError.message || "Could not create secure download link.");
      }
      if(!data?.url) throw new Error(data?.error||"Secure download link could not be created.");
      if(downloadTab) downloadTab.location.replace(data.url);
      else window.location.assign(data.url);
    } catch (error) {
      if(downloadTab) downloadTab.close();
      throw error;
    }
  }


  async function renderView() {
    alertBox("");
    switch(state.view) {
      case "overview": return renderOverview();
      case "attendance": return renderAttendance();
      case "people": return renderPeople();
      case "academics": return renderAcademics();
      case "reports": return renderReports();
      case "complaints": return renderComplaints();
      case "governance": return renderGovernance();
      case "deleted-accounts": return renderDeletedAccounts();
      case "hod": return renderHodDashboard();
      case "services": return renderServices();
      case "certificate-requests": return renderCertificateRequests();
      case "certificate-requests-hod": return renderCertificateRequests();
      case "certificate-requests-admin": return renderCertificateRequests();
      default: return renderOverview();
    }
  }
  async function renderComplaints(){
    const isAdmin=state.profile?.role==="admin";
    setHeading("Complaint inbox",isAdmin?"Review complaints from students and staff, and track resolutions.":"Submit a complaint and follow its status.","STUDENT & STAFF SUPPORT");
    const form=isAdmin?"":panel("Submit a complaint","Describe the issue clearly. Admin can see your name and role.", '<form id="complaint-form" class="form-grid"><div class="field"><label for="complaint-subject">Subject</label><input id="complaint-subject" maxlength="160" required minlength="3" placeholder="Short summary of the issue"></div><div class="field"><label for="complaint-category">Category</label><select id="complaint-category" required><option>General</option><option>Attendance</option><option>Account/Login</option><option>Profile</option><option>Fees</option><option>Technical issue</option><option>Harassment/Safety</option><option>Other</option></select></div><div class="field"><label for="complaint-priority">Priority</label><select id="complaint-priority"><option value="medium" selected>Medium</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></div><div class="field" style="grid-column:1/-1"><label for="complaint-description">Description</label><textarea id="complaint-description" required minlength="5" maxlength="5000" rows="4" placeholder="Explain what happened and what help you need"></textarea></div><div><button class="button button-primary" type="submit">Submit complaint</button></div></form>');
    const result=await sb.from("complaints").select("id,sender_id,subject,category,description,priority,status,admin_response,created_at,updated_at").order("created_at",{ascending:false}).limit(300);
    if(result.error)throw result.error;
    const people=state.cache.people||[];
    const rows=(result.data||[]).map(r=>{
      const p=people.find(x=>String(x.id)===String(r.sender_id));
      const who=p?((p.full_name||p.email||"Account")+" · "+(p.institutional_role==="hod"||p.role==="hod"?"HOD":p.role==="admin"?"Admin":p.role==="teacher"?"Teacher":"Student")):(String(r.sender_id)===String(state.user.id)?(state.profile.full_name||state.user.email)+" · You":"Account");
      const statusControl=isAdmin?'<select data-action="complaint-status" data-id="'+escapeHtml(r.id)+'" aria-label="Complaint status"><option value="open" '+(r.status==="open"?"selected":"")+ '>Open</option><option value="in_progress" '+(r.status==="in_progress"?"selected":"")+ '>In progress</option><option value="resolved" '+(r.status==="resolved"?"selected":"")+ '>Resolved</option><option value="rejected" '+(r.status==="rejected"?"selected":"")+ '>Rejected</option></select>':badge(r.status);
      const response=isAdmin?'<div class="field"><label>Admin response</label><textarea data-response-for="'+escapeHtml(r.id)+'" rows="2" maxlength="2000" placeholder="Reply to the sender">'+escapeHtml(r.admin_response||"")+'</textarea><button class="button button-secondary" data-action="complaint-reply" data-id="'+escapeHtml(r.id)+'" type="button">Save response</button></div>':(r.admin_response?'<p><strong>Admin response:</strong> '+escapeHtml(r.admin_response)+'</p>':"");
      return '<tr><td>'+fmtDate(String(r.created_at||"").slice(0,10))+'</td><td><strong>'+escapeHtml(r.subject)+'</strong><small style="display:block">'+escapeHtml(r.category)+' · '+escapeHtml(r.priority)+'</small><p>'+escapeHtml(r.description)+'</p>'+response+'</td><td>'+escapeHtml(who)+'</td><td>'+statusControl+'</td></tr>';
    });
    $("page-content").innerHTML=form+panel(isAdmin?"Complaint inbox":"My complaints",isAdmin?"Review complaints from Students, Teachers and HODs. Admin accounts cannot submit complaints.":"Only your submitted complaints are visible to your account.",table(["DATE","COMPLAINT","SUBMITTED BY","STATUS"],rows,"No complaints yet","Submitted complaints will appear here."));
    if(!isAdmin) $("complaint-form")?.addEventListener("submit",async ev=>{ev.preventDefault();const btn=ev.target.querySelector('button[type="submit"]');const form=ev.target;if(btn){btn.disabled=true;btn.textContent="Submitting…";}try{if(!state.user?.id)throw new Error("Your session expired. Sign in again.");const payload={sender_id:state.user.id,subject:$("complaint-subject").value.trim(),category:$("complaint-category").value,description:$("complaint-description").value.trim(),priority:$("complaint-priority").value};const {data,error}=await sb.from("complaints").insert(payload).select("id").single();if(error)throw error;if(!data?.id)throw new Error("Complaint was not confirmed as saved.");toast(state.profile?.role==="admin"?"Your Admin complaint was submitted.":"Complaint submitted to Admin.");await renderComplaints();}catch(e){const msg=e.message||"Could not submit complaint.";toast(msg,"error");let err=form.querySelector(".complaint-submit-error");if(!err){err=document.createElement("p");err.className="alert alert-error complaint-submit-error";form.appendChild(err);}err.textContent=msg;if(btn){btn.disabled=false;btn.textContent="Submit complaint";}}});
  }
  function recentRows(records, showName=true) {
    return records.slice(0,7).map(r=>{
      const a=assignment(r.class_subject_id),p=person(r.student_id);
      return `<tr><td>${fmtDate(r.attendance_date)}</td><td><div class="student-cell"><span class="avatar">${initials(showName?personName(r.student_id):assignedClassSubject(r.class_subject_id))}</span><span><strong>${escapeHtml(showName?personName(r.student_id):assignedClassSubject(r.class_subject_id))}</strong><small>${escapeHtml(p?.student_number||p?.email||"Attendance record")}</small></span></div></td><td>${escapeHtml(a?subjectName(a.subject_id):"—")}</td><td>${badge(r.status)}</td></tr>`;
    });
  }
  function filteredRecords() {
    const role=state.profile.role,uid=state.user.id,institutional=state.profile.institutional_role;
    // Admin and HOD dashboards are institution-wide; teachers see only their assigned classes.
    if(role==="admin"||institutional==="hod"||role==="hod")return state.cache.records;
    return state.cache.records.filter(r=>(role==="student"&&r.student_id===uid)||(role==="teacher"&&state.cache.assignments.some(a=>a.id===r.class_subject_id&&a.teacher_id===uid)));
  }
  function drawBar(canvas, series) {
    if(!canvas)return;const rect=canvas.getBoundingClientRect();const ratio=window.devicePixelRatio||1;
    canvas.width=Math.max(1,rect.width*ratio);canvas.height=Math.max(1,rect.height*ratio);
    const ctx=canvas.getContext("2d");ctx.scale(ratio,ratio);const w=rect.width,h=rect.height;ctx.clearRect(0,0,w,h);
    const pad={l:34,r:12,t:12,b:27},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
    ctx.font="10px DM Sans, sans-serif";ctx.strokeStyle="#edf0f5";ctx.fillStyle="#8b96a8";ctx.lineWidth=1;
    for(let v=0;v<=100;v+=25){const y=pad.t+ch-(v/100)*ch;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(v+"%",2,y+3);}
    const gap=series.length?cw/series.length:0;
    series.forEach((s,i)=>{const barH=Math.max(2,ch*Math.max(0,Math.min(100,s.value))/100),x=pad.l+i*gap+gap*.22,bw=Math.min(30,gap*.56),y=pad.t+ch-barH;ctx.fillStyle="#e9edff";roundRect(ctx,x,y,bw,barH,5);ctx.fillStyle="#596fe7";roundRect(ctx,x,y,bw,barH,5);ctx.fillStyle="#8490a3";const label=s.label;ctx.textAlign="center";ctx.fillText(label,x+bw/2,h-7);});
  }
  function roundRect(ctx,x,y,w,h,r){if(h<=0)return;ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.fill();}
  function drawDonut(canvas, counts) {
    if(!canvas)return;const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;canvas.width=Math.max(1,rect.width*ratio);canvas.height=Math.max(1,rect.height*ratio);const ctx=canvas.getContext("2d");ctx.scale(ratio,ratio);
    const w=rect.width,h=rect.height,cx=w/2,cy=h/2,r=Math.min(w,h)*.43,inner=r*.68,total=counts.reduce((a,b)=>a+b.value,0)||1;const colors=["#2aa779","#ed7583","#e6b24e","#7e8df4"];let start=-Math.PI/2;
    counts.forEach((c,i)=>{const end=start+(c.value/total)*Math.PI*2;ctx.beginPath();ctx.arc(cx,cy,r,start,end);ctx.arc(cx,cy,inner,end,start,true);ctx.closePath();ctx.fillStyle=colors[i];ctx.fill();start=end;});
  }
  function renderOverview() {
    const role=state.profile.role,records=filteredRecords(),allToday=records.filter(r=>r.attendance_date===today()),present=allToday.filter(r=>r.status==="present"||r.status==="late").length;
    const attendancePct=allToday.length?Math.round(present/allToday.length*100):0;
    const studentCount=role==="student"?1:role==="teacher"?state.cache.people.filter(p=>p.role==="student").length:state.cache.people.filter(p=>p.role==="student").length;
    const classCount=role==="student"?state.cache.classes.length:role==="teacher"?new Set(state.cache.assignments.map(a=>a.class_id)).size:state.cache.classes.length;
    const subtitle=role==="student"?"Your attendance and class activity in one place.":role==="teacher"?"Your classes and today's recorded attendance.":role==="admin"?"Institution-wide attendance, people and academic activity at a glance.":"Here’s what’s happening with attendance today.";
    const recent=records.slice(0,8);
    let metrics=role==="student"
      ? [stat("My records",records.length,"Attendance entries","◷"),stat("Classes",classCount,"Enrolled classes","▤"),stat("Attended",records.filter(r=>["present","late"].includes(r.status)).length,"Present or late","✓"),stat("Overall attendance",records.length?Math.round(records.filter(r=>["present","late"].includes(r.status)).length/records.length*100)+"%":"—","Across recorded sessions","↗")]
      : role==="admin"
        ? [stat("Students",state.cache.people.filter(p=>p.role==="student").length,"Registered student profiles","♙"),stat("Teachers",state.cache.people.filter(p=>p.role==="teacher"&&p.institutional_role!=="hod").length,"Teaching staff accounts","▤"),stat("HODs",state.cache.people.filter(p=>p.institutional_role==="hod"||p.role==="hod").length,"Department heads","⌂"),stat("Classes",classCount,"Institution class groups","▦"),stat("Present today",allToday.filter(r=>r.status==="present").length,"Students marked present today","✓"),stat("Attendance rate",allToday.length?attendancePct+"%":"—",allToday.length+" student records today","↗")]
        : [stat("Students",studentCount,"Registered student profiles","♙"),stat("Classes",classCount,"Available to your role","▤"),stat("Present today",allToday.filter(r=>r.status==="present").length,"Today's marked present","✓"),stat("Attendance rate",allToday.length?attendancePct+"%":"—",allToday.length+" records for today","↗")];
    const hour=new Date().getHours();const greeting=hour<12?"Good morning":hour<17?"Good afternoon":"Good evening";const displayName=String(state.profile?.full_name||"").trim().split(/\s+/)[0];setHeading(`${greeting}${displayName?", "+displayName:""}`,subtitle,"YOUR SCHOOL AT A GLANCE",role!=="student"?button("＋ Take attendance","go-attendance","button button-primary"):"");
    const weekStart=new Date();weekStart.setHours(0,0,0,0);weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));const weekly=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;const rr=records.filter(r=>r.attendance_date===iso);const n=rr.filter(r=>["present","late"].includes(r.status)).length;return {label:d.toLocaleDateString(undefined,{weekday:"short"}),value:rr.length?Math.round(n/rr.length*100):0};});
    const counts=["present","absent","late","leave"].map(status=>({status,value:allToday.filter(r=>r.status===status).length}));
    const recentTable=table(["DATE","STUDENT / CLASS","SUBJECT","STATUS"],recentRows(recent,role!=="student"),"No attendance yet","When attendance is recorded, the latest entries will appear here.");
    const studentCourse=role==="student"?(state.cache.courses||[]).find(c=>(state.profile.course_id&&c.id===state.profile.course_id)||(!state.profile.course_id&&state.profile.course_name&&c.name.toLowerCase().trim()===String(state.profile.course_name).toLowerCase().trim())):null;
    const studentCourseSubjects=role==="student"?(state.cache.courseSubjects||[]).filter(cs=>studentCourse&&cs.course_id===studentCourse.id&&(state.profile.semester==null||cs.semester===state.profile.semester)): [];
    if(role==="student" && studentCourse) {
      metrics.splice(1,0,stat("Enrolled course",escapeHtml(studentCourse.name),escapeHtml(studentCourse.code||"Course code"),"🎓"));
    }
    const subjectDefinitions=role==="student"?(studentCourseSubjects.length?studentCourseSubjects.map(cs=>({subject_id:cs.subject_id,semester:cs.semester})):state.cache.assignments.map(a=>({subject_id:a.subject_id,semester:a.semester}))):[];
    const subjectSummaries=role==="student"?subjectDefinitions.map((def,index)=>{const matchingAssignments=state.cache.assignments.filter(a=>a.subject_id===def.subject_id&&(def.semester==null||a.semester==null||a.semester===def.semester));const rr=records.filter(r=>matchingAssignments.some(a=>a.id===r.class_subject_id));const attended=rr.filter(r=>["present","late"].includes(r.status)).length;const pct=rr.length?Math.round(attended/rr.length*100):0;return {id:def.subject_id+"-"+index,name:subjectName(def.subject_id),semester:def.semester,attended,total:rr.length,present:rr.filter(r=>r.status==="present").length,late:rr.filter(r=>r.status==="late").length,absent:rr.filter(r=>r.status==="absent").length,leave:rr.filter(r=>r.status==="leave").length,pct,assigned:matchingAssignments.length>0};}):[];
    const subjectStats=role==="student"?(subjectSummaries.map(s=>'<div class="subject-progress" style="padding:12px 0;border-bottom:1px solid var(--border,#e7edf7)"><div class="subject-progress-top"><strong>'+escapeHtml(s.name)+'</strong><span>'+s.attended+'/'+s.total+' attended · '+(s.total?s.pct+"%":"No records")+'</span></div><div class="progress"><span style="width:'+s.pct+'%"></span></div><div class="panel-subtitle" style="margin-top:7px">Present '+s.present+' · Absent '+s.absent+' · Late '+s.late+' · Leave '+s.leave+(s.semester?' · Semester '+s.semester:'')+(s.assigned?'':' · Not assigned to a class yet')+'</div></div>').join("")||empty("No subjects yet","Your course subjects will appear after your HOD assigns them.")):"";
    const totalAttended=records.filter(r=>["present","late"].includes(r.status)).length;
    const totalAbsent=records.filter(r=>r.status==="absent").length;
    const totalLate=records.filter(r=>r.status==="late").length;
    const totalLeave=records.filter(r=>r.status==="leave").length;
    const totalAttendancePct=records.length?Math.round(totalAttended/records.length*100):0;
    const totalAttendancePanel=role==="student"?panel("Total attendance","Your overall attendance across all recorded subjects",'<div class="stats-grid">'+stat("Attendance",records.length?totalAttendancePct+"%":"—",totalAttended+" attended out of "+records.length+" recorded sessions","✓")+stat("Total classes",records.length,"Recorded sessions","▤")+stat("Present / Late",totalAttended,totalLate+" late","✓")+stat("Absent",totalAbsent,"Missed classes","×")+'</div><div class="panel-subtitle" style="margin-top:8px">Leave: '+totalLeave+' · Only attendance sessions saved by your teacher are counted.</div>'):"";
    const coursePanel=role==="student"?panel("My enrolled course","Course and academic enrollment details",studentCourse?'<div class="stats-grid">'+stat("Course",escapeHtml(studentCourse.name),escapeHtml(studentCourse.code||"Course code"),"▤")+stat("Department",escapeHtml(studentCourse.department||state.profile.department||"—"),"Assigned department","⌂")+stat("Semester",state.profile.semester||"—","Current semester","▦")+stat("Duration",studentCourse.duration_years?studentCourse.duration_years+" years":"—","Course duration","◷")+'</div>':(state.profile.course_name?'<div class="hint"><strong>'+escapeHtml(state.profile.course_name)+'</strong><p>Department: '+escapeHtml(state.profile.department||"—")+' · Semester: '+escapeHtml(state.profile.semester||"—")+'</p><p>Course details are not linked to a published course record yet. Contact your HOD to link the course.</p></div>':empty("No course linked","Your approved course enrollment will appear here."))):"";

    const lowSubjects=subjectSummaries.filter(s=>s.total>0&&s.pct<75);
    const attendanceAlert=role==="student"?(lowSubjects.length?panel("Attendance needs attention","These subjects are below the default 75% threshold.",'<div class="hint">'+lowSubjects.map(s=>'<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0"><strong>'+escapeHtml(s.name)+'</strong><span class="badge badge-absent">'+s.pct+'% · '+(75-s.pct)+' points below target</span></div>').join("")+'<p>Contact your teacher if attendance is missing or you need to submit a leave/condonation request.</p></div>'):panel("Attendance status","No subject is currently below the default threshold based on recorded data.",'<p class="panel-subtitle">Only recorded sessions are counted. Check your course attendance regularly.</p>')):"";
    let content=`<div class="stats-grid">${metrics.join("")}</div><div class="dashboard-grid"><div>${panel("Attendance trend","Monday–Sunday · percentage marked present or late",'<div class="chart-wrap"><canvas id="trend-chart" aria-label="Attendance trend chart"></canvas></div>','<span class="legend"><span><i style="background:#596fe7"></i>Attendance rate</span></span>')}${panel("Recent attendance","Latest attendance records",recentTable,button("View all →","go-attendance","panel-action"))}</div><div>${panel("Today's breakdown","Attendance statuses recorded today",'<div class="attendance-breakdown"><div class="donut-wrap"><canvas id="status-chart"></canvas><div class="donut-center"><strong>'+allToday.length+'</strong><small>records</small></div></div><div class="breakdown-legend">'+counts.map((c,i)=>`<div class="breakdown-line"><span class="breakdown-left"><i style="background:${["#2aa779","#ed7583","#e6b24e","#7e8df4"][i]}"></i>${c.status[0].toUpperCase()+c.status.slice(1)}</span><strong>${c.value}</strong></div>`).join("")+'</div></div>')}${role==="admin"?panel("Getting started","A few steps to set up your workspace",'<div class="hint">1. Create classes and subjects.<br>2. Register staff and student accounts.<br>3. Assign teachers to subjects and enroll students.<br>4. Start recording daily attendance.</div>'+button("Set up academics →","go-academics","button button-secondary")):panel("Your workspace","Quick actions",role==="student"?button("View my attendance →","go-attendance","button button-secondary")+'<a class="button button-outline" href="./campus.html">Campus services →</a>':button("Take attendance →","go-attendance","button button-secondary"))}</div></div>${role==="student"?totalAttendancePanel+coursePanel+attendanceAlert+panel("Course-wise subjects & attendance","Subjects for your enrolled course and attendance recorded in each subject",'<div class="subject-progress-list">'+subjectStats+'</div>'):""}`;
    if(role==="student" && state.profile.enrollment_status==="approved") {
      content += panel("Personal information","Submit corrections to your personal details. Changes take effect only after Admin approval.",
        '<div class="hint">You can request changes to your name, contact details, guardian information and other personal fields. Your department, course, student ID and enrollment status cannot be changed here.</div><div style="margin-top:12px">'+button("Update personal information","student-profile-edit","button button-primary")+'</div>');
    }
    if(role==="admin") content+=panel("Institution-wide attendance","Filter attendance separately for Students, Teachers and HODs.",'<div class="filters" style="align-items:end"><label>Role<select id="admin-attendance-role" class="inline-select"><option value="all">All roles</option><option value="student">Students</option><option value="teacher">Teachers</option><option value="hod">HODs</option></select></label><label>From date<input id="admin-attendance-from" type="date" class="inline-select"></label><label>To date<input id="admin-attendance-to" type="date" class="inline-select"></label><button type="button" class="button button-secondary" data-action="admin-attendance-reset">Reset filters</button></div><div id="admin-attendance-summary" class="stats-grid" style="margin:14px 0"></div><div id="admin-attendance-results">Loading attendance…</div>');
    $("page-content").innerHTML=content;
    if(role==="admin"){loadProfileChangeRequests();loadAdminOverallAttendance().catch(e=>{const el=$("admin-attendance-results");if(el)el.innerHTML='<div class="alert alert-error">'+escapeHtml(e.message||"Could not load attendance.")+'</div>';});}
    requestAnimationFrame(()=>{drawBar($("trend-chart"),weekly);drawDonut($("status-chart"),counts.map(c=>({value:c.value})));});
    state.chartEvents=[()=>{drawBar($("trend-chart"),weekly);drawDonut($("status-chart"),counts.map(c=>({value:c.value})));}];
  }
  async function loadAdminRegisterAttendance() {
    const result=await sb.from("staff_attendance_records").select("id,staff_id,attendance_date,status,notes").order("attendance_date",{ascending:false}).limit(2000);
    if(result.error) throw result.error;
    const profiles=new Map((state.cache.people||[]).map(p=>[String(p.id),p]));
    const studentRows=(state.cache.records||[]).map(r=>{const p=profiles.get(String(r.student_id));return {date:r.attendance_date,person:p?.full_name||personName(r.student_id),email:p?.email||"",role:"student",label:"Student",status:r.status,detail:assignedClassSubject(r.class_subject_id),notes:r.notes||""};});
    const staffRows=(result.data||[]).map(r=>{const p=profiles.get(String(r.staff_id));const hod=!!p&&(p.institutional_role==="hod"||p.role==="hod");return {date:r.attendance_date,person:p?.full_name||personName(r.staff_id),email:p?.email||"",role:hod?"hod":"teacher",label:hod?"HOD":"Teacher",status:r.status,detail:"Staff attendance",notes:r.notes||""};});
    const rows=[...studentRows,...staffRows].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
    const root=$("register-admin-results");if(!root)return;
    const render=()=>{
      const role=$("register-admin-role")?.value||"all",from=$("register-admin-from")?.value||"",to=$("register-admin-to")?.value||"";
      const filtered=rows.filter(r=>(role==="all"||r.role===role)&&(!from||r.date>=from)&&(!to||r.date<=to));
      const summary=$("register-admin-summary");
      if(summary)summary.innerHTML=[["student","Student attendance"],["teacher","Teacher attendance"],["hod","HOD attendance"]].map(([key,label])=>{const rr=rows.filter(r=>r.role===key&&(!from||r.date>=from)&&(!to||r.date<=to));const attended=rr.filter(r=>["present","late","half_day"].includes(r.status)).length;return stat(label,rr.length?Math.round(attended/rr.length*100)+"%":"—",rr.length+" records","◷");}).join("");
      root.innerHTML=table(["DATE","PERSON","ROLE","STATUS","CLASS / SOURCE","NOTES"],filtered.slice(0,300).map(r=>'<tr><td>'+fmtDate(r.date)+'</td><td><strong>'+escapeHtml(r.person)+'</strong><small style="display:block">'+escapeHtml(r.email)+'</small></td><td>'+badge(r.label.toLowerCase())+'</td><td>'+badge(r.status)+'</td><td>'+escapeHtml(r.detail)+'</td><td>'+escapeHtml(r.notes||"—")+'</td></tr>'),"No matching attendance records","Try a different role or date range. Up to 300 records are shown.");
    };
    ["register-admin-role","register-admin-from","register-admin-to"].forEach(id=>$(id)?.addEventListener("change",render));
    $("register-admin-reset")?.addEventListener("click",()=>{const roleEl=$("register-admin-role");if(roleEl)roleEl.value="all";["register-admin-from","register-admin-to"].forEach(id=>{const el=$(id);if(el)el.value="";});render();});
    render();
  }
  async function loadAdminOverallAttendance() {
    const result=await sb.from("staff_attendance_records").select("id,staff_id,attendance_date,status,notes").order("attendance_date",{ascending:false}).limit(2000);
    if(result.error) throw result.error;
    const profiles=new Map((state.cache.people||[]).map(p=>[String(p.id),p]));
    const studentRows=(state.cache.records||[]).map(r=>{const p=profiles.get(String(r.student_id));return {date:r.attendance_date,person:p?.full_name||personName(r.student_id),email:p?.email||"",role:"student",label:"Student",status:r.status,detail:assignedClassSubject(r.class_subject_id),notes:r.notes||""};});
    const staffRows=(result.data||[]).map(r=>{const p=profiles.get(String(r.staff_id));const hod=!!p&&(p.institutional_role==="hod"||p.role==="hod");return {date:r.attendance_date,person:p?.full_name||personName(r.staff_id),email:p?.email||"",role:hod?"hod":"teacher",label:hod?"HOD":"Teacher",status:r.status,detail:"Staff attendance",notes:r.notes||""};});
    const rows=[...studentRows,...staffRows].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
    const root=$("admin-attendance-results");if(!root)return;
    const render=()=>{
      const role=$("admin-attendance-role")?.value||"all",from=$("admin-attendance-from")?.value||"",to=$("admin-attendance-to")?.value||"";
      const filtered=rows.filter(r=>(role==="all"||r.role===role)&&(!from||r.date>=from)&&(!to||r.date<=to));
      const keys=[["student","Student attendance"],["teacher","Teacher attendance"],["hod","HOD attendance"]];
      const summary=$("admin-attendance-summary");
      if(summary)summary.innerHTML=keys.map(([key,label])=>{const rr=rows.filter(r=>r.role===key&&(!from||r.date>=from)&&(!to||r.date<=to));const attended=rr.filter(r=>["present","late","half_day"].includes(r.status)).length;return stat(label,rr.length?Math.round(attended/rr.length*100)+"%":"—",rr.length+" records","◷");}).join("");
      const html=filtered.slice(0,300).map(r=>'<tr><td>'+fmtDate(r.date)+'</td><td><strong>'+escapeHtml(r.person)+'</strong><small style="display:block">'+escapeHtml(r.email)+'</small></td><td><span class="badge badge-role">'+r.label+'</span></td><td>'+badge(r.status)+'</td><td>'+escapeHtml(r.detail)+'</td><td>'+escapeHtml(r.notes||"—")+'</td></tr>');
      root.innerHTML=table(["DATE","PERSON","ROLE","STATUS","CLASS / SOURCE","NOTES"],html,"No matching attendance records","Try another role or date range. Up to 300 matching records are shown.");
    };
    ["admin-attendance-role","admin-attendance-from","admin-attendance-to"].forEach(id=>$(id)?.addEventListener("change",render));
    $("page-content").querySelector('[data-action="admin-attendance-reset"]')?.addEventListener("click",()=>{["admin-attendance-role"].forEach(id=>{const el=$(id);if(el)el.value="all";});["admin-attendance-from","admin-attendance-to"].forEach(id=>{const el=$(id);if(el)el.value="";});render();});
    render();
  }
  function renderAttendance() {
    const role=state.profile.role,institutional=state.profile.institutional_role;
    const canTakeStudentAttendance=role==="teacher"&&institutional!=="hod";
    setHeading(role==="student"?"My attendance":"Attendance register",role==="student"?"Review your attendance history.":canTakeStudentAttendance?"Choose a class, subject and date to record attendance.":"Review attendance records across the institution.", "ATTENDANCE MANAGEMENT",canTakeStudentAttendance?button("＋ New register","new-attendance","button button-primary"):"");
    if(role==="student" && institutional!=="hod") {
      const recs=filteredRecords().sort((a,b)=>b.attendance_date.localeCompare(a.attendance_date));
      const pct=recs.length?Math.round(recs.filter(r=>["present","late"].includes(r.status)).length/recs.length*100):0;
      const content=`<div class="stats-grid">${[stat("Total sessions",recs.length,"Recorded sessions","◷"),stat("Attended",recs.filter(r=>["present","late"].includes(r.status)).length,"Present and late","✓"),stat("Absent",recs.filter(r=>r.status==="absent").length,"Missed sessions","!"),stat("Attendance rate",recs.length?pct+"%":"—","Present / late count as attended","↗")].join("")}</div>`;
      const rows=recs.map(r=>`<tr><td>${fmtDate(r.attendance_date)}</td><td>${escapeHtml(assignedClassSubject(r.class_subject_id))}</td><td>${badge(r.status)}</td><td>${escapeHtml(r.notes||"—")}</td></tr>`);
      $("page-content").innerHTML=content+panel("Attendance history","All sessions available to your account",table(["DATE","CLASS · SUBJECT","STATUS","NOTES"],rows,"No attendance recorded","Your teacher's recorded attendance will appear here."));return;
    }
    const allRecords=filteredRecords().sort((a,b)=>b.attendance_date.localeCompare(a.attendance_date));
    const recordsPanel=panel("Overall attendance records","All student attendance records available to your role",table(["DATE","STUDENT","CLASS · SUBJECT","STATUS"],allRecords.slice(0,100).map(r=>`<tr><td>${fmtDate(r.attendance_date)}</td><td>${escapeHtml(personName(r.student_id))}</td><td>${escapeHtml(assignedClassSubject(r.class_subject_id))}</td><td>${badge(r.status)}</td></tr>`),"No attendance records yet","Records appear here after a teacher records attendance."));
    const adminOverallPanel=role==="admin"?panel("Overall attendance · role filters","Filter Students, Teachers and HODs separately by date.",'<div class="filters"><label>Role<select id="register-admin-role"><option value="all">All roles</option><option value="student">Students</option><option value="teacher">Teachers</option><option value="hod">HODs</option></select></label><label>From<input id="register-admin-from" type="date"></label><label>To<input id="register-admin-to" type="date"></label><button class="button button-secondary" type="button" id="register-admin-reset">Reset filters</button></div><div id="register-admin-summary" class="stats-grid"></div><div id="register-admin-results">Loading attendance…</div>'):"";
    const isHod=state.profile?.institutional_role==="hod"||state.profile?.role==="hod";
    const normalizeDepartment=value=>{const d=String(value||"").trim().toLowerCase().replace(/\\s+/g," ");return ["bca","bachelor of computer application","bachelor of computer applications"].includes(d)?"bca":d;};
    const isTeachingStaff=p=>p.role==="teacher"&&!["hod","admin","system_admin"].includes(String(p.institutional_role||"").toLowerCase());
    const staffOptions=state.cache.people.filter(p=>p.is_active!==false&&(isHod?(isTeachingStaff(p)&&normalizeDepartment(p.department)===normalizeDepartment(state.profile.department)):(isTeachingStaff(p)||p.institutional_role==="hod"||p.role==="hod"))).map(p=>({value:p.id,label:(p.full_name||p.email)+" · "+(String(p.institutional_role||"").toLowerCase()==="staff"?"Staff":p.institutional_role==="hod"||p.role==="hod"?"HOD":"Teacher")}));
    const staffPanel=(role==="admin"||isHod)?panel(isHod?"Teacher & staff attendance":"Teacher, staff & HOD attendance",isHod?"Mark attendance only for active teachers and staff in your institution. HOD/Admin accounts are excluded.":"Admin can record daily attendance for active teachers, staff and HODs.",`<div class="filters">${select("staff-attendance-person",isHod?"Teacher / Staff":"Teacher / Staff / HOD",staffOptions,"Choose staff member")}${field("staff-attendance-date","Date","date","",true,today())}${select("staff-attendance-status","Status",[{value:"present",label:"Present"},{value:"absent",label:"Absent"},{value:"late",label:"Late"},{value:"leave",label:"Leave"},{value:"half_day",label:"Half day"}],"Choose status")}<input id="staff-attendance-note" maxlength="500" placeholder="Optional note"><button class="button button-primary" data-action="save-staff-attendance">Save staff attendance</button></div><div id="staff-attendance-recent">${empty("Loading staff attendance","Fetching recent teacher and staff attendance records.","◷")}</div>`):"";
    if(!canTakeStudentAttendance) {
      $("page-content").innerHTML=isHod?staffPanel:staffPanel+(role==="admin"?adminOverallPanel:recordsPanel);
      if(role==="admin"||isHod){populateStaffAttendanceMembers().catch(e=>{const el=$("staff-attendance-person");if(el)el.innerHTML='<option value="">Could not load members</option>';toast("Could not load staff members: "+(e.message||"Check profiles access."),"error");});loadRecentStaffAttendance().catch(e=>{const el=$("staff-attendance-recent");if(el)el.innerHTML=`<div class="alert alert-error">${escapeHtml(e.message)}</div>`;});}
      if(role==="admin") loadAdminRegisterAttendance().catch(e=>{const el=$("register-admin-results");if(el)el.innerHTML='<div class="alert alert-error">'+escapeHtml(e.message||"Could not load attendance.")+'</div>';});
      return;
    }
    const options=state.cache.assignments.filter(a=>a.teacher_id===state.user.id).map(a=>({value:a.id,label:assignedClassSubject(a.id)}));
    const filters=`<div class="filters">${select("register-subject","Class and subject",options,"Choose a subject")}${field("register-date","Date","date","",true,today())}<button class="button button-primary" data-action="load-roster">Load students →</button></div><div id="register-area">${empty("Choose a class and subject","Load the roster to mark the students' status for a date.","♙")}</div>`;
    $("page-content").innerHTML=staffPanel+panel("Take attendance","Only assigned teachers can record student attendance. Existing records can be edited for the selected date.",filters)+panel("Recent records","Records visible to your account",table(["DATE","STUDENT","CLASS · SUBJECT","STATUS"],allRecords.slice(0,10).map(r=>`<tr><td>${fmtDate(r.attendance_date)}</td><td>${escapeHtml(personName(r.student_id))}</td><td>${escapeHtml(assignedClassSubject(r.class_subject_id))}</td><td>${badge(r.status)}</td></tr>`),"No records yet","Records will appear here when attendance is added."));
    if(role==="admin") loadRecentStaffAttendance().catch(e=>{const el=$("staff-attendance-recent");if(el)el.innerHTML=`<div class="alert alert-error">${escapeHtml(e.message)}</div>`;});
  }
  async function populateStaffAttendanceMembers(){
    const el=$("staff-attendance-person");if(!el)return;
    el.innerHTML='<option value="">Loading members…</option>';
    const {data,error}=await sb.from("profiles").select("id,full_name,email,role,institutional_role,department,is_active").order("full_name");
    if(error)throw error;
    const norm=v=>String(v||"").trim().toLowerCase().replace(/\s+/g," ");
    const normDept=v=>["bca","bachelor of computer application","bachelor of computer applications"].includes(norm(v))?"bca":norm(v);
    const isHod=state.profile?.institutional_role==="hod"||state.profile?.role==="hod";
    const eligible=(data||[]).filter(p=>{
      if(p.is_active===false)return false;
      const r=norm(p.role),ir=norm(p.institutional_role),hod=r==="hod"||ir==="hod";
      const teacher=r==="teacher"||r==="staff"||ir==="teacher"||ir==="staff";
      return isHod?teacher&&normDept(p.department)===normDept(state.profile?.department):(teacher||hod);
    }).sort((a,b)=>String(a.full_name||a.email||"").localeCompare(String(b.full_name||b.email||"")));
    el.innerHTML='<option value="">'+(eligible.length?'Choose staff member':'No active Teacher/Staff/HOD accounts found')+'</option>'+eligible.map(p=>{
      const r=norm(p.role),ir=norm(p.institutional_role),hod=r==="hod"||ir==="hod",label=hod?"HOD":(r==="staff"||ir==="staff"?"Staff":"Teacher");
      return '<option value="'+escapeHtml(p.id)+'">'+escapeHtml((p.full_name||p.email||"Unnamed member")+" · "+label)+'</option>';
    }).join("");
    if(!eligible.length)throw new Error("No eligible active members were returned from profiles. Check active teacher/HOD accounts and Admin profile access.");
  }
  async function loadRecentStaffAttendance(){
    const host=$("staff-attendance-recent");if(!host||!(state.profile?.role==="admin"||state.profile?.institutional_role==="hod"||state.profile?.role==="hod"))return;
    const {data,error}=await sb.from("staff_attendance_records").select("id,staff_id,attendance_date,status,notes").order("attendance_date",{ascending:false}).limit(30);
    if(error)throw error;
    const rows=(data||[]).map(r=>{const p=state.cache.people.find(x=>x.id===r.staff_id);const role=String(p?.institutional_role||"").toLowerCase()==="staff"?"Staff":p?.institutional_role==="hod"||p?.role==="hod"?"HOD":"Teacher";return `<tr><td>${fmtDate(r.attendance_date)}</td><td>${escapeHtml(personName(r.staff_id))}</td><td>${escapeHtml(role)}</td><td>${badge(r.status)}</td><td>${escapeHtml(r.notes||"—")}</td></tr>`;});
    host.innerHTML=table(["DATE","STAFF MEMBER","ROLE","STATUS","NOTE"],rows,"No staff attendance yet","Save a staff attendance record to begin the register.");
  }
  async function saveStaffAttendance(){
    const isHod=state.profile?.institutional_role==="hod"||state.profile?.role==="hod";
    if(state.profile?.role!=="admin"&&!isHod)throw new Error("Only Admin or HOD can record teacher attendance.");
    const staff_id=$("staff-attendance-person")?.value,attendance_date=$("staff-attendance-date")?.value,status=$("staff-attendance-status")?.value,notes=$("staff-attendance-note")?.value.trim()||"";
    if(!staff_id||!attendance_date||!status)throw new Error("Choose staff member, date and attendance status.");
    const staff=state.cache.people.find(p=>p.id===staff_id);
    const isTeachingStaff=p=>p&&p.role==="teacher"&&!["hod","admin","system_admin"].includes(String(p.institutional_role||"").toLowerCase());
    if(attendance_date>today())throw new Error("Attendance cannot be recorded for a future date.");
    if(!staff||staff.is_active===false)throw new Error("Choose an active staff account.");
    if(isHod&&!isTeachingStaff(staff))throw new Error("HOD can record attendance only for teachers and staff in the same department, not HOD/Admin accounts.");
    if(!isHod&&!(isTeachingStaff(staff)||staff.institutional_role==="hod"||staff.role==="hod"))throw new Error("Choose an active Teacher, Staff or HOD account.");
    const {error}=await sb.from("staff_attendance_records").upsert({staff_id,attendance_date,status,notes,marked_by:state.user.id},{onConflict:"staff_id,attendance_date"});
    if(error)throw error;
    toast("Staff attendance saved.");await loadRecentStaffAttendance();
  }
  async function loadRoster() {
    if(state.profile?.role!=="teacher"||state.profile?.institutional_role==="hod") throw new Error("Only regular teachers can take student attendance. HOD and Admin have read-only overall attendance access.");
    const aid=$("register-subject")?.value,date=$("register-date")?.value;
    if(!aid||!date){toast("Choose a class, subject and date.","error");return;}
    if(date>today()){toast("Attendance cannot be recorded for a future date.","error");return;}
    const a=assignment(aid);if(!a){toast("This subject assignment is not available to your account.","error");return;}
    const {data:enrollments,error}=await sb.from("enrollments").select("student_id").eq("class_id",a.class_id);
    if(error)throw error;
    const ids=(enrollments||[]).map(e=>e.student_id);
    if(!ids.length){$("register-area").innerHTML=empty("No students enrolled","Ask an administrator to enroll students in this class.");return;}
    const [existing,people]=await Promise.all([
      sb.from("attendance_records").select("*").eq("class_subject_id",aid).eq("attendance_date",date).in("student_id",ids),
      sb.from("profiles").select("id,full_name,email,student_number").in("id",ids).order("full_name")
    ]);
    if(existing.error)throw existing.error;if(people.error)throw people.error;
    const byId=Object.fromEntries((existing.data||[]).map(r=>[r.student_id,r]));
    $("register-area").innerHTML=`<div class="roster-toolbar"><div><strong>${escapeHtml(className(a.class_id))} · ${escapeHtml(subjectName(a.subject_id))}</strong><div class="panel-subtitle">${people.data.length} enrolled students · ${fmtDate(date)}</div></div><div class="status-options"><button class="button button-outline" data-action="mark-all-present">Mark all present</button></div></div><div class="attendance-roster">${people.data.map(p=>{const r=byId[p.id],status=r?.status||"present";return `<div class="roster-row" data-student-id="${p.id}" data-record-id="${r?.id||""}"><div class="roster-student"><span class="avatar">${initials(p.full_name||p.email)}</span><span><strong>${escapeHtml(p.full_name||p.email)}</strong><small>${escapeHtml(p.student_number||p.email)}</small></span></div><div class="status-options">${["present","absent","late","leave"].map(s=>`<label class="status-option"><input type="radio" name="status-${p.id}" value="${s}" ${s===status?"checked":""}><span>${s[0].toUpperCase()+s.slice(1)}</span></label>`).join("")}</div><input class="attendance-note" maxlength="500" value="${escapeHtml(r?.notes||"")}" placeholder="Optional note (e.g. medical leave)" aria-label="Note for ${escapeHtml(p.full_name||p.email)}" style="grid-column:1/-1;padding:8px 10px;border:1px solid #e7ebf2;border-radius:7px;font-size:11px"></div>`;}).join("")}</div><div class="form-actions"><span class="panel-subtitle" style="margin-right:auto">Present is selected by default for convenience. Review each student before saving.</span><button class="button button-primary" data-action="save-roster">Save attendance</button></div>`;
  }
  async function saveRoster() {
    if(state.profile?.role!=="teacher"||state.profile?.institutional_role==="hod") throw new Error("Only regular teachers can save student attendance.");
    const aid=$("register-subject").value,date=$("register-date").value;
    if(date>today())throw new Error("Attendance cannot be recorded for a future date.");
    const rows=[...document.querySelectorAll(".roster-row")];
    if(!rows.length)throw new Error("Load a student roster first.");
    const payload=rows.map(row=>({class_subject_id:aid,student_id:row.dataset.studentId,attendance_date:date,status:row.querySelector("input[type=radio]:checked")?.value||"present",notes:row.querySelector(".attendance-note").value.trim(),marked_by:state.user.id}));
    const btn=document.querySelector('[data-action="save-roster"]');btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Saving…';
    const {error}=await sb.from("attendance_records").upsert(payload,{onConflict:"class_subject_id,student_id,attendance_date"});
    btn.disabled=false;btn.textContent="Save attendance";
    if(error)throw error;
    toast(`Attendance saved for ${payload.length} student(s).`);
    await loadCache();await loadRoster();await renderAttendance();
  }
  async function showStudentIdCard(userId) {
    if (state.profile?.role !== "admin") throw new Error("Only Admin can generate ID cards.");
    const p = state.cache.people.find(x => x.id === userId && ["student","teacher"].includes(x.role));
    if (!p || !["student","teacher"].includes(p.role)) throw new Error("Select a valid student or teacher account.");
    const w = window.open("", "_blank");
    if (!w) throw new Error("Allow pop-ups for Attendly to open the ID card.");
    w.document.write("<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><title>Preparing ID card</title><p style='font:16px Arial;padding:24px'>Preparing Attendly ID card…</p>");
    let photoUrl = "";
    if (p.profile_photo_path) {
      const signed = await sb.storage.from("student-photos").createSignedUrl(p.profile_photo_path, 300);
      if (!signed.error) photoUrl = signed.data.signedUrl;
    }
    const safe = v => escapeHtml(String(v || "—"));
    const logoUrl = new URL("./logo.svg", window.location.href).href;
    const isHod = isHodPerson(p);
    const isTeacher = p.role === "teacher" && !isHod;
    const cardRoleLabel = isHod ? "HOD" : isTeacher ? "TEACHER / STAFF" : "STUDENT";
    const idValue = p.student_number || ((isHod ? "HOD-" : isTeacher ? "TCH-" : "STU-") + new Date(p.created_at || Date.now()).getFullYear() + "-" + String(p.id || "").replaceAll("-", "").slice(0, 10).toUpperCase());
    const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=" + encodeURIComponent("ATTENDLY ID: "+idValue);
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Attendly ID Card</title><style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#edf2f8;color:#10284c;font-family:Arial,Helvetica,sans-serif}.toolbar{max-width:560px;margin:0 auto 14px;display:flex;justify-content:flex-end;gap:8px}.toolbar button,.toolbar a{font-size:14px;font-weight:700;border-radius:8px;padding:10px 14px;text-decoration:none;cursor:pointer}.toolbar button{background:#075cc8;color:#fff;border:0}.toolbar a{background:#fff;color:#183d6b;border:1px solid #cbd8e8}.id-card{width:min(100%,560px);aspect-ratio:1.586;margin:0 auto;background:#fff;border:1px solid #cbd8e8;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px #17365b20;display:flex;flex-direction:column}.head{height:27%;flex-shrink:0;background:linear-gradient(115deg,#071d3a,#0b4b91);display:flex;align-items:center;justify-content:space-between;padding:12px 18px;color:#fff}.logo{width:48%;max-height:62px;object-fit:contain;filter:brightness(0) invert(1)}.card-type{text-align:right;font-size:clamp(9px,2.3vw,13px);font-weight:800;letter-spacing:1.4px;line-height:1.4}.body{min-height:0;flex:1;display:grid;grid-template-columns:24% 1fr 18%;gap:3%;align-items:center;padding:12px 18px}.photo,.photo-placeholder{width:100%;aspect-ratio:3/4;max-height:130px;object-fit:cover;border:1px solid #cbd8e8;border-radius:7px;background:#f2f6fb}.photo-placeholder{display:flex;align-items:center;justify-content:center;text-align:center;color:#70839c;font-size:11px;padding:4px}.role{margin-top:5px;text-align:center;background:#e7efff;color:#174a91;border-radius:5px;padding:4px 2px;font-size:clamp(8px,1.8vw,10px);font-weight:800;letter-spacing:.4px}.name{font-size:clamp(12px,3vw,19px);font-weight:800;line-height:1.15;margin-bottom:9px;overflow-wrap:anywhere;color:#09244a}.row{display:grid;grid-template-columns:minmax(58px,38%) 1fr;gap:5px;margin:5px 0;font-size:clamp(8px,1.9vw,11px);line-height:1.2;overflow-wrap:anywhere}.row b{color:#526987}.qr{width:100%;max-width:88px;aspect-ratio:1;object-fit:contain;display:block;margin:auto}.qrlabel{text-align:center;font-size:9px;font-weight:800;margin-top:4px;overflow-wrap:anywhere}.foot{height:15%;flex-shrink:0;border-top:1px solid #dce6f2;background:#f3f7fd;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 18px;color:#526987;font-size:clamp(7px,1.7vw,10px);line-height:1.3}.foot strong{color:#0b2c59}.foot-right{text-align:right}@media(max-width:380px){body{padding:8px}.head{padding:8px 10px}.body{padding:8px 10px;gap:2%}.name{margin-bottom:5px}.row{grid-template-columns:1fr;gap:1px;margin:3px 0}.foot{padding:5px 10px}}@media print{@page{size:3.375in 2.125in;margin:0}body{padding:0;background:#fff}.toolbar{display:none}.id-card{width:3.375in;height:2.125in;aspect-ratio:auto;border:0;border-radius:0;box-shadow:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}.head{height:27%;padding:0.10in 0.14in}.body{padding:0.08in 0.14in;gap:3%}.foot{padding:0.04in 0.14in}}</style></head><body><div class="toolbar"><a href="#" onclick="window.close();return false">Close</a><button onclick="window.print()">Print / Save PDF</button></div><article class="id-card"><header class="head"><img class="logo" src="'+logoUrl+'" alt="Attendly College ERP"><div class="card-type">ATTENDLY COLLEGE ERP<br>'+cardRoleLabel+' ID CARD</div></header><section class="body"><div>'+(photoUrl?'<img class="photo" src="'+photoUrl+'" alt="Profile photo">':'<div class="photo-placeholder">Profile photo</div>')+'<div class="role">'+cardRoleLabel+'</div></div><div><div class="name">'+safe(p.full_name)+'</div><div class="row"><b>ID Number</b><span>'+safe(idValue)+'</span></div>'+(isTeacher?'':'<div class="row"><b>Course</b><span>'+safe(p.course_name)+'</span></div>')+'<div class="row"><b>Department</b><span>'+safe(p.department)+'</span></div><div class="row"><b>Admission year</b><span>'+safe(p.admission_year)+'</span></div></div><div><img class="qr" src="'+qrUrl+'" alt="ID QR code"><div class="qrlabel">'+safe(idValue)+'</div></div></section><footer class="foot"><span><strong>Attendly College ERP</strong><br>Learn · Attend · Grow</span><span class="foot-right">Official '+(isHod?'HOD':isTeacher?'staff':'student')+' identity card<br>Issued by the institution</span></footer></article></body></html>');
    w.document.close();
  }
  function isHodPerson(p) { return p?.institutional_role==="hod" || p?.role==="hod" || String(p?.student_number||"").toUpperCase().startsWith("HOD-"); }
  function displayRoleForPerson(p) { return isHodPerson(p) ? "HOD" : p?.role==="admin" ? "Admin" : p?.role==="teacher" ? "Teacher" : "Student"; }
  function uniquePeopleForCards(role) { return [...new Map(state.cache.people.filter(p=>role==="hod"?isHodPerson(p):role==="teacher"?(p.role==="teacher"&&!isHodPerson(p)):p.role===role&&!isHodPerson(p)).map(p=>[String(p.id||p.email||"").toLowerCase(),p])).values()]; }
  async function renderPeople() {
    if(state.profile.role!=="admin"){setView("overview");return;}
    // Refresh photo paths on every directory render so uploads made after Admin login appear without re-login.
    const latestPhotoPaths = await sb.from("profiles").select("id,profile_photo_path");
    if (!latestPhotoPaths.error && Array.isArray(latestPhotoPaths.data)) {
      const photoPathById = new Map(latestPhotoPaths.data.map(row => [String(row.id), row.profile_photo_path || null]));
      state.cache.people = state.cache.people.map(p => photoPathById.has(String(p.id)) ? {...p, profile_photo_path: photoPathById.get(String(p.id))} : p);
    } else if (latestPhotoPaths.error) {
      console.warn("Could not refresh profile photo paths:", latestPhotoPaths.error.message);
    }
    setHeading("People & roles","View all students and staff across departments. Filter the institution directory by department.","ADMINISTRATION",button("Create student ID card","create-student-id-card","button button-outline")+" "+button("Create teacher ID card","create-teacher-id-card","button button-outline")+" "+button("Create HOD ID card","create-hod-id-card","button button-outline")+" "+button("Create Teacher account","create-teacher","button button-primary")+" "+button("Create HOD account","create-hod","button button-primary")+" "+button("View setup notes","show-role-help","button button-outline"));
    const peopleTab=state.peopleView||"teachers";
    const uniquePeople=[...new Map(state.cache.people.map(p=>[String(p.id||p.email||"").toLowerCase(),p])).values()];
    const query=document.getElementById("people-search")?.value||"";
    const selectedDepartment=document.getElementById("people-department-filter")?.value||"";
    const selectedYear=document.getElementById("people-year-filter")?.value||"";
    const selectedStatus=document.getElementById("people-status-filter")?.value||"active";
    const selectedEnrollmentStatus=document.getElementById("people-enrollment-filter")?.value||"";
    const allYears=[...new Set(uniquePeople.map(p=>String(p.admission_year||new Date(p.created_at).getFullYear())).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));
    const allDepartments=[...new Set(uniquePeople.map(p=>(p.department||"").trim()).filter(Boolean))].sort();
    const people=uniquePeople.filter(p=>{const isHod=isHodPerson(p);const roleMatch=peopleTab==="hods"?isHod:peopleTab==="teachers"?!isHod&&p.role==="teacher":!isHod&&p.role==="student";return roleMatch&&(!selectedDepartment||p.department===selectedDepartment)&&(!selectedYear||String(p.admission_year||new Date(p.created_at).getFullYear())===selectedYear)&&(!selectedStatus||(selectedStatus==="active"&&p.is_active!==false)||(selectedStatus==="inactive"&&p.is_active===false))&&(!selectedEnrollmentStatus||(selectedEnrollmentStatus==="incomplete"&&(!p.department||!p.course_id))||(selectedEnrollmentStatus!=="incomplete"&&String(p.enrollment_status||"pending")===selectedEnrollmentStatus))&&((p.full_name||"").toLowerCase().includes(query.toLowerCase())||(p.email||"").toLowerCase().includes(query.toLowerCase())||(p.student_number||"").toLowerCase().includes(query.toLowerCase()));});
    const rows=people.map(p=>`<tr><td><div class="student-cell"><span class="avatar" data-profile-avatar="${escapeHtml(p.id)}">${initials(p.full_name||p.email)}</span><span><button type="button" class="profile-name-link" data-action="view-profile" data-user-id="${escapeHtml(p.id)}" aria-label="View profile details for ${escapeHtml(p.full_name||p.email||"user")}">${escapeHtml(p.full_name||"Unnamed user")}</button>${p.profile_photo_path?'<small class="request-email">Profile photo uploaded</small>':""}</span></div></td><td class="admin-email-cell">${escapeHtml(p.email||"—")}</td><td>${escapeHtml(p.department||(p.role==="student"?"Needs assignment":"—"))}</td><td>${escapeHtml(p.student_number||(isHodPerson(p)?"HOD-":p.role==="teacher"?"TCH-":"STU-")+new Date(p.created_at||Date.now()).getFullYear()+"-"+String(p.id||"").replaceAll("-","").slice(0,10).toUpperCase())}</td><td><span class="badge badge-role">${displayRoleForPerson(p)}</span></td><td>${escapeHtml(p.enrollment_status||"pending")}${p.role==="student"&&(!p.department||!p.course_id)?" · INCOMPLETE":""}</td><td>${state.cache.enrollments.filter(e=>e.student_id===p.id).length}</td><td>${p.id===state.user.id?'<span class="panel-subtitle">You</span><div class="account-actions"><button class="button button-outline" data-action="reset-password" data-user-id="${p.id}" data-email="${escapeHtml(p.email)}">Reset password</button></div>':`<span class="role-pill">${escapeHtml(displayRoleForPerson(p))}</span><div class="account-actions"><button class="button button-outline" data-action="reset-password" data-user-id="${p.id}" data-email="${escapeHtml(p.email)}">Reset password</button><button class="button button-outline" data-action="toggle-active" data-user-id="${p.id}" data-active="${p.is_active===false?"false":"true"}">${p.is_active===false?"Reactivate":"Deactivate"}</button>${p.role==="student"||(p.role==="teacher"&&p.institutional_role!=="hod")?'<button class="button button-secondary" data-action="student-id-card" data-user-id="'+p.id+'">Generate ID card</button>':""}<button class="button button-danger" data-action="permanent-delete" data-user-id="${p.id}" data-email="${escapeHtml(p.email)}">Delete</button></div>`}</td></tr>`);
    const peopleTabs=[["teachers","Teachers",uniquePeople.filter(p=>p.role==="teacher"&&!isHodPerson(p)).length],["students","Students",uniquePeople.filter(p=>p.role==="student"&&p.institutional_role!=="hod").length],["hods","HODs",uniquePeople.filter(p=>isHodPerson(p)).length]].map(([key,label,count])=>`<button class="button ${peopleTab===key?"button-primary":"button-outline"}" data-action="people-tab" data-tab="${key}">${label} (${count})</button>`).join("");
    $("page-content").innerHTML=`<div class="filters" style="margin-bottom:14px">${peopleTabs}</div><div style="display:flex;justify-content:flex-end;margin-bottom:12px">${button("Create HOD account","create-hod","button button-primary")}</div>`+panel("Department management","Only Admin can create institution departments. HODs can create and close courses inside their assigned department.",`<form id="admin-department-form" class="form-grid"><label>Department name<input name="department_name" required maxlength="100" placeholder="e.g. Bachelor of Computer Application"></label><button class="button button-primary" type="submit">Create department</button></form><div class="panel-subtitle" style="margin-top:10px">Departments already associated with accounts: ${allDepartments.length?allDepartments.map(d=>escapeHtml(d)).join(" · "):"No department assignments yet"}</div>`)+panel("Institution directory","Admin can view all departments. Use the department filter to inspect students and staff by department.",`<div class="filters"><input id="people-search" class="filter-search" placeholder="Search name, email or student ID…" value="${escapeHtml(query)}"><select id="people-department-filter" class="inline-select"><option value="">All departments</option>${allDepartments.map(d=>`<option value="${escapeHtml(d)}" ${d===selectedDepartment?"selected":""}>${escapeHtml(d)}</option>`).join("")}</select><select id="people-year-filter" class="inline-select"><option value="">All years</option>${allYears.map(y=>`<option value="${escapeHtml(y)}" ${y===selectedYear?"selected":""}>${escapeHtml(y)}</option>`).join("")}</select><select id="people-status-filter" class="inline-select"><option value="">All accounts</option><option value="active" ${selectedStatus==="active"?"selected":""}>Active</option><option value="inactive" ${selectedStatus==="inactive"?"selected":""}>Inactive</option></select><select id="people-enrollment-filter" class="inline-select"><option value="" ${selectedEnrollmentStatus===""?"selected":""}>All registrations</option><option value="pending" ${selectedEnrollmentStatus==="pending"?"selected":""}>Pending approval</option><option value="approved" ${selectedEnrollmentStatus==="approved"?"selected":""}>Approved</option><option value="rejected" ${selectedEnrollmentStatus==="rejected"?"selected":""}>Rejected</option><option value="incomplete" ${selectedEnrollmentStatus==="incomplete"?"selected":""}>Missing department/course</option></select><span class="panel-subtitle">${people.length} accounts</span></div>${table(["PERSON","EMAIL","DEPARTMENT",peopleTab==="students"?"STUDENT ID":peopleTab==="teachers"?"TEACHER ID":"HOD ID","ROLE","ENROLLMENT","CLASSES","CHANGE ROLE"],rows,"No accounts found","Register an account to add it to this list.")}`)+'<section id="profile-change-requests" class="panel"><div class="panel-header"><div><h2 class="panel-title">Student personal-information change requests</h2><p class="panel-subtitle">Loading requests for Admin review…</p></div></div></section>'+`<div id="role-help" class="hint hidden">New accounts are students by default. Assign institutional roles only through authorized Admin controls.</div>`; 
    const departmentForm=$("admin-department-form");
    departmentForm?.addEventListener("submit",async ev=>{
      ev.preventDefault();
      if(state.profile.role!=="admin"){toast("Only Admin can create departments.","error");return;}
      const btn=departmentForm.querySelector('button[type="submit"]');
      const name=String(new FormData(departmentForm).get("department_name")||"").trim();
      if(btn){btn.disabled=true;btn.textContent="Creating…";}
      try {
        const {error}=await sb.rpc("admin_create_department",{p_name:name});
        if(error)throw error;
        toast("Department created. You can now assign an HOD to this department.");
        await refreshAndRender();
      } catch(err) {toast(err.message||"Could not create department.","error");if(btn){btn.disabled=false;btn.textContent="Create department";}}
    });
    Promise.all(people.filter(p=>p.profile_photo_path).map(async p=>{
      const avatar=[...document.querySelectorAll("[data-profile-avatar]")].find(el=>el.dataset.profileAvatar===String(p.id));
      if(!avatar)return;
      const {data,error}=await sb.storage.from("student-photos").createSignedUrl(p.profile_photo_path,3600);
      if(error||!data?.signedUrl){
        console.warn("Profile photo could not be signed for directory entry:",p.id,error?.message||"No signed URL");
        avatar.title="Photo is saved but could not be loaded. Check Storage SELECT policy for student-photos.";
        avatar.dataset.photoStatus="unavailable";
        return;
      }
      const img=document.createElement("img");
      img.src=data.signedUrl;img.alt="Profile photo";img.loading="lazy";
      img.style.cssText="width:38px;height:38px;border-radius:50%;object-fit:cover;display:block";
      img.onerror=()=>{avatar.dataset.photoStatus="unavailable";avatar.title="Photo URL was created, but the image could not be downloaded.";};
      avatar.replaceChildren(img);
      avatar.style.padding="0";avatar.style.overflow="hidden";
      avatar.dataset.photoStatus="loaded";
    })).catch(err=>console.warn("Could not load profile photos for admin directory",err));
    loadProfileChangeRequests();
    $("people-search").addEventListener("input",()=>renderPeople());
    $("people-department-filter").addEventListener("change",()=>renderPeople());
    $("people-year-filter").addEventListener("change",()=>renderPeople());
    $("people-status-filter").addEventListener("change",()=>renderPeople());
    $("people-enrollment-filter").addEventListener("change",()=>renderPeople());
  }
  function renderAcademics() {
    if(state.profile.role!=="admin"){setView("overview");return;}
    setHeading("Classes & subjects","Organize your classes, subject assignments and student enrolments.","ACADEMIC SETUP",button("＋ Add class","modal-class","button button-primary"));
    const subjects=state.cache.subjects,classes=state.cache.classes;
    const classRows=classes.map(c=>`<tr><td><strong>${escapeHtml(c.name)}</strong></td><td>${escapeHtml(c.section||"—")}</td><td>${escapeHtml(c.academic_year)}</td><td>${state.cache.enrollments.filter(e=>e.class_id===c.id).length}</td><td>${state.cache.assignments.filter(a=>a.class_id===c.id).length}</td></tr>`);
    const subjRows=subjects.map(s=>`<tr><td><strong>${escapeHtml(s.name)}</strong></td><td>${escapeHtml(s.code)}</td><td>${state.cache.assignments.filter(a=>a.subject_id===s.id).length}</td></tr>`);
    const assignmentRows=state.cache.assignments.filter(a=>{const teacher=state.cache.people.find(p=>p.id===a.teacher_id);return !!teacher&&teacher.is_active!==false&&teacher.role==="teacher";}).map(a=>`<tr><td>${escapeHtml(className(a.class_id))}</td><td>${escapeHtml(subjectName(a.subject_id))}</td><td>${escapeHtml(personName(a.teacher_id))}</td><td>${state.cache.enrollments.filter(e=>e.class_id===a.class_id).length}</td></tr>`);
    const studentOptions=state.cache.people.filter(p=>p.role==="student").map(p=>({value:p.id,label:`${p.full_name||p.email}${p.student_number?" · "+p.student_number:""}`}));
    const classOptions=classes.map(c=>({value:c.id,label:className(c.id)+" · "+c.academic_year}));
    const subjectOptions=subjects.map(s=>({value:s.id,label:`${s.name} (${s.code})`}));
    const teacherOptions=state.cache.people.filter(p=>p.role==="teacher"&&!isHodPerson(p)&&p.is_active!==false).map(p=>({value:p.id,label:`${p.full_name||p.email}${p.student_number?" · "+p.student_number:""}`}));
    const body=`<div class="dashboard-grid"><div>${panel("Classes","Class groups and academic years",table(["CLASS","SECTION","YEAR","STUDENTS","SUBJECTS"],classRows,"No classes yet","Add a class to start organizing students."),button("＋ Add class","modal-class","panel-action"))}${panel("Subjects","Subject catalogue",table(["SUBJECT","CODE","ASSIGNMENTS"],subjRows,"No subjects yet","Add subjects before assigning them."),button("＋ Add subject","modal-subject","panel-action"))}</div><div>${panel("Assign a subject","Select the class, subject and teacher",`<form id="assignment-form" class="form-grid">${select("as-class","Class",classOptions)}${select("as-subject","Subject",subjectOptions)}${select("as-teacher","Teacher",teacherOptions)}<div class="form-actions"><button class="button button-primary" type="submit">Save assignment</button></div></form>`)}${panel("Enroll a student","Add a student to a class",`<form id="enrollment-form" class="form-grid">${select("en-class","Class",classOptions)}${select("en-student","Student",studentOptions)}<div class="form-actions"><button class="button button-primary" type="submit">Enroll student</button></div></form>`)}</div></div>${panel("Teacher assignments","Current class and subject teaching allocations",table(["CLASS","SUBJECT","TEACHER","ENROLLED"],assignmentRows,"No assignments yet","Assign teachers to class subjects above."))}`;
    $("page-content").innerHTML=body;
    $("assignment-form").addEventListener("submit",ev=>withForm(ev,async()=>{
      const payload={class_id:$("as-class").value,subject_id:$("as-subject").value,teacher_id:$("as-teacher").value};
      const {error}=await sb.from("class_subjects").upsert(payload,{onConflict:"class_id,subject_id"});if(error)throw error;
      toast("Teacher assignment saved.");await refreshAndRender();
    }));
    $("enrollment-form").addEventListener("submit",ev=>withForm(ev,async()=>{
      const {error}=await sb.from("enrollments").upsert({class_id:$("en-class").value,student_id:$("en-student").value},{onConflict:"class_id,student_id"});if(error)throw error;
      toast("Student enrolled.");await refreshAndRender();
    }));
  }
  async function withForm(ev, action) { ev.preventDefault();const btn=ev.submitter; if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Saving…';}try{await action();}catch(e){toast(e.message||"Action failed.","error");}finally{if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||"Save";}} }
  async function showPersonProfile(p) {
    if(!p) return;
    let photoUrl="";
    if(p.profile_photo_path) {
      const {data,error}=await sb.storage.from("student-photos").createSignedUrl(p.profile_photo_path,300);
      if(!error) photoUrl=data?.signedUrl||"";
    }
    const profileIsHod=isHodPerson(p);
    const profileIsTeacher=p.role==="teacher"&&!profileIsHod;
    const profileIdValue=p.student_number||((profileIsHod?"HOD-":profileIsTeacher?"TCH-":"STU-")+new Date(p.created_at||Date.now()).getFullYear()+"-"+String(p.id||"").replaceAll("-","").slice(0,10).toUpperCase());
    const fields=[["Full name",p.full_name],["Email",p.email],["Role",profileIsHod?"HOD":p.role],...((p.role==="student"&&!profileIsHod)?[["Student ID",profileIdValue]]:profileIsTeacher?[["Teacher ID",profileIdValue]]:profileIsHod?[["HOD ID",profileIdValue]]:[]),["Department",p.department],["Course",p.course_name||state.cache.courses?.find(c=>String(c.id)===String(p.course_id))?.name],["Admission year",p.admission_year],["Semester",p.semester],["Enrollment status",p.enrollment_status],["Mobile",p.phone],["Date of birth",p.date_of_birth||p.dob],["Gender",p.gender],["Address",p.address],["Guardian name",p.guardian_name],["Guardian mobile",p.guardian_phone||p.guardian_mobile],["Blood group",p.blood_group],["Emergency contact",p.emergency_contact],["Created",p.created_at?new Date(p.created_at).toLocaleDateString():""],["Account status",p.is_active===false?"Inactive":"Active"]].filter(([k,v])=>v!==undefined&&v!==null&&String(v).trim()!=="");
    const rows=fields.map(([k,v])=>'<div style="display:grid;grid-template-columns:minmax(110px,35%) 1fr;gap:12px;padding:10px 0;border-bottom:1px solid var(--border,#e5e7eb)"><strong>'+escapeHtml(k)+'</strong><span style="overflow-wrap:anywhere">'+escapeHtml(String(v))+'</span></div>').join("");
    const photo=photoUrl?'<img src="'+escapeHtml(photoUrl)+'" alt="Profile photo" style="width:76px;height:76px;object-fit:cover;border-radius:50%;border:2px solid var(--border,#e5e7eb)">':'<span class="avatar" style="width:56px;height:56px;font-size:20px">'+initials(p.full_name||p.email)+'</span>';
    const photoAdmin=state.profile?.role==="admin"&&p.id!==state.user?.id?'<div style="margin:12px 0;padding:12px;border:1px solid var(--border,#e5e7eb);border-radius:10px"><label for="admin-profile-photo-file" style="display:block;font-weight:650;margin-bottom:8px">Profile photo (JPG, PNG or WebP; max 5 MB)</label><input id="admin-profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp" style="max-width:100%"><button type="button" class="button button-secondary" data-action="admin-profile-photo-upload" data-user-id="'+escapeHtml(p.id)+'" style="margin-top:10px">Upload / change photo</button></div>':"";
    showModal("Profile details","PERSON DIRECTORY",'<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">'+photo+'<div><strong style="font-size:18px">'+escapeHtml(p.full_name||"Unnamed user")+'</strong><div class="panel-subtitle">'+escapeHtml(p.email||"")+'</div></div></div>'+photoAdmin+rows+'<p class="panel-subtitle" style="margin-top:14px">Only details available to your account are shown.</p><div class="modal-actions"><button type="button" class="button button-primary" data-action="close-profile-modal">Close</button></div>');
  }
  function showModal(title,eyebrow,html, onSubmit) {
    $("modal-title").textContent=title;$("modal-eyebrow").textContent=eyebrow;$("modal-content").innerHTML=html;
    const dlg=$("modal");if(!dlg.open)dlg.showModal();
    const form=$("modal-content").querySelector("form");
    if(form&&onSubmit)form.addEventListener("submit",async ev=>{ev.preventDefault();const btn=form.querySelector('[type="submit"]');btn.disabled=true;btn.textContent="Saving…";try{await onSubmit();dlg.close();}catch(e){toast(e.message||"Could not save record.","error");btn.disabled=false;btn.textContent="Save";}});
  }
  function showClassModal() {
    showModal("Add a class","ACADEMIC SETUP",`<form>${field("cl-name","Class name","text","e.g. BCA Year 1")}${field("cl-section","Section","text","e.g. A",false)}${field("cl-year","Academic year","text","2026–27",true,String(new Date().getFullYear()))}<div class="form-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button type="submit" class="button button-primary">Save class</button></div></form>`,async()=>{const payload={name:$("cl-name").value.trim(),section:$("cl-section").value.trim(),academic_year:$("cl-year").value.trim(),created_by:state.user.id};const {error}=await sb.from("classes").insert(payload);if(error)throw error;toast("Class created.");await refreshAndRender();});
  }
  function showSubjectModal() {
    showModal("Add a subject","ACADEMIC SETUP",`<form>${field("su-name","Subject name","text","Database Management")}${field("su-code","Subject code","text","BCA-DBMS")}<div class="form-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button type="submit" class="button button-primary">Save subject</button></div></form>`,async()=>{const payload={name:$("su-name").value.trim(),code:$("su-code").value.trim().toUpperCase()};const {error}=await sb.from("subjects").insert(payload);if(error)throw error;toast("Subject created.");await refreshAndRender();});
  }
  function renderReports() {
    setHeading("Reports & exports","Filter attendance records and export a spreadsheet-friendly CSV.","ATTENDANCE ANALYTICS",button("↓ Export CSV","export-report","button button-primary"));
    const classes=state.cache.classes.map(c=>({value:c.id,label:className(c.id)}));
    const content=`<section class="panel"><div class="panel-header"><div><h2 class="panel-title">Attendance report</h2><p class="panel-subtitle">Choose a date range and optionally filter by class.</p></div></div><div class="filters">${field("report-from","From date","date","",true,today().slice(0,8)+"01")}${field("report-to","To date","date","",true,today())}${select("report-class","Class",classes,"All classes","")}<button class="button button-secondary" data-action="apply-report">Apply filters</button></div><div id="report-results"></div></section>`;
    $("page-content").innerHTML=content;applyReportFilters();
  }
  function applyReportFilters() {
    const from=$("report-from")?.value,to=$("report-to")?.value,cl=$("report-class")?.value;
    if(from&&to&&from>to){toast("From date must be before the to date.","error");return;}
    state.reportRows=filteredRecords().filter(r=>(!from||r.attendance_date>=from)&&(!to||r.attendance_date<=to)&&(!cl||assignment(r.class_subject_id)?.class_id===cl));
    const rows=state.reportRows.map(r=>`<tr><td>${fmtDate(r.attendance_date)}</td><td>${escapeHtml(personName(r.student_id))}</td><td>${escapeHtml(assignedClassSubject(r.class_subject_id))}</td><td>${badge(r.status)}</td><td>${escapeHtml(r.notes||"—")}</td></tr>`);
    $("report-results").innerHTML=`<div class="stats-grid" style="margin:15px 0">${stat("Matching records",state.reportRows.length,"Filtered attendance","◷")}${stat("Present",state.reportRows.filter(r=>r.status==="present").length,"Present status","✓")}${stat("Absent",state.reportRows.filter(r=>r.status==="absent").length,"Absent status","!")}${stat("Late / Leave",state.reportRows.filter(r=>["late","leave"].includes(r.status)).length,"Other statuses","↗")}</div>`+table(["DATE","STUDENT","CLASS · SUBJECT","STATUS","NOTES"],rows,"No matching attendance","Try a wider date range or a different class.");
  }
  function exportReport() {
    applyReportFilters();const cols=["Date","Student","Class","Subject","Status","Notes"];
    const rows=state.reportRows.map(r=>[r.attendance_date,personName(r.student_id),className(assignment(r.class_subject_id)?.class_id),subjectName(assignment(r.class_subject_id)?.subject_id),r.status,r.notes||""]);
    const csv=[cols,...rows].map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const a=document.createElement("a"),url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.href=url;a.download=`attendly-report-${today()}.csv`;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);toast(`Exported ${rows.length} records.`);
  }

  function profileField(name,label,type="text",value="",required=false) {
    const v=value==null?"":String(value);
    if(type==="textarea") return '<label class="profile-edit-field">'+escapeHtml(label)+'<textarea name="'+name+'" maxlength="500" rows="2">'+escapeHtml(v)+'</textarea></label>';
    return '<label class="profile-edit-field">'+escapeHtml(label)+'<input name="'+name+'" type="'+type+'" value="'+escapeHtml(v)+'" '+(required?'required':'')+' '+(type==="date"?'max="'+today()+'"':'')+'></label>';
  }
  function openStudentProfileEditor() {
    if(state.profile.role!=="student" || state.profile.enrollment_status!=="approved") throw new Error("Only approved student accounts can request personal-information changes.");
    const p=state.profile;
    const photoPreview=p.profile_photo_path?'<p class="panel-subtitle">Current profile photo saved.</p>':'<p class="panel-subtitle">No profile photo uploaded yet.</p>';
    const form='<form id="student-profile-change-form" class="form-grid profile-edit-grid"><section class="profile-photo-upload"><strong>Profile photo</strong>'+photoPreview+'<label class="profile-edit-field">Choose photo (JPG, PNG or WebP, max 5 MB)<input type="file" id="student-profile-photo-file" accept="image/jpeg,image/png,image/webp"></label><button type="button" class="button button-secondary" data-action="student-profile-photo-upload">Upload profile photo</button></section>'
      +profileField("full_name","Full name","text",p.full_name,true)
      +profileField("phone","Mobile number (new number applies after Admin approval)","tel",p.phone||"",true)+'<p class="panel-subtitle profile-edit-note">'+(p.phone?'Enter the mobile number you want to use. Admin approval is required before a changed number is saved.':'No mobile number is saved in your profile. Enter the mobile number you want to add; Admin approval is required before it is saved.')+'</p>'
      +profileField("date_of_birth","Date of birth","date",p.date_of_birth||"")
      +'<label class="profile-edit-field">Gender<select name="gender"><option value="">Not specified</option>'+["female","male","non_binary","prefer_not_to_say"].map(v=>'<option value="'+v+'" '+(p.gender===v?'selected':'')+'>'+({female:"Female",male:"Male",non_binary:"Non-binary",prefer_not_to_say:"Prefer not to say"}[v])+'</option>').join("")+'</select></label>'
      +profileField("admission_year","Admission year","number",p.admission_year||"")
      +'<label class="profile-edit-field">Blood group<select name="blood_group"><option value="">Not provided</option>'+["A+","A-","B+","B-","AB+","AB-","O+","O-","unknown"].map(v=>'<option value="'+v+'" '+(p.blood_group===v?'selected':'')+'>'+v+'</option>').join("")+'</select></label>'
      +profileField("guardian_name","Parent / guardian name","text",p.guardian_name||"")
      +profileField("guardian_phone","Parent / guardian mobile","tel",p.guardian_phone||"")
      +profileField("emergency_contact","Emergency contact","tel",p.emergency_contact||"")
      +profileField("address","Residential address","textarea",p.address||"")
      +'<p class="panel-subtitle profile-edit-note">No OTP verification is required. Submitted changes will be reviewed by Admin before they are applied.</p>'
      +'<p class="panel-subtitle profile-edit-note">Email, Student ID, department, course, role and enrollment status are protected and cannot be edited in this form.</p>'
      +'<div class="form-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button type="submit" class="button button-primary">Submit for Admin approval</button></div></form>';
    showModal("Update personal information","STUDENT PROFILE",form,async()=>{
      const fd=new FormData($("student-profile-change-form")),allowed=["full_name","phone","date_of_birth","gender","admission_year","blood_group","guardian_name","guardian_phone","emergency_contact","address"];
      const changes={};
      for(const key of allowed){
        let value=String(fd.get(key)||"").trim();
        const original=p[key]==null?"":String(p[key]);
        if(key==="admission_year" && value && (!Number.isInteger(Number(value)) || Number(value)<2000 || Number(value)>2100)) throw new Error("Enter a valid admission year.");
        if(key==="date_of_birth" && value && value>today()) throw new Error("Date of birth cannot be in the future.");
        if(value!==original) changes[key]=value||null;
      }
      if(!Object.keys(changes).length) throw new Error("No changes detected.");
      const {error}=await sb.rpc("student_submit_profile_change",{p_changes:changes});
      if(error) throw error;
      toast("Personal-information changes submitted. Admin approval is pending.");
    });
  }
  async function loadProfileChangeRequests() {
    const host=$("profile-change-requests");
    if(!host || state.profile?.role!=="admin") return;
    const {data,error}=await sb.rpc("admin_list_profile_change_requests");
    if(error){host.innerHTML='<div class="panel-header"><div><h2 class="panel-title">Student personal-information change requests</h2><p class="panel-subtitle">'+escapeHtml(error.message)+'</p></div></div>';return;}
    const rows=(data||[]).map(r=>{
      const changes=Object.entries(r.proposed_changes||{}).map(([k,v])=>'<div class="change-item"><strong>'+escapeHtml(k.replaceAll("_"," "))+'</strong><span>'+escapeHtml(v==null?"(cleared)":String(v))+'</span></div>').join("");
      const actions=r.status==="pending"?'<button class="button button-small" data-action="profile-change-review" data-id="'+r.request_id+'" data-status="approved">Approve changes</button> <button class="button button-small button-secondary" data-action="profile-change-review" data-id="'+r.request_id+'" data-status="rejected">Reject</button>':escapeHtml(r.status)+(r.admin_note?' · '+escapeHtml(r.admin_note):"");
      return '<tr><td><strong>'+escapeHtml(r.full_name||"Student")+'</strong><small class="request-email">'+escapeHtml(r.email||"")+'</small></td><td>'+escapeHtml(r.department||"—")+'</td><td>'+escapeHtml(r.student_number||"—")+'</td><td><div class="change-list">'+changes+'</div></td><td>'+escapeHtml(r.status)+'</td><td>'+actions+'</td></tr>';
    });
    host.innerHTML='<div class="panel-header"><div><h2 class="panel-title">Student personal-information change requests</h2><p class="panel-subtitle">Approve or reject proposed changes. Approved changes update the student profile; protected academic fields are not included.</p></div></div>'+table(["STUDENT","DEPARTMENT","STUDENT ID","PROPOSED CHANGES","STATUS","DECISION"],rows,"No change requests","Student-submitted personal-information changes will appear here.");
  }
  async function refreshAndRender() { await loadCache();await renderView(); }
  document.addEventListener("click",async ev=>{
    const target=ev.target.closest("[data-action]");if(!target){const node=ev.target.closest("td, .student-cell, .avatar, strong, small, span");if(node){const label=String(node.textContent||"").trim();if(label){const matches=state.cache.people.filter(p=>[p.full_name,p.email,p.student_number,p.staff_number].some(v=>v&&String(v).trim().toLowerCase()===label.toLowerCase()));if(matches.length===1){showPersonProfile(matches[0]);return;}}}return;}
    const action=target.dataset.action;
    try {
      if(action==="complaint-reply"){if(state.profile?.role!=="admin")throw new Error("Only Admin can reply to complaints.");const response=document.querySelector('[data-response-for="'+target.dataset.id+'"]')?.value.trim()||null;const {error}=await sb.from("complaints").update({admin_response:response,updated_at:new Date().toISOString()}).eq("id",target.dataset.id);if(error)throw error;toast("Admin response saved.");await renderComplaints();return;}
      if(action==="close-profile-modal"){document.getElementById("modal")?.close();return;}
      if(action==="close-modal"){document.getElementById("modal")?.close();return;}
      if(action==="new-certificate-request"){openCertificateRequest(target.dataset.type);return;}
      if(action==="download-certificate"){await downloadCertificate(target.dataset.id);return;}
      if(action==="refresh-certificates"){await renderServices();return;}
      if(action==="approve-certificate"||action==="reject-certificate"){
        if(!(state.profile?.role==="admin"||state.profile?.institutional_role==="hod")) throw new Error("Only HOD or Admin can review certificate requests.");
        const {data:req,error:fetchError}=await sb.from("certificate_requests").select("*").eq("id",target.dataset.id).single();
        if(fetchError)throw fetchError;
        if(req.status!=="pending")throw new Error("Only pending requests can be reviewed.");
        const isAdmin=state.profile.role==="admin";
        const update=isAdmin?{admin_approved:action==="approve-certificate"}:{hod_approved:action==="approve-certificate"};
        if(action==="reject-certificate"){
          const reason=window.prompt("Enter reason for rejection:");
          if(reason===null)return;
          if(!reason.trim())throw new Error("A rejection reason is required.");
          update.status="rejected";update.rejection_reason=reason.trim();
        }
        const nextHodApproved=Object.prototype.hasOwnProperty.call(update,"hod_approved")?update.hod_approved:req.hod_approved;
        const nextAdminApproved=Object.prototype.hasOwnProperty.call(update,"admin_approved")?update.admin_approved:req.admin_approved;
        if(action==="approve-certificate"&&nextHodApproved&&nextAdminApproved) update.status="approved";
        const {error:updateError}=await sb.from("certificate_requests").update(update).eq("id",req.id);
        if(updateError)throw updateError;
        if(action==="approve-certificate"&&nextHodApproved&&nextAdminApproved){
          const {data:genData,error:genError}=await sb.functions.invoke("certificate-pdf",{body:{action:"generate",request_id:req.id}});
          if(genError) toast("Both approvals saved. PDF generation needs attention: "+genError.message);
          else if(genData?.status==="ready") toast("Both approvals saved. Certificate PDF is ready.");
          else toast("Both approvals saved. Certificate generation started.");
        } else {
          toast(action==="approve-certificate"?"Your approval has been recorded.":"Certificate request rejected.");
        }
        await renderCertificateRequests();return;
      }

      if(action==="view-profile"){const p=state.cache.people.find(x=>String(x.id)===String(target.dataset.userId));if(!p)throw new Error("Profile details are not available to your account.");showPersonProfile(p);return;}
      if(action==="admin-profile-photo-upload") {
        if(state.profile?.role!=="admin")throw new Error("Only Admin can change another account's profile photo.");
        const userId=target.dataset.userId,file=$("admin-profile-photo-file")?.files?.[0];
        if(!file)throw new Error("Choose a photo first.");
        if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Use a JPG, PNG or WebP image.");
        if(file.size>5*1024*1024)throw new Error("Photo must be 5 MB or smaller.");
        target.disabled=true;target.textContent="Uploading…";
        try{
          const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
          const path=userId+"/profile-"+Date.now()+"."+ext;
          const uploaded=await sb.storage.from("student-photos").upload(path,file,{upsert:false,contentType:file.type});
          if(uploaded.error)throw uploaded.error;
          const saved=await sb.from("profiles").update({profile_photo_path:path}).eq("id",userId).select("id,profile_photo_path").maybeSingle();
          if(saved.error || !saved.data?.profile_photo_path){await sb.storage.from("student-photos").remove([path]);throw saved.error || new Error("Photo uploaded, but the profile photo path was not saved.");}
          toast("Profile photo uploaded and saved.");await refreshAndRender();
          const person=state.cache.people.find(p=>p.id===userId);if(person)await showPersonProfile(person);
        } finally {target.disabled=false;target.textContent="Upload / change photo";}
      }
      if(action==="hod-assign-student") {
        if(state.profile?.institutional_role!=="hod"||!state.profile.department) throw new Error("Only an HOD with an assigned department can assign students.");
        const id=target.dataset.id;
        const courseSelect=document.querySelector('[data-course-for="'+id+'"]');
        const semesterInput=document.querySelector('[data-semester-for="'+id+'"]');
        const courseId=courseSelect?.value;
        const semester=Number(semesterInput?.value||1);
        if(!courseId) throw new Error("Choose a course first.");
        if(!Number.isInteger(semester)||semester<1||semester>12) throw new Error("Semester must be from 1 to 12.");
        target.disabled=true;
        const {error}=await sb.rpc("hod_assign_student_academics",{p_student_id:id,p_course_id:courseId,p_semester:semester});
        target.disabled=false;
        if(error) throw new Error(error.message);
        toast("Student department and course assigned successfully.");
        await refreshAndRender();
      }
      if(action==="create-teacher-id-card") {
        if(state.profile?.role!=="admin") throw new Error("Only Admin can generate teacher ID cards.");
        const teachers=uniquePeopleForCards("teacher");
        if(!teachers.length) throw new Error("No teachers are available to create an ID card.");
        const opts=teachers.map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml((p.full_name||p.email)+(p.student_number?' · '+p.student_number:''))+'</option>').join("");
        showModal("Create Teacher ID card","ADMINISTRATION",'<form id="teacher-id-card-form" class="form-grid"><label>Choose teacher<select id="teacher-id-card-person" required>'+opts+'</select></label><p class="panel-subtitle">Teacher ID cards can only be generated for teacher accounts.</p><div class="form-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button type="submit" class="button button-primary">Generate Teacher ID</button></div></form>',async()=>{
          const id=$("teacher-id-card-person").value;
          const person=state.cache.people.find(p=>p.id===id);
          if(!person||person.role!=="teacher"||person.institutional_role==="hod")throw new Error("Select a non-HOD teacher account.");
          await showStudentIdCard(id);
        });
      }
      if(action==="create-hod-id-card") {
        if(state.profile?.role!=="admin") throw new Error("Only Admin can generate HOD ID cards.");
        const hods=uniquePeopleForCards("hod");
        if(!hods.length) throw new Error("No HOD accounts are available to create an ID card.");
        const opts=hods.map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml((p.full_name||p.email)+(p.student_number?' · '+p.student_number:''))+'</option>').join("");
        showModal("Create HOD ID card","ADMINISTRATION",'<form id="hod-id-card-form" class="form-grid"><label>Choose HOD<select id="hod-id-card-person" required>'+opts+'</select></label><p class="panel-subtitle">Only HOD accounts appear in this list.</p><div class="form-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button type="submit" class="button button-primary">Generate HOD ID</button></div></form>',async()=>{
          const id=$("hod-id-card-person").value;
          const person=state.cache.people.find(p=>p.id===id);
          if(!person||!(person.institutional_role==="hod"||person.role==="hod")) throw new Error("Select an HOD account.");
          await showStudentIdCard(id);
        });
      }
      if(action==="create-student-id-card") {
        if(state.profile?.role!=="admin") throw new Error("Only Admin can generate student ID cards.");
        const cardRole=(state.peopleView==="teachers"?"teacher":state.peopleView==="students"?"student":state.peopleView==="hods"?"hod":null);
        if(!cardRole) throw new Error("ID cards can be created from the Teachers or Students tab only.");
        const students=uniquePeopleForCards(cardRole);
        if(!students.length) throw new Error("No accounts available in this tab to create an ID card.");
        const opts=students.map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(((p.institutional_role==="hod"||p.role==="hod")?"HOD":p.role==="teacher"?"Teacher":"Student")+" · "+(p.full_name||p.email)+(p.student_number?' · '+p.student_number:''))+'</option>').join("");
        showModal("Create student ID card","ADMINISTRATION",'<form id="student-id-card-form" class="form-grid"><label class="profile-edit-field">Select student<select id="student-id-card-student" required>'+opts+'</select></label><p class="panel-subtitle">The ID card will open in a new tab, ready to print or save as PDF.</p><div class="form-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button type="submit" class="button button-primary">Generate ID card</button></div></form>',async()=>{
          const id=$("student-id-card-student").value;
          await showStudentIdCard(id);
        });
      }
      if(action==="student-profile-photo-upload") {
        if(state.profile?.role!=="student") throw new Error("Only students can upload their own profile photo.");
        const file=$("student-profile-photo-file")?.files?.[0];
        if(!file) throw new Error("Choose a photo first.");
        if(!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("Use a JPG, PNG or WebP image.");
        if(file.size>5*1024*1024) throw new Error("Photo must be 5 MB or smaller.");
        target.disabled=true;target.textContent="Uploading…";
        try {
          const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
          const path=state.user.id+"/profile-"+Date.now()+"."+ext;
          const uploaded=await sb.storage.from("student-photos").upload(path,file,{upsert:false,contentType:file.type});
          if(uploaded.error)throw uploaded.error;
          const updated=await sb.from("profiles").update({profile_photo_path:path}).eq("id",state.user.id).select("id,profile_photo_path").maybeSingle();
          if(updated.error || !updated.data?.profile_photo_path){
            await sb.storage.from("student-photos").remove([path]);
            throw updated.error || new Error("Photo uploaded, but Supabase did not save the photo path to your profile. Sign out, sign in again, and retry.");
          }
          state.profile.profile_photo_path=updated.data.profile_photo_path;
          toast("Profile photo uploaded and saved. Admin can refresh People → Students.");
          await loadCache();await renderView();
        } finally {target.disabled=false;target.textContent="Upload profile photo";}
      }
      else if(action==="student-id-card") {
        await showStudentIdCard(target.dataset.userId);
      }
      if(action==="profile-otp-send") {
        if(state.profile?.role!=="student" || state.profile?.enrollment_status!=="approved") throw new Error("Only approved students can request OTP.");
        target.disabled=true;target.textContent="Sending…";
        try{
          const form=$("student-profile-change-form");const enteredPhone=String(form?.elements?.namedItem("phone")?.value||"").trim();if(!state.profile.phone&&!enteredPhone)throw new Error("Enter your new 10-digit mobile number first, then request OTP.");const {data,error}=await sb.functions.invoke("student-profile-change-otp",{body:{action:"send",phone:state.profile.phone||enteredPhone}});if(error){let detail="";try{detail=(await error.context?.json())?.error||"";}catch{}throw new Error(detail||error.message||"OTP request failed.");}
          if(error) throw error;
          if(data?.error) throw new Error(data.error);
          $("profile-otp-verified").value="false";
          $("profile-otp-status").textContent=data?.message||"OTP sent. It expires in 5 minutes.";
          toast("OTP sent to registered mobile.");
        }finally{target.disabled=false;target.textContent="Resend OTP";}
      }
      else if(action==="profile-otp-verify") {
        if(state.profile?.role!=="student") throw new Error("Student access required.");
        const otp=$("profile-change-otp")?.value?.trim()||"";
        target.disabled=true;target.textContent="Verifying…";
        try{
          const form=$("student-profile-change-form");const enteredPhone=String(form?.elements?.namedItem("phone")?.value||"").trim();const {data,error}=await sb.functions.invoke("student-profile-change-otp",{body:{action:"verify",otp,phone:state.profile.phone||enteredPhone}});if(error){let detail="";try{detail=(await error.context?.json())?.error||"";}catch{}throw new Error(detail||error.message||"OTP verification failed.");}
          if(error) throw error;
          if(data?.error) throw new Error(data.error);
          $("profile-otp-verified").value="true";
          $("profile-otp-status").textContent="Mobile verified. You can submit the request.";
          toast("OTP verified.");
        }finally{target.disabled=false;target.textContent="Verify OTP";}
      }
      else if(action==="student-profile-edit") openStudentProfileEditor();
      else if(action==="profile-change-review") {
        if(state.profile.role!=="admin") throw new Error("Administrator access required.");
        const note=prompt("Optional note for the student:")||null;
        const {error}=await sb.rpc("admin_review_profile_change",{p_request_id:target.dataset.id,p_decision:target.dataset.status,p_note:note});
        if(error) throw error;
        toast(target.dataset.status==="approved"?"Personal information updated and approved.":"Personal information change request rejected.");
        await loadProfileChangeRequests();
      }
      else if(action==="people-tab"){state.peopleView=target.dataset.tab;renderPeople();}
      else if(action==="go-attendance")setView("attendance");
      else if(action==="go-academics")setView("academics");
      else if(action==="new-attendance") {setView("attendance");setTimeout(()=> $("register-subject")?.focus(),40);}
      else if(action==="modal-class")showClassModal();
      else if(action==="modal-subject")showSubjectModal();
      else if(action==="close-modal")$("modal").close();
      else if(action==="load-roster")await loadRoster();
      else if(action==="save-roster")await saveRoster();
      else if(action==="save-staff-attendance")await saveStaffAttendance();
      else if(action==="mark-all-present")document.querySelectorAll('.status-option input[value="present"]').forEach(i=>i.checked=true);
      else if(action==="apply-report")applyReportFilters();
      else if(action==="export-report")exportReport();
      else if(action==="toggle-active") {
        if(state.profile.role!=="admin")throw new Error("Admin access required.");
        const id=target.dataset.userId;if(id===state.user.id)throw new Error("You cannot deactivate your own account.");
        const next=target.dataset.active!=="false"?false:true;
        if(!confirm(next?"Reactivate this account?":"Deactivate this account?"))return;
        const {error}=await sb.from("profiles").update({is_active:next}).eq("id",id);
        if(error)throw error;
        toast(next?"Account reactivated.":"Account marked inactive. Login blocking still requires server-side enforcement.");
        await refreshAndRender();
      } else if(action==="permanent-delete") {
        if(state.profile.role!=="admin")throw new Error("Admin access required.");
        if(!confirm("Permanently remove access and anonymize "+target.dataset.email+"? Personal details will be anonymized; attendance history will be retained."))return;
        const {data:{session}}=await sb.auth.getSession();
        const response=await fetch(SUPABASE_URL+"/functions/v1/admin-remove-account",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":SUPABASE_KEY},body:JSON.stringify({user_id:target.dataset.userId})});
        const result=await response.json();if(!response.ok)throw new Error(result.error||"Permanent deletion failed.");
        toast(result.mode==="anonymized"?"Account anonymized; historical records retained.":"Account deleted.");await refreshAndRender();
      } else if(action==="reset-password") {
        if(state.profile?.role!=="admin")throw new Error("Only Admin can reset account passwords.");
        const targetId=target.dataset.userId;
        const targetEmail=target.dataset.email||"selected account";
        if(!targetId)throw new Error("Select an account first.");
        showModal("Reset account password","ADMINISTRATION",`<p class="panel-subtitle">Set a temporary password for <strong>${escapeHtml(targetEmail)}</strong>. The user should change it after signing in.</p><form id="admin-reset-password-form" class="form-grid"><label>New temporary password<input id="admin-reset-password-value" type="password" minlength="8" maxlength="128" autocomplete="new-password" required placeholder="At least 8 characters"></label><label>Confirm password<input id="admin-reset-password-confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required placeholder="Re-enter password"></label><p class="panel-subtitle">Use at least 8 characters, including a letter and a number. Do not reuse an old password.</p><div class="form-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button type="submit" class="button button-primary">Reset password</button></div></form>`,async()=>{
          const password=$("admin-reset-password-value").value;
          if(password!==$("admin-reset-password-confirm").value)throw new Error("Passwords do not match.");
          if(password.length<8||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))throw new Error("Password must be at least 8 characters and include a letter and number.");
          const {data:{session}}=await sb.auth.getSession();
          if(!session?.access_token)throw new Error("Please sign in again.");
          const response=await fetch(SUPABASE_URL+"/functions/v1/admin-reset-password",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":SUPABASE_KEY},body:JSON.stringify({user_id:targetId,password})});
          const result=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(result.error||"Password reset failed.");
          toast("Password reset successfully for "+targetEmail+". Share the temporary password securely.");
          $("modal").close();
        });
      } else if(action==="create-teacher") {
        if(state.profile.role!=="admin")throw new Error("Only Admin can create teacher accounts.");
        showModal("Create Teacher account","ADMINISTRATION",`<style>
.attendly-account-form{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:16px!important;width:100%!important;align-items:start!important}
.attendly-account-form>label{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:7px!important;min-width:0!important;margin:0!important;font-size:13px!important;font-weight:650!important;line-height:1.4!important;color:#40516b!important;white-space:normal!important}
.attendly-account-form>label input{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;min-height:44px!important;box-sizing:border-box!important;margin:0!important;padding:11px 12px!important;border:1px solid #d8e2ef!important;border-radius:10px!important;background:#fff!important;color:#20324d!important;font:400 14px/1.4 system-ui,sans-serif!important}
.attendly-account-form>label input:focus{outline:none!important;border-color:#4f83f5!important;box-shadow:0 0 0 3px #4f83f522!important}
.attendly-account-form>.form-actions{grid-column:1/-1!important;display:flex!important;justify-content:flex-end!important;gap:10px!important;flex-wrap:wrap!important;border-top:1px solid #edf1f7!important;padding-top:16px!important;margin-top:5px!important}
@media(max-width:600px){.attendly-account-form{grid-template-columns:minmax(0,1fr)!important;gap:14px!important}.attendly-account-form>.form-actions{grid-column:1!important;position:sticky!important;bottom:0!important;background:#fff!important;padding:12px 0 4px!important}.attendly-account-form>.form-actions .button{flex:1!important;min-width:0!important}}
</style><form id="create-teacher-form" class="form-grid attendly-account-form" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;width:100%">
          <label>Full name<input id="teacher-full-name" required maxlength="100" placeholder="Teacher full name"></label>
          <label>Email address<input id="teacher-email" type="email" required placeholder="teacher@college.edu"></label>
          <label>Temporary password<input id="teacher-password" type="password" required minlength="10" autocomplete="new-password" placeholder="At least 10 characters"></label>
          <label>Department<input id="teacher-department" required maxlength="100" placeholder="e.g. Computer Applications"></label>
          <div class="form-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button type="submit" class="button button-primary">Create Teacher</button></div>
        </form>`,async()=>{
          const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw new Error("Please sign in again.");
          const response=await fetch(SUPABASE_URL+"/functions/v1/admin-create-account",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":SUPABASE_KEY},body:JSON.stringify({email:$("teacher-email").value.trim(),password:$("teacher-password").value,full_name:$("teacher-full-name").value.trim(),institutional_role:"teacher",role:"teacher",department:$("teacher-department").value.trim()})});
          const result=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(result.error||result.message||"Could not create Teacher account.");
          toast("Teacher account created. Share the temporary password securely.");await refreshAndRender();
        });
      } else if(action==="create-hod") {
        if(state.profile.role!=="admin")throw new Error("Only an administrator can create a HOD account.");
        showModal("Create HOD account","ADMINISTRATION",`<style>
.attendly-account-form{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:16px!important;width:100%!important;align-items:start!important}
.attendly-account-form>label{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:7px!important;min-width:0!important;margin:0!important;font-size:13px!important;font-weight:650!important;line-height:1.4!important;color:#40516b!important;white-space:normal!important}
.attendly-account-form>label input{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;min-height:44px!important;box-sizing:border-box!important;margin:0!important;padding:11px 12px!important;border:1px solid #d8e2ef!important;border-radius:10px!important;background:#fff!important;color:#20324d!important;font:400 14px/1.4 system-ui,sans-serif!important}
.attendly-account-form>label input:focus{outline:none!important;border-color:#4f83f5!important;box-shadow:0 0 0 3px #4f83f522!important}
.attendly-account-form>.form-actions{grid-column:1/-1!important;display:flex!important;justify-content:flex-end!important;gap:10px!important;flex-wrap:wrap!important;border-top:1px solid #edf1f7!important;padding-top:16px!important;margin-top:5px!important}
@media(max-width:600px){.attendly-account-form{grid-template-columns:minmax(0,1fr)!important;gap:14px!important}.attendly-account-form>.form-actions{grid-column:1!important;position:sticky!important;bottom:0!important;background:#fff!important;padding:12px 0 4px!important}.attendly-account-form>.form-actions .button{flex:1!important;min-width:0!important}}
</style><form id="create-hod-form" class="form-grid attendly-account-form" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;width:100%">
          <label>Full name<input id="hod-full-name" required maxlength="100" placeholder="HOD full name"></label>
          <label>Email address<input id="hod-email" type="email" required placeholder="hod@college.edu"></label>
          <label>Temporary password<input id="hod-password" type="password" required minlength="10" autocomplete="new-password" placeholder="At least 10 characters"></label>
          <label>Department<input id="hod-department" required maxlength="100" placeholder="e.g. Computer Applications"></label>
          <div class="form-actions"><button type="button" class="button button-outline" data-action="close-modal">Cancel</button><button type="submit" class="button button-primary">Create HOD</button></div>
        </form>`,async()=>{
          const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw new Error("Please sign in again.");
          const response=await fetch(SUPABASE_URL+"/functions/v1/admin-create-account",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token, "apikey":SUPABASE_KEY},body:JSON.stringify({email:$("hod-email").value.trim(),password:$("hod-password").value,full_name:$("hod-full-name").value.trim(),institutional_role:"hod",department:$("hod-department").value.trim()})});
          const result=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(result.error||result.message||"Could not create HOD account.");
          toast("HOD account created. Share the temporary password securely.");await refreshAndRender();
        });
      }
      else if(action==="show-role-help")$("role-help")?.classList.toggle("hidden");
      else if(action==="hod-course-active") {
        if(state.profile.institutional_role!=="hod")throw new Error("Only the HOD can close or reopen courses.");
        const currentlyActive=target.dataset.active==="true";
        const {error}=await sb.rpc("hod_set_course_active",{p_course_id:target.dataset.id,p_active:!currentlyActive});
        if(error)throw error;
        toast(currentlyActive?"Course closed. It will no longer appear in student registration.":"Course reopened and available for student registration.");
        await renderHodDashboard();
      }
      else if(action==="course-application-review") {
        if(state.profile.institutional_role!=="hod")throw new Error("Only the assigned HOD can review course enrollment.");
        const {error}=await sb.rpc("review_course_enrollment",{p_application_id:target.dataset.id,p_decision:target.dataset.status,p_note:null});
        if(error)throw error;
        toast(target.dataset.status==="approved"?"Enrollment approved. Student can now sign in.":"Enrollment rejected.");
        await renderHodDashboard();
      }
      else if(action==="legacy-enrollment-review") {
        if(state.profile.institutional_role!=="hod")throw new Error("Only the HOD can review student enrollment.");
        const note=prompt("Optional note for this enrollment decision:")||null;
        const {error}=await sb.rpc("review_student_profile_enrollment",{p_student_id:target.dataset.id,p_decision:target.dataset.status,p_note:note});
        if(error)throw error;
        toast(target.dataset.status==="approved"?"Student enrollment approved. Login is now allowed.":"Student enrollment rejected.");
        await renderHodDashboard();
      }
      else if(action==="hod-approval") {
        const isHod=state.profile.institutional_role==="hod";
        if(state.profile.role!=="admin"&&!isHod)throw new Error("HOD or administrator access required.");
        const tableName=target.dataset.kind==="condonation"?"condonation_requests":"leave_requests";
        const payload={status:target.dataset.status,reviewed_by:state.user.id,reviewed_at:new Date().toISOString()};
        const {error}=await sb.from(tableName).update(payload).eq("id",target.dataset.id).eq("status","pending");
        if(error)throw error;
        toast("Approval decision saved.");await renderHodDashboard();
      }
      else if(action==="anomaly-status") {
        if(state.profile.role!=="admin")throw new Error("Administrator access required.");
        const {error}=await sb.from("attendance_anomaly_flags").update({status:target.dataset.status,reviewed_by:state.user.id,reviewed_at:new Date().toISOString()}).eq("id",target.dataset.id);
        if(error)throw error;toast("Anomaly review status updated.");await renderGovernance();
      }
      else if(action==="duty-status") {
        if(state.profile.role!=="admin")throw new Error("Administrator access required.");
        const {error}=await sb.from("duty_leave_batches").update({status:target.dataset.status,reviewed_by:state.user.id,reviewed_at:new Date().toISOString()}).eq("id",target.dataset.id);
        if(error)throw error;toast("Duty leave decision saved.");await renderGovernance();
      }
    } catch(err) { console.error(err);toast(err.message||"Something went wrong.","error"); }
  });
  document.addEventListener("submit",async ev=>{
    if(ev.target.id==="hod-course-subject-form"){
      ev.preventDefault();
      if(state.profile.institutional_role!=="hod"){toast("Only the assigned HOD can add course subjects.","error");return;}
      const fd=new FormData(ev.target);
      const courseId=String(fd.get("course_id")||"");
      const subjectName=String(fd.get("subject_name")||"").trim();
      const subjectCode=String(fd.get("subject_code")||"").trim().toUpperCase();
      const semester=Number(fd.get("semester")||1);
      const btn=ev.target.querySelector('button[type="submit"]');
      if(btn){btn.disabled=true;btn.textContent="Adding…";}
      const {error}=await sb.rpc("hod_add_course_subject",{p_course_id:courseId,p_subject_name:subjectName,p_subject_code:subjectCode,p_semester:semester});
      if(error){toast(error.message,"error");if(btn){btn.disabled=false;btn.textContent="Add subject to course";}return;}
      toast("Subject added to the selected course and semester.");
      await renderHodDashboard();
      return;
    }
    if(ev.target.id!=="hod-course-form")return;
    ev.preventDefault();
    if(state.profile.institutional_role!=="hod"){toast("Only the assigned HOD can create department courses.","error");return;}
    const fd=new FormData(ev.target);
    const courseName=String(fd.get("name")||"").trim();
    const courseCode=String(fd.get("code")||"").trim().toUpperCase();
    const durationYears=Number(fd.get("duration_years")||3);
    const {error}=await sb.rpc("hod_create_course",{p_name:courseName,p_code:courseCode,p_duration_years:durationYears});
    if(error){toast(error.message,"error");return;}
    ev.target.reset();
    toast("Course created for your Admin-assigned department and is available for registration.");
    await renderHodDashboard();
  });
  document.addEventListener("change",async ev=>{
    if(ev.target.matches('[data-action="complaint-status"]')){try{if(state.profile?.role!=="admin")throw new Error("Only Admin can update complaint status.");const {error}=await sb.from("complaints").update({status:ev.target.value,updated_at:new Date().toISOString()}).eq("id",ev.target.dataset.id);if(error)throw error;toast("Complaint status updated.");}catch(e){toast(e.message||"Could not update complaint.","error");}return;}
    const el=ev.target;
    if(el.matches('[data-action="change-role"]')) {
      const id=el.dataset.userId,role=el.value;
      if(id===state.user.id){toast("Do not change your own role here. Use a separate administrator account.","error");await refreshAndRender();return;}
      el.disabled=true;const {error}=await sb.from("profiles").update({role}).eq("id",id);
      el.disabled=false;if(error){toast(error.message,"error");await refreshAndRender();}else{toast("User role updated.");await refreshAndRender();}
    }
  });
  const departmentInput=$("signup-department");
  if(departmentInput && departmentInput.tagName==="INPUT"){
    const departmentSelect=document.createElement("select");
    departmentSelect.id="signup-department";departmentSelect.name="department";departmentSelect.dataset.signupRequired="true";
    departmentSelect.innerHTML='<option value="">Choose department</option>';
    departmentInput.replaceWith(departmentSelect);
  }
  $("auth-switch").addEventListener("click",async ()=>{
    state.authMode=state.authMode==="login"?"signup":"login";
    const sign=state.authMode==="signup";
    if(sign) {
      const select=$("signup-course"),deptSelect=$("signup-department");
      select.innerHTML='<option value="">Choose a department first</option>';
      deptSelect.innerHTML='<option value="">Loading departments…</option>';
      const [{data:availableCourses,error:courseError},{data:departmentRows,error:departmentError}]=await Promise.all([
        sb.from("courses").select("id,name,code,department").eq("active",true).order("name"),
        sb.rpc("list_registration_departments")
      ]);
      const courses=availableCourses||[];
      const departments=[...new Set([...(departmentRows||[]).map(d=>(d.department||"").trim()),...courses.map(c=>(c.department||"").trim())].filter(Boolean))].sort();
      deptSelect.innerHTML='<option value="">Choose department</option>';
      departments.forEach(dept=>{const o=document.createElement("option");o.value=dept;o.textContent=dept;deptSelect.appendChild(o);});
      const populateCourses=()=>{const dept=deptSelect.value;select.innerHTML='<option value="">Choose a course</option>';courses.filter(c=>c.department===dept).forEach(course=>{const option=document.createElement("option");option.value=course.id;option.textContent=course.name+" ("+course.code+")";select.appendChild(option);});if(!dept)select.innerHTML='<option value="">Choose a department first</option>';else if(!courses.some(c=>c.department===dept))select.innerHTML='<option value="">No active courses in this department</option>';};
      deptSelect.onchange=populateCourses;
      if(courseError) toast("Could not load courses: "+courseError.message,"error");
      if(departmentError) toast("Could not load departments: "+departmentError.message,"error");
      if(!departments.length){deptSelect.innerHTML='<option value="">No departments available — contact Admin/HOD</option>';select.innerHTML='<option value="">No active courses yet</option>';}
    }
    $("auth-title").textContent=sign?"Create your account":"Welcome back";
    $("auth-subtitle").textContent=sign?"Use your institution email. New accounts start as students.":"Sign in to continue to your dashboard.";
    $("signup-fields").classList.toggle("hidden",!sign);document.querySelectorAll("[data-signup-required]").forEach(el=>el.required=sign);
    $("auth-password").autocomplete=sign?"new-password":"current-password";
    $("auth-submit").innerHTML=sign?"Create account <span>→</span>":"Sign in <span>→</span>";
    $("auth-switch-copy").textContent=sign?"Already registered?":"New to Attendly?";
    $("auth-switch").textContent=sign?"Sign in":"Create an account";
  });
  $("auth-form").addEventListener("submit",async ev=>{
    ev.preventDefault();const btn=$("auth-submit"),email=$("auth-email").value.trim(),password=$("auth-password").value;
    btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Please wait…';
    try {
      if(state.authMode==="login") {
        const loginIdentifier=$("auth-email").value.trim();
        if(!loginIdentifier.includes("@")){
          const student_id=loginIdentifier;
          const response=await fetch(SUPABASE_URL+"/functions/v1/student-id-login",{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},body:JSON.stringify({student_id,password})});
          const result=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(result.error||"Student ID sign in failed.");
          const {error}=await sb.auth.setSession({access_token:result.access_token,refresh_token:result.refresh_token});
          if(error)throw error;
        } else {
          const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;
        }
        const {data:authData}=await sb.auth.getUser();
        const {data:activeProfile,error:activeProfileError}=await sb.from("profiles").select("is_active").eq("id",authData.user?.id).maybeSingle();
        if(activeProfileError)throw activeProfileError;
        if(activeProfile?.is_active===false){await sb.auth.signOut();throw new Error("This account is deactivated. Contact your Admin.");}
        toast("Signed in successfully.");
      } else {
        const name=$("signup-name").value.trim();if(!name)throw new Error("Enter your full name.");
        const phone=$("signup-phone").value.trim(),course_id=$("signup-course").value,semester=$("signup-semester").value;
        const {data:course,error:courseError}=await sb.from("courses").select("id,name,department").eq("id",course_id).eq("active",true).maybeSingle();
        if(courseError)throw courseError;
        if(!phone||!course||!semester)throw new Error("Select an active course and fill in all required fields.");
        const department=course.department,course_name=course.name;
        const dob=$("signup-dob").value,admissionYear=$("signup-year").value;
        if(dob&&dob>today())throw new Error("Date of birth cannot be in the future.");
        const metadata={
          full_name:name,
          student_number:null,
          phone,
          date_of_birth:dob||null,
          gender:$("signup-gender").value||null,
          department,
          course_name,
          course_id:course.id,
          semester:Number(semester),
          admission_year:admissionYear?Number(admissionYear):null,
          blood_group:$("signup-blood").value||null,
          guardian_name:$("signup-guardian").value.trim()||null,
          guardian_phone:$("signup-guardian-phone").value.trim()||null,
          emergency_contact:$("signup-emergency").value.trim()||null,
          address:$("signup-address").value.trim()||null
        };
        const {data,error}=await sb.auth.signUp({email,password,options:{data:metadata}});if(error)throw error;
        if(!data.session){toast("Registration submitted. Check your email to confirm the account. Profile fields require the student-registration SQL migration to be applied.","info");}
        else toast("Student registration submitted. Confirm profile fields in your account.");
      }
    } catch(err) {toast(err.message||"Authentication failed.","error");}
    finally {btn.disabled=false;btn.innerHTML=state.authMode==="signup"?"Create account <span>→</span>":"Sign in <span>→</span>";}
  });
  const themeButton=$("theme-toggle");
  function applyTheme(theme) {
    document.documentElement.dataset.theme=theme;
    if(themeButton){themeButton.textContent=theme==="dark"?"Light mode":"Dark mode";themeButton.setAttribute("aria-pressed",String(theme==="dark"));}
  }
  let currentTheme="light";
  try{currentTheme=localStorage.getItem("attendly-theme")==="dark"?"dark":"light";}catch(e){}
  applyTheme(currentTheme);
  themeButton?.addEventListener("click",()=>{
    currentTheme=currentTheme==="dark"?"light":"dark";applyTheme(currentTheme);
    try{localStorage.setItem("attendly-theme",currentTheme);}catch(e){}
  });
  $("enable-notifications")?.addEventListener("click",async()=>{const b=$("enable-notifications");b.disabled=true;b.textContent="Checking…";try{if(!window.isSecureContext)throw new Error("Open Attendly on its HTTPS GitHub Pages address.");if(!("Notification" in window))throw new Error("This browser does not support web notifications. Open the site in Chrome.");if(Notification.permission==="denied")throw new Error("Notifications are blocked for this site. Chrome → Site settings → Notifications → Allow, then reload.");await enablePushNotifications();b.textContent="Notifications enabled";}catch(e){const msg=e?.message||String(e);b.textContent="Enable notifications";alertBox(msg,"error");toast(msg,"error");console.error("FCM enable error",e);}finally{b.disabled=false;}});
  $("signout-button").addEventListener("click",async()=>{const {error}=await sb.auth.signOut();if(error)toast(error.message,"error");else{state.user=null;state.profile=null;state.view="overview";state.cache={people:[],classes:[],subjects:[],assignments:[],enrollments:[],records:[]};state.reportRows=[];showAuth();toast("Signed out.");}});
  const navToggle = $("sidebar-open");
  const navSidebar = $("sidebar");
  const navScrim = $("sidebar-scrim");
  const navMobile = window.matchMedia("(max-width: 680px)");
  const closeNav = () => {
    navSidebar.classList.remove("mobile-open");
    navScrim.classList.remove("visible");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open navigation");
  };
  navToggle.addEventListener("click", () => {
    if (navMobile.matches) {
      const isOpen = !navSidebar.classList.contains("mobile-open");
      navSidebar.classList.toggle("mobile-open", isOpen);
      navScrim.classList.toggle("visible", isOpen);
      navToggle.setAttribute("aria-expanded", String(isOpen));
      navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
    } else {
      const isCollapsed = !document.body.classList.contains("sidebar-collapsed");
      document.body.classList.toggle("sidebar-collapsed", isCollapsed);
      navToggle.setAttribute("aria-expanded", String(!isCollapsed));
      navToggle.setAttribute("aria-label", isCollapsed ? "Open navigation" : "Close navigation");
    }
  });
  $("sidebar-close").addEventListener("click", closeNav);
  navScrim.addEventListener("click", closeNav);
  navSidebar.querySelectorAll(".nav-item").forEach(item => item.addEventListener("click", () => {
    if (navMobile.matches) closeNav();
  }));
  navMobile.addEventListener?.("change", () => {
    closeNav();
    document.body.classList.remove("sidebar-collapsed");
  });
  $("modal-close").addEventListener("click",()=>$("modal").close());
  $("profile-button").addEventListener("click",async()=>{try{await showPersonProfile(state.profile||{id:state.user?.id,email:state.user?.email,full_name:state.user?.user_metadata?.full_name,role:"student"});}catch(e){console.error("Could not open profile details",e);toast(e.message||"Could not load profile details.","error");}});
  document.querySelectorAll(".nav-item").forEach(el=>el.addEventListener("click",()=>setView(el.dataset.view)));
  window.addEventListener("resize",()=>state.chartEvents.forEach(fn=>{try{fn();}catch(e){console.warn(e);}}));
  sb.auth.onAuthStateChange((event,session)=>{setTimeout(()=>{if(session?.user){if(state.user?.id!==session.user.id||!state.profile)loadSession(session.user);}else{state.user=null;state.profile=null;showAuth();}},0);});
  (async()=>{try{const {data:{session},error}=await sb.auth.getSession();if(error)throw error;if(session?.user)await loadSession(session.user);else showAuth();}catch(err){console.error(err);showAuth("Unable to connect to Supabase: "+err.message);}})();
})();