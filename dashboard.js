const queueBody = document.querySelector('#queue-body');
const toast = document.querySelector('#toast');
const storageKey = 'flowdrive-workboard-v1';
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
      stock: row.querySelector('td:nth-child(2) small').textContent,
      status: row.dataset.state,
      dueDate: row.querySelector('.due-date').value,
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
      routeNote.textContent = Number(open.textContent) === 0
        ? 'AI routed · at capacity'
        : `AI routed · ${open.textContent} slot${Number(open.textContent) === 1 ? '' : 's'} open`;
    }
  });

  if (Number(open.textContent) > 0) {
    const waitingRow = queueBody.querySelector(`tr[data-state="waiting"][data-dept="${name}"]`);
    if (waitingRow) {
      waitingRow.dataset.state = 'pending';
      waitingRow.classList.remove('blocked-row');
      waitingRow.querySelector('.reason').textContent = 'Department slot available';
      waitingRow.querySelector('.reason').classList.remove('blocked');
      const startButton = waitingRow.querySelector('.complete');
      startButton.disabled = false;
      startButton.textContent = 'Start job';
      addNotification('Department capacity opened', `${name} can now start the waiting ${waitingRow.querySelector('.job-tag').textContent.toLowerCase()} job.`);
    }
  }
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
    const row = [...queueBody.querySelectorAll('tr')].find((candidate) => candidate.querySelector('td:nth-child(2) small').textContent === saved.stock);
    if (!row) return;
    row.dataset.state = saved.status;
    row.querySelector('.due-date').value = saved.dueDate;
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
  state.departments?.forEach((saved) => {
    const card = getDepartment(saved.name);
    if (!card) return;
    card.querySelector('.used').textContent = saved.used;
    card.querySelector('.open').textContent = saved.open;
    updateDepartment(saved.name);
  });
  document.querySelector('#ready-count').innerHTML = `${state.readyCount} <em>vehicles</em>`;
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

queueBody.addEventListener('click', (event) => {
  const button = event.target.closest('.complete');
  if (!button || button.disabled) return;
  const row = button.closest('tr');
  const departmentName = button.dataset.department;
  const department = getDepartment(departmentName);
  const used = department.querySelector('.used');
  const open = department.querySelector('.open');
  const vehicle = row.querySelector('td:nth-child(2) b').textContent;

  if (row.dataset.state === 'pending') {
    if (Number(open.textContent) === 0) return notify(`${departmentName} is at capacity. This job remains in the waiting queue.`);
    used.textContent = Number(used.textContent) + 1;
    open.textContent = Number(open.textContent) - 1;
    row.dataset.state = 'active';
    row.classList.add('in-progress-row');
    row.querySelector('.reason').textContent = 'In progress';
    button.textContent = 'Complete job';
    updateDepartment(departmentName);
    updatePendingSummary();
    saveWorkboard();
    addNotification('Job started', `${vehicle} is now in progress with the ${departmentName} department.`);
    notify(`${vehicle}: job started. ${open.textContent} ${departmentName} slot(s) remain.`);
    return;
  }

  if (row.dataset.state === 'active') {
    used.textContent = Math.max(0, Number(used.textContent) - 1);
    open.textContent = Number(open.textContent) + 1;
    row.dataset.state = 'completed';
    row.classList.remove('in-progress-row');
    row.classList.add('completed-row');
    row.querySelector('.reason').textContent = 'Job completed';
    button.textContent = '✓ Done';
    button.disabled = true;
    updateDepartment(departmentName);
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
    if (a.dataset.state === 'pending') {
      const dueDifference = a.querySelector('.due-date').value.localeCompare(b.querySelector('.due-date').value);
      if (dueDifference) return dueDifference;
    }
    return Number(a.dataset.priority) - Number(b.dataset.priority);
  });
  rows.forEach((row, index) => {
    queueBody.append(row);
    if (row.dataset.state !== 'active') row.querySelector('.priority').textContent = String(index + 1).padStart(2, '0');
  });
  notify('Work queue refreshed using due dates, job steps, and department capacity.');
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
restoreWorkboard();
updatePendingSummary();
renderNotifications();
