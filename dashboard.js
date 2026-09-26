import { supabase, supabaseConfigured } from './vehicles-api.js';
import { saveServiceRecord } from './service-records-api.js';

const authResult = supabaseConfigured ? await supabase.auth.getSession() : null;
const staffRole = String(authResult?.data?.session?.user?.app_metadata?.role || '').toLowerCase();
if (!['manager', 'admin'].includes(staffRole)) {
  const destination = ['staff', 'mechanic'].includes(staffRole) ? 'team-workboard.html' : 'index.html';
  window.location.replace(destination);
  throw new Error('The full team workboard is restricted to managers. Staff are sent to their assigned jobs.');
}
if (!authResult?.data?.session?.user) {
  window.location.replace('index.html');
  throw new Error('The public homepage is shown until an approved manager opens the team workboard.');
}
document.body.classList.remove('auth-pending');

const queueBody = document.querySelector('#queue-body');
const toast = document.querySelector('#toast');
const storageKey = 'flowdrive-staff-queue-v2';
const vehicleDatabaseName = 'fieldnote_vehicle_records';
let liveRecords = [];
let liveQueue = false;
let notifications = [
  { title: 'Service is at capacity', detail: 'The Ford Explorer repair is queued for the next open slot.', unread: true },
  { title: 'Rental return due today', detail: 'Toyota RAV4 needs wash and detail before its 2:00 PM pickup.', unread: true },
  { title: 'Shift plan ready', detail: 'Four pending jobs are routed to their departments.', unread: false },
];
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2800);
}

function addNotification(title, detail) {
  notifications.unshift({ title, detail, unread: true });
  renderNotifications();
}

function renderNotifications() {
  const list = document.querySelector('#notification-list');
  list.replaceChildren();
  if (!notifications.length) {
    const empty = document.createElement('p');
    empty.className = 'notification-empty';
    empty.textContent = 'You’re all caught up.';
    list.append(empty);
  }
  notifications.forEach((item) => {
    const article = document.createElement('article');
    article.className = `notification-item${item.unread ? ' unread' : ''}`;
    const title = document.createElement('b');
    title.textContent = item.title;
    const detail = document.createElement('p');
    detail.textContent = item.detail;
    article.append(title, detail);
    list.append(article);
  });
  document.querySelector('#notification-dot').hidden = !notifications.some((item) => item.unread);
}

function saveWorkboard() {
  const state = {
    rows: [...queueBody.querySelectorAll('tr')].map((row) => ({
      queueKey: row.dataset.queueKey || '',
      vehicleId: row.dataset.vehicleId || '',
      stock: row.querySelector('td:nth-child(2) small').textContent,
      status: row.dataset.state,
      dueDate: row.querySelector('.due-date').value,
      department: row.dataset.dept,
      nextDepartment: row.dataset.nextDepartment || '',
      job: row.querySelector('.job-tag').textContent,
      duration: row.querySelector('td:nth-child(3) small').textContent,
      ready: row.dataset.ready,
    })),
    departments: [...document.querySelectorAll('.department-card')].map((card) => ({
      name: card.dataset.department,
      used: card.querySelector('.used').textContent,
      open: card.querySelector('.open').textContent,
    })),
    readyCount: document.querySelector('#ready-count').textContent.match(/\d+/)?.[0] || '0',
  };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // The demo remains usable when browser storage is unavailable.
  }
}

function getDepartment(name) {
  return document.querySelector(`.department-card[data-department="${name}"]`);
}

function openVehicleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(vehicleDatabaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('vehicles')) request.result.createObjectStore('vehicles', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readVehicleRecords() {
  let database;
  try {
    database = await openVehicleDatabase();
    if (!database.objectStoreNames.contains('vehicles')) return [];
    return await new Promise((resolve, reject) => {
      const request = database.transaction('vehicles', 'readonly').objectStore('vehicles').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  } finally {
    database?.close();
  }
}

function serviceDepartment(type) {
  if (type === 'Wash') return 'wash';
  if (type === 'Repair') return 'service';
  return 'inspection';
}

function orderedServices(record) {
  return [...(record.services || [])].sort((a, b) => {
    const aWash = a.type === 'Wash';
    const bWash = b.type === 'Wash';
    if (aWash !== bWash) return aWash ? 1 : -1;
    return new Date(a.createdAt || record.createdAt || 0) - new Date(b.createdAt || record.createdAt || 0);
  });
}

function serviceEstimate(service) {
  if (service.estimate) return service.estimate;
  const minutes = Number(service.estimateMinutes) || 60;
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

function createLiveQueueRow(record, service, stageIndex, stages) {
  const department = serviceDepartment(service.type);
  const row = document.createElement('tr');
  row.dataset.dept = department;
  row.dataset.priority = String(stageIndex + 1);
  row.dataset.state = service.status === 'in_progress' ? 'active' : 'pending';
  row.dataset.ready = String(stageIndex === stages.length - 1);
  row.dataset.recordId = record.id;
  row.dataset.vehicleId = record.vehicleId || '';
  row.dataset.serviceId = service.id;
  row.dataset.queueKey = `${record.id}::${service.id}`;
  row.dataset.live = 'true';

  const priorityCell = document.createElement('td');
  const priority = document.createElement('span');
  priority.className = `priority p${Math.min(stageIndex + 1, 4)}`;
  priority.textContent = service.status === 'in_progress' ? 'IN' : String(stageIndex + 1).padStart(2, '0');
  priorityCell.append(priority);

  const vehicleCell = document.createElement('td');
  const vehicleName = document.createElement(record.vehicleId ? 'a' : 'b');
  if (record.vehicleId) {
    vehicleName.href = `car-information.html?vehicleId=${encodeURIComponent(record.vehicleId)}`;
    vehicleName.className = 'vehicle-open';
  }
  vehicleName.textContent = record.vehicle || record.plate || 'Vehicle details pending';
  const vehicleDetails = document.createElement('small');
  vehicleDetails.textContent = `${record.plate || 'No registration'} · ${record.customer || 'Customer record'}`;
  vehicleCell.append(vehicleName, vehicleDetails);

  const jobCell = document.createElement('td');
  const job = document.createElement('span');
  job.className = `job-tag ${departmentTagClasses[department] || ''}`;
  job.textContent = service.title || `${service.type} work`;
  const duration = document.createElement('small');
  duration.textContent = serviceEstimate(service);
  jobCell.append(job, duration);

  const departmentCell = document.createElement('td');
  const route = document.createElement('span');
  route.className = 'route-tag';
  route.textContent = departmentLabels[department];
  const routeNote = document.createElement('small');
  routeNote.className = 'route-note';
  routeNote.textContent = service.status === 'in_progress' ? 'Work in progress' : 'Assigned to next eligible department';
  departmentCell.append(route, routeNote);

  const dueCell = document.createElement('td');
  const dueDate = document.createElement('input');
  dueDate.className = 'due-date';
  dueDate.type = 'date';
  dueDate.value = service.queueDueDate || String(service.expectedCompletionAt || record.createdAt || new Date().toISOString()).slice(0, 10);
  dueDate.setAttribute('aria-label', `Due date for ${record.vehicle || record.plate || 'vehicle'}`);
  dueCell.append(dueDate);

  const statusCell = document.createElement('td');
  const reason = document.createElement('span');
  reason.className = `reason${service.status === 'in_progress' ? ' active-reason' : ''}`;
  reason.textContent = service.status === 'in_progress'
    ? 'In progress'
    : (service.type === 'Wash' && stages.length > 1 ? 'Repair stages complete · final wash' : 'Ready for department queue');
  const explain = document.createElement('button');
  explain.className = 'explain';
  explain.setAttribute('aria-expanded', 'false');
  explain.innerHTML = 'Why this job? <span>⌄</span>';
  const explanation = document.createElement('p');
  explanation.className = 'explanation';
  explanation.hidden = true;
  explanation.textContent = service.type === 'Wash' && stages.length > 1
    ? 'All repair and preparation services are complete. Wash is the final stage for this vehicle.'
    : 'The queue considers due date, queue priority, estimated duration, required process order, and department capacity.';
  statusCell.append(reason, explain, explanation);

  const actionCell = document.createElement('td');
  const action = document.createElement('button');
  action.className = 'complete';
  action.dataset.department = department;
  action.textContent = service.status === 'in_progress' ? 'Complete job' : 'Start job';
  actionCell.append(action);
  row.append(priorityCell, vehicleCell, jobCell, departmentCell, dueCell, statusCell, actionCell);
  return row;
}

function renderLiveQueue(records) {
  queueBody.replaceChildren();
  records.forEach((record) => {
    const stages = orderedServices(record);
    const incomplete = stages.filter((service) => service.status !== 'completed');
    if (!incomplete.length) return;
    const active = incomplete.find((service) => service.status === 'in_progress'
      && stages.slice(0, stages.findIndex((item) => item.id === service.id)).every((item) => item.status === 'completed'));
    const next = active || incomplete[0];
    const index = stages.findIndex((service) => service.id === next.id);
    queueBody.append(createLiveQueueRow(record, next, index, stages));
  });
}

function updateLiveDepartmentCapacity(records) {
  const activeCounts = { wash: 0, service: 0, inspection: 0 };
  records.forEach((record) => (record.services || []).forEach((service) => {
    if (service.status === 'in_progress') activeCounts[serviceDepartment(service.type)] += 1;
  }));
  Object.entries(activeCounts).forEach(([name, active]) => {
    const card = getDepartment(name);
    if (!card) return;
    const total = Number(card.querySelector('.dept-head small').textContent.match(/(\d+)\s+slots?/)?.[1] || 1);
    card.querySelector('.used').textContent = String(active);
    card.querySelector('.open').textContent = String(Math.max(0, total - active));
    updateDepartment(name);
  });
}

async function updateLiveService(row, status) {
  const database = await openVehicleDatabase();
  try {
    const transaction = database.transaction('vehicles', 'readwrite');
    const store = transaction.objectStore('vehicles');
    const record = await new Promise((resolve, reject) => {
      const request = store.get(row.dataset.recordId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const service = record?.services?.find((item) => item.id === row.dataset.serviceId);
    if (!service) throw new Error('This service item is no longer available. Refresh the queue.');
    if (status === 'in_progress' && service.type === 'Wash') {
      const stages = orderedServices(record);
      const washIndex = stages.findIndex((item) => item.id === service.id);
      if (stages.slice(0, washIndex).some((item) => item.status !== 'completed')) {
        throw new Error('Finish all repair and preparation work before starting the final wash.');
      }
    }
    const at = new Date().toISOString();
    service.events ||= [];
    service.workSessions ||= [];
    if (status === 'in_progress') {
      service.workSessions.push({ startedAt: at, completedAt: null, durationMinutes: null, description: service.description || service.request || '' });
      service.startedAt ||= at;
      const minutes = Number(service.estimateMinutes) || 60;
      service.expectedCompletionAt = new Date(Date.now() + minutes * 60000).toISOString();
      service.status = 'in_progress';
      service.events.unshift({ at, title: 'Work started', note: 'Department work started from the staff queue.' });
    } else {
      const openSession = [...service.workSessions].reverse().find((session) => !session.completedAt);
      if (openSession) {
        openSession.completedAt = at;
        openSession.durationMinutes = Math.max(0, Math.round((new Date(at) - new Date(openSession.startedAt)) / 60000));
      }
      service.actualDurationMinutes = service.workSessions.reduce((sum, session) => sum + (Number(session.durationMinutes) || 0), 0);
      service.status = 'completed';
      service.completedAt = at;
      service.events.unshift({ at, title: 'Service completed', note: 'Department work completed from the staff queue.' });
    }
    service.updatedAt = at;
    record.updatedAt = at;
    store.put(record);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    if (record.vehicleId) {
      try {
        await saveServiceRecord(record);
        delete record.syncPending;
      } catch (error) {
        record.syncPending = true;
        const syncTransaction = database.transaction('vehicles', 'readwrite');
        syncTransaction.objectStore('vehicles').put(record);
        await new Promise((resolve, reject) => {
          syncTransaction.oncomplete = resolve;
          syncTransaction.onerror = () => reject(syncTransaction.error);
          syncTransaction.onabort = () => reject(syncTransaction.error);
        });
        throw new Error(`Status saved on this device, but shared sync failed: ${error.message}`);
      }
      const syncTransaction = database.transaction('vehicles', 'readwrite');
      syncTransaction.objectStore('vehicles').put(record);
      await new Promise((resolve, reject) => {
        syncTransaction.oncomplete = resolve;
        syncTransaction.onerror = () => reject(syncTransaction.error);
        syncTransaction.onabort = () => reject(syncTransaction.error);
      });
    }
  } finally {
    database.close();
  }
}

function updateReadyEstimate(records) {
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const readyByEndOfDay = records.filter((record) => {
    const pending = (record.services || []).filter((service) => service.status !== 'completed');
    const minutes = pending.reduce((sum, service) => sum + (Number(service.estimateMinutes) || 60), 0);
    return pending.length > 0 && Date.now() + minutes * 60000 <= endOfDay.getTime();
  }).length;
  document.querySelector('#ready-count').innerHTML = `${readyByEndOfDay} <em>vehicles</em>`;
}

async function refreshLiveQueue() {
  liveRecords = await readVehicleRecords();
  updateLiveDepartmentCapacity(liveRecords);
  renderLiveQueue(liveRecords);
  restoreWorkboard();
  dispatchQueue();
  updatePendingSummary();
  updateReadyEstimate(liveRecords);
  saveWorkboard();
}

function updatePendingSummary() {
  const pending = queueBody.querySelectorAll('tr[data-state="pending"], tr[data-state="waiting"]').length;
  const ready = queueBody.querySelectorAll('tr[data-state="pending"]').length;
  const waiting = queueBody.querySelectorAll('tr[data-state="waiting"]').length;
  document.querySelector('#pending-count').innerHTML = `${pending} <em>jobs</em>`;
  document.querySelector('#pending-foot').textContent = `${ready} can start now · ${waiting} waiting for capacity`;
}

function updateDepartment(name) {
  const card = getDepartment(name);
  const used = card.querySelector('.used');
  const open = card.querySelector('.open');
  const capacity = Number(used.textContent) + Number(open.textContent);
  const percentage = capacity ? Math.round((Number(used.textContent) / capacity) * 100) : 0;
  const track = card.querySelector('.bar i');
  const label = card.querySelector('.load-pill');
  track.style.width = `${percentage}%`;
  label.classList.remove('full-pill', 'balanced', 'light-pill');
  if (Number(open.textContent) === 0) {
    label.textContent = 'At capacity';
    label.classList.add('full-pill');
  } else if (percentage >= 70) {
    label.textContent = 'Busy';
    label.classList.add('balanced');
  } else {
    label.textContent = 'Room available';
    label.classList.add('light-pill');
  }

  queueBody.querySelectorAll(`tr[data-dept="${name}"]`).forEach((row) => {
    const routeNote = row.querySelector('.route-note');
    if (routeNote && row.dataset.state !== 'active') {
      routeNote.textContent = row.dataset.state === 'waiting'
        ? 'Queued · waiting for a department slot'
        : `Assigned · ${open.textContent} slot${Number(open.textContent) === 1 ? '' : 's'} available`;
    }
  });
}

const departmentLabels = { wash: 'Wash & detail', service: 'Service & repair', inspection: 'Inspection' };
const departmentTagClasses = { wash: 'wash-tag', service: 'service-tag', inspection: 'inspection-tag' };

function rowDurationMinutes(row) {
  const text = row.querySelector('td:nth-child(3) small').textContent.toLowerCase();
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/)?.[1] || 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/)?.[1] || 0);
  return hours * 60 + minutes;
}

function compareQueueJobs(a, b) {
  const dueDifference = a.querySelector('.due-date').value.localeCompare(b.querySelector('.due-date').value);
  if (dueDifference) return dueDifference;
  const priorityDifference = Number(a.dataset.priority) - Number(b.dataset.priority);
  if (priorityDifference) return priorityDifference;
  return rowDurationMinutes(a) - rowDurationMinutes(b);
}

function dispatchQueue() {
  Object.keys(departmentLabels).forEach((departmentName) => {
    const department = getDepartment(departmentName);
    if (!department) return;
    const openSlots = Number(department.querySelector('.open').textContent);
    const jobs = [...queueBody.querySelectorAll(`tr[data-dept="${departmentName}"]`)]
      .filter((row) => ['pending', 'waiting'].includes(row.dataset.state))
      .sort(compareQueueJobs);

    jobs.forEach((row, index) => {
      const assigned = index < openSlots;
      const wasWaiting = row.dataset.state === 'waiting';
      row.dataset.state = assigned ? 'pending' : 'waiting';
      row.classList.toggle('blocked-row', !assigned);
      const button = row.querySelector('.complete');
      button.disabled = !assigned;
      button.textContent = assigned ? 'Start job' : 'Waiting';
      const reason = row.querySelector('.reason');
      if (assigned) {
        reason.classList.remove('blocked');
        if (wasWaiting) {
          reason.textContent = 'Department slot available';
          addNotification('Department capacity opened', `${departmentLabels[departmentName]} can start ${row.querySelector('.job-tag').textContent.toLowerCase()} next.`);
        }
      } else {
        reason.classList.add('blocked');
        if (!wasWaiting || reason.textContent === 'Department slot available') reason.textContent = `Waiting for ${departmentLabels[departmentName].toLowerCase()} capacity`;
      }
      row.querySelector('.route-note').textContent = assigned
        ? `Assigned · ${openSlots} slot${openSlots === 1 ? '' : 's'} available`
        : 'Queued · waiting for a department slot';
    });
  });
}

function restoreWorkboard() {
  let state;
  try {
    state = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
  } catch {
    return;
  }
  if (!state) return;
  state.rows?.forEach((saved) => {
    const row = [...queueBody.querySelectorAll('tr')].find((candidate) => (saved.queueKey && candidate.dataset.queueKey === saved.queueKey) || candidate.querySelector('td:nth-child(2) small').textContent === saved.stock);
    if (!row) return;
    row.querySelector('.due-date').value = saved.dueDate;
    if (liveQueue) return;
    row.dataset.state = saved.status;
    if (saved.department) row.dataset.dept = saved.department;
    if (saved.nextDepartment !== undefined) row.dataset.nextDepartment = saved.nextDepartment;
    if (saved.job) row.querySelector('.job-tag').textContent = saved.job;
    if (saved.duration) row.querySelector('td:nth-child(3) small').textContent = saved.duration;
    if (saved.ready !== undefined) row.dataset.ready = saved.ready;
    const routeTag = row.querySelector('.route-tag');
    if (routeTag) routeTag.textContent = departmentLabels[row.dataset.dept] || routeTag.textContent;
    row.querySelector('.complete').dataset.department = row.dataset.dept;
    const button = row.querySelector('.complete');
    if (saved.status === 'waiting') {
      button.disabled = true;
      button.textContent = 'Waiting';
    } else if (saved.status === 'pending') {
      button.disabled = false;
      button.textContent = 'Start job';
    } else if (saved.status === 'active') {
      button.disabled = false;
      button.textContent = 'Complete job';
      row.classList.add('in-progress-row');
    } else if (saved.status === 'completed') {
      button.disabled = true;
      button.textContent = '✓ Done';
      row.classList.add('completed-row');
      row.querySelector('.reason').textContent = 'Job completed';
    }
  });
  if (!liveQueue) {
    state.departments?.forEach((saved) => {
      const card = getDepartment(saved.name);
      if (!card) return;
      card.querySelector('.used').textContent = saved.used;
      card.querySelector('.open').textContent = saved.open;
      updateDepartment(saved.name);
    });
    document.querySelector('#ready-count').innerHTML = `${state.readyCount} <em>vehicles</em>`;
  }
  dispatchQueue();
}

function advanceToNextStage(row) {
  const nextDepartment = row.dataset.nextDepartment;
  if (!nextDepartment) return false;

  const nextJob = row.dataset.nextJob || departmentLabels[nextDepartment];
  const nextDuration = row.dataset.nextDuration || 'Estimate pending';
  row.dataset.dept = nextDepartment;
  row.dataset.nextDepartment = '';
  row.dataset.ready = 'true';
  row.dataset.state = 'waiting';
  row.dataset.priority = String(Number(row.dataset.priority) + 1);
  row.classList.remove('in-progress-row', 'completed-row');
  row.classList.add('blocked-row');
  row.querySelector('.job-tag').className = `job-tag ${departmentTagClasses[nextDepartment] || ''}`;
  row.querySelector('.job-tag').textContent = nextJob;
  row.querySelector('td:nth-child(3) small').textContent = nextDuration;
  row.querySelector('.route-tag').textContent = departmentLabels[nextDepartment] || nextDepartment;
  row.querySelector('.reason').textContent = 'Repair complete · queued for final wash';
  row.querySelector('.reason').classList.add('blocked');
  row.querySelector('.explanation').textContent = 'The repair stage is complete. This vehicle now enters the wash queue, its final required stage.';
  row.querySelector('.complete').dataset.department = nextDepartment;
  dispatchQueue();
  return true;
}

document.querySelectorAll('.explain').forEach((button) => {
  button.addEventListener('click', () => {
    const explanation = button.parentElement.querySelector('.explanation');
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    explanation.hidden = open;
    button.innerHTML = open ? 'Why this job? <span>⌄</span>' : 'Hide reason <span>⌃</span>';
  });
});

queueBody.addEventListener('click', async (event) => {
  const button = event.target.closest('.complete');
  if (!button || button.disabled) return;
  const row = button.closest('tr');
  const departmentName = button.dataset.department;
  const department = getDepartment(departmentName);
  const used = department.querySelector('.used');
  const open = department.querySelector('.open');
  const vehicle = row.querySelector('td:nth-child(2) b').textContent;

  if (liveQueue) {
    const nextStatus = row.dataset.state === 'active' ? 'completed' : 'in_progress';
    try {
      await updateLiveService(row, nextStatus);
      await refreshLiveQueue();
      const action = nextStatus === 'in_progress' ? 'started' : 'completed';
      addNotification('Job ' + action, `${vehicle} ${action} in ${departmentLabels[departmentName]}.`);
      notify(`${vehicle}: job ${action}.`);
    } catch (error) {
      notify(error.message || 'Could not update this job.');
    }
    return;
  }

  if (row.dataset.state === 'pending') {
    if (Number(open.textContent) === 0) return notify(`${departmentName} is at capacity. This job remains in the waiting queue.`);
    used.textContent = Number(used.textContent) + 1;
    open.textContent = Number(open.textContent) - 1;
    row.dataset.state = 'active';
    row.classList.add('in-progress-row');
    row.querySelector('.reason').textContent = 'In progress';
    button.textContent = 'Complete job';
    updateDepartment(departmentName);
    dispatchQueue();
    updatePendingSummary();
    saveWorkboard();
    addNotification('Job started', `${vehicle} is now in progress with the ${departmentName} department.`);
    notify(`${vehicle}: job started. ${open.textContent} ${departmentName} slot(s) remain.`);
    return;
  }

  if (row.dataset.state === 'active') {
    used.textContent = Math.max(0, Number(used.textContent) - 1);
    open.textContent = Number(open.textContent) + 1;
    if (advanceToNextStage(row)) {
      updateDepartment(departmentName);
      dispatchQueue();
      updatePendingSummary();
      saveWorkboard();
      addNotification('Repair complete · wash queued', `${vehicle} has finished its repair and is queued for the final wash stage.`);
      notify(`${vehicle}: repair complete. Wash is next.`);
      return;
    }
    row.dataset.state = 'completed';
    row.classList.remove('in-progress-row');
    row.classList.add('completed-row');
    row.querySelector('.reason').textContent = 'Job completed';
    button.textContent = '✓ Done';
    button.disabled = true;
    updateDepartment(departmentName);
    dispatchQueue();
    updatePendingSummary();
    if (row.dataset.ready === 'true') {
      document.querySelector('#ready-count').innerHTML = `${Number(document.querySelector('#ready-count').textContent.match(/\d+/)[0]) + 1} <em>vehicles</em>`;
    }
    saveWorkboard();
    addNotification('Job completed', `${vehicle} is complete. ${departmentName} capacity has been updated.`);
    notify(`${vehicle}: job completed. Department capacity updated.`);
  }
});

document.querySelector('#resequence').addEventListener('click', () => {
  const rows = [...queueBody.querySelectorAll('tr')];
  const stateRank = { pending: 0, waiting: 1, active: 2, completed: 3 };
  rows.sort((a, b) => {
    const stateDifference = stateRank[a.dataset.state] - stateRank[b.dataset.state];
    if (stateDifference) return stateDifference;
    return ['pending', 'waiting'].includes(a.dataset.state) ? compareQueueJobs(a, b) : Number(a.dataset.priority) - Number(b.dataset.priority);
  });
  rows.forEach((row, index) => {
    queueBody.append(row);
    if (['pending', 'waiting'].includes(row.dataset.state)) {
      row.dataset.priority = String(index + 1);
      row.querySelector('.priority').textContent = String(index + 1).padStart(2, '0');
    }
  });
  dispatchQueue();
  updatePendingSummary();
  saveWorkboard();
  notify('Queue refreshed using due dates, queue priority, job duration, and department capacity.');
});

const search = document.querySelector('#vehicle-search');
const filterButton = document.querySelector('#filter-button');
let departmentFilter = 'all';
const filters = [
  ['all', 'All departments'],
  ['wash', 'Wash & detail'],
  ['service', 'Service & repair'],
  ['inspection', 'Inspection'],
];
function applyFilters() {
  const query = search.value.trim().toLowerCase();
  let visible = 0;
  queueBody.querySelectorAll('tr').forEach((row) => {
    const matches = row.textContent.toLowerCase().includes(query) && (departmentFilter === 'all' || row.dataset.dept === departmentFilter);
    row.hidden = !matches;
    if (matches) visible += 1;
  });
  document.querySelector('#empty-state').hidden = visible > 0;
}
search.addEventListener('input', applyFilters);
filterButton.addEventListener('click', () => {
  const index = filters.findIndex(([key]) => key === departmentFilter);
  const next = filters[(index + 1) % filters.length];
  departmentFilter = next[0];
  filterButton.innerHTML = `${next[1]} <span>⌄</span>`;
  applyFilters();
});

queueBody.addEventListener('change', (event) => {
  const row = event.target.closest('tr');
  if (!row || !event.target.matches('.due-date')) return;
  dispatchQueue();
  saveWorkboard();
  addNotification('Due date updated', `${row.querySelector('td:nth-child(2) b').textContent} is now due ${event.target.value}.`);
  notify('Due date saved for this demo.');
});

const notificationButton = document.querySelector('#notifications-button');
const notificationPanel = document.querySelector('#notification-panel');
notificationButton.addEventListener('click', () => {
  const open = notificationButton.getAttribute('aria-expanded') === 'true';
  notificationButton.setAttribute('aria-expanded', String(!open));
  notificationPanel.hidden = open;
});
document.querySelector('#mark-notifications-read').addEventListener('click', () => {
  notifications = notifications.map((item) => ({ ...item, unread: false }));
  renderNotifications();
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.notification-wrap')) {
    notificationButton.setAttribute('aria-expanded', 'false');
    notificationPanel.hidden = true;
  }
});

const dialog = document.querySelector('#capacity-dialog');
document.querySelector('#capacity-help').addEventListener('click', () => dialog.showModal());
document.querySelector('#help-button').addEventListener('click', () => dialog.showModal());
liveRecords = await readVehicleRecords();
liveQueue = liveRecords.length > 0;
if (liveQueue) {
  updateLiveDepartmentCapacity(liveRecords);
  renderLiveQueue(liveRecords);
  updateReadyEstimate(liveRecords);
}
restoreWorkboard();
dispatchQueue();
updatePendingSummary();
renderNotifications();
