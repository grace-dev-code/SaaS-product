import { listVehicles, supabase, supabaseConfigured } from './vehicles-api.js';

const $ = (selector) => document.querySelector(selector);
const body = $('#jobs-body');
const message = $('#page-message');
const dialog = $('#job-dialog');
const form = $('#job-form');
const formError = $('#form-error');
const managerRoles = new Set(['manager', 'admin']);
const allowedRoles = new Set(['staff', 'mechanic', 'manager', 'admin']);
const departmentLabels = { service: 'Service & repair', body_shop: 'Body shop', inspection: 'Inspection', wash: 'Wash & detail' };
let currentUser;
let currentRole;
let isManager = false;
let allJobs = [];
let filter = 'active';
let busyJobIds = new Set();

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function showMessage(text, type = '') {
  message.textContent = text;
  message.className = `notice ${type}`;
  message.hidden = !text;
}

function dateLabel(value) {
  if (!value) return 'No due date';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'No due date' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function displayStatus(job) {
  if (job.status === 'blocked') return 'Waiting for earlier work';
  if (job.status === 'in_progress') return 'In progress';
  if (job.status === 'completed') return 'Completed';
  return 'Ready to start';
}

function sortedJobs(jobs) {
  return [...jobs].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (b.status === 'completed' && a.status !== 'completed') return -1;
    if (a.status === 'blocked' && b.status !== 'blocked') return 1;
    if (b.status === 'blocked' && a.status !== 'blocked') return -1;
    const dueOrder = (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
    return dueOrder || a.priority - b.priority || a.estimated_minutes - b.estimated_minutes;
  });
}

function visibleJobs() {
  if (!isManager) return allJobs.filter((job) => job.status !== 'completed');
  if (filter === 'completed') return allJobs.filter((job) => job.status === 'completed');
  if (filter === 'active') return allJobs.filter((job) => job.status !== 'completed');
  return allJobs;
}

function renderSummary() {
  const active = allJobs.filter((job) => job.status !== 'completed');
  const running = active.filter((job) => job.status === 'in_progress').length;
  const blocked = active.filter((job) => job.status === 'blocked').length;
  const complete = allJobs.filter((job) => job.status === 'completed').length;
  const cards = isManager
    ? [
      ['Active jobs', active.length, 'Assigned across all staff'],
      ['In progress', running, 'Staff currently working'],
      ['Completed', complete, 'Kept in manager history'],
    ]
    : [
      ['My active jobs', active.length, `${active.filter((job) => job.status === 'not_started').length} ready to start`],
      ['In progress', running, 'Your jobs being worked on'],
      ['Waiting', blocked, 'Blocked by earlier work'],
    ];
  $('#summary-grid').innerHTML = cards.map(([title, count, foot]) => `<article class="summary-card"><small>${title}</small><strong>${count}</strong><span class="summary-foot">${foot}</span></article>`).join('');
}

