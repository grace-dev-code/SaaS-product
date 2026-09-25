const queueBody = document.querySelector('#queue-body');
const toast = document.querySelector('#toast');
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2800);
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

document.querySelectorAll('.complete:not(:disabled)').forEach((button) => {
  button.addEventListener('click', () => {
    const row = button.closest('tr');
    const department = document.querySelector(`.department-card[data-department="${button.dataset.department}"]`);
    const used = department.querySelector('.used');
    const open = department.querySelector('.open');
    const track = department.querySelector('.bar i');
    const capacity = Number(used.textContent) + Number(open.textContent);
    const newUsed = Math.max(0, Number(used.textContent) - 1);
    used.textContent = newUsed;
    open.textContent = capacity - newUsed;
    track.style.width = `${Math.round((newUsed / capacity) * 100)}%`;
    row.classList.add('completed-row');
    row.querySelector('.reason').textContent = 'Job completed';
    button.textContent = '✓ Done';
    button.disabled = true;
    document.querySelector('#ready-count').innerHTML = `${Number(document.querySelector('#ready-count').textContent.match(/\d+/)[0]) + 1} <em>vehicles</em>`;
    notify(`${row.querySelector('td:nth-child(2) b').textContent}: job marked complete. Department capacity updated.`);
  });
});

document.querySelector('#resequence').addEventListener('click', () => {
  const rows = [...queueBody.querySelectorAll('tr')];
  rows.sort((a, b) => {
    const aDone = a.classList.contains('completed-row');
    const bDone = b.classList.contains('completed-row');
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aBlocked = a.classList.contains('blocked-row');
    const bBlocked = b.classList.contains('blocked-row');
    if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;
    return Number(a.dataset.priority) - Number(b.dataset.priority);
  });
  rows.forEach((row, index) => {
    queueBody.append(row);
    row.dataset.priority = index + 1;
    row.querySelector('.priority').textContent = String(index + 1).padStart(2, '0');
  });
  notify('Plan refreshed using deadlines, job dependencies, and open department slots.');
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

const dialog = document.querySelector('#capacity-dialog');
document.querySelector('#capacity-help').addEventListener('click', () => dialog.showModal());
