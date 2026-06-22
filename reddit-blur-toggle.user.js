// ==UserScript==
// @name         Reddit NSFW Blur Toggle
// @namespace    https://github.com/damoscodehub/reddit-blur-toggle.git
// @version      1.0.0
// @description  Inserts a button in the Reddit header to toggle NSFW media blur on/off
// @author       damoscodehub
// @updateURL    https://raw.githubusercontent.com/damoscodehub/reddit-blur-toggle/main/reddit-blur-toggle.user.js
// @downloadURL  https://raw.githubusercontent.com/damoscodehub/reddit-blur-toggle/main/reddit-blur-toggle.user.js
// @match        https://www.reddit.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'rbt_nsfw_blur_enabled';
    const GQL_URL = 'https://www.reddit.com/svc/shreddit/graphql';

    // Default to true (blur on) — matches Reddit's default for new accounts.
    // localStorage persists the user's last toggled state across page loads.
    let blurEnabled = localStorage.getItem(STORAGE_KEY) !== 'false';

    // Reddit's csrf_token is a non-HttpOnly cookie set on every page load.
    // Fallback scans inline <script> tags in case the cookie isn't readable.
    function getCsrfToken() {
        const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
        if (m) return decodeURIComponent(m[1]);

        for (const s of document.querySelectorAll('script:not([src])')) {
            const hit = s.textContent.match(/"csrf_token"\s*:\s*"([a-f0-9]{32})"/);
            if (hit) return hit[1];
        }
        return null;
    }

    async function setBlur(enabled) {
        const csrf = getCsrfToken();
        if (!csrf) throw new Error('CSRF token not found — are you logged in?');

        const res = await fetch(GQL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                operation: 'UpdateAccountPreferences',
                variables: { input: { isNsfwMediaBlocked: enabled } },
                csrf_token: csrf,
            }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        if (json?.data?.updateAccountPreferences?.ok !== true)
            throw new Error(JSON.stringify(json?.errors ?? json));
    }

    // slashed=true  → eye with diagonal slash → blur is currently ON (content hidden)
    // slashed=false → open eye               → blur is currently OFF (content visible)
    function eyeIcon(slashed) {
        const slash = slashed
            ? `<line x1="3" y1="2" x2="17" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`
            : '';
        return `<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"
                     xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
            <path d="M10 5C5 5 0.5 10 0.5 10S5 15 10 15s9.5-5 9.5-5S15 5 10 5zm0 8a3 3 0 110-6 3 3 0 010 6z"/>
            ${slash}
        </svg>`;
    }

    function createBtn() {
        const btn = document.createElement('button');
        btn.id = 'nsfw-blur-toggle';
        btn.style.cssText = [
            'display:inline-flex', 'align-items:center', 'justify-content:center',
            'gap:4px', 'height:40px', 'padding:0 10px',
            'background:none', 'border:none', 'border-radius:4px',
            'cursor:pointer', 'font-size:11px', 'font-weight:700',
            'letter-spacing:0.02em', 'transition:background 0.15s,color 0.15s',
            'user-select:none', 'white-space:nowrap',
        ].join(';');

        function render() {
            btn.innerHTML = `${eyeIcon(blurEnabled)}<span>NSFW</span>`;
            btn.title = blurEnabled
                ? 'NSFW blur is ON — click to disable'
                : 'NSFW blur is OFF — click to enable';
            // Orange when blur is OFF to signal "NSFW content is visible"
            btn.style.color = blurEnabled
                ? 'var(--color-neutral-content-strong, #878a8c)'
                : '#ff4500';
        }
        render();

        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'var(--rpl-color-secondary-background, rgba(0,0,0,.08))';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'none';
        });

        btn.addEventListener('click', async () => {
            const next = !blurEnabled;
            btn.disabled = true;
            btn.style.opacity = '0.5';
            try {
                await setBlur(next);
                blurEnabled = next;
                localStorage.setItem(STORAGE_KEY, String(blurEnabled));
                render();
                // Reddit applies blur via CSS at page-load time, not dynamically.
                // Reload so the new preference takes effect on all content.
                setTimeout(() => location.reload(), 600);
            } catch (err) {
                console.error('[NSFW Toggle]', err);
                alert('Failed to update NSFW blur setting.\n\n' + err.message);
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        });

        return btn;
    }

    function insert() {
        if (document.getElementById('nsfw-blur-toggle')) return;

        // Insert before the inbox/notifications button in the header action bar.
        // data-part="inbox" is a stable marker used by Reddit's header layout.
        const inbox = document.querySelector('span[data-part="inbox"]');
        if (!inbox) return;

        const wrapper = document.createElement('span');
        wrapper.setAttribute('data-part', 'nsfw-blur-toggle');
        inbox.parentNode.insertBefore(wrapper, inbox);
        wrapper.appendChild(createBtn());
    }

    // Reddit's header is rendered by web components after DOMContentLoaded,
    // so we observe the DOM until the insertion point appears.
    const obs = new MutationObserver(insert);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    insert();

    const cleanup = setInterval(() => {
        if (document.getElementById('nsfw-blur-toggle')) {
            obs.disconnect();
            clearInterval(cleanup);
        }
    }, 500);
})();
