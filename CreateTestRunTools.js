// ==UserScript==
// @name          Azure DevOps Release Category Filter Popup - Enhanced
// @description   Prepare a filter for the test run; Deselects all active stages in the release
// @namespace     http://tampermonkey.net/
// @version       7.1
// @match         https://dev.azure.com/*
// @grant         none
// @downloadURL   https://raw.githubusercontent.com/KoroVaik/Tempermonkey/refs/heads/main/CreateTestRunTools.js
// @updateURL     https://raw.githubusercontent.com/KoroVaik/Tempermonkey/refs/heads/main/CreateTestRunTools.js
// ==/UserScript==

(function () {
    'use strict';

    const CATEGORIES_STORAGE_KEY = 'userCategories';
    const INITIAL_CATEGORIES = ['TrackAccreditation', 'ProductionOnly', 'Smoke', 'PostLayoffReport', 'Registration', 'Production', 'DbApi', 'PublicApi', 'VetsList'];

    let popup = null;
    let addCategoryPopup = null;
    let addCategoryButton = null;
    let observer = null;
    const MIN_BOTTOM_MARGIN = 400;
    const POPUP_MAX_HEIGHT = 500;

    const INCLUDED_COLOR_CLASS = 'category-included';
    const EXCLUDED_COLOR_CLASS = 'category-excluded';

    const BUTTON_MARGIN = '50px';

    const loadCategories = () => {
        try {
            const storedCats = localStorage.getItem(CATEGORIES_STORAGE_KEY);
            if (storedCats) {
                return JSON.parse(storedCats).sort();
            } else {
                saveCategories(INITIAL_CATEGORIES);
                return INITIAL_CATEGORIES.sort();
            }
        } catch (e) {
            console.error("Error loading categories from localStorage, defaulting to initial list:", e);
            return INITIAL_CATEGORIES.sort();
        }
    };

    const saveCategories = (categories) => {
        try {
            localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
        } catch (e) {
            console.error("Error saving categories to localStorage:", e);
        }
    };

    const restoreCategories = () => {
        localStorage.removeItem(CATEGORIES_STORAGE_KEY);
    };

    const getAllCategories = (existingFilter = '') => {
        const storedCategories = loadCategories();

        const parsedCats = existingFilter.match(/Category!?=([A-Za-z0-9]+)/g)?.map(x => x.replace('Category!=','').replace('Category=','')) || [];

        const allCats = [...storedCategories, ...parsedCats];
        return Array.from(new Set(allCats)).sort();
    };

    const deleteCategory = (categoryName) => {
        let currentCategories = loadCategories();
        currentCategories = currentCategories.filter(cat => cat !== categoryName);
        saveCategories(currentCategories);
    };

    const addCategory = (categoryName) => {
        if (!categoryName || categoryName.trim() === '') return false;
        const normalizedCat = categoryName.trim();
        let currentCategories = loadCategories();

        if (currentCategories.includes(normalizedCat)) {
            alert(`Category '${normalizedCat}' already exists.`);
            return false;
        }

        currentCategories.push(normalizedCat);
        saveCategories(currentCategories);
        return true;
    };

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
            .delete-category-btn {
                background-color: transparent;
                color: #fff;
                border: none;
                cursor: pointer;
                font-size: 14px;
                line-height: 1;
                padding: 0;
                margin-left: 5px;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 3px;
                transition: background-color 0.2s;
            }
            .delete-category-btn:hover {
                background-color: #f00;
            }
        `;
        document.head.appendChild(style);
    };

    injectStyles();

    const destroyAddCategoryPopup = () => {
        if (addCategoryPopup) {
            if (addCategoryPopup.destroyOutsideClickListener) {
                document.removeEventListener('click', addCategoryPopup.destroyOutsideClickListener);
            }
            addCategoryPopup.remove();
            addCategoryPopup = null;
        }
        if (addCategoryButton) {
            addCategoryButton.style.display = 'block';
        }
    };

    const createAddCategoryPopup = (parent) => {
        if (addCategoryPopup) return;

        addCategoryPopup = document.createElement('div');
        addCategoryPopup.style.position = 'absolute';
        addCategoryPopup.style.width = '340px';
        addCategoryPopup.style.background = '#0B3D91';
        addCategoryPopup.style.color = '#fff';
        addCategoryPopup.style.border = '1px solid #ccc';
        addCategoryPopup.style.borderRadius = '8px';
        addCategoryPopup.style.padding = '10px';
        addCategoryPopup.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        addCategoryPopup.style.zIndex = 9999;
        addCategoryPopup.style.userSelect = 'none';

        const mainPopupRect = popup ? popup.getBoundingClientRect() : null;
        const parentRect = parent.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        if (mainPopupRect) {
            addCategoryPopup.style.top = mainPopupRect.top + scrollTop - parentRect.top + 'px';
            addCategoryPopup.style.left = mainPopupRect.left + scrollLeft - parentRect.left + 'px';
        } else {
            addCategoryPopup.style.top = '100px';
            addCategoryPopup.style.left = '100px';
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'New Category Name (e.g., MyCustomTag)';
        input.style.width = '100%';
        input.style.padding = '5px';
        input.style.marginBottom = '10px';
        input.style.boxSizing = 'border-box';

        const addButton = document.createElement('button');
        addButton.textContent = 'Add';
        addButton.style.backgroundColor = '#006400';
        addButton.style.color = '#fff';
        addButton.style.padding = '5px 15px';
        addButton.style.marginRight = '5px';

        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.backgroundColor = '#8B0000';
        closeButton.style.color = '#fff';
        closeButton.style.padding = '5px 15px';

        const controlsContainer = document.createElement('div');
        controlsContainer.style.textAlign = 'right';
        controlsContainer.appendChild(closeButton);
        controlsContainer.appendChild(addButton);

        addCategoryPopup.appendChild(input);
        addCategoryPopup.appendChild(controlsContainer);

        parent.appendChild(addCategoryPopup);
        input.focus();

        addButton.addEventListener('click', () => {
            if (addCategory(input.value)) {
                destroyAddCategoryPopup();
                if (popup) renderCategoryList(popup);
            }
        });

        closeButton.addEventListener('click', destroyAddCategoryPopup);

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addButton.click();
            }
        });

        const closeOnOutsideClick = (e) => {
            if (addCategoryPopup && !addCategoryPopup.contains(e.target) && e.target !== addCategoryButton) {
                destroyAddCategoryPopup();
            }
        };
        document.addEventListener('click', closeOnOutsideClick);
        addCategoryPopup.destroyOutsideClickListener = closeOnOutsideClick;
    };

    const updateCategoryRowStyle = (row, inclRadio, exclRadio) => {
        row.classList.remove(INCLUDED_COLOR_CLASS, EXCLUDED_COLOR_CLASS);
        if (inclRadio.checked) {
            row.classList.add(INCLUDED_COLOR_CLASS);
        } else if (exclRadio.checked) {
            row.classList.add(EXCLUDED_COLOR_CLASS);
        }
    };

    const updateDraft = (filterInput, list) => {
        const checked = Array.from(list.querySelectorAll('input[type=radio]:checked'));
        
        const inc = checked.filter(r => r.value === 'incl').map(r => `Category=${r.name.replace('cat-', '')}`);
        const exc = checked.filter(r => r.value === 'excl').map(r => `Category!=${r.name.replace('cat-', '')}`);
    
        const wrap = (arr, operator, isGrouped) => arr.length > 1 ? (isGrouped ? `(${arr.join(operator)})` : arr.join(operator)) : arr[0];
    
        const parts = [];
        if (inc.length) parts.push(wrap(inc, '|', exc.length));
        if (exc.length) parts.push(wrap(exc, '&', inc.length));
    
        filterInput.value = parts.join('&');
        filterInput.style.height = 'auto';
        filterInput.style.height = filterInput.scrollHeight + 'px';
    };
    
    const renderCategoryList = (mainPopup) => {
        const list = mainPopup.querySelector('#category-list');
        const filterInput = mainPopup.querySelector('textarea');
        const preInit = document.evaluate(
            "(//div[.//div[text()='Filter'] and @class='ms-List-cell']//pre)[2]",
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (!list || !filterInput || !preInit) return;

        const existingFilter = preInit.textContent.trim();
        const foundCats = getAllCategories(existingFilter);

        list.innerHTML = '';

        foundCats.forEach(cat => {
            const catId = `cat-${cat}`;

            const row = document.createElement('div');
            row.dataset.categoryName = cat;
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '40px 1fr 50px 20px 20px';
            row.style.alignItems = 'center';
            row.style.marginBottom = '4px';
            row.style.padding = '2px 4px';
            row.style.borderRadius = '4px';
            row.style.transition = 'background-color 0.2s';
            row.style.columnGap = '5px';

            const excl = document.createElement('input');
            excl.type = 'radio';
            excl.name = catId;
            excl.value = 'excl';
            if (existingFilter.split('&').includes(`Category!=${cat}`)) excl.checked = true;

            const name = document.createElement('span');
            name.textContent = cat;
            name.style.display = 'block';
            name.style.textAlign = 'center';

            const incl = document.createElement('input');
            incl.type = 'radio';
            incl.name = catId;
            incl.value = 'incl';
            if (existingFilter.split('&').includes(`Category=${cat}`)) incl.checked = true;

            const clrBtn = document.createElement('button');
            clrBtn.textContent = 'Clr';
            clrBtn.style.fontSize = '10px';
            clrBtn.style.padding = '2px';
            clrBtn.style.backgroundColor = '#555';
            clrBtn.style.color = '#fff';
            clrBtn.addEventListener('click', () => {
                incl.checked = false;
                excl.checked = false;
                updateDraft(filterInput, list);
                updateCategoryRowStyle(row, incl, excl);
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-category-btn';
            delBtn.innerHTML = '&#x2715;';
            delBtn.title = `Delete category: ${cat}`;
            delBtn.dataset.categoryName = cat;
            delBtn.addEventListener('click', () => {
                if (confirm(`Are you sure you want to delete the category '${cat}'? This change is permanent for your saved list.`)) {
                    deleteCategory(cat);
                    renderCategoryList(mainPopup);
                    incl.checked = false;
                    excl.checked = false;
                    updateDraft(filterInput, list);
                }
            });

            row.appendChild(excl);
            row.appendChild(name);
            row.appendChild(incl);
            row.appendChild(clrBtn);
            row.appendChild(delBtn);

            list.appendChild(row);

            const radioChangeHandler = () => {
                updateDraft(filterInput, list);
                updateCategoryRowStyle(row, incl, excl);
            };
            incl.addEventListener('change', radioChangeHandler);
            excl.addEventListener('change', radioChangeHandler);

            updateCategoryRowStyle(row, incl, excl);
        });

        updateDraft(filterInput, list);
    };

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

        addCategoryButton = document.createElement('button');
        addCategoryButton.textContent = 'Add Category';
        addCategoryButton.style.position = 'absolute';
        addCategoryButton.style.background = '#4CAF50';
        addCategoryButton.style.color = '#fff';
        addCategoryButton.style.border = '1px solid #ccc';
        addCategoryButton.style.borderRadius = '8px';
        addCategoryButton.style.padding = '8px 12px';
        addCategoryButton.style.zIndex = 9999;
        addCategoryButton.style.cursor = 'pointer';
        addCategoryButton.style.userSelect = 'none';

        popup = document.createElement('div');
        popup.style.position = 'absolute';
        popup.style.width = '340px';
        popup.style.background = '#0B3D91';
        popup.style.color = '#fff';
        popup.style.border = '1px solid #ccc';
        popup.style.borderRadius = '8px';
        popup.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        popup.style.zIndex = 9999;
        popup.style.userSelect = 'none';
        popup.style.maxHeight = `${POPUP_MAX_HEIGHT}px`;
        popup.style.display = 'flex';
        popup.style.flexDirection = 'column';
        popup.addEventListener('mousedown', e => e.stopPropagation());
        popup.addEventListener('click', e => e.stopPropagation());

        const contentWrapper = document.createElement('div');
        contentWrapper.style.overflowY = 'auto';
        contentWrapper.style.padding = '10px 10px 0 10px';
        contentWrapper.style.flexGrow = 1;

        const preRect = preInit.getBoundingClientRect();
        const releaseRect = releasePanel.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        let topPos = preRect.top + scrollTop - parentRect.top;
        const leftPos = (releaseRect.left + scrollLeft - 360 - parentRect.left);

        const maxTop = window.scrollY + window.innerHeight - POPUP_MAX_HEIGHT - MIN_BOTTOM_MARGIN;
        if (topPos > maxTop) topPos = maxTop;

        popup.style.top = topPos + 'px';
        popup.style.left = leftPos + 'px';

        addCategoryButton.style.top = (topPos - 40) + 'px';
        addCategoryButton.style.left = leftPos + 'px';

        parent.appendChild(addCategoryButton);
        parent.appendChild(popup);

        addCategoryButton.addEventListener('click', () => {
            addCategoryButton.style.display = 'none';
            destroyAddCategoryPopup();
            createAddCategoryPopup(parent);
        });

        const header = document.createElement('div');
        header.style.display = 'grid';
        header.style.gridTemplateColumns = '40px 1fr 50px 40px';
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
        contentWrapper.appendChild(header);

        const list = document.createElement('div');
        list.id = 'category-list';
        contentWrapper.appendChild(list);

        const filterInput = document.createElement('textarea');
        filterInput.style.width = '100%';
        filterInput.style.height = 'auto';
        filterInput.style.minHeight = '40px';
        filterInput.style.resize = 'none';
        filterInput.style.overflow = 'hidden';
        filterInput.style.whiteSpace = 'pre-wrap';
        filterInput.style.marginBottom = '10px';
        contentWrapper.appendChild(filterInput);

        const existingFilter = preInit.textContent.trim();
        filterInput.value = existingFilter;

        popup.appendChild(contentWrapper);

        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'category-controls';
        controlsContainer.style.textAlign = 'right';
        controlsContainer.style.padding = '8px 10px';
        controlsContainer.style.borderTop = '1px solid #ccc';
        controlsContainer.style.background = '#0B3D91';
        controlsContainer.style.borderRadius = '0 0 8px 8px';
        controlsContainer.style.flexShrink = 0;

        const restoreBtn = document.createElement('button');
        restoreBtn.textContent = 'Restore';
        restoreBtn.style.backgroundColor = '#6c757d';
        restoreBtn.style.color = '#fff';
        restoreBtn.style.marginRight = BUTTON_MARGIN;

        restoreBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to restore the default category list? This will permanently delete all custom categories and reset the list to the initial values.")) {
                restoreCategories();
                renderCategoryList(popup);
                filterInput.value = '';
                updateDraft(filterInput, list);
            }
        });

        const clearAllBtn = document.createElement('button');
        clearAllBtn.textContent = 'Clear All';
        clearAllBtn.style.backgroundColor = '#8B0000';
        clearAllBtn.style.color = '#fff';
        clearAllBtn.style.marginRight = BUTTON_MARGIN;

        clearAllBtn.addEventListener('click', () => {
            list.querySelectorAll('input[type=radio]').forEach(r => (r.checked = false));
            updateDraft(filterInput, list);
            list.querySelectorAll('div[data-category-name]').forEach(row => {
                const incl = row.querySelector('input[value="incl"]');
                const excl = row.querySelector('input[value="excl"]');
                updateCategoryRowStyle(row, incl, excl);
            });
        });

        const setBtn = document.createElement('button');
        setBtn.textContent = 'Set Filter';
        setBtn.style.backgroundColor = '#006400';
        setBtn.style.color = '#fff';

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

        controlsContainer.appendChild(restoreBtn);
        controlsContainer.appendChild(clearAllBtn);
        controlsContainer.appendChild(setBtn);
        popup.appendChild(controlsContainer);

        renderCategoryList(popup);
    };

    const destroyPopup = () => {
        if (popup) {
            popup.remove();
            popup = null;
        }
        if (addCategoryButton) {
            addCategoryButton.remove();
            addCategoryButton = null;
        }
        destroyAddCategoryPopup();
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
            } else if ((!panel || !pre) && (popup || addCategoryPopup || addCategoryButton)) {
                destroyPopup();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    };

    observeReleasePanel();
})();
