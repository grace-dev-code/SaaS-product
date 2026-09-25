document.querySelectorAll('.why-button').forEach((button) => {
  button.addEventListener('click', () => {
    const detail = button.parentElement.querySelector('.reason-detail');
    const isOpen = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!isOpen));
    button.textContent = isOpen ? 'Why?' : 'Got it';
    detail.hidden = isOpen;
  });
});