function renderRows() {
  const jobs = sortedJobs(visibleJobs());
  const columns = isManager
    ? ['VEHICLE', 'JOB', 'DEPARTMENT', 'ASSIGNED STAFF', 'DUE', 'STATUS', '']
    : ['VEHICLE', 'YOUR JOB', 'DEPARTMENT', 'DUE', 'STATUS', ''];
  $('#jobs-head').innerHTML = columns.map((name) => `<th>${name}</th>`).join('');
  $('#list-title').textContent = isManager ? (filter === 'completed' ? 'Completed jobs' : 'Team jobs') : 'Jobs assigned to you';
  $('#list-kicker').textContent = isManager ? 'FULL TEAM QUEUE' : 'PRIVATE STAFF QUEUE';
  $('#empty-state').hidden = jobs.length > 0;
  $('.table-scroll').hidden = jobs.length === 0;
  if (!jobs.length) {
    $('#empty-title').textContent = isManager ? 'No jobs in this view' : 'You’re all caught up';
    $('#empty-copy').textContent = isManager ? 'Add a car and assign its first job to get the queue moving.' : 'New jobs assigned to your account will appear here.';
    body.replaceChildren();
    return;
  }

  body.innerHTML = jobs.map((job) => {
    const vehicleSub = [job.registration && `Reg ${job.registration}`, job.stock_number && `Stock ${job.stock_number}`].filter(Boolean).join(' · ');
    const department = departmentLabels[job.department] || job.department;
    const status = displayStatus(job);
    const isBusy = busyJobIds.has(job.id);
    let action = '';
    if (isManager) {
      action = job.status === 'completed' ? '—' : `<button class="reassign-button" data-action="reassign" data-id="${escapeHtml(job.id)}">Reassign</button>`;
    } else if (job.status === 'blocked') {
      action = '<button class="job-action" disabled>Waiting</button>';
    } else if (job.status === 'in_progress') {
      action = `<button class="job-action complete" data-action="complete" data-id="${escapeHtml(job.id)}" ${isBusy ? 'disabled' : ''}>${isBusy ? 'Saving…' : 'Complete'}</button>`;
    } else {
      action = `<button class="job-action" data-action="start" data-id="${escapeHtml(job.id)}" ${isBusy ? 'disabled' : ''}>${isBusy ? 'Saving…' : 'Start job'}</button>`;
    }
    const cells = [
      `<td>${job.vehicle_id ? `<a class="vehicle-title vehicle-open" href="car-information.html?vehicleId=${encodeURIComponent(job.vehicle_id)}">${escapeHtml(job.vehicle_name)}</a>` : `<span class="vehicle-title">${escapeHtml(job.vehicle_name)}</span>`}<span class="vehicle-sub">${escapeHtml(vehicleSub || 'Vehicle reference not set')}</span></td>`,
      `<td><span class="job-title">${escapeHtml(job.work_title)}</span><span class="job-sub">${Number(job.estimated_minutes)} min estimate</span></td>`,
      `<td><span class="dept-pill ${escapeHtml(job.department)}">${escapeHtml(department)}</span></td>`,
    ];
    if (isManager) cells.push(`<td>${escapeHtml(job.assigned_to_email)}</td>`);
    cells.push(`<td>${escapeHtml(dateLabel(job.due_date))}</td>`);
    cells.push(`<td><span class="status-pill ${escapeHtml(job.status)}">${escapeHtml(status)}</span></td>`);
    cells.push(`<td><div class="row-actions">${action}</div></td>`);
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
}

async function loadJobs() {
  let query = supabase.from('staff_jobs').select('*').order('due_date', { ascending: true, nullsFirst: false }).order('priority', { ascending: true });
  if (!isManager) query = query.eq('assigned_to_email', String(currentUser.email || '').toLowerCase()).neq('status', 'completed');
  const { data, error } = await query;
  if (error) {
    console.error('Could not load staff jobs:', error);
    showMessage('The shared staff queue is not set up yet. Apply supabase/migrations/202609260002_staff_jobs.sql in the Supabase SQL Editor, then refresh this page.', 'error');
    return;
  }
  allJobs = data || [];
  showMessage('');
  renderSummary();
  renderRows();
}

function setUpRole(user) {
  currentUser = user;
  currentRole = String(user.app_metadata?.role || '').toLowerCase();
  if (!allowedRoles.has(currentRole)) {
    window.location.replace('index.html');
    return false;
  }
  isManager = managerRoles.has(currentRole);
  const email = user.email || 'Staff member';
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
  $('#user-name').textContent = displayName;
  $('#user-role').textContent = isManager ? 'Manager · full team queue' : 'Staff · assigned jobs only';
  $('#user-initials').textContent = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  $('#view-kicker').textContent = isManager ? 'MANAGER WORKSPACE' : 'STAFF WORKSPACE';
  $('#view-title').textContent = isManager ? 'Team workboard' : 'My jobs';
  $('#view-description').textContent = isManager
    ? 'Add vehicles, assign work, and follow progress across the team.'
    : 'Only work assigned to your signed-in account appears here.';
  $('#add-job').hidden = !isManager;
  $('#manager-filter-wrap').hidden = !isManager;
  if (!isManager && !user.email) showMessage('Your Google account did not provide an email address, so assigned jobs cannot be matched to your account.', 'error');
  return true;
}

function openAddDialog(job = null) {
  form.reset();
  form.elements.priority.value = '3';
  form.elements.estimated_minutes.value = '60';
  form.dataset.jobId = job?.id || '';
  for (const name of ['vehicle_name', 'vehicle_id', 'registration', 'stock_number', 'work_title', 'department', 'estimated_minutes', 'due_date', 'priority']) {
    form.elements[name].disabled = Boolean(job);
  }
  $('#dialog-title').textContent = job ? 'Reassign this job' : 'Add a car and assign work';
  $('#save-job').textContent = job ? 'Save assignment' : 'Add job';
  $('#form-error').hidden = true;
  if (job) {
    form.elements.vehicle_name.value = job.vehicle_name || '';
    form.elements.vehicle_id.value = job.vehicle_id || '';
    form.elements.registration.value = job.registration || '';
    form.elements.stock_number.value = job.stock_number || '';
    form.elements.work_title.value = job.work_title || '';
    form.elements.department.value = job.department || 'service';
    form.elements.estimated_minutes.value = job.estimated_minutes || 60;
    form.elements.assigned_to_email.value = job.assigned_to_email || '';
    form.elements.due_date.value = job.due_date || '';
    form.elements.priority.value = String(job.priority || 3);
  }
  dialog.showModal();
}

async function saveJob(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const jobId = form.dataset.jobId;
  const button = $('#save-job');
  button.disabled = true;
  button.textContent = jobId ? 'Saving…' : 'Adding…';
  formError.hidden = true;
  try {
    if (jobId) {
      const email = String(form.elements.assigned_to_email.value || '').trim().toLowerCase();
      const { error } = await supabase.rpc('reassign_staff_job', { p_job_id: jobId, p_assigned_to_email: email });
      if (error) throw error;
      dialog.close();
      showMessage('Job reassigned.', 'success');
      await loadJobs();
      return;
    }
    const registration = String(data.registration || '').trim().toUpperCase() || null;
    const stockNumber = String(data.stock_number || '').trim().toUpperCase() || null;
    if (!registration && !stockNumber) {
      formError.textContent = 'Enter a registration or stock number so jobs for the same car can be kept in order.';
      formError.hidden = false;
      return;
    }
    const payload = {
      vehicle_name: String(data.vehicle_name).trim(),
      registration,
      stock_number: stockNumber,
      vehicle_key: (registration || stockNumber).replace(/[^A-Z0-9]/g, ''),
      work_title: String(data.work_title).trim(),
      department: data.department,
      assigned_to_email: String(data.assigned_to_email).trim().toLowerCase(),
      estimated_minutes: Number(data.estimated_minutes),
      due_date: data.due_date || null,
      priority: Number(data.priority),
      ...(data.vehicle_id ? { vehicle_id: data.vehicle_id } : {}),
    };
    const { error } = await supabase.from('staff_jobs').insert({ ...payload, created_by: currentUser.id });
    if (error) throw error;
    dialog.close();
    showMessage('Car and job added to the team queue.', 'success');
    await loadJobs();
  } catch (error) {
    console.error('Could not save staff job:', error);
    formError.textContent = error.message || 'Could not save the job. Check the staff email and Supabase setup.';
    formError.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = jobId ? 'Save assignment' : 'Add job';
  }
}

async function updateJob(jobId, nextStatus) {
  const job = allJobs.find((item) => item.id === jobId);
  if (!job || busyJobIds.has(jobId)) return;
  let staffNote = job.staff_note || null;
  if (nextStatus === 'completed') {
    const note = window.prompt('Optional note for the manager about the completed work:', '');
    if (note === null) return;
    staffNote = note.trim() || null;
  }
  busyJobIds.add(jobId);
  renderRows();
  const now = new Date().toISOString();
  const update = { status: nextStatus, updated_at: now };
  if (nextStatus === 'in_progress') update.started_at = now;
  if (nextStatus === 'completed') {
    update.completed_at = now;
    update.staff_note = staffNote;
  }
  const { data, error } = await supabase.from('staff_jobs').update(update).eq('id', jobId).select('id').maybeSingle();
  busyJobIds.delete(jobId);
  if (error || !data) {
    showMessage(`Could not update this job: ${error?.message || 'The assignment is no longer available to your account.'}`, 'error');
    renderRows();
    return;
  }
  showMessage(nextStatus === 'completed' ? 'Job completed. It has been removed from your active list.' : 'Job started.', 'success');
  await loadJobs();
}

async function initialize() {
  if (!supabaseConfigured) {
    document.body.classList.remove('auth-pending');
    showMessage('Add the Supabase project URL and browser-safe key to supabase-config.js before using the staff workboard.', 'error');
    return;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) {
    window.location.replace('login.html?next=team-workboard.html');
    return;
  }
  if (!setUpRole(data.session.user)) return;
  document.body.classList.remove('auth-pending');
  if (isManager) {
    try {
      const vehicles = await listVehicles();
      const select = $('#canonical-vehicle-select');
      select.insertAdjacentHTML('beforeend', vehicles.map((vehicle) => `<option value="${escapeHtml(vehicle.id)}" data-name="${escapeHtml(`${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`)}" data-stock="${escapeHtml(vehicle.stock_number || '')}">${escapeHtml(`${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.stock_number ? ` · Stock ${vehicle.stock_number}` : ''}`)}</option>`).join(''));
      const requestedVehicleId = new URLSearchParams(location.search).get('vehicleId');
      if (vehicles.some((vehicle) => vehicle.id === requestedVehicleId)) {
        select.value = requestedVehicleId;
        const option = select.selectedOptions[0];
        form.elements.vehicle_name.value = option.dataset.name || '';
        if (option.dataset.stock) form.elements.stock_number.value = option.dataset.stock;
      }
    } catch (error) {
      console.error('Could not load canonical vehicle choices:', error);
    }
  }
  renderSummary();
  await loadJobs();
  supabase.channel('staff-jobs-workboard')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_jobs' }, loadJobs)
    .subscribe();
}

$('#add-job').addEventListener('click', () => openAddDialog());
$('#close-dialog').addEventListener('click', () => dialog.close());
$('#cancel-dialog').addEventListener('click', () => dialog.close());
$('#job-form').addEventListener('submit', saveJob);
$('#canonical-vehicle-select').addEventListener('change', (event) => {
  const option = event.currentTarget.selectedOptions[0];
  if (!event.currentTarget.value) return;
  form.elements.vehicle_name.value = option.dataset.name || form.elements.vehicle_name.value;
  if (option.dataset.stock) form.elements.stock_number.value = option.dataset.stock;
});
$('#manager-filter').addEventListener('change', async (event) => { filter = event.target.value; await loadJobs(); });
$('#jobs-body').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const job = allJobs.find((item) => item.id === button.dataset.id);
  if (!job) return;
  if (button.dataset.action === 'reassign') openAddDialog(job);
  if (button.dataset.action === 'start') await updateJob(job.id, 'in_progress');
  if (button.dataset.action === 'complete') await updateJob(job.id, 'completed');
});
$('#sign-out').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) showMessage(error.message, 'error');
  else window.location.replace('index.html');
});

await initialize();
