// ==UserScript==
// @name          Azure DevOps Release Category Filter Popup
// @namespace     http://tampermonkey.net/
// @version       4.4
// @match         https://dev.azure.com/*
// @grant         none
// @downloadURL   https://raw.githubusercontent.com/KoroVaik/Tempermonkey/refs/heads/main/CreateTestRunTools.js
// @updateURL     https://raw.githubusercontent.com/KoroVaik/Tempermonkey/refs/heads/main/CreateTestRunTools.js
// ==/UserScript==

(function () {
    'use strict';

    const staticCategories = ['TrackAccreditation', 'ProductionOnly', 'Smoke', 'PostLayoffReport', 'Registration', 'Production', 'DbApi', 'PublicApi', 'VetsList'];
    let popup = null;
    let observer = null;
    const MIN_BOTTOM_MARGIN = 400;

    const INCLUDED_COLOR_CLASS = 'category-included';
    const EXCLUDED_COLOR_CLASS = 'category-excluded';

    const clickAutomatedTriggerNodes = () => {
            document.querySelectorAll('div.automated-trigger-environment-node')
                .forEach(el => el.click());
    };

    const injectStyles = () => {
        if (document.getElementById('category-filter-styles')) return;

        const style = document.createElement('style');
        style.id = 'category-filter-styles';
        style.textContent = `
            .category-included {
                background-color: rgba(0, 128, 0, 0.6) !important;
            }
            .category-excluded {
                background-color: rgba(255, 0, 0, 0.6) !important;
            }
            #category-list div[data-category-name]:hover {
                background-color: rgba(255, 255, 255, 0.2) !important;
            }
            #category-list div.category-included:hover {
                background-color: rgba(0, 128, 0, 0.4) !important;
            }
            #category-list div.category-excluded:hover {
                background-color: rgba(255, 0, 0, 0.4) !important;
            }
        `;
        document.head.appendChild(style);
    };

    injectStyles();

    const createPopup = (releasePanel) => {
        if (popup) return;

        const preInit = document.evaluate(
            "(//div[.//div[text()='Filter'] and @class='ms-List-cell']//pre)[2]",
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (!preInit) return;

        const parent = releasePanel.parentElement || document.body;

        popup = document.createElement('div');
        popup.style.position = 'absolute';
        popup.style.width = '340px';
        popup.style.background = '#0B3D91';
        popup.style.color = '#fff';
        popup.style.border = '1px solid #ccc';
        popup.style.borderRadius = '8px';
        popup.style.padding = '10px';
        popup.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        popup.style.zIndex = 9999;
        popup.style.userSelect = 'none';
        popup.style.maxHeight = '80vh';
        popup.style.overflowY = 'auto';
        popup.addEventListener('mousedown', e => e.stopPropagation());
        popup.addEventListener('click', e => e.stopPropagation());

        const preRect = preInit.getBoundingClientRect();
        const releaseRect = releasePanel.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        let topPos = preRect.top + scrollTop - parentRect.top;

        const maxTop = window.scrollY + window.innerHeight - popup.offsetHeight - MIN_BOTTOM_MARGIN;
        if (topPos > maxTop) topPos = maxTop;

        popup.style.top = topPos + 'px';
        popup.style.left = (releaseRect.left + scrollLeft - 360 - parentRect.left) + 'px';

        parent.appendChild(popup);

        const header = document.createElement('div');
        header.style.display = 'grid';
        header.style.gridTemplateColumns = '50px 1fr 50px 40px';
        header.style.fontWeight = 'bold';
        header.style.marginBottom = '8px';
        header.style.columnGap = '5px';

        const headers = ['Exclude', 'Category', 'Include', ''];
        headers.forEach((text) => {
            const span = document.createElement('span');
            span.textContent = text;
            if (text === 'Category') span.style.textAlign = 'center';
            if (text === 'Exclude') span.style.textAlign = 'center';
            header.appendChild(span);
        });
        popup.appendChild(header);

        const list = document.createElement('div');
        list.id = 'category-list';
        popup.appendChild(list);

        const filterInput = document.createElement('textarea');
        filterInput.style.width = '100%';
        filterInput.style.height = 'auto';
        filterInput.style.minHeight = '40px';
        filterInput.style.resize = 'none';
        filterInput.style.overflow = 'hidden';
        filterInput.style.whiteSpace = 'pre-wrap';
        popup.appendChild(filterInput);

        const autoResize = (el) => {
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        };
        filterInput.addEventListener('input', () => autoResize(filterInput));
        autoResize(filterInput);

        const setBtn = document.createElement('button');
        setBtn.textContent = 'Set Filter';
        setBtn.style.backgroundColor = '#006400';
        setBtn.style.color = '#fff';

        const clearAllBtn = document.createElement('button');
        clearAllBtn.textContent = 'Clear All';
        clearAllBtn.style.backgroundColor = '#8B0000';
        clearAllBtn.style.color = '#fff';
        clearAllBtn.style.marginRight = '80px';
        clearAllBtn.addEventListener('click', () => {
            list.querySelectorAll('input[type=radio]').forEach(r => (r.checked = false));
            updateDraft();
            list.querySelectorAll('div[data-category-name]').forEach(row => {
                const incl = row.querySelector('input[value="incl"]');
                const excl = row.querySelector('input[value="excl"]');
                updateCategoryRowStyle(row, incl, excl);
            });
        });

        const controlsContainer = document.createElement('div');
        controlsContainer.style.textAlign = 'right';
        controlsContainer.style.marginTop = '5px';
        controlsContainer.appendChild(clearAllBtn);
        controlsContainer.appendChild(setBtn);
        popup.appendChild(controlsContainer);

        parent.appendChild(popup);

        const existingFilter = preInit.textContent.trim();
        filterInput.value = existingFilter;

        const parsedCats = existingFilter.match(/Category!?=([A-Za-z0-9]+)/g)?.map(x => x.replace('Category!=','').replace('Category=','')) || [];
        const foundCats = Array.from(new Set([...staticCategories, ...parsedCats]));

        const updateCategoryRowStyle = (row, inclRadio, exclRadio) => {
            row.classList.remove(INCLUDED_COLOR_CLASS, EXCLUDED_COLOR_CLASS);
            if (inclRadio.checked) {
                row.classList.add(INCLUDED_COLOR_CLASS);
            } else if (exclRadio.checked) {
                row.classList.add(EXCLUDED_COLOR_CLASS);
            }
        };

        const renderList = () => {
            list.innerHTML = '';
            foundCats.forEach(cat => {
                const row = document.createElement('div');
                row.dataset.categoryName = cat;
                row.style.display = 'grid';
                row.style.gridTemplateColumns = '40px 1fr 50px 40px';
                row.style.alignItems = 'center';
                row.style.marginBottom = '4px';
                row.style.padding = '2px 4px';
                row.style.borderRadius = '4px';
                row.style.transition = 'background-color 0.2s';

                const excl = document.createElement('input');
                excl.type = 'radio';
                excl.name = 'cat-' + cat;
                excl.value = 'excl';
                if (existingFilter.split('&').includes(`Category!=${cat}`)) excl.checked = true;

                const name = document.createElement('span');
                name.textContent = cat;
                name.style.display = 'block';
                name.style.textAlign = 'center';

                const incl = document.createElement('input');
                incl.type = 'radio';
                incl.name = 'cat-' + cat;
                incl.value = 'incl';
                if (existingFilter.split('&').includes(`Category=${cat}`)) incl.checked = true;

                const clrBtn = document.createElement('button');
                clrBtn.textContent = 'Clr';
                clrBtn.style.fontSize = '10px';
                clrBtn.style.padding = '2px';
                clrBtn.style.marginLeft = '5px';
                clrBtn.style.backgroundColor = '#555';
                clrBtn.style.color = '#fff';
                clrBtn.addEventListener('click', () => {
                    incl.checked = false;
                    excl.checked = false;
                    updateDraft();
                    updateCategoryRowStyle(row, incl, excl);
                });

                row.appendChild(excl);
                row.appendChild(name);
                row.appendChild(incl);
                row.appendChild(clrBtn);

                list.appendChild(row);

                incl.addEventListener('change', () => {
                    updateDraft();
                    updateCategoryRowStyle(row, incl, excl);
                });
                excl.addEventListener('change', () => {
                    updateDraft();
                    updateCategoryRowStyle(row, incl, excl);
                });

                updateCategoryRowStyle(row, incl, excl);
            });
        };

        const updateDraft = () => {
            const checked = list.querySelectorAll('input[type=radio]:checked');
            const parts = Array.from(checked).map(r => {
                const cat = r.name.replace('cat-', '');
                return r.value === 'incl' ? `Category=${cat}` : `Category!=${cat}`;
            });
            filterInput.value = parts.join('&');
            autoResize(filterInput);
        };

        setBtn.addEventListener('click', () => {
            const pre = document.evaluate(
                "(//div[.//div[text()='Filter'] and @class='ms-List-cell']//pre)[2]",
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

            if (!pre) { alert("Filter element not found!"); return; }

            pre.click();

            setTimeout(() => {
                const input = document.evaluate(
                    "//div[.//div[text()='Filter'] and @class='ms-List-cell']//input",
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                ).singleNodeValue;

                if (!input) { alert("Filter input not found!"); return; }

                input.focus();
                input.value = filterInput.value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.blur();
            }, 50);
        });

        renderList();
    };

    const observeReleasePanel = () => {
        observer = new MutationObserver(() => {
            const panel = document.querySelector('div.create-release-panel-content');
            const pre = document.evaluate(
                "(//div[.//div[text()='Filter'] and @class='ms-List-cell']//pre)[2]",
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

            if (panel && pre && !popup) {
                createPopup(panel);
                clickAutomatedTriggerNodes();
            } else if ((!panel || !pre) && popup) {
                popup.remove();
                popup = null;
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    };

    observeReleasePanel();
})();
