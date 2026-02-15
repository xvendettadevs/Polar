let toastShown = false;
let inlineShown = false;

function showToastNotification() {
  if (toastShown || document.getElementById('polar-market-toast')) return;
  
  const toast = document.createElement('div');
  toast.id = 'polar-market-toast';
  toast.className = 'polar-toast-container';
  
  const logoUrl = chrome.runtime.getURL('icons/icon48.png');

  toast.innerHTML = `
    <div class="polar-toast-content">
      <div class="polar-toast-header">
        <div class="polar-toast-app-info">
          <img src="${logoUrl}" class="polar-toast-app-icon">
          <span>Polar Terminal</span>
        </div>
        <button class="polar-toast-close-btn">✕</button>
      </div>
      <div class="polar-toast-body">
        <div class="polar-toast-title">Market identified</div>
        <div class="polar-toast-desc">Your analysis is being processed</div>
      </div>
    </div>
  `;

  document.body.appendChild(toast);
  toastShown = true;

  const closeBtn = toast.querySelector('.polar-toast-close-btn');
  closeBtn.onclick = () => {
    toast.classList.add('polar-toast-exit');
    setTimeout(() => toast.remove(), 300);
  };

  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('polar-toast-exit');
      setTimeout(() => toast.remove(), 300);
    }
  }, 6000);
}

function showInlineNotification() {
  if (inlineShown) return;
  
  const wrapper = document.querySelector('.polar-btn-wrapper');
  if (!wrapper) return;

  const notification = document.createElement('div');
  notification.className = 'polar-market-notification';
  notification.innerHTML = `
    <div class="polar-notif-title">Market identified</div>
    <div class="polar-notif-sub">Processing analysis...</div>
  `;

  wrapper.appendChild(notification);
  inlineShown = true;

  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 500);
  }, 5000);
}

function togglePolarPopup() {
  const existingBackdrop = document.getElementById('polar-backdrop');
  
  if (existingBackdrop) {
    existingBackdrop.style.opacity = '0';
    setTimeout(() => existingBackdrop.remove(), 200);
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.id = 'polar-backdrop';

  const modalContainer = document.createElement('div');
  modalContainer.className = 'polar-modal-container';
  
  const iframe = document.createElement('iframe');
  iframe.id = 'polar-overlay-frame';
  iframe.src = chrome.runtime.getURL('popup.html');
  iframe.allow = "clipboard-write";
  
  const closeBtn = document.createElement('button');
  closeBtn.id = 'polar-close-btn';
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>`;
  closeBtn.onclick = togglePolarPopup;

  modalContainer.appendChild(closeBtn);
  modalContainer.appendChild(iframe);
  backdrop.appendChild(modalContainer);
  document.body.appendChild(backdrop);

  backdrop.onclick = (e) => {
    if (e.target === backdrop) {
      togglePolarPopup();
    }
  };
}

function injectPolarButton() {
  if (document.getElementById('polar-inject-btn')) return;

  const h1 = document.querySelector('h1');
  if (!h1) return;

  const container = document.createElement('span');
  container.id = 'polar-inject-btn';
  container.className = 'polar-btn-wrapper';
  
  const logoUrl = chrome.runtime.getURL('icons/icon48.png');
  
  container.innerHTML = `
    <button class="polar-glass-btn" type="button">
      <div class="polar-logo-container">
        <img src="${logoUrl}" class="polar-logo-icon" alt="Polar">
      </div>
      <span class="polar-text">Polar Scan</span>
    </button>
  `;
  
  const btn = container.querySelector('button');
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePolarPopup();
  };

  h1.appendChild(container);
  
  setTimeout(showToastNotification, 2000);
  setTimeout(showInlineNotification, 10000);
}
  


const observer = new MutationObserver(injectPolarButton);
observer.observe(document.body, { childList: true, subtree: true });
setInterval(injectPolarButton, 1000);