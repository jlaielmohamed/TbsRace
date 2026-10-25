/**
 * Classic (non-module) script.
 *
 * Browsers block ES modules and cross-origin requests on file:// URLs, so none
 * of the app's normal scripts run when index.html is opened by double-clicking.
 * This file is deliberately a plain script so it still executes in that case,
 * and explains the problem instead of leaving the page stuck on "loading".
 */

(function () {
  if (window.location.protocol !== 'file:') return;

  function render() {
    var body = document.body;
    if (!body) return;

    body.className = 'file-mode';
    body.replaceChildren();

    var main = document.createElement('main');
    main.className = 'file-mode-main';
    main.id = 'main';

    var card = document.createElement('section');
    card.className = 'file-mode-card';

    var brand = document.createElement('p');
    brand.className = 'brand brand-large';
    var brandTbs = document.createElement('span');
    brandTbs.className = 'brand-tbs';
    brandTbs.textContent = 'Tbs';
    var brandRace = document.createElement('span');
    brandRace.className = 'brand-race';
    brandRace.textContent = 'Race';
    brand.append(brandTbs, brandRace);

    var title = document.createElement('h1');
    title.textContent = 'This page needs a web server';

    var lead = document.createElement('p');
    lead.textContent =
      'You opened this file directly from disk (the address starts with file://). ' +
      'Browsers block JavaScript modules and Supabase requests on local files, ' +
      'so the app cannot start. Nothing is broken and the deployed site is unaffected.';

    var how = document.createElement('p');
    how.textContent = 'From the project folder, start the included server:';

    var commandOne = document.createElement('pre');
    commandOne.textContent = 'node serve.mjs';

    var then = document.createElement('p');
    then.textContent = 'Then open http://localhost:8080 in your browser.';

    var alternative = document.createElement('p');
    alternative.className = 'file-mode-note';
    alternative.textContent = 'No Node.js? Any static server works, for example:';

    var commandTwo = document.createElement('pre');
    commandTwo.textContent = 'npx --yes http-server . -p 8080 -c-1';

    card.append(brand, title, lead, how, commandOne, then, alternative, commandTwo);
    main.append(card);
    body.append(main);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }
})();
