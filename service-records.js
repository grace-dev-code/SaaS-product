// Keep the legacy service-record URL working, but route staff into the unified
// service workflow so IndexedDB records can be linked to canonical vehicles.
const target = new URL('car-information.html', window.location.href);
target.search = window.location.search;
target.hash = window.location.hash;
window.location.replace(target.href);
