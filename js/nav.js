import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { clearProfileCache, getProfile } from './profile.js';
import { initials } from './utils.js';
import { friendlyError, setButtonBusy, showToast } from './ui.js';
import { TIMER_STORAGE_PREFIX } from './config.js';

const NAV_ITEMS = [
  { file: 'timer.html', label: 'Timer' },
  { file: 'leaderboard.html', label: 'Leaderboard' },
  { file: 'calendar.html', label: 'Calendar' },
  { file: 'levels.html', label: 'Levels' },
  { file: 'stats.html', label: 'Stats', longLabel: 'My stats' },
  { file: 'profile.html', label: 'Profile' }
];

function currentFile() {
  return window.location.pathname.split('/').pop() || 'timer.html';
}

function navigationMarkup() {
  const active = currentFile();
  return NAV_ITEMS.map((item) => {
    const isActive = item.file === active;
    return `<a class="nav-link${isActive ? ' is-active' : ''}" href="./${item.file}"${
      isActive ? ' aria-current="page"' : ''
    }>${item.longLabel ?? item.label}</a>`;
  }).join('');
}

function authHeaderMarkup() {
  return `
    <header class="site-header site-header-auth">
      <div class="container site-header-inner">
        <a class="brand" href="./sign-in.html" aria-label="TbsRace home">
          <span class="brand-tbs">Tbs</span><span class="brand-race">Race</span>
        </a>
      </div>
    </header>`;
}

function appHeaderMarkup() {
  return `
    <header class="site-header">
      <div class="container site-header-inner">
        <a class="brand" href="./timer.html" aria-label="TbsRace timer">
          <span class="brand-tbs">Tbs</span><span class="brand-race">Race</span>
        </a>

        <nav class="main-nav" id="primary-nav" aria-label="Primary navigation">
          ${navigationMarkup()}
        </nav>

        <div class="header-actions">
          <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-nav"
            aria-label="Open navigation menu">
            <span class="menu-toggle-lines" aria-hidden="true"><span></span><span></span><span></span></span>
          </button>

          <div class="user-menu">
            <button class="avatar-button" type="button" aria-haspopup="menu" aria-expanded="false"
              aria-label="Open account menu"><span class="avatar-initials">?</span></button>
            <div class="user-dropdown" role="menu" hidden>
              <div class="user-dropdown-head">
                <span class="user-dropdown-name">Student</span>
                <span class="user-dropdown-class">TBS</span>
              </div>
              <div class="dropdown-divider"></div>
              <a class="dropdown-item" href="./profile.html" role="menuitem">Edit profile</a>
              <button class="dropdown-item" type="button" role="menuitem" data-sign-out>Sign out</button>
            </div>
          </div>
        </div>
      </div>
      <button class="nav-scrim" type="button" aria-label="Close navigation menu" hidden></button>
    </header>`;
}

function setUpMenu(header) {
  const toggle = header.querySelector('.menu-toggle');
  const nav = header.querySelector('.main-nav');
  const scrim = header.querySelector('.nav-scrim');
  if (!toggle || !nav) return;

  const close = () => {
    header.classList.remove('nav-open');
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation menu');
    if (scrim) scrim.hidden = true;
  };

  const open = () => {
    header.classList.add('nav-open');
    document.body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close navigation menu');
    if (scrim) scrim.hidden = false;
  };

  toggle.addEventListener('click', () => {
    if (header.classList.contains('nav-open')) close();
    else open();
  });

  scrim?.addEventListener('click', close);
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) close();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) close();
  });

  return { close };
}

function setUpUserMenu(header, closeNav) {
  const userMenu = header.querySelector('.user-menu');
  const button = header.querySelector('.avatar-button');
  const dropdown = header.querySelector('.user-dropdown');
  if (!userMenu || !button || !dropdown) return null;

  const close = () => {
    dropdown.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  const open = () => {
    dropdown.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    dropdown.querySelector('[role="menuitem"]')?.focus();
  };

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (dropdown.hidden) {
      closeNav?.();
      open();
    } else {
      close();
    }
  });

  document.addEventListener('click', (event) => {
    if (!userMenu.contains(event.target)) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close();
      closeNav?.();
    }
  });

  return { close };
}

function updateIdentity(header, profile, metadataName = '') {
  const name = profile?.full_name || metadataName || 'Student';
  const classYear = profile?.class_year || 'TBS';
  const avatar = header.querySelector('.avatar-initials');
  const nameElement = header.querySelector('.user-dropdown-name');
  const classElement = header.querySelector('.user-dropdown-class');
  const button = header.querySelector('.avatar-button');

  if (avatar) avatar.textContent = initials(name);
  if (nameElement) nameElement.textContent = name;
  if (classElement) classElement.textContent = classYear;
  if (button) button.setAttribute('aria-label', `Open account menu for ${name}`);
}

/** Refresh the avatar, name and class after a profile update. */
export function refreshHeaderIdentity(profile) {
  const header = document.querySelector('#site-header .site-header');
  if (header) updateIdentity(header, profile);
}

function clearLocalTimerState() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(TIMER_STORAGE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}

function setUpSignOut(header) {
  const signOutButton = header.querySelector('[data-sign-out]');
  if (!signOutButton) return;

  signOutButton.addEventListener('click', async () => {
    if (!isSupabaseConfigured || !supabase) {
      window.location.replace('./sign-in.html');
      return;
    }
    setButtonBusy(signOutButton, true, 'Signing out…');
    try {
      clearLocalTimerState();
      clearProfileCache();
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      window.location.replace('./sign-in.html');
    } catch (error) {
      setButtonBusy(signOutButton, false);
      showToast(friendlyError(error, 'We could not sign you out. Please try again.'), 'error');
    }
  });
}

async function hydrateHeader(header) {
  if (!isSupabaseConfigured || !supabase) return;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    if (!user) return;

    const metadataName = String(user.user_metadata?.full_name ?? '');
    updateIdentity(header, null, metadataName);

    try {
      const profile = await getProfile();
      updateIdentity(header, profile);
    } catch {
      // The guard or page will show a clear profile error; the header keeps a
      // safe metadata-based fallback.
    }
  } catch {
    // Header identity is non-critical. Pages still have their own error states.
  }
}

function initHeader() {
  const host = document.getElementById('site-header');
  if (!host || host.dataset.ready === 'true') return;

  const mode = host.dataset.nav === 'auth' ? 'auth' : 'app';
  host.dataset.ready = 'true';

  if (mode === 'auth') {
    host.innerHTML = authHeaderMarkup();
    return;
  }

  host.innerHTML = appHeaderMarkup();
  const header = host.querySelector('.site-header');
  const navApi = setUpMenu(header);
  setUpUserMenu(header, navApi?.close);
  setUpSignOut(header);
  hydrateHeader(header);
}

initHeader();
