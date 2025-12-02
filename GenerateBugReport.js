// ==UserScript==
// @name         Allure Bug Report Generator (recursive)
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Generate bug report from skipped tests in Allure iframe (supports nested structure)
// @match        https://allure.dev1.hisausapps.org:5050/allure-docker-service/projects/*/reports/latest/index.html*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      allure.dev1.hisausapps.org
// @downloadURL  https://raw.githubusercontent.com/KoroVaik/Tempermonkey/refs/heads/main/GenerateBugReport.js
// @updateURL    https://raw.githubusercontent.com/KoroVaik/Tempermonkey/refs/heads/main/GenerateBugReport.js
// ==/UserScript==

(function () {
  'use strict';

  function waitUntilReady(callback) {
    if (document.readyState === 'complete') callback();
    else window.addEventListener('load', callback);
  }

  waitUntilReady(() => {
    const projectMatch = window.location.href.match(/projects\/([^/]+)\/reports/);
    if (!projectMatch) return console.error('Project name not found in URL.');

    const projectName = projectMatch[1];
    const baseUrl = `https://allure.dev1.hisausapps.org:5050/allure-docker-service/projects/${projectName}/reports/latest`;

    const button = document.createElement('button');
    button.textContent = 'Generate bug report';
    Object.assign(button.style, {
      position: 'fixed',
      bottom: '10px',
      left: '10px',
      zIndex: 9999,
      backgroundColor: 'rgba(211, 47, 47, 0.4)',
      color: '#fff',
      border: 'none',
      padding: '8px',
      borderRadius: '5px',
      fontSize: '14px',
      cursor: 'pointer'
    });
    document.body.appendChild(button);

    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Generating report...';
      const spinner = document.createElement('span');
      spinner.textContent = ' ⏳';
      spinner.style.marginLeft = '6px';
      button.appendChild(spinner);

      const packagesUrl = `${baseUrl}/data/packages.json`;

      GM_xmlhttpRequest({
        method: 'GET',
        url: packagesUrl,
        onload: async function (res) {
          let parsed;
          try {
            parsed = JSON.parse(res.responseText);
          } catch (err) {
            console.error('Failed to parse packages.json:', err);
            button.disabled = false;
            button.textContent = 'Generate bug report';
            return;
          }

          const tests = [];
          function collectTests(nodes) {
            for (const node of nodes) {
              if (node.children) collectTests(node.children);
              else if (node.uid && node.status) tests.push(node);
            }
          }

          if (!Array.isArray(parsed.children)) {
            console.error('Invalid format. Expected parsed.children to be an array.', parsed);
            button.disabled = false;
            button.textContent = 'Generate bug report';
            return;
          }

          collectTests(parsed.children);

          const skippedTests = tests.filter(t => t.status === 'skipped');
          console.log('Skipped tests:', skippedTests);

          const report = {};

          for (const test of skippedTests) {
            const testUrl = `${baseUrl}/data/test-cases/${test.uid}.json`;

            await new Promise((resolve) => {
              GM_xmlhttpRequest({
                method: 'GET',
                url: testUrl,
                onload: function (resp) {
                  try {
                    const testData = JSON.parse(resp.responseText);
                    const issue = testData.links?.find(link => link.type === 'issue');

                    if (issue) {
                      if (!report[issue.name]) {
                        report[issue.name] = {
                          "Bug name": issue.name,
                          "Bug url": issue.url,
                          "Tests affected": 0
                        };
                      }
                      report[issue.name]["Tests affected"]++;
                    }
                  } catch (err) {
                    console.error(`Failed to parse test case ${test.uid}`, err);
                  }
                  resolve();
                },
                onerror: () => {
                  console.error(`Request failed for test ${test.uid}`);
                  resolve();
                }
              });
            });
          }

          const finalReport = Object.values(report);
          console.log('Bug report:', finalReport);

          if (finalReport.length === 0) {
            console.log('No skipped tests with issues found.');
          } else {
            const textToCopy = JSON.stringify(finalReport, null, 2);
            try {
              GM_setClipboard(textToCopy);
              const label = document.createElement('div');
                label.textContent = 'Copied to clipboard';
                Object.assign(label.style, {
                    position: 'fixed',
                    bottom: '45px',
                    left: '10px',
                    zIndex: 9999,
                    backgroundColor: 'rgba(150, 200, 4, 0.9)',
                    color: '#fff',
                    padding: '6px 10px',
                    borderRadius: '5px',
                    fontSize: '13px',
                    boxShadow: '0 0 6px rgba(0,0,0,0.2)'
                });
                document.body.appendChild(label);
                setTimeout(() => label.remove(), 3000);
            } catch (err) {
              console.error('Clipboard copy failed:', err);
            }
          }

          button.disabled = false;
          button.textContent = 'Generate bug report';
        }
      });
    });
  });
})();
