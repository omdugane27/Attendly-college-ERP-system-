/* Attendly ERP portal — uses the existing Attendly Supabase project and its RLS policies. */
(() => {
  "use strict";
  const SUPABASE_URL = "https://ysgiqxzexvbmwuzuywmc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_zhL5wtEyFOhDl61_XAB85A_hsxUbsZ8";
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const $ = id => document.getElementById(id);
  const status = (message, bad = false) => {
    $("erp-status").textContent = message;
    $("erp-status").style.color = bad ? "#b42318" : "";
  };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch]);
  const roleName = profile => String(profile.institutional_role || profile.role || "user")
    .replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
  let user = null, profile = null, active = "overview";
  const tabs = [
    { id:"overview", label:"Overview", tables:[] },
    { id:"students", label:"Students & Staff", table:"profiles", select:"id,full_name,email,role,institutional_role,department,is_active" },
    { id:"courses", label:"Courses", table:"courses", select:"id,name,code,department,duration_years,active" },
    { id:"classes", label:"Classes", table:"classes", select:"id,name,section,academic_year" },
    { id:"attendance", label:"Student Attendance", table:"attendance_records", select:"id,student_id,class_subject_id,attendance_date,status,marked_by" },
    { id:"staff-attendance", label:"Staff Attendance", table:"staff_attendance_records", select:"id,staff_id,attendance_date,status,marked_by" },
    { id:"complaints", label:"Complaint Inbox", table:"complaints", select:"id,sender_id,subject,category,priority,status,created_at" },
    { id:"certificates", label:"Certificate Requests", table:"certificate_requests", select:"id,student_id,certificate_type,purpose,status,hod_approved,admin_approved,created_at" },
    { id:"leave", label:"Leave Requests", table:"leave_requests", select:"id,student_id,class_id,start_date,end_date,reason,status,created_at" },
    { id:"timetable", label:"Timetable", table:"timetable_entries", select:"id,class_subject_id,weekday,start_time,end_time,room" },
    { id:"announcements", label:"Announcements", table:"announcements", select:"id,title,body,created_at" }
  ];
  const columnLabels = {
    full_name:"Name",email:"Email",role:"Role",institutional_role:"Institutional role",
    department:"Department",is_active:"Active",name:"Name",code:"Code",duration_years:"Duration (years)",
    active:"Active",section:"Section",academic_year:"Academic year",student_id:"Student ID",
    class_subject_id:"Class/subject ID",attendance_date:"Date",status:"Status",marked_by:"Marked by",
    staff_id:"Staff ID",sender_id:"Submitted by",subject:"Subject",category:"Category",priority:"Priority",
    created_at:"Created",certificate_type:"Certificate",purpose:"Purpose",hod_approved:"HOD approved",
    admin_approved:"Admin approved",class_id:"Class ID",start_date:"Start",end_date:"End",reason:"Reason",
    weekday:"Weekday",start_time:"Start time",end_time:"End time",room:"Room",title:"Title",body:"Message"
  };
  function canSeeTab(tab) {
    const role = String(profile?.role || "").toLowerCase();
    const institutional = String(profile?.institutional_role || "").toLowerCase();
    const admin = role === "admin" || institutional === "system_admin";
    const hod = institutional === "hod" || role === "hod";
    if (admin) return true;
    const allowed = hod
      ? ["overview","students","courses","classes","attendance","staff-attendance","complaints","certificates","leave","timetable","announcements"]
      : role === "teacher"
        ? ["overview","courses","classes","attendance","complaints","certificates","leave","timetable","announcements"]
        : ["overview","courses","attendance","complaints","certificates","leave","timetable","announcements"];
    return allowed.includes(tab.id);
  }
  function renderTabs() {
    const visibleTabs = tabs.filter(canSeeTab);
    if (!visibleTabs.some(t => t.id === active)) active = "overview";
    $("erp-tabs").innerHTML = visibleTabs.map(t =>
      '<button type="button" data-erp-tab="'+t.id+'" class="'+(active===t.id?'active':'')+'">'+esc(t.label)+'</button>'
    ).join("");
    $("erp-tabs").querySelectorAll("[data-erp-tab]").forEach(button => {
      button.addEventListener("click", async () => {
        active = button.dataset.erpTab;
        renderTabs();
        await renderActive();
      });
    });
  }
  async function count(table) {
    const { count, error } = await db.from(table).select("*", { count:"exact", head:true });
    return error ? "—" : (count ?? 0);
  }
  async function renderOverview() {
    $("erp-title").textContent = "Overview";
    $("erp-desc").textContent = "Connected to the existing Attendly database · "+roleName(profile);
    $("erp-form-wrap").innerHTML = "";
    const cards = [
      ["Profiles","profiles"],["Courses","courses"],["Classes","classes"],
      ["Student attendance","attendance_records"],["Staff attendance","staff_attendance_records"],
      ["Complaints","complaints"],["Certificate requests","certificate_requests"],["Leave requests","leave_requests"]
    ];
    const counts = await Promise.all(cards.map(async ([label,table]) => [label,await count(table)]));
    $("erp-cards").innerHTML = counts.map(([label,value]) =>
      '<div class="erp-stat"><span class="erp-muted">'+esc(label)+'</span><b>'+esc(value)+'</b></div>'
    ).join("");
    $("erp-table-wrap").innerHTML = '<p class="erp-muted">Dashboard counts are read from the connected Supabase database. Table-level access follows the existing Row Level Security policies.</p>';
  }
  async function renderTable(tab) {
    $("erp-title").textContent = tab.label;
    $("erp-desc").textContent = "Live data from Supabase · access is controlled by database policies.";
    $("erp-cards").innerHTML = "";
    $("erp-form-wrap").innerHTML = "";
    $("erp-table-wrap").innerHTML = '<p class="erp-muted">Loading…</p>';
    let query = db.from(tab.table).select(tab.select).limit(100);
    if (tab.id === "students") query = query.order("full_name", { ascending:true });
    else if (tab.select.split(",").includes("created_at")) query = query.order("created_at", { ascending:false });
    else if (tab.select.split(",").includes("attendance_date")) query = query.order("attendance_date", { ascending:false });
    const { data, error } = await query;
    if (error) {
      $("erp-table-wrap").innerHTML = '<p>'+esc(error.message)+'</p>';
      status("Could not load "+tab.label+": "+error.message, true);
      return;
    }
    if (!data || !data.length) {
      $("erp-table-wrap").innerHTML = '<p class="erp-muted">No records available for your account, or this table is empty.</p>';
      status("Connected. "+tab.label+" has no visible records.");
      return;
    }
    const columns = tab.select.split(",");
    $("erp-table-wrap").innerHTML = '<table class="erp-table"><thead><tr>'+columns.map(col=>'<th>'+esc(columnLabels[col]||col)+'</th>').join("")+'</tr></thead><tbody>'+
      data.map(row=>'<tr>'+columns.map(col=>{
        let value = row[col];
        if (col === "institutional_role" && !value) value = row.role;
        if (typeof value === "boolean") value = value ? "Yes" : "No";
        if (value && typeof value === "object") value = JSON.stringify(value);
        if (typeof value === "string" && value.length > 120) value = value.slice(0,117)+"…";
        return '<td>'+esc(value ?? "—")+'</td>';
      }).join("")+'</tr>').join("")+'</tbody></table>';
    status("Connected · showing "+data.length+" record(s) from "+tab.table+".");
  }
  async function renderActive() {
    const tab = tabs.find(t=>t.id===active && canSeeTab(t)) || tabs.find(t=>t.id==="overview");
    try {
      if (tab.id === "overview") await renderOverview();
      else await renderTable(tab);
    } catch (error) {
      status("Unable to load data: "+(error?.message || error), true);
    }
  }
  async function start() {
    $("erp-signout").addEventListener("click", async () => {
      const { error } = await db.auth.signOut();
      if (error) status(error.message, true);
      else location.href = "./index.html";
    });
    $("erp-refresh").addEventListener("click", renderActive);
    status("Connecting to existing Attendly Supabase project…");
    const { data, error } = await db.auth.getSession();
    if (error) { status("Supabase session error: "+error.message, true); return; }
    if (!data.session) {
      status("No active session. Please sign in through Attendly first.");
      $("erp-user").textContent = "Not signed in";
      return;
    }
    user = data.session.user;
    const result = await db.from("profiles")
      .select("id,full_name,email,role,institutional_role,department,is_active")
      .eq("id", user.id).maybeSingle();
    if (result.error || !result.data) {
      status("Could not load your Attendly profile: "+(result.error?.message || "profile not found"), true);
      return;
    }
    profile = result.data;
    $("erp-user").textContent = (profile.full_name || user.email)+" · "+roleName(profile);
    $("erp-app").classList.remove("hidden");
    renderTabs();
    await renderActive();
  }
  start().catch(error => status("Startup error: "+(error?.message || error), true));
})();
