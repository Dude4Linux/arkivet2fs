document.getElementById('fillFormButton').addEventListener('click', () => {
  console.log('Fill Form button clicked');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const digitalArkivetTabId = tabs[0].id;

    // Ensure the tab is not a chrome:// URL
    if (tabs[0].url.startsWith('chrome://')) {
      console.error('Cannot execute script on a chrome:// URL');
      return;
    }

    // Gather data from the DigitalArkivet tab
    chrome.scripting.executeScript({
      target: { tabId: digitalArkivetTabId },
      function: gatherData
    }, (results) => {
      if (!results || results.length === 0) {
        console.error('No data gathered from DigitalArkivet');
        return;
      }
      const data = results[0].result;
      console.log('Data gathered from DigitalArkivet:', data);

      // Open a new FamilySearch tab without stealing focus
      chrome.tabs.create({
        url: 'https://www.familysearch.org/en/tree/sources/sourceBox',
        active: false
      }, (newTab) => {
        console.log('FamilySearch tab opened:', newTab);

        // Wait for the new tab to load completely
        chrome.tabs.onUpdated.addListener(function tabUpdateListener(tabId, changeInfo) {
          if (tabId === newTab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(tabUpdateListener);

            // Inject content.js into the new tab
            chrome.scripting.executeScript({
              target: { tabId: newTab.id },
              files: ['content.js']
            }, () => {
              console.log('content.js injected');

              // Ensure content script is ready to receive the message
              setTimeout(() => {
                // Send the data to the content script
                chrome.tabs.sendMessage(newTab.id, { action: 'fillForm', data }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.error('Error sending message to content script:', chrome.runtime.lastError);
                  } else {
                    console.log('Message sent to content script');
                    // Activate the new tab
                    chrome.tabs.update(newTab.id, { active: true, highlighted: true });
                  }
                });
              }, 500); // Wait for 1 second to ensure content script is ready
            });
          }
        });
      });
    });
  });
});

// Function to gather data from the current page
function gatherData() {
  // Function to format date from 'YYYY-MM-DD' to 'DD MMMM YYYY'
  function formatDate(dateStr) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const [year, month, day] = dateStr.split('-');
    return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
  }

  // Extract the type of record and record date
  const recordType = document.querySelector("body > article > div:nth-child(1) > div > div.parent-post > h4").innerText;
  const recordDate = document.querySelector("body > article > div:nth-child(1) > div > div.parent-post > h4 > a").innerText;
  const date = formatDate(recordDate);

  // Extract the title from the page title
  const title = document.title;

  return {
    date: date,
    title: title,
    url: window.location.href,
    citation: 'Sample Citation', // Replace with logic to extract citation from DigitalArkivet page
    notes: `${recordType}: ${recordDate}` // Move `${recordType}: ${recordDate}` to notes
  };
}
